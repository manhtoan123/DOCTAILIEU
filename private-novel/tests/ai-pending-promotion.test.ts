import {afterEach,expect,it,vi} from 'vitest';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
import {withAiRequestCapacity,type AiPartsControl} from '../src/features/ai/services/ai-scheduler';
import {AiJobHandoff} from '../src/features/ai/services/ai-job-handoff';

const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};};
const source=(id:string)=>({bookId:'synthetic-promotion',id,revision:1,text:'甲乙。'});
const selected={...AI_DEFAULTS,model:'gemini-3.8-flash',fallbackModels:['gemma-4-26b-a4b-it']};
const answer=(model:string,result='Bản dịch hoàn tất.')=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:1});
afterEach(()=>vi.useRealTimers());

it('promotion preserves a shared cooldown deadline and then wins admission',async()=>{
 vi.useFakeTimers();vi.setSystemTime(0);
 const control:AiPartsControl={throttled:true,waitUntil:10000},signal=new AbortController().signal,started:string[]=[],held=deferred<void>();
 const first=new AiJobHandoff(control,true),current=new AiJobHandoff(control,true);
 const waiting=withAiRequestCapacity(control,signal,async()=>{started.push('background');},first.priority);
 const promoted=withAiRequestCapacity(control,signal,async()=>{started.push('current');await held.promise;},current.priority);
 await vi.advanceTimersByTimeAsync(1000);current.attach(undefined,true);
 await vi.advanceTimersByTimeAsync(8999);expect(started).toEqual([]);expect(control.waitUntil).toBe(10000);
 await vi.advanceTimersByTimeAsync(1);expect(started).toEqual(['current']);expect(control.activeRequests).toBe(1);
 held.resolve();await Promise.all([waiting,promoted]);expect(started).toEqual(['current','background']);expect(control.activeRequests).toBe(0);
 first.close();current.close();
});

it.each(['txt','epub'] as const)('promotes queued %s prewarm in place, replays model and preserves progress and request identity',async kind=>{
 const control:AiPartsControl={throttled:true,waitUntil:0},held=deferred<void>(),started:string[]=[],currentModels:string[]=[],currentProgress:number[]=[];
 const blocker=withAiRequestCapacity(control,new AbortController().signal,()=>held.promise);
 const firstSource=source('first'),currentSource=source('current');
 const send=vi.fn(async(input:{text:string;model?:string})=>{started.push(input.text);return answer(input.model!,kind==='epub'?JSON.stringify({'0':'Bản dịch hoàn tất.'}):undefined);});
 const session=kind==='txt'?new AiReadingSession(send,undefined,undefined,false,undefined,control):new EpubAiSession(undefined,send,false,undefined,control);
 const request=(chapter:ReturnType<typeof source>,prewarm:boolean,observe=false)=>session instanceof AiReadingSession
  ?session.request(chapter,selected,[],undefined,observe?m=>currentModels.push(m):undefined,observe?p=>currentProgress.push(p.done):undefined,{isPrewarm:prewarm})
  :session.request(chapter,selected,[],{path:'chapter.xhtml',body:'<p>甲乙。</p>',styles:[],nodes:[chapter.text]},observe?m=>currentModels.push(m):undefined,observe?p=>currentProgress.push(p.done):undefined,{isPrewarm:prewarm});
 // Distinct source text makes send order observable without exposing chapter IDs.
 firstSource.text='先来。';currentSource.text='后来。';
 const first=request(firstSource,true),current=request(currentSource,true);
 await vi.waitFor(()=>expect(control.queue).toHaveLength(2));
 const promoted=request(currentSource,false,true);expect(promoted).toBe(current);expect(currentModels).toEqual([selected.model]);
 expect(control.queue!.map(entry=>entry.priority)).toEqual([100,0]);
 held.resolve();await blocker;await Promise.all([first,current,promoted]);
 expect(started).toEqual(kind==='txt'?['后来。','先来。']:['{"0":"后来。"}','{"0":"先来。"}']);
 expect(send).toHaveBeenCalledTimes(2);expect(currentProgress.at(-1)).toBe(1);expect(control.activeRequests).toBe(0);expect(control.queue).toEqual([]);
 expect(session.get(aiReadingKey(currentSource,selected,[]))?.result).toBe('Bản dịch hoàn tất.');session.clear();
});

