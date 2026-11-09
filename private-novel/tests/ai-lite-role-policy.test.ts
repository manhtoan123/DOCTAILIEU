import {expect,it,vi} from 'vitest';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
const flash='gemini-2.5-flash',lite='gemini-3.5-flash-lite',gemma='gemma-4-26b-a4b-it',last='gemini-3-flash-preview';
const settings={...AI_DEFAULTS,model:flash,fallbackModels:[lite,gemma,last]},source={bookId:'synthetic-lite-role',id:'one',revision:1,text:'甲乙。'};
const failure=()=>new AiTranslateClientError('ai_timeout','Synthetic timeout',504),answer=(model:string,epub=false)=>({result:epub?'{"0":"Bản dịch."}':'Bản dịch.',model,finishReason:'STOP',inputTokens:1,outputTokens:1});
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>resolve=done);return {promise,resolve};};
for(const epub of [false,true]){
 const make=(send:any)=>epub?new EpubAiSession(undefined,send):new AiReadingSession(send);
 const request=(session:ReturnType<typeof make>,prewarm:boolean)=>session instanceof EpubAiSession?session.request(source,settings,[],{path:'one.xhtml',body:'<p>甲乙。</p>',styles:[],nodes:[source.text]},undefined,undefined,{isPrewarm:prewarm}):session.request(source,settings,[],undefined,undefined,undefined,{isPrewarm:prewarm});
 it(`current chapter tries Lite after 2.5 fails; EPUB=${epub}`,async()=>{const calls:string[]=[],session=make(async(input:any)=>{calls.push(input.model);if(input.model===flash)throw failure();return answer(input.model,epub);});await request(session,false);expect(calls).toEqual([flash,lite]);session.clear();});
 it(`prewarm skips Lite; EPUB=${epub}`,async()=>{const calls:string[]=[],session=make(async(input:any)=>{calls.push(input.model);if(input.model===flash)throw failure();return answer(input.model,epub);});await request(session,true);expect(calls).toEqual([flash,gemma]);session.clear();});
 it(`promotion keeps pending request and admits Lite after held 2.5 fails; EPUB=${epub}`,async()=>{
  const held=deferred(),calls:string[]=[],session=make(async(input:any)=>{calls.push(input.model);if(input.model===flash){await held.promise;throw failure();}return answer(input.model,epub);});
  const pending=request(session,true);await vi.waitFor(()=>expect(calls).toEqual([flash]));expect(request(session,false)).toBe(pending);held.resolve();expect((await pending).model).toBe(lite);expect(calls).toEqual([flash,lite]);session.clear();
 });
 it(`promotion does not replace successful in-flight 2.5; EPUB=${epub}`,async()=>{
  const held=deferred(),calls:string[]=[],session=make(async(input:any)=>{calls.push(input.model);await held.promise;return answer(input.model,epub);});const pending=request(session,true);await vi.waitFor(()=>expect(calls).toHaveLength(1));expect(request(session,false)).toBe(pending);held.resolve();expect((await pending).model).toBe(flash);expect(calls).toEqual([flash]);session.clear();
 });
 it(`opening after Lite was skipped keeps Gemma, but admits Lite if Gemma fails; EPUB=${epub}`,async()=>{
  const held=deferred(),calls:string[]=[],session=make(async(input:any)=>{calls.push(input.model);if(input.model===flash)throw failure();if(input.model===gemma){await held.promise;throw failure();}return answer(input.model,epub);});const pending=request(session,true);await vi.waitFor(()=>expect(calls).toEqual([flash,gemma]));expect(request(session,false)).toBe(pending);held.resolve();expect((await pending).model).toBe(lite);expect(calls).toEqual([flash,gemma,lite]);session.clear();
 });
 it(`Stop after promotion never starts Lite or publishes a late result; EPUB=${epub}`,async()=>{
  const held=deferred(),calls:string[]=[],session=make(async(input:any)=>{calls.push(input.model);await held.promise;throw failure();});const pending=request(session,true),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});await vi.waitFor(()=>expect(calls).toEqual([flash]));expect(request(session,false)).toBe(pending);session.cancel(aiReadingKey(source,settings,[]));held.resolve();await rejected;expect(calls).toEqual([flash]);expect(session.get(aiReadingKey(source,settings,[]))).toBeUndefined();session.clear();
 });
 it(`promotion retains successful in-flight Gemma even though Lite becomes eligible; EPUB=${epub}`,async()=>{
  const held=deferred(),calls:string[]=[],session=make(async(input:any)=>{calls.push(input.model);if(input.model===flash)throw failure();await held.promise;return answer(input.model,epub);});const pending=request(session,true);await vi.waitFor(()=>expect(calls).toEqual([flash,gemma]));expect(request(session,false)).toBe(pending);held.resolve();expect((await pending).model).toBe(gemma);expect(calls).toEqual([flash,gemma]);session.clear();
 });
}
it('role-blocked Lite does not remove the final usable short TXT model retries',async()=>{
 vi.useFakeTimers();try{const calls:string[]=[],session=new AiReadingSession(async input=>{calls.push(input.model!);if(calls.length<3)throw failure();return answer(input.model!);});const work=session.request(source,{...settings,fallbackModels:[lite]},[],undefined,undefined,undefined,{isPrewarm:true});await vi.advanceTimersByTimeAsync(4000);await work;expect(calls).toEqual([flash,flash,flash]);session.clear();}finally{vi.useRealTimers();}
});
