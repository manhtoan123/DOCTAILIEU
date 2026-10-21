import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db,deleteBook} from '../src/core/db';
import {type Chapter,type DictionaryFile} from '../src/core/domain';
import {sharedRecordId,validateSharedRecord,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {SHARED_STATE_KEY,readSharedReplica,resolveSharedState,sharedSyncStatus,startSharedStateSync,syncSharedState,type SharedStateRow} from '../src/features/sync-cloud/services/shared-state-sync';
import {applyLocalSharedRecord,captureSharedRecords,prepareSharedChapter,readLocalSharedRecord,sharedJson,LocalSharedConflict,SHARED_CHAPTER_PREFIX,SHARED_DICTIONARY_PREFIX} from '../src/features/sync-cloud/services/shared-state-local';
import {saveSharedChapter} from '../src/features/sync-cloud/services/shared-chapters';
import {loadSharedDictionaries,markSharedDictionary,publishSharedDictionary,removeSharedDictionary} from '../src/features/sync-cloud/services/shared-dictionaries';
import {applyPendingCommonNames} from '../src/features/sync-cloud/services/shared-common-names';
import {editCommonName,readCommonNames} from '../src/features/names-convert/services/common-names';
import {hashBlob} from '../src/features/import-export/services/backup';
import {ttsHash,writeTtsCursor,readTtsCursor,clearTtsCursor,type TtsCursor} from '../src/features/tts/services/tts-cursor';
import {queueAiSettings} from '../src/features/ai/services/ai-reading';
import {installDefaultDictionaries} from '../src/features/sync-cloud/services/cloud-dictionaries';
import {saveConvertNames,deleteConvertName,readConvertNames,CONVERT_NAMES_KEY} from '../src/features/names-convert/services/convert-names';
import {restoreCloudSnapshot,contentHash} from '../src/features/sync-cloud/services/cloud-snapshot';
import {nameTombKey} from '../src/features/sync-cloud/services/shared-name-intents';

const origin='https://client-review.example';
const bookId='review-book';
const name=(key='甲',value:string|null='Tên',id=bookId):SharedRecord=>({kind:'name',bookId:id,key,value});
const source:Chapter={id:'root',bookId,order:0,title:'Chapter',text:'原文😀\nsource',revision:1,sourceId:'source-file'};
const cursor:TtsCursor={version:1,bookId,chapterId:source.id,revision:1,mode:'ai',sourceHash:'a'.repeat(64),semanticHash:'b'.repeat(64),renderedHash:'c'.repeat(64),voiceId:'tiktok-female-1',rate:1,offset:3,audioTime:2,updatedAt:1};
class Ledger {
 rows=new Map<string,SharedStateRow>();revision=0;puts:SharedRecord[]=[];
 afterPut?: (record:SharedRecord)=>Promise<void>;
 beforeGet?: (scope:string)=>Promise<void>;
 async seed(record:SharedRecord){record=validateSharedRecord(record);const id=await sharedRecordId(record);const row={id,revision:++this.revision,record};this.rows.set(id,row);return row;}
 connect(){vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  const url=new URL(input,origin);
  if(url.pathname!=='/api/state')throw Error('Unexpected file/network request '+input);
  if(init?.method==='PUT'){
   const body=JSON.parse(init.body as string),old=this.rows.get(body.id);this.puts.push(body.record);
   if(body.baseRevision!==(old?.revision??0))return Response.json({row:old},{status:409});
   const row=await this.seed(body.record);const hook=this.afterPut;this.afterPut=undefined;await hook?.(body.record);return Response.json({row});
  }
  const scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0),hook=this.beforeGet;this.beforeGet=undefined;await hook?.(scope);
  const rows=[...this.rows.values()].filter(r=>(r.record.bookId??'')===scope&&r.revision>after).sort((a,b)=>a.revision-b.revision);
  const selected=rows.slice(0,99);return Response.json({rows:selected,cursor:rows.length>99?selected.at(-1)!.revision:this.revision,more:rows.length>99});
 }));}
}
let ledger:Ledger,storage:Map<string,string>;
beforeEach(async()=>{
 vi.stubGlobal('location',{origin});storage=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
 await db.delete();await db.open();ledger=new Ledger();
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function ready(id=bookId){await db.books.put({id,title:'Synthetic',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:source.text.length});if(id===bookId){await db.chapters.put(source);await db.settings.put({key:`cloud-uploaded:${origin}:${id}`,value:{sha256:'a'.repeat(64)}});}}
async function localName(value='Tên',key='甲'){await db.names.put({id:'name-'+key,bookId,key,value});}
async function dictionary(text='甲=Tên\n乙=Other',kind:DictionaryFile['kind']='names'){const blob=new Blob([text]);const row:DictionaryFile={kind,name:kind+'.txt',blob,sha256:await hashBlob(blob),updatedAt:1};await db.dictionaries.put(row);return row;}
async function chapterRecord(){return (await db.settings.get(SHARED_CHAPTER_PREFIX+bookId+':root'))!.value as SharedRecord;}
async function apply(record:SharedRecord){const before=await readLocalSharedRecord(record),prepared=await prepareSharedChapter(record);return db.transaction('rw',[db.settings,db.books,db.names,db.progress,db.chapters,db.dictionaries],()=>applyLocalSharedRecord(record,sharedJson(before),prepared));}

describe('independent real Dexie metadata replication',()=>{
 it('receives Names by page while retaining IDs, image values, baseline and local conflicts',async()=>{
  await ready();await localName('Initial','基');await localName('Offline edit','冲突');
  await db.settings.put({key:'shared-download-baseline:'+bookId,value:{book:{},names:{基:'Initial'}}});
  const initial=await ledger.seed(name('基','[i]https://archives.bulbagarden.net/media/upload/a/a1/Test.png[/]Tên ảnh'));
  const conflict=await ledger.seed(name('冲突','Remote edit'));
  for(let i=0;i<110;i++)await ledger.seed(name('新'+i,'Tên '+i));
  ledger.connect();const put=vi.spyOn(db.settings,'put');await syncSharedState();
  expect((await db.names.get('name-基'))?.value).toBe(initial.record.value);
  expect((await db.names.get('name-冲突'))?.value).toBe('Offline edit');
  expect(await db.names.where('bookId').equals(bookId).count()).toBe(112);
  expect((await readSharedReplica()).conflicts[conflict.id]).toEqual(conflict);
  expect(ledger.puts.filter(r=>r.kind==='name')).toEqual([]);
  expect(put.mock.calls.filter(([row])=>row.key===SHARED_STATE_KEY).length).toBeLessThan(10);
 });
 it('rolls back an entire Name group and does not advance its cursor after a late replica write failure',async()=>{
  await ready();ledger.connect();await syncSharedState();
  const before=await readSharedReplica();await ledger.seed(name('甲','A'));await ledger.seed(name('乙','B'));ledger.connect();
  const put=db.settings.put.bind(db.settings);
  vi.spyOn(db.settings,'put').mockImplementation((...args:Parameters<typeof put>)=>{
   if(args[0].key===SHARED_STATE_KEY&&Object.keys((args[0].value as any).base).length>Object.keys(before.base).length)throw Error('synthetic Name commit failure');
   return put(...args);
  });
  await syncSharedState();expect(await db.names.count()).toBe(0);expect((await readSharedReplica()).cursors[bookId]).toBe(before.cursors[bookId]);expect((await readSharedReplica()).base).toEqual(before.base);
  expect(sharedSyncStatus().message).toContain('synthetic Name commit failure');
  vi.restoreAllMocks();await syncSharedState();expect(await db.names.count()).toBe(2);
 });
 it('processes repeated Name IDs in order rather than treating an earlier in-page update as a local conflict',async()=>{
  await ready();const first=await ledger.seed(name('甲','A')),last=await ledger.seed(name('甲','B'));
  ledger.connect();const fetchLedger=fetch;
  vi.stubGlobal('fetch',async(input:string,init?:RequestInit)=>{
   const url=new URL(input,origin);
   if(!init?.method&&url.searchParams.get('book')===bookId&&Number(url.searchParams.get('after')??0)===0)return Response.json({rows:[first,last],cursor:last.revision,more:false});
   return fetchLedger(input,init);
  });
  await syncSharedState();expect((await db.names.where('[bookId+key]').equals([bookId,'甲']).first())?.value).toBe('B');expect((await readSharedReplica()).conflicts[first.id]).toBeUndefined();expect((await readSharedReplica()).base[first.id].revision).toBe(last.revision);
 });
 it('keeps local edits made after a batch snapshot and honors remote tombstones',async()=>{
  await ready();await localName('Base','甲');await localName('Delete me','乙');ledger.connect();await syncSharedState();
  await ledger.seed(name('甲','Remote'));await ledger.seed(name('乙',null));
  const get=db.settings.get.bind(db.settings);let edited=false;
  vi.spyOn(db.settings,'get').mockImplementation((...args:Parameters<typeof get>)=>{
   if((args[0] as unknown)===SHARED_STATE_KEY&&!edited&&Dexie.currentTransaction?.mode==='readwrite'&&Dexie.currentTransaction.storeNames.includes('names')){
    edited=true;return db.names.put({id:'name-甲',bookId,key:'甲',value:'Edited after snapshot'}).then(()=>get(...args));
   }
   return get(...args);
  });
  await syncSharedState();expect(edited).toBe(true);expect((await db.names.get('name-甲'))?.value).toBe('Edited after snapshot');expect(await db.names.get('name-乙')).toBeUndefined();expect((await db.settings.get(nameTombKey(bookId,'乙')))?.value).toEqual(name('乙',null));expect(Object.keys((await readSharedReplica()).conflicts)).toHaveLength(1);
 });
 it('uploads an added Name, edits via CAS and publishes an explicit deletion',async()=>{
  await ready();ledger.connect();await localName();await syncSharedState();
  expect([...ledger.rows.values()].find(r=>r.record.kind==='name')?.record.value).toBe('Tên');
  await localName('Edit');await syncSharedState();expect([...ledger.rows.values()].find(r=>r.record.kind==='name')?.record.value).toBe('Edit');
  await db.names.delete('name-甲');await syncSharedState();expect([...ledger.rows.values()].find(r=>r.record.kind==='name')?.record.value).toBeNull();expect(sharedSyncStatus().state).toBe('synced');
 });
 it('preserves edits made during a successful PUT and sends current value next pass',async()=>{
  await ready();await localName('First');ledger.connect();ledger.afterPut=async record=>{if(record.kind==='book')ledger.afterPut=async r=>{if(r.kind==='name')await localName('During flight');};else if(record.kind==='name')await localName('During flight');};
  await syncSharedState();expect((await db.names.get('name-甲'))?.value).toBe('During flight');expect(sharedSyncStatus().state).toBe('local');
  await syncSharedState();expect([...ledger.rows.values()].find(r=>r.record.kind==='name')?.record.value).toBe('During flight');expect(sharedSyncStatus().state).toBe('synced');
 });
 it('retains local data offline and malformed responses do not advance replica',async()=>{
  await ready();await localName('Offline');const before=await db.names.toArray();vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('offline')));await syncSharedState();expect(await db.names.toArray()).toEqual(before);expect(await db.settings.get(SHARED_STATE_KEY)).toBeUndefined();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({cursor:100,more:false,rows:[{id:'a'.repeat(64),revision:1,record:name()}]})));await syncSharedState();expect(await db.names.toArray()).toEqual(before);expect(await db.settings.get(SHARED_STATE_KEY)).toBeUndefined();
 });
 it('bootstrap keeps competing local/shared Names until explicit shared selection',async()=>{
  await ready();await localName('Local');const row=await ledger.seed(name('甲','Shared'));ledger.connect();await syncSharedState();
  expect((await db.names.get('name-甲'))?.value).toBe('Local');expect((await readSharedReplica()).conflicts[row.id]).toEqual(row);expect(ledger.puts.filter(r=>r.kind==='name')).toEqual([]);
  await resolveSharedState(row.id,'shared');expect((await db.names.where('[bookId+key]').equals([bookId,'甲']).first())?.value).toBe('Shared');expect((await readSharedReplica()).conflicts[row.id]).toBeUndefined();
 });
 it('local choice uses observed tombstone CAS instead of silently restoring zero-base data',async()=>{
  await ready();await localName('Local');const row=await ledger.seed(name('甲',null));ledger.connect();await syncSharedState();expect((await db.names.get('name-甲'))?.value).toBe('Local');
  await resolveSharedState(row.id,'local');expect(ledger.rows.get(row.id)?.record.value).toBe('Local');expect(ledger.rows.get(row.id)!.revision).toBeGreaterThan(row.revision);
 });
 it('local-only book removal never publishes tombstones for its cloud Names',async()=>{
  await ready();await localName();ledger.connect();await syncSharedState();const row=[...ledger.rows.values()].find(r=>r.record.kind==='name')!;
  await deleteBook(bookId);ledger.puts=[];await syncSharedState();expect(ledger.rows.get(row.id)?.record.value).toBe('Tên');expect(ledger.puts.some(r=>r.bookId===bookId)).toBe(false);
 });
 it('foreign-book progress and removed-book Names reject without any partial local write',async()=>{
  await ready();await ready('foreign');await db.chapters.put({...source,id:'foreign-chapter',bookId:'foreign'});
  const progress=validateSharedRecord({kind:'progress',bookId,key:'',value:{bookId,chapterId:'foreign-chapter',paragraph:0,offset:0,revision:1,updatedAt:1}});
  await expect(apply(progress)).rejects.toBeInstanceOf(LocalSharedConflict);expect(await db.progress.get(bookId)).toBeUndefined();
  await db.books.delete(bookId);await expect(apply(name())).rejects.toBeInstanceOf(LocalSharedConflict);expect(await db.names.count()).toBe(0);
 });
 it('deletions before first sync keep both Name and Convert deletion intents against shared values',async()=>{
  await ready();await localName();await db.transaction('rw',[db.names,db.settings],async()=>{await db.names.delete('name-甲');await db.settings.put({key:nameTombKey(bookId,'甲'),value:name('甲',null)});});await saveConvertNames('乙=Local');await deleteConvertName('乙');
  const bookRow=await ledger.seed(name('甲','Shared')),convertRow=await ledger.seed({kind:'convert-name',key:'乙',value:'Shared'});ledger.connect();await syncSharedState();expect(await db.names.count()).toBe(0);expect((await readLocalSharedRecord({kind:'convert-name',key:'乙'}))?.value).toBeNull();expect((await readSharedReplica()).conflicts[bookRow.id]).toBeDefined();expect((await readSharedReplica()).conflicts[convertRow.id]).toBeDefined();
  await resolveSharedState(bookRow.id,'local');await resolveSharedState(convertRow.id,'local');expect(ledger.rows.get(bookRow.id)?.record.value).toBeNull();expect(ledger.rows.get(convertRow.id)?.record.value).toBeNull();
 });
 it('shared Convert values respect the existing local per-entry limit and trimmed invariants',()=>{for(const record of [{kind:'convert-name',key:'甲',value:'x'.repeat(2049)},{kind:'convert-name',key:' 甲 ',value:'Name'},{kind:'convert-name',key:'甲',value:' Name '}])expect(()=>validateSharedRecord(record)).toThrow();});
 it('an aggregate Convert overflow becomes conflict and preserves the readable local list',async()=>{
  const names=Array.from({length:4096},(_,i)=>({key:'k'+i,value:'v'}));await db.settings.put({key:CONVERT_NAMES_KEY,value:names});await expect(apply({kind:'convert-name',key:'extra',value:'new'})).rejects.toBeInstanceOf(LocalSharedConflict);expect(await readConvertNames()).toEqual(names);
 });
 it('fresh downloaded snapshot baseline accepts newer book/Names automatically but preserves edited local values',async()=>{
  const downloadedId='00000000-0000-4000-8000-000000000071',chapterId='00000000-0000-4000-8000-000000000072';vi.stubGlobal('navigator',{storage:{estimate:async()=>({quota:1e9,usage:0})}});
  const book={id:downloadedId,title:'Snapshot title',displayTitle:'Tên snapshot',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:2},bytes=new TextEncoder().encode(JSON.stringify({format:'thu-phong-cloud',version:1,book,chapters:[{...source,id:chapterId,bookId:downloadedId,text:'原文',sourceId:''}],names:[{key:'甲',value:'Snapshot'},{key:'乙',value:'Initial'}]}));
  expect(await restoreCloudSnapshot(bytes,downloadedId,await contentHash(bytes))).toBe('added');const old=await db.names.where('[bookId+key]').equals([downloadedId,'乙']).first();await db.names.update(old!.id,{value:'Local edit'});
  expect((await db.settings.get('shared-download-baseline:'+downloadedId))?.value).toMatchObject({book:{displayTitle:'Tên snapshot'}});
  const bookRow=await ledger.seed({kind:'book',bookId:downloadedId,key:'',value:{title:'New shared title',displayTitle:'Tên Việt mới',author:'Author'}});await ledger.seed(name('甲','Latest',downloadedId));const dirtyRow=await ledger.seed(name('乙','Remote competing',downloadedId));ledger.connect();await syncSharedState();
  expect((await db.books.get(downloadedId))?.displayTitle).toBe('Tên Việt mới');
  expect((await db.books.get(downloadedId))?.title).toBe('New shared title');expect((await db.names.where('[bookId+key]').equals([downloadedId,'甲']).first())?.value).toBe('Latest');expect((await db.names.get(old!.id))?.value).toBe('Local edit');expect((await readSharedReplica()).conflicts[bookRow.id]).toBeUndefined();expect((await readSharedReplica()).conflicts[dirtyRow.id]).toBeDefined();
 });
});

 it('captures and reads the persisted Vietnamese displayTitle for metadata sync',async()=>{
  const id='00000000-0000-4000-8000-000000000091';
  await db.books.put({id,title:'山门',displayTitle:'Sơn môn',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:0,charCount:0});
  const captured=(await captureSharedRecords()).find(r=>r.kind==='book'&&r.bookId===id);
  expect(captured?.value).toMatchObject({title:'山门',displayTitle:'Sơn môn'});
  expect((await readLocalSharedRecord({kind:'book',bookId:id,key:''}))?.value).toMatchObject({title:'山门',displayTitle:'Sơn môn'});
 });

