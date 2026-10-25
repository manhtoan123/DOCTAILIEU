import {afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {convertVersion} from '../server/convert-manifest';

let runtime:Miniflare,script:string,schema:string,pages:string;
let db:Awaited<ReturnType<Miniflare['getD1Database']>>;
let enter:()=>void,release:()=>void,entered:Promise<void>,released:Promise<void>;
const day=()=>Math.floor(Date.now()/86400000);
const post=(text='known',names:unknown[]=[] ,version=convertVersion)=>runtime.dispatchFetch('https://private.internal/convert',{method:'POST',headers:{'Content-Type':'application/json','X-Convert-Version':version},body:JSON.stringify({text,names})});
const budget=()=>db.prepare('SELECT spent,lease,until_ms FROM convert_budget WHERE day=?').bind(day()).first<{spent:number;lease:string|null;until_ms:number}>();
beforeAll(async()=>{
 schema=await readFile('experiments/server-convert/guard-schema.sql','utf8');
 script=(await build({entryPoints:['server/convert-worker.ts'],bundle:true,write:false,format:'esm',platform:'browser',plugins:[{name:'review-controlled-engine',setup(builder){
  builder.onResolve({filter:/experiments\/server-convert\/worker$/},()=>({path:'engine',namespace:'review-engine'}));
  builder.onLoad({filter:/.*/,namespace:'review-engine'},()=>({loader:'js',contents:`export default {async fetch(request,env){const body=await request.text();if(new TextEncoder().encode(body).byteLength>32768)return Response.json({error:'body_limit'},{status:413});const input=JSON.parse(body);if(input.text==='hold')return fetch('https://hold.invalid/');if(input.text==='throw')throw Error('synthetic engine failure');const error=input.text==='candidate'?'candidate_limit':input.text==='match'?'match_limit':input.text==='output'?'output_limit':input.text==='unavailable'?'probe_failed':undefined;const measured=input.text==='missing'?null:input.text==='malformed'?'5e1':'41';return Response.json(error?{error}:{tokens:[],lookup:{hanviet:'',meanings:[]},lookups:[]},{status:error?(error==='probe_failed'?503:413):200,headers:{...(measured===null?{}:{'X-Convert-Reads':measured}),...(error?{'X-Convert-Error':error}:{})}});}};`}));
 }}]})).outputFiles[0].text;
 pages=(await build({stdin:{contents:"import {onRequest} from './functions/api/convert/name';export default {fetch(request,env){return onRequest({request,env});}}",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
});
beforeEach(async()=>{
 entered=new Promise(resolve=>{enter=resolve;});released=new Promise(resolve=>{release=resolve;});
 runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-01-01',d1Databases:['PROBE_DB'],outboundService:async()=>{enter();await released;return Response.json({tokens:[],lookup:{hanviet:'',meanings:[]},lookups:[]},{headers:{'X-Convert-Reads':'41'}});}}));
 db=await runtime.getD1Database('PROBE_DB');for(const statement of schema.split(';').filter(sql=>sql.trim()))await db.prepare(statement).run();
});
afterEach(async()=>{release?.();await runtime?.dispose();});

describe('independent Convert shared quota guard in workerd/D1',()=>{
 it('refunds the reserved lease to measured cost and retains no source or private Names',async()=>{
  expect((await post('known',[{key:'私名',value:'Synthetic private name'}])).status).toBe(200);
  expect(await budget()).toEqual({spent:44,lease:null,until_ms:0});
  expect((await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).results.map(row=>row.name).filter(name=>name!=='_cf_METADATA').sort()).toEqual(['convert_budget','convert_index_version']);
 });
 it.each(['candidate','match','output'])('refunds recognized %s overflow using measured reads',async text=>{
  expect((await post(text)).status).toBe(413);expect(await budget()).toMatchObject({spent:44,lease:null});
 });
 it.each(['missing','malformed','unavailable','throw'])('keeps the full reservation on unknown %s accounting',async text=>{
  const response=await post(text);expect(response.status).toBe(text==='throw'||text==='unavailable'?503:200);
  expect(await budget()).toMatchObject({spent:2000000,lease:null});expect((await post()).status).toBe(429);
 });
 it('rejects malformed Names, stale versions and oversized requests before reserving',async()=>{
  for(const names of [[{key:'',value:'x'}],[{key:'x=y',value:'x'}],[{key:'x\ny',value:'x'}],[{key:'x',value:''}],[{key:'x',value:'x\ny'}],[{key:'x',value:'x'.repeat(257)}]])expect((await post('known',names)).status).toBe(413);
  expect((await post('known',[],'old-version')).status).toBe(409);
  expect((await post('甲'.repeat(257))).status).toBe(400);
  expect((await runtime.dispatchFetch('https://private.internal/convert',{method:'POST',headers:{'X-Convert-Version':convertVersion,'Content-Type':'text/plain'},body:JSON.stringify({text:'known',names:[]})})).status).toBe(415);
  expect((await runtime.dispatchFetch('https://private.internal/convert',{method:'POST',headers:{'X-Convert-Version':convertVersion,'Content-Type':'application/json'},body:'x'.repeat(32769)})).status).toBe(413);
  expect(await budget()).toBeNull();
 });
 it('discards ignored fields near the body limit instead of burning the reservation',async()=>{
  const input={text:'known',names:[],pad:''};input.pad='x'.repeat(32768-JSON.stringify(input).length);
  const body=JSON.stringify(input);expect(new TextEncoder().encode(body).byteLength).toBe(32768);
  const response=await runtime.dispatchFetch('https://private.internal/convert',{method:'POST',headers:{'Content-Type':'application/json','X-Convert-Version':convertVersion},body});
  expect(response.status).toBe(200);expect(await budget()).toMatchObject({spent:44,lease:null});
 });
 it('checks the serialized whitelist body limit before reserving for valid Names',async()=>{
  const input={text:'known',names:Array.from({length:100},(_,index)=>({key:`k${index}`,value:'x'.repeat(256)}))};
  let remaining=32768-JSON.stringify(input).length;
  for(const name of input.names){const added=Math.min(remaining,256-name.key.length);name.key+='k'.repeat(added);remaining-=added;if(!remaining)break;}
  const body=JSON.stringify(input);expect(remaining).toBe(0);expect(new TextEncoder().encode(body).byteLength).toBe(32768);
  expect(new TextEncoder().encode(JSON.stringify({...input,includeLookup:false})).byteLength).toBeGreaterThan(32768);
  const response=await runtime.dispatchFetch('https://private.internal/convert',{method:'POST',headers:{'Content-Type':'application/json','X-Convert-Version':convertVersion},body});
  expect(response.status).toBe(413);expect(await response.json()).toEqual({error:'body_limit'});expect(await budget()).toBeNull();
 });
 it('rejects nonboolean includeLookup flags before reserving',async()=>{
  for(const includeLookup of [null,0,1,'true',{},[]]){
   const response=await runtime.dispatchFetch('https://private.internal/convert',{method:'POST',headers:{'Content-Type':'application/json','X-Convert-Version':convertVersion},body:JSON.stringify({text:'known',names:[],includeLookup})});
   expect(response.status).toBe(400);
  }
  expect(await budget()).toBeNull();
 });
 it('fails closed on index pin mismatch and can retry after a failed verification',async()=>{
  await db.prepare("UPDATE convert_index_version SET version='stale' WHERE id=1").run();
  expect((await runtime.dispatchFetch('https://private.internal/convert')).status).toBe(503);expect((await post()).status).toBe(503);expect(await budget()).toBeNull();
  await db.prepare('UPDATE convert_index_version SET version=? WHERE id=1').bind(convertVersion).run();
  expect((await runtime.dispatchFetch('https://private.internal/convert')).status).toBe(200);
 });
 it('fails closed on manifest pin mismatch without leasing',async()=>{
  await db.prepare("UPDATE convert_index_version SET manifest='[]' WHERE id=1").run();expect((await post()).status).toBe(503);expect(await budget()).toBeNull();
 });
 it('serializes overlapping requests with an atomic lease and releases after completion',async()=>{
  const first=post('hold');await entered;expect(await budget()).toMatchObject({spent:2000000});expect((await post()).status).toBe(429);release();expect((await first).status).toBe(200);expect(await budget()).toMatchObject({spent:44,lease:null});
 });
 it('does not let an expired owner refund or clear a replacement lease',async()=>{
  const first=post('hold');await entered;
  await db.prepare('UPDATE convert_budget SET spent=?,lease=?,until_ms=? WHERE day=?').bind(2500000,'replacement-owner',Date.now()+120000,day()).run();
  release();expect((await first).status).toBe(200);expect(await budget()).toMatchObject({spent:2500000,lease:'replacement-owner'});
 });
 it('rejects a live lease and a daily budget without executing the engine',async()=>{
  await db.prepare('INSERT INTO convert_budget VALUES(?,?,?,?)').bind(day(),0,'live',Date.now()+120000).run();expect((await post()).status).toBe(429);
  await db.prepare('UPDATE convert_budget SET spent=?,lease=NULL,until_ms=0 WHERE day=?').bind(1000001,day()).run();expect((await post()).status).toBe(429);expect(await budget()).toMatchObject({spent:1000001});
 });
 it('reclaims an expired lease only when the full reservation still fits',async()=>{
  await db.prepare('INSERT INTO convert_budget VALUES(?,?,?,?)').bind(day(),20,'expired',Date.now()-1).run();expect((await post()).status).toBe(200);expect(await budget()).toMatchObject({spent:64,lease:null});
 });
 it('requires the existing Pages origin/auth gate before forwarding to the private service',async()=>{
  const endpoint=new Miniflare(convertV4MiniflareOptions({workers:[{name:'pages',modules:true,script:pages,compatibilityDate:'2026-01-01',bindings:{PUBLIC_LIBRARY:'1'},d1Databases:['DB'],serviceBindings:{NAME_CONVERTER:'convert'}},{name:'convert',modules:true,script:"export default {fetch(){return Response.json({forwarded:true});}}",compatibilityDate:'2026-01-01'}]}));
  try{for(const origin of [undefined,'https://foreign.example'])expect((await endpoint.dispatchFetch('https://reader.example/api/convert/name',{method:'POST',headers:origin?{Origin:origin}:{}})).status).toBe(403);
   expect((await endpoint.dispatchFetch('https://reader.example/api/convert/name',{method:'POST',headers:{Origin:'https://reader.example'}})).status).toBe(200);
   expect((await endpoint.dispatchFetch('https://reader.example/api/convert/name',{method:'DELETE',headers:{Origin:'https://reader.example'}})).status).toBe(405);
  }finally{await endpoint.dispose();}
  const privateEndpoint=new Miniflare(convertV4MiniflareOptions({workers:[{name:'pages',modules:true,script:pages,compatibilityDate:'2026-01-01',bindings:{CLOUD_ACCESS_TOKEN_HASH:'a'.repeat(64)},d1Databases:['DB'],serviceBindings:{NAME_CONVERTER:'convert'}},{name:'convert',modules:true,script:"export default {fetch(){return Response.json({forwarded:true});}}",compatibilityDate:'2026-01-01'}]}));
  try{expect((await privateEndpoint.dispatchFetch('https://reader.example/api/convert/name')).status).toBe(401);}finally{await privateEndpoint.dispose();}
 });
 it('authenticates at Pages and forwards only Convert headers and the unchanged body',async()=>{
  const capability='c'.repeat(64),digest=createHash('sha256').update(capability).digest('hex');
  const endpoint=new Miniflare(convertV4MiniflareOptions({workers:[{name:'pages',modules:true,script:pages,compatibilityDate:'2026-01-01',bindings:{CLOUD_ACCESS_TOKEN_HASH:digest},d1Databases:['DB'],serviceBindings:{NAME_CONVERTER:'convert'}},{name:'convert',modules:true,script:"export default {async fetch(request){return Response.json({url:request.url,method:request.method,headers:Object.fromEntries(request.headers),body:await request.text()});}}",compatibilityDate:'2026-01-01'}]}));
  try{
   const body=JSON.stringify({text:'私名',names:[{key:'私名',value:'Synthetic'}],includeLookup:true});
   const headers={'Content-Type':'application/json; charset=utf-8','X-Convert-Version':convertVersion,Origin:'https://reader.example',Authorization:`Bearer ${capability}`,Cookie:'__Host-session=synthetic-private-cookie',Referer:'https://reader.example/private-book', 'User-Agent':'Synthetic browser metadata','X-Review-Metadata':'private metadata'};
   const response=await endpoint.dispatchFetch('https://reader.example/api/convert/name?browserMetadata=private',{method:'POST',headers,body});
   expect(response.status).toBe(200);const forwarded=await response.json() as {url:string;method:string;headers:Record<string,string>;body:string};
   expect(forwarded.url).toBe('https://convert.internal/name');expect(forwarded.method).toBe('POST');expect(forwarded.body).toBe(body);
   expect(forwarded.headers['content-type']).toBe(headers['Content-Type']);expect(forwarded.headers['x-convert-version']).toBe(convertVersion);
   for(const name of ['authorization','cookie','referer','user-agent','origin','x-review-metadata'])expect(forwarded.headers[name]).toBeUndefined();
   expect((await endpoint.dispatchFetch('https://reader.example/api/convert/name',{method:'POST',headers:{...headers,Authorization:'Bearer '+'d'.repeat(64)},body})).status).toBe(401);
   expect((await endpoint.dispatchFetch('https://reader.example/api/convert/name',{method:'POST',headers:{...headers,Origin:'https://foreign.example'},body})).status).toBe(403);
  }finally{await endpoint.dispose();}
 });
});
