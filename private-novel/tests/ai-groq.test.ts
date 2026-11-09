import {afterEach,describe,expect,it,vi} from 'vitest';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {AI_STREAM_TYPE} from '../src/features/ai/services/ai-stream-protocol';
import {readAiStreamResponse} from '../src/features/ai/services/ai-stream-client';
const model='qwen/qwen3.8-27b',keys=['synthetic-groq-a','synthetic-groq-b','synthetic-groq-c'];
const env={GROQ_API_KEYS:JSON.stringify(keys),GEMINI_API_KEY:'synthetic-google-only'};
const payload=(reason='stop')=>({choices:[{index:0,message:{content:'Xin chào.',reasoning:'INTERNAL ONLY'},finish_reason:reason}],usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}});
const request=(stream=false,signal?:AbortSignal)=>new Request('https://reader.test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',...(stream?{Accept:AI_STREAM_TYPE}:{})},body:JSON.stringify({model,text:'你好'}),signal});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();resetAiKeyState();});
describe('Groq translation contract',()=>{
 it('cycles the supplied order per use, including identical clock ticks, without Google credentials',async()=>{
  vi.spyOn(Date,'now').mockReturnValue(1000000);
  const calls:string[]=[];
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
   expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
   calls.push(new Headers(init?.headers).get('Authorization')!);
   expect(new Headers(init?.headers).has('x-goog-api-key')).toBe(false);
   expect(JSON.parse(init!.body as string)).toMatchObject({model,reasoning_effort:'none',max_completion_tokens:8192});
   return Response.json(payload());
  });
  for(let i=0;i<7;i++){
   const result=await handleAiTranslate(request(),env);expect(result.status).toBe(200);
   expect(await result.json()).toMatchObject({model,result:'Xin chào.',inputTokens:10,outputTokens:4});
   expect(JSON.stringify([...result.headers])).not.toContain('synthetic');
  }
  expect(calls).toEqual([...keys,...keys,keys[0]].map(k=>`Bearer ${k}`));
 });
 it('rotates quota to another key while staying on the exact model',async()=>{
  const spy=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response('',{status:429,headers:{'Retry-After':'3'}})).mockResolvedValueOnce(Response.json(payload()));
  expect((await handleAiTranslate(request(),env)).status).toBe(200);
  expect(spy.mock.calls.map(c=>JSON.parse(c[1]!.body as string).model)).toEqual([model,model]);
  expect(new Headers(spy.mock.calls[1][1]?.headers).get('Authorization')).toBe(`Bearer ${keys[1]}`);
 });
 it('does not send a Google key when Groq is not configured',async()=>{
  const spy=vi.spyOn(globalThis,'fetch');const res=await handleAiTranslate(request(),{GEMINI_API_KEY:'synthetic-google-only'});
  expect(res.status).toBe(503);expect(await res.json()).toEqual({error:'ai_not_configured'});expect(spy).not.toHaveBeenCalled();
 });
 it('rejects truncated answers',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json(payload('length')));
  const res=await handleAiTranslate(request(),env);expect(res.status).toBe(502);expect(res.headers.get('X-AI-Failure-Reason')).toBe('output_limit');
 });
 it('rejects an upstream model mismatch rather than claiming the selected model',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({...payload(),model:'another/model'}));
  const res=await handleAiTranslate(request(),env);expect(res.status).toBe(502);expect(await res.json()).toEqual({error:'ai_invalid_response'});
 });
 it('streams answer only, validates finish and captures usage',async()=>{
  const frames=[{choices:[{index:0,delta:{role:'assistant',reasoning:'PRIVATE THOUGHT'},finish_reason:null}]},{choices:[{index:0,delta:{content:'Xin chào.'},finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:'stop'}]},{choices:[],usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}}];
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(frames.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}));
  const res=await readAiStreamResponse(await handleAiTranslate(request(true),env),new AbortController().signal,()=>{});
  expect(res.status).toBe(200);const data=await res.json();expect(data).toMatchObject({model,result:'Xin chào.',inputTokens:10,outputTokens:4});expect(JSON.stringify(data)).not.toContain('THOUGHT');
 });
 it('rejects unfinished streams and explicit Stop releases the active key',async()=>{
  const spy=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response('data: '+JSON.stringify({choices:[{index:0,delta:{content:'dở dang'},finish_reason:null}]})+'\n\n',{headers:{'Content-Type':'text/event-stream'}}));
  const res=await readAiStreamResponse(await handleAiTranslate(request(true),env),new AbortController().signal,()=>{});expect(res.status).toBe(502);
  spy.mockImplementationOnce(async(_u,init)=>{await new Promise((_ok,reject)=>init!.signal!.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError'))));return Response.json(payload());});
  const ctrl=new AbortController(),pending=handleAiTranslate(request(false,ctrl.signal),env);await vi.waitFor(()=>expect(spy).toHaveBeenCalledTimes(2));ctrl.abort();expect((await pending).status).toBe(499);
  spy.mockResolvedValueOnce(Response.json(payload()));expect((await handleAiTranslate(request(),env)).status).toBe(200);
 });
});
