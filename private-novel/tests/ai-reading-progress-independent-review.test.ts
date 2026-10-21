import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import type {Chapter,Progress} from '../src/core/domain';
import {saveAiReadingProgress,chooseAiReadingProgress} from '../src/features/reader/services/reading-progress';
import {sharedRecordId,validateSharedRecord,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {readSharedReplica,syncSharedState} from '../src/features/sync-cloud/services/shared-state-sync';

const bookId='independent-ai-progress';
const chapters:Chapter[]=Array.from({length:3},(_,order)=>({id:`independent-${order}`,bookId,order,title:'Synthetic',text:'原文😀\nSecond paragraph',revision:1,sourceId:'immutable-source'}));
const marker=(order:number,mode:Progress['mode']='ai'):Progress=>({bookId,chapterId:chapters[order].id,revision:1,paragraph:0,offset:0,updatedAt:1,...(mode?{mode}:{})});
beforeEach(async()=>{
 vi.stubGlobal('location',{origin:'https://independent-progress.example'});
 await db.delete();await db.open();await db.books.put({id:bookId,title:'Synthetic',author:'',status:'ready',chapterCount:3,charCount:66,createdAt:1,updatedAt:1});await db.chapters.bulkPut(chapters);
});
afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllGlobals();await db.delete();});

it('rechecks cancellation immediately before writing and leaves an earlier bookmark intact',async()=>{
 const old=marker(0);await db.progress.put(old);let checks=0;
 expect(await saveAiReadingProgress(chapters[2],()=>++checks===1)).toBe(false);
 expect(checks).toBe(2);expect(await db.progress.get(bookId)).toEqual(old);
});
it('a failed IndexedDB write rolls back without losing the previous bookmark',async()=>{
 const old=marker(0);await db.progress.put(old);
 const write=vi.spyOn(db.progress,'put').mockRejectedValueOnce(Error('simulated quota failure'));
 await expect(saveAiReadingProgress(chapters[2])).rejects.toThrow('simulated quota failure');write.mockRestore();
 expect(await db.progress.get(bookId)).toEqual(old);expect(await db.chapters.where('bookId').equals(bookId).sortBy('order')).toEqual(chapters);
});
it('concurrent completions in reverse chapter order finish at the greatest valid order',async()=>{
 await Promise.all([saveAiReadingProgress(chapters[2]),saveAiReadingProgress(chapters[0]),saveAiReadingProgress(chapters[1])]);
 expect(await db.progress.get(bookId)).toMatchObject({...marker(2),updatedAt:expect.any(Number)});
});
it('ambiguous equal-order chapters and foreign or stale references cannot auto-resolve conflicts',async()=>{
 const duplicate={...chapters[1],id:'different-same-order'};await db.chapters.put(duplicate);
 expect(await chooseAiReadingProgress(marker(1),{...marker(1),chapterId:duplicate.id})).toBeUndefined();
 expect(await chooseAiReadingProgress(marker(1),{...marker(2),revision:2})).toBeUndefined();
 await db.chapters.update(chapters[2].id,{bookId:'other-book'});
 expect(await chooseAiReadingProgress(marker(1),marker(2))).toBeUndefined();
});

