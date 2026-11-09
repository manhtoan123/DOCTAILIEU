import {afterEach,describe,expect,it,vi} from 'vitest';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey,readReadingAiSettings} from '../src/features/ai/services/ai-reading';
import {AiTranslateClientError,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import {AI_QUALITY_ORDER,readingAiModels,recommendedFallbackModels} from '../src/features/ai/services/ai-fallback';
import {validatePromptSettings} from '../src/features/ai/prompt/prompt-schema';
const settings={...AI_DEFAULTS,model:'gemini-3.8-flash'};
const source={bookId:'fallback-book',id:'current',revision:1,text:'林儿好。'+'a'.repeat(5996)};
const names=[{key:'林儿',value:'Lâm Nhi'}];
const output=(model:string,result='Đã dịch.'):AiTranslateClientResponse=>({model,result,finishReason:'STOP',inputTokens:1,outputTokens:2});
const busy=(status=503,delay?:number)=>new AiTranslateClientError(status===429?'ai_rate_limited':'ai_upstream_error','Busy',status,'upstream_http',undefined,undefined,delay);
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
 describe('sequential quality-first model fallback',()=>{
    it('defaults to 3.8 → 3.7 → 3.5 → 2.5 → Groq → 3.5 Lite → Gemma 26B → 3 Preview and persists a chosen or disabled chain',()=>{
   expect(readingAiModels(settings)).toEqual(AI_QUALITY_ORDER);
    expect(recommendedFallbackModels('gemini-3.7-flash')).toEqual(['gemini-3.5-flash','gemini-2.5-flash','qwen/qwen3.8-27b','gemini-3.5-flash-lite','gemma-4-26b-a4b-it','gemini-3-flash-preview']);
    expect(recommendedFallbackModels('gemini-3.5-flash')).toEqual(['gemini-2.5-flash','qwen/qwen3.8-27b','gemini-3.5-flash-lite','gemma-4-26b-a4b-it','gemini-3-flash-preview']);
   expect(recommendedFallbackModels('gemma-4-26b-a4b-it')).toEqual(['gemini-3-flash-preview']);
    expect(recommendedFallbackModels('gemini-2.5-flash')).toEqual(['qwen/qwen3.8-27b','gemini-3.5-flash-lite','gemma-4-26b-a4b-it','gemini-3-flash-preview']);
   expect(recommendedFallbackModels('gemini-3-flash-preview')).toEqual([]);
    for(const model of ['gemini-3.1-flash-lite','gemini-3.1-pro-preview','gemma-4-31b-it'])expect(recommendedFallbackModels(model)).toEqual(['gemini-2.5-flash','qwen/qwen3.8-27b','gemini-3.5-flash-lite','gemini-3-flash-preview']);
   expect(readingAiModels({...settings,fallbackModels:[]})).toEqual([settings.model]);
   const chosen={...settings,fallbackModels:['gemini-2.5-flash']};expect(validatePromptSettings(chosen)).toEqual(chosen);expect(readReadingAiSettings(chosen)).toEqual(chosen);
   for(const fallbackModels of [[settings.model],['bad'],['gemini-2.5-flash','gemini-2.5-flash'],[...AI_QUALITY_ORDER]])expect(()=>validatePromptSettings({...settings,fallbackModels})).toThrow();
   expect(aiReadingKey(source,settings,names)).not.toBe(aiReadingKey(source,chosen,names));
  });
  it('reports each model attempt in order without adding requests during current or prewarm fallback',async()=>{const tried:string[]=[];let count=0;const session=new AiReadingSession(async input=>{if(++count===1)throw busy(503);return output(input.model??settings.model);});await session.request(source,settings,names,undefined,model=>tried.push(model));expect(tried).toEqual(AI_QUALITY_ORDER.slice(0,2));await session.request({...source,id:'prewarm'},settings,names,undefined,model=>tried.push(model));expect(tried).toEqual([AI_QUALITY_ORDER[0],AI_QUALITY_ORDER[1],AI_QUALITY_ORDER[1]]);expect(count).toBe(3);});
  it('tries full source sequentially on 503, 404 model and 429, preserving prompt and Names',async()=>{
   let active=0,maxActive=0;const calls:any[]=[];
   const send=vi.fn(async(input:any)=>{calls.push(input);maxActive=Math.max(maxActive,++active);await Promise.resolve();active--;if(calls.length<AI_QUALITY_ORDER.length)throw busy([503,404,429,503,503,503][calls.length-1]);return output(input.model);});
   const session=new AiReadingSession(send);expect(await session.request(source,settings,names)).toEqual(output('gemini-3-flash-preview'));
   expect(calls.map(c=>c.model)).toEqual(AI_QUALITY_ORDER);expect(maxActive).toBe(1);
  expect(calls.every(c=>c.text===source.text&&c.systemPrompt===settings.systemPrompt&&c.names['林儿']==='Lâm Nhi')).toBe(true);
 });
 it('skips cooling models for prewarm and returns to the best model for a new chapter after cooldown',async()=>{
  vi.useFakeTimers();vi.setSystemTime(0);
  const send=vi.fn(async(input:any)=>{if(input.model===settings.model&&input.text===source.text)throw busy(429,120000);return output(input.model);}),session=new AiReadingSession(send);
  expect((await session.request(source,settings,[])).model).toBe('gemini-3.7-flash');
  const next={...source,id:'next',text:'下一章。'};expect((await session.request(next,settings,[])).model).toBe('gemini-3.7-flash');
  await vi.advanceTimersByTimeAsync(90001);expect((await session.request({...next,id:'third'},settings,[])).model).toBe('gemini-3.7-flash');
  await vi.advanceTimersByTimeAsync(30000);expect((await session.request({...next,id:'fourth'},settings,[])).model).toBe(settings.model);
  expect((await session.request(source,settings,[])).model).toBe('gemini-3.7-flash'); // A complete cached chapter stays readable.
 });
 it('retains the first split child, resumes on its pinned model, and requires a separate whole-chapter fallback',async()=>{
  const long={...source,text:'甲'+'a'.repeat(2999)+'乙'+'b'.repeat(2999)},calls:any[]=[];let failing=true;
  const send=vi.fn(async(input:any)=>{calls.push(input);if(input.model===settings.model){if(input.text.length===6000)throw new AiTranslateClientError('ai_incomplete_result','Cut',502,'output_limit');if(input.text.startsWith('甲'))return output(input.model,'KEPT A');if(failing)throw busy();return output(input.model,'FINISHED A');}return output(input.model,'COMPLETE B');});
  const cache={read:vi.fn(async()=>undefined),write:vi.fn(async()=>true)},session=new AiReadingSession(send,cache);
  await expect(session.request(long,settings,[])).rejects.toMatchObject({status:503});expect(cache.write).not.toHaveBeenCalled();expect(session.get(aiReadingKey(long,settings,[]))).toBeUndefined();expect(calls.map(c=>[c.model,c.text.length])).toEqual([[settings.model,6000],[settings.model,3000],[settings.model,3000]]);
  failing=false;expect((await session.request(long,settings,[])).result).toBe('KEPT A\nFINISHED A');expect(calls.filter(c=>c.text===long.text.slice(0,3000))).toHaveLength(1);expect(calls.every(c=>c.model===settings.model)).toBe(true);expect(cache.write).toHaveBeenCalledOnce();
  const fallback={...settings,model:'gemini-3.7-flash',fallbackModels:[]};expect((await session.request(long,fallback,[])).result).toBe('COMPLETE B');expect(calls.at(-1)).toMatchObject({model:fallback.model,text:long.text});expect(cache.write).toHaveBeenCalledTimes(2);
 });
 it.each([new AiTranslateClientError('ai_auth_error','Invalid',403),new AiTranslateClientError('invalid_prompt','Bad',400),new AiTranslateClientError('ai_invalid_response','Bad',502,'upstream_schema'),new DOMException('Cancelled','AbortError')])('does not hide permanent failure or cancellation %#',async error=>{
  const send=vi.fn().mockRejectedValue(error);await expect(new AiReadingSession(send).request(source,settings,[])).rejects.toBe(error);expect(send).toHaveBeenCalledOnce();
 });
 it('cancels the fallback in flight and never caches a late result',async()=>{
  let finish!:(r:AiTranslateClientResponse)=>void;
  const send=vi.fn().mockRejectedValueOnce(busy()).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})),session=new AiReadingSession(send);
  const job=session.request(source,settings,[]),rejected=expect(job).rejects.toMatchObject({name:'AbortError'});await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(2));session.clear();finish(output('gemini-3.7-flash'));await rejected;expect(session.get(aiReadingKey(source,settings,[]))).toBeUndefined();
 });
 it('all busy models cause one bounded cycle; later requests wait without another network cycle',async()=>{
  const send=vi.fn().mockRejectedValue(busy()),session=new AiReadingSession(send);await expect(session.request(source,settings,[])).rejects.toMatchObject({status:503,retryAfterMs:expect.any(Number)});expect(send).toHaveBeenCalledTimes(AI_QUALITY_ORDER.length);
  await expect(session.request({...source,id:'next'},settings,[])).rejects.toMatchObject({status:429,reason:'cooldown'});expect(send).toHaveBeenCalledTimes(AI_QUALITY_ORDER.length);
 });
 it('retries only the failing final-model split child and never republishes a completed sibling',async()=>{
  vi.useFakeTimers();const settings={...AI_DEFAULTS,model:'gemini-3.8-flash',fallbackModels:['gemini-2.5-flash']};const long={...source,text:'甲'+'a'.repeat(2999)+'乙'+'b'.repeat(2999)},calls:{model:string;text:string}[]=[];let failures=0;
  const send=vi.fn(async(input:any)=>{calls.push({model:input.model,text:input.text});if(input.model!=='gemini-2.5-flash')throw busy();if(input.text===long.text)throw new AiTranslateClientError('ai_timeout','Timeout',504);if(input.text.startsWith('乙')&&failures++<2)throw busy();return output(input.model,input.text.startsWith('甲')?'FIRST':'SECOND');});
  const cache={read:vi.fn(async()=>undefined),write:vi.fn(async()=>true)},session=new AiReadingSession(send,cache);const job=session.request(long,settings,[]);
  await vi.advanceTimersByTimeAsync(5000);expect(await job).toMatchObject({model:'gemini-2.5-flash',result:'FIRST\nSECOND'});
  expect(calls.map(c=>[c.model,c.text.length])).toEqual([...[settings.model,'gemini-2.5-flash'].map(m=>[m,6000]),['gemini-2.5-flash',3000],['gemini-2.5-flash',3000],['gemini-2.5-flash',3000],['gemini-2.5-flash',3000]]);
  expect(calls.filter(c=>c.text.startsWith('甲')&&c.text.length===3000)).toHaveLength(1);expect(cache.write).toHaveBeenCalledOnce();expect(session.get(aiReadingKey(long,settings,[]))?.result).toBe('FIRST\nSECOND');
 });
 it('exhausted split-child recovery remains bounded and never caches a partial chapter',async()=>{
  vi.useFakeTimers();const settings={...AI_DEFAULTS,model:'gemini-3.8-flash',fallbackModels:['gemini-2.5-flash']};const long={...source,text:'甲'+'a'.repeat(2999)+'乙'+'b'.repeat(2999)};let siblingCalls=0,failedCalls=0;
  const cache={read:vi.fn(async()=>undefined),write:vi.fn(async()=>true)},session=new AiReadingSession(async input=>{if(input.model!=='gemini-2.5-flash')throw busy();if(input.text===long.text)throw new AiTranslateClientError('ai_timeout','Timeout',504);if(input.text.startsWith('甲')){siblingCalls++;return output(input.model,'DO NOT PUBLISH');}failedCalls++;throw busy();},cache);
  const job=expect(session.request(long,settings,[])).rejects.toMatchObject({code:'ai_upstream_error'});await vi.advanceTimersByTimeAsync(5000);await job;expect(siblingCalls).toBe(1);expect(failedCalls).toBe(3);expect(cache.write).not.toHaveBeenCalled();expect(session.get(aiReadingKey(long,settings,[]))).toBeUndefined();
 });
 it('cancels while a split child waits for retry and suppresses late sends and cache writes',async()=>{
  vi.useFakeTimers();const settings={...AI_DEFAULTS,model:'gemini-3.8-flash',fallbackModels:['gemini-2.5-flash']};const long={...source,text:'甲'+'a'.repeat(2999)+'乙'+'b'.repeat(2999)};let failedCalls=0;
  const cache={read:vi.fn(async()=>undefined),write:vi.fn(async()=>true)},session=new AiReadingSession(async input=>{if(input.model!=='gemini-2.5-flash')throw busy();if(input.text===long.text)throw new AiTranslateClientError('ai_timeout','Timeout',504);if(input.text.startsWith('甲'))return output(input.model,'DO NOT PUBLISH');failedCalls++;throw busy();},cache);
  const job=expect(session.request(long,settings,[])).rejects.toMatchObject({name:'AbortError'});await vi.advanceTimersByTimeAsync(1);expect(failedCalls).toBe(1);session.clear();await vi.advanceTimersByTimeAsync(5000);await job;expect(failedCalls).toBe(1);expect(cache.write).not.toHaveBeenCalled();
 });
});
