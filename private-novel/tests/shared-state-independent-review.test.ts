import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import type {D1Database,R2Bucket} from '@cloudflare/workers-types';
import {handleSharedState} from '../server/shared-state';
import {handleCloudLibrary} from '../server/cloud-library';
import {sharedRecordId,validateSharedRecord,SHARED_STATE_MAX_BYTES,SHARED_STATE_MAX_ROWS,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';

// Execute the production SQL with SQLite transactions; hooks model writes at
// the two read/write boundaries outside a D1 batch, never inside its transaction.
class NativeD1 {
 native=new DatabaseSync(':memory:');
 beforeBatch?:()=>void;
 beforePageRead?:()=>void;
 failAfterWrite=false;
 constructor(shared=true){for(const name of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql',...(shared?['0010_shared_state.sql']:[])])this.native.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));}
 prepare(sql:string){const fixture=this;let params:any[]=[];return {sql,bind(...next:any[]){if(next.length>100)throw Error('D1 maximum bound parameters per query: 100');params=next;return this;},execute(){const statement=fixture.native.prepare(sql);return {results:statement.columns().length?statement.all(...params):(statement.run(...params),[]),success:true};},async first(){return this.execute().results[0]??null;},async all(){if(sql.startsWith('SELECT * FROM shared_state WHERE id IN')){const hook=fixture.beforePageRead;fixture.beforePageRead=undefined;hook?.();}return this.execute();}};}
 async batch(statements:ReturnType<NativeD1['prepare']>[]){const hook=this.beforeBatch;this.beforeBatch=undefined;hook?.();this.native.exec('BEGIN');try{const result=statements.map((s,index)=>{const result=s.execute();if(this.failAfterWrite&&index===1){this.failAfterWrite=false;throw Error('synthetic batch interruption after write');}return result;});this.native.exec('COMMIT');return result;}catch(error){this.native.exec('ROLLBACK');throw error;}}
 ready(id='book'){this.native.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) VALUES(?,'Synthetic',?,1,'ready',?,1)").run(id,'a'.repeat(64),`synthetic/${id}`);}
 close(){this.native.close();}
}
let server:NativeD1;
const name=(key='甲',value:string|null='Tên',bookId?:string):SharedRecord=>({kind:bookId?'name':'common-name',...(bookId?{bookId}:{}),key,value});
const handle=(request:Request)=>handleSharedState(request,{DB:server as unknown as D1Database});
async function put(record:SharedRecord,baseRevision=0,id?:string){return handle(new Request('https://synthetic.example/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id??await sharedRecordId(record),baseRevision,record})}));}
const get=(query='')=>handle(new Request(`https://synthetic.example/api/state${query}`));
async function seed(record:SharedRecord,revision:number){const id=await sharedRecordId(record),json=JSON.stringify(record);server.native.prepare('INSERT INTO shared_state(id,scope,kind,entity_key,record,revision,deleted,bytes) VALUES(?,?,?,?,?,?,?,?)').run(id,record.bookId??'',record.kind,record.key,json,revision,record.value===null?1:0,new TextEncoder().encode(json).length);server.native.prepare('UPDATE shared_state_meta SET revision=MAX(revision,?)').run(revision);return id;}
function ledger(){return server.native.prepare('SELECT revision,used_bytes,row_count FROM shared_state_meta WHERE id=1').get() as {revision:number;used_bytes:number;row_count:number};}
function actualUsage(){return server.native.prepare('SELECT COALESCE(SUM(bytes),0) AS used_bytes,COUNT(*) AS row_count FROM shared_state').get() as {used_bytes:number;row_count:number};}
function expectExactLedger(){expect(ledger()).toMatchObject(actualUsage());}
function appendRecord(kind:'chapter-append'|'chapter-append-packet',text='New suffix'):SharedRecord{
 const id='00000000-0000-4000-8000-000000000099';
 return validateSharedRecord(kind==='chapter-append-packet'?{kind,bookId:'book',key:id+':0',value:{version:1,updateId:id,index:0,chapters:[{id:'append-chapter',bookId:'book',order:3,title:'New',text,revision:1,sourceId:'append-source'}]}}:{kind,bookId:'book',key:id,value:{version:1,baseSha256:'a'.repeat(64),anchor:{id:'old-tail',revision:1,order:2,hash:'b'.repeat(64),count:3},source:{id:'append-source',name:text+'.txt',relativePath:'full.txt',encoding:'utf-8',sha256:'c'.repeat(64),bytes:100},parts:[{key:id+':0',hash:'d'.repeat(64),count:1,chars:10}],count:1,chars:10}});
}
beforeEach(()=>{server=new NativeD1();});
afterEach(()=>server.close());

describe('independent shared-state SQLite regressions',()=>{
 it.each(['chapter-append','chapter-append-packet'] as const)('immutable %s accepts identical replay and refuses fresh/zero-base overwrite without changing quota',async kind=>{
  server.ready();const record=appendRecord(kind),created=await put(record);expect(created.status).toBe(200);const row=(await created.json()).row,saved=ledger();
  for(const revision of [0,row.revision]){const replay=await put(record,revision);expect(replay.status).toBe(200);expect((await replay.json()).row).toEqual(row);const overwrite=await put(appendRecord(kind,'Different suffix'),revision);expect(overwrite.status).toBe(409);expect((await overwrite.json()).row).toEqual(row);expect(ledger()).toEqual(saved);}
  expect(server.native.prepare('SELECT record FROM shared_state WHERE id=?').get(row.id)?.record).toBe(JSON.stringify(record));expectExactLedger();
 });
 it.each(['chapter-append','chapter-append-packet'] as const)('immutable %s cannot overwrite a concurrent insert between preflight and the SQL batch',async kind=>{
  server.ready();const record=appendRecord(kind),other=appendRecord(kind,'Concurrent winner'),id=await sharedRecordId(record),json=JSON.stringify(other);
  server.beforeBatch=()=>{server.native.prepare('INSERT INTO shared_state(id,scope,kind,entity_key,record,revision,deleted,bytes) VALUES(?,?,?,?,?,1,0,?)').run(id,'book',kind,other.key,json,new TextEncoder().encode(json).length);server.native.exec('UPDATE shared_state_meta SET revision=1');};
  expect((await put(record,1)).status).not.toBe(200);expect(server.native.prepare('SELECT record FROM shared_state WHERE id=?').get(id)?.record).toBe(json);expectExactLedger();
 });
 it.each(['chapter-append','chapter-append-packet'] as const)('%s rechecks cloud deletion inside its publication transaction',async kind=>{
  server.ready();server.beforeBatch=()=>{server.native.prepare('INSERT INTO cloud_book_deletions VALUES(?,1)').run('book');};expect((await put(appendRecord(kind))).status).toBe(410);expect(server.native.prepare('SELECT COUNT(*) AS n FROM shared_state').get()?.n).toBe(0);expectExactLedger();
 });
 it('append manifests reject a different base and recheck the base SHA inside the SQL transaction',async()=>{
  server.ready();const record=appendRecord('chapter-append');expect((await put({...record,value:{...record.value as object,baseSha256:'f'.repeat(64)}})).status).toBe(409);
  server.beforeBatch=()=>{server.native.prepare('UPDATE cloud_books SET sha256=? WHERE id=?').run('f'.repeat(64),'book');};expect((await put(record)).status).not.toBe(200);expect(server.native.prepare('SELECT COUNT(*) AS n FROM shared_state').get()?.n).toBe(0);expectExactLedger();
 });
 it('same-base edits have one winner; stale/zero-base writes preserve tombstones',async()=>{
  const created=await put(name());expect(created.status).toBe(200);const base=(await created.json()).row.revision;
  const concurrent=await Promise.all([put(name('甲','A'),base),put(name('甲','B'),base)]);expect(concurrent.map(r=>r.status).sort()).toEqual([200,409]);
  const row=(await (await get()).json()).rows[0];const deleted=await put(name('甲',null),row.revision);expect(deleted.status).toBe(200);const tombstone=(await deleted.json()).row;
  for(const revision of [0,base,row.revision]){const response=await put(name('甲','stale'),revision);expect(response.status).toBe(409);expect((await response.json()).row).toEqual(tombstone);}
  expect((await put(name('甲','explicit restore'),tombstone.revision)).status).toBe(200);
  expectExactLedger();expect(ledger().row_count).toBe(1);
 });
 it('a tombstone created first is a persistent CAS row, rather than a missing row',async()=>{
  const deleted=await put(name('missing',null));expect(deleted.status).toBe(200);const row=(await deleted.json()).row;
  expect((await put(name('missing','offline create'))).status).toBe(409);
  const delta=await (await get()).json();expect(delta.rows).toEqual([row]);expect(delta.cursor).toBeGreaterThanOrEqual(row.revision);
 });
 it('SQL rechecks cloud deletion after preflight; GET and all late writes stay deleted',async()=>{
  server.ready();const created=await put(name('甲','before','book'));expect(created.status).toBe(200);const row=(await created.json()).row;
  server.beforeBatch=()=>{server.native.prepare('INSERT INTO cloud_book_deletions VALUES(?,1)').run('book');};
  expect((await put(name('甲','late','book'),row.revision)).status).toBe(410);
  expect(server.native.prepare('SELECT record FROM shared_state WHERE id=?').get(row.id)?.record).toBe(JSON.stringify(row.record));
  expect((await put(name('new','late create','book'))).status).toBe(410);expect((await get('?book=book')).status).toBe(410);
  server.ready('pending');server.native.exec("UPDATE cloud_books SET state='pending' WHERE id='pending'");expect((await put(name('甲','not ready','pending'))).status).toBe(425);
 });
 it('failed SQL batch rolls back its global revision and its row write',async()=>{
  server.native.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON shared_state BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  expect((await put(name())).status).toBe(503);expect(server.native.prepare('SELECT revision FROM shared_state_meta').get()?.revision).toBe(0);expect(server.native.prepare('SELECT COUNT(*) AS n FROM shared_state').get()?.n).toBe(0);
  expect(ledger()).toEqual({revision:0,used_bytes:0,row_count:0});
 });
 it('interruption after a successful trigger charge rolls back record and both counters',async()=>{
  server.failAfterWrite=true;expect((await put(name('create','漢😀'))).status).toBe(503);expect(ledger()).toEqual({revision:0,used_bytes:0,row_count:0});expectExactLedger();
  const created=await put(name('edit','old'));expect(created.status).toBe(200);const row=(await created.json()).row,before=ledger();
  server.failAfterWrite=true;expect((await put(name('edit','漢😀'.repeat(500)),row.revision)).status).toBe(503);expect(ledger()).toEqual(before);expect(server.native.prepare('SELECT record FROM shared_state WHERE id=?').get(row.id)?.record).toBe(JSON.stringify(row.record));expectExactLedger();
 });
 it('ID hashes separate kind, scope and delimiter-like keys, rejecting supplied collisions',async()=>{
  server.ready('book');const records=[name('constructor'),name('__proto__'),name('a:b'),name('b','Tên','book'),{kind:'convert-name',key:'a:b',value:'Tên'} as SharedRecord];
  const ids=await Promise.all(records.map(sharedRecordId));expect(new Set(ids).size).toBe(records.length);
  for(const record of records)expect((await put(record)).status).toBe(200);
  expect((await put(name('different'),0,ids[0])).status).toBe(400);
  expect((await put({...records[0],kind:'convert-name'},0,ids[0])).status).toBe(400);
  expect((await get('?after=-1')).status).toBe(400);expect((await get('?after=1.5')).status).toBe(400);
 });
 it('count pagination consumes every current revision, including tombstones and other scopes',async()=>{
  server.ready();for(let i=1;i<=105;i++)await seed(name(`k${i}`,i===104?null:'value'),i);await seed(name('book','value','book'),106);
  const response=await get();expect(response.status).toBe(200);const first=await response.json();expect(first.rows.length).toBeLessThan(105);expect(first.rows.length).toBeGreaterThan(0);expect(first.more).toBe(true);expect(first.cursor).toBe(first.rows.at(-1).revision);
  const last=await (await get(`?after=${first.cursor}`)).json();expect(first.rows.length+last.rows.length).toBe(105);expect(last.more).toBe(false);expect(last.cursor).toBe(106);expect(last.rows.find((r:any)=>r.revision===104).record.value).toBeNull();
  const scoped=await (await get('?book=book')).json();expect(scoped.rows).toHaveLength(1);expect(scoped.rows[0].revision).toBe(106);
 });
 it('UTF-8 response pages bound large values and cursor does not skip byte-truncated rows',async()=>{
  const large='漢'.repeat(4096);for(let i=1;i<=100;i++)await seed(name(`large${i}`,large),i);
  const firstResponse=await get(),firstText=await firstResponse.text(),first=JSON.parse(firstText);expect(new TextEncoder().encode(firstText).length).toBeLessThan(1048576+32768);expect(first.rows.length).toBeLessThan(100);expect(first.more).toBe(true);
  const last=await (await get(`?after=${first.cursor}`)).json();expect(first.rows.length+last.rows.length).toBe(100);expect(last.more).toBe(false);expect(last.cursor).toBe(100);
 });
 it('an updated selected row between metadata/value reads is delivered by the next cursor',async()=>{
  const id=await seed(name('racy','old'),1);
  server.beforePageRead=()=>{server.native.exec('UPDATE shared_state_meta SET revision=2');const json=JSON.stringify(name('racy','new'));server.native.prepare('UPDATE shared_state SET record=?,revision=2,bytes=? WHERE id=?').run(json,new TextEncoder().encode(json).length,id);};
  const first=await (await get()).json();expect(first.rows).toEqual([]);expect(first.cursor).toBe(1);expect(first.more).toBe(false);
  const next=await (await get(`?after=${first.cursor}`)).json();expect(next.rows).toHaveLength(1);expect(next.rows[0].record.value).toBe('new');expect(next.cursor).toBe(2);
 });
 it('bytes quota uses serialized UTF-8 and subtracts replaced rows, allowing shrinking tombstones',async()=>{
  const original=name('quota','漢😀'.repeat(1200));const id=await seed(original,1);const bytes=new TextEncoder().encode(JSON.stringify(original)).length;
  expect(server.native.prepare('SELECT bytes FROM shared_state WHERE id=?').get(id)?.bytes).toBe(bytes);expect(bytes).toBeGreaterThan(JSON.stringify(original).length);
  // Synthetic ledger reservation only: model full allocated usage without
  // forging a row byte count or writing 64MiB. Production row bytes stay exact.
  server.native.prepare('UPDATE shared_state_meta SET used_bytes=? WHERE id=1').run(SHARED_STATE_MAX_BYTES);
  expect((await put(name('new','漢'))).status).toBe(413);const replaced=await put(original,1);expect(replaced.status).toBe(200);
  expect(ledger().used_bytes).toBe(SHARED_STATE_MAX_BYTES);expect(ledger().row_count).toBe(1);
  const latest=(await replaced.json()).row;expect((await put(name('quota',null),latest.revision)).status).toBe(200);const tombstoneBytes=new TextEncoder().encode(JSON.stringify(name('quota',null))).length;expect(ledger().used_bytes).toBe(SHARED_STATE_MAX_BYTES-bytes+tombstoneBytes);expect(ledger().row_count).toBe(1);
 });
 it('row quota retains tombstones and still allows CAS replacement at capacity',async()=>{
  const first=await put(name('editable'));expect(first.status).toBe(200);const row=(await first.json()).row;
  const record=name('synthetic-count',null),json=JSON.stringify(record),insert=server.native.prepare('INSERT INTO shared_state(id,scope,kind,entity_key,record,revision,deleted,bytes) VALUES(?,?,?, ?,?,?,1,?)');
  server.native.exec('BEGIN');for(let i=1;i<SHARED_STATE_MAX_ROWS;i++)insert.run(`synthetic-count-${i}`,'',record.kind,record.key,json,1,json.length);server.native.exec('COMMIT');
  expect((await put(name('beyond count'))).status).toBe(413);expect((await put(name('editable',null),row.revision)).status).toBe(200);expect(server.native.prepare('SELECT COUNT(*) AS n FROM shared_state').get()?.n).toBe(SHARED_STATE_MAX_ROWS);expect(ledger().row_count).toBe(SHARED_STATE_MAX_ROWS);expectExactLedger();
 });
 it('UTF-8 byte CHECK blocks forged counts without charging the ledger',async()=>{
  const record=name('check','漢😀'),id=await seed(record,1),before=ledger();
  expect(()=>server.native.prepare('UPDATE shared_state SET bytes=bytes+1 WHERE id=?').run(id)).toThrow();expect(ledger()).toEqual(before);expectExactLedger();
  const other=name('forged','漢😀'),json=JSON.stringify(other);
  expect(()=>server.native.prepare('INSERT INTO shared_state(id,scope,kind,entity_key,record,revision,deleted,bytes) VALUES(?,?,?,?,?,2,0,?)').run('synthetic-forged','',other.kind,other.key,json,json.length)).toThrow();expect(ledger()).toEqual(before);expectExactLedger();
 });
 it('database budget triggers reject direct SQL insert/update beyond reserved byte/count caps',async()=>{
  const record=name('direct','small'),id=await seed(record,1),json=JSON.stringify(record),bytes=new TextEncoder().encode(json).length;
  server.native.prepare('UPDATE shared_state_meta SET used_bytes=? WHERE id=1').run(SHARED_STATE_MAX_BYTES);const full=ledger();
  const insert=server.native.prepare('INSERT INTO shared_state(id,scope,kind,entity_key,record,revision,deleted,bytes) VALUES(?,?,?,?,?,2,0,?)');
  expect(()=>insert.run('synthetic-other','',record.kind,record.key,json,bytes)).toThrow(/state_budget_exceeded/);expect(ledger()).toEqual(full);
  const bigger=JSON.stringify(name('direct','漢😀'.repeat(100)));
  expect(()=>server.native.prepare('UPDATE shared_state SET record=?,bytes=? WHERE id=?').run(bigger,new TextEncoder().encode(bigger).length,id)).toThrow(/state_budget_exceeded/);expect(ledger()).toEqual(full);
  server.native.prepare('UPDATE shared_state_meta SET used_bytes=?,row_count=? WHERE id=1').run(bytes,SHARED_STATE_MAX_ROWS);const countFull=ledger();
  expect(()=>insert.run('synthetic-count-other','',record.kind,record.key,json,bytes)).toThrow(/state_budget_exceeded/);expect(ledger()).toEqual(countFull);
 });
 it('physical delete keeps tombstones and REPLACE never undercharges in either trigger mode',async()=>{
  const id=await seed(name('retained',null),1),before=ledger();expect(()=>server.native.prepare('DELETE FROM shared_state WHERE id=?').run(id)).toThrow(/state_tombstone_required/);expect(ledger()).toEqual(before);
  const replacement=JSON.stringify(name('retained','漢😀')),replacementBytes=new TextEncoder().encode(replacement).length;
  const replace=()=>server.native.prepare('INSERT OR REPLACE INTO shared_state(id,scope,kind,entity_key,record,revision,deleted,bytes) VALUES(?,?,?,?,?,2,0,?)').run(id,'','common-name','retained',replacement,replacementBytes);
  // BEFORE INSERT forbids existing IDs, including the SQLite REPLACE path
  // whose implicit-delete triggers are suppressed in nonrecursive mode.
  server.native.exec('PRAGMA recursive_triggers=OFF');
  expect(replace).toThrow(/state_replace_forbidden/);expect(ledger()).toEqual(before);expectExactLedger();
  const beforeRecursive=ledger();server.native.exec('PRAGMA recursive_triggers=ON');expect(replace).toThrow(/state_replace_forbidden/);expect(ledger()).toEqual(beforeRecursive);
  // Full-ledger REPLACE cannot evade the insert reservation by deleting first.
  server.native.exec('PRAGMA recursive_triggers=OFF');server.native.prepare('UPDATE shared_state_meta SET used_bytes=? WHERE id=1').run(SHARED_STATE_MAX_BYTES);const full=ledger();expect(replace).toThrow(/state_replace_forbidden/);expect(ledger()).toEqual(full);
 });
 it('reapplying the migration creates no duplicate charges or triggers',async()=>{
  await seed(name('idempotent','漢😀'),1);const before=ledger();server.native.exec(readFileSync(new URL('../migrations/0010_shared_state.sql',import.meta.url),'utf8'));expect(ledger()).toEqual(before);
  const update=await put(name('idempotent','next'),1);expect(update.status).toBe(200);expectExactLedger();expect(ledger().row_count).toBe(1);
 });
 it('blob quota counts every pending/ready descriptor at the 3000-row boundary',()=>{
  const insert=server.native.prepare('INSERT INTO shared_state_blobs(sha256,bytes,state) VALUES(?,1,?)');server.native.exec('BEGIN');
  for(let i=0;i<3000;i++)insert.run(i.toString(16).padStart(64,'0'),i%2?'pending':'ready');server.native.exec('COMMIT');
  expect(()=>insert.run('f'.repeat(64),'pending')).toThrow(/state_blob_budget_exceeded/);
  expect(server.native.prepare('SELECT COUNT(*) AS n,SUM(bytes) AS total FROM shared_state_blobs').get()).toEqual({n:3000,total:3000});
 });
 it('rejects malformed UTF-8 and oversized/invalid inputs without adding a row',async()=>{
  expect((await handle(new Request('https://synthetic.example/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:new Uint8Array([0xc3,0x28])}))).status).toBe(400);
  expect((await handle(new Request('https://synthetic.example/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:'x'.repeat(930000)}))).status).toBe(400);
  expect((await put(name('line\nkey'))).status).toBe(400);expect((await put(name('too long','x'.repeat(4097)))).status).toBe(400);expect((await put(name('bad base'),-1)).status).toBe(400);
  expect(server.native.prepare('SELECT COUNT(*) AS n FROM shared_state').get()?.n).toBe(0);
 });
 it('chapter overlays require a matching immutable snapshot SHA and preserve source identity',async()=>{
  server.ready();const value={baseSha256:'a'.repeat(64),sourceHash:'b'.repeat(64),sourceRevision:1,chapters:[{id:'chapter',bookId:'book',order:0,title:'Synthetic',text:'edited',revision:2,sourceId:''}]};
  const record:SharedRecord={kind:'chapter',bookId:'book',key:'chapter',value};
  const mismatched=await put({...record,value:{...value,baseSha256:'c'.repeat(64)}});expect(mismatched.status).toBe(409);expect((await mismatched.json()).error).toBe('source_base_mismatch');
  expect((await put({...record,value:{...value,sourceHash:'not-a-hash'}})).status).toBe(400);
  expect((await put({...record,value:{...value,chapters:[{...value.chapters[0],id:'another'}]}})).status).toBe(400);
  expect((await put({...record,value:{...value,sourceRevision:2}})).status).toBe(400);
  expect((await put({...record,value:{...value,chapters:[{...value.chapters[0],revision:1}]}})).status).toBe(400);
  const accepted=await put(record);expect(accepted.status).toBe(200);expect((await accepted.json()).row.record.value).toEqual(value);
  // Acceptance proves base descriptor identity and schema, not the existence
  // of sourceHash in the opaque snapshot. Client source validation is separate.
 });
 it('chapter final SQL rechecks immutable base SHA after initial metadata read',async()=>{
  server.ready();const record:SharedRecord={kind:'chapter',bookId:'book',key:'c',value:{baseSha256:'a'.repeat(64),sourceHash:'b'.repeat(64),sourceRevision:1,editRevision:1,chapters:[{id:'c',bookId:'book',order:0,title:'',text:'edit',revision:2,sourceId:''}]}};
  server.beforeBatch=()=>server.native.prepare('UPDATE cloud_books SET sha256=? WHERE id=?').run('c'.repeat(64),'book');
  expect((await put(record)).status).not.toBe(200);expect(server.native.prepare('SELECT COUNT(*) AS n FROM shared_state').get()?.n).toBe(0);expectExactLedger();
 });
 it('cumulative chapter edits retain every prior descendant and never lower descendant revision',async()=>{
  server.ready();const value={baseSha256:'a'.repeat(64),sourceHash:'b'.repeat(64),sourceRevision:1,editRevision:1,chapters:[{id:'c',bookId:'book',order:0,title:'',text:'first',revision:2,sourceId:''},{id:'child',bookId:'book',order:0.5,title:'',text:'second',revision:1,sourceId:''}]};
  const record:SharedRecord={kind:'chapter',bookId:'book',key:'c',value};const created=await put(record);expect(created.status).toBe(200);const row=(await created.json()).row;
  expect((await put({...record,value:{...value,editRevision:2,chapters:[value.chapters[0]]}},row.revision)).status).not.toBe(200);
  const nextValue={...value,editRevision:2,chapters:[value.chapters[0],{...value.chapters[1],text:'second edit',revision:2}]};const next=await put({...record,value:nextValue},row.revision);expect(next.status).toBe(200);const nextRow=(await next.json()).row;
  for(const changed of [{text:'different same revision'},{title:'different same revision'},{order:0.75}])expect((await put({...record,value:{...nextValue,editRevision:3,chapters:[nextValue.chapters[0],{...nextValue.chapters[1],...changed}]}},nextRow.revision)).status).not.toBe(200);
  expect((await put({...record,value:{...value,editRevision:3}},nextRow.revision)).status).not.toBe(200);expect(server.native.prepare('SELECT record FROM shared_state WHERE id=?').get(row.id)?.record).toBe(JSON.stringify(nextRow.record));expectExactLedger();
 });
 it('chapter overlay tombstones are explicitly unsupported and cannot erase live descendants',async()=>{
  server.ready();const record:SharedRecord={kind:'chapter',bookId:'book',key:'c',value:null};let rejected=await put(record);expect(rejected.status).toBe(400);expect((await rejected.json()).error).toBe('chapter_tombstone_not_supported');
  const live={...record,value:{baseSha256:'a'.repeat(64),sourceHash:'b'.repeat(64),sourceRevision:1,editRevision:1,chapters:[{id:'c',bookId:'book',order:0,title:'',text:'live',revision:2,sourceId:''}]}};const saved=await put(live);expect(saved.status).toBe(200);const row=(await saved.json()).row;
  rejected=await put(record,row.revision);expect(rejected.status).toBe(400);expect((await rejected.json()).error).toBe('chapter_tombstone_not_supported');expect(server.native.prepare('SELECT record FROM shared_state WHERE id=?').get(row.id)?.record).toBe(JSON.stringify(row.record));expectExactLedger();
 });
 it('a fresh chapter CAS cannot replace the immutable first-edit source anchor',async()=>{
  server.ready();const value={baseSha256:'a'.repeat(64),sourceHash:'b'.repeat(64),sourceRevision:1,editRevision:1,chapters:[{id:'c',bookId:'book',order:0,title:'',text:'edit',revision:3,sourceId:''}]},record:SharedRecord={kind:'chapter',bookId:'book',key:'c',value};
  const saved=await put(record);expect(saved.status).toBe(200);const row=(await saved.json()).row;
  for(const next of [{...value,sourceHash:'c'.repeat(64),editRevision:2},{...value,sourceRevision:2,editRevision:2}])expect((await put({...record,value:next},row.revision)).status).not.toBe(200);
  expect(server.native.prepare('SELECT record FROM shared_state WHERE id=?').get(row.id)?.record).toBe(JSON.stringify(row.record));expectExactLedger();
 });
 it('album registries require a name and retain unique identities/names',()=>{
  const registry=(albums:unknown[])=>({kind:'albums',key:'',value:{version:1,albums}});
  expect(()=>validateSharedRecord(registry([{id:'a',updatedAt:1}]))).toThrow();
  expect(()=>validateSharedRecord(registry([{id:'a',name:'',updatedAt:1}]))).toThrow();
  expect(()=>validateSharedRecord(registry([{id:'a',name:'A',updatedAt:1},{id:'a',name:'B',updatedAt:2}]))).toThrow();
  expect(()=>validateSharedRecord(registry([{id:'a',name:'A',updatedAt:1},{id:'b',name:'A',updatedAt:2}]))).toThrow();
 });
 it('gated catalog overlays title/author/album while preserving immutable snapshot SHA/bytes and pagination',async()=>{
  const id='00000000-0000-4000-8000-000000000001',nextId='00000000-0000-4000-8000-000000000002';server.ready(id);server.ready(nextId);server.native.prepare('UPDATE cloud_books SET album=?,bytes=777,updated_at=99 WHERE id=?').run('Base album',id);
  const record:SharedRecord={kind:'book',bookId:id,key:'',value:{title:'Overlay title',author:'Overlay author',album:'Overlay album'}};const saved=await put(record);expect(saved.status).toBe(200);const row=(await saved.json()).row;
  let bucketCalls=0;const unavailable=()=>{bucketCalls++;throw Error('catalog must never download objects');};
  const env={DB:server as unknown as D1Database,LIBRARY_BUCKET:{get:unavailable,head:unavailable} as unknown as R2Bucket,PUBLIC_LIBRARY:'1',AUTH_PASSWORD_HASH:''};
  const catalog=(enabled:string,query='')=>handleCloudLibrary(new Request('https://synthetic.example/api/cloud/books'+query),{...env,SHARED_STATE_ENABLED:enabled});
  const enabled=await catalog('1','?limit=1');expect(enabled.status).toBe(200);const first=await enabled.json();expect(first.books).toEqual([{id,title:'Overlay title',author:'Overlay author',album:'Overlay album',sha256:'a'.repeat(64),bytes:777,updatedAt:99}]);expect(first.cursor).toBe(id);
  const second=await (await catalog('1',`?limit=1&cursor=${id}`)).json();expect(second.books).toHaveLength(1);expect(second.books[0].id).toBe(nextId);expect(second.cursor).toBeNull();
  const disabled=await (await catalog('0')).json();expect(disabled.books[0]).toMatchObject({title:'Synthetic',album:'Base album',sha256:'a'.repeat(64),bytes:777});expect(disabled.books[0]).not.toHaveProperty('author');
  const cleared=await put({...record,value:{title:'Clear album',author:''}},row.revision);expect(cleared.status).toBe(200);const clearedRow=(await cleared.json()).row;
  const clearedCatalog=await (await catalog('1')).json();expect(clearedCatalog.books[0]).toMatchObject({title:'Clear album',sha256:'a'.repeat(64),bytes:777});expect(clearedCatalog.books[0]).not.toHaveProperty('album');expect(clearedCatalog.books[0]).not.toHaveProperty('author');
  expect((await put({...record,value:null},clearedRow.revision)).status).toBe(200);expect((await (await catalog('1')).json()).books[0]).toMatchObject({title:'Synthetic',album:'Base album'});
  server.native.prepare('INSERT INTO cloud_book_deletions VALUES(?,1)').run(id);expect((await (await catalog('1')).json()).books.map((book:any)=>book.id)).toEqual([nextId]);expect(bucketCalls).toBe(0);
 });
 it('legacy gated-off catalog works without the unenabled shared_state table',async()=>{
  server.close();server=new NativeD1(false);const id='00000000-0000-4000-8000-000000000001';server.ready(id);
  expect(server.native.prepare("SELECT name FROM sqlite_master WHERE name='shared_state'").get()).toBeUndefined();
  const response=await handleCloudLibrary(new Request('https://synthetic.example/api/cloud/books'),{DB:server as unknown as D1Database,LIBRARY_BUCKET:{} as R2Bucket,PUBLIC_LIBRARY:'1',AUTH_PASSWORD_HASH:''});expect(response.status).toBe(200);expect((await response.json()).books).toEqual([{id,title:'Synthetic',sha256:'a'.repeat(64),bytes:1,updatedAt:1}]);
 });
 it('tombstones retain the valid dictionary namespace',()=>{expect(()=>validateSharedRecord({kind:'dictionary',key:'unsupported-kind',value:null})).toThrow();});
 it('tombstones require a nonempty chapter identity',()=>{expect(()=>validateSharedRecord({kind:'chapter',bookId:'book',key:'',value:null})).toThrow();});
});
