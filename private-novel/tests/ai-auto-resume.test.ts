import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {it,expect,vi,afterEach} from 'vitest';
import {aiAutoResumeDelay,aiAutoRecoveryPlan} from '../src/features/ai/services/ai-auto-resume';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
import {AiChapterJob,resumeAiChapterBudget,selectAiChapterBudget} from '../src/features/ai/services/ai-job';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey} from '../src/features/ai/services/ai-reading';
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
  const source={bookId:'retry',id:'chapter',revision:1,text:'甲'.repeat(3000)+'乙'.repeat(3000)};
  const settings={...AI_DEFAULTS,fallbackModels:[],hybrid:{version:1 as const,liteModel:'gemini-3.5-flash-lite' as const,rules:''}};
  try{
    const failure=await session.request(source,settings,[]).catch(e=>e);
    expect(failure).toMatchObject({code:'ai_timeout'});expect(first).toBe(1);expect(second).toBeGreaterThan(0);const before=second;
    failing=false;const recovery=session.request(source,settings,[],undefined,undefined,undefined,{automatic:true});
    expect((await recovery).result).toBe('Nửa đầu được giữ.\nNửa sau hoàn tất.');expect(first).toBe(1);expect(second).toBe(before+1);
  }finally{session.clear();}
},10000);

it('opens a bounded new round only after exhaustion and a full cooling interval',async()=>{
 vi.useFakeTimers();vi.setSystemTime(1000);
 const limits={durationMs:240000,sends:2},job=new AiChapterJob(limits);
 await job.send(async()=>1);await job.send(async()=>2);
 expect(()=>job.send(async()=>3)).toThrowError(/giữ tiến độ/);
 const previous=job.budget;
 vi.setSystemTime(60999);expect(selectAiChapterBudget(previous,limits,{automatic:true,renewBudget:true})).toBe(previous);
 vi.setSystemTime(61000);const fresh=selectAiChapterBudget(previous,limits,{automatic:true,renewBudget:true});
 expect(fresh.id).not.toBe(previous.id);expect(fresh.sends).toBe(0);expect(fresh.deadline).toBe(301000);
 expect(selectAiChapterBudget(fresh,limits,{automatic:true,renewBudget:true})).toBe(fresh);
});
it('outer recovery respects long Retry-After, expiry, generated failures and configuration boundaries',()=>{
 const quota=new AiTranslateClientError('ai_rate_limited','quota',429,undefined,undefined,undefined,120000);
 expect(aiAutoRecoveryPlan(quota,0,100000,0)).toEqual({delay:160000,renewBudget:true});
 expect(aiAutoRecoveryPlan(new AiTranslateClientError('ai_recovery_exhausted','expired'),0,240000,240000)).toEqual({delay:60000,renewBudget:true});
 expect(aiAutoRecoveryPlan(new AiTranslateClientError('ai_incomplete_result','truncated'),0,240000,0)).toEqual({delay:60000,renewBudget:false});
 expect(aiAutoRecoveryPlan(new AiTranslateClientError('ai_invalid_response','upstream',502,'upstream_parts'),0,240000,0)).toEqual({delay:60000,renewBudget:false});
 for(const status of [400,401,403,404])expect(aiAutoRecoveryPlan(new AiTranslateClientError('ai_invalid_response','input',status,'request_validation'),0,240000,0)).toBeUndefined();
 for(const code of ['ai_auth_error','invalid_prompt','ai_cancelled','text_empty'])expect(aiAutoRecoveryPlan(new AiTranslateClientError(code,'blocked'),0,240000,0)).toBeUndefined();
});
it('a cooled renewed hybrid round keeps the completed first half',async()=>{
 let failing=true,first=0,second=0;
 const session=new AiReadingSession(async input=>{
  if(input.continuation){second++;if(failing)throw new AiTranslateClientError('ai_timeout','temporary',408);}else first++;
  return {result:input.continuation?'Nửa sau hoàn tất.':'Nửa đầu được giữ.',model:input.model!,finishReason:'STOP',inputTokens:1,outputTokens:1};
 });
 const source={bookId:'round',id:'chapter',revision:1,text:'甲'.repeat(3000)+'乙'.repeat(3000)};
 const settings={...AI_DEFAULTS,fallbackModels:[],hybrid:{version:1 as const,liteModel:'gemini-3.5-flash-lite' as const,rules:''}};
 try{
  await expect(session.request(source,settings,[])).rejects.toMatchObject({code:'ai_timeout'});
  const key=aiReadingKey(source,settings,[]),deadline=session.retryDeadline(key)!,before=second;
  vi.useFakeTimers();vi.setSystemTime(deadline);
  await expect(session.request(source,settings,[],undefined,undefined,undefined,{automatic:true,renewBudget:true})).rejects.toMatchObject({code:'ai_recovery_exhausted'});
  expect(second).toBe(before);failing=false;vi.setSystemTime(deadline+60000);
  const result=await session.request(source,settings,[],undefined,undefined,undefined,{automatic:true,renewBudget:true});
  expect(result.result).toBe('Nửa đầu được giữ.\nNửa sau hoàn tất.');expect(first).toBe(1);expect(second).toBe(before+1);
  expect(session.retryDeadline(key)).toBeGreaterThan(deadline);
 }finally{session.clear();}
},10000);

it('renewed EPUB hybrid rounds retain validated first-half node mappings',async()=>{
 let first=0,second=0,failing=true;
 const session=new EpubAiSession(undefined,async input=>{
  if(input.model?.endsWith('-lite')){second++;if(failing)throw new AiTranslateClientError('ai_auth_error','unavailable',401);}else first++;
  const rows=JSON.parse(input.text);
  return {result:JSON.stringify(Object.fromEntries(Object.keys(rows).map(k=>[k,input.model?.endsWith('-lite')?'Nửa sau EPUB.':'Nửa đầu EPUB.']))),model:input.model!,finishReason:'STOP',inputTokens:1,outputTokens:1};
 });
 const nodes=['甲'.repeat(1800),'乙'.repeat(1800)],source={bookId:'epub-round',id:'chapter',revision:1,text:nodes.join('\n')};
 const layout={path:'one.xhtml',body:'<body/>',styles:[],nodes};
 const settings={...AI_DEFAULTS,fallbackModels:[],hybrid:{version:1 as const,liteModel:'gemini-3.5-flash-lite' as const,rules:''}};
 try{
  await expect(session.request(source,settings,[],layout)).rejects.toMatchObject({code:'ai_auth_error'});expect(first).toBe(1);
  const deadline=session.retryDeadline(aiReadingKey(source,settings,[]))!;
  vi.useFakeTimers();vi.setSystemTime(deadline+60000);failing=false;
  const result=await session.request(source,settings,[],layout,undefined,undefined,{automatic:true,renewBudget:true});
  expect(result.nodes).toEqual(['Nửa đầu EPUB.','Nửa sau EPUB.']);expect(first).toBe(1);expect(second).toBe(2);
 }finally{session.clear();}
});
