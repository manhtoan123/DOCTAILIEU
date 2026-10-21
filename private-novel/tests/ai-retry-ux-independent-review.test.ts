import {afterEach,expect,it,vi} from 'vitest';
import {AiChapterJob,createAiChapterBudget} from '../src/features/ai/services/ai-job';
import {AiRecovery} from '../src/features/ai/services/ai-recovery';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {AiTranslateClientError,type AiTranslateClientRequest} from '../src/features/ai/services/ai-translate';
import {getAiRunMetrics} from '../src/features/ai/services/ai-metrics';
import {mayFallbackModel} from '../src/features/ai/services/ai-fallback';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';

const settings={...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[]};
const source={bookId:'retry-review',id:'retry-review-chapter',revision:1,text:'合成短章'};
const answer=(input:AiTranslateClientRequest,result='Dịch đủ')=>({result,model:input.model!,finishReason:'STOP',inputTokens:1,outputTokens:1});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();resetAiKeyState();});

it('review: identical failures share their send cap across jobs on the same budget',async()=>{
 const limits={durationMs:10000,sends:24},budget=createAiChapterBudget(limits),first=new AiChapterJob(limits,undefined,budget),next=new AiChapterJob(limits,undefined,budget);
 const error=new AiTranslateClientError('ai_gateway_error','Synthetic',503),send=vi.fn(async()=>{throw error;});
 for(let i=0;i<3;i++)await expect(first.send(send,'same model and source')).rejects.toBe(error);
 await expect(next.send(send,'same model and source')).rejects.toBe(error);
 expect(send).toHaveBeenCalledTimes(3);expect(budget.sends).toBe(3);
 await expect(next.send(async()=>42,'different source')).resolves.toBe(42);
 await expect(new AiChapterJob(limits).send(send,'same model and source')).rejects.toBe(error);
 expect(send).toHaveBeenCalledTimes(4);
});

it('review: going offline during model cooldown pauses the next send until online',async()=>{
 vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);
 const browser=new EventTarget(),connection={onLine:true};vi.stubGlobal('window',browser);vi.stubGlobal('navigator',connection);
 const send=vi.fn().mockRejectedValueOnce(new AiTranslateClientError('ai_rate_limited','Busy',429,'http',undefined,undefined,1000)).mockResolvedValue('done');
 const controller=new AbortController(),pending=new AiRecovery().run('model',controller.signal,send);
 await vi.advanceTimersByTimeAsync(900);connection.onLine=false;
 await vi.advanceTimersByTimeAsync(1000);expect(send).toHaveBeenCalledTimes(1);
 connection.onLine=true;browser.dispatchEvent(new Event('online'));
 expect(await pending).toBe('done');expect(send).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
});

it('review: reconnection rechecks a cooldown extended by an already in-flight sibling',async()=>{
 vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);
 const browser=new EventTarget(),connection={onLine:true};vi.stubGlobal('window',browser);vi.stubGlobal('navigator',connection);
 const recovery=new AiRecovery(),controller=new AbortController();let rejectSibling!:(error:unknown)=>void;
 const sibling=recovery.run('model',controller.signal,()=>new Promise((_,reject)=>{rejectSibling=reject;}),true,0).catch(e=>e);
 const send=vi.fn().mockRejectedValueOnce(new AiTranslateClientError('ai_rate_limited','Busy',429,'http',undefined,undefined,1000)).mockResolvedValue('done');
 const pending=recovery.run('model',controller.signal,send);
 await vi.advanceTimersByTimeAsync(900);connection.onLine=false;await vi.advanceTimersByTimeAsync(200);
 rejectSibling(new AiTranslateClientError('ai_rate_limited','Busy',429,'http',undefined,undefined,5000));await sibling;
 await vi.advanceTimersByTimeAsync(400);connection.onLine=true;browser.dispatchEvent(new Event('online'));
 await vi.advanceTimersByTimeAsync(4599);expect(send).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);expect(await pending).toBe('done');expect(send).toHaveBeenCalledTimes(2);
});

it.each(['txt','epub'] as const)('review: automatic %s recovery starts a fresh bounded round on the same chapter budget',async format=>{
 vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);
 const error=new AiTranslateClientError('ai_gateway_error','Synthetic',503),send=vi.fn(async()=>{throw error;});
 const session=format==='txt'?new AiReadingSession(send):new EpubAiSession(undefined,send);
 const request=(automatic=false)=>session instanceof AiReadingSession?session.request(source,settings,[],undefined,undefined,undefined,{automatic}):session.request(source,settings,[],{path:'c.xhtml',nodes:[source.text],body:'<p>synthetic</p>',styles:[]},undefined,undefined,{automatic});
 try{
  let failure=request().catch(e=>e);await vi.runAllTimersAsync();expect(await failure).toBe(error);expect(send).toHaveBeenCalledTimes(3);
  failure=request(true).catch(e=>e);await vi.runAllTimersAsync();expect(await failure).toBe(error);expect(send).toHaveBeenCalledTimes(6);
  expect(session.get(aiReadingKey(source,settings,[]))).toBeUndefined();
  failure=request().catch(e=>e);await vi.runAllTimersAsync();expect(await failure).toBe(error);expect(send).toHaveBeenCalledTimes(9);
 }finally{session.clear();}
});

