import {afterEach,expect,it,vi} from 'vitest';
import {aiTranslate,AiTranslateClientError} from '../src/features/ai/services/ai-translate';
import {aiStreamResponse} from '../server/ai-stream-response';
import {AiRecovery} from '../src/features/ai/services/ai-recovery';
import {AiReadingSession,AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
const model='gemini-2.5-flash',fallback='gemma-4-26b-a4b-it',enc=new TextEncoder();
const failed=(code='ai_timeout',started=true,status=504)=>Object.assign(new AiTranslateClientError(code,'Synthetic',status),{answerStarted:started});
const good=(selected=model)=>({model:selected,result:'Complete translated answer.',finishReason:'STOP',inputTokens:1,outputTokens:1});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it.each(['ai_timeout','ai_network_error'])('replays a started %s stream exactly once and immediately even with zero normal retries',async code=>{
 const send=vi.fn().mockRejectedValueOnce(failed(code)).mockResolvedValueOnce('done');
 expect(await new AiRecovery().run(model,new AbortController().signal,send,false,0,undefined,false,true)).toBe('done');expect(send).toHaveBeenCalledTimes(2);
});
it.each([true,false])('no more retries if the one replay fails, answerStarted=%s',async started=>{
 const last=failed('ai_timeout',started),send=vi.fn().mockRejectedValueOnce(failed()).mockRejectedValue(last);
 await expect(new AiRecovery().run(model,new AbortController().signal,send,true,2,undefined,true,true)).rejects.toBe(last);expect(send).toHaveBeenCalledTimes(2);
});
it.each([failed('ai_timeout',false),failed('ai_rate_limited',true,429),failed('ai_auth_error',true,403)])('no special replay for silent/quota/auth errors',async error=>{
 const send=vi.fn().mockRejectedValue(error);await expect(new AiRecovery().run(model,new AbortController().signal,send,false,0,undefined,false,true)).rejects.toBe(error);expect(send).toHaveBeenCalledOnce();
});
it('Stop during failed started stream prevents the extra request',async()=>{
 const control=new AbortController(),send=vi.fn(async()=>{control.abort();throw failed();});await expect(new AiRecovery().run(model,control.signal,send,false,0,undefined,false,true)).rejects.toMatchObject({name:'AbortError'});expect(send).toHaveBeenCalledOnce();
});
it.each([false,true])('transport reports output evidence on timeout including nonpreview=%s',async preview=>{
 vi.useFakeTimers();let push!:(value:unknown)=>void,end!:()=>void;vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(new ReadableStream<Uint8Array>({start(c){end=()=>c.close();push=v=>c.enqueue(enc.encode(JSON.stringify(v)+'\n'));}}),{headers:{'Content-Type':'application/x-ndjson'}}));
 const pending=aiTranslate({text:'Synthetic source',model},undefined,undefined,preview?()=>{}:undefined).catch(e=>e);
 await vi.advanceTimersByTimeAsync(0);expect(push).toBeDefined();push(preview?{type:'text',text:'Partial.'}:{type:'progress'});push({type:'result',status:504,headers:{},data:{error:'ai_timeout'}});
 end();
 expect(await pending).toMatchObject({code:'ai_timeout',answerStarted:true});
});
it('reader uses same model twice then fallback and never caches a draft',async()=>{
 const calls:string[]=[],writes=vi.fn(async()=>true),session=new AiReadingSession(async input=>{calls.push(input.model!);if(input.model===model)throw failed();return good(fallback);},{read:async()=>undefined,write:writes});
 try{const result=await session.request({bookId:'synthetic',id:'synthetic-chapter',revision:1,text:'Synthetic original text.'},{...AI_DEFAULTS,model,fallbackModels:[fallback]},[],undefined,undefined,undefined,{immediate:true});expect(result.model).toBe(fallback);expect(calls).toEqual([model,model,fallback]);expect(writes).toHaveBeenCalledOnce();}finally{session.clear();}
});

it('fast nonpreview answer after lease is recognized and gets exactly one replay',async()=>{
 let calls=0;
 vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{
  calls++;return aiStreamResponse(new Request('https://reader.example/api/ai/translate'),async(_request,activity)=>{
   activity({requestId:'11111111-1111-4111-8111-111111111111',leaseIdHash:'a'.repeat(32),keySlot:1});activity(undefined,'Fast partial answer');
   return Response.json({error:'ai_timeout'},{status:504});
  });
 });
 await expect(new AiRecovery().run(model,new AbortController().signal,()=>aiTranslate({text:'Synthetic',model}),false,0,undefined,false,true)).rejects.toMatchObject({code:'ai_timeout',answerStarted:true});expect(calls).toBe(2);
});

it.each(['gemini-3.5-flash-lite','gemini-2.5-flash-lite','gemini-3.8-flash','gemini-3.7-flash','gemma-4-26b-a4b-it','gemini-3-flash-preview'])('bounds retries on every supported model %s, including after answer or output_limit',async excluded=>{
 vi.useFakeTimers();for(const error of [failed(),failed('ai_timeout',false),failed('ai_incomplete_result',false,502)]){
  if(error.code==='ai_incomplete_result')Object.assign(error,{reason:'output_limit'});
  const send=vi.fn().mockRejectedValue(error),job=new AiRecovery().run(excluded,new AbortController().signal,send,true,2,undefined,true,true),rejected=expect(job).rejects.toBe(error);await vi.advanceTimersByTimeAsync(4000);await rejected;expect(send).toHaveBeenCalledTimes(excluded==='gemini-2.5-flash-lite'?1:error.answerStarted?2:3);
 }
});
it('allowed 3.5 Flash also receives its one stream replay',async()=>{
 const send=vi.fn().mockRejectedValueOnce(failed()).mockResolvedValueOnce('ok');expect(await new AiRecovery().run('gemini-3.5-flash',new AbortController().signal,send,false,0,undefined,false,true)).toBe('ok');expect(send).toHaveBeenCalledTimes(2);
});
