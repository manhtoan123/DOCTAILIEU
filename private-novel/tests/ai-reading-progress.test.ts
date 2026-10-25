import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {saveAiReadingProgress,saveReadingProgress,chooseAiReadingProgress,readingObservationTime} from '../src/features/reader/services/reading-progress';
import {validateSharedRecord,sharedRecordId,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {syncSharedState,readSharedReplica} from '../src/features/sync-cloud/services/shared-state-sync';
const bookId='ai-progress-book';
const chapters=Array.from({length:3},(_,order)=>({bookId,id:'chapter-'+order,order,title:'Chapter '+order,text:'甲乙\n丙丁',revision:1,sourceId:'original'}));
const progress=(order:number,ai=true)=>({bookId,chapterId:chapters[order].id,revision:1,paragraph:0,offset:0,updatedAt:order+1,reading:true as const,...(ai?{mode:'ai' as const}:{})});
beforeEach(async()=>{vi.stubGlobal('location',{origin:'https://progress.test'});await db.delete();await db.open();await db.books.put({id:bookId,title:'Synthetic',author:'',status:'ready',chapterCount:3,charCount:15,createdAt:1,updatedAt:1});await db.chapters.bulkPut(chapters);});
afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllGlobals();await db.delete();});

it('visible AI chapters can move backwards, preserve a restored paragraph, and never rewrite source',async()=>{
 expect(await saveAiReadingProgress(chapters[2])).toBe(true);
 expect(await saveAiReadingProgress(chapters[0])).toBe(true);
 await db.progress.update(bookId,{paragraph:5});
 expect(await saveAiReadingProgress(chapters[0])).toBe(false);
 expect(await db.progress.get(bookId)).toMatchObject({chapterId:chapters[0].id,paragraph:5,mode:'ai',reading:true});
 expect(await db.chapters.where('bookId').equals(bookId).sortBy('order')).toEqual(chapters);
});
it.each(['stale-text','stale-revision','wrong-book','deleted-chapter','staging','deleted-cloud','cancelled'])('does not publish invalid completion: %s',async scenario=>{
 const source={...chapters[1]};let active=true;
 if(scenario==='stale-text')source.text='Old source';if(scenario==='stale-revision')source.revision=0;if(scenario==='wrong-book')source.bookId='other';
 if(scenario==='deleted-chapter')await db.chapters.delete(source.id);if(scenario==='staging')await db.books.update(bookId,{status:'staging'});
 if(scenario==='deleted-cloud')await db.settings.put({key:`cloud-deleted:${location.origin}:${bookId}`,value:true});if(scenario==='cancelled')active=false;
 expect(await saveAiReadingProgress(source,()=>active)).toBe(false);expect(await db.progress.get(bookId)).toBeUndefined();
});
it('observed raw reading replaces a previous AI bookmark and stale writes cannot rewind the latest observation',async()=>{
 await saveAiReadingProgress(chapters[2]);const now=Date.now()+1;
 expect(await saveReadingProgress({...progress(0,false),updatedAt:now})).toBe(true);
 expect(await saveReadingProgress({...progress(1),updatedAt:now-1})).toBe(false);
 expect(await db.progress.get(bookId)).toMatchObject({chapterId:chapters[0].id,reading:true,updatedAt:now});
});
it('normal progress still saves before the first AI bookmark',async()=>{expect(await saveReadingProgress(progress(0,false))).toBe(true);expect(await db.progress.get(bookId)).toEqual(progress(0,false));});
it.each(['raw','convert','unknown',null])('shared progress rejects unsupported marker %s',mode=>{expect(()=>validateSharedRecord({kind:'progress',bookId,key:'',value:{...progress(1),mode}})).toThrow();});
it('shared schema accepts bounded translated paragraph bookmarks and keeps legacy validation',()=>{
 expect(validateSharedRecord({kind:'progress',bookId,key:'',value:progress(1)}).value).toEqual(progress(1));
 expect(()=>validateSharedRecord({kind:'progress',bookId,key:'',value:{...progress(1),offset:1}})).toThrow();expect(validateSharedRecord({kind:'progress',bookId,key:'',value:{...progress(1),paragraph:100}}).value).toMatchObject({paragraph:100,reading:true});
 expect(()=>validateSharedRecord({kind:'progress',bookId,key:'',value:{...progress(1),reading:undefined,paragraph:1}})).toThrow();
 expect(validateSharedRecord({kind:'progress',bookId,key:'',value:progress(0,false)}).value).toEqual(progress(0,false));
});
it('AI-related actual bookmarks merge by recency, while ordinary progress retains conflict handling',async()=>{
 expect(await chooseAiReadingProgress(progress(1),progress(2))).toBe('remote');expect(await chooseAiReadingProgress(progress(2),progress(1))).toBe('local');
 expect(await chooseAiReadingProgress(progress(2,false),progress(1))).toBe('local');expect(await chooseAiReadingProgress(progress(1),progress(2,false))).toBe('remote');
 expect(await chooseAiReadingProgress(progress(1,false),progress(2,false))).toBeUndefined();expect(await chooseAiReadingProgress(progress(2),{...progress(1),revision:2})).toBeUndefined();
});
it.each([0,2])('CAS sync converges dirty devices to the latest actual reading timestamp (remote index %s)',async remoteOrder=>{
 await db.progress.put(progress(1));let revision=1;const record:SharedRecord={kind:'progress',bookId,key:'',value:progress(remoteOrder)},id=await sharedRecordId(record),rows=new Map([[id,{id,revision,record}]]);
 vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  const url=new URL(input,location.origin);
  if(init?.method==='PUT'){const body=JSON.parse(String(init.body)),old=rows.get(body.id);if((old?.revision??0)!==body.baseRevision)return Response.json({row:old},{status:409});const row={id:body.id,revision:++revision,record:validateSharedRecord(body.record)};rows.set(body.id,row);return Response.json({row});}
  const scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0);return Response.json({rows:[...rows.values()].filter(r=>(r.record.bookId??'')===scope&&r.revision>after),cursor:revision,more:false});
 }));
 await syncSharedState();const expected=progress(Math.max(1,remoteOrder));expect(await db.progress.get(bookId)).toEqual(expected);expect(rows.get(id)?.record.value).toEqual(expected);expect((await readSharedReplica()).conflicts).toEqual({});
});