it.each(['txt','epub'] as const)('review: manual hybrid %s retry respects the failed second-half model cooldown',async format=>{
 vi.useFakeTimers();
 const selected={...settings,hybrid:{version:1 as const,liteModel:'gemini-3.1-flash-lite' as const,rules:''}},text='甲'.repeat(1800)+'乙'.repeat(1800),input={...source,text};
 const limited=new AiTranslateClientError('ai_rate_limited','Busy',429,'http',undefined,undefined,120000);
 const send=vi.fn(async(req:AiTranslateClientRequest)=>{if(req.continuation)throw limited;return answer(req,format==='txt'?'First':JSON.stringify({'0':'First'}));});
 const session=format==='txt'?new AiReadingSession(send):new EpubAiSession(undefined,send);
 const request=()=>session instanceof AiReadingSession?session.request(input,selected,[]):session.request(input,selected,[],{path:'c.xhtml',nodes:['甲'.repeat(1800),'乙'.repeat(1800)],body:'<p>synthetic</p>',styles:[]});
 try{
  await expect(request()).rejects.toMatchObject({status:429});const count=send.mock.calls.length;
  await expect(request()).rejects.toMatchObject({status:429});expect(send).toHaveBeenCalledTimes(count);
 }finally{session.clear();}
});

it('review: ordinary EPUB manual retry preserves server cooldown across its recreated inner job',async()=>{
 vi.useFakeTimers();
 const send=vi.fn(async()=>{throw new AiTranslateClientError('ai_rate_limited','Busy',429,'http',undefined,undefined,120000);}),session=new EpubAiSession(undefined,send);
 const request=()=>session.request(source,settings,[],{path:'c.xhtml',nodes:[source.text],body:'<p>synthetic</p>',styles:[]});
 try{
  await expect(request()).rejects.toMatchObject({status:429});expect(send).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60000);await expect(request()).rejects.toMatchObject({status:429,retryAfterMs:60000});expect(send).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60000);await expect(request()).rejects.toMatchObject({status:429});expect(send).toHaveBeenCalledTimes(2);
 }finally{session.clear();}
});

it.each(['txt','epub'] as const)('review: hybrid %s records exactly one chapter metric and preserves node mapping',async format=>{
 const before=new Set(getAiRunMetrics().map(row=>row.workId)),text='甲'.repeat(1800)+'乙'.repeat(1800),selected={...settings,hybrid:{version:1 as const,liteModel:'gemini-3.1-flash-lite' as const,rules:''}},input={...source,text};
 const send=vi.fn(async(req:AiTranslateClientRequest)=>answer(req,format==='epub'?JSON.stringify(Object.fromEntries(Object.keys(JSON.parse(req.text)).map(key=>[key,req.continuation?'Second':'First']))):req.continuation?'Second':'First'));
 if(format==='txt'){const session=new AiReadingSession(send);try{expect((await session.request(input,selected,[])).result).toBe('First\nSecond');}finally{session.clear();}}
 else{const session=new EpubAiSession(undefined,send);try{expect((await session.request(input,selected,[],{path:'c.xhtml',nodes:['甲'.repeat(1800),'乙'.repeat(1800)],body:'<p>synthetic</p>',styles:[]})).nodes).toEqual(['First','Second']);}finally{session.clear();}}
 const rows=getAiRunMetrics().filter(row=>!before.has(row.workId));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({kind:format,status:'complete',sourceChars:text.length,requests:send.mock.calls.length});
 expect(send).toHaveBeenCalledTimes(2);
});

it('review: unrecognised upstream 400 stays permanent and never exposes upstream diagnostics',async()=>{
 const spy=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({error:{message:'SENSITIVE synthetic upstream body',status:'INVALID_ARGUMENT'}},{status:400}));
 const response=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Synthetic source',model:settings.model})}),{GEMINI_API_KEY:'synthetic-review-only'});
 expect(response.status).toBe(400);const payload=await response.json();expect(payload).toMatchObject({error:'ai_request_rejected'});expect(response.headers.get('x-ai-failure-reason')).toBe('request_validation');expect(JSON.stringify(payload)).not.toContain('SENSITIVE');expect(spy).toHaveBeenCalledOnce();
 expect(mayFallbackModel(new AiTranslateClientError('ai_request_rejected','Rejected',400,'request_validation'))).toBe(false);
});

