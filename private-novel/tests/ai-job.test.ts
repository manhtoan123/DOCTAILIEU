import {afterEach,expect,it,vi} from 'vitest';
import {AiChapterJob,AI_CHAPTER_LIMITS,EPUB_AI_CHAPTER_LIMITS,AI_CACHE_READ_MS,AI_CACHE_WRITE_MS} from '../src/features/ai/services/ai-job';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey,type AiReadingCache} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {AiTranslateClientError,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import {isTransientAiFailure} from '../src/features/ai/services/ai-recovery';
import {mayFallbackModel} from '../src/features/ai/services/ai-fallback';
const source={bookId:'job-book',id:'one',revision:1,text:'甲乙'},settings={...AI_DEFAULTS,fallbackModels:[]};
const result:AiTranslateClientResponse={result:'Bản dịch đầy đủ',model:settings.model,finishReason:'STOP',inputTokens:1,outputTokens:1};
const layout={path:'one.xhtml',body:'<body><p>甲</p><p>乙</p></body>',styles:[],nodes:['甲','乙']};
const never=<T>()=>new Promise<T>(()=>{});
const flush=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

it.each(['read','write'] as const)('TXT ignores a hung optional cache %s and aborts only that cache operation',async kind=>{
 vi.useFakeTimers();let cacheSignal:AbortSignal|undefined,sendSignal:AbortSignal|undefined;
 const cache:AiReadingCache={read:async()=>undefined,write:async()=>true};
 if(kind==='read')cache.read=async(_s,_p,_n,signal)=>{cacheSignal=signal;return never();};
 else cache.write=async(_s,_p,_n,_r,signal)=>{cacheSignal=signal;return never();};
 const translate=vi.fn(async(_input,signal)=>{sendSignal=signal;return result;}),session=new AiReadingSession(translate,cache);
 const pending=session.request(source,settings,[]);await flush();
 await vi.advanceTimersByTimeAsync(kind==='read'?AI_CACHE_READ_MS:AI_CACHE_WRITE_MS);
 expect(await pending).toEqual(result);expect(cacheSignal?.aborted).toBe(true);expect(sendSignal?.aborted).toBe(false);
 expect(translate).toHaveBeenCalledOnce();expect(session.get(aiReadingKey(source,settings,[]))).toEqual(result);
});

it('discards a cache hit arriving after the read deadline and keeps the fresh complete result',async()=>{
 vi.useFakeTimers();let release!:(r:AiTranslateClientResponse)=>void;
 const translate=vi.fn(async()=>result),session=new AiReadingSession(translate,{read:()=>new Promise(r=>{release=r;}),write:async()=>true});
 const pending=session.request(source,settings,[]);await vi.advanceTimersByTimeAsync(AI_CACHE_READ_MS);
 expect(await pending).toEqual(result);release({...result,result:'LATE CACHE'});await flush();
 expect(session.get(aiReadingKey(source,settings,[]))).toEqual(result);expect(translate).toHaveBeenCalledOnce();
});

it('settles cancellation immediately while a cache or translator ignores its signal',async()=>{
 for(const useCache of [false,true]){
  let signal:AbortSignal|undefined;
  const session=new AiReadingSession(async(_i,s)=>{signal=s;return never();},useCache?{read:async(_s,_p,_n,s)=>{signal=s;return never();},write:async()=>true}:undefined);
  const failure=session.request(source,settings,[]).catch(e=>e);await flush();session.clear();
  expect((await failure).name).toBe('AbortError');expect(signal?.aborted).toBe(true);expect(session.get(aiReadingKey(source,settings,[]))).toBeUndefined();
 }
});

it('shows a permanent chapter deadline, releases the pending key and rejects late output',async()=>{
 vi.useFakeTimers();let release!:(r:AiTranslateClientResponse)=>void,oldSignal:AbortSignal|undefined,writes=0;
 const translate=vi.fn().mockImplementationOnce((_i,s)=>{oldSignal=s;return new Promise(r=>{release=r;});}).mockResolvedValue(result);
 const session=new AiReadingSession(translate,{read:async()=>undefined,write:async()=>{writes++;return true;}});
 const failure=session.request(source,settings,[]).catch(e=>e);await vi.advanceTimersByTimeAsync(AI_CHAPTER_LIMITS.durationMs);
 const error=await failure;expect(error).toMatchObject({code:'ai_recovery_exhausted',reason:'chapter_deadline'});
 expect(error.name).not.toBe('AbortError');expect(error.retryAfterMs).toBeUndefined();expect(isTransientAiFailure(error)).toBe(false);expect(mayFallbackModel(error)).toBe(false);
 expect(oldSignal?.aborted).toBe(true);expect(writes).toBe(0);
 const next=session.request(source,settings,[]);expect(await next).toEqual(result);
 release({...result,result:'LATE TRANSLATION'});await flush();expect(writes).toBe(1);expect(session.get(aiReadingKey(source,settings,[]))).toEqual(result);
});

it('counts actual sends including child retries, bounds them and never publishes partial children',async()=>{
 vi.useFakeTimers();const oldLimit=EPUB_AI_CHAPTER_LIMITS.sends;EPUB_AI_CHAPTER_LIMITS.sends=AI_CHAPTER_LIMITS.sends;let children=0,active=0,maxActive=0;
 const translate=vi.fn(async input=>{active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;
  if(input.text.length>=400)throw new AiTranslateClientError('ai_incomplete_result','cut',502,'output_limit');
  if(++children%3)throw new AiTranslateClientError('ai_gateway_error','retry',503);
  return result;
 });
 const long={...source,text:'中'.repeat(6000)},cache={read:async()=>undefined,write:vi.fn(async()=>true)},session=new AiReadingSession(translate,cache);
 try{const failure=session.request(long,settings,[]).catch(e=>e);await vi.runAllTimersAsync();
 expect(await failure).toMatchObject({code:'ai_recovery_exhausted',reason:'send_limit'});
 expect(translate).toHaveBeenCalledTimes(AI_CHAPTER_LIMITS.sends);expect(maxActive).toBe(1);expect(cache.write).not.toHaveBeenCalled();expect(session.get(aiReadingKey(long,settings,[]))).toBeUndefined();}finally{session.clear();EPUB_AI_CHAPTER_LIMITS.sends=oldLimit;}
});

it.each(['read','write'] as const)('EPUB bounds the optional whole-chapter cache %s',async kind=>{
 vi.useFakeTimers();let signal:AbortSignal|undefined;
 const cache:AiReadingCache={read:async()=>undefined,write:async()=>true};
 if(kind==='read')cache.read=async(_s,_p,_n,s)=>{signal=s;return never();};
 else cache.write=async(_s,_p,_n,_r,s)=>{signal=s;return never();};
 const session=new EpubAiSession(cache,async input=>({...result,result:JSON.stringify(Object.fromEntries(Object.keys(JSON.parse(input.text)).map(key=>[key,'Dịch '+key])))}));
 const pending=session.request(source,settings,[],layout);await flush();await vi.advanceTimersByTimeAsync(kind==='read'?AI_CACHE_READ_MS:AI_CACHE_WRITE_MS);
 expect((await pending).nodes).toEqual(['Dịch 0','Dịch 1']);expect(signal?.aborted).toBe(true);
});

it('EPUB shares one wallclock across sequential batches, aborts a stalled batch and keeps partials private',async()=>{
 vi.useFakeTimers();const nodes=['甲'.repeat(31900),'乙'.repeat(31900),'丙'.repeat(31900),'丁'.repeat(31900)],signals:(AbortSignal|undefined)[]=[];
 const cache={read:async()=>undefined,write:vi.fn(async()=>true)},translate=vi.fn(async(input,signal)=>{signals.push(signal);await new Promise(r=>setTimeout(r,170_000));return {...result,result:JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(input.text) as Record<string,string>).map(([key,value])=>[key,'V'.repeat(value.length)])))};});
 const session=new EpubAiSession(cache,translate),large={...source,text:nodes.join('\n')};
 const failure=session.request(large,settings,[],{...layout,nodes}).catch(e=>e);await vi.advanceTimersByTimeAsync(EPUB_AI_CHAPTER_LIMITS.durationMs);
 expect(await failure).toMatchObject({code:'ai_recovery_exhausted',reason:'chapter_deadline'});expect(translate).toHaveBeenCalledTimes(4);expect(cache.write).not.toHaveBeenCalled();expect(session.get(aiReadingKey(large,settings,[]))).toBeUndefined();expect(signals.at(-1)?.aborted).toBe(true);
});

