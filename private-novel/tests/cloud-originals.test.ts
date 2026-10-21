import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {D1Database,R2Bucket} from '@cloudflare/workers-types';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {handleCloudLibrary,type CloudLibraryEnv} from '../server/cloud-library';
import {ORIGINAL_UPLOAD_DEADLINE_MS} from '../server/cloud-originals';
import {originalObjectKey,type OriginalDescriptor} from '../src/features/sync-cloud/services/cloud-original-schema';
const book='12345678-1234-4000-8000-123456789abc',source='abcdef12-1234-4000-8000-123456789abc',other='22345678-1234-4000-8000-123456789abc';
const digest=(body:Uint8Array|string)=>createHash('sha256').update(body).digest('hex');
const bytes=new Uint8Array(1024).fill(97);
const value:OriginalDescriptor={version:1,sourceId:source,name:'synthetic.txt',relativePath:'Root/Chinese/synthetic.txt',encoding:'utf-8',sha256:digest(bytes),bytes:bytes.length};
const migrations=['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql'];
const databases:DatabaseSync[]=[];afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();for(const database of databases.splice(0))database.close();});
function setup(installed=true){
  const sql=new DatabaseSync(':memory:');databases.push(sql);for(const name of migrations.slice(0,installed?4:3))sql.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  sql.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) VALUES(?,'Synthetic',?,1,'ready',?,1)").run(book,'b'.repeat(64),`books/v1/${book}/${'b'.repeat(64)}.json`);
  const flags={publishFail:false,earlyNull:false,headWrong:false,putNever:false,putHook:undefined as undefined|(()=>void),getHook:undefined as undefined|(()=>void),publishHook:undefined as undefined|(()=>void)};
  const objects=new Map<string,Uint8Array<ArrayBuffer>>();const checksum=new Map<string,string>();
  const db={prepare(query:string){let args:SQLInputValue[]=[];return{bind(...input:SQLInputValue[]){args=input;return this;},async first(){if(query.startsWith('UPDATE cloud_originals')){flags.publishHook?.();if(flags.publishFail)throw new Error('interrupted');}return sql.prepare(query).get(...args)??null;},async all(){return{success:true,results:sql.prepare(query).all(...args)};},async run(){const result=sql.prepare(query).run(...args);return{success:true,meta:{changes:Number(result.changes)}};}};}};
  const metadata=(key:string)=>objects.has(key)?{key,size:objects.get(key)!.length,checksums:{sha256:Uint8Array.from(Buffer.from(flags.headWrong?'0'.repeat(64):checksum.get(key)!,'hex')).buffer}}:null;
  const bucket={
    head:vi.fn(async(key:string)=>metadata(key)),
    put:vi.fn(async(key:string,body:ReadableStream<Uint8Array>|Uint8Array,options:{sha256:string})=>{
      if(flags.putNever)return new Promise<null>(()=>{});
      if(flags.earlyNull){objects.set(key,bytes);checksum.set(key,digest(bytes));return null;}
      const raw=body instanceof Uint8Array?new Uint8Array(body):new Uint8Array(await new Response(body).arrayBuffer());
      if(digest(raw)!==options.sha256)throw new Error('checksum mismatch');flags.putHook?.();if(objects.has(key))return null;objects.set(key,raw);checksum.set(key,options.sha256);return metadata(key);
    }),
    get:vi.fn(async(key:string)=>{const object=metadata(key);flags.getHook?.();return object?{...object,body:new Response(objects.get(key)!).body}:null;}),
    delete:vi.fn(async(key:string|string[])=>{for(const item of typeof key==='string'?[key]:key){objects.delete(item);checksum.delete(item);}})
  };
  const env:CloudLibraryEnv={DB:db as unknown as D1Database,LIBRARY_BUCKET:bucket as unknown as R2Bucket,AUTH_PASSWORD_HASH:'',PUBLIC_LIBRARY:'1'};
  const request=(path:string,init:RequestInit={})=>{const headers=new Headers(init.headers);headers.set('Origin','https://synthetic.test');return new Request('https://synthetic.test'+path,{...init,headers});};
  const base=`/api/cloud/books/${book}/originals`;
  const run=(req:Request)=>handleCloudLibrary(req,env);
  const reserve=(descriptor=value)=>run(request(`${base}/${descriptor.sourceId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(descriptor)}));
  const upload=(body:BodyInit=bytes,init:RequestInit={})=>run(request(`${base}/${source}/data`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body,...init}));
  const tombstone=()=>sql.prepare('INSERT OR IGNORE INTO cloud_book_deletions VALUES(?,1)').run(book);
  return{sql,env,flags,objects,checksum,bucket,request,base,run,reserve,upload,tombstone};
}
describe('candidate originals backend and shared SQL budget',()=>{
  it('reserves exact immutable descriptor idempotently without double charge',async()=>{
    const s=setup();expect((await s.reserve()).status).toBe(201);expect(await(await s.reserve()).json()).toEqual({descriptor:value,state:'pending'});
    expect(s.sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:1025});
    expect((await s.reserve({...value,name:'other.txt',relativePath:'other.txt'})).status).toBe(409);expect(s.bucket.put).not.toHaveBeenCalled();
  });
  it('uploads, lists and streams byte-exact original without names/paths in key',async()=>{
    const s=setup();await s.reserve();expect((await s.upload()).status).toBe(201);
    const list=await(await s.run(s.request(s.base))).json();expect(list).toEqual({originals:[{descriptor:value,state:'ready',updatedAt:expect.any(Number)}]});
    const downloaded=await s.run(s.request(`${s.base}/${source}/data`));expect(downloaded.headers.get('Content-Length')).toBe('1024');expect(downloaded.headers.get('X-Content-SHA256')).toBe(value.sha256);expect(downloaded.headers.get('X-Content-Type-Options')).toBe('nosniff');expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(bytes);
    expect([...s.objects.keys()]).toEqual([originalObjectKey(book,value)]);expect((await s.upload()).status).toBe(200);expect(s.bucket.put).toHaveBeenCalledTimes(1);
  });
  it('does not serve pending records even if R2 upload survived publication failure; retry reconciles HEAD',async()=>{
    const s=setup();await s.reserve();s.flags.publishFail=true;expect((await s.upload()).status).toBe(503);expect(s.objects.size).toBe(1);
    expect((await s.run(s.request(`${s.base}/${source}/data`))).status).toBe(409);s.flags.publishFail=false;expect((await s.upload()).status).toBe(201);expect(s.bucket.put).toHaveBeenCalledTimes(1);
  });
  it.each([bytes.slice(1),new Uint8Array(1025).fill(97),new Uint8Array(1024).fill(98)])('does not publish truncated/oversize/checksum mismatch',async body=>{
    const s=setup();await s.reserve();expect((await s.upload(body)).status).toBe(422);expect(s.objects.size).toBe(0);expect(s.sql.prepare('SELECT state FROM cloud_originals').get()).toEqual({state:'pending'});
  });
  it('stops unconsumed R2 pump and drains bounded retry on early conditional null without deadlock',async()=>{
    const s=setup();await s.reserve();s.flags.earlyNull=true;let cancelled=false;
    const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(bytes);c.close();},cancel(){cancelled=true;}},{highWaterMark:0});
    expect((await s.upload(body,{duplex:'half'} as RequestInit)).status).toBe(201);expect(cancelled).toBe(false);
  },5000);
  it('wrong HEAD checksum cannot publish or serve an original',async()=>{
    const s=setup();await s.reserve();await s.upload();s.flags.headWrong=true;expect((await s.upload()).status).toBe(503);expect((await s.run(s.request(`${s.base}/${source}/data`))).status).toBe(503);
  });
  it('finite handler deadline even when R2 binding never settles',async()=>{
    const s=setup();await s.reserve();s.flags.putNever=true;vi.useFakeTimers();const response=s.upload();
    await vi.advanceTimersByTimeAsync(ORIGINAL_UPLOAD_DEADLINE_MS+1);expect((await response).status).toBe(422);expect(s.sql.prepare('SELECT state FROM cloud_originals').get()).toEqual({state:'pending'});
  });
  it('feature probe is explicit and advertises only installed storage ledger',async()=>{
    const s=setup();expect(await(await s.run(s.request('/api/cloud/books?features=1'))).json()).toMatchObject({features:{originalsV1:true}});
    const old=setup(false);expect(await(await old.run(old.request('/api/cloud/books?features=1'))).json()).toMatchObject({features:{originalsV1:false}});
    expect(await(await old.run(old.request('/api/cloud/books'))).json()).not.toHaveProperty('features');
  });
  it('never follows a malformed persisted original key during deletion',async()=>{
    const s=setup();const unrelated='originals/v1/unrelated';s.objects.set(unrelated,new Uint8Array([5]));
    s.sql.prepare("INSERT INTO cloud_originals(book_id,source_id,descriptor_json,sha256,bytes,object_key,state,updated_at) VALUES(?,?,?,?,?,?,'pending',1)").run(book,source,JSON.stringify(value),value.sha256,value.bytes,unrelated);
    expect((await s.run(s.request(`/api/cloud/books/${book}`,{method:'DELETE'}))).status).toBe(200);expect(s.objects.has(unrelated)).toBe(true);expect(s.bucket.delete).not.toHaveBeenCalledWith(unrelated);expect(s.bucket.delete).not.toHaveBeenCalledWith([unrelated]);
  });
  it('aborted request cannot publish ready and preserves reservation',async()=>{
    const s=setup();await s.reserve();const controller=new AbortController();controller.abort();expect((await s.upload(bytes,{signal:controller.signal})).status).toBe(422);expect(s.sql.prepare('SELECT state FROM cloud_originals').get()).toEqual({state:'pending'});
  });
  it('requires migration; old reads/deletes remain available and v1/original writers fail closed',async()=>{
    const s=setup(false);expect((await s.reserve()).status).toBe(503);expect((await s.run(s.request(`/api/cloud/books/${other}`,{method:'PUT',body:'a'}))).status).toBe(503);expect((await s.run(s.request(`/api/cloud/books/${book}`,{method:'DELETE'}))).status).toBe(200);
  });
  it('rejects missing, pending, deleted books and ID mismatch',async()=>{
    const s=setup();expect((await s.run(s.request(`/api/cloud/books/${other}/originals`))).status).toBe(404);s.sql.prepare("UPDATE cloud_books SET state='pending' WHERE id=?").run(book);expect((await s.reserve()).status).toBe(404);s.sql.prepare("UPDATE cloud_books SET state='ready' WHERE id=?").run(book);const mismatch={...value,sourceId:other};expect((await s.run(s.request(`${s.base}/${source}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mismatch)}))).status).toBe(400);s.tombstone();expect((await s.reserve()).status).toBe(410);expect((await s.upload()).status).toBe(410);
  });
  it('bounds descriptor bodies and refuses malformed/content type requests without logs',async()=>{
    const s=setup();const log=vi.spyOn(console,'log'),err=vi.spyOn(console,'error');expect((await s.run(s.request(`${s.base}/${source}`,{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(16385)}))).status).toBe(400);
    expect((await s.run(s.request(`${s.base}/${source}`,{method:'POST',body:'secretlike'}))).status).toBe(415);await s.reserve();expect((await s.upload(bytes,{headers:{'Content-Type':'text/plain'}})).status).toBe(415);expect(log).not.toHaveBeenCalled();expect(err).not.toHaveBeenCalled();
  });
  it.each(['put','publish','get'] as const)('tombstone race at %s prevents publication/serving and cleans exact own objects',async boundary=>{
    const s=setup();await s.reserve();const unrelated='originals/v1/unrelated';s.objects.set(unrelated,new Uint8Array([5]));s.checksum.set(unrelated,digest(new Uint8Array([5])));
    if(boundary==='put')s.flags.putHook=s.tombstone;if(boundary==='publish')s.flags.publishHook=s.tombstone;
    if(boundary==='get'){await s.upload();s.flags.getHook=s.tombstone;expect((await s.run(s.request(`${s.base}/${source}/data`))).status).toBe(410);}
    else expect((await s.upload()).status).toBe(410);
    expect((await s.run(s.request(`/api/cloud/books/${book}`,{method:'DELETE'}))).status).toBe(200);expect(s.objects.has(originalObjectKey(book,value))).toBe(false);expect(s.objects.has(unrelated)).toBe(true);expect(s.sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:1025});
  });
  it('caps100 retained originals and retries100th without recharge',async()=>{
    const s=setup();for(let i=0;i<100;i++){const v={...value,sourceId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,bytes:1};expect((await s.reserve(v)).status).toBe(201);}
    expect((await s.reserve()).status).toBe(409);expect((await s.reserve({...value,sourceId:'00000000-0000-4000-8000-000000000099',bytes:1})).status).toBe(201);expect(s.sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:101});
  });
  it('cleans100 validated originals with one R2 batch delete, retaining reservation rows',async()=>{
    const s=setup();for(let i=0;i<100;i++)await s.reserve({...value,sourceId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,bytes:1});
    expect((await s.run(s.request(`/api/cloud/books/${book}`,{method:'DELETE'}))).status).toBe(200);
    const originalCalls=s.bucket.delete.mock.calls.filter(([key])=>Array.isArray(key));expect(originalCalls).toHaveLength(1);expect(originalCalls[0][0]).toHaveLength(100);expect(s.sql.prepare('SELECT COUNT(*) AS count FROM cloud_originals').get()).toEqual({count:100});expect(s.sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:101});
  });
  it('migration seeds existing all-state reservations and reruns idempotently',()=>{
    const s=setup(false);s.sql.prepare("UPDATE cloud_books SET state='pending'").run();const migration=readFileSync(new URL('../migrations/0005_cloud_originals.sql',import.meta.url),'utf8');s.sql.exec(migration);s.sql.exec(migration);expect(s.sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:1});
  });
  it('non-atomic migration interleaving blocks writes after guards and seeds every earlier reservation',()=>{
    const s=setup(false);const sql=readFileSync(new URL('../migrations/0005_cloud_originals.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();
    const statements=sql.split(/;\s*(?=(?:CREATE|INSERT|ALTER|DROP|UPDATE)\s)/i).map(s=>s.trim()).filter(Boolean);
    const oldWrite=(id:string)=>s.sql.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) SELECT ?,'Old',?,1,'pending',?,1 WHERE COALESCE((SELECT SUM(bytes) FROM cloud_books),0)+1<=9000000000 ON CONFLICT(id) DO NOTHING").run(id,'c'.repeat(64),id);
    for(const statement of statements){s.sql.exec(statement);if(statement.startsWith('CREATE TABLE IF NOT EXISTS cloud_originals'))oldWrite(other);if(statement.startsWith('CREATE TRIGGER IF NOT EXISTS cloud_books_budget_guard'))expect(()=>oldWrite(source)).toThrow('cloud_storage_budget_exceeded');}
    expect(s.sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:2});oldWrite(source);expect(s.sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:3});
    expect(()=>s.sql.exec('DELETE FROM cloud_storage_budget')).toThrow('storage_reservation_retained');
  });
  it('guards old SUM writer and original reservation concurrently at shared budget edge',async()=>{
    const s=setup();s.sql.prepare('UPDATE cloud_storage_budget SET used_bytes=?').run(9_000_000_000-1024);expect((await s.reserve()).status).toBe(201);
    const old="INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) SELECT ?,'Old',?,1,'pending',?,1 WHERE COALESCE((SELECT SUM(bytes) FROM cloud_books),0)+1<=9000000000 ON CONFLICT(id) DO NOTHING";
    expect(()=>s.sql.prepare(old).run(other,'c'.repeat(64),'old')).toThrow('cloud_storage_budget_exceeded');expect(s.sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:9_000_000_000});
    expect((await s.reserve()).status).toBe(201);expect(s.sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:9_000_000_000});
  });
  it('prevents byte/descriptor edits or reservation deletion; failedtransaction rolls ledger back',async()=>{
    const s=setup();await s.reserve();expect(()=>s.sql.exec('UPDATE cloud_books SET bytes=2')).toThrow('immutable_storage_bytes');expect(()=>s.sql.exec('UPDATE cloud_originals SET bytes=2')).toThrow('immutable_original_descriptor');expect(()=>s.sql.exec('DELETE FROM cloud_originals')).toThrow('storage_reservation_retained');expect(()=>s.sql.exec('DELETE FROM cloud_books')).toThrow('storage_reservation_retained');
    expect(()=>s.sql.prepare('UPDATE cloud_books SET sha256=?').run('d'.repeat(64))).toThrow('immutable_storage_bytes');
    expect(()=>s.sql.exec('UPDATE cloud_storage_budget SET used_bytes=0 WHERE id=1')).toThrow('storage_budget_decrease_forbidden');
    const before=s.sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get();s.sql.exec('BEGIN');s.sql.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) VALUES(?,'Other',?,2,'pending',?,1)").run(other,'c'.repeat(64),'other');s.sql.exec('ROLLBACK');expect(s.sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual(before);
  });
});
