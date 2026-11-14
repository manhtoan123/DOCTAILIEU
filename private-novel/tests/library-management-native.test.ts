import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {beforeAll,afterAll,it,expect} from 'vitest';
let runtime:Miniflare;
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
beforeAll(async()=>{
 const output=await build({stdin:{contents:"import {handleCloudLibrary} from './server/cloud-library'; export default {fetch:(request,env,ctx)=>handleCloudLibrary(request,env,p=>ctx.waitUntil(p))};",resolveDir:process.cwd(),sourcefile:'management-native.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-01-01',bindings:{PUBLIC_LIBRARY:'1',SHARED_STATE_ENABLED:'1'},d1Databases:['DB'],r2Buckets:['LIBRARY_BUCKET']}));
 const db=await runtime.getD1Database('DB');
 for(const migration of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql']){const sql=readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();await db.batch(sql.split(/;\s*(?=(?:CREATE|INSERT|ALTER|DROP|UPDATE)\s)/i).map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));}
 await db.prepare('CREATE TABLE shared_state(id TEXT PRIMARY KEY,scope TEXT,kind TEXT,deleted INTEGER,record TEXT)').run();
},60000);
afterAll(async()=>{await runtime?.dispose();},30000);
async function seed(n:number){const db=await runtime.getD1Database('DB');await db.prepare("INSERT INTO cloud_books(id,title,album,sha256,bytes,state,object_key,updated_at) VALUES(?,'Original','A',?,1,'ready',?,1)").bind(id(n),'a'.repeat(64),`books/v1/${id(n)}/${'a'.repeat(64)}.json`).run();await db.prepare("INSERT INTO shared_state(id,scope,kind,deleted,record) VALUES(?,?,'book',0,?)").bind(id(n),id(n),JSON.stringify({value:{title:'Reviewed',album:'A/Series'}})).run();}
async function catalog(n:number){const response=await runtime.dispatchFetch('https://synthetic.test/api/cloud/books');return ((await response.json()) as {books:{id:string}[]}).books.find(b=>b.id===id(n));}
const remove=(n:number,expected:unknown)=>runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${id(n)}`,{method:'DELETE',headers:{Origin:'https://synthetic.test','Content-Type':'application/json'},body:JSON.stringify({expected})});
it.each(['title','album'])('native HTTP rejects %s changed between catalog review and tombstone write',async key=>{
 const n=key==='title'?1:2;await seed(n);const expected=await catalog(n),db=await runtime.getD1Database('DB');await db.prepare('UPDATE shared_state SET record=? WHERE scope=?').bind(JSON.stringify({value:{title:key==='title'?'Changed':'Reviewed',album:key==='album'?'Moved':'A/Series'}}),id(n)).run();const rejected=await remove(n,expected);expect(rejected.status).toBe(409);expect(await db.prepare('SELECT id FROM cloud_book_deletions WHERE id=?').bind(id(n)).first()).toBeNull();
 const current=await catalog(n),deleted=await remove(n,current);expect(deleted.status).toBe(200);expect(await db.prepare('SELECT id FROM cloud_book_deletions WHERE id=?').bind(id(n)).first()).not.toBeNull();expect((await remove(n,expected)).status).toBe(200);
});
it('expected absence refuses a newly ready cloud book; absent ID can be tombstoned safely',async()=>{await seed(3);expect((await remove(3,null)).status).toBe(409);expect((await remove(4,null)).status).toBe(200);});
it('malformed and oversized preconditions cannot create tombstones',async()=>{await seed(5);for(const expected of [{},false,{title:'x',sha256:'bad',bytes:1,updatedAt:1},{title:'x'.repeat(6000)}])expect((await remove(5,expected)).status).toBe(400);expect(await(await runtime.getD1Database('DB')).prepare('SELECT id FROM cloud_book_deletions WHERE id=?').bind(id(5)).first()).toBeNull();});
it('legacy bodyless DELETE still works',async()=>{await seed(6);expect((await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${id(6)}`,{method:'DELETE',headers:{Origin:'https://synthetic.test'}})).status).toBe(200);});
it('empty-stream DELETE without body headers follows the legacy path; declared empty JSON is rejected',async()=>{
 await seed(7);
 const url=`https://synthetic.test/api/cloud/books/${id(7)}`;
 const request=new Request(url,{method:'DELETE',headers:{Origin:'https://synthetic.test'},body:new ReadableStream<Uint8Array>({start(controller){controller.close();}}),duplex:'half'} as RequestInit & {duplex:'half'});
 expect(request.body).not.toBeNull();
 expect((await runtime.dispatchFetch(request as never)).status).toBe(200);
 expect(await(await runtime.getD1Database('DB')).prepare('SELECT id FROM cloud_book_deletions WHERE id=?').bind(id(7)).first()).not.toBeNull();
 await seed(9);
 const zeroLength=await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${id(9)}`,{method:'DELETE',headers:{Origin:'https://synthetic.test','Content-Length':'0'}});
 expect(zeroLength.status).toBe(200);
 await seed(8);
 const invalid=await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${id(8)}`,{method:'DELETE',headers:{Origin:'https://synthetic.test','Content-Type':'application/json'}});
 expect(invalid.status).toBe(400);
 expect(await(await runtime.getD1Database('DB')).prepare('SELECT id FROM cloud_book_deletions WHERE id=?').bind(id(8)).first()).toBeNull();
});
