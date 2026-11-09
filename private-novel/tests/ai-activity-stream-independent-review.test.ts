import {afterEach,expect,it,vi} from 'vitest';
import {aiTranslate} from '../src/features/ai/services/ai-translate';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {readAiStreamResponse,AiStreamProtocolError} from '../src/features/ai/services/ai-stream-client';
import {readAiUpstreamStream} from '../server/ai-upstream-stream';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {AI_STREAM_TYPE} from '../src/features/ai/services/ai-stream-protocol';
import {readKeyHealth,reserveKey,releaseKey} from '../server/ai-key-health';
import type {D1Database} from '@cloudflare/workers-types';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const model='gemini-2.5-flash',encoder=new TextEncoder();
const complete={result:'Bản dịch tiếng Việt.',model,finishReason:'STOP',inputTokens:1,outputTokens:1};
const terminal={type:'result',status:200,headers:{},data:complete};
const ndjson=(lines:unknown[])=>new Response(lines.map(line=>JSON.stringify(line)+'\n').join(''),{headers:{'Content-Type':AI_STREAM_TYPE}});
const sse=(records:unknown[])=>new Response(records.map(row=>'data: '+JSON.stringify(row)+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
const candidate=(text:string,finish=false)=>({candidates:[{index:0,content:{parts:[{text}]},...(finish?{finishReason:'STOP'}:{})}]});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();resetAiKeyState();});

it('review: negotiated first wait accepts delayed headers inside the first-text budget',async()=>{
 vi.useFakeTimers();let headers!:(value:Response)=>void,signal:AbortSignal|undefined;
 vi.stubGlobal('fetch',vi.fn((_url,init)=>{signal=init.signal;return new Promise<Response>(resolve=>headers=resolve);}));
 const pending=aiTranslate({text:'Synthetic input',model}).catch(e=>e);
 await vi.advanceTimersByTimeAsync(22000);expect(signal?.aborted).toBe(false);headers(ndjson([terminal]));expect(await pending).toEqual(complete);
});

it('review: discovering a legacy JSON response after forty seconds does not reopen its expired deadline',async()=>{
 vi.useFakeTimers();let headers!:(value:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>headers=resolve)));
 const pending=aiTranslate({text:'Synthetic input',model}).catch(e=>e);await vi.advanceTimersByTimeAsync(45000);headers(Response.json(complete));
 expect(await pending).toMatchObject({code:'ai_timeout',reason:'client_deadline'});
});

it('review: progress carrying source or secret fields is rejected and never treated as activity',async()=>{
 const activity=vi.fn();await expect(readAiStreamResponse(ndjson([{type:'progress',text:'PRIVATE SOURCE SENTINEL'},terminal]),new AbortController().signal,activity)).rejects.toBeInstanceOf(AiStreamProtocolError);expect(activity).not.toHaveBeenCalled();
});

it('review: a result envelope without EOF cannot enter the chapter cache, including after cancellation',async()=>{
 let sink!:ReadableStreamDefaultController<Uint8Array>;const cancel=vi.fn();
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({start(controller){sink=controller;},cancel}),{headers:{'Content-Type':AI_STREAM_TYPE}})));
 const source={bookId:'stream-review',id:'stream-review-chapter',revision:1,text:'Synthetic input'},settings={...AI_DEFAULTS,model,fallbackModels:[]},write=vi.fn(async()=>true),session=new AiReadingSession(aiTranslate,{read:async()=>undefined,write});
 const key=aiReadingKey(source,settings,[]),pending=session.request(source,settings,[]).catch(e=>e);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());sink.enqueue(encoder.encode(JSON.stringify(terminal)+'\n'));
 await Promise.resolve();await Promise.resolve();expect(write).not.toHaveBeenCalled();expect(session.get(key)).toBeUndefined();session.cancel(key);expect(await pending).toMatchObject({name:'AbortError'});expect(write).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledOnce();session.clear();
});

it('review: duplicate terminal envelopes fail instead of accepting the first apparent completion',async()=>{
 await expect(readAiStreamResponse(ndjson([terminal,terminal]),new AbortController().signal,()=>{})).rejects.toBeInstanceOf(AiStreamProtocolError);
});

