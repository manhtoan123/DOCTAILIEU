import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {build} from 'esbuild';
import {createSHA256} from 'hash-wasm';
import {convertV4MiniflareOptions,Miniflare} from 'miniflare';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
// Test-only capability spike: synthetic bytes/local workerd/R2, no app changes.
const MiB=1024*1024,total=40*MiB,readSize=64*1024;
const chunk=(index:number,size:number)=>new Uint8Array(size).fill(index%251);
const expectedHash=(size:number)=>{const h=createHash('sha256');for(let i=0;i<total/size;i++)h.update(chunk(i,size));return h.digest('hex');};
const uniformHash=(bytes:number)=>{const h=createHash('sha256');for(let i=0;i<bytes;i+=readSize)h.update(new Uint8Array(Math.min(readSize,bytes-i)).fill(97));return h.digest('hex');};
const worker=`
import {createSHA256} from 'hash-wasm';
const hex=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/wasm'){try{const h=await createSHA256();h.init();h.update(new Uint8Array(262144));return Response.json({stateBytes:h.save().length});}catch(e){return Response.json({error:String(e)},{status:500});}}
 const key=url.searchParams.get('key')||'synthetic',declared=Number(request.headers.get('x-size')),sha=request.headers.get('x-sha');
 if(url.pathname==='/head'){const found=await env.BUCKET.head(key);return Response.json({exists:!!found,...(found?{size:found.size,sha:hex(found.checksums.sha256)}:{})});}
 if(!Number.isSafeInteger(declared)||declared<1||declared>41943040||!request.body||!/^[a-f0-9]{64}$/.test(sha||''))return new Response('invalid',{status:400});
 const fixed=new FixedLengthStream(declared),writer=fixed.writable.getWriter(),reader=request.body.getReader();let seen=0,maxReadChunk=0;
 const pump=(async()=>{try{while(true){const {done,value}=await reader.read();if(done)break;seen+=value.length;maxReadChunk=Math.max(maxReadChunk,value.length);if(seen>declared)throw new Error('oversize');await writer.write(value);}if(seen!==declared)throw new Error('truncated');await writer.close();}catch(e){await writer.abort(e).catch(()=>{});throw e;}finally{reader.releaseLock();writer.releaseLock();}})();
 const put=env.BUCKET.put(key,fixed.readable,{sha256:sha,onlyIf:{etagDoesNotMatch:'*'},customMetadata:{sha256:sha}});
 put.catch(e=>{writer.abort(e).catch(()=>{});reader.cancel(e).catch(()=>{});});
 put.then(result=>{if(result===null){reader.cancel().catch(()=>{});writer.abort(new Error('conditional skip')).catch(()=>{});}},()=>{});
 const [stored,pumped]=await Promise.allSettled([put,pump]);
 if(stored.status==='fulfilled'&&stored.value===null){const found=await env.BUCKET.head(key);if(!found||found.size!==declared||!found.checksums.sha256||hex(found.checksums.sha256)!==sha)return Response.json({error:'existing differs'},{status:409});return Response.json({retry:true,size:found.size,sha:hex(found.checksums.sha256),seen,maxReadChunk});}
 if(stored.status==='rejected'||pumped.status==='rejected')return Response.json({error:String(stored.status==='rejected'?stored.reason:pumped.reason),seen,maxReadChunk},{status:422});
 return Response.json({retry:false,size:stored.value.size,sha:hex(stored.value.checksums.sha256),seen,maxReadChunk});
}};`;
let runtime:Miniflare;
beforeAll(async()=>{const bundled=await build({stdin:{contents:worker,resolveDir:process.cwd(),sourcefile:'original-hash-spike-entry.ts',loader:'ts'},bundle:true,write:false,platform:'browser',format:'esm',target:'es2022'});runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-01-01',r2Buckets:['BUCKET']}));},60_000);
afterAll(async()=>{await runtime?.dispose();},30_000);
async function* body(bytes:number){for(let offset=0;offset<bytes;offset+=readSize)yield new Uint8Array(Math.min(readSize,bytes-offset)).fill(97);}
async function upload(key:string,declared:number,actual=declared,sha=uniformHash(actual)){return runtime.dispatchFetch(`https://synthetic.test/put?key=${key}`,{method:'PUT',headers:{'x-size':String(declared),'x-sha':sha},body:body(actual),duplex:'half'});}
async function head(key:string){return (await runtime.dispatchFetch(`https://synthetic.test/head?key=${key}`)).json() as Promise<{exists:boolean;size?:number;sha?:string}>;}
describe('original hash and native R2 streaming capability spike',()=>{
 it.each([MiB/4,MiB])('resumes whole40MiB SHA using %i-byte checkpoints',async size=>{
  let saved:Uint8Array|undefined,maxState=0;const times:number[]=[],before=process.memoryUsage();
  for(let i=0;i<total/size;i++){const start=performance.now(),h=await createSHA256();if(saved)h.load(saved);else h.init();h.update(chunk(i,size));saved=h.save();maxState=Math.max(maxState,saved.length);times.push(performance.now()-start);if(i===total/size-1)expect(h.digest()).toBe(expectedHash(size));}
  const after=process.memoryUsage(),sorted=times.sort((a,b)=>a-b);expect(maxState).toBeLessThan(1024);console.log(JSON.stringify({spike:'node40MiB',partBytes:size,stateBytes:maxState,wallMs:{min:sorted[0],median:sorted[Math.floor(sorted.length/2)],max:sorted.at(-1)},parentHeapDelta:after.heapUsed-before.heapUsed,parentRssDelta:after.rss-before.rss}));
 });
 it('rejects incompatible state; replay/reordering need trusted cursor/CAS',async()=>{
  const original=await createSHA256();original.init();original.update(chunk(0,MiB));const state=original.save(),corrupt=state.slice();corrupt[0]^=255;
  const h=await createSHA256();expect(()=>h.load(corrupt)).toThrow();h.load(state);h.update(chunk(0,MiB));expect(h.digest()).not.toBe(createHash('sha256').update(chunk(0,MiB)).digest('hex'));
  h.load(state);h.update(chunk(2,MiB));expect(h.digest()).not.toBe(createHash('sha256').update(chunk(0,MiB)).update(chunk(1,MiB)).digest('hex'));
 });
 it('records direct hash-wasm compilation in native workerd',async()=>{
  const response=await runtime.dispatchFetch('https://synthetic.test/wasm'),result=await response.json() as {stateBytes?:number;error?:string};console.log(JSON.stringify({spike:'workerdDirectCompile',status:response.status,...result}));
  if(response.status===200)expect(result.stateBytes).toBeLessThan(1024);else{expect(response.status).toBe(500);expect(result.error).toMatch(/WebAssembly|Wasm|compile/i);}
 });
 it('puts exact40MiB with native wholeSHA, bounded stream and exact conditional retry',async()=>{
  const sha=uniformHash(total),before=process.memoryUsage(),start=performance.now(),response=await upload('original40MiB',total,total,sha),result=await response.json() as {size:number;sha:string;maxReadChunk:number;seen:number;retry:boolean;error?:string};
  expect(response.status,JSON.stringify(result)).toBe(200);expect(result.size).toBe(total);expect(result.seen).toBe(total);expect(result.sha).toBe(sha);expect(result.retry).toBe(false);expect(result.maxReadChunk).toBeLessThanOrEqual(readSize);
  const after=process.memoryUsage();console.log(JSON.stringify({spike:'nativeR240MiB',wallMs:performance.now()-start,maxReadChunk:result.maxReadChunk,parentHeapDelta:after.heapUsed-before.heapUsed,parentRssDelta:after.rss-before.rss,workerCpu:'not observable',workerPeakMemory:'not observable'}));expect(await head('original40MiB')).toEqual({exists:true,size:total,sha});
  const retry=await upload('original40MiB',total,total,sha);expect(retry.status).toBe(200);expect((await retry.json() as {retry:boolean}).retry).toBe(true);
  // Native local R2 validates supplied checksum before returning a conditional
  // miss; a future API can HEAD early for409 but cannot assume PUT does so.
  const conflict=await upload('original40MiB',total,total,'0'.repeat(64));expect(conflict.status).toBe(422);expect(await head('original40MiB')).toEqual({exists:true,size:total,sha});
 },60_000);
 it('native checksum mismatch leaves no object',async()=>{const r=await upload('wrongSHA',MiB,MiB,'0'.repeat(64)),result=await r.json();expect(r.status,JSON.stringify(result)).toBe(422);expect(await head('wrongSHA')).toEqual({exists:false});},30_000);
 it.each([['truncated',MiB-1],['oversize',MiB+1]] as const)('rejects %s stream against declared length without object',async(key,actual)=>{const r=await upload(key,MiB,actual),result=await r.json();expect(r.status,JSON.stringify(result)).toBe(422);expect(await head(key)).toEqual({exists:false});},30_000);
});
