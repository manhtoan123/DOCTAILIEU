import {afterEach,describe,expect,it,vi} from 'vitest';
import {readAiLogEvent} from '../server/ai-log';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import type {AiLogEvent} from '../src/shared/types/ai-log';
const now=Date.now(),base:AiLogEvent={id:'chapter:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',kind:'chapter',startedAt:now-1000,updatedAt:now,durationMs:1000,status:'success',model:'unknown',sourceChars:100,attempts:1};
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();resetAiKeyState();});
describe('AI journal safe contract',()=>{
 it('accepts only safe client chapter fields and reconstructs the event',()=>{expect(readAiLogEvent(base,now,true)).toEqual(base);expect(readAiLogEvent(base,now,true)).not.toBe(base);});
 it.each([
  {text:'secret source'},{prompt:'secret prompt'},{model:'AIzaSECRET'},{errorCode:'arbitrary provider body'},{reason:'raw request error'},
  {upstream:[]},{kind:'request',id:'request:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},{sourceChars:128001},{attempts:0},{durationMs:-1},
  {startedAt:now-31*86400000},{updatedAt:now+300001},{id:'chapter:real-book-id'},{status:'success',errorCode:'ai_timeout'},
 ])('rejects malformed or secret-shaped chapter fields %j',patch=>{expect(readAiLogEvent({...base,...patch},now,true)).toBeUndefined();});
 it('bounds upstream results and excludes credential-shaped nested values',()=>{
  const request={...base,id:base.id.replace('chapter:','request:'),kind:'request',upstream:[{status:429,errorCode:'ai_rate_limited',durationMs:7},{status:200,durationMs:20}]};
  expect(readAiLogEvent(request,now)).toEqual(request);expect(readAiLogEvent({...request,upstream:Array(33).fill({status:200,durationMs:1})},now)).toBeUndefined();expect(readAiLogEvent({...request,upstream:[{status:200,durationMs:1,key:'synthetic-secret'}]},now)).toBeUndefined();
 });
});
const origin='https://reader.example';
const translate=(body:unknown,accept?:string)=>new Request(origin+'/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',...(accept?{Accept:accept}:{})},body:JSON.stringify(body)});
const good={candidates:[{content:{parts:[{text:'Xin chào.'}]},finishReason:'STOP'}]};
it('observes final validation failure separately from HTTP200 and ignores observer exceptions',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({...good,candidates:[{content:{parts:[{text:'Còn dở.'}]},finishReason:'MAX_TOKENS'}]})));
 const events:AiLogEvent[]=[];const result=await handleAiTranslate(translate({text:'你好',model:'gemini-3.6-flash'}),{GEMINI_API_KEY:'synthetic-only'},event=>events.push(event));
 expect(result.status).toBe(502);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({kind:'request',status:'error',model:'gemini-3.5-flash',errorCode:'ai_incomplete_result',reason:'output_limit',sourceChars:2,upstream:[{status:200}]});expect(JSON.stringify(events)).not.toMatch(/synthetic-only|你好|Còn dở/);
 vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(good)));expect((await handleAiTranslate(translate({text:'你好'}),{GEMINI_API_KEY:'synthetic-only'},()=>{throw new Error('broken diagnostic');})).status).toBe(200);
});
it('records hidden rotation attempts while the model request ultimately succeeds',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response('{}',{status:429})).mockResolvedValueOnce(new Response(JSON.stringify(good)));
 const events:AiLogEvent[]=[];const result=await handleAiTranslate(translate({text:'你好'}),{GEMINI_API_KEYS:JSON.stringify(['synthetic-alpha','synthetic-beta'])},event=>events.push(event));
 expect(result.status).toBe(200);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({status:'success',attempts:1,upstream:[{status:429,errorCode:'ai_rate_limited'},{status:200}]});
});
it('refines a rotated HTTP400 invalid-key attempt without changing its count or successful request outcome',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({error:{message:'API_KEY_INVALID'}}),{status:400})).mockResolvedValueOnce(new Response(JSON.stringify(good)));
 const events:AiLogEvent[]=[];const result=await handleAiTranslate(translate({text:'你好'}),{GEMINI_API_KEYS:JSON.stringify(['synthetic-alpha','synthetic-beta'])},event=>events.push(event));
 expect(result.status).toBe(200);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({status:'success',attempts:1,upstream:[{status:400,errorCode:'ai_auth_error'},{status:200}]});expect(events[0].upstream).toHaveLength(2);
});
it('refines HTTP400 unsupported-location failure on the same upstream attempt',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({error:{message:'User location is not supported for the API use.'}}),{status:400}));
 const events:AiLogEvent[]=[];const result=await handleAiTranslate(translate({text:'你好'}),{GEMINI_API_KEY:'synthetic-only'},event=>events.push(event));
 expect(result.status).toBe(503);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({status:'error',errorCode:'ai_location_unavailable',reason:'upstream_http',upstream:[{status:400,errorCode:'ai_location_unavailable'}]});expect(events[0].upstream).toHaveLength(1);
});
it('emits exactly one terminal event for negotiated streaming',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('data: '+JSON.stringify(good)+'\n\n',{headers:{'Content-Type':'text/event-stream'}}));
 const events:AiLogEvent[]=[];const result=await handleAiTranslate(translate({text:'你好'},'application/x-ndjson'),{GEMINI_API_KEY:'synthetic-only'},event=>events.push(event));
 expect((await result.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1)).toMatchObject({type:'result',status:200});expect(events).toHaveLength(1);expect(events[0]).toMatchObject({status:'success',upstream:[{status:200}]});
});
it('classifies cancellation independently and never fabricates a completed result',async()=>{
 const controller=new AbortController(),events:AiLogEvent[]=[];
 const upstream=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(()=>{}));
 const request=new Request(translate({text:'你好'}),{signal:controller.signal});
 const pending=handleAiTranslate(request,{GEMINI_API_KEY:'synthetic-only'},event=>events.push(event));
 await vi.waitFor(()=>expect(upstream).toHaveBeenCalledOnce());controller.abort();
 expect((await pending).status).toBe(499);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({status:'cancelled',errorCode:'ai_cancelled',reason:'cancelled',upstream:[{status:0,errorCode:'ai_cancelled'}]});
});
it.each([[undefined,30000],['application/x-ndjson',60000]] as const)('preserves pending-fetch deadline cause for accept=%s',async(accept,deadline)=>{
 vi.useFakeTimers();const events:AiLogEvent[]=[];
 const upstream=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(()=>{}));
 const pending=handleAiTranslate(translate({text:'你好'},accept),{GEMINI_API_KEY:'synthetic-only'},event=>events.push(event));
 const response=accept?await pending:undefined,body=response?.text();
 await vi.waitFor(()=>expect(upstream).toHaveBeenCalledOnce());await vi.advanceTimersByTimeAsync(deadline);
 if(body){const wire=await body;expect(wire.trim().split('\n').map(line=>JSON.parse(line)).at(-1)).toMatchObject({type:'result',status:504});}else expect((await pending).status).toBe(504);
 expect(events).toHaveLength(1);expect(events[0]).toMatchObject({status:'error',errorCode:'ai_timeout',reason:'timeout',upstream:[{status:0,errorCode:'ai_timeout'}]});
});
