import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db,readyChapters} from '../src/core/db';
import type {Book,Chapter,SourceFile} from '../src/core/domain';
import {applyAppendRecord,commitTxtAppend,findAppendStart,makeAppendRecords,prepareAppendRecord,type AppendPreview} from '../src/features/import-export/services/chapter-append';
import {APPEND_PACKET_PREFIX,APPEND_PREFIX} from '../src/features/import-export/services/chapter-append-schema';
import {applyLocalSharedRecord,captureSharedRecords,prepareSharedChapter,readLocalSharedRecord,sharedJson,SHARED_CHAPTER_PREFIX} from '../src/features/sync-cloud/services/shared-state-local';
import {saveSharedChapter} from '../src/features/sync-cloud/services/shared-chapters';
import {readSharedReplica,resolveSharedState,sharedSyncStatus,syncSharedState,SHARED_STATE_KEY} from '../src/features/sync-cloud/services/shared-state-sync';
import {sharedRecordId,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {ttsHash} from '../src/features/tts/services/tts-cursor';

const origin='https://append-review.example',bookId='append-review',baseSha='a'.repeat(64);
const chapter=(order:number,owner=bookId):Chapter=>({id:`${owner}-${order}`,bookId:owner,order,title:`Chương ${order+1}`,text:`Nội dung ${order+1}\r\nĐoạn cuối.`,revision:1,sourceId:'old-source'});
const txTables=[db.books,db.chapters,db.sources,db.settings];
let before:Chapter[],book:Book,oldSource:SourceFile,newSource:SourceFile;
beforeEach(async()=>{
 vi.stubGlobal('location',{origin});vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}});
 await db.delete();await db.open();before=[chapter(0),chapter(1),chapter(2)];
 book={id:bookId,title:'Synthetic append review',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:before.length,charCount:before.reduce((n,c)=>n+c.text.length,0)};
 const blob=new Blob(['Original bytes retained.']);oldSource={id:'old-source',bookId,name:'old.txt',relativePath:'old.txt',encoding:'utf-8',bytes:blob.size,sha256:await ttsHash(await blob.text()),blob};
 const freshBlob=new Blob(['Full new synthetic source.']);newSource={...oldSource,id:'new-source',name:'full.txt',relativePath:'full.txt',bytes:freshBlob.size,sha256:await ttsHash(await freshBlob.text()),blob:freshBlob};
 await db.books.add(book);await db.chapters.bulkAdd(before);await db.sources.add(oldSource);
 await db.settings.put({key:`cloud-uploaded:${origin}:${bookId}`,value:{sha256:baseSha}});
 await db.progress.put({bookId,chapterId:before[1].id,revision:1,paragraph:0,offset:2,updatedAt:2});
 await db.settings.put({key:'ai-reading-cache:v1:synthetic-retain',value:{sentinel:'old AI'}});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const suffix=()=>[{...chapter(3),id:'new-3',sourceId:newSource.id},{...chapter(4),id:'new-4',sourceId:newSource.id}];
async function records(){return makeAppendRecords(bookId,before,suffix(),newSource,baseSha);}
async function stash(packets:SharedRecord[]){for(const packet of packets)await db.settings.put({key:APPEND_PACKET_PREFIX+bookId+':'+packet.key,value:packet});}
async function apply(manifest:SharedRecord){const prepared=await prepareAppendRecord(manifest);return db.transaction('rw',txTables,()=>applyAppendRecord(manifest,prepared));}
async function stage():Promise<AppendPreview>{
 const stageId='append-stage',source={...newSource,bookId:stageId},staged=[...before,...suffix()].map(c=>({...c,id:'stage-'+c.order,bookId:stageId,sourceId:source.id}));
 await db.books.add({...book,id:stageId,status:'staging',chapterCount:staged.length});await db.sources.add(source);await db.chapters.bulkAdd(staged);
 await db.importJobs.add({jobId:'append-stage-job',bookId:stageId,phase:'preview',totalFiles:1,processedFiles:1,processedBytes:source.bytes,checkpoint:staged.length,duplicateFiles:[],updatedAt:1});
 return {book,before,stageId,source,staged,start:before.length};
}