it('review: SSE decodes every UTF-8 byte boundary without exposing thought text in its final answer',async()=>{
 const privateText='PRIVATE REASONING SENTINEL',frames=[{candidates:[{content:{parts:[{text:privateText,thought:true}]}}]},candidate('Tiếng Việt đầy đủ.',true),{candidates:[],usageMetadata:{promptTokenCount:7,candidatesTokenCount:9}}];
 const bytes=encoder.encode(frames.map(row=>'data: '+JSON.stringify(row)+'\r\n\r\n').join('')),activity=vi.fn();
 const response=new Response(new ReadableStream<Uint8Array>({start(sink){for(const byte of bytes)sink.enqueue(Uint8Array.of(byte));sink.close();}}),{headers:{'Content-Type':'text/event-stream'}});
 const result=await readAiUpstreamStream(response,new AbortController().signal,activity,1024*1024,128000);
 expect(result).toMatchObject({candidates:[{content:{parts:[{text:'Tiếng Việt đầy đủ.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:7,candidatesTokenCount:9}});expect(JSON.stringify(result)).not.toContain(privateText);expect(activity).toHaveBeenCalledOnce();
});

it('review: a terminal usage-only SSE event may omit its empty candidates array and adds no activity',async()=>{
 const activity=vi.fn(),response=sse([candidate('Bản dịch.',true),{usageMetadata:{promptTokenCount:7,candidatesTokenCount:9}}]);
 expect(await readAiUpstreamStream(response,new AbortController().signal,activity,1024*1024,128000)).toMatchObject({usageMetadata:{promptTokenCount:7,candidatesTokenCount:9}});expect(activity).toHaveBeenCalledOnce();
});

it('review: non-content SSE bytes still obey the raw byte bound and cannot fabricate progress',async()=>{
 const activity=vi.fn(),response=new Response(':'+('x'.repeat(256))+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 await expect(readAiUpstreamStream(response,new AbortController().signal,activity,128,128000)).rejects.toMatchObject({reason:'size_limit'});expect(activity).not.toHaveBeenCalled();
});

it('review: JSON-only clients keep the old non-stream endpoint and response contract',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({...candidate(complete.result,true),usageMetadata:{promptTokenCount:1,candidatesTokenCount:1}}));
 const response=await handleAiTranslate(new Request('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Synthetic input',model})}),{GEMINI_API_KEY:'synthetic-legacy-review-key'});
 expect(response.status).toBe(200);expect(response.headers.get('Content-Type')).toContain('application/json');expect(await response.json()).toEqual(complete);expect(fetch.mock.calls[0][0]).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
});

it('review: an already cancelled negotiated request sends nothing upstream and returns no partial data',async()=>{
 const stop=new AbortController();stop.abort();const fetch=vi.spyOn(globalThis,'fetch');
 const response=await handleAiTranslate(new Request('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',Accept:AI_STREAM_TYPE},body:JSON.stringify({text:'Synthetic input',model}),signal:stop.signal}),{GEMINI_API_KEY:'synthetic-cancel-review-key'});
 const rows=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({type:'result',status:499,data:{error:'ai_cancelled'}});expect(rows[0].data.result).toBeUndefined();expect(fetch).not.toHaveBeenCalled();
});

it('review: equal expiry values cannot let an old long lease release a newer JSON claim',async()=>{
 vi.useFakeTimers();vi.setSystemTime(1_900_000_000_000);
 const id='mixed-stream-legacy-owner',old=(await reserveKey(id,model,undefined,185000))!;await releaseKey(id,old,undefined,185000);
 await vi.advanceTimersByTimeAsync(150000);const next=(await reserveKey(id,model))!;
 expect(next).toBe(old);await releaseKey(id,old,undefined,185000);expect((await readKeyHealth()).get(id)?.busy_until).toBe(next);await releaseKey(id,next);expect((await readKeyHealth()).get(id)?.busy_until).toBe(0);
});

it('review: actual D1 CAS compares claim time as well as equal long/short expiry values',async()=>{
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-01-01',d1Databases:['DB']}));
 try{
  const database=await runtime.getD1Database('DB') as unknown as D1Database;
    for(const file of ['0006_ai_keys.sql','0008_ai_key_health.sql','0017_ai_key_model_blocks.sql']){const sql=(await readFile('migrations/'+file,'utf8')).replace(/--[^\n]*/g,'');for(const statement of sql.split(';').filter(s=>s.trim()))await database.prepare(statement).run();}
  const now=vi.spyOn(Date,'now').mockReturnValue(1_900_000_000_000),id='d1-mixed-stream-owner';
  const old=(await reserveKey(id,model,database,185000))!;await releaseKey(id,old,database,185000);now.mockReturnValue(1_900_000_150_000);
  const next=(await reserveKey(id,model,database))!;expect(next).toBe(old);await releaseKey(id,old,database,185000);
  expect((await readKeyHealth(database)).get(id)?.busy_until).toBe(next);await releaseKey(id,next,database);expect((await readKeyHealth(database)).get(id)?.busy_until).toBe(0);
 }finally{await runtime.dispose();}
});
