import {expect,it,vi} from 'vitest';
import {AI_DEFAULTS,AiReadingSession,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {runAiParts,splitAiText,type AiPartsProgress} from '../src/features/ai/services/ai-parts';
import type {AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';

const source={bookId:'synthetic-book',id:'synthetic-chapter',revision:1,text:'甲'.repeat(4000)};
const response=(result:string,model=AI_DEFAULTS.model,parallel?:2):AiTranslateClientResponse=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:2,...(parallel?{parallel}:{})});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {resolve,promise};}

it('independent parts: entire 128k TXT completes beyond the old send/output caps with bounded individual requests',async()=>{
 const large={...source,text:'甲'.repeat(128000)},send=vi.fn(async input=>response('a'.repeat(input.text.length+1000),input.model)),session=new AiReadingSession(send);
 const result=await session.request(large,AI_DEFAULTS,[]);
 expect(send).toHaveBeenCalledTimes(4);expect(send.mock.calls.length).toBe(4);
 expect(send.mock.calls.every(([input])=>input.text.length<=32000&&(input.context?.length??0)<=300)).toBe(true);
 expect(result.result.length).toBeGreaterThan(128000);expect(result.result.length).toBeLessThanOrEqual(512000);
 expect(session.get(aiReadingKey(large,AI_DEFAULTS,[]))).toEqual(result);
});
it('independent parts: surviving fallback part pins retry even when part zero was not saved',async()=>{
 const model='gemini-2.5-flash',settings={...AI_DEFAULTS,fallbackModels:[model]},send=vi.fn(async input=>response('fresh-'+input.text.length,input.model));
 const session=new AiReadingSession(send,{read:async()=>undefined,write:async()=>true,readParts:async()=>[{id:'1',response:response('retained-fallback',model)}]});
 const result=await session.request(source,settings,[]);
 expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls.every(([input])=>input.model===model)).toBe(true);
 expect(result.model).toBe(model);expect(result.result).toContain('retained-fallback');
});
it('independent parts: mismatched model is rejected before progress or durable-part publication',async()=>{
 const completed=new Map<string,AiTranslateClientResponse>(),saved:string[]=[],progress:AiPartsProgress[]=[];
 const send=vi.fn(async part=>response(part.id==='0'?'good':'wrong-model',part.id==='0'?AI_DEFAULTS.model:'gemini-2.5-flash',2));
 await expect(runAiParts(splitAiText(source.text),new AbortController().signal,completed,send,state=>progress.push(state),async part=>{saved.push(part.id);})).rejects.toThrow('Model thay đổi');
 expect([...completed.keys()]).toEqual(['0']);expect(saved).toEqual(['0']);expect(progress.every(state=>!state.text.includes('wrong-model'))).toBe(true);
});
it('independent parts: out-of-order completed sibling stays hidden until its preceding gap completes',async()=>{
 const gap=deferred<AiTranslateClientResponse>(),progress:AiPartsProgress[]=[],completed=new Map<string,AiTranslateClientResponse>();
 const pending=runAiParts(splitAiText(source.text),new AbortController().signal,completed,async part=>part.id==='1'?gap.promise:response('part-'+part.id,AI_DEFAULTS.model,2),state=>progress.push(state));
 await vi.waitFor(()=>expect(completed.has('2')).toBe(true));
 expect(progress.at(-1)?.done).toBe(2);expect(progress.at(-1)?.text).toBe('part-0');
 gap.resolve(response('part-1'));expect((await pending).result).toBe('part-0\npart-1\npart-2');
});
it('independent parts: cancel and immediate retry retain finished part but reject late old output/callback/cache write',async()=>{
 const source={bookId:'synthetic-book',id:'synthetic-cancel',revision:1,text:'甲'.repeat(96000)};
 const late=deferred<AiTranslateClientResponse>(),oldProgress:AiPartsProgress[]=[],writes:string[]=[],whole=vi.fn(async()=>true);
 const send=vi.fn().mockResolvedValueOnce(response('retained-first')).mockImplementationOnce(()=>late.promise).mockResolvedValueOnce(response('new-middle')).mockResolvedValueOnce(response('new-last'));
 const session=new AiReadingSession(send,{read:async()=>undefined,write:whole,writePart:async(_source,_settings,_names,_plan,id,result)=>{writes.push(id+':'+result.result);return true;}}),key=aiReadingKey(source,AI_DEFAULTS,[]);
 const old=session.request(source,AI_DEFAULTS,[],undefined,undefined,state=>oldProgress.push(state)),oldRejected=expect(old).rejects.toMatchObject({name:'AbortError'});
 await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(2));session.cancel(key);await oldRejected;
 const before=oldProgress.length,retry=session.request(source,AI_DEFAULTS,[]);late.resolve(response('late-old-output'));
 const result=await retry;expect(result.result).toBe('retained-first\nnew-middle\nnew-last');
 expect(send).toHaveBeenCalledTimes(4);expect(oldProgress).toHaveLength(before);expect(writes).toEqual(['0:retained-first','1:new-middle','2:new-last']);expect(whole).toHaveBeenCalledOnce();
 expect(session.get(key)?.result).not.toContain('late-old-output');
});