describe('independent real Dexie chapter overlay preservation',()=>{
 it('cumulative descendant edits retain root ID, source bytes and original source references',async()=>{
  await ready();const sourceBlob=new Blob([source.text]);await db.sources.put({id:source.sourceId,bookId,name:'original.txt',relativePath:'original.txt',encoding:'utf-8',sha256:await hashBlob(sourceBlob),bytes:sourceBlob.size,blob:sourceBlob});
  await saveSharedChapter(source,'first second',6);const split=await db.chapters.where('bookId').equals(bookId).sortBy('order');expect(split).toHaveLength(2);
  await saveSharedChapter(split[1],'tail edited');const record=await chapterRecord(),patch=record.value as {sourceHash:string;sourceRevision:number;chapters:Chapter[]};
  expect(record.key).toBe(source.id);expect(patch.sourceHash).toBe(await ttsHash(source.text));expect(patch.sourceRevision).toBe(1);expect(patch.chapters.map(c=>c.id)).toContain(split[1].id);expect(patch.chapters.find(c=>c.id===split[1].id)?.text).toBe('tail edited');
  expect((await db.chapters.toArray()).every(c=>c.sourceId===source.sourceId)).toBe(true);expect(await (await db.sources.get(source.sourceId))!.blob.text()).toBe(source.text);
 });
 it('stale editor saves abort before touching existing chapter/marker/counters',async()=>{
  await ready();await db.chapters.update(source.id,{text:'Changed',revision:2});const before=await Promise.all([db.chapters.toArray(),db.settings.toArray(),db.books.toArray()]);
  await expect(saveSharedChapter(source,'stale')).rejects.toThrow();expect(await Promise.all([db.chapters.toArray(),db.settings.toArray(),db.books.toArray()])).toEqual(before);
 });
 it('recursive splits keep one cumulative marker, deterministic order and lossless Unicode text',async()=>{
  await ready();await db.chapters.put({...source,id:'next',order:1,text:'next'});const text='頭😀尾\n第二段';await saveSharedChapter(source,text,4);const children=await db.chapters.where('bookId').equals(bookId).sortBy('order'),firstChild=children.find(c=>c.id!==source.id&&c.id!=='next')!;
  await saveSharedChapter(firstChild,firstChild.text,2);const patch=(await chapterRecord()).value as {chapters:Chapter[];sourceHash:string};expect(patch.chapters).toHaveLength(3);expect([...patch.chapters].sort((a,b)=>a.order-b.order).map(c=>c.text).join('')).toBe(text);expect((await db.settings.where('key').startsWith(SHARED_CHAPTER_PREFIX).toArray())).toHaveLength(1);expect(patch.sourceHash).toBe(await ttsHash(source.text));expect((await db.chapters.get('next'))?.text).toBe('next');
 });
 it('unknown legacy root requires explicit comparison before adding remote chapter IDs',async()=>{
  await ready();const record=validateSharedRecord({kind:'chapter',bookId,key:'legacy-root',value:{baseSha256:'a'.repeat(64),sourceHash:'b'.repeat(64),sourceRevision:1,legacy:true,chapters:[{...source,id:'legacy-root',text:'unknown legacy',revision:2}]}}),row=await ledger.seed(record);ledger.connect();await syncSharedState();expect(await db.chapters.get('legacy-root')).toBeUndefined();expect((await readSharedReplica()).conflicts[row.id]).toBeDefined();await resolveSharedState(row.id,'shared');expect((await db.chapters.get('legacy-root'))?.text).toBe('unknown legacy');
 });
 it('remote split assigns every descendant the original sourceId and retains unrelated chapters',async()=>{
  await ready();await db.chapters.put({...source,id:'unrelated',order:1,text:'unchanged'});
  const record=validateSharedRecord({kind:'chapter',bookId,key:source.id,value:{baseSha256:'a'.repeat(64),sourceHash:await ttsHash(source.text),sourceRevision:1,chapters:[{...source,text:'head',revision:2},{...source,id:'remote-child',order:0.5,text:'tail'}]}});
  await apply(record);expect((await db.chapters.get('root'))?.sourceId).toBe(source.sourceId);expect((await db.chapters.get('remote-child'))?.sourceId).toBe(source.sourceId);expect((await db.chapters.get('unrelated'))?.text).toBe('unchanged');
 });
 it('a chapter mutation after preparation rejects the whole patch transaction',async()=>{
  await ready();const record=validateSharedRecord({kind:'chapter',bookId,key:source.id,value:{baseSha256:'a'.repeat(64),sourceHash:await ttsHash(source.text),sourceRevision:1,chapters:[{...source,text:'shared',revision:2}]}}),prepared=await prepareSharedChapter(record);
  await db.chapters.update(source.id,{text:'late local',revision:2});await expect(db.transaction('rw',[db.settings,db.books,db.names,db.progress,db.chapters],()=>applyLocalSharedRecord(record,undefined,prepared))).rejects.toBeInstanceOf(LocalSharedConflict);
  expect((await db.chapters.get(source.id))?.text).toBe('late local');expect(await readLocalSharedRecord(record)).toBeUndefined();
 });
 it('explicit shared conflict resolution overwrites its edited split child and preserves other local descendants',async()=>{
  await ready();await saveSharedChapter(source,'head tail',5);const initial=await chapterRecord(),originalChild=(initial.value as {chapters:Chapter[]}).chapters[1];ledger.connect();await syncSharedState();
  const child=await db.chapters.get(originalChild.id);await saveSharedChapter(child!,'local child');await db.chapters.put({...source,id:'local-other',order:0.75,text:'retained local split',revision:2});
  const shared=validateSharedRecord({...initial,value:{...(initial.value as object),editRevision:4,chapters:(initial.value as {chapters:Chapter[]}).chapters.map(c=>c.id===originalChild.id?{...c,text:'shared child',revision:3}:c)}});const row=await ledger.seed(shared);await syncSharedState();expect((await readSharedReplica()).conflicts[row.id]).toBeDefined();
  await resolveSharedState(row.id,'shared');expect((await db.chapters.get(originalChild.id))?.text).toBe('shared child');expect((await db.chapters.get(originalChild.id))?.sourceId).toBe(source.sourceId);expect((await db.chapters.get('local-other'))?.text).toBe('retained local split');expect((await readSharedReplica()).conflicts[row.id]).toBeUndefined();
 });
});

