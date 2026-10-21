import {afterAll,beforeAll,expect,it} from 'vitest';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createHash} from 'node:crypto';
import {streamOriginalBody} from '../server/cloud-originals';

function scripted(parts:Array<{done:boolean;value?:Uint8Array}|Error>,mode:'byob'|'missing-extension'|'unsupported'='byob'){
  const stats={reads:0,cancels:0,releases:0,byobReleases:0,defaults:0};
  const reader={async read(){stats.reads++;const part=parts.shift();if(part instanceof Error)throw part;return part??{done:true};},async cancel(){stats.cancels++;},releaseLock(){stats.releases++;}};
  const body={getReader(options?:{mode:string}){if(options){if(mode==='unsupported')throw new TypeError('not a byte stream');if(mode==='missing-extension')return {releaseLock(){stats.byobReleases++;}};return {...reader,async readAtLeast(min:number,view:Uint8Array){expect(min).toBe(256*1024);expect(view.byteLength).toBe(256*1024);return reader.read();}};}stats.defaults++;return reader;}};
  const pending:Promise<unknown>[]=[];
  return {stats,start(expected:number){return streamOriginalBody({body} as never,expected,p=>{pending.push(p);void p.catch(()=>{});});},settle:()=>Promise.allSettled(pending)};
}
it('review BYOB retains a nonempty final done chunk and exact byte order',async()=>{
  const fixture=scripted([{done:false,value:new Uint8Array([1,2])},{done:true,value:new Uint8Array([3])}]);
  expect([...new Uint8Array(await new Response(fixture.start(3)).arrayBuffer())]).toEqual([1,2,3]);
  expect((await fixture.settle()).every(p=>p.status==='fulfilled')).toBe(true);expect(fixture.stats.releases).toBe(1);expect(fixture.stats.defaults).toBe(0);
});
for(const mode of ['missing-extension','unsupported'] as const)it(`review ${mode} falls back and releases acquired readers`,async()=>{
  const fixture=scripted([{done:false,value:new Uint8Array([7])},{done:true}],mode);
  expect([...new Uint8Array(await new Response(fixture.start(1)).arrayBuffer())]).toEqual([7]);await fixture.settle();
  expect(fixture.stats.defaults).toBe(1);expect(fixture.stats.releases).toBe(1);expect(fixture.stats.byobReleases).toBe(mode==='missing-extension'?1:0);
});
for(const failure of ['short','long','error'] as const)it(`review BYOB ${failure} cannot complete a declared-length response`,async()=>{
  const fixture=scripted([{done:false,value:new Uint8Array([1,2])},...(failure==='error'?[new Error('read failed')]:[{done:true,value:new Uint8Array(failure==='short'?0:2)}])]);
  await expect(new Response(fixture.start(3)).arrayBuffer()).rejects.toThrow();expect((await fixture.settle()).some(p=>p.status==='rejected')).toBe(true);expect(fixture.stats.cancels).toBeGreaterThan(0);expect(fixture.stats.releases).toBe(1);
});
it('review downstream cancellation cancels BYOB input and settles pump',async()=>{
  const fixture=scripted(Array.from({length:10},()=>({done:false,value:new Uint8Array(256*1024)})));
  const reader=fixture.start(10*256*1024).getReader();await reader.read();await reader.cancel();await fixture.settle();expect(fixture.stats.cancels).toBeGreaterThan(0);expect(fixture.stats.releases).toBe(1);expect(fixture.stats.reads).toBeLessThan(10);
});

