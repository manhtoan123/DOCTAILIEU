import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import type {Chapter,Progress} from '../src/core/domain';
import {chooseAiReadingProgress,matchesReadingProgress,saveAiReadingProgress,saveReadingProgress} from '../src/features/reader/services/reading-progress';
import {applyLocalSharedRecord,readLocalSharedRecord,sharedJson} from '../src/features/sync-cloud/services/shared-state-local';
import {sharedRecordId,validateSharedRecord,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {readSharedReplica,syncSharedState} from '../src/features/sync-cloud/services/shared-state-sync';

const bookId='reading-bookmark-review';
const chapters:Chapter[]=Array.from({length:3},(_,order)=>({id:`bookmark-review-${order}`,bookId,order,title:'Synthetic chapter',text:'原文😀\n第二段',revision:1,sourceId:'bookmark-review-source'}));
const actual=(order=0,updatedAt=100,paragraph=0,ai=true):Progress=>({bookId,chapterId:chapters[order].id,revision:1,paragraph,offset:0,updatedAt,reading:true,...(ai?{mode:'ai' as const}:{})});
const legacy=(order=2,updatedAt=10000):Progress=>{const {reading:_,...old}=actual(order,updatedAt);return old;};
const record=(value:Progress|null):SharedRecord=>validateSharedRecord({kind:'progress',bookId,key:'',value});

beforeEach(async()=>{
 vi.stubGlobal('location',{origin:'https://bookmark-review.example'});
 await db.delete();await db.open();
 await db.books.put({id:bookId,title:'Synthetic book',author:'',status:'ready',chapterCount:3,charCount:27,createdAt:1,updatedAt:1});
 await db.chapters.bulkPut(chapters);
});
afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllGlobals();await db.delete();});

describe('independent actual reading bookmark guards',()=>{
 it('lets actual reading return to an earlier chapter and replace a legacy AI prewarm marker',async()=>{
  await db.progress.put(legacy());
  const {reading:_,...input}=actual(0,100,1,false);
  expect(await saveReadingProgress(input)).toBe(true);
  expect(await db.progress.get(bookId)).toEqual(actual(0,100,1,false));
 });
 it('marks entry into the actual AI chapter without rewinding an existing translated position',async()=>{
  await db.progress.put(legacy());expect(await saveAiReadingProgress(chapters[0])).toBe(true);
  expect(await db.progress.get(bookId)).toMatchObject({chapterId:chapters[0].id,mode:'ai',reading:true,paragraph:0,offset:0});
  const saved=actual(0,123,87);await db.progress.put(saved);
  await saveAiReadingProgress(chapters[0]);
  expect(await db.progress.get(bookId)).toMatchObject(saved);
 });
 it('rechecks the current target before writing and rolls back a failed bookmark write',async()=>{
  const saved=actual(0,100,7);await db.progress.put(saved);let checks=0;
  expect(await saveAiReadingProgress(chapters[1],()=>++checks===1)).toBe(false);
  expect(checks).toBe(2);expect(await db.progress.get(bookId)).toEqual(saved);
  const put=vi.spyOn(db.progress,'put').mockRejectedValueOnce(Error('synthetic quota failure'));
  await expect(saveAiReadingProgress(chapters[1])).rejects.toThrow('synthetic quota failure');put.mockRestore();
  expect(await db.progress.get(bookId)).toEqual(saved);
 });
 it.each(['revision','text','foreign','hidden','cloud-deleted','staging'] as const)('rejects an invalid actual target without losing the bookmark: %s',async failure=>{
  const saved=actual(0,100,8);await db.progress.put(saved);const source={...chapters[1]};
  if(failure==='revision')source.revision++;
  if(failure==='text')source.text+='stale';
  if(failure==='foreign')await db.chapters.update(source.id,{bookId:'foreign-book'});
  if(failure==='hidden')await db.books.update(bookId,{hiddenChapterIds:[source.id]});
  if(failure==='cloud-deleted')await db.settings.put({key:`cloud-deleted:${location.origin}:${bookId}`,value:true});
  if(failure==='staging')await db.books.update(bookId,{status:'staging'});
  expect(await saveAiReadingProgress(source)).toBe(false);expect(await db.progress.get(bookId)).toEqual(saved);
 });
 it('accepts translated paragraph coordinates without weakening raw source bounds or rewriting source bytes',async()=>{
  const sourceBlob=new Blob([new Uint8Array([0,255,239,187,191,13,10])]);
  await db.sources.put({id:chapters[0].sourceId,bookId,name:'synthetic.txt',relativePath:'synthetic.txt',encoding:'utf-8',sha256:'a'.repeat(64),bytes:sourceBlob.size,blob:sourceBlob});
  const chapterBefore=await db.chapters.get(chapters[0].id),sourceBefore=await db.sources.get(chapters[0].sourceId);
  const translated=actual(0,100,300);
  expect(matchesReadingProgress(translated,chapters[0])).toBe(true);
  expect(matchesReadingProgress({...translated,mode:undefined},chapters[0])).toBe(false);
  expect(await saveReadingProgress(translated)).toBe(true);expect(await db.progress.get(bookId)).toEqual(translated);
  expect(await db.chapters.get(chapters[0].id)).toEqual(chapterBefore);
  const sourceAfter=await db.sources.get(chapters[0].sourceId);
  expect({...sourceAfter,blob:undefined}).toEqual({...sourceBefore,blob:undefined});
  expect(new Uint8Array(await sourceAfter!.blob.arrayBuffer())).toEqual(new Uint8Array(await sourceBefore!.blob.arrayBuffer()));
 });
});