it('EPUB output_limit splits complete ID groups and never sends half a JSON document',async()=>{
 const nodes=['甲'.repeat(400),'乙'.repeat(400)],calls:string[]=[],session=new EpubAiSession(undefined,async input=>{
  calls.push(input.text);const row=JSON.parse(input.text);if(Object.keys(row).length>1)throw new AiTranslateClientError('ai_incomplete_result','cut',502,'output_limit');
  return {...result,result:JSON.stringify(Object.fromEntries(Object.keys(row).map(key=>[key,'Đủ '+key])))};
 });
 expect((await session.request({...source,text:nodes.join('\n')},settings,[],{...layout,nodes})).nodes).toEqual(['Đủ 0','Đủ 1']);
 expect(calls).toHaveLength(3);expect(calls.map(text=>Object.keys(JSON.parse(text)))).toEqual([['0','1'],['0'],['1']]);
});

it('the shared send budget spans batches without parallel provider calls',async()=>{
 const job=new AiChapterJob({durationMs:10000,sends:2});let calls=0;
 const failure=await job.run(async()=>{await job.send(async()=>{calls++;});await job.send(async()=>{calls++;});await job.send(async()=>{calls++;});}).catch(e=>e);
 expect(failure).toMatchObject({code:'ai_recovery_exhausted',reason:'send_limit'});expect(calls).toBe(2);expect(job.controller.signal.aborted).toBe(true);
});