let runtime:Miniflare;
beforeAll(async()=>{
  const entry=`import {streamOriginalBody,routeCloudOriginals} from './server/cloud-originals';
import {parseOriginalDescriptor} from './src/features/sync-cloud/services/cloud-original-schema';
let stats,ready=false;
export default {async fetch(request,env,ctx){
 if(new URL(request.url).pathname==='/stats')return Response.json(stats);
 if(new URL(request.url).pathname==='/upload'){
  stats={byob:0,defaults:0,reads:0,maxView:0,releases:0};
  const book='00000000-0000-4000-8000-000000000091',source='00000000-0000-4000-8000-000000000092';
  const descriptor=parseOriginalDescriptor({version:1,sourceId:source,name:'synthetic.txt',relativePath:'synthetic.txt',encoding:'utf-8',bytes:40*1024*1024-17,sha256:'${createHash('sha256').update(new Uint8Array(40*1024*1024-17).fill(97)).digest('hex')}'});
  const row={book_id:book,source_id:source,descriptor_json:JSON.stringify(descriptor),sha256:descriptor.sha256,bytes:descriptor.bytes,object_key:'originals/v1/'+book+'/'+source+'/'+descriptor.sha256+'.bin',state:ready?'ready':'pending',updated_at:1};
  const DB={prepare(sql){return {bind(){return this;},async first(){if(sql.includes('cloud_book_deletions')&&!sql.startsWith('UPDATE'))return null;if(sql.includes('cloud_storage_budget'))return {used_bytes:descriptor.bytes};if(sql.startsWith('SELECT * FROM cloud_originals'))return row;if(sql.startsWith('UPDATE cloud_originals')){ready=true;return {source_id:source};}return {id:book};}};}};
  // Keep the availability predicate distinct from the direct tombstone query.
  const prepare=DB.prepare;DB.prepare=function(sql){if(sql.startsWith('SELECT id FROM cloud_books'))return {bind(){return this;},async first(){return {id:book};}};return prepare(sql);};
  const body={getReader(options){const reader=request.body.getReader(options);if(options){stats.byob++;return {readAtLeast:typeof reader.readAtLeast==='function'?async(min,view)=>{stats.reads++;stats.maxView=Math.max(stats.maxView,view.byteLength);return reader.readAtLeast(min,view);}:undefined,cancel:reason=>reader.cancel(reason),releaseLock:()=>{stats.releases++;reader.releaseLock();}};}stats.defaults++;return reader;}};
  return routeCloudOriginals({url:'https://synthetic.test/api/cloud/books/'+book+'/originals/'+source+'/data',method:'PUT',headers:request.headers,signal:request.signal,body},{DB,LIBRARY_BUCKET:env.BUCKET},p=>ctx.waitUntil(p));
 }
 const size=40*1024*1024-17,bytes=new Uint8Array(size).fill(97);
 await env.BUCKET.put('synthetic-review',bytes);const object=await env.BUCKET.get('synthetic-review');
 stats={byob:0,defaults:0,reads:0,maxView:0,doneWithBytes:0,releases:0};
 const body={getReader(options){if(options){stats.byob++;const reader=object.body.getReader(options);return {readAtLeast:typeof reader.readAtLeast==='function'?async(min,view)=>{stats.reads++;stats.maxView=Math.max(stats.maxView,view.byteLength);const part=await reader.readAtLeast(min,view);if(part.done&&part.value?.byteLength)stats.doneWithBytes++;return part;}:undefined,cancel:()=>reader.cancel(),releaseLock:()=>{stats.releases++;reader.releaseLock();}};}stats.defaults++;return object.body.getReader();}};
 return new Response(streamOriginalBody({body},size,p=>ctx.waitUntil(p)),{headers:{'Content-Length':String(size)}});
}};`;
  const compiled=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
  runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-01-01',r2Buckets:['BUCKET']}));
},30000);
afterAll(async()=>{await runtime?.dispose();});
it('review actual workerd R2 uses bounded readAtLeast batches for almost40MiB with exact SHA',async()=>{
  const response=await runtime.dispatchFetch('https://synthetic.test/data'),hash=createHash('sha256');let bytes=0;
  for await(const part of response.body!){bytes+=part.length;hash.update(part);}
  const expected=40*1024*1024-17;expect(bytes).toBe(expected);expect(hash.digest('hex')).toBe(createHash('sha256').update(new Uint8Array(expected).fill(97)).digest('hex'));
  const stats=await(await runtime.dispatchFetch('https://synthetic.test/stats')).json() as {byob:number;defaults:number;reads:number;maxView:number;releases:number};
  expect(stats.byob).toBe(1);expect(stats.defaults).toBe(0);expect(stats.reads).toBeGreaterThanOrEqual(160);expect(stats.reads).toBeLessThanOrEqual(162);expect(stats.maxView).toBe(256*1024);expect(stats.releases).toBe(1);
  console.log('Independent native R2 batch evidence',JSON.stringify({bytes,...stats}));
},60000);
it('review actual request upload and existing-object retry drain both use bounded native BYOB',async()=>{
  for(const status of [201,200]){
    const response=await runtime.dispatchFetch('https://synthetic.test/upload',{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:new Uint8Array(40*1024*1024-17).fill(97)});
    expect(response.status,await response.text()).toBe(status);
    const stats=await(await runtime.dispatchFetch('https://synthetic.test/stats')).json() as {byob:number;defaults:number;reads:number;maxView:number;releases:number};
    expect(stats.byob).toBe(1);expect(stats.defaults).toBe(0);expect(stats.reads).toBe(161);expect(stats.maxView).toBe(256*1024);expect(stats.releases).toBe(1);
    console.log('Independent native PUT or retry batch evidence',JSON.stringify({status,...stats}));
  }
},60000);
