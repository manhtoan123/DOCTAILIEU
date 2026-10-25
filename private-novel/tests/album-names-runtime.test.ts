import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it} from 'vitest';
import type {D1Database} from '@cloudflare/workers-types';
import {handleSharedState} from '../server/shared-state';
import {sharedRecordId,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {albumNameKey} from '../src/features/names-convert/services/album-name-schema';

class SqliteD1{
 native=new DatabaseSync(':memory:');
 constructor(){for(const name of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0010_shared_state.sql'])this.native.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));}
 prepare(sql:string){const fixture=this;let params:any[]=[];return {bind(...values:any[]){params=values;return this;},execute(){const stmt=fixture.native.prepare(sql);return {success:true,results:stmt.columns().length?stmt.all(...params):(stmt.run(...params),[])};},async first(){return this.execute().results[0]??null;},async all(){return this.execute();}};}
 async batch(statements:ReturnType<SqliteD1['prepare']>[]){this.native.exec('BEGIN');try{const result=statements.map(s=>s.execute());this.native.exec('COMMIT');return result;}catch(e){this.native.exec('ROLLBACK');throw e;}}
}
let database:SqliteD1;
beforeEach(()=>{database=new SqliteD1();});afterEach(()=>database.native.close());
const handle=(request:Request)=>handleSharedState(request,{DB:database as unknown as D1Database});
const entry=(album:string,key:string,value:string|null):SharedRecord=>({kind:'album-name',key:albumNameKey(album,key),value});
async function put(record:SharedRecord,baseRevision=0){return handle(new Request('https://fixture.invalid/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:await sharedRecordId(record),baseRevision,record})}));}

it('production handler persists independent Album keys, pages them globally and CAS protects stale edits/tombs',async()=>{
 const a=entry('Author','甲','Tên A'),b=entry('Other','甲','Tên B');
 const first=await put(a);expect(first.status).toBe(200);const row=(await first.json()).row;
 expect((await put(b)).status).toBe(200);
 const stale=await put({...a,value:'Stale'},0);expect(stale.status).toBe(409);expect((await stale.json()).row.record).toEqual(a);
 const deleted=await put({...a,value:null},row.revision);expect(deleted.status).toBe(200);
 const get=await handle(new Request('https://fixture.invalid/api/state?after=0'));expect(get.status).toBe(200);
 const body=await get.json();expect(body.rows.map((r:any)=>r.record)).toEqual(expect.arrayContaining([{...a,value:null},b]));expect(body.more).toBe(false);
 expect((await put(a,row.revision)).status).toBe(409);
 expect(database.native.prepare('SELECT row_count FROM shared_state_meta').get()?.row_count).toBe(2);
});
it('rejects malformed Album identity and book ownership before any SQL publication',async()=>{
 for(const record of [{...entry('A','甲','Name'),bookId:'book'},{...entry('A','甲','Name'),key:'["A/Series","甲"]'},{...entry('A','甲','Name'),key:'["A","a=b"]'}])expect((await put(record)).status).toBe(400);
 expect(database.native.prepare('SELECT COUNT(*) AS n FROM shared_state').get()?.n).toBe(0);
});
