import {it,expect,vi,afterEach} from 'vitest';
import {aiAutoResumeDelay} from '../src/features/ai/services/ai-auto-resume';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
import {AiChapterJob,resumeAiChapterBudget} from '../src/features/ai/services/ai-job';
import {AiReadingSession,AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
afterEach(()=>vi.useRealTimers());

it('continues temporary failures with backoff while preserving the chapter deadline',()=>{
  const error=new AiTranslateClientError('ai_network_error','network');
  expect(aiAutoResumeDelay(error,0,100000,0)).toBe(2000);
  expect(aiAutoResumeDelay(error,8,100000,0)).toBe(30000);
  expect(aiAutoResumeDelay(error,8,30000,0)).toBeUndefined();
});
it('a fresh recovery round retries failed requests without resetting the send budget',async()=>{
  const limits={durationMs:60000,sends:4},job=new AiChapterJob(limits);
  const failure=new AiTranslateClientError('ai_network_error','network');let sends=0;
  for(let n=0;n<3;n++)await expect(job.send(async()=>{sends++;throw failure;},'same')).rejects.toBe(failure);
  await expect(job.send(async()=>{sends++;return 'ok';},'same')).rejects.toBe(failure);
  const deadline=job.budget.deadline;resumeAiChapterBudget(job.budget);
  const next=new AiChapterJob(limits,undefined,job.budget);
  await expect(next.send(async()=>{sends++;return 'ok';},'same')).resolves.toBe('ok');
  expect(sends).toBe(4);expect(next.budget.deadline).toBe(deadline);
  await expect(next.send(async()=>{sends++;return 'extra';},'another')).rejects.toMatchObject({code:'ai_recovery_exhausted'});expect(sends).toBe(4);
});
it('respects quota Retry-After and never retries permanent errors or exhausted budgets',()=>{
  const quota=new AiTranslateClientError('ai_rate_limited','quota',429,undefined,undefined,undefined,60000);
  expect(aiAutoResumeDelay(quota,0,100000,0)).toBe(60000);
  for(const code of ['ai_auth_error','invalid_prompt','ai_recovery_exhausted','ai_cancelled']){
    expect(aiAutoResumeDelay(new AiTranslateClientError(code,'permanent'),0,100000,0)).toBeUndefined();
  }
});
it('automatic hybrid recovery reuses the first half and retries only the failed second half',async()=>{
  let failing=true,first=0,second=0;
  const session=new AiReadingSession(async input=>{
    if(input.continuation){second++;if(failing)throw new AiTranslateClientError('ai_timeout','temporary',408);}
    else first++;
    return {result:input.continuation?'Nửa sau hoàn tất.':'Nửa đầu được giữ.',model:input.model!,finishReason:'STOP',inputTokens:1,outputTokens:1};
  });
  const source={bookId:'retry',id:'chapter',revision:1,text:'甲'.repeat(1800)+'乙'.repeat(1800)};
  const settings={...AI_DEFAULTS,fallbackModels:[],hybrid:{version:1 as const,liteModel:'gemini-3.5-flash-lite' as const,rules:''}};
  try{
    const failure=await session.request(source,settings,[]).catch(e=>e);
    expect(failure).toMatchObject({code:'ai_timeout'});expect(first).toBe(1);expect(second).toBeGreaterThan(0);const before=second;
    failing=false;const recovery=session.request(source,settings,[],undefined,undefined,undefined,{automatic:true});
    expect((await recovery).result).toBe('Nửa đầu được giữ.\nNửa sau hoàn tất.');expect(first).toBe(1);expect(second).toBe(before+1);
  }finally{session.clear();}
},10000);