it('review: anchor matching requires the complete unique tail, accepts only line ending/trim normalization',async()=>{
 const fresh=[chapter(10),...before.map(c=>({...c,title:' '+c.title+' ',text:'\n'+c.text.replace(/\r\n/g,'\n')+'\n'})),chapter(4)];
 expect(await findAppendStart(before,fresh)).toBe(4);
 await expect(findAppendStart(before,[...before,...before,chapter(4)])).rejects.toThrow(/nhiều lần/);
 await expect(findAppendStart(before,[{...before[0],text:'Edited'},before[1],before[2],chapter(4)])).rejects.toThrow(/Không tìm thấy/);
 await expect(findAppendStart(before,[...before])).rejects.toThrow(/chưa có chương mới/);
});

it('review: cancellation stops anchor hashing without accepting a partially checked candidate',async()=>{
 const stop=new AbortController();stop.abort();await expect(findAppendStart(before,[...before,chapter(4)],stop.signal)).rejects.toMatchObject({name:'AbortError'});
});

it('review: local commit adds only staged suffix and retains all old IDs, original bytes, progress and AI rows',async()=>{
 const preview=await stage(),progress=await db.progress.get(bookId);expect(await commitTxtAppend(preview)).toBe(2);
 expect((await readyChapters(bookId)).slice(0,3)).toEqual(before);expect((await readyChapters(bookId)).slice(3).map(c=>c.id)).toEqual(['stage-3','stage-4']);
 expect(await db.progress.get(bookId)).toEqual(progress);expect((await db.settings.get('ai-reading-cache:v1:synthetic-retain'))?.value).toEqual({sentinel:'old AI'});
 const retained=await db.sources.get(oldSource.id),added=await db.sources.get(newSource.id);expect(retained?.sha256).toBe(oldSource.sha256);expect(await retained?.blob.text()).toBe(await oldSource.blob.text());expect(await added?.blob.text()).toBe(await newSource.blob.text());expect(added?.bookId).toBe(bookId);
 expect(await db.books.get(preview.stageId)).toBeUndefined();expect(await db.importJobs.where('bookId').equals(preview.stageId).count()).toBe(0);
});

it.each(['chapter','stage','deleted'] as const)('review: local %s CAS conflict preserves staging and target without a partial append',async kind=>{
 const preview=await stage();if(kind==='chapter')await db.chapters.update(before[0].id,{text:'Concurrent edit'});if(kind==='stage')await db.chapters.update(preview.staged.at(-1)!.id,{text:'Concurrent stage edit'});if(kind==='deleted')await db.settings.put({key:`cloud-deleted:${origin}:${bookId}`,value:true});
 await expect(commitTxtAppend(preview)).rejects.toThrow();expect(await db.chapters.where('bookId').equals(bookId).count()).toBe(3);expect(await db.books.get(preview.stageId)).toBeDefined();expect(await db.settings.where('key').startsWith(APPEND_PREFIX).count()).toBe(0);
});

it('review: native abort after the final staging delete rolls back suffix, source transfer, counters and publication',async()=>{
 const preview=await stage(),stop=new AbortController(),nativeDelete=IDBObjectStore.prototype.delete;
 vi.spyOn(IDBObjectStore.prototype,'delete').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof nativeDelete>){const request=nativeDelete.apply(this,args);if(this.name==='books'&&args[0]===preview.stageId)request.addEventListener('success',()=>stop.abort(),{once:true});return request;});
 await expect(commitTxtAppend(preview,stop.signal)).rejects.toMatchObject({name:'AbortError'});expect(await readyChapters(bookId)).toEqual(before);expect(await db.books.get(bookId)).toEqual(book);expect((await db.sources.get(newSource.id))?.bookId).toBe(preview.stageId);expect(await db.books.get(preview.stageId)).toBeDefined();expect(await db.settings.where('key').startsWith(APPEND_PREFIX).count()).toBe(0);expect(await db.settings.where('key').startsWith(APPEND_PACKET_PREFIX).count()).toBe(0);
});