describe('independent dictionary metadata/blob publication and laziness',()=>{
 it('metadata sync fetches no dictionary text bytes in RAW/AI',async()=>{
  const blob=new Blob(['甲=Tên']),record=validateSharedRecord({kind:'dictionary',key:'vp',value:{name:'vp.txt',sha256:await hashBlob(blob),bytes:blob.size,parts:1}});await ledger.seed(record);ledger.connect();await syncSharedState();expect(await db.dictionaries.count()).toBe(0);expect((await readLocalSharedRecord(record))?.value).toEqual(record.value);expect(sharedSyncStatus().state).toBe('synced');
 });
 it('explicit names-only preload never downloads VP bytes and hashes outside Dexie transaction',async()=>{
  const blobs=new Map<string,Blob>();for(const kind of ['vp','names'] as const){const blob=new Blob(['甲='+kind]),sha256=await hashBlob(blob);blobs.set(sha256,blob);await db.settings.put({key:SHARED_DICTIONARY_PREFIX+kind,value:{kind:'dictionary',key:kind,value:{name:kind+'.txt',sha256,bytes:blob.size,parts:1}}});}
  const digest=crypto.subtle.digest.bind(crypto.subtle);vi.spyOn(crypto.subtle,'digest').mockImplementation((...args:Parameters<typeof digest>)=>{expect(Dexie.currentTransaction).toBeUndefined();return digest(...args);});
  const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(url);return new Response(await blobs.get(url.split('/').at(-1)!)!.arrayBuffer());}));expect(await loadSharedDictionaries(()=>{},['names'])).toBe(1);expect(calls).toHaveLength(1);expect((await db.dictionaries.get('names'))?.name).toBe('names.txt');expect(await db.dictionaries.get('vp')).toBeUndefined();
 });
 it('uploads and proves file checksum before publishing its dictionary metadata',async()=>{
  const row=await dictionary('甲=Tên','vp');await db.transaction('rw',db.settings,()=>markSharedDictionary(row));const events:string[]=[];let fileReady=false;
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
   if(url.startsWith('/api/state-files/')){events.push(init?.method??'GET');if(init?.method==='HEAD')return new Response(null,{status:404});if(init?.method==='PUT'){expect(await hashBlob(init.body as Blob)).toBe(row.sha256);fileReady=true;return Response.json({sha256:row.sha256,bytes:row.blob.size});}throw Error();}
   if(init?.method==='PUT'){events.push('METADATA');expect(fileReady).toBe(true);const body=JSON.parse(init.body as string);return Response.json({row:await ledger.seed(body.record)});}return Response.json({rows:[],cursor:ledger.revision,more:false});
  }));await syncSharedState();expect(events).toEqual(['HEAD','PUT','METADATA']);expect(sharedSyncStatus().state).toBe('synced');
 });
 it('checksum mismatch and rejected file PUT preserve local bytes and do not publish metadata',async()=>{
  const row=await dictionary('甲=Tên','vp');await db.transaction('rw',db.settings,()=>markSharedDictionary(row));const record=(await readLocalSharedRecord({kind:'dictionary',key:'vp'}))!;
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='HEAD'?new Response(null,{status:404}):Response.json({error:'fail'},{status:503})));await expect(publishSharedDictionary(record)).rejects.toThrow();expect(await (await db.dictionaries.get('vp'))!.blob.text()).toBe('甲=Tên');expect(await db.settings.get('shared-dictionary-blob:'+row.sha256)).toBeDefined();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('corrupt')));await db.dictionaries.delete('vp');await expect(loadSharedDictionaries(()=>{},['vp'])).rejects.toThrow();expect(await db.dictionaries.get('vp')).toBeUndefined();
 });
 it('custom dictionary removal publishes tombstone and does not reload removed bytes',async()=>{
  const row=await dictionary('甲=Tên','vp');await db.transaction('rw',db.settings,()=>markSharedDictionary(row));await removeSharedDictionary('vp');ledger.connect();await syncSharedState();const remote=[...ledger.rows.values()].find(r=>r.record.kind==='dictionary');expect(remote?.record.value).toBeNull();expect(await loadSharedDictionaries(()=>{},['vp'])).toBe(0);expect(await db.dictionaries.get('vp')).toBeUndefined();
 });
 it('shared dictionary deletion removes an already cached file atomically',async()=>{
  await dictionary('甲=Tên','vp');await apply({kind:'dictionary',key:'vp',value:null});expect(await db.dictionaries.get('vp')).toBeUndefined();
 });
 it('a shared tombstone arriving during default dictionary download prevents resurrection',async()=>{
  const blob=new Blob(['甲=Tên']),sha256=await hashBlob(blob);vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
   if(url==='/api/cloud/dictionaries')return Response.json({version:1,dictionaries:[{kind:'names',name:'names.txt',sha256,bytes:blob.size}]});
   await db.settings.put({key:SHARED_DICTIONARY_PREFIX+'names',value:{kind:'dictionary',key:'names',value:null}});return new Response(await blob.arrayBuffer());
  }));await installDefaultDictionaries(()=>{},['names']);expect(await db.dictionaries.get('names')).toBeUndefined();
 });
 it('common Names patch add/edit/delete keeps comments/unrelated entries and uses installed actual file',async()=>{
  await dictionary('# comment\n甲=Old\n甲=Duplicate\n乙=Other\n');await editCommonName('甲','New');await editCommonName('丙','Added');await editCommonName('乙',null);
  const text=await (await db.dictionaries.get('names'))!.blob.text();expect(text).toContain('# comment');expect(text.match(/甲=/g)).toHaveLength(1);expect(text).toContain('甲=New');expect(text).toContain('丙=Added');expect(text).not.toContain('乙=');expect(await readCommonNames()).toEqual(expect.arrayContaining([{key:'甲',value:'New'},{key:'丙',value:'Added'}]));
  await db.settings.put({key:'shared-common-name:'+encodeURIComponent('甲'),value:{kind:'common-name',key:'甲',value:'Remote'}});await applyPendingCommonNames();expect(await (await db.dictionaries.get('names'))!.blob.text()).toContain('甲=Remote');
 });
});

