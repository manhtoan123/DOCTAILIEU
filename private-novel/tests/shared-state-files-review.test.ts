import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {sharedRecordId,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';

// Actual workerd + local D1/R2 only. Fixture wrappers inject storage/network
// failures while production handlers, FixedLengthStream and checksum PUT run.
const entry=`
import {handleSharedFiles} from './server/shared-state-files';
import {handleSharedState} from './server/shared-state';
export default {async fetch(request,env,ctx){
 const url=new URL(request.url),fixture=url.searchParams.get('fixture');
 if(url.pathname==='/api/state')return handleSharedState(request,env);
 let cancelled=false;
 if(['reject-put','null-put','pre-aborted'].includes(fixture)){
  const controller=new AbortController();if(fixture==='pre-aborted')controller.abort();
  request=new Request(request,{body:new ReadableStream({cancel(){cancelled=true;}}),signal:controller.signal});
 }
 const bucket={
  head:async key=>{if(fixture==='missing-head'||fixture==='null-put')return null;return env.LIBRARY_BUCKET.head(key);},
  put:async(key,value,options)=>{if(fixture==='reject-put')throw Error('synthetic reject');if(fixture==='null-put')return null;return env.LIBRARY_BUCKET.put(key,value,options);},
  get:async key=>{const object=await env.LIBRARY_BUCKET.get(key);if(fixture==='bad-get'&&object)return {...object,checksums:{sha256:new Uint8Array(32).buffer}};return object;}
 };
 const response=await handleSharedFiles(request,{...env,LIBRARY_BUCKET:bucket},p=>ctx.waitUntil(p));
 if(['reject-put','null-put','pre-aborted'].includes(fixture))response.headers.set('X-Synthetic-Cancelled',String(cancelled));
 return response;
}};`;
let runtime:Miniflare;
const digest=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const bytes=(text:string)=>new TextEncoder().encode(text);
const key=(sha:string)=>`shared-dictionaries/v1/${sha}.txt`;
const url=(sha:string,fixture='')=>`https://synthetic.test/api/state-files/${sha}${fixture?'?fixture='+fixture:''}`;
const upload=(sha:string,body:Uint8Array,size=body.length,fixture='')=>runtime.dispatchFetch(url(sha,fixture),{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Dictionary-Bytes':String(size)},body});
async function deadline<T>(promise:Promise<T>,ms=2500):Promise<T>{let timer:ReturnType<typeof setTimeout>;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('request failed to settle after cancellation/conditional PUT')),ms);})]);}finally{clearTimeout(timer!);}}
async function statePut(sha:string,size:number,baseRevision=0){const record:SharedRecord={kind:'dictionary',key:'vp',value:{name:'synthetic-vp.txt',sha256:sha,bytes:size,parts:Math.ceil(size/1048576)}};return runtime.dispatchFetch('https://synthetic.test/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:await sharedRecordId(record),baseRevision,record})});}
beforeAll(async()=>{
 const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'shared-files-review-entry.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-01-01',d1Databases:['DB'],r2Buckets:['LIBRARY_BUCKET']}));
 const database=await runtime.getD1Database('DB');
 for(const migration of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0010_shared_state.sql']){
  const sql=readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();
  const statements=sql.split(/;\s*(?=(?:CREATE|INSERT|ALTER|DROP|UPDATE)\s)/i).map(s=>s.trim()).filter(Boolean);
  await database.batch(statements.map(s=>database.prepare(s)));
 }
},60000);
afterAll(async()=>{await runtime?.dispose();},30000);

