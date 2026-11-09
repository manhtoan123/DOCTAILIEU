import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {chromium} from '@playwright/test';
import type {OriginalDescriptor} from '../src/features/sync-cloud/services/cloud-original-schema';
const book='12345678-1234-4000-8000-123456789abc',chunkSize=64*1024;
let runtime:Miniflare;
const hash=(bytes:number)=>{const digest=createHash('sha256');for(let n=0;n<bytes;n+=chunkSize)digest.update(new Uint8Array(Math.min(chunkSize,bytes-n)).fill(97));return digest.digest('hex');};
async function* body(bytes:number){for(let n=0;n<bytes;n+=chunkSize)yield new Uint8Array(Math.min(chunkSize,bytes-n)).fill(97);}
const source=(index:number)=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const entry=`
import {handleCloudLibrary} from './server/cloud-library';
export default {async fetch(request,env,ctx){
 if(new URL(request.url).pathname==='/synthetic-browser')return new Response('<!doctype html><title>Synthetic local fixture</title>',{headers:{'Content-Type':'text/html'}});
 const fixture=new URL(request.url).searchParams.get('fixture');
 if(fixture==='budget')return handleCloudLibrary(request,{...env,DB:env.BUDGET_DB},p=>ctx.waitUntil(p));
 if(!fixture)return handleCloudLibrary(request,env,p=>ctx.waitUntil(p));
 let heads=0;
 const bucket={
  head:async key=>{if(fixture==='earlynull'&&heads++===0)return null;const v=await env.LIBRARY_BUCKET.head(key);return fixture==='wronghead'&&v?{...v,size:v.size+1}:v;},
  put:async(key,value,options)=>{if(fixture==='earlynull')return null;const v=await env.LIBRARY_BUCKET.put(key,value,options);if(fixture==='deleteput')await env.DB.prepare('INSERT OR IGNORE INTO cloud_book_deletions VALUES(?,1)').bind('${book}').run();return v;},
  get:async key=>{const v=await env.LIBRARY_BUCKET.get(key);if(fixture==='deleteget')await env.DB.prepare('INSERT OR IGNORE INTO cloud_book_deletions VALUES(?,1)').bind('${book}').run();if(v&&(fixture==='shortget'||fixture==='longget')){await v.body.cancel();return {...v,body:new Response(new Uint8Array(v.size+(fixture==='shortget'?-1:1))).body};}return v;},
  delete:key=>env.LIBRARY_BUCKET.delete(key)
 };
 const database=fixture==='publishfail'?{prepare(sql){const statement=env.DB.prepare(sql);if(!sql.startsWith('UPDATE cloud_originals'))return statement;return {bind(){return this;},first(){throw new Error('synthetic D1 failure');}};}}:env.DB;
 return handleCloudLibrary(request,{...env,DB:database,LIBRARY_BUCKET:bucket},p=>ctx.waitUntil(p));
}};`;
beforeAll(async()=>{
  const compiled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'cloud-originals-native-entry.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
  runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-01-01',bindings:{PUBLIC_LIBRARY:'1'},d1Databases:['DB','BUDGET_DB'],r2Buckets:['LIBRARY_BUCKET']}));
  for(const binding of ['DB','BUDGET_DB']){const db=await runtime.getD1Database(binding);
  for(const migration of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql']){
    // Keep trigger BEGIN...END bodies whole; splitting on every ';' is invalid.
    const sql=readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();
    const statements=sql.split(/;\s*(?=(?:CREATE|INSERT|ALTER|DROP|UPDATE)\s)/i).map(s=>s.trim()).filter(Boolean);
    await db.batch(statements.map(s=>db.prepare(s)));
  }
  await db.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) VALUES(?,'Synthetic',?,1,'ready',?,1)").bind(book,'a'.repeat(64),`books/v1/${book}/${'a'.repeat(64)}.json`).run();
  }
},60_000);
afterAll(async()=>{await runtime?.dispose();},30_000);
async function reserve(index:number,bytes:number,sha=hash(bytes),budget=false){
  const descriptor:OriginalDescriptor={version:1,sourceId:source(index),name:'synthetic.txt',relativePath:'Root/synthetic.txt',encoding:'utf-8',sha256:sha,bytes};
  const response=await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${book}/originals/${descriptor.sourceId}${budget?'?fixture=budget':''}`,{method:'POST',headers:{Origin:'https://synthetic.test','Content-Type':'application/json'},body:JSON.stringify(descriptor)});expect(response.status,await response.text()).toBe(201);return descriptor;
}
async function upload(value:OriginalDescriptor,actual=value.bytes,fixture=''){
  return runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${book}/originals/${value.sourceId}/data${fixture?'?fixture='+fixture:''}`,{method:'PUT',headers:{Origin:'https://synthetic.test','Content-Type':'application/octet-stream'},body:body(actual),duplex:'half'});
}
const key=(v:OriginalDescriptor)=>`originals/v1/${book}/${v.sourceId}/${v.sha256}.bin`;
describe('candidate originals actual workerd R2 and D1',()=>{
  it.each(['pdf','docx'] as const)('roundtrips a synthetic %s original through actual HTTP/workerd/R2',async(encoding)=>{
    const descriptor:OriginalDescriptor={version:1,sourceId:source(encoding==='pdf'?910:911),name:`synthetic.${encoding}`,relativePath:`Root/synthetic.${encoding}`,encoding,sha256:hash(256),bytes:256};
    const reserved=await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${book}/originals/${descriptor.sourceId}`,{method:'POST',headers:{Origin:'https://synthetic.test','Content-Type':'application/json'},body:JSON.stringify(descriptor)});expect(reserved.status,await reserved.text()).toBe(201);
    const sent=await upload(descriptor);expect(sent.status,await sent.text()).toBe(201);
    const received=await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${book}/originals/${descriptor.sourceId}/data`);expect(received.status).toBe(200);const bytes=new Uint8Array(await received.arrayBuffer());expect(bytes).toEqual(new Uint8Array(256).fill(97));expect(createHash('sha256').update(bytes).digest('hex')).toBe(descriptor.sha256);
  },30000);
  it('roundtrips full40MiB source with native whole checksum and exact retry',async()=>{
    const v=await reserve(1,40*1024*1024);const first=await upload(v);expect(first.status,await first.text()).toBe(201);const bucket=await runtime.getR2Bucket('LIBRARY_BUCKET'),head=await bucket.head(key(v));expect(head?.size).toBe(v.bytes);expect(Buffer.from(head!.checksums.sha256!).toString('hex')).toBe(v.sha256);
    const retry=await upload(v);expect(retry.status,await retry.text()).toBe(200);
    const downloaded=await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${book}/originals/${v.sourceId}/data`);expect(downloaded.status).toBe(200);expect(downloaded.headers.get('Content-Length')).toBe(String(v.bytes));
    const digest=createHash('sha256');let count=0;for await(const part of downloaded.body!){count+=part.length;digest.update(part);}expect(count).toBe(v.bytes);expect(digest.digest('hex')).toBe(v.sha256);
  },60_000);
  it.each([['truncated',2,1024*1024-1],['oversize',3,1024*1024+1]] as const)('rejects actual %s stream without object or ready row',async(_name,index,actual)=>{
    const v=await reserve(index,1024*1024,hash(actual)),r=await upload(v,actual);expect(r.status,await r.text()).toBe(422);expect(await(await runtime.getR2Bucket('LIBRARY_BUCKET')).head(key(v))).toBeNull();
    expect(await(await runtime.getD1Database('DB')).prepare('SELECT state FROM cloud_originals WHERE source_id=?').bind(v.sourceId).first('state')).toBe('pending');
  },30_000);
  it('wrong whole SHA does not publish even for complete body',async()=>{const v=await reserve(4,1024*1024,'0'.repeat(64));const r=await upload(v);expect(r.status,await r.text()).toBe(422);expect(await(await runtime.getR2Bucket('LIBRARY_BUCKET')).head(key(v))).toBeNull();},30_000);
  it('publication D1 failure leaves pending, then reconciles exact HEAD with whole source',async()=>{
    const v=await reserve(5,1024*1024);const failed=await upload(v,v.bytes,'publishfail');expect(failed.status,await failed.text()).toBe(503);
    expect((await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${book}/originals/${v.sourceId}/data`)).status).toBe(409);const retry=await upload(v);expect(retry.status,await retry.text()).toBe(201);
  },30_000);
  it('early conditional null cancels pump and only publishes exact stored HEAD',async()=>{
    const v=await reserve(6,1024*1024),bucket=await runtime.getR2Bucket('LIBRARY_BUCKET');await bucket.put(key(v),new Uint8Array(v.bytes).fill(97),{sha256:v.sha256});
    // Full-size retry exercises the prior Undici ECONNRESET regression.
    const r=await upload(v,v.bytes,'earlynull');expect(r.status,await r.text()).toBe(201);
    const wrong=await upload(v,v.bytes,'wronghead');expect(wrong.status,await wrong.text()).toBe(503);
  },30_000);
  it('Edge browser full1MiB Blob retries ACK pending-existing HEAD and early conditional null',async()=>{
    const first=await reserve(10,1024*1024),second=await reserve(11,1024*1024),bucket=await runtime.getR2Bucket('LIBRARY_BUCKET');
    for(const v of [first,second])await bucket.put(key(v),new Uint8Array(v.bytes).fill(97),{sha256:v.sha256});
    const browser=await chromium.launch({channel:'msedge',headless:true});
    try{const page=await browser.newPage();await page.goto(new URL('/synthetic-browser',await runtime.ready).href);
      const result=await page.evaluate(async({book,first,second})=>{
        const statuses:number[]=[];for(const [sourceId,fixture] of [[first,''],[second,'?fixture=earlynull']]){
          const bytes=new Uint8Array(1024*1024).fill(97),response=await fetch(`/api/cloud/books/${book}/originals/${sourceId}/data${fixture}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:new Blob([bytes])});statuses.push(response.status);await response.json();
        }return statuses;
      },{book,first:first.sourceId,second:second.sourceId});expect(result).toEqual([201,201]);
    }finally{await browser.close();}
  },30_000);
  it.each(['shortget','longget'])('binary download validates %s actual length despite correct R2 metadata',async fixture=>{
    const response=await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${book}/originals/${source(6)}/data?fixture=${fixture}`);expect(response.status).toBe(200);const failed=await response.arrayBuffer().then(()=>false,()=>true);expect(failed).toBe(true);
  });
  it('D1 triggers block old SUM writer after originals consume remaining budget',async()=>{
    const db=await runtime.getD1Database('BUDGET_DB');await db.prepare('UPDATE cloud_storage_budget SET used_bytes=8999999997').run();
    const competing:OriginalDescriptor={version:1,sourceId:source(98),name:'tiny.txt',relativePath:'tiny.txt',encoding:'utf-8',sha256:hash(2),bytes:2};
    const raced=await Promise.allSettled([
      db.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) SELECT ?,'Old race',?,2,'pending',?,1 WHERE COALESCE((SELECT SUM(bytes) FROM cloud_books),0)+2<=9000000000 ON CONFLICT(id) DO NOTHING").bind(source(97),'a'.repeat(64),'synthetic-old-race').run(),
      db.prepare("INSERT INTO cloud_originals(book_id,source_id,descriptor_json,sha256,bytes,object_key,state,updated_at) VALUES(?,?,?,?,?,?,'pending',1)").bind(book,competing.sourceId,JSON.stringify(competing),competing.sha256,2,key(competing)).run()
    ]);expect(raced.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await db.prepare('SELECT used_bytes FROM cloud_storage_budget').first('used_bytes')).toBe(8999999999);
    const v=await reserve(7,1,hash(1),true);
    await expect(db.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) SELECT ?,'Old',?,1,'pending',?,1 WHERE COALESCE((SELECT SUM(bytes) FROM cloud_books),0)+1<=9000000000 ON CONFLICT(id) DO NOTHING").bind(source(99),'a'.repeat(64),'synthetic-old').run()).rejects.toThrow('cloud_storage_budget_exceeded');
    expect(await db.prepare('SELECT used_bytes FROM cloud_storage_budget').first('used_bytes')).toBe(9_000_000_000);const retry=await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${book}/originals/${v.sourceId}?fixture=budget`,{method:'POST',headers:{Origin:'https://synthetic.test','Content-Type':'application/json'},body:JSON.stringify(v)});expect(retry.status).toBe(201);
    await expect(db.prepare('UPDATE cloud_storage_budget SET used_bytes=0').run()).rejects.toThrow('storage_budget_decrease_forbidden');
  });
  it('tombstone after native PUT blocks ready and cleans only exact source keys',async()=>{
    const v=await reserve(8,1024*1024),bucket=await runtime.getR2Bucket('LIBRARY_BUCKET');await bucket.put('synthetic-unrelated',new Uint8Array([4]));const r=await upload(v,v.bytes,'deleteput');expect(r.status,await r.text()).toBe(410);expect(await bucket.head(key(v))).toBeNull();expect(await bucket.head('synthetic-unrelated')).not.toBeNull();
    const deleted=await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${book}`,{method:'DELETE',headers:{Origin:'https://synthetic.test'}});expect(deleted.status).toBe(200);expect(await bucket.head('synthetic-unrelated')).not.toBeNull();expect(await bucket.head(key({...v,sourceId:source(1),sha256:hash(40*1024*1024)}))).toBeNull();
    expect((await runtime.dispatchFetch(`https://synthetic.test/api/cloud/books/${book}/originals`)).status).toBe(410);
  },30_000);
});