it('review: missing or tampered packets never expose any chapter from the suffix',async()=>{
 const {packets,manifest}=await records();await expect(prepareAppendRecord(manifest)).rejects.toThrow(/Chưa đủ/);await stash(packets);
 const bad=structuredClone(packets[0]);(bad.value as {chapters:Chapter[]}).chapters[0].text='Tampered source';await stash([bad]);await expect(prepareAppendRecord(manifest)).rejects.toThrow(/SHA/);expect(await readyChapters(bookId)).toEqual(before);
});

it('review: complete remote suffix applies once atomically and honestly marks unavailable source bytes missing',async()=>{
 const {packets,manifest}=await records(),progress=await db.progress.get(bookId);await stash(packets);await apply(manifest);await apply(manifest);
 expect(await readyChapters(bookId)).toEqual([...before,...suffix()]);expect((await db.books.get(bookId))?.chapterCount).toBe(5);expect(await db.progress.get(bookId)).toEqual(progress);
 const source=await db.sources.get(newSource.id);expect(source).toMatchObject({sha256:newSource.sha256,bytes:newSource.bytes,dataStatus:'missing'});expect(source?.blob.size).toBe(0);expect(await (await db.sources.get(oldSource.id))?.blob.text()).toBe(await oldSource.blob.text());
});

it('review: native abort during remote chapter insertion rolls back the complete suffix and publication',async()=>{
 const {packets,manifest}=await records();await stash(packets);const prepared=await prepareAppendRecord(manifest),add=IDBObjectStore.prototype.add;
 vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof add>){const request=add.apply(this,args);if(this.name==='chapters'&&(args[0] as Chapter).id==='new-4')request.addEventListener('success',()=>this.transaction.abort(),{once:true});return request;});
 await expect(db.transaction('rw',txTables,()=>applyAppendRecord(manifest,prepared))).rejects.toThrow();expect(await readyChapters(bookId)).toEqual(before);expect(await db.books.get(bookId)).toEqual(book);expect(await db.sources.get(newSource.id)).toBeUndefined();expect(await db.settings.get(APPEND_PREFIX+bookId+':'+manifest.key)).toBeUndefined();
});

it('review: replay of an older suffix preserves later appends and edited suffix data without overwriting',async()=>{
 const {packets,manifest}=await records();await stash(packets);await apply(manifest);const later={...chapter(5),id:'later-append'};await db.chapters.add(later);await apply(manifest);expect(await readyChapters(bookId)).toEqual([...before,...suffix(),later]);
 await db.chapters.update('new-3',{revision:2,text:'User edited the appended chapter'});const current=await readyChapters(bookId);await apply(manifest);expect(await readyChapters(bookId)).toEqual(current);
});

it.each(['encoding','name','relativePath'] as const)('review: immutable source ID cannot reuse equal bytes/SHA with a different %s descriptor',async field=>{
 const {packets,manifest}=await records();await stash(packets);const collision={...newSource,[field]:field==='encoding'?'gb18030':'other-name.txt'};await db.sources.add(collision);const prepared=await prepareAppendRecord(manifest);
 await expect(db.transaction('rw',txTables,()=>applyAppendRecord(manifest,prepared))).rejects.toThrow();expect(await readyChapters(bookId)).toEqual(before);expect(await db.sources.get(newSource.id)).toMatchObject({[field]:collision[field]});expect(await db.settings.get(APPEND_PREFIX+bookId+':'+manifest.key)).toBeUndefined();
});