describe('independent TTS metadata application',()=>{
 it('persists hidden listening checkpoints and Name edits, then automatically uploads both when visible',async()=>{
  await ready();await localName('Before hidden');writeTtsCursor(cursor);await queueAiSettings('tts-cursor-shared:'+bookId,async()=>{});ledger.connect();await syncSharedState();
  let hidden=true;const documentEvents=new EventTarget(),windowEvents=new EventTarget();Object.defineProperty(documentEvents,'hidden',{get:()=>hidden});
  vi.stubGlobal('document',documentEvents);vi.stubGlobal('window',windowEvents);
  const stop=startSharedStateSync(),requests=vi.mocked(fetch).mock.calls.length;
  try{
   for(let offset=4;offset<=6;offset++)writeTtsCursor({...cursor,offset,audioTime:offset,updatedAt:offset});
   await queueAiSettings('tts-cursor-shared:'+bookId,async()=>{});await localName('Edited while hidden');
   windowEvents.dispatchEvent(new Event('shared-state-changed'));windowEvents.dispatchEvent(new Event('focus'));windowEvents.dispatchEvent(new Event('online'));
   await new Promise(resolve=>setTimeout(resolve,1300));
   expect(readTtsCursor(bookId)).toMatchObject({offset:6,audioTime:6});expect((await db.settings.get('tts-cursor-shared:'+bookId))?.value).toMatchObject({offset:6,audioTime:6});
   expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);expect([...ledger.rows.values()].find(row=>row.record.kind==='name')?.record.value).toBe('Before hidden');
   hidden=false;documentEvents.dispatchEvent(new Event('visibilitychange'));
   await vi.waitFor(()=>{
    expect([...ledger.rows.values()].find(row=>row.record.kind==='tts-cursor')?.record.value).toMatchObject({offset:6,audioTime:6});
    expect([...ledger.rows.values()].find(row=>row.record.kind==='name')?.record.value).toBe('Edited while hidden');
    expect(sharedSyncStatus().state).toBe('synced');
   },{timeout:5000});
   expect((await db.names.get('name-甲'))?.value).toBe('Edited while hidden');expect((await readSharedReplica()).conflicts).toEqual({});
  }finally{stop();await syncSharedState();}
 });
 it.each(['progress','tts-cursor'] as const)('%s ignores timestamp-only churn but preserves competing positions until explicit choice',async kind=>{
  await ready();const initial=kind==='progress'?{bookId,chapterId:source.id,paragraph:0,offset:3,revision:1,updatedAt:10}:{...cursor,updatedAt:10};
  const write=async(value:typeof initial)=>{if(kind==='progress')await db.progress.put(value as Parameters<typeof db.progress.put>[0]);else await db.settings.put({key:'tts-cursor-shared:'+bookId,value});};
  const record=(value:typeof initial):SharedRecord=>({kind,bookId,key:'',value});
  await write(initial);const first=await ledger.seed(record({...initial,updatedAt:20}));ledger.connect();await syncSharedState();
  expect((await readSharedReplica()).conflicts[first.id]).toBeUndefined();expect(ledger.puts.filter(r=>r.kind===kind)).toEqual([]);expect((await readLocalSharedRecord(first.record))?.value).toMatchObject({offset:3,updatedAt:10});
  ledger.puts=[];await write({...initial,updatedAt:30});await syncSharedState();expect(ledger.puts.filter(r=>r.kind===kind)).toEqual([]);expect(sharedSyncStatus().state).toBe('synced');
  const timestampOnly=await ledger.seed(record({...initial,updatedAt:40}));await syncSharedState();expect((await readSharedReplica()).conflicts[first.id]).toBeUndefined();expect((await readSharedReplica()).base[first.id].revision).toBe(timestampOnly.revision);expect(ledger.puts.filter(r=>r.kind===kind)).toEqual([]);
  await write({...initial,offset:4,updatedAt:50});const competing=await ledger.seed(record({...initial,offset:5,updatedAt:60}));await syncSharedState();
  expect((await readLocalSharedRecord(competing.record))?.value).toMatchObject({offset:4,updatedAt:50});expect((await readSharedReplica()).conflicts[first.id]).toEqual(competing);expect(ledger.puts.filter(r=>r.kind===kind)).toEqual([]);
  await resolveSharedState(first.id,'shared');expect((await readLocalSharedRecord(competing.record))?.value).toMatchObject({offset:5,updatedAt:60});expect((await readSharedReplica()).conflicts[first.id]).toBeUndefined();expect(sharedSyncStatus().state).toBe('synced');
 });
 it('a late metadata transaction failure rolls back cursor and replica together',async()=>{
  await ready();const row=await ledger.seed({kind:'tts-cursor',bookId,key:'',value:cursor});ledger.connect();const put=db.settings.put.bind(db.settings);
  vi.spyOn(db.settings,'put').mockImplementation((...args:Parameters<typeof put>)=>{if(args[0].key===SHARED_STATE_KEY)throw Error('synthetic late settings failure');return put(...args);});
  await syncSharedState();expect(readTtsCursor(bookId)).toBeUndefined();expect(await db.settings.get('tts-cursor-shared:'+bookId)).toBeUndefined();expect(await db.settings.get(SHARED_STATE_KEY)).toBeUndefined();expect(ledger.rows.get(row.id)?.record.value).toEqual(cursor);
 });
 it('sync stores only listening checkpoint metadata and cannot autoplay audio',async()=>{
  await ready();const play=vi.fn();vi.stubGlobal('Audio',class {play=play;});await ledger.seed({kind:'tts-cursor',bookId,key:'',value:cursor});ledger.connect();await syncSharedState();expect((await readLocalSharedRecord({kind:'tts-cursor',bookId,key:''}))?.value).toEqual(cursor);expect(play).not.toHaveBeenCalled();
  writeTtsCursor({...cursor,offset:4,updatedAt:2});await queueAiSettings('tts-cursor-shared:'+bookId,async()=>{});expect((await captureSharedRecords()).find(r=>r.kind==='tts-cursor')?.value).toMatchObject({offset:4});
 });
 it('explicit stop clears canonical checkpoint and publishes shared tombstone',async()=>{
  await ready();writeTtsCursor(cursor);await queueAiSettings('tts-cursor-shared:'+bookId,async()=>{});ledger.connect();await syncSharedState();clearTtsCursor(bookId);await queueAiSettings('tts-cursor-shared:'+bookId,async()=>{});await syncSharedState();expect(readTtsCursor(bookId)).toBeUndefined();expect((await readLocalSharedRecord({kind:'tts-cursor',bookId,key:''}))?.value).toBeNull();expect([...ledger.rows.values()].find(r=>r.record.kind==='tts-cursor')?.record.value).toBeNull();
 });
});