describe('independent bookmark wire format and merge policy',()=>{
 it('round-trips bounded translated AI paragraphs while preserving the strict legacy format',()=>{
  for(const paragraph of [0,42,512000])expect(record(actual(0,100,paragraph)).value).toEqual(actual(0,100,paragraph));
  expect(record(legacy()).value).toEqual(legacy());
  for(const patch of [{reading:false},{reading:1},{reading:'true'},{paragraph:-1},{paragraph:0.5},{paragraph:512001},{offset:1}])expect(()=>record({...actual(),...patch} as Progress)).toThrow();
  expect(()=>record({...legacy(),paragraph:1})).toThrow();expect(()=>record({...legacy(),offset:1})).toThrow();
 });
 it('applies valid translated remote positions and preserves the latest local value on a stale CAS',async()=>{
  const saved=actual(0,100,9),incoming=record(actual(0,200,123));await db.progress.put(saved);
  const expected=sharedJson(await readLocalSharedRecord(incoming));
  await db.transaction('rw',[db.settings,db.books,db.progress,db.chapters],()=>applyLocalSharedRecord(incoming,expected));
  expect(await db.progress.get(bookId)).toEqual(incoming.value);
  const latest=actual(1,300,77);await db.progress.put(latest);
  await expect(db.transaction('rw',[db.settings,db.books,db.progress,db.chapters],()=>applyLocalSharedRecord(incoming,expected))).rejects.toThrow();
  expect(await db.progress.get(bookId)).toEqual(latest);
 });
 it('actual provenance defeats legacy prewarm timestamps in both directions',async()=>{
  expect(await chooseAiReadingProgress(actual(0,1,13),legacy(2,999999))).toBe('local');
  expect(await chooseAiReadingProgress(legacy(2,999999),actual(0,1,13))).toBe('remote');
 });
 it('uses recency between actual bookmarks and preserves conflicts for ties, raw/raw and invalid references',async()=>{
  expect(await chooseAiReadingProgress(actual(2,10),actual(0,20,9))).toBe('remote');
  expect(await chooseAiReadingProgress(actual(0,20,9),actual(2,10))).toBe('local');
  expect(await chooseAiReadingProgress(actual(0,10),actual(2,20,0,false))).toBe('remote');
  expect(await chooseAiReadingProgress(actual(0,20,0,false),actual(2,10))).toBe('local');
  expect(await chooseAiReadingProgress(actual(0,20),actual(2,20))).toBeUndefined();
  expect(await chooseAiReadingProgress(actual(0,20),actual(0,20,1))).toBeUndefined();
  expect(await chooseAiReadingProgress(actual(0,10,0,false),actual(2,20,0,false))).toBeUndefined();
  expect(await chooseAiReadingProgress(actual(),{...actual(1),revision:2})).toBeUndefined();
  await db.books.update(bookId,{hiddenChapterIds:[chapters[1].id]});
  expect(await chooseAiReadingProgress(actual(),actual(1))).toBeUndefined();
 });
});

