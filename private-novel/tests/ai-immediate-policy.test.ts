import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {AiRecovery} from '../src/features/ai/services/ai-recovery';
import {AiReadingSession,AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
import {aiQuotaFeedback,withAiRequestCapacity,type AiPartsControl} from '../src/features/ai/services/ai-scheduler';
import {runAiParts} from '../src/features/ai/services/ai-parts';
import {aiChapterView} from '../src/features/ai/types/ai-chapter-view';
import {runPromptComparison} from '../src/features/ai/services/ai-prompt-trial';
import {AiChapterJob} from '../src/features/ai/services/ai-job';
const model='gemini-2.5-flash',other='gemma-4-26b-a4b-it',keys=['synthetic-immediate-alpha','synthetic-immediate-beta'],env={GEMINI_API_KEYS:JSON.stringify(keys)};
const settings={...AI_DEFAULTS,model,fallbackModels:[other]},source={bookId:'synthetic-immediate',id:'one',revision:1,text:'甲'.repeat(2999)};
const result=(m=model,text='Bản dịch hoàn tất.')=>({result:text,model:m,finishReason:'STOP',inputTokens:1,outputTokens:1});
const provider=()=>Response.json({candidates:[{content:{parts:[{text:'Bản dịch.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:1}});
const request=(signal?:AbortSignal)=>new Request('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json','X-AI-Immediate':'1'},body:JSON.stringify({text:'你好',model}),signal});
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);resetAiKeyState();});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();resetAiKeyState();});
it('immediate admission still honors Retry-After and bounded retry backoff',async()=>{
 const recovery=new AiRecovery(),calls=vi.fn(async()=>{if(calls.mock.calls.length<3)throw new AiTranslateClientError('ai_rate_limited','Synthetic',429,undefined,undefined,undefined,10000);return 'done';});
 const job=recovery.run(model,new AbortController().signal,calls,true,2,undefined,false,true);await vi.advanceTimersByTimeAsync(9999);expect(calls).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(10001);expect(await job).toBe('done');expect(calls).toHaveBeenCalledTimes(3);expect(vi.getTimerCount()).toBe(0);
});
it('quota feedback adds no global deadline and real occupied slots still enforce the cap',async()=>{
 const control:AiPartsControl={immediate:true,throttled:false,waitUntil:99999};aiQuotaFeedback(control,90000);expect(control.waitUntil).toBe(0);expect(control.throttledUntil).toBe(0);
 expect(await withAiRequestCapacity(control,new AbortController().signal,async()=>42)).toBe(42);expect(vi.getTimerCount()).toBe(0);
});
it('immediate admission still has at most two active requests and Stop removes queued work',async()=>{
 const control:AiPartsControl={immediate:true,throttled:false,waitUntil:0},gates:Array<()=>void>=[],sent:number[]=[],stop=new AbortController();
 const send=(id:number)=>async()=>{sent.push(id);await new Promise<void>(resolve=>gates.push(resolve));return id;};
 const one=withAiRequestCapacity(control,new AbortController().signal,send(1)),two=withAiRequestCapacity(control,new AbortController().signal,send(2));
 const queued=withAiRequestCapacity(control,stop.signal,send(3)),rejected=expect(queued).rejects.toMatchObject({name:'AbortError'});expect(sent).toEqual([1,2]);expect(control.activeRequests).toBe(2);stop.abort();await rejected;gates.forEach(done=>done());await Promise.all([one,two]);expect(sent).toEqual([1,2]);expect(control.activeRequests).toBe(0);expect(vi.getTimerCount()).toBe(0);
});
it('completed part recovery honors Retry-After and keeps ordered completed siblings',async()=>{
 const control:AiPartsControl={immediate:true,throttled:false,waitUntil:0},calls:string[]=[],states:any[]=[];
 const parts=[{id:'0',text:'甲',start:0,end:1},{id:'1',text:'乙',start:1,end:2}];
 const job=runAiParts(parts,new AbortController().signal,new Map(),async part=>{calls.push(part.id);if(part.id==='1'&&calls.filter(id=>id==='1').length===1)throw new AiTranslateClientError('ai_rate_limited','Synthetic',429,undefined,undefined,undefined,10000);return result(model,part.id==='0'?'Đầu.':'Cuối.');},p=>states.push(p),undefined,undefined,2,control);await vi.advanceTimersByTimeAsync(9999);expect(calls.filter(id=>id==='1')).toHaveLength(1);await vi.advanceTimersByTimeAsync(1);const done=await job;
 expect(done.result).toBe('Đầu.\nCuối.');expect(calls.filter(id=>id==='0')).toHaveLength(1);expect(calls.filter(id=>id==='1')).toHaveLength(2);expect(states.every(p=>!p.waitUntil||p.waitUntil<=Date.now())).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
it('legacy explicit fallback remains sequential after bounded same-model whole retries',async()=>{
 const calls:any[]=[],session=new AiReadingSession(async(...args)=>{calls.push(args);if(args[0].model===model)throw new AiTranslateClientError('ai_incomplete_result','Synthetic',502,'output_limit');return result(other);});
 const job=session.request(source,settings,[],undefined,undefined,undefined,{immediate:true});await vi.advanceTimersByTimeAsync(4000);await job;expect(calls.map(a=>a[0].model)).toEqual([model,model,model,other]);expect(calls.every(a=>a[0].text===source.text&&a[4]===true)).toBe(true);expect(vi.getTimerCount()).toBe(0);session.clear();
});
it('a later chapter reconsiders models without the client15s suppression',async()=>{
 const calls:string[]=[],session=new AiReadingSession(async input=>{calls.push(input.model!);if(input.model===model)throw new AiTranslateClientError('ai_timeout','Synthetic',504);return result(other);});
 await session.request(source,settings,[],undefined,undefined,undefined,{immediate:true});await session.request({...source,id:'two'},settings,[],undefined,undefined,undefined,{immediate:true});expect(calls).toEqual([model,other,model,other]);expect(Date.now()).toBe(0);session.clear();
});
it('EPUB forwards immediate admission to the actual translation request',async()=>{
 const calls:any[]=[],session=new EpubAiSession(undefined,async(...args)=>{calls.push(args);return result(model,'{"0":"Đã xong."}');});await session.request({...source,text:'甲'},settings,[],{path:'one.xhtml',body:'<p>甲</p>',styles:[],nodes:['甲']},undefined,undefined,{immediate:true});expect(calls).toHaveLength(1);expect(calls[0][4]).toBe(true);session.clear();
});
it('EPUB replaces a failed request lease before reporting the next retry lease',async()=>{
 let calls=0;const states:any[]=[],session=new EpubAiSession(undefined,async(input,_signal,onLease)=>{calls++;onLease?.({requestId:'11111111-1111-4111-8111-111111111111',leaseIdHash:(calls===1?'a':'b').repeat(32),keySlot:calls,keysAvailable:2});if(calls===1)throw new AiTranslateClientError('ai_network_error','Synthetic');return result(input.model!,'{"0":"Đã xong."}');});
 const job=session.request({...source,text:'甲'},{...settings,fallbackModels:[]},[],{path:'one.xhtml',body:'<p>甲</p>',styles:[],nodes:['甲']},undefined,p=>states.push(p),{immediate:true});await vi.advanceTimersByTimeAsync(1000);await job;expect(calls).toBe(2);expect(states.some(p=>p.leaseHashes?.includes('a'.repeat(32)))).toBe(true);expect(states.some(p=>p.leaseHashes?.includes('b'.repeat(32)))).toBe(true);expect(states.every(p=>(p.activeLeases??0)<=1)).toBe(true);session.clear();
});
it.each([500,503,408,'network'] as const)('immediate server switches keys on recoverable %s and never exposes credentials',async status=>{
 const used:string[]=[],cancel=vi.fn(),spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(_u,init)=>{used.push(new Headers(init?.headers).get('x-goog-api-key')!);if(used.length===1){if(status==='network')throw Error('synthetic disconnect');return new Response(new ReadableStream({cancel}),{status});}if(status!=='network')expect(cancel).toHaveBeenCalledOnce();return provider();});
 const response=await handleAiTranslate(request(),env);expect(response.status).toBe(200);expect(used).toEqual(keys);const body=JSON.stringify(await response.json());expect(keys.some(key=>body.includes(key))).toBe(false);expect(spy).toHaveBeenCalledTimes(2);expect(Date.now()).toBe(0);
});
it('same-ms later attempts alternate ready keys, including after successful HTTP with invalid content',async()=>{
 const used:string[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(_u,init)=>{used.push(new Headers(init?.headers).get('x-goog-api-key')!);return provider();});
 for(let i=0;i<4;i++)expect((await handleAiTranslate(request(),env)).status).toBe(200);expect(used).toEqual([keys[0],keys[1],keys[0],keys[1]]);expect(Date.now()).toBe(0);
});
it('a cold server prefers another slot when the client identifies its last failed slot',async()=>{
 const used:string[]=[],spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(_u,init)=>{used.push(new Headers(init?.headers).get('x-goog-api-key')!);return provider();});
 resetAiKeyState();const next=request();next.headers.set('X-AI-Avoid-Key-Slot','1');expect((await handleAiTranslate(next,env)).status).toBe(200);expect(used).toEqual([keys[1]]);expect(spy).toHaveBeenCalledOnce();
});
it('whole retry carries the last lease slot independently of prompt and cache identity',async()=>{
 const seen:Array<number|undefined>=[],session=new AiReadingSession(async(input,_signal,onLease,_onText,immediate,avoid)=>{seen.push(avoid);expect(immediate).toBe(true);onLease?.({requestId:'11111111-1111-4111-8111-111111111111',leaseIdHash:'a'.repeat(32),keySlot:seen.length===1?1:2});if(seen.length===1)throw new AiTranslateClientError('ai_incomplete_result','Synthetic',502,'output_limit');return result(input.model!);});
 const job=session.request(source,settings,[],undefined,undefined,undefined,{immediate:true});await vi.advanceTimersByTimeAsync(1000);await job;expect(seen).toEqual([undefined,1]);session.clear();
});
it('prompt A/B uses immediate requests and carries the prior slot without rewriting its source',async()=>{
 const headers:Headers[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(_u,init)=>{headers.push(new Headers(init?.headers));return Response.json(result(),{headers:{'X-AI-Key-Slot':'1','X-AI-Lease-Id-Hash':'a'.repeat(32),'X-AI-Request-Id':'11111111-1111-4111-8111-111111111111'}});});
 const rows:any[]=[];await runPromptComparison({text:'甲',names:[],model,temperature:0,variants:[{label:'A',settings},{label:'B',settings}]},new AbortController().signal,row=>rows.push(row));expect(headers.map(h=>h.get('X-AI-Immediate'))).toEqual(['1','1']);expect(headers.map(h=>h.get('X-AI-Avoid-Key-Slot'))).toEqual([null,'1']);expect(rows.every(row=>row.response)).toBe(true);
});
it('exhausted immediate budget keeps progress without promising automatic timed recovery',async()=>{
 const job=new AiChapterJob({durationMs:1000,sends:1},undefined,undefined,true);await job.send(async()=>1);let failure:any;try{await job.send(async()=>2);}catch(error){failure=error;}expect(failure.code).toBe('ai_recovery_exhausted');expect(failure.message).not.toContain('tự phục hồi');expect(failure.message).toContain('tiếp tục ngay');
});
it.each([429,503])('actual Retry-After %s excludes that key without sleeping or delaying a ready peer',async status=>{
 const used:string[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(_u,init)=>{const key=new Headers(init?.headers).get('x-goog-api-key')!;used.push(key);return key===keys[0]?new Response('Synthetic',{status,headers:{'Retry-After':'60'}}):provider();});
 expect((await handleAiTranslate(request(),env)).status).toBe(200);expect((await handleAiTranslate(request(),env)).status).toBe(200);expect(used).toEqual([keys[0],keys[1],keys[1]]);expect(Date.now()).toBe(0);
});
it('all429 without a provider hint adds no invented cooldown and remains bounded per call',async()=>{
 const used:string[]=[],spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(_u,init)=>{used.push(new Headers(init?.headers).get('x-goog-api-key')!);return new Response('Synthetic',{status:429});});
 expect((await handleAiTranslate(request(),env)).status).toBe(429);expect((await handleAiTranslate(request(),env)).status).toBe(429);expect(spy).toHaveBeenCalledTimes(4);expect(used).toEqual([...keys,...keys]);expect(Date.now()).toBe(0);
});
it('Stop aborts the active key and prevents any next-key send',async()=>{
 const controller=new AbortController(),calls:string[]=[];let late!:(response:Response)=>void;vi.spyOn(globalThis,'fetch').mockImplementation(async(_u,init)=>{calls.push(new Headers(init?.headers).get('x-goog-api-key')!);return new Promise(resolve=>late=resolve);});
 const work=handleAiTranslate(request(controller.signal),env);await vi.waitFor(()=>expect(calls).toHaveLength(1));controller.abort();await work;late(new Response('Synthetic',{status:500}));await Promise.resolve();expect(calls).toEqual([keys[0]]);
});
it('immediate UI labels never promise a scheduled retry',()=>{expect(aiChapterView({immediate:true,complete:false,running:false,stopped:false,online:true,error:'Synthetic',retryAt:60000,now:0}).label).toBe('Chưa hoàn tất');});
