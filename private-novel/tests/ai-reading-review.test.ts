import {describe,it,expect,vi} from 'vitest';
import {AiReadingSession,aiReadingKey,AI_DEFAULTS,readReadingAiSettings,queueAiSettings} from '../src/features/ai/services/ai-reading';
import type {AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';

const source={bookId:'synthetic-book',id:'chapter-one',revision:1,text:'林儿你好。'};
const names=[{key:'林儿',value:'Lâm Nhi'}];
const result:AiTranslateClientResponse={result:'Lâm Nhi xin chào.',model:AI_DEFAULTS.model,finishReason:'STOP',inputTokens:1,outputTokens:1};
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

describe('Independent AI reading session regression',()=>{
  it('serializes delayed settings saves before a remount read without blocking other books',async()=>{
    const gate=deferred<void>(),events:string[]=[];let saved='old';
    const write=queueAiSettings('review-book-one',async()=>{events.push('write-start');await gate.promise;saved='new';events.push('write-end');});
    const read=queueAiSettings('review-book-one',async()=>{events.push('read');return saved;});
    expect(await queueAiSettings('review-book-two',async()=> 'independent')).toBe('independent');
    expect(events).toEqual(['write-start']);gate.resolve();await write;
    expect(await read).toBe('new');expect(events).toEqual(['write-start','write-end','read']);
  });
  it('propagates settings write failure without poisoning following operations',async()=>{
    const error=new Error('synthetic write failure');
    const failed=queueAiSettings('review-failed-book',async()=>{throw error;});
    const next=queueAiSettings('review-failed-book',async()=> 'saved previous value');
    await expect(failed).rejects.toBe(error);expect(await next).toBe('saved previous value');
  });
  it('hydrates legacy partial settings and excludes unknown stored fields from requests',()=>{
    expect(readReadingAiSettings({systemPrompt:'Legacy prompt'})).toEqual({...AI_DEFAULTS,systemPrompt:'Legacy prompt'});
    expect(readReadingAiSettings({model:'unlisted',temperature:NaN,userPromptTemplate:'missing token',systemPrompt:'x'.repeat(8001),apiKey:'synthetic-private'})).toEqual(AI_DEFAULTS);
    expect(readReadingAiSettings({model:'gemini-3.5-flash-lite'})).toEqual({...AI_DEFAULTS,model:'gemini-3.5-flash-lite'});
    expect(readReadingAiSettings({model:'gemini-3.6-flash'})).toEqual(AI_DEFAULTS);
    expect(readReadingAiSettings({model:'gemini-2.5-flash'})).toEqual({...AI_DEFAULTS,model:'gemini-2.5-flash'});
    expect(readReadingAiSettings(null)).toEqual(AI_DEFAULTS);
  });
  it('deduplicates concurrent current requests and never mutates source or names',async()=>{
    const pending=deferred<AiTranslateClientResponse>(),translate=vi.fn(()=>pending.promise),session=new AiReadingSession(translate);
    const before=JSON.stringify([source,names,AI_DEFAULTS]);
    const first=session.request(source,AI_DEFAULTS,names),second=session.request(source,AI_DEFAULTS,names);
    expect(first).toBe(second);expect(translate).toHaveBeenCalledOnce();pending.resolve(result);await first;
    expect(await session.request(source,AI_DEFAULTS,names)).toBe(result);expect(translate).toHaveBeenCalledOnce();
    expect(JSON.stringify([source,names,AI_DEFAULTS])).toBe(before);
  });
  it('drops an aborted late result and preserves a new request with the same key',async()=>{
    const old=deferred<AiTranslateClientResponse>(),fresh=deferred<AiTranslateClientResponse>();
    const translate=vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise),session=new AiReadingSession(translate);
    const rejected=session.request(source,AI_DEFAULTS,names).catch(error=>error);session.clear();
    expect(translate.mock.calls[0][1].aborted).toBe(true);
    const newest=session.request(source,AI_DEFAULTS,names);old.resolve({...result,result:'STALE'});
    expect((await rejected).name).toBe('AbortError');expect(session.get(aiReadingKey(source,AI_DEFAULTS,names))).toBeUndefined();
    expect(session.request(source,AI_DEFAULTS,names)).toBe(newest);fresh.resolve(result);await newest;
    expect(session.get(aiReadingKey(source,AI_DEFAULTS,names))).toBe(result);
  });
  it('promotes retained next chapter without a duplicate request and evicts old current',async()=>{
    const next={...source,id:'chapter-two'},translate=vi.fn().mockResolvedValue(result),session=new AiReadingSession(translate);
    const currentKey=aiReadingKey(source,AI_DEFAULTS,names),nextKey=aiReadingKey(next,AI_DEFAULTS,names);
    await session.request(source,AI_DEFAULTS,names);session.retain([currentKey,nextKey]);await session.request(next,AI_DEFAULTS,names);
    session.retain([nextKey]);await session.request(next,AI_DEFAULTS,names);
    expect(translate).toHaveBeenCalledTimes(2);expect(session.get(currentKey)).toBeUndefined();expect(session.get(nextKey)).toBe(result);
  });
  it('quota failures make one attempt with selected model and no implicit retry or fallback',async()=>{
    const error=Object.assign(new Error('quota'),{status:429}),translate=vi.fn().mockRejectedValue(error),session=new AiReadingSession(translate);
    await expect(session.request(source,AI_DEFAULTS,names)).rejects.toBe(error);await Promise.resolve();
    expect(translate).toHaveBeenCalledOnce();expect(translate.mock.calls[0][0].model).toBe(AI_DEFAULTS.model);
    expect(session.get(aiReadingKey(source,AI_DEFAULTS,names))).toBeUndefined();
  });
  it.each(['MAX_TOKENS','SAFETY'])('never caches incomplete %s output',async finishReason=>{
    const session=new AiReadingSession(vi.fn().mockResolvedValue({...result,finishReason}));
    await expect(session.request(source,AI_DEFAULTS,names)).rejects.toThrow();expect(session.get(aiReadingKey(source,AI_DEFAULTS,names))).toBeUndefined();
  });
  it('keys every semantic setting and source revision while ignoring absent Names',()=>{
    const baseline=aiReadingKey(source,AI_DEFAULTS,names);
    for(const patch of [{revision:2},{text:source.text+'新'},{id:'other'},{bookId:'other'}])expect(aiReadingKey({...source,...patch},AI_DEFAULTS,names)).not.toBe(baseline);
    for(const patch of [{model:'other'},{temperature:0.5},{systemPrompt:'new'},{userPromptTemplate:'new {{text}}'}])expect(aiReadingKey(source,{...AI_DEFAULTS,...patch},names)).not.toBe(baseline);
    expect(aiReadingKey(source,AI_DEFAULTS,[...names,{key:'不在',value:'Absent'}])).toBe(baseline);
    expect(aiReadingKey(source,AI_DEFAULTS,[...names,{key:'林儿',value:'New Name'}])).not.toBe(baseline);
  });
});