it('sync publishes a new actual observation at the same position exactly once',async()=>{
 await db.progress.put({...progress(0),updatedAt:100});let revision=0;const rows=new Map<string,{id:string;revision:number;record:SharedRecord}>(),puts:SharedRecord[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  const url=new URL(input,location.origin);
  if(init?.method==='PUT'){const body=JSON.parse(String(init.body)),record=validateSharedRecord(body.record),old=rows.get(body.id);if((old?.revision??0)!==body.baseRevision)return Response.json({row:old},{status:409});const row={id:body.id,revision:++revision,record};rows.set(body.id,row);puts.push(record);return Response.json({row});}
  const scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0);return Response.json({rows:[...rows.values()].filter(r=>(r.record.bookId??'')===scope&&r.revision>after),cursor:revision,more:false});
 }));
 await syncSharedState();await syncSharedState();const before=puts.filter(r=>r.kind==='progress').length;
 await db.progress.update(bookId,{updatedAt:200});await syncSharedState();
 const written=puts.filter(r=>r.kind==='progress');expect(written).toHaveLength(before+1);expect(written.at(-1)?.value).toMatchObject({updatedAt:200,reading:true});
 await syncSharedState();expect(puts.filter(r=>r.kind==='progress')).toHaveLength(before+1);
});
it('cleanup keeps the observation timestamp and cannot overwrite a newer or different live chapter',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(10);const observed=readingObservationTime();expect(readingObservationTime(observed)).toBe(11);
 await saveReadingProgress({...progress(0),updatedAt:observed});await saveReadingProgress({...progress(1),updatedAt:20});
 vi.spyOn(Date,'now').mockReturnValue(30);
 expect(await saveReadingProgress({...progress(0),updatedAt:observed})).toBe(false);
 expect(await saveReadingProgress({...progress(0),updatedAt:20},()=>false)).toBe(false);
 expect(await db.progress.get(bookId)).toMatchObject({chapterId:chapters[1].id,updatedAt:20});
});
