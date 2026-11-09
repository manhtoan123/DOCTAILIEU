import {afterEach,expect,it,vi} from 'vitest';
import {AiRequestAttempts} from '../src/features/ai/types/ai-request-attempts';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
import {AiReadingSession,AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
const failure=(started=false)=>Object.assign(new AiTranslateClientError('ai_timeout','Synthetic timeout',504),{answerStarted:started});
it.each(['gemini-3.5-flash-lite','gemini-2.5-flash-lite','gemma-4-26b-a4b-it','gemini-3.8-flash','gemini-3.7-flash'])('request identity bounds outer replay for %s',async model=>{
 const attempts=new AiRequestAttempts(),send=vi.fn().mockRejectedValue(failure()),id=JSON.stringify({model,text:'Synthetic'});for(let i=0;i<4;i++)await expect(attempts.send(id,send)).rejects.toMatchObject({code:'ai_timeout'});expect(send).toHaveBeenCalledTimes(model==='gemini-2.5-flash-lite'?1:3);
});
it.each(['gemini-3.5-flash','gemini-2.5-flash'])('shared request identity bounds started-stream replay to two actual sends for %s',async model=>{
 const attempts=new AiRequestAttempts(),send=vi.fn().mockRejectedValue(failure(true)),id=JSON.stringify({model,text:'Synthetic'});for(let i=0;i<4;i++)await expect(attempts.send(id,send)).rejects.toMatchObject({code:'ai_timeout'});expect(send).toHaveBeenCalledTimes(2);
});
it.each(['gemini-3.5-flash-lite','gemma-4-26b-a4b-it'])('successful sibling does not increase the three-send bound for %s',async model=>{
 vi.useFakeTimers();const failed:string[]=[],session=new AiReadingSession(async input=>{if(!failed.length){failed.push('accepted');return {model,result:'Accepted sibling.',finishReason:'STOP',inputTokens:1,outputTokens:1};}failed.push(JSON.stringify(input));throw new AiTranslateClientError('ai_upstream_error','Synthetic busy',503);});
 try{const job=session.request({bookId:'synthetic',id:'split',revision:1,text:Array.from({length:6000},(_,i)=>String.fromCharCode(0x4e00+i)).join('')},{...AI_DEFAULTS,model,splitParts:true,fallbackModels:[]},[],undefined,undefined,undefined,{immediate:true});const rejected=expect(job).rejects.toMatchObject({code:expect.stringMatching(/^ai_(upstream_error|recovery_exhausted)$/)});await vi.advanceTimersByTimeAsync(100000);await rejected;expect(failed.length).toBeGreaterThanOrEqual(2);for(const request of new Set(failed.slice(1)))expect(failed.filter(value=>value===request).length).toBeLessThanOrEqual(3);}finally{session.clear();}
});
