import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {AiReadingSession,AI_DEFAULTS as DEFAULT_READING_SETTINGS,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {aiTranslate,AiTranslateClientError,parseAiRetryAfter} from '../src/features/ai/services/ai-translate';
import {isTransientAiFailure} from '../src/features/ai/services/ai-recovery';

// Explicit single-model configuration retains the existing bounded recovery policy.
const AI_DEFAULTS={...DEFAULT_READING_SETTINGS,model:'gemini-3.5-flash',fallbackModels:[]};
const source={bookId:'book',id:'next',revision:1,text:'合成故事。'};
const result={result:'Truyện tổng hợp.',model:AI_DEFAULTS.model,finishReason:'STOP',inputTokens:1,outputTokens:2};
const transient=()=>new AiTranslateClientError('ai_gateway_error','Temporary',502,'content_type');
const limited=(ms?:number)=>new AiTranslateClientError('ai_rate_limited','Busy',429,'http',undefined,undefined,ms);
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-10T00:00:00Z'));vi.spyOn(Math,'random').mockReturnValue(0);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('bounded AI reading recovery',()=>{
  it('promotes the same prewarm timeout-splitting job, preserving successful children',async()=>{
    const long={...source,text:'a'.repeat(6000)},send=vi.fn().mockRejectedValueOnce(new AiTranslateClientError('ai_timeout','timeout',504)).mockResolvedValue(result);
    const session=new AiReadingSession(send),job=session.request(long,AI_DEFAULTS,[]);
    expect(session.request(long,AI_DEFAULTS,[])).toBe(job);
    expect(await job).toMatchObject({result:'Truyện tổng hợp.\nTruyện tổng hợp.'});expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.map(c=>c[0].text.length)).toEqual([6000,3000,3000]);expect(await session.request(long,AI_DEFAULTS,[])).toEqual(await job);expect(send).toHaveBeenCalledTimes(3);
  });
  it('recovers prewarm with identical request and promotion retains the exact promise',async()=>{
    const send=vi.fn().mockRejectedValueOnce(transient()).mockResolvedValue(result);
    const session=new AiReadingSession(send);
    const job=session.request(source,AI_DEFAULTS,[]);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(599);
    session.retain([aiReadingKey(source,AI_DEFAULTS,[])]);
    expect(session.request(source,AI_DEFAULTS,[])).toBe(job);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await job).toEqual(result);expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);expect(send.mock.calls[1][1]).toBe(send.mock.calls[0][1]);expect(send.mock.calls[1][2]).toEqual(expect.any(Function));
    expect(await session.request(source,AI_DEFAULTS,[])).toEqual(result);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('stops at two extra attempts with 600ms then 2.5s backoff',async()=>{
    const error=transient(),send=vi.fn().mockRejectedValue(error),session=new AiReadingSession(send);
    const job=session.request(source,AI_DEFAULTS,[]),rejected=expect(job).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(600);expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2499);expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);await rejected;
    await vi.advanceTimersByTimeAsync(100000);expect(send).toHaveBeenCalledTimes(3);
    expect(session.get(aiReadingKey(source,AI_DEFAULTS,[]))).toBeUndefined();
  });

  it.each([
    new Error('unknown'),new DOMException('Cancelled','AbortError'),
    new AiTranslateClientError('ai_invalid_response','Bad',502,'upstream_parts'),
    new AiTranslateClientError('ai_invalid_response','Bad',502,'upstream_schema'),
    new AiTranslateClientError('ai_invalid_response','Bad',502,'upstream_usage'),
    new AiTranslateClientError('ai_invalid_response','Bad',200,'model'),
    new AiTranslateClientError('ai_invalid_response','Bad',200,'schema'),
    new AiTranslateClientError('ai_empty_result','Bad',502,'upstream_empty_result'),
    new AiTranslateClientError('ai_incomplete_result','Bad',502,'upstream_finish_reason'),
    new AiTranslateClientError('ai_auth_error','Bad',502),
    new AiTranslateClientError('text_too_long','Bad',400),
  ])('does not retry a permanent or unknown failure %#',async error=>{
    const send=vi.fn().mockRejectedValue(error),session=new AiReadingSession(send);
    await expect(session.request(source,AI_DEFAULTS,[])).rejects.toBe(error);
    await vi.runAllTimersAsync();expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['upstream_invalid_json','upstream_content_type','upstream_body_read','json','content_type','body_stream'])(
    'accepts explicitly transient envelope reason %s',reason=>{
      expect(isTransientAiFailure(new AiTranslateClientError('ai_invalid_response','Bad',502,reason))).toBe(true);
    });
  it.each(['ai_network_error','ai_timeout','ai_gateway_error'])('accepts %s',code=>{
    expect(isTransientAiFailure(new AiTranslateClientError(code,'Bad'))).toBe(true);
  });
  it('accepts HTTP 5xx but excludes permanent HTTP 4xx',()=>{
    expect(isTransientAiFailure(new AiTranslateClientError('ai_upstream_error','Bad',503,'upstream_http'))).toBe(true);
    expect(isTransientAiFailure(new AiTranslateClientError('ai_gateway_error','Bad',404))).toBe(false);
  });
  it('keeps an unlabelled 5xx retryable while a permanent reason on the same status is not',()=>{
    expect(isTransientAiFailure(new AiTranslateClientError('ai_invalid_response','Bad',502,'http'))).toBe(true);
    expect(isTransientAiFailure(new AiTranslateClientError('ai_invalid_response','Bad',502))).toBe(true);
    expect(isTransientAiFailure(new AiTranslateClientError('ai_invalid_response','Bad',502,'upstream_schema'))).toBe(false);
    expect(isTransientAiFailure(new AiTranslateClientError('ai_invalid_response','Bad',400,'http'))).toBe(false);
  });

  it('aborts sleep immediately and does not retry or publish',async()=>{
    const send=vi.fn().mockRejectedValue(transient()),session=new AiReadingSession(send);
    const job=session.request(source,AI_DEFAULTS,[]),rejected=expect(job).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(300);session.clear();await rejected;
    expect(vi.getTimerCount()).toBe(0);await vi.advanceTimersByTimeAsync(100000);
    expect(send).toHaveBeenCalledTimes(1);expect(session.get(aiReadingKey(source,AI_DEFAULTS,[]))).toBeUndefined();
  });

  it('retaining changed source cancels old retry and cannot overwrite new result',async()=>{
    const send=vi.fn().mockRejectedValueOnce(transient()).mockResolvedValue(result),session=new AiReadingSession(send);
    const old=session.request(source,AI_DEFAULTS,[]),rejected=expect(old).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(1);
    const changed={...source,revision:2,text:'新源'};session.retain([aiReadingKey(changed,AI_DEFAULTS,[])]);
    expect(await session.request(changed,AI_DEFAULTS,[])).toEqual(result);await rejected;
    await vi.runAllTimersAsync();expect(send).toHaveBeenCalledTimes(2);
    expect(session.get(aiReadingKey(source,AI_DEFAULTS,[]))).toBeUndefined();
  });

  it('ignores an old in-flight retry completing after the same key was replaced',async()=>{
    let finish!:(value:typeof result)=>void;
    const send=vi.fn().mockRejectedValueOnce(transient()).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(result);
    const session=new AiReadingSession(send),old=session.request(source,AI_DEFAULTS,[]);
    const rejected=expect(old).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(600);session.clear();
    expect(await session.request(source,AI_DEFAULTS,[])).toEqual(result);
    finish({...result,result:'STALE'});await rejected;
    expect(session.get(aiReadingKey(source,AI_DEFAULTS,[]))).toEqual(result);
  });

  it('honors short Retry-After and aborts a second same-model waiter',async()=>{
    const send=vi.fn().mockRejectedValueOnce(limited(10000)).mockResolvedValue(result),session=new AiReadingSession(send);
    const job=session.request(source,AI_DEFAULTS,[]);
    await vi.advanceTimersByTimeAsync(1);
    const other={...source,id:'other'},waiter=session.request(other,AI_DEFAULTS,[]);
    const cancelled=expect(waiter).rejects.toMatchObject({name:'AbortError'});
    session.retain([aiReadingKey(source,AI_DEFAULTS,[])]);await cancelled;
    await vi.advanceTimersByTimeAsync(9998);expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);expect(await job).toEqual(result);expect(send).toHaveBeenCalledTimes(2);
  });

  it('long cooldown fails promptly and suppresses new jobs until the complete deadline',async()=>{
    const send=vi.fn().mockRejectedValueOnce(limited(120000)).mockResolvedValue(result),session=new AiReadingSession(send);
    await expect(session.request(source,AI_DEFAULTS,[])).rejects.toMatchObject({status:429,retryAfterMs:120000});
    session.clear(); // cancellation must not clear model quota restraint
    await vi.advanceTimersByTimeAsync(60000);
    await expect(session.request({...source,id:'other'},AI_DEFAULTS,[])).rejects.toMatchObject({status:429,retryAfterMs:60000});
    expect(send).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(await session.request(source,AI_DEFAULTS,[])).toEqual(result);expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not automatically change model and independent model is not blocked',async()=>{
    const model='gemini-3.8-flash',send=vi.fn().mockRejectedValueOnce(limited(120000)).mockResolvedValue({...result,model});
    const session=new AiReadingSession(send);
    await expect(session.request(source,AI_DEFAULTS,[])).rejects.toMatchObject({status:429});
    expect(send).toHaveBeenCalledTimes(1);
    expect(await session.request(source,{...AI_DEFAULTS,model},[])).toMatchObject({model});
    expect(send.mock.calls[1][0].model).toBe(model);
  });

  it('keeps cooldown from final exhausted 429 for subsequent requests',async()=>{
    const send=vi.fn().mockRejectedValueOnce(transient()).mockRejectedValueOnce(transient()).mockRejectedValueOnce(limited(60000));
    const session=new AiReadingSession(send),job=session.request(source,AI_DEFAULTS,[]),rejected=expect(job).rejects.toMatchObject({status:429});
    await vi.advanceTimersByTimeAsync(3100);await rejected;
    await expect(session.request(source,AI_DEFAULTS,[])).rejects.toMatchObject({reason:'cooldown'});
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('only persists final STOP result once and cache failures stay optional',async()=>{
    const send=vi.fn().mockRejectedValueOnce(transient()).mockResolvedValue(result);
    const persisted={read:vi.fn().mockResolvedValue(undefined),write:vi.fn().mockRejectedValue(new Error('Disk'))};
    const session=new AiReadingSession(send,persisted),job=session.request(source,AI_DEFAULTS,[]);
    await vi.advanceTimersByTimeAsync(600);expect(await job).toEqual(result);
    expect(persisted.read).toHaveBeenCalledTimes(1);expect(persisted.write).toHaveBeenCalledTimes(1);
    expect(session.get(aiReadingKey(source,AI_DEFAULTS,[]))).toEqual(result);
  });
});

describe('safe Retry-After metadata',()=>{
  it.each([['12',12000],['0',0],['Sat, 10 Oct 2026 00:00:20 GMT',20000],['Fri, 09 Oct 2026 00:00:00 GMT',0],
    ['secret-token',undefined],['-2',undefined],['1.5',undefined],['999999999999999999999999',undefined],['2026-10-11',undefined]])(
    'parses %s without retaining raw strings',(header,expected)=>expect(parseAiRetryAfter(header as string)).toBe(expected));
  it('attaches numeric metadata on both HTML and JSON 429 errors',async()=>{
    for(const html of [false,true]){
      vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(html?'<html>busy</html>':JSON.stringify({error:'ai_rate_limited'}),
        {status:429,headers:{'content-type':html?'text/html':'application/json','retry-after':'120'}})));
      await expect(aiTranslate({text:'合成'})).rejects.toMatchObject({code:'ai_rate_limited',retryAfterMs:120000});
    }
  });
});
