import {afterEach,describe,expect,it,vi} from 'vitest';
import {readAiLogEvent} from '../server/ai-log';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {AI_LOG_CONTEXT_HEADER,type AiLogEvent,type AiLogRequestContext} from '../src/shared/types/ai-log';
import {readAiLogRequestContext} from '../src/shared/types/ai-log-v2';

const workId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',epoch='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',now=Date.now();
const context:AiLogRequestContext={schemaVersion:2,trace:{workId,partPath:'0.1',parentPartPath:'0',purpose:'foreground',initialPurpose:'prewarm',fallbackIndex:1,fallbackCause:'output_limit'},context:{format:'txt',appVersion:'test-v2',policyVersion:'reading-v1',strategy:'split',splitDepth:1,contextChars:100}};
const chapter:AiLogEvent={id:`chapter:${workId}`,kind:'chapter',startedAt:now-12000,updatedAt:now,durationMs:12000,status:'success',model:'gemini-3.5-flash',sourceChars:100,attempts:2,schemaVersion:2,telemetry:{metricVersion:1,trace:context.trace,context:context.context,client:{timing:{epoch,sequence:2,foregroundMs:10000,previewVisibleMs:11000,acceptedContentVisibleMs:12000,workCompleteMs:12000,foregroundAcceptedMs:2000,foregroundCompleteMs:2000},leafParts:2,acceptedLeafParts:2,validation:'accepted',recovery:'split',completeness:'observed',parts:[{partPath:'0.1',parentPartPath:'0',requestId:'cccccccc-cccc-cccc-cccc-cccccccccccc',model:'gemini-3.5-flash',validation:'accepted'}]}}};
afterEach(()=>{vi.restoreAllMocks();resetAiKeyState();});
describe('v2 allowlist with v1 compatibility',()=>{
 it('retains the exact v1 shape and bounded client-only v2 clock metadata',()=>{
  const {schemaVersion,telemetry,...legacy}=chapter;expect(schemaVersion).toBe(2);expect(telemetry).toBeDefined();
  expect(readAiLogEvent(legacy,now,true)).toEqual(legacy);expect(readAiLogEvent(chapter,now,true)).toEqual(chapter);
 });
 it.each([
  {source:'private source'},{server:{timing:{clock:'server-monotonic',completeMs:12}}},
  {client:{...chapter.telemetry!.client,timing:{epoch,sequence:0}}},
  {client:{...chapter.telemetry!.client,timing:{epoch,sequence:2,acceptedContentVisibleMs:-1}}},
  {client:{...chapter.telemetry!.client,timing:{epoch,sequence:2,prompt:'private prompt'}}},
  {trace:{...context.trace,workId:'real-book-id'}},{trace:{...context.trace,partPath:'0.1',parentPartPath:'0.2'}},
  {context:{appVersion:'Private novel name with spaces'}},
  {client:{...chapter.telemetry!.client,parts:Array(33).fill(chapter.telemetry!.client!.parts![0])}},
  {client:{...chapter.telemetry!.client,parts:[{partPath:'0',validation:'accepted',requestId:'secret-request'}]}},
 ])('rejects unsafe or inconsistent nested metadata %j',patch=>{expect(readAiLogEvent({...chapter,telemetry:{...chapter.telemetry,...patch}},now,true)).toBeUndefined();});
 it('rejects request writes, unsupported versions, mismatched work ownership and raw upstream claims',()=>{
  for(const patch of [{schemaVersion:3},{id:'chapter:cccccccc-cccc-cccc-cccc-cccccccccccc'},{upstream:[]},{kind:'request',id:'request:cccccccc-cccc-cccc-cccc-cccccccccccc'}])expect(readAiLogEvent({...chapter,...patch},now,true)).toBeUndefined();
 });
 it('ignores unsupported, large, non-ASCII and content-bearing request metadata as a unit',()=>{
  expect(readAiLogRequestContext(JSON.stringify(context))).toEqual(context);
  for(const raw of [null,'{}','invalid',JSON.stringify({...context,schemaVersion:3}),JSON.stringify({...context,text:'private source'}),JSON.stringify({...context,trace:{...context.trace,purpose:'你好'}}),' '.repeat(2049)])expect(readAiLogRequestContext(raw)).toBeUndefined();
 });
});
const good={candidates:[{content:{parts:[{text:'Bản dịch tổng hợp.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:7,thoughtsTokenCount:3,totalTokenCount:22}};
const request=(header?:string,extraBody={})=>new Request('https://synthetic.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',...(header?{[AI_LOG_CONTEXT_HEADER]:header}:{}),'X-AI-Request-ID':'attacker-controlled'},body:JSON.stringify({text:'你好',model:'gemini-3.6-flash',temperature:0.7,systemPrompt:'synthetic private prompt',names:{'你好':'Tên riêng'},...extraBody})});
it('v2 links server-generated request facts without modifying any provider payload or reflecting input',async()=>{
 const calls:{url:string;body:string;context:string|null}[]=[],events:AiLogEvent[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const r=new Request(input,init);calls.push({url:r.url,body:await r.text(),context:r.headers.get(AI_LOG_CONTEXT_HEADER)});return Response.json(good);});
 const first=await handleAiTranslate(request(),{GEMINI_API_KEY:'synthetic-secret'},e=>events.push(e));
 const second=await handleAiTranslate(request(JSON.stringify(context)),{GEMINI_API_KEY:'synthetic-secret'},e=>events.push(e));
 expect(first.status).toBe(200);expect(second.status).toBe(200);expect(calls[0]).toEqual(calls[1]);expect(calls[0].context).toBeNull();
 expect(events[0].telemetry?.trace).toBeUndefined();expect(events[1]).toMatchObject({schemaVersion:2,model:'gemini-3.5-flash',telemetry:{metricVersion:1,trace:context.trace,context:context.context,server:{execution:{model:'gemini-3.5-flash',temperature:0.7,thinking:'provider-default',maxOutputTokens:8192},usage:{inputTokens:12,outputTokens:7,thinkingTokens:3,totalTokens:22},finishReason:'STOP',timing:{clock:'server-monotonic'}}}});
 expect(events[1].id).toBe(`request:${second.headers.get('X-AI-Request-ID')}`);expect(second.headers.get('X-AI-Request-ID')).not.toBe('attacker-controlled');expect(second.headers.get(AI_LOG_CONTEXT_HEADER)).toBeNull();
 expect(readAiLogEvent(events[1])).toEqual(events[1]);expect(JSON.stringify(events)).not.toMatch(/你好|Tên riêng|synthetic-secret|synthetic private prompt|attacker-controlled/);
});
it('keeps validated execution, finish and token evidence when HTTP200 output fails final validation',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({...good,candidates:[{...good.candidates[0],finishReason:'MAX_TOKENS'}]}));
 const events:AiLogEvent[]=[],ready:Promise<void>[]=[];const response=await handleAiTranslate(request(JSON.stringify(context)),{GEMINI_API_KEY:'synthetic-secret'},(e,p)=>{events.push(e);if(p)ready.push(p);});await Promise.all(ready);
 expect(response.status).toBe(502);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({status:'error',errorCode:'ai_incomplete_result',upstream:[{status:200}],telemetry:{server:{execution:{model:'gemini-3.5-flash'},finishReason:'MAX_TOKENS',usage:{inputTokens:12}}}});
});
it('retains unknown usage and never infers thinking from absent provider fields',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({candidates:good.candidates}));const events:AiLogEvent[]=[];
 expect((await handleAiTranslate(request(JSON.stringify(context)),{GEMINI_API_KEY:'synthetic-secret'},e=>events.push(e))).status).toBe(200);
 expect(events[0].telemetry?.server?.usage).toBeUndefined();expect(events[0].telemetry?.server?.timing.firstChunkMs).toBeUndefined();
});