it.each(['txt','epub'] as const)('a promoted pending %s job receives future fallback model updates without duplicate sends',async kind=>{
 const held=deferred<void>(),models:string[]=[],calls:string[]=[];
 const send=async(input:{model?:string})=>{calls.push(input.model!);if(input.model===selected.model){await held.promise;throw new AiTranslateClientError('ai_timeout','Synthetic timeout',504);}return answer(input.model!,kind==='epub'?'{"0":"Đã xong."}':'Đã xong.');};
 const session=kind==='txt'?new AiReadingSession(send):new EpubAiSession(undefined,send);
 const chapter=source('fallback'),request=(prewarm:boolean,observer?:((model:string)=>void))=>session instanceof AiReadingSession
  ?session.request(chapter,selected,[],undefined,observer,undefined,{isPrewarm:prewarm})
  :session.request(chapter,selected,[],{path:'c.xhtml',body:'<p>甲乙。</p>',styles:[],nodes:[chapter.text]},observer,undefined,{isPrewarm:prewarm});
 const pending=request(true);await vi.waitFor(()=>expect(calls).toHaveLength(1));const promoted=request(false,m=>models.push(m));expect(promoted).toBe(pending);
 expect(models).toEqual([selected.model]);held.resolve();await pending;
 expect(models).toEqual([selected.model,'gemma-4-26b-a4b-it']);expect(calls).toEqual(models);session.clear();
});

it.each(['txt','epub'] as const)('Stop removes a promoted queued %s job and never publishes a late result',async kind=>{
 const control:AiPartsControl={throttled:true,waitUntil:0},held=deferred<void>(),models:string[]=[],send=vi.fn(async()=>answer(selected.model));
 const blocker=withAiRequestCapacity(control,new AbortController().signal,()=>held.promise);
 const session=kind==='txt'?new AiReadingSession(send,undefined,undefined,false,undefined,control):new EpubAiSession(undefined,send,false,undefined,control),chapter=source('stop');
 const request=(prewarm:boolean,observer?:((model:string)=>void))=>session instanceof AiReadingSession
  ?session.request(chapter,selected,[],undefined,observer,undefined,{isPrewarm:prewarm})
  :session.request(chapter,selected,[],{path:'c.xhtml',body:'<p>甲乙。</p>',styles:[],nodes:[chapter.text]},observer,undefined,{isPrewarm:prewarm});
 const pending=request(true),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
 await vi.waitFor(()=>expect(control.queue).toHaveLength(1));expect(request(false,m=>models.push(m))).toBe(pending);
 session.cancel(aiReadingKey(chapter,selected,[]));await rejected;held.resolve();await blocker;
 expect(send).not.toHaveBeenCalled();expect(models).toEqual([selected.model]);expect(control.queue).toEqual([]);expect(session.get(aiReadingKey(chapter,selected,[]))).toBeUndefined();session.clear();
});

it('handoff ignores closed and throwing display observers without changing translation state',()=>{
 const control:AiPartsControl={throttled:false,waitUntil:0},seen:string[]=[],handoff=new AiJobHandoff(control,true,()=>{throw Error('Synthetic display failure');});
 handoff.model('first');handoff.attach(m=>seen.push(m),true);handoff.model('second');expect(seen).toEqual(['first','second']);expect(handoff.priority()).toBe(0);
 handoff.close();handoff.model('late');handoff.attach(m=>seen.push(m),false);expect(seen).toEqual(['first','second']);
});