describe('independent actual workerd shared files publication',()=>{
 it('manifest rejects absent/pending proof, then publishes only after exact checksum/size PUT',async()=>{
  const content=bytes('甲=Giáp\n乙=Ất😀\n'),sha=digest(content),database=await runtime.getD1Database('DB');
  expect((await statePut(sha,content.length)).status).not.toBe(200);
  const uploaded=await upload(sha,content);expect(uploaded.status,await uploaded.text()).toBe(200);expect(await database.prepare('SELECT state FROM shared_state_blobs WHERE sha256=?').bind(sha).first('state')).toBe('ready');
  const object=await (await runtime.getR2Bucket('LIBRARY_BUCKET')).head(key(sha));expect(object?.size).toBe(content.length);expect(Buffer.from(object!.checksums.sha256!)).toEqual(Buffer.from(sha,'hex'));
  const published=await statePut(sha,content.length);expect(published.status,await published.text()).toBe(200);
  expect((await statePut(sha,content.length+1)).status).not.toBe(200);
  const fetched=await runtime.dispatchFetch(url(sha));expect(fetched.status).toBe(200);expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(content);expect(fetched.headers.get('X-Content-SHA256')).toBe(sha);
  const head=await runtime.dispatchFetch(url(sha),{method:'HEAD'});expect(head.status).toBe(200);expect(await head.text()).toBe('');
 });
 it('wrong whole SHA and short/long input never publish, retain reservation, and allow a correct retry',async()=>{
  const database=await runtime.getD1Database('DB'),bucket=await runtime.getR2Bucket('LIBRARY_BUCKET');
  for(const [index,actualDelta] of [[0,0],[1,-1],[2,1]] as const){
   const content=bytes(`synthetic validation ${index}`),sha=digest(content),input=actualDelta===0?new Uint8Array(content.length).fill(97):actualDelta<0?content.slice(0,-1):new Uint8Array([...content,1]);
   const response=await deadline(upload(sha,input,content.length));expect(response.status).toBe(400);expect(await database.prepare('SELECT state FROM shared_state_blobs WHERE sha256=?').bind(sha).first('state')).toBe('pending');expect(await bucket.head(key(sha))).toBeNull();
   expect((await statePut(sha,content.length)).status).not.toBe(200);expect((await upload(sha,content)).status).toBe(200);
  }
 });
 it('concurrent same-SHA uploads settle with one immutable object and one reservation',async()=>{
  const content=bytes('same hash concurrent synthetic'.repeat(10000)),sha=digest(content),responses=await deadline(Promise.all([upload(sha,content),upload(sha,content)]),5000);expect(responses.map(r=>r.status)).toEqual([200,200]);
  const database=await runtime.getD1Database('DB');expect(await database.prepare('SELECT COUNT(*) AS n FROM shared_state_blobs WHERE sha256=?').bind(sha).first('n')).toBe(1);
  expect((await upload(sha,content,content.length+1)).status).toBe(409);expect((await runtime.dispatchFetch(url(sha))).status).toBe(200);
 });
 it('PUT rejection and conditional null cancel an unread source instead of hanging its pipe',async()=>{
  for(const fixture of ['reject-put','null-put']){const content=bytes(fixture),response=await deadline(upload(digest(content),content,content.length,fixture));expect(response.status).not.toBe(200);expect(response.headers.get('X-Synthetic-Cancelled'),`${fixture} status=${response.status} body=${await response.text()}`).toBe('true');}
 });
 it('a request already aborted before handler entry cancels its unread source and settles',async()=>{
  const content=bytes('pre-aborted'),response=await deadline(upload(digest(content),content,content.length,'pre-aborted'));expect(response.status).not.toBe(200);expect(response.headers.get('X-Synthetic-Cancelled')).toBe('true');
 });
 it('missing or false R2 proof keeps reads unavailable and pending reservations charged',async()=>{
  const content=bytes('missing head synthetic'),sha=digest(content),database=await runtime.getD1Database('DB');
  const missing=await upload(sha,content,content.length,'missing-head');expect(missing.status).toBe(503);expect(await database.prepare('SELECT state FROM shared_state_blobs WHERE sha256=?').bind(sha).first('state')).toBe('pending');expect((await runtime.dispatchFetch(url(sha))).status).toBe(404);
  expect((await upload(sha,content)).status).toBe(200);expect((await runtime.dispatchFetch(url(sha,'bad-get'))).status).toBe(503);
  expect((await runtime.dispatchFetch(url('f'.repeat(64)))).status).toBe(404);expect((await runtime.dispatchFetch(url('not-a-hash'))).status).toBe(400);
 });
 it('blob rows retain pending/ready capacity, reject replace/delete and immutable descriptor mutation',async()=>{
  const database=await runtime.getD1Database('DB'),sha=digest(bytes('immutable descriptor')),content=bytes('immutable descriptor');expect((await upload(sha,content)).status).toBe(200);
  for(const sql of ['DELETE FROM shared_state_blobs WHERE sha256=?','UPDATE shared_state_blobs SET bytes=bytes+1 WHERE sha256=?',"UPDATE shared_state_blobs SET state='pending' WHERE sha256=?"]){await expect(database.prepare(sql).bind(sha).run()).rejects.toThrow();}
  await expect(database.prepare("INSERT OR REPLACE INTO shared_state_blobs(sha256,bytes,state) VALUES(?,1,'pending')").bind(sha).run()).rejects.toThrow();expect(await database.prepare('SELECT state FROM shared_state_blobs WHERE sha256=?').bind(sha).first('state')).toBe('ready');
 });
 it('streams an 80MiB boundary object with verified proof and rejects an oversized declaration',async()=>{
  const size=80*1048576,chunk=new Uint8Array(65536).fill(97),hash=createHash('sha256');for(let offset=0;offset<size;offset+=chunk.length)hash.update(chunk);const sha=hash.digest('hex');
  async function* body(){for(let offset=0;offset<size;offset+=chunk.length)yield chunk;}
  const uploaded=await runtime.dispatchFetch(url(sha),{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Dictionary-Bytes':String(size)},body:body(),duplex:'half'});expect(uploaded.status,await uploaded.text()).toBe(200);
  const object=await (await runtime.getR2Bucket('LIBRARY_BUCKET')).head(key(sha));expect(object?.size).toBe(size);expect(Buffer.from(object!.checksums.sha256!)).toEqual(Buffer.from(sha,'hex'));
  expect((await upload(digest(bytes('oversized declared')),new Uint8Array(),size+1)).status).toBe(400);
 },60000);
 it('byte quota reports a storage limit and retains all pending reservations',async()=>{
  const database=await runtime.getD1Database('DB');
  // Pending descriptors consume genuine reserved capacity without uploading
  // unselected bytes. Fill to 256MiB using bounded immutable reservations.
  const used=await database.prepare('SELECT COALESCE(SUM(bytes),0) AS n FROM shared_state_blobs').first<number>('n');let remaining=256*1048576-(used??0),index=0;
  while(remaining){const size=Math.min(80*1048576,remaining),sha=createHash('sha256').update('quota reservation '+index++).digest('hex');await database.prepare("INSERT INTO shared_state_blobs(sha256,bytes,state) VALUES(?,?,'pending')").bind(sha,size).run();remaining-=size;}
  const content=bytes('beyond cap'),sha=digest(content),response=await upload(sha,content);expect(response.status).toBe(413);expect(await database.prepare('SELECT sha256 FROM shared_state_blobs WHERE sha256=?').bind(sha).first()).toBeNull();
 });
});
