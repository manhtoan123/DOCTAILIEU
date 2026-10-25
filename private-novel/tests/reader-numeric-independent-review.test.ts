import {afterEach,describe,expect,it} from 'vitest';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import type {D1Database} from '@cloudflare/workers-types';
import {handleReaderRoute} from '../server/reader-route-registry';
import type {CloudDeviceEnv} from '../server/cloud-device-auth';
import {chapterIdForNumber,chapterRouteNumber} from '../src/features/reader/services/chapter-route-number';

// Independent synthetic records; production SQL and handler execute in native SQLite.
const origin='https://numeric-review.test';
const book='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const migration=readFileSync(new URL('../migrations/0014_reader_routes.sql',import.meta.url),'utf8');
const opened:DatabaseSync[]=[];
afterEach(()=>{for(const sql of opened.splice(0))sql.close();});

function fixture(){
 const sql=new DatabaseSync(':memory:');opened.push(sql);
 for(const name of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql'])sql.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
 const seed=(id:string,state='ready')=>sql.prepare('INSERT INTO cloud_books VALUES(?,?,?,?,?,?,?)').run(id,'Synthetic source','a'.repeat(64),1,state,`synthetic/${id}`,1);
 seed(book);seed(other);
 const before=sql.prepare('SELECT * FROM cloud_books ORDER BY id').all();
 sql.exec(migration);
 const database={prepare(query:string){let args:SQLInputValue[]=[];return {
  bind(...values:SQLInputValue[]){args=values;return this;},
  async first(){return sql.prepare(query).get(...args)??null;},
  async all(){return {success:true,results:sql.prepare(query).all(...args)};},
  async run(){return {success:true,meta:{changes:Number(sql.prepare(query).run(...args).changes)}};},
 };}};
 const env:CloudDeviceEnv={DB:database as unknown as D1Database,AUTH_PASSWORD_HASH:'',PUBLIC_LIBRARY:'1'};
 const send=(query:string,method='GET',headers:HeadersInit={})=>handleReaderRoute(new Request(`${origin}/api/reader-route?${query}`,{method,headers:{Origin:origin,...headers}}),env);
 const allocate=(id=book)=>send(`book=${id}`,'POST');
 return {sql,env,seed,before,send,allocate};
}

describe('independent numeric registry integrity review',()=>{
 it('preserves source rows and produces one immutable alias for overlapping allocation',async()=>{
  const s=fixture();
  expect(s.sql.prepare('SELECT * FROM cloud_books ORDER BY id').all()).toEqual(s.before);
  const results=await Promise.all(Array.from({length:8},()=>s.allocate()));
  expect(results.every(row=>row.status===200)).toBe(true);
  const aliases=await Promise.all(results.map(row=>row.json()));
  expect(new Set(aliases.map(row=>row.code)).size).toBe(1);
  expect(aliases[0]).toEqual({bookId:book,code:10001});
  expect(s.sql.prepare('SELECT * FROM reader_routes').all()).toHaveLength(1);
  expect(await (await s.send('code=10001')).json()).toEqual(aliases[0]);
  expect(s.sql.prepare('SELECT * FROM cloud_books ORDER BY id').all()).toEqual(s.before);
 });

 it('accepts an incoming POST whose non-null body stream immediately reaches EOF',async()=>{
  const s=fixture();
  const body=new ReadableStream<Uint8Array>({start(controller){controller.close();}});
  const request=new Request(`${origin}/api/reader-route?book=${book}`,{method:'POST',headers:{Origin:origin},body,duplex:'half'} as RequestInit);
  expect(request.body).not.toBeNull();
  const response=await handleReaderRoute(request,s.env);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({bookId:book,code:10001});
  expect(request.body?.locked).toBe(false);
  expect(s.sql.prepare('SELECT * FROM reader_routes').all()).toEqual([{id:1,book_id:book}]);
  expect(s.sql.prepare('SELECT * FROM cloud_books ORDER BY id').all()).toEqual(s.before);
 });

 it('rejects and cancels the first nonempty POST body chunk before registry allocation',async()=>{
  const s=fixture();let pulls=0,cancelled=false;
  const body=new ReadableStream<Uint8Array>({
   pull(controller){pulls++;controller.enqueue(new TextEncoder().encode('unaccepted payload'));},
   cancel(){cancelled=true;},
  },{highWaterMark:0});
  const request=new Request(`${origin}/api/reader-route?book=${book}`,{method:'POST',headers:{Origin:origin},body,duplex:'half'} as RequestInit);
  const response=await handleReaderRoute(request,s.env);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({error:'invalid_route_request'});
  expect(pulls).toBe(1);expect(cancelled).toBe(true);
  expect(request.body?.locked).toBe(false);
  expect(s.sql.prepare('SELECT COUNT(*) n FROM reader_routes').get()?.n).toBe(0);
  expect(s.sql.prepare('SELECT * FROM cloud_books ORDER BY id').all()).toEqual(s.before);
 });

 it('rejects update, delete and SQLite replacement attempts that could recycle an alias',async()=>{
  const s=fixture();await s.allocate();
  const before=s.sql.prepare('SELECT * FROM reader_routes').all();
  expect(()=>s.sql.prepare('UPDATE reader_routes SET book_id=? WHERE id=1').run(other)).toThrow();
  expect(()=>s.sql.exec('DELETE FROM reader_routes WHERE id=1')).toThrow();
  expect(()=>s.sql.prepare('INSERT OR REPLACE INTO reader_routes(id,book_id) VALUES(1,?)').run(other)).toThrow();
  // Retrying the existing book may be ignored; it must retain its original code.
  s.sql.prepare('INSERT OR REPLACE INTO reader_routes(id,book_id) VALUES(2,?)').run(book);
  expect(s.sql.prepare('SELECT * FROM reader_routes').all()).toEqual(before);
 });

 it('keeps tombstoned aliases reserved and refuses unknown or pending books',async()=>{
  const s=fixture();await s.allocate();
  s.sql.prepare('INSERT INTO cloud_book_deletions VALUES(?,1)').run(book);
  expect((await s.send('code=10001')).status).toBe(404);
  expect((await s.allocate()).status).toBe(404);
  s.sql.prepare("UPDATE cloud_books SET state='pending' WHERE id=?").run(other);
  expect((await s.allocate(other)).status).toBe(404);
  expect((await s.allocate('00000000-0000-4000-8000-000000000099')).status).toBe(404);
  expect(s.sql.prepare('SELECT * FROM reader_routes').all()).toEqual([{id:1,book_id:book}]);
  s.sql.prepare("UPDATE cloud_books SET state='ready' WHERE id=?").run(other);
  const next=await (await s.allocate(other)).json();expect(next.code).toBeGreaterThan(10001);
 });

 it('applies auth/origin protection before allocating or resolving',async()=>{
  const s=fixture();
  expect((await s.send(`book=${book}`,'POST',{Origin:'https://foreign.test'})).status).toBe(403);
  expect((await s.send(`book=${book}&code=10001`,'POST')).status).toBe(400);
  expect((await s.send(`book=${book}&book=${other}`,'POST')).status).toBe(400);
  s.env.PUBLIC_LIBRARY='0';s.env.CLOUD_ACCESS_TOKEN_HASH='a'.repeat(64);
  expect((await s.allocate()).status).toBe(401);
  expect((await s.send('code=10001')).status).toBe(401);
  expect(s.sql.prepare('SELECT COUNT(*) n FROM reader_routes').get()?.n).toBe(0);
 });

 it('enforces the retained-row cap while existing aliases remain readable and idempotent',async()=>{
  const s=fixture();await s.allocate();
  // Populate a full synthetic registry without the per-insert cap, then restore
  // the production trigger before testing the boundary through the handler.
  s.sql.exec('DROP TRIGGER reader_routes_cap');
  s.sql.exec("WITH RECURSIVE n(x) AS (VALUES(2) UNION ALL SELECT x+1 FROM n WHERE x<100000) INSERT INTO reader_routes(id,book_id) SELECT x,printf('10000000-0000-4000-8000-%012d',x) FROM n");
  s.sql.exec(migration);
  expect((await s.allocate()).status).toBe(200);
  expect((await s.send('code=10001')).status).toBe(200);
  expect((await s.allocate(other)).ok).toBe(false);
  expect(s.sql.prepare('SELECT COUNT(*) n FROM reader_routes').get()?.n).toBe(100000);
 });
});

describe('independent visible TOC position review',()=>{
 it('uses one-based sorted position despite fractional order, duplicate headings or missing headings',()=>{
  const chapters=[{id:'third',title:'Chương 1429: Trùng',order:999},{id:'first',title:'Mở đầu',order:-2},{id:'second',title:'Chương 1429: Trùng',order:-1.5}];
  const before=structuredClone(chapters);
  for(const [index,id] of ['first','second','third'].entries()){
   expect(chapterRouteNumber(chapters,id)).toBe(index+1);
   expect(chapterIdForNumber(chapters,index+1)).toBe(id);
  }
  expect(chapters).toEqual(before);
 });
 it('counts only visible entries and keeps stable TOC order when order values tie',()=>{
  const chapters=[{id:'tie-b',order:3},{id:'hidden',order:1},{id:'tie-a',order:3},{id:'first',order:2}];
  const hidden=new Set(['hidden']),visible=chapters.filter(chapter=>!hidden.has(chapter.id));
  expect(chapterIdForNumber(visible,1)).toBe('first');
  expect(chapterIdForNumber(visible,2)).toBe('tie-b');
  expect(chapterIdForNumber(visible,3)).toBe('tie-a');
  expect(chapterRouteNumber(visible,'hidden')).toBeUndefined();
  expect(chapterRouteNumber(visible,'tie-a')).toBe(3);
 });
 it('rejects missing and out-of-range positions instead of choosing another chapter',()=>{
  const chapters=[{id:'only',order:1429}];
  for(const position of [0,-1,1.5,2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])expect(chapterIdForNumber(chapters,position)).toBeUndefined();
  expect(chapterRouteNumber(chapters,'missing')).toBeUndefined();
  expect(chapterIdForNumber([],1)).toBeUndefined();
 });
});
