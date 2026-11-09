import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey,type AiReadingSource} from '../src/features/ai/services/ai-reading';
import {AiRecovery,isTransientAiFailure} from '../src/features/ai/services/ai-recovery';
import {AiTranslateClientError,type AiTranslateClientRequest,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';

const first='gemini-3.5-flash',last='gemini-2.5-flash';
const source=(id='chapter'):AiReadingSource=>({bookId:'synthetic-foreground-latency',id,revision:1,text:'甲'.repeat(2999)});
const selected={...AI_DEFAULTS,model:first,fallbackModels:[last]};
const answer=(model=last,result='Bản dịch hoàn chỉnh.'):AiTranslateClientResponse=>({model,result,finishReason:'STOP',inputTokens:1,outputTokens:2});
const failure=(code='ai_timeout',reason?:string,status=504)=>new AiTranslateClientError(code,'Synthetic failure',status,reason);
const sessions:AiReadingSession[]=[];
const session=(send:ConstructorParameters<typeof AiReadingSession>[0])=>{const value=new AiReadingSession(send);sessions.push(value);return value;};
function delayed<T>(ms:number,value:T):Promise<T>{return new Promise(resolve=>setTimeout(()=>resolve(value),ms));}
function delayedFailure(ms:number,error:unknown):Promise<never>{return new Promise((_,reject)=>setTimeout(()=>reject(error),ms));}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);vi.spyOn(Math,'random').mockReturnValue(0);});
afterEach(()=>{for(const value of sessions.splice(0))value.clear();vi.useRealTimers();vi.restoreAllMocks();});

it.each([false,true])('finishes at 61s instead of the former 184.1s after an unavailable first model; splitParts=%s',async splitParts=>{
 const chapter=source(),calls:{input:AiTranslateClientRequest;at:number}[]=[];
 const translate=async(input:AiTranslateClientRequest)=>{calls.push({input,at:Date.now()});return input.model===first?delayedFailure(60000,failure()):delayed(1000,answer());};
 const current=session(translate),work=current.request(chapter,{...selected,splitParts},[]);
 await vi.advanceTimersByTimeAsync(59999);expect(calls.map(row=>row.at)).toEqual([0]);
 await vi.advanceTimersByTimeAsync(1);expect(calls.map(row=>[row.input.model,row.at])).toEqual([[first,0],[last,60000]]);
 await vi.advanceTimersByTimeAsync(1000);expect((await work).model).toBe(last);expect(Date.now()).toBe(61000);
 expect(calls.every(row=>row.input.text===chapter.text&&row.input.context===undefined)).toBe(true);
 expect(current.facts(aiReadingKey(chapter,{...selected,splitParts},[]))?.division).toEqual({version:1,parts:1,reasons:[]});

 // Measure the previous three-attempt policy against the same timed failures,
 // rather than deriving a speed claim from request counts or immediate mocks.
 const baselineAt=Date.now(),recovery=new AiRecovery(),signal=new AbortController().signal;
 const baseline=recovery.run(first,signal,()=>translate({...selected,text:chapter.text,model:first}),true,2)
  .catch(()=>translate({...selected,text:chapter.text,model:last}));
 await vi.advanceTimersByTimeAsync(184099);expect(calls.at(-1)!.at-baselineAt).toBe(183100);
 await vi.advanceTimersByTimeAsync(1);expect((await baseline).model).toBe(last);expect(Date.now()-baselineAt).toBe(184100);
});

it('keeps two ordinary retries on the final model after immediate first-model failover',async()=>{
 const chapter=source(),calls:{model:string|undefined;at:number;text:string}[]=[];let finalCalls=0;
 const current=session(async input=>{calls.push({model:input.model,at:Date.now(),text:input.text});if(input.model===first||++finalCalls<3)throw failure('ai_gateway_error',undefined,503);return answer();});
 const work=current.request(chapter,selected,[]);await vi.advanceTimersByTimeAsync(3100);await work;
 expect(calls.map(row=>[row.model,row.at])).toEqual([[first,0],[last,0],[last,600],[last,3100]]);expect(calls.every(row=>row.text===chapter.text)).toBe(true);
});

it('keeps two ordinary retries when only one model is configured',async()=>{
 const calls:number[]=[],current=session(async()=>{calls.push(Date.now());if(calls.length<3)throw failure();return answer(first);});
 const work=current.request(source(),{...selected,fallbackModels:[]},[]);await vi.advanceTimersByTimeAsync(3100);await work;expect(calls).toEqual([0,600,3100]);
});

it('warm capacity does not pin a fresh short chapter before a result is accepted',async()=>{
 let warm=true;const calls:AiTranslateClientRequest[]=[],current=session(async input=>{if(warm)return {...answer(first),parallel:2 as const};calls.push(input);if(input.model===first)throw failure();return answer(input.model!);});
 await current.request(source('warm'),selected,[]);warm=false;
 const chapter=source('pinned'),work=current.request(chapter,selected,[]);await vi.advanceTimersByTimeAsync(3100);await work;
 expect(calls.map(input=>input.model)).toEqual([first,last]);expect(calls.every(input=>input.text===chapter.text)).toBe(true);
});

