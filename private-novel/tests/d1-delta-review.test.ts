import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {SHARED_STATE_KEY,readSharedReplica,sharedSyncStatus,syncSharedState,type SharedStateRow} from '../src/features/sync-cloud/services/shared-state-sync';
import {sharedRecordId,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';

// Independent protocol model: exposes only current row metadata to discovery.
const bookId='review-delta-book',origin='https://delta-review.test';
let revision:number,rows:Map<string,SharedStateRow>,calls:URL[],badPage:((after:number,until:number)=>unknown)|undefined;
async function seed(record:SharedRecord){const id=await sharedRecordId(record);rows.set(id,{id,revision:++revision,record});return revision;}
const name=(key:string,value:string|null):SharedRecord=>({kind:'name',bookId,key,value});
beforeEach(async()=>{
 await db.delete();await db.open();revision=0;rows=new Map();calls=[];badPage=undefined;
 vi.stubGlobal('location',{origin});
 vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  const url=new URL(input,origin);calls.push(url);
  if(init?.method==='PUT'){
   const body=JSON.parse(init.body as string),previous=rows.get(body.id);
   if(body.baseRevision!==(previous?.revision??0))return Response.json({row:previous},{status:409});
   await seed(body.record);return Response.json({row:rows.get(body.id)});
  }
  if(url.searchParams.has('head'))return Response.json({changesV1:true,revision});
  const after=Number(url.searchParams.get('after')??0);
  if(url.searchParams.has('changes')){
   const until=Number(url.searchParams.get('until'));
   if(badPage)return Response.json(badPage(after,until));
   const changes=[...rows.values()].filter(r=>r.revision>after&&r.revision<=until).sort((a,b)=>a.revision-b.revision).slice(0,100).map(r=>({scope:r.record.bookId??'',revision:r.revision}));
   const more=changes.length===100;return Response.json({changesV1:true,revision:until,changes,more,cursor:more?changes.at(-1)!.revision:until});
  }
  const scope=url.searchParams.get('book')??'',page=[...rows.values()].filter(r=>(r.record.bookId??'')===scope&&r.revision>after).sort((a,b)=>a.revision-b.revision).slice(0,99),more=page.length===99;
  return Response.json({rows:page,more,cursor:more?page.at(-1)!.revision:revision});
 }));
 await db.books.put({id:bookId,title:'Synthetic',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:0,charCount:0});
 await syncSharedState();await syncSharedState();calls=[];
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('a checkpoint transaction failure preserves committed records and retries from the old discovery point',async()=>{
 const before=(await readSharedReplica()).changeCursor!;await seed(name('甲','Remote'));
 const put=db.settings.put.bind(db.settings);let injected=false;
 vi.spyOn(db.settings,'put').mockImplementation((...args:Parameters<typeof put>)=>{
  const candidate=args[0];
  if(!injected&&candidate.key===SHARED_STATE_KEY&&((candidate.value as {changeCursor?:number}).changeCursor??0)>before){injected=true;throw Error('review checkpoint transaction failure');}
  return put(...args);
 });
 await syncSharedState();expect(injected).toBe(true);expect(sharedSyncStatus().state).toBe('local');
 expect((await readSharedReplica()).changeCursor).toBe(before);expect((await db.names.where('bookId').equals(bookId).first())?.value).toBe('Remote');
 vi.restoreAllMocks();calls=[];await syncSharedState();
 expect(calls.some(url=>url.searchParams.has('changes')&&Number(url.searchParams.get('after'))===before)).toBe(true);
 expect((await readSharedReplica()).changeCursor).toBeGreaterThan(before);expect(await db.names.count()).toBe(1);expect(sharedSyncStatus().state).toBe('synced');
});

it.each(['duplicate-revision','control-scope','short-more-page','premature-end','out-of-range'] as const)('malformed %s discovery leaves the checkpoint and local rows untouched',async fault=>{
 const before=(await readSharedReplica()).changeCursor!;await seed(name('甲','Remote'));await seed(name('乙','Other'));
 badPage=(after,until)=>{
  const page={changesV1:true,revision:until,changes:[{scope:bookId,revision:after+1}],more:false,cursor:until};
  if(fault==='duplicate-revision')page.changes.push({...page.changes[0]});
  if(fault==='control-scope')page.changes[0].scope='bad\u0000scope';
  if(fault==='short-more-page'){page.more=true;page.cursor=after+1;}
  if(fault==='premature-end')page.cursor=until-1;
  if(fault==='out-of-range')page.changes[0].revision=until+1;
  return page;
 };
 await syncSharedState();expect(sharedSyncStatus().state).toBe('local');expect((await readSharedReplica()).changeCursor).toBe(before);expect(await db.names.count()).toBe(0);
 expect(calls.some(url=>url.searchParams.has('book'))).toBe(false);
 badPage=undefined;await syncSharedState();expect(await db.names.count()).toBe(2);
});

it('observed competing local edits retain conflict choices while the discovery checkpoint advances',async()=>{
 await db.names.put({id:'local-name',bookId,key:'甲',value:'Offline'});const remoteRevision=await seed(name('甲','Remote'));
 await syncSharedState();const replica=await readSharedReplica(),id=await sharedRecordId(name('甲','Remote'));
 expect((await db.names.get('local-name'))?.value).toBe('Offline');expect(replica.conflicts[id].revision).toBe(remoteRevision);expect(replica.changeCursor).toBe(remoteRevision);expect(sharedSyncStatus().state).toBe('conflict');
 calls=[];await syncSharedState();expect(calls.map(url=>url.search)).toEqual(['?head=1']);expect((await readSharedReplica()).conflicts[id].record.value).toBe('Remote');
});
