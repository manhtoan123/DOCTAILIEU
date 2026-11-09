import {it,expect,vi,afterEach} from 'vitest';
import {continueAiRun} from '../src/features/ai/services/ai-auto-continue';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
afterEach(()=>vi.useRealTimers());
it('continues a temporary failure using the same work context and budget',async()=>{
 vi.useFakeTimers();vi.setSystemTime(0);const preserved=new Set(['first']);let calls=0;
 const request=vi.fn(async()=>{if(++calls===1)throw new AiTranslateClientError('ai_network_error','network');expect(preserved.has('first')).toBe(true);return 'complete';});
 const run=continueAiRun(request,()=>100000,new AbortController().signal,()=>{});await vi.advanceTimersByTimeAsync(2000);expect(await run).toBe('complete');expect(request.mock.calls).toEqual([[{automatic:false,renewBudget:true}],[{automatic:true,renewBudget:false}]]);
});
it('renews an exhausted round only after the existing cooling interval',async()=>{
 vi.useFakeTimers();vi.setSystemTime(0);let calls=0;const request=vi.fn(async()=>{if(++calls===1)throw new AiTranslateClientError('ai_recovery_exhausted','budget',undefined,'send_limit');return 'complete';});
 const run=continueAiRun(request,()=>100,new AbortController().signal,()=>{});await vi.advanceTimersByTimeAsync(59999);expect(calls).toBe(1);await vi.advanceTimersByTimeAsync(1);expect(await run).toBe('complete');expect(request.mock.calls[1]).toEqual([{automatic:true,renewBudget:true}]);
});
it('Stop cancels the wait and prevents another request',async()=>{
 vi.useFakeTimers();const controller=new AbortController(),request=vi.fn(async()=>{throw new AiTranslateClientError('ai_recovery_exhausted','budget');});
 const run=continueAiRun(request,()=>Date.now(),controller.signal,()=>{}),rejected=expect(run).rejects.toMatchObject({name:'AbortError'});await vi.advanceTimersByTimeAsync(1);controller.abort();await rejected;await vi.advanceTimersByTimeAsync(120000);expect(request).toHaveBeenCalledTimes(1);
});
it.each(['upstream_finish_reason','finish_reason','request_validation'])('does not retry permanent completion or validation reason %s',async reason=>{
 const error=new AiTranslateClientError('ai_incomplete_result','rejected',502,reason),request=vi.fn(async()=>{throw error;});
 await expect(continueAiRun(request,()=>Date.now()+100000,new AbortController().signal,()=>{})).rejects.toBe(error);expect(request).toHaveBeenCalledTimes(1);
});
it('does not return a late successful result after Stop',async()=>{
 const controller=new AbortController();let finish!:(text:string)=>void;
 const run=continueAiRun(()=>new Promise<string>(resolve=>finish=resolve),()=>100000,controller.signal,()=>{}),rejected=expect(run).rejects.toMatchObject({name:'AbortError'});controller.abort();finish('late');await rejected;
});
