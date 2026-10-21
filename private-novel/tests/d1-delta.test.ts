import 'fake-indexeddb/auto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {D1Database} from '@cloudflare/workers-types';
import {db} from '../src/core/db';
import {readSharedReplica,syncSharedState,sharedSyncStatus} from '../src/features/sync-cloud/services/shared-state-sync';
import {sharedRecordId,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {handleSharedState} from '../server/shared-state';

const origin='https://delta.test',a='book-a',b='book-b';
class NativeD1 {
 native=new DatabaseSync(':memory:');queries:string[]=[];
 constructor(){for(const name of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0010_shared_state.sql','0013_shared_state_read_indexes.sql'])this.native.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));}
 prepare(sql:string){this.queries.push(sql);const fixture=this;let params:any[]=[];return {bind(...next:any[]){if(next.length>100)throw Error('Too many bindings');params=next;return this;},execute(){const s=fixture.native.prepare(sql);return {results:s.columns().length?s.all(...params):(s.run(...params),[]),success:true};},async first(){return this.execute().results[0]??null;},async all(){return this.execute();}};}
 async batch(statements:ReturnType<NativeD1['prepare']>[]){this.native.exec('BEGIN');try{const result=statements.map(s=>s.execute());this.native.exec('COMMIT');return result;}catch(error){this.native.exec('ROLLBACK');throw error;}}
 ready(id:string){this.native.prepare("INSERT OR IGNORE INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) VALUES(?,'Synthetic',?,1,'ready',?,1)").run(id,'a'.repeat(64),'synthetic/'+id);}
}
let server:NativeD1,calls:string[],legacy:boolean,afterGet:((url:URL)=>Promise<void>)|undefined,failGet:((url:URL)=>boolean)|undefined;
const name=(bookId:string,key:string,value:string|null):SharedRecord=>({kind:'name',bookId,key,value});
async function remote(record:SharedRecord){
 const id=await sharedRecordId(record),json=JSON.stringify(record),revision=(server.native.prepare('SELECT revision FROM shared_state_meta').get()!.revision as number)+1;
 if(server.native.prepare('SELECT id FROM shared_state WHERE id=?').get(id))server.native.prepare('UPDATE shared_state SET record=?,revision=?,deleted=?,bytes=? WHERE id=?').run(json,revision,record.value===null?1:0,new TextEncoder().encode(json).length,id);
 else server.native.prepare('INSERT INTO shared_state(id,scope,kind,entity_key,record,revision,deleted,bytes) VALUES(?,?,?,?,?,?,?,?)').run(id,record.bookId??'',record.kind,record.key,json,revision,record.value===null?1:0,new TextEncoder().encode(json).length);
 server.native.prepare('UPDATE shared_state_meta SET revision=?').run(revision);return revision;
}
async function ready(ids:string[]){for(const id of ids)server.ready(id);await db.books.bulkPut(ids.map(id=>({id,title:'Synthetic',author:'',status:'ready' as const,chapterCount:0,charCount:0,createdAt:1,updatedAt:1})));}
async function settled(ids=[a,b]){await ready(ids);await syncSharedState();await syncSharedState();calls=[];server.queries=[];}
beforeEach(async()=>{
 await db.delete();await db.open();server=new NativeD1();calls=[];legacy=false;afterGet=undefined;failGet=undefined;vi.stubGlobal('location',{origin});
 vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  const url=new URL(input,origin);calls.push((init?.method??'GET')+' '+url.search);
  if(failGet?.(url)&&init?.method!=='PUT')return Response.json({error:'synthetic_failure'},{status:503});
  const actual=new URL(url);if(legacy){actual.searchParams.delete('head');actual.searchParams.delete('changes');}
  const response=await handleSharedState(new Request(actual,init),{DB:server as unknown as D1Database});
  if(init?.method!=='PUT')await afterGet?.(url);return response;
 }));
});
afterEach(()=>{server.native.close();vi.restoreAllMocks();vi.unstubAllGlobals();});

