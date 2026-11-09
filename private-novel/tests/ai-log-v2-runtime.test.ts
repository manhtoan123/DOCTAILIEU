import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {expect,it} from 'vitest';
import {AI_LOG_CONTEXT_HEADER,type AiLogEvent,type AiLogResponse} from '../src/shared/types/ai-log';
const origin='https://synthetic.example',workId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',epoch='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const trace={workId,partPath:'0',purpose:'foreground',initialPurpose:'prewarm',fallbackIndex:1} as const;
async function fixture(outboundService?:(request:Request)=>Promise<Response>){
 const bundle=await build({stdin:{contents:`import worker from './server/ai-worker';import {handleAiLogs} from './server/ai-log';export default {fetch(r,e,c){return new URL(r.url).pathname.endsWith('/logs')?handleAiLogs(r,e):worker.fetch(r,e,c)}}`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser'});
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-01-01',d1Databases:['DB'],bindings:{PUBLIC_LIBRARY:'1',GEMINI_API_KEYS:JSON.stringify(['synthetic-v2-alpha','synthetic-v2-beta'])},...(outboundService?{outboundService}:{})}));
 const db=await runtime.getD1Database('DB');
 for(const name of ['0006_ai_keys.sql','0008_ai_key_health.sql','0016_ai_log.sql','0017_ai_key_model_blocks.sql']){const sql=(await readFile('migrations/'+name,'utf8')).replace(/--[^\n]*/g,'');for(const statement of sql.split(';').filter(s=>s.trim()))await db.prepare(statement).run();}
 const get=async()=>await (await runtime.dispatchFetch(origin+'/api/ai/logs')).json() as AiLogResponse;
 const post=(body:unknown)=>runtime.dispatchFetch(origin+'/api/ai/logs',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {runtime,db,get,post};
}
it('native D1 negotiates additive v1/v2 and orders work snapshots by epoch/sequence without trusting wall-clock order',async()=>{
 const {runtime,db,get,post}=await fixture();
 try{
  const now=Date.now();
  const event:AiLogEvent={id:`chapter:${workId}`,kind:'chapter',startedAt:now-2000,updatedAt:now,durationMs:1000,status:'error',model:'unknown',sourceChars:20,attempts:1,errorCode:'ai_timeout',schemaVersion:2,telemetry:{metricVersion:1,trace,client:{timing:{epoch,sequence:1},validation:'rejected'}}};
  expect((await get()).schemaVersions).toEqual([1,2]);expect((await post(event)).status).toBe(200);
  const success:AiLogEvent={...event,status:'success',errorCode:undefined,updatedAt:now-500,durationMs:1200,attempts:2,telemetry:{...event.telemetry!,client:{timing:{epoch,sequence:2,workCompleteMs:1200},validation:'accepted'}}};
  expect((await post(success)).status).toBe(200);expect((await get()).rows[0]).toMatchObject({status:'success',durationMs:1200,telemetry:{client:{timing:{sequence:2}}}});
  // An older completion/error replay, a different clock epoch, a duration rollback
  // and a v1 downgrade must each leave the terminal record intact.
  for(const patch of [
   {...event,attempts:3,updatedAt:now+1},
   {...event,durationMs:1300,attempts:3,telemetry:{...event.telemetry!,client:{timing:{epoch:'cccccccc-cccc-cccc-cccc-cccccccccccc',sequence:4}}}},
   {...success,durationMs:900,telemetry:{...success.telemetry!,client:{timing:{epoch,sequence:4}}}},
   {...event,durationMs:1300,attempts:3,telemetry:{...event.telemetry!,client:{timing:{epoch,sequence:4}}}},
   {...success,schemaVersion:undefined,telemetry:undefined,attempts:3,updatedAt:now+2},
  ])expect((await post(patch)).status).toBe(200);
  expect((await get()).rows[0]).toMatchObject({status:'success',durationMs:1200,telemetry:{client:{timing:{epoch,sequence:2}}}});
  const visible={...success,telemetry:{...success.telemetry!,client:{timing:{epoch,sequence:3,workCompleteMs:1200,foregroundMs:2000,acceptedContentVisibleMs:2000,foregroundAcceptedMs:0,foregroundCompleteMs:0},validation:'accepted'}}};
  expect((await post(visible)).status).toBe(200);expect((await get()).rows[0]).toMatchObject({status:'success',telemetry:{client:{timing:{sequence:3,foregroundAcceptedMs:0}}}});
  expect((await post({...visible,telemetry:{...visible.telemetry,server:{timing:{clock:'server-monotonic',completeMs:0}}}})).status).toBe(400);
  expect((await post({...visible,kind:'request',id:'request:dddddddd-dddd-dddd-dddd-dddddddddddd'})).status).toBe(400);
  expect((await post({...visible,telemetry:{...visible.telemetry,client:{...visible.telemetry.client,source:'private source'}}})).status).toBe(400);
  expect((await post({...visible,telemetry:{...visible.telemetry,context:{appVersion:'a'.repeat(9000)}}})).status).toBe(400);
  expect((await db.prepare('SELECT COUNT(*) AS n FROM ai_log').first<{n:number}>())?.n).toBe(1);
  // Both versions coexist; no migration/backfill is needed for the JSON envelope.
  const legacy={...event,id:'chapter:dddddddd-dddd-dddd-dddd-dddddddddddd',schemaVersion:undefined,telemetry:undefined};expect((await post(legacy)).status).toBe(200);expect((await get()).rows).toHaveLength(2);
 }finally{await runtime.dispose();}
},30000);
it('native Worker captures real boundary rotation/stream timing/usage and ignores unsafe context while journal failure stays fail-open',async()=>{
 let calls=0;const payloads:string[]=[],forwardedContexts:(string|null)[]=[];
 const {runtime,db,get}=await fixture(async request=>{
  calls++;payloads.push(await request.text());forwardedContexts.push(request.headers.get(AI_LOG_CONTEXT_HEADER));
  if(calls===1)return new Response('{}',{status:429});
  const data={candidates:[{content:{parts:[{text:'Bản dịch tổng hợp.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:5,candidatesTokenCount:9,thoughtsTokenCount:2,totalTokenCount:16}};
  return new Response('data: '+JSON.stringify(data)+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 });
 try{
  const context={schemaVersion:2,trace,context:{format:'txt',appVersion:'test-v2',strategy:'whole'}};
  const translate=(header=JSON.stringify(context))=>runtime.dispatchFetch(origin+'/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson',[AI_LOG_CONTEXT_HEADER]:header,'X-AI-Request-ID':'injected-request-id'},body:JSON.stringify({text:'你好',systemPrompt:'synthetic private prompt',names:{'你好':'Tên riêng'}})});
  const response=await translate(),wire=await response.text(),events=wire.trim().split('\n').map(line=>JSON.parse(line));expect(events.at(-1)).toMatchObject({type:'result',status:200});
  await expect.poll(async()=>Number((await db.prepare('SELECT COUNT(*) AS n FROM ai_log').first<{n:number}>())?.n)).toBe(1);
  const event=(await get()).rows[0];
  expect(event).toMatchObject({schemaVersion:2,status:'success',telemetry:{trace,context:{format:'txt'},server:{execution:{model:'gemini-3.5-flash',maxOutputTokens:8192,thinking:'provider-default'},usage:{inputTokens:5,outputTokens:9,thinkingTokens:2,totalTokens:16},timing:{clock:'server-monotonic'},finishReason:'STOP'}},upstream:[{status:429,errorCode:'ai_rate_limited'},{status:200}]});
  const timing=event.telemetry!.server!.timing;
  expect(event.upstream).toHaveLength(2);expect(timing.preparationMs).toBeGreaterThanOrEqual(0);expect(timing.firstSendMs).toBeGreaterThanOrEqual(timing.preparationMs!);expect(timing.admissionMs).toBe(timing.firstSendMs!-timing.preparationMs!);expect(timing.headersMs).toBeGreaterThanOrEqual(timing.firstSendMs!);expect(timing.firstChunkMs).toBeGreaterThanOrEqual(timing.headersMs!);expect(timing.completeMs).toBeGreaterThanOrEqual(timing.firstChunkMs!);
  expect(forwardedContexts.every(value=>value===null)).toBe(true);expect(new Set(payloads).size).toBe(1);
  expect(JSON.stringify(await get())).not.toMatch(/你好|Tên riêng|synthetic private prompt|synthetic-v2-|injected-request-id|leaseIdHash|keySlot/);expect(wire).not.toContain(workId);
  const invalid=await translate(JSON.stringify({...context,prompt:'private source'}));expect((await invalid.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1)).toMatchObject({type:'result',status:200});
  await expect.poll(async()=>Number((await db.prepare('SELECT COUNT(*) AS n FROM ai_log').first<{n:number}>())?.n)).toBe(2);
  const unknown=(await get()).rows.find(row=>row.id!==event.id)!;expect(unknown.telemetry?.trace).toBeUndefined();expect(unknown.telemetry?.context).toBeUndefined();
  await db.prepare('DROP TABLE ai_log').run();const failOpen=await translate();expect((await failOpen.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1)).toMatchObject({type:'result',status:200});
 }finally{await runtime.dispose();}
},30000);
