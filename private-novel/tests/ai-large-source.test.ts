import {it,expect} from 'vitest';
import {AiReadingSession,AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {AI_TEXT_REQUEST_CHARS} from '../src/features/ai/services/ai-parts';
it('accepts >128k source and completes via bounded ordered requests',async()=>{
 const text='Neutral sample text. 😀\n'.repeat(6000),sent:string[]=[];
 expect(text.length).toBeGreaterThan(128000);
 const session=new AiReadingSession(async input=>{sent.push(input.text);return {result:input.text,model:AI_DEFAULTS.model,finishReason:'STOP',inputTokens:1,outputTokens:1};},undefined,undefined,false);
 const result=await session.request({bookId:'large-neutral',id:'chapter',revision:1,text},{...AI_DEFAULTS,modelMode:'fixed',splitParts:false},[]);
 expect(sent.length).toBeGreaterThan(1);expect(sent.every(value=>value.length<=AI_TEXT_REQUEST_CHARS)).toBe(true);
 expect(sent.join('')).toBe(text);expect(result.result.replace(/\s/g,'')).toBe(text.replace(/\s/g,''));session.clear();
});
it('Stop cancels a large-source job without dispatching remaining parts',async()=>{
 let started!:()=>void;const ready=new Promise<void>(resolve=>started=resolve);let calls=0;
 const session=new AiReadingSession(async(_input,signal)=>{calls++;started();return new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true});});},undefined,undefined,false);
 const pending=session.request({bookId:'large-neutral',id:'chapter',revision:1,text:'Neutral sample text.\n'.repeat(7000)},{...AI_DEFAULTS,modelMode:'fixed',splitParts:false},[]);
 const rejected=expect(pending).rejects.toThrow();await ready;session.clear();await rejected;expect(calls).toBe(1);
});