it('144 idle books use one head query; changing one book only pulls that scope',async()=>{
 const ids=Array.from({length:144},(_,i)=>'book-'+i);await settled(ids);
 await syncSharedState();expect(calls).toEqual(['GET ?head=1']);expect(server.queries).toEqual(['SELECT revision FROM shared_state_meta WHERE id=1']);
 await remote(name(ids[37],'甲','Remote'));calls=[];await syncSharedState();
 expect(calls.filter(c=>c.startsWith('GET')&&!c.includes('head=')&&!c.includes('changes='))).toEqual(['GET ?book=book-37&after='+((await readSharedReplica()).cursors[ids[0]])]);
 expect((await db.names.where('bookId').equals(ids[37]).first())?.value).toBe('Remote');
});
it('newly ready scope loads history even when the shared head has not changed',async()=>{
 await settled([a]);server.ready(b);await remote(name(b,'乙','Before import'));await syncSharedState();const checkpoint=(await readSharedReplica()).changeCursor;
 await ready([b]);calls=[];await syncSharedState();expect(calls).toContain('GET ?book=book-b&after=0');expect((await db.names.where('bookId').equals(b).first())?.value).toBe('Before import');expect((await readSharedReplica()).changeCursor).toBe(checkpoint);
});
it('a scope updated after its bootstrap pull is found on the next pass',async()=>{
 await ready([a,b]);await remote(name(a,'甲','Before'));await remote(name(b,'乙','Other'));
 let changed=false;afterGet=async url=>{if(!changed&&url.searchParams.get('book')===a){changed=true;await remote(name(a,'甲','After'));}};
 await syncSharedState();expect((await db.names.where('bookId').equals(a).first())?.value).toBe('Before');
 afterGet=undefined;await syncSharedState();expect((await db.names.where('bookId').equals(a).first())?.value).toBe('After');
});
it('a latest row moved beyond the fixed head between discovery pages is caught next pass',async()=>{
 await settled();for(let i=0;i<100;i++)await remote(name(a,'N'+i,'Name'));await remote(name(b,'late','Old'));
 let moved=false;afterGet=async url=>{if(!moved&&url.searchParams.has('changes')){moved=true;await remote(name(b,'late','New'));}};
 await syncSharedState();expect(await db.names.where('bookId').equals(b).count()).toBe(0);
 afterGet=undefined;await syncSharedState();expect((await db.names.where('bookId').equals(b).first())?.value).toBe('New');
});
it.each(['discovery','scope'])('a failed second %s page retains checkpoint and resumes without losing rows',async failure=>{
 await settled();const before=(await readSharedReplica()).changeCursor!;for(let i=0;i<121;i++)await remote(name(a,'N'+i,'Name '+i));
 let matches=0;failGet=url=>{const target=failure==='discovery'?url.searchParams.has('changes'):url.searchParams.get('book')===a;return target&&++matches===2;};
 await syncSharedState();expect(sharedSyncStatus().state).toBe('local');expect((await readSharedReplica()).changeCursor).toBe(before);
 failGet=undefined;await syncSharedState();expect(await db.names.where('bookId').equals(a).count()).toBe(121);expect((await readSharedReplica()).changeCursor).toBeGreaterThan(before);
});
it('discovery includes tombstones, preserving deletion instead of recreating the old Name',async()=>{
 await settled();await remote(name(a,'甲','Name'));await syncSharedState();await remote(name(a,'甲',null));await syncSharedState();expect(await db.names.where('bookId').equals(a).count()).toBe(0);
 const stored=server.native.prepare("SELECT record FROM shared_state WHERE scope=? AND kind='name'").get(a)!;expect(JSON.parse(stored.record as string).value).toBeNull();
});
it('old server response falls back to per-scope synchronization without saving a discovery cursor',async()=>{
 legacy=true;await ready([a,b]);await remote(name(b,'乙','Legacy'));await syncSharedState();expect((await db.names.where('bookId').equals(b).first())?.value).toBe('Legacy');expect((await readSharedReplica()).changeCursor).toBeUndefined();
 calls=[];await syncSharedState();expect(calls.some(c=>c.includes('book=book-a'))).toBe(true);expect(calls.some(c=>c.includes('book=book-b'))).toBe(true);
});
it('rejects malformed advertised discovery without advancing the checkpoint',async()=>{
 await settled();const before=(await readSharedReplica()).changeCursor;await remote(name(a,'甲','Name'));const real=fetch;
 vi.stubGlobal('fetch',async(input:string,init?:RequestInit)=>input.includes('changes=1')?Response.json({changesV1:true,revision:999999,cursor:999999,more:false,changes:[]}):real(input,init));
 await syncSharedState();expect(sharedSyncStatus().state).toBe('local');expect((await readSharedReplica()).changeCursor).toBe(before);expect(await db.names.count()).toBe(0);
});
it('discovery is bounded and rejects a future checkpoint, retaining the old GET protocol',async()=>{
 await settled();const head=Number(server.native.prepare('SELECT revision FROM shared_state_meta').get()!.revision);
 const get=(q:string)=>handleSharedState(new Request(origin+'/api/state'+q),{DB:server as unknown as D1Database});
 expect((await get('?changes=1&after=0&until='+(head+1))).status).toBe(400);
 expect((await get('?changes=1&after=0')).status).toBe(400);expect((await get('?head=1&book=book-a')).status).toBe(400);
 expect(await (await get('?after=0')).json()).toHaveProperty('rows');
});
it('SQL discovery reads a covering index and catalog JOIN uses the dedicated book index',()=>{
 const discovery=server.native.prepare('EXPLAIN QUERY PLAN SELECT scope,revision FROM shared_state WHERE revision>? AND revision<=? ORDER BY revision LIMIT 100').all(0,100).map(r=>r.detail).join('\n');
 expect(discovery).toContain('COVERING INDEX shared_state_change_scan');
 const source=readFileSync(new URL('../server/cloud-library.ts',import.meta.url),'utf8'),query=/env.SHARED_STATE_ENABLED==='1'\?"([^"]+)"/.exec(source)![1];
 const plan=server.native.prepare('EXPLAIN QUERY PLAN '+query).all('',101).map(r=>r.detail).join('\n');expect(plan).toContain('shared_state_book_catalog');
 const before=server.native.prepare('SELECT * FROM shared_state_meta').get();server.native.exec(readFileSync(new URL('../migrations/0013_shared_state_read_indexes.sql',import.meta.url),'utf8'));expect(server.native.prepare('SELECT * FROM shared_state_meta').get()).toEqual(before);
});
