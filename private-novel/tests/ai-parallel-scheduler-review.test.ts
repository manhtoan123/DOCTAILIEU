import {afterEach,expect,it,vi} from 'vitest';
import {aiQuotaFeedback,resetIdleAiCapacity,withAiRequestCapacity,type AiPartsControl} from '../src/features/ai/services/ai-scheduler';
import {runAiParts,type AiPart,type AiPartsProgress} from '../src/features/ai/services/ai-parts';

const deferred=<T,>()=>{let resolve!:(value:T|PromiseLike<T>)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};};
afterEach(()=>vi.useRealTimers());

it('review: shared foreground and prewarm admission never exceeds two active requests',async()=>{
 const control:AiPartsControl={throttled:false,waitUntil:0},signal=new AbortController().signal,gates=Array.from({length:4},()=>deferred<void>());
 let active=0,maximum=0;const started:number[]=[];
 const runs=gates.map((gate,index)=>withAiRequestCapacity(control,signal,async()=>{started.push(index);maximum=Math.max(maximum,++active);try{await gate.promise;return index;}finally{active--; }},index%2?100:0));
 expect(started).toEqual([0,1]);expect(control.activeRequests).toBe(2);
 gates[0].resolve();await vi.waitFor(()=>expect(started).toEqual([0,1,2]));
 gates[1].resolve();await vi.waitFor(()=>expect(started).toEqual([0,1,2,3]));
 gates[2].resolve();gates[3].resolve();expect(await Promise.all(runs)).toEqual([0,1,2,3]);
 expect(maximum).toBe(2);expect(control.activeRequests).toBe(0);expect(control.queue).toEqual([]);
});

it('review: a queued foreground request takes the next available slot before prewarm',async()=>{
 const control:AiPartsControl={throttled:true,waitUntil:0},signal=new AbortController().signal,held=deferred<void>(),foregroundGate=deferred<void>(),started:string[]=[];
 const first=withAiRequestCapacity(control,signal,()=>held.promise);
 const prewarm=withAiRequestCapacity(control,signal,async()=>{started.push('prewarm');return 'prewarm';},100);
 const foreground=withAiRequestCapacity(control,signal,async()=>{started.push('foreground');await foregroundGate.promise;return 'foreground';});
 held.resolve();await first;await vi.waitFor(()=>expect(started).toEqual(['foreground']));
 foregroundGate.resolve();expect(await foreground).toBe('foreground');expect(await prewarm).toBe('prewarm');
 expect(started).toEqual(['foreground','prewarm']);
});

it('review: cancelling a queued foreground request removes it without consuming a slot or blocking prewarm',async()=>{
 const control:AiPartsControl={throttled:true,waitUntil:0},signal=new AbortController().signal,cancel=new AbortController(),held=deferred<void>(),cancelledSend=vi.fn(),nextSend=vi.fn(async()=>42);
 const first=withAiRequestCapacity(control,signal,()=>held.promise);
 const cancelled=withAiRequestCapacity(control,cancel.signal,cancelledSend),rejected=expect(cancelled).rejects.toMatchObject({name:'AbortError'});
 const next=withAiRequestCapacity(control,signal,nextSend,100);cancel.abort();await rejected;
 expect(control.queue).toHaveLength(1);expect(cancelledSend).not.toHaveBeenCalled();
 held.resolve();await first;expect(await next).toBe(42);expect(nextSend).toHaveBeenCalledOnce();expect(control.activeRequests).toBe(0);expect(control.queue).toEqual([]);
});

it('review: quota feedback reaches both part previews and a later width hint cannot reopen either run',async()=>{
 const control:AiPartsControl={throttled:false,waitUntil:0},signal=new AbortController().signal,held=deferred<void>(),states:[AiPartsProgress[],AiPartsProgress[]]=[[],[]];
 const parts:AiPart[]=[{id:'0',text:'A',start:0,end:1},{id:'1',text:'B',start:1,end:2}];
 const runs=states.map(history=>runAiParts(parts,signal,new Map(),async part=>{await held.promise;return {result:part.text,model:'gemini-3.8-flash',finishReason:'STOP',inputTokens:1,outputTokens:1,parallel:2};},state=>history.push(state),undefined,undefined,2,control));
 expect(control.listeners?.size).toBe(2);aiQuotaFeedback(control,0);
 for(const history of states)expect(history.at(-1)?.parallel).toBe(1);
 held.resolve();await Promise.all(runs);
 for(const history of states)expect(history.at(-1)).toMatchObject({parallel:1,done:2,text:'A\nB'});
 expect(control.listeners?.size).toBe(0);
});

it('review: shared cooldown queues sends and admits only one request when the wait expires',async()=>{
 vi.useFakeTimers();
 const control:AiPartsControl={throttled:false,waitUntil:0},signal=new AbortController().signal,held=deferred<void>(),started:string[]=[];
 aiQuotaFeedback(control,1000);
 const first=withAiRequestCapacity(control,signal,async()=>{started.push('first');await held.promise;return 1;});
 const second=withAiRequestCapacity(control,signal,async()=>{started.push('second');return 2;});
 await vi.advanceTimersByTimeAsync(999);expect(started).toEqual([]);
 await vi.advanceTimersByTimeAsync(1);expect(started).toEqual(['first']);expect(control.activeRequests).toBe(1);
 held.resolve();expect(await first).toBe(1);expect(await second).toBe(2);expect(started).toEqual(['first','second']);expect(control.activeRequests).toBe(0);
});

it('review: a later idle job recovers two slots only after quota stability and without clearing active work or cooldown',()=>{
 vi.useFakeTimers();vi.setSystemTime(100000);
 const control:AiPartsControl={throttled:false,waitUntil:0};aiQuotaFeedback(control,1000);
 vi.setSystemTime(101001);resetIdleAiCapacity(control);expect(control.throttled).toBe(true);
 vi.setSystemTime(160001);control.activeRequests=1;resetIdleAiCapacity(control);expect(control.throttled).toBe(true);
 control.activeRequests=0;control.queue=[{priority:0,wake:()=>{}}];resetIdleAiCapacity(control);expect(control.throttled).toBe(true);
 control.queue=[];control.waitUntil=170000;resetIdleAiCapacity(control);expect(control.throttled).toBe(true);expect(control.waitUntil).toBe(170000);
 vi.setSystemTime(170001);resetIdleAiCapacity(control);expect(control.throttled).toBe(false);
});