async function receiveOnce(remote:Progress|null,local:Progress){
 await db.progress.put(local);const record=validateSharedRecord({kind:'progress',bookId,key:'',value:remote}),id=await sharedRecordId(record);let revision=1;
 const rows=new Map([[id,{id,revision,record}]]);const puts:SharedRecord[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  const url=new URL(input,location.origin);
  if(init?.method==='PUT'){const body=JSON.parse(String(init.body)),old=rows.get(body.id);puts.push(body.record);if(body.baseRevision!==(old?.revision??0))return Response.json({row:old},{status:409});const row={id:body.id,revision:++revision,record:validateSharedRecord(body.record)};rows.set(body.id,row);return Response.json({row});}
  const scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0);return Response.json({rows:[...rows.values()].filter(row=>(row.record.bookId??'')===scope&&row.revision>after),cursor:revision,more:false});
 }));
 await syncSharedState();return {id,rows,puts};
}
it('a remote tombstone cannot silently delete or resurrect a dirty AI bookmark',async()=>{
 const old=marker(2),{id,puts}=await receiveOnce(null,old);
 expect(await db.progress.get(bookId)).toEqual(old);expect((await readSharedReplica()).conflicts[id]?.record.value).toBeNull();
 expect(puts.some(record=>record.kind==='progress')).toBe(false);
});
it('ordinary competing scroll positions still require an explicit conflict choice',async()=>{
 const local={...marker(0),mode:undefined},remote={...marker(2),mode:undefined},{id,puts}=await receiveOnce(remote,local);
 expect(await db.progress.get(bookId)).toEqual(local);expect((await readSharedReplica()).conflicts[id]?.record.value).toEqual(validateSharedRecord({kind:'progress',bookId,key:'',value:remote}).value);
 expect(puts.some(record=>record.kind==='progress')).toBe(false);
});
it.each([
 {name:'raw scroll races a newer remote AI bookmark',initial:{...marker(0),mode:undefined},during:{...marker(1),mode:undefined},remote:marker(2),expected:marker(2),conflict:false},
 {name:'new local AI completion beats older remote AI',initial:marker(0),during:marker(2),remote:marker(1),expected:marker(2),conflict:false},
 {name:'timestamp-only local AI update keeps deterministic chapter merge',initial:marker(2),during:{...marker(2),updatedAt:2},remote:marker(1),expected:{...marker(2),updatedAt:2},conflict:false},
 {name:'new local AI completion accepts a still-newer remote AI',initial:{...marker(0),mode:undefined},during:marker(1),remote:marker(2),expected:marker(2),conflict:false},
 {name:'remote application uses latest CAS even when snapshot hash matched',initial:marker(1),during:{...marker(0),mode:undefined},remote:marker(1),expected:marker(1),conflict:false},
 {name:'normal scrolling retains manual conflict rules',initial:{...marker(0),mode:undefined},during:{...marker(1),mode:undefined},remote:{...marker(2),mode:undefined},expected:{...marker(1),mode:undefined},conflict:true},
 {name:'remote tombstone retains manual conflict rules',initial:marker(0),during:marker(2),remote:null,expected:marker(2),conflict:true},
])('snapshot-to-transaction interleaving: $name',async scenario=>{
 const digest=crypto.subtle.digest.bind(crypto.subtle);let interleaved=false;
 vi.spyOn(crypto.subtle,'digest').mockImplementation(async(...args:Parameters<typeof digest>)=>{
  const serialized=new TextDecoder().decode(args[1]);
  // recordHash runs after readLocalSharedRecord has captured the old value and before the rw transaction.
  if(!interleaved&&serialized.includes('"kind":"progress"')&&serialized.includes('"chapterId"')){
   interleaved=true;await db.progress.put(scenario.during);
  }
  return digest(...args);
 });
 const {id,rows}=await receiveOnce(scenario.remote,scenario.initial);
 expect(interleaved).toBe(true);expect(await db.progress.get(bookId)).toEqual(scenario.expected);
 expect(!!(await readSharedReplica()).conflicts[id]).toBe(scenario.conflict);
 if(!scenario.conflict)expect(rows.get(id)?.record.value).toEqual(validateSharedRecord({kind:'progress',bookId,key:'',value:scenario.expected}).value);
});
it('an actual PUT CAS collision retains the greater AI chapter and republishes against the observed revision',async()=>{
 await db.progress.put(marker(2));const initial:SharedRecord={kind:'progress',bookId,key:'',value:marker(0)},id=await sharedRecordId(initial);
 let remote={id,revision:1,record:initial},collided=false;const bases:number[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  const url=new URL(input,location.origin);
  if(init?.method==='PUT'){
   const body=JSON.parse(String(init.body));if(body.id!==id)return Response.json({row:{id:body.id,revision:1,record:validateSharedRecord(body.record)}});
   bases.push(body.baseRevision);
   if(!collided){collided=true;remote={id,revision:2,record:{...initial,value:marker(1)}};return Response.json({row:remote},{status:409});}
   expect(body.baseRevision).toBe(remote.revision);remote={id,revision:3,record:validateSharedRecord(body.record)};return Response.json({row:remote});
  }
  const scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0);
  return Response.json({rows:scope===bookId&&remote.revision>after?[remote]:[],cursor:remote.revision,more:false});
 }));
 await syncSharedState();expect(collided).toBe(true);expect(await db.progress.get(bookId)).toEqual(marker(2));expect((await readSharedReplica()).conflicts[id]).toBeUndefined();
 await syncSharedState();expect(bases).toEqual([1,2]);expect(remote.record.value).toEqual(marker(2));expect((await readSharedReplica()).conflicts[id]).toBeUndefined();
});
it('AI progress writes preserve source blobs and EPUB layout nodes byte for byte',async()=>{
 // This opaque fixture is stored directly: the progress helper must never parse or rewrite it.
 const epub={spinePath:'OPS/ch1.xhtml',nodes:['原文😀','Second paragraph'],html:'<p>原文😀</p><img src="x.png">'};
 await db.chapters.update(chapters[1].id,{epub:epub as unknown as Chapter['epub']});
 const blob=new Blob([new Uint8Array([0,255,239,187,191,13,10])]);await db.sources.put({id:'immutable-source',bookId,name:'source.epub',relativePath:'source.epub',encoding:'binary',sha256:'a'.repeat(64),bytes:blob.size,blob});
 const beforeChapter=await db.chapters.get(chapters[1].id),beforeSource=await db.sources.get('immutable-source');
 expect(await saveAiReadingProgress(chapters[1])).toBe(true);
 expect(await db.chapters.get(chapters[1].id)).toEqual(beforeChapter);
 const afterSource=await db.sources.get('immutable-source');expect({...afterSource,blob:undefined}).toEqual({...beforeSource,blob:undefined});
 expect(new Uint8Array(await afterSource!.blob.arrayBuffer())).toEqual(new Uint8Array(await beforeSource!.blob.arrayBuffer()));
});
