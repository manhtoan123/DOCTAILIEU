import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {expect,it} from 'vitest';
import {readAiStreamResponse} from '../src/features/ai/services/ai-stream-client';
import {readExecutionHeader,readUsageHeader} from '../src/features/ai/services/ai-execution';
import {AI_STREAM_TYPE} from '../src/features/ai/services/ai-stream-protocol';

it('review: actual workerd preserves safe execution/usage across SSE upstream and NDJSON client response',async()=>{
 const bundle=await build({stdin:{contents:"import {handleAiTranslate} from './server/ai-translate';export default {fetch(r,e){return handleAiTranslate(r,e)}}",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser'});
 const calls:{url:string;config:Record<string,unknown>}[]=[];
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-01-01',bindings:{GEMINI_API_KEY:'synthetic-runtime-config-key'},outboundService:async(request:Request)=>{
  const body=await request.json() as {generationConfig:Record<string,unknown>};calls.push({url:request.url,config:body.generationConfig});
  expect(request.headers.get('x-goog-api-key')).toBe('synthetic-runtime-config-key');expect(request.headers.get('Origin')).toBeNull();
  return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'Bản dịch tổng hợp.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:11,candidatesTokenCount:7,thoughtsTokenCount:5,totalTokenCount:23}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 }}));
 try{
  for(const model of ['gemini-3.8-flash','gemini-3.6-flash']){
   const streamed=await runtime.dispatchFetch('https://review.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',Accept:AI_STREAM_TYPE},body:JSON.stringify({text:'合成的来源。',model,temperature:.6,systemPrompt:'PRIVATE PROMPT SENTINEL',userPromptTemplate:'{{name}}{{text}}',names:{合成:'PRIVATE NAME SENTINEL'}})});
   const response=await readAiStreamResponse(streamed as unknown as Response,new AbortController().signal,()=>{});
   expect(response.status).toBe(200);const execution=readExecutionHeader(response.headers);
   expect(execution).toMatchObject({model:model==='gemini-3.6-flash'?'gemini-3.5-flash':model,temperature:model==='gemini-3.8-flash'?null:.6,maxOutputTokens:8192,thinking:'provider-default'});
   expect(readUsageHeader(response.headers,'X-AI-Thought-Tokens')).toBe(5);expect(readUsageHeader(response.headers,'X-AI-Total-Tokens')).toBe(23);
   expect(await response.json()).toMatchObject({result:'Bản dịch tổng hợp.',model,finishReason:'STOP'});
   expect(JSON.stringify([...response.headers])).not.toContain('PRIVATE');expect(JSON.stringify([...response.headers])).not.toContain('synthetic-runtime-config-key');
  }
  expect(calls).toHaveLength(2);expect(calls[0].url).toContain('/gemini-3.8-flash:streamGenerateContent');expect(calls[0].config.temperature).toBeUndefined();expect(calls[1].url).toContain('/gemini-3.5-flash:streamGenerateContent');expect(calls[1].config.temperature).toBe(.6);
 }finally{await runtime.dispose();}
},30000);