it.each(['base','id','competing','prepared'] as const)('review: remote %s conflict leaves the entire suffix unpublished',async kind=>{
 const {packets,manifest}=await records();await stash(packets);const prepared=await prepareAppendRecord(manifest);
 if(kind==='base')await db.settings.put({key:`cloud-uploaded:${origin}:${bookId}`,value:{sha256:'b'.repeat(64)}});if(kind==='id')await db.chapters.add({...suffix()[1],bookId:'other-book'});if(kind==='competing')await db.chapters.add({...chapter(3),id:'competing-suffix'});if(kind==='prepared')await db.chapters.update(before[0].id,{text:'Edited while hashing'});
 const targetBefore=await readyChapters(bookId);await expect(db.transaction('rw',txTables,()=>applyAppendRecord(manifest,prepared))).rejects.toThrow();expect(await readyChapters(bookId)).toEqual(targetBefore);expect(await db.sources.get(newSource.id)).toBeUndefined();expect(await db.settings.get(APPEND_PREFIX+bookId+':'+manifest.key)).toBeUndefined();
});

it('review: append replica descriptors survive persistence and can be read again after restart',async()=>{
 const {packets,manifest}=await records(),base:Record<string,unknown>={};for(const record of [...packets,manifest]){const {value:_,...descriptor}=record;base[await sharedRecordId(record)]={descriptor,revision:1,hash:await ttsHash(JSON.stringify(record))};}
 await db.settings.put({key:SHARED_STATE_KEY,value:{version:1,cursors:{[bookId]:1},base,conflicts:{}}});expect(Object.keys((await readSharedReplica()).base)).toHaveLength(2);expect(Object.keys((await readSharedReplica()).base)).toHaveLength(2);
});

it('review: offline append chains publish packets first and manifests by anchor order rather than UUID order',async()=>{
 const firstId='ffffffff-ffff-4fff-8fff-ffffffffffff',secondId='00000000-0000-4000-8000-000000000000';vi.spyOn(crypto,'randomUUID').mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
 const first=await records(),nextSource={...newSource,id:'source-2'},nextChapters=suffix().map((c,i)=>({...c,id:'next-'+i,order:5+i,sourceId:nextSource.id})),second=await makeAppendRecords(bookId,[...before,...suffix()],nextChapters,nextSource,baseSha);
 const m1=first.manifest,m2=second.manifest;
 await stash([...first.packets,...second.packets]);await db.settings.put({key:APPEND_PREFIX+bookId+':'+m1.key,value:m1});await db.settings.put({key:APPEND_PREFIX+bookId+':'+m2.key,value:m2});
 const captured=(await captureSharedRecords()).filter(r=>r.kind.startsWith('chapter-append'));expect(captured.slice(0,2).every(r=>r.kind==='chapter-append-packet')).toBe(true);expect(captured.filter(r=>r.kind==='chapter-append').map(r=>r.key)).toEqual([firstId,secondId]);
});

it('review: appended IDs are published before an edit and reading progress that refer to them',async()=>{
 const {packets,manifest}=await records();await stash(packets);await apply(manifest);await saveSharedChapter(suffix()[0],'Edited new chapter');await db.progress.put({bookId,chapterId:'new-3',revision:2,paragraph:0,offset:0,updatedAt:3});
 const captured=await captureSharedRecords(),manifestAt=captured.findIndex(r=>r.kind==='chapter-append'),editAt=captured.findIndex(r=>r.kind==='chapter'&&r.key==='new-3'),progressAt=captured.findIndex(r=>r.kind==='progress');expect(manifestAt).toBeGreaterThanOrEqual(0);expect(editAt).toBeGreaterThan(manifestAt);expect(progressAt).toBeGreaterThan(manifestAt);
});

