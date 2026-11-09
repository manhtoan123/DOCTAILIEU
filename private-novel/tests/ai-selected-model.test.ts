import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AI_MODELS} from '../src/features/ai/types/ai-models';
import {automaticAiSettings} from '../src/features/ai/types/ai-reader-settings';
import {AI_DEFAULTS,AiReadingSession} from '../src/features/ai/services/ai-reading';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
import {AiRecovery} from '../src/features/ai/services/ai-recovery';
import {describeAiExecution,readAiExecution} from '../src/features/ai/services/ai-execution';
const busy=()=>new AiTranslateClientError('ai_upstream_error','Synthetic busy',503,'upstream_http');
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it.each(AI_MODELS.map(m=>m.id))('retries only selected %s and never promotes another model',async model=>{
 const settings=automaticAiSettings({...AI_DEFAULTS,model,fallbackModels:['gemini-2.5-flash']}),send=vi.fn().mockRejectedValueOnce(busy()).mockResolvedValue({model,result:'Bản dịch tổng hợp.',finishReason:'STOP',inputTokens:1,outputTokens:1});
 const job=new AiReadingSession(send).request({bookId:'synthetic',id:model,revision:1,text:'原文'},settings,[],undefined,undefined,undefined,{immediate:true});
 await vi.advanceTimersByTimeAsync(599);expect(send).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(1);
 expect(await job).toMatchObject({model});expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls.map(c=>c[0].model)).toEqual([model,model]);
});
it.each([[429,false],[503,false],[503,true]] as const)('honors Retry-After for HTTP %i started=%s and cancellation interrupts the wait',async(status,started)=>{
 const send=vi.fn().mockRejectedValueOnce(Object.assign(new AiTranslateClientError(status===429?'ai_rate_limited':'ai_upstream_error','Synthetic wait',status,undefined,undefined,undefined,10000),{answerStarted:started})).mockResolvedValue('ok'),ctrl=new AbortController();
 const job=new AiRecovery().run('qwen/qwen3.8-27b',ctrl.signal,send,true,2,undefined,false,true),rejected=expect(job).rejects.toMatchObject({name:'AbortError'});
 await vi.advanceTimersByTimeAsync(9999);expect(send).toHaveBeenCalledTimes(1);ctrl.abort();await rejected;expect(send).toHaveBeenCalledTimes(1);
});
it('stops permanent authentication errors and bounds repeated transient retries to three sends',async()=>{
 const auth=new AiTranslateClientError('ai_auth_error','Synthetic auth',401),permanent=vi.fn().mockRejectedValue(auth);
 await expect(new AiRecovery().run('qwen/qwen3.8-27b',new AbortController().signal,permanent)).rejects.toBe(auth);expect(permanent).toHaveBeenCalledTimes(1);
 const failure=busy(),send=vi.fn().mockRejectedValue(failure),job=new AiRecovery().run('qwen/qwen3.8-27b',new AbortController().signal,send,true,2,undefined,false,true),rejected=expect(job).rejects.toBe(failure);
 await vi.advanceTimersByTimeAsync(3100);await rejected;expect(send).toHaveBeenCalledTimes(3);
});
it('accepts provider-qualified model execution metadata without accepting arbitrary paths',()=>{
 const execution={version:1,model:'qwen/qwen3.8-27b',temperature:0,thinking:'provider-default',maxOutputTokens:8192,promptId:'a'.repeat(64)};
 expect(readAiExecution(execution)).toEqual(execution);for(const model of ['../secret','qwen//x','qwen/x/y','qwen/'])expect(readAiExecution({...execution,model})).toBeUndefined();
});

it('records Groq reasoning disabled while preserving historical provider-default metadata',async()=>{
 expect(await describeAiExecution('qwen/qwen3.8-27b',0,'system','{{text}}')).toMatchObject({thinking:'disabled'});
 const old=await describeAiExecution('gemini-3.5-flash',0,'system','{{text}}');expect(readAiExecution(old)).toMatchObject({thinking:'provider-default'});
});
