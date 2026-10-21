import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {sharedRecordId,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {readSharedReplica,SHARED_STATE_KEY,sharedSyncStatus,syncSharedState,type SharedStateRow} from '../src/features/sync-cloud/services/shared-state-sync';

const bookId='independent-name-batch',origin='https://independent-name.example';
const book:SharedRecord={kind:'book',bookId,key:'',value:{title:'Synthetic',author:''}};
const name=(key:string,value:string|null):SharedRecord=>({kind:'name',bookId,key,value});
let events:SharedRecord[],eventTransactions:unknown[],puts:number;
async function row(record:SharedRecord,revision:number):Promise<SharedStateRow>{return {record,revision,id:await sharedRecordId(record)};}
function connect(rows:SharedStateRow[],cursor:number){
 vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  if(init?.method==='PUT'){puts++;return Response.json({error:'fixture forbids writes'},{status:503});}
  const url=new URL(input,origin),scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0);
  return Response.json({rows:scope===bookId?rows.filter(r=>r.revision>after):[],cursor,more:false});
 }));
}
beforeEach(async()=>{
 vi.stubGlobal('location',{origin});vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}});
 events=[];eventTransactions=[];puts=0;
 vi.stubGlobal('CustomEvent',class extends Event {detail:SharedRecord|undefined;constructor(type:string,options?:{detail:SharedRecord}){super(type);this.detail=options?.detail;}});
 vi.stubGlobal('window',{dispatchEvent:(event:{type:string;detail:SharedRecord})=>{if(event.type==='shared-state-applied'){events.push(event.detail);eventTransactions.push(Dexie.currentTransaction);}return true;}});
 await db.delete();await db.open();await db.books.put({id:bookId,title:'Synthetic',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:0,charCount:0});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('skips an older Name revision without erasing the newer baseline or emitting an event',async()=>{
 const bookRow=await row(book,1),latest=await row(name('甲','Latest'),3);
 connect([bookRow,latest],3);await syncSharedState();expect(sharedSyncStatus().state).toBe('synced');
 const before=await readSharedReplica();events=[];
 // A validated replay can carry a stale row even though its page cursor is newer.
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>Response.json({rows:new URL(input,origin).searchParams.get('book')===bookId?[await row(name('甲','Stale'),2),await row(name('乙','Fresh'),4)]:[],cursor:4,more:false})));
 await syncSharedState();
 expect((await db.names.where('[bookId+key]').equals([bookId,'甲']).first())?.value).toBe('Latest');
 expect((await readSharedReplica()).base[latest.id]).toEqual(before.base[latest.id]);
 expect(events.map(r=>r.key)).toEqual(['乙']);expect(puts).toBe(0);
});

it.each(['scope','id'] as const)('rejects a later invalid %s row before applying any Name from that page',async invalid=>{
 connect([await row(book,1)],1);await syncSharedState();const before=await readSharedReplica();events=[];
 const first=await row(name('甲','Valid'),2),last=await row(invalid==='scope'?{kind:'name',bookId:'foreign',key:'乙',value:'Invalid'}:name('乙','Invalid'),3);
 if(invalid==='id')last.id='a'.repeat(64);
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>Response.json({rows:new URL(input,origin).searchParams.get('book')===bookId?[first,last]:[],cursor:3,more:false})));
 await syncSharedState();expect(await db.names.count()).toBe(0);expect((await readSharedReplica()).base).toEqual(before.base);expect((await readSharedReplica()).cursors[bookId]).toBe(1);expect(events).toEqual([]);expect(sharedSyncStatus().state).toBe('local');
});

it('keeps an entire Name group out of a book removed after snapshot preparation',async()=>{
 connect([await row(book,1)],1);await syncSharedState();connect([await row(name('甲','A'),2),await row(name('乙','B'),3)],3);
 const get=db.settings.get.bind(db.settings);let removed=false;
 vi.spyOn(db.settings,'get').mockImplementation((...args:Parameters<typeof get>)=>{
  if((args[0] as unknown)===SHARED_STATE_KEY&&!removed&&Dexie.currentTransaction?.mode==='readwrite'&&Dexie.currentTransaction.storeNames.includes('names')){removed=true;return db.books.delete(bookId).then(()=>get(...args));}
  return get(...args);
 });
 await syncSharedState();expect(removed).toBe(true);expect(await db.names.count()).toBe(0);expect(Object.keys((await readSharedReplica()).conflicts)).toHaveLength(2);expect(events).toEqual([]);expect(puts).toBe(0);
});

it('emits Names and non-Name events in page order only after commits and emits nothing for a rolled-back group',async()=>{
 connect([await row(book,1)],1);await syncSharedState();
 connect([await row(name('甲','A'),2),await row({...book,value:{title:'Updated',author:''}},3),await row(name('乙','B'),4)],4);
 await syncSharedState();expect(events.map(r=>r.kind+':'+r.key)).toEqual(['name:甲','book:','name:乙']);expect(eventTransactions.every(t=>!t)).toBe(true);
 events=[];connect([await row(name('丙','C'),5),await row(name('丁','D'),6)],6);
 const put=db.settings.put.bind(db.settings);
 vi.spyOn(db.settings,'put').mockImplementation((...args:Parameters<typeof put>)=>{if(args[0].key===SHARED_STATE_KEY&&Object.keys((args[0].value as any).base).length>3)throw Error('synthetic batch rollback');return put(...args);});
 await syncSharedState();expect(await db.names.count()).toBe(2);expect(events).toEqual([]);expect((await readSharedReplica()).cursors[bookId]).toBe(4);
});
