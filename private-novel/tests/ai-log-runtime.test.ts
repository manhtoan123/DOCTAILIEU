import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {expect,it} from 'vitest';
import type {AiLogEvent,AiLogResponse} from '../src/shared/types/ai-log';
import {AI_STREAM_FIRST_MS} from '../src/features/ai/services/ai-stream-protocol';
const origin='https://synthetic.example',id='chapter:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
async function runtimeFixture(outboundService?: (request:Request)=>Promise<Response>,accelerateDeadlines=false){
 // Test-only clock acceleration preserves the production timer/abort path.
 const timer=accelerateDeadlines?`const nativeTimer=globalThis.setTimeout;globalThis.setTimeout=(fn,delay,...args)=>nativeTimer(fn,delay===30000||delay===${AI_STREAM_FIRST_MS}?100:delay,...args);`:'';
 const bundle=await build({stdin:{contents:`import worker from './server/ai-worker';import {handleAiLogs} from './server/ai-log';${timer}export default {fetch(r,e,c){return new URL(r.url).pathname.endsWith('/logs')?handleAiLogs(r,e):worker.fetch(r,e,c)}}`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser'});
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-01-01',d1Databases:['DB'],bindings:{PUBLIC_LIBRARY:'1',GEMINI_API_KEYS:JSON.stringify(['synthetic-log-alpha','synthetic-log-beta'])},...(outboundService?{outboundService}:{})}));
 const db=await runtime.getD1Database('DB');
 for(const name of ['0006_ai_keys.sql','0008_ai_key_health.sql','0016_ai_log.sql','0017_ai_key_model_blocks.sql']){const sql=(await readFile('migrations/'+name,'utf8')).replace(/--[^\n]*/g,'');for(const statement of sql.split(';').filter(s=>s.trim()))await db.prepare(statement).run();}
 return {runtime,db};
}
it('native D1/HTTP enforces auth-origin, field bounds, idempotence and monotonic successful chapter completion',async()=>{
 const {runtime,db}=await runtimeFixture();
 try{
  const now=Date.now(),event:AiLogEvent={id,kind:'chapter',startedAt:now-1000,updatedAt:now,durationMs:1000,status:'error',model:'unknown',errorCode:'ai_timeout',reason:'timeout',sourceChars:100,attempts:1};
  const post=(body:unknown,requestOrigin=origin)=>runtime.dispatchFetch(origin+'/api/ai/logs',{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  expect((await post(event,'https://other.example')).status).toBe(403);
  expect((await post({...event,kind:'request',id:id.replace('chapter:','request:')})).status).toBe(400);
  expect((await post({...event,model:'synthetic-secret-key'})).status).toBe(400);
  expect((await post({...event,prompt:'synthetic prompt'})).status).toBe(400);
  expect((await post({...event,extra:'x'.repeat(9000)})).status).toBe(400);
  expect((await post(event)).status).toBe(200);expect((await post(event)).status).toBe(200);
  const complete={...event,attempts:2,updatedAt:now+1,status:'success',errorCode:undefined,reason:undefined};
  expect((await post(complete)).status).toBe(200);
  await post({...event,attempts:3,updatedAt:now+2});
  const response=await runtime.dispatchFetch(origin+'/api/ai/logs');expect(response.headers.get('X-Library-Access')).toBe('public');const data=await response.json() as AiLogResponse;
  expect(data).toMatchObject({limit:5000,retentionDays:30});expect(data.rows).toHaveLength(1);expect(data.rows[0]).toMatchObject({status:'success',attempts:2});expect(data.earliest).toBe(event.startedAt);
  expect((await db.prepare('SELECT COUNT(*) AS total FROM ai_log').first<{total:number}>())?.total).toBe(1);
  expect((await runtime.dispatchFetch(origin+'/api/ai/logs',{method:'DELETE',headers:{Origin:origin}})).status).toBe(405);
 }finally{await runtime.dispose();}
},30000);
it('native Worker records pending-fetch deadline as timeout for JSON and stream-first timers',async()=>{
 const {runtime,db}=await runtimeFixture(()=>new Promise<Response>(()=>{}),true);
 try{
  for(const accept of [undefined,'application/x-ndjson']){
   const response=await runtime.dispatchFetch(origin+'/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',...(accept?{Accept:accept}:{})},body:JSON.stringify({text:'你好'})});
   if(accept)expect((await response.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1)).toMatchObject({type:'result',status:504});else expect(response.status).toBe(504);
  }
  await expect.poll(async()=>Number((await db.prepare('SELECT COUNT(*) AS total FROM ai_log').first<{total:number}>())?.total)).toBe(2);
  const data=await (await runtime.dispatchFetch(origin+'/api/ai/logs')).json() as AiLogResponse;
  expect(data.rows).toHaveLength(2);for(const event of data.rows)expect(event).toMatchObject({status:'error',errorCode:'ai_timeout',reason:'timeout',upstream:[{status:0,errorCode:'ai_timeout'}]});
 }finally{await runtime.dispose();}
},30000);
it('native D1 atomically bounds retention and capacity and rejects stale retry rows',async()=>{
 const {runtime,db}=await runtimeFixture();
 try{
  const now=Date.now(),event:AiLogEvent={id,kind:'chapter',startedAt:now,updatedAt:now,durationMs:0,status:'error',model:'unknown',errorCode:'invalid_result',sourceChars:0,attempts:2};
  const post=(body:unknown)=>runtime.dispatchFetch(origin+'/api/ai/logs',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  await db.prepare(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<5000) INSERT INTO ai_log (id,kind,started_at,updated_at,received_at,status,attempts,event) SELECT printf('chapter:%08x-0000-0000-0000-000000000000',n),'chapter',?-n,?-n,?,'error',1,json_set(?,'$.id',printf('chapter:%08x-0000-0000-0000-000000000000',n),'$.startedAt',?-n,'$.updatedAt',?-n,'$.attempts',1) FROM seq`).bind(now,now,now,JSON.stringify(event),now,now).run();
  await db.prepare('INSERT INTO ai_log VALUES (?,?,?,?,?,?,?,?)').bind('expired','chapter',now-31*86400000,now-31*86400000,now,'error',1,'{}').run();
  expect((await post(event)).status).toBe(200);
  expect((await db.prepare('SELECT COUNT(*) AS total FROM ai_log').first<{total:number}>())?.total).toBe(5000);
  expect(await db.prepare('SELECT id FROM ai_log WHERE id=?').bind('expired').first()).toBeNull();
  await post({...event,attempts:1,updatedAt:now+1,status:'cancelled',errorCode:'ai_cancelled'});
  const data=await (await runtime.dispatchFetch(origin+'/api/ai/logs')).json() as AiLogResponse;
  expect(data.rows).toHaveLength(5000);expect(data.rows[0]).toMatchObject({id,attempts:2,status:'error'});
 }finally{await runtime.dispose();}
},30000);
it('native Worker waitUntil persists one request after streamed validation, hidden key rotation, and stays fail-open on unavailable journal',async()=>{
 let calls=0,invalid=false;
 const {runtime,db}=await runtimeFixture(async request=>{
  calls++;if(calls===1)return new Response('{}',{status:429});
  const data={candidates:[{content:{parts:[{text:'Đã dịch.'}]},finishReason:invalid?'MAX_TOKENS':'STOP'}]};
  return new Response(request.url.includes('streamGenerateContent')?'data: '+JSON.stringify(data)+'\n\n':JSON.stringify(data),{headers:{'Content-Type':request.url.includes('streamGenerateContent')?'text/event-stream':'application/json'}});
 });
 try{
  const translate=()=>runtime.dispatchFetch(origin+'/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify({text:'你好',systemPrompt:'synthetic-private-prompt'})});
  const response=await translate(),wire=await response.text();expect(wire.trim().split('\n').map(line=>JSON.parse(line)).at(-1)).toMatchObject({type:'result',status:200});
  await expect.poll(async()=>Number((await db.prepare('SELECT COUNT(*) AS total FROM ai_log').first<{total:number}>())?.total)).toBe(1);
  const first=await (await runtime.dispatchFetch(origin+'/api/ai/logs')).json() as AiLogResponse;
  expect(first.rows).toHaveLength(1);expect(first.rows[0]).toMatchObject({kind:'request',status:'success',model:'gemini-3.5-flash',attempts:1,upstream:[{status:429,errorCode:'ai_rate_limited'},{status:200}]});
  expect(JSON.stringify(first)).not.toMatch(/你好|Đã dịch|synthetic-log-|synthetic-private-prompt|keySlot|label/);
  invalid=true;const failed=await translate();expect((await failed.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1)).toMatchObject({type:'result',status:502});
  await expect.poll(async()=>Number((await db.prepare('SELECT COUNT(*) AS total FROM ai_log').first<{total:number}>())?.total)).toBe(2);
  const rows=(await (await runtime.dispatchFetch(origin+'/api/ai/logs')).json() as AiLogResponse).rows;expect(rows.find(r=>r.status==='error')).toMatchObject({errorCode:'ai_incomplete_result',reason:'output_limit',upstream:[{status:200}]});
  await db.prepare('DROP TABLE ai_log').run();invalid=false;expect((await (await translate()).text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1)).toMatchObject({type:'result',status:200});
  expect((await runtime.dispatchFetch(origin+'/api/ai/logs')).status).toBe(503);
 }finally{await runtime.dispose();}
},30000);
it('native Worker journals safe HTTP400 key/location classification after bounded diagnostic parsing',async()=>{
 let calls=0,location=false;
 const {runtime,db}=await runtimeFixture(async()=>{
  calls++;if(location||calls===1)return new Response(JSON.stringify({error:{message:location?'User location is not supported for the API use.':'API_KEY_INVALID'}}),{status:400});
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Đã dịch.'}]},finishReason:'STOP'}]}));
 });
 try{
  const translate=()=>runtime.dispatchFetch(origin+'/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'你好'})});
  const success=await translate();expect(success.status).toBe(200);await success.text();
  await expect.poll(async()=>Number((await db.prepare('SELECT COUNT(*) AS total FROM ai_log').first<{total:number}>())?.total)).toBe(1);
  const first=(await (await runtime.dispatchFetch(origin+'/api/ai/logs')).json() as AiLogResponse).rows[0];expect(first).toMatchObject({status:'success',attempts:1,upstream:[{status:400,errorCode:'ai_auth_error'},{status:200}]});expect(first.upstream).toHaveLength(2);
  location=true;expect((await translate()).status).toBe(503);
  await expect.poll(async()=>Number((await db.prepare('SELECT COUNT(*) AS total FROM ai_log').first<{total:number}>())?.total)).toBe(2);
  const rows=(await (await runtime.dispatchFetch(origin+'/api/ai/logs')).json() as AiLogResponse).rows;expect(rows.find(row=>row.status==='error')).toMatchObject({errorCode:'ai_location_unavailable',reason:'upstream_http',upstream:[{status:400,errorCode:'ai_location_unavailable'}]});expect(calls).toBe(3);
 }finally{await runtime.dispose();}
},30000);
