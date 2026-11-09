import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {expect,it} from 'vitest';
import {AI_STREAM_TYPE} from '../src/features/ai/services/ai-stream-protocol';
import {readAiStreamResponse} from '../src/features/ai/services/ai-stream-client';
it('workerd/D1 cycles Groq pool atomically across requests and streams its exact model',async()=>{
 const bundle=await build({stdin:{contents:"import {handleAiTranslate} from './server/ai-translate';export default {fetch(r,e){return handleAiTranslate(r,e)}}",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser'});
 const calls:string[]=[],keys=['synthetic-runtime-groq-a','synthetic-runtime-groq-b','synthetic-runtime-groq-c'];
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-01-01',d1Databases:['DB'],bindings:{GROQ_API_KEYS:JSON.stringify(keys)},outboundService:async(request:Request)=>{
  expect(request.url).toBe('https://api.groq.com/openai/v1/chat/completions');calls.push(request.headers.get('Authorization')!);
  const body=await request.json() as {model:string;stream:boolean};expect(body.model).toBe('qwen/qwen3.8-27b');
  const message={choices:[{index:0,message:{content:'Bản dịch tổng hợp.'},finish_reason:'stop'}]};
  return body.stream?new Response('data: '+JSON.stringify({choices:[{index:0,delta:{content:'Bản dịch tổng hợp.'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}):Response.json(message);
 }}));
 try{
  const db=await runtime.getD1Database('DB');await db.exec((await readFile('migrations/0008_ai_key_health.sql','utf8')).replace(/^--.*$/gm,'').replace(/\r?\n/g,' '));
  const run=async(stream=false)=>{
   const raw=await runtime.dispatchFetch('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',...(stream?{Accept:AI_STREAM_TYPE}:{})},body:JSON.stringify({model:'qwen/qwen3.8-27b',text:'合成来源。'})});
   const response=stream?await readAiStreamResponse(raw as unknown as Response,new AbortController().signal,()=>{}):raw;
   expect(response.status).toBe(200);expect(await response.json()).toMatchObject({model:'qwen/qwen3.8-27b',result:'Bản dịch tổng hợp.'});
  };
  for(let i=0;i<7;i++)await run(i===6);
  expect(calls).toEqual([...keys,...keys,keys[0]].map(k=>`Bearer ${k}`));
  const start=calls.length;await Promise.all([run(),run()]);expect(new Set(calls.slice(start)).size).toBe(2);
  const health=await db.prepare('SELECT busy_until FROM ai_key_health').all<{busy_until:number}>();expect(health.results.every(r=>r.busy_until===0)).toBe(true);
 }finally{await runtime.dispose();}
},30000);