async function cloud(remoteValue:Progress|null){
 const initial=record(remoteValue),id=await sharedRecordId(initial);let revision=1;
 const rows=new Map([[id,{id,revision,record:initial}]]),writes:SharedRecord[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  const url=new URL(input,location.origin);
  if(init?.method==='PUT'){
   const body=JSON.parse(String(init.body)),old=rows.get(body.id);writes.push(body.record);
   if(body.baseRevision!==(old?.revision??0))return Response.json({row:old},{status:409});
   const row={id:body.id,revision:++revision,record:validateSharedRecord(body.record)};rows.set(body.id,row);return Response.json({row});
  }
  const scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0);
  return Response.json({rows:[...rows.values()].filter(row=>(row.record.bookId??'')===scope&&row.revision>after),cursor:revision,more:false});
 }));
 return {id,rows,writes};
}

describe('independent bookmark sync interleaving',()=>{
 it.each([
  {name:'new local reading beats a higher old chapter',initial:actual(2,10),during:actual(0,100,20),remote:actual(1,90,30),expected:actual(0,100,20)},
  {name:'newer remote translated position applies against the latest CAS',initial:actual(2,10),during:actual(0,100,20),remote:actual(1,120,30),expected:actual(1,120,30)},
  {name:'timestamp-only activity is included in the transaction decision',initial:actual(0,10,20),during:actual(0,100,20),remote:actual(1,90,30),expected:actual(0,100,20)},
  {name:'legacy prewarm cannot win by updating its timestamp during sync',initial:actual(2,10),during:actual(0,100,20),remote:legacy(2,999999),expected:actual(0,100,20)},
 ])('$name',async scenario=>{
  await db.progress.put(scenario.initial);const digest=crypto.subtle.digest.bind(crypto.subtle);let interleaved=false;
  vi.spyOn(crypto.subtle,'digest').mockImplementation(async(...args:Parameters<typeof digest>)=>{
   const text=new TextDecoder().decode(args[1]);
   if(!interleaved&&text.includes('"kind":"progress"')&&text.includes('"chapterId"')){interleaved=true;await db.progress.put(scenario.during);}
   return digest(...args);
  });
  const server=await cloud(scenario.remote);await syncSharedState();
  expect(interleaved).toBe(true);expect(await db.progress.get(bookId)).toEqual(scenario.expected);
  expect((await readSharedReplica()).conflicts[server.id]).toBeUndefined();expect(server.rows.get(server.id)?.record.value).toEqual(scenario.expected);
 });
 it('does not turn a remote tombstone into a silent delete or resurrection of dirty reading',async()=>{
  const saved=actual(0,100,50);await db.progress.put(saved);const server=await cloud(null);await syncSharedState();
  expect(await db.progress.get(bookId)).toEqual(saved);expect((await readSharedReplica()).conflicts[server.id]?.record.value).toBeNull();
  expect(server.writes.some(value=>value.kind==='progress')).toBe(false);
 });
 it('keeps actual reading through a PUT CAS collision with a newer legacy prewarm writer',async()=>{
  const saved=actual(0,100,23);await db.progress.put(saved);const initial=record(actual(2,10)),id=await sharedRecordId(initial);
  let remote={id,revision:1,record:initial},collided=false;const bases:number[]=[];
  vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
   const url=new URL(input,location.origin);
   if(init?.method==='PUT'){
    const body=JSON.parse(String(init.body));if(body.id!==id)return Response.json({row:{id:body.id,revision:1,record:validateSharedRecord(body.record)}});
    bases.push(body.baseRevision);if(!collided){collided=true;remote={id,revision:2,record:record(legacy(2,999999))};return Response.json({row:remote},{status:409});}
    expect(body.baseRevision).toBe(remote.revision);remote={id,revision:3,record:validateSharedRecord(body.record)};return Response.json({row:remote});
   }
   const scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0);
   return Response.json({rows:scope===bookId&&remote.revision>after?[remote]:[],cursor:remote.revision,more:false});
  }));
  await syncSharedState();expect(collided).toBe(true);expect(await db.progress.get(bookId)).toEqual(saved);
  expect((await readSharedReplica()).conflicts[id]).toBeUndefined();await syncSharedState();
  expect(bases).toEqual([1,2]);expect(remote.record.value).toEqual(saved);
 });
});