it.each(['output_limit','copied_source'])('retains two full-source retries for %s even on an earlier model',async kind=>{
 const chapter=source(),calls:AiTranslateClientRequest[]=[],states:string[]=[],current=session(async input=>{
  calls.push(input);if(calls.length<3){if(kind==='output_limit')throw failure('ai_incomplete_result','output_limit',502);return answer(first,'甲'.repeat(32));}return answer(first);
 });
 const work=current.request(chapter,selected,[],undefined,undefined,state=>states.push(state.text));
 await vi.advanceTimersByTimeAsync(599);expect(calls).toHaveLength(1);expect(states.every(text=>text==='')).toBe(true);
 await vi.advanceTimersByTimeAsync(2501);await work;
 expect(calls).toHaveLength(3);expect(calls.every(input=>input.model===first&&input.text===chapter.text&&input.context===undefined)).toBe(true);
 expect(states.every(text=>!text.includes('甲'))).toBe(true);
 expect(isTransientAiFailure(failure(kind==='output_limit'?'ai_incomplete_result':'ai_untranslated_result',kind==='output_limit'?'output_limit':'untranslated_source',502))).toBe(false);
});

it.each(['ai_incomplete_result','ai_untranslated_result'])('bounds repeated whole-result %s failures without falling back or splitting',async code=>{
 const chapter=source(),error=failure(code,code==='ai_incomplete_result'?'output_limit':'untranslated_source',502),send=vi.fn().mockRejectedValue(error),current=session(send);
 const work=current.request(chapter,selected,[]),rejected=expect(work).rejects.toBe(error);await vi.advanceTimersByTimeAsync(3100);await rejected;
 expect(send).toHaveBeenCalledTimes(3);expect(send.mock.calls.every(([input])=>input.model===first&&input.text===chapter.text)).toBe(true);expect(current.get(aiReadingKey(chapter,selected,[]))).toBeUndefined();
});

it('records Retry-After before fast failover and prevents another request to that model before its deadline',async()=>{
 const recovery=new AiRecovery(),signal=new AbortController().signal,quota=vi.fn(),limited=new AiTranslateClientError('ai_rate_limited','Synthetic quota',429,'cooldown',undefined,undefined,10000);
 await expect(recovery.run(first,signal,async()=>{throw limited;},true,0,quota,true)).rejects.toBe(limited);expect(quota).toHaveBeenCalledWith(10000);
 const send=vi.fn(async()=>answer(first)),work=recovery.run(first,signal,send,true,0,quota,true);
 await vi.advanceTimersByTimeAsync(9999);expect(send).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);await work;expect(send).toHaveBeenCalledOnce();expect(Date.now()).toBe(10000);
});

it('moves to an allowed fallback immediately but still waits its own Retry-After before retrying it',async()=>{
 const calls:{model:string|undefined;at:number}[]=[],current=session(async input=>{
  calls.push({model:input.model,at:Date.now()});if(calls.length<=2)throw new AiTranslateClientError('ai_rate_limited','Synthetic quota',429,'cooldown',undefined,undefined,10000);return answer();
 });
 const work=current.request(source(),selected,[]);await vi.advanceTimersByTimeAsync(9999);expect(calls).toEqual([{model:first,at:0},{model:last,at:0}]);
 await vi.advanceTimersByTimeAsync(1);await work;expect(calls.at(-1)).toEqual({model:last,at:10000});
});

it.each([failure('ai_auth_error',undefined,403),failure('invalid_prompt',undefined,400),failure('ai_invalid_response','upstream_schema',502),failure('ai_incomplete_result','upstream_finish_reason',502)])('does not retry or fall back after permanent failure %#',async error=>{
 const send=vi.fn().mockRejectedValue(error),current=session(send);await expect(current.request(source(),selected,[])).rejects.toBe(error);await vi.advanceTimersByTimeAsync(200000);expect(send).toHaveBeenCalledOnce();
});

it.each(['request','whole-result backoff','quota cooldown'])('Stop cancels %s and prevents fallback, late publication and retries',async phase=>{
 const chapter=source(),send=vi.fn(async()=>{
  if(phase==='request')return delayed(60000,answer(first));
  if(phase==='whole-result backoff')throw failure('ai_incomplete_result','output_limit',502);
  throw new AiTranslateClientError('ai_rate_limited','Synthetic quota',429,'cooldown',undefined,undefined,10000);
 }),current=session(send),settings=phase==='quota cooldown'?{...selected,fallbackModels:[]}:selected,states:string[]=[];
 const work=current.request(chapter,settings,[],undefined,undefined,state=>states.push(state.text)),rejected=expect(work).rejects.toMatchObject({name:'AbortError'});
 await vi.advanceTimersByTimeAsync(phase==='quota cooldown'?700:300);current.cancel(aiReadingKey(chapter,settings,[]));await rejected;const published=states.length;
 await vi.advanceTimersByTimeAsync(200000);expect(send).toHaveBeenCalledOnce();expect(states).toHaveLength(published);expect(current.get(aiReadingKey(chapter,settings,[]))).toBeUndefined();
});