it.each(['before','after'] as const)('review: a fresh device can receive an append with its anchor edited %s the append',async timing=>{
 const edited='User edited the old last chapter';if(timing==='before'){await saveSharedChapter(before[2],edited);before=await readyChapters(bookId);}
 const {packets,manifest}=await records();await stash(packets);await apply(manifest);if(timing==='after')await saveSharedChapter(before[2],edited);
 const captured=(await captureSharedRecords()).filter(r=>['chapter-append-packet','chapter-append','chapter'].includes(r.kind));
 await db.chapters.where('bookId').equals(bookId).delete();await db.chapters.bulkAdd([chapter(0),chapter(1),chapter(2)]);await db.sources.delete(newSource.id);for(const prefix of [APPEND_PREFIX,APPEND_PACKET_PREFIX,SHARED_CHAPTER_PREFIX])await db.settings.where('key').startsWith(prefix).delete();await db.books.put(book);
 for(const record of captured){const expected=sharedJson(await readLocalSharedRecord(record)),prepared=await prepareSharedChapter(record);await db.transaction('rw',txTables,()=>applyLocalSharedRecord(record,expected,prepared));}
 expect((await readyChapters(bookId)).map(c=>c.id)).toEqual([chapter(0).id,chapter(1).id,chapter(2).id,'new-3','new-4']);expect((await db.chapters.get(chapter(2).id))?.text).toBe(edited);
});

it('review: keeping local data for a remote immutable append never publishes a tombstone or blocks later sync',async()=>{
 const {manifest}=await records(),id=await sharedRecordId(manifest),{value:_,...descriptor}=manifest,row={id,revision:1,record:manifest},hash=await ttsHash(JSON.stringify(manifest));
 await db.settings.put({key:SHARED_STATE_KEY,value:{version:1,cursors:{[bookId]:1},base:{[id]:{descriptor,revision:1,hash}},conflicts:{[id]:row}}});const sent:SharedRecord[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{if(init?.method==='PUT'){const body=JSON.parse(init.body as string);sent.push(body.record);return body.record.kind.startsWith('chapter-append')&&body.record.value===null?Response.json({error:'invalid_state'},{status:400}):Response.json({row:{id:body.id,revision:2,record:body.record}});}return Response.json({rows:[],cursor:1,more:false});}));
 await resolveSharedState(id,'local');expect(await readyChapters(bookId)).toEqual(before);expect((await readSharedReplica()).conflicts[id]).toBeUndefined();expect(sent.some(r=>r.kind.startsWith('chapter-append')&&r.value===null)).toBe(false);expect(sharedSyncStatus().state).toBe('synced');
});

it('review: keeping a conflicting local packet preserves its body and stays synced without republishing it on later syncs',async()=>{
 const {packets}=await records(),remote=packets[0],local=structuredClone(remote);(local.value as {chapters:Chapter[]}).chapters[0].text='Local packet body retained';await stash([local]);
 const id=await sharedRecordId(remote),{value:_,...descriptor}=remote,row={id,revision:1,record:remote},hash=await ttsHash(JSON.stringify(remote));
 await db.settings.put({key:SHARED_STATE_KEY,value:{version:1,cursors:{[bookId]:1},base:{[id]:{descriptor,revision:1,hash}},conflicts:{[id]:row}}});const sent:SharedRecord[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{if(init?.method==='PUT'){const body=JSON.parse(init.body as string);sent.push(body.record);return body.record.kind==='chapter-append-packet'?Response.json({row},{status:409}):Response.json({row:{id:body.id,revision:2,record:body.record}});}return Response.json({rows:[],cursor:1,more:false});}));
 await resolveSharedState(id,'local');for(let i=0;i<2;i++){await syncSharedState();expect((await readSharedReplica()).conflicts[id]).toBeUndefined();expect(sharedSyncStatus()).toMatchObject({state:'synced',pending:0});}
 expect(await readLocalSharedRecord(remote)).toEqual(local);expect(await readyChapters(bookId)).toEqual(before);expect(sent.some(record=>record.kind==='chapter-append-packet')).toBe(false);
});
