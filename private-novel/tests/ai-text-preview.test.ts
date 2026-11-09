import {afterEach,expect,it,vi} from 'vitest';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {aiTranslate,AiTranslateClientError} from '../src/features/ai/services/ai-translate';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {AI_STREAM_TYPE} from '../src/features/ai/services/ai-stream-protocol';
import {readAiStreamResponse} from '../src/features/ai/services/ai-stream-client';
const model='gemma-4-26b-a4b-it',encoder=new TextEncoder();
afterEach(()=>{vi.restoreAllMocks();resetAiKeyState();});
it('real handler to client exposes answer before STOP, never reasoning, and retains final validation',async()=>{
 let sink!:ReadableStreamDefaultController<Uint8Array>;const provider=new ReadableStream<Uint8Array>({start(c){sink=c;}});
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>String(input).startsWith('/api/')?handleAiTranslate(new Request('https://reader.example/api/ai/translate',init),{GEMINI_API_KEY:'synthetic-preview-key'}):new Response(provider,{headers:{'Content-Type':'text/event-stream'}}));
 const seen:string[]=[],work=aiTranslate({text:'你好',model},undefined,undefined,text=>seen.push(text));let settled=false;void work.then(()=>settled=true);
 const push=(text:string,thought=false,finishReason?:string)=>sink.enqueue(encoder.encode('data: '+JSON.stringify({candidates:[{content:{parts:[{text,thought}]},...(finishReason?{finishReason}:{})}],...(finishReason?{usageMetadata:{promptTokenCount:1,candidatesTokenCount:2}}:{})})+'\n\n'));
 push('PRIVATE THOUGHT',true);push('Xin chào.\n');await vi.waitFor(()=>expect(seen).toEqual(['Xin chào.\n']));expect(settled).toBe(false);
 push('Kết thúc.',false,'STOP');sink.close();expect((await work).result).toBe('Xin chào.\nKết thúc.');expect(seen.join('')).not.toContain('PRIVATE');
});
it('legacy opt-out receives no provisional text events',async()=>{
 const sse='data: '+JSON.stringify({candidates:[{content:{parts:[{text:'Xin chào.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:2}})+'\n\n';
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(sse,{headers:{'Content-Type':'text/event-stream'}}));
 const response=await handleAiTranslate(new Request('https://reader.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json',Accept:AI_STREAM_TYPE},body:JSON.stringify({text:'你好',model})}),{GEMINI_API_KEY:'synthetic-preview-key'});
 const rows=(await response.text()).trim().split('\n').map(row=>JSON.parse(row));expect(rows.some(row=>row.type==='text')).toBe(false);expect(rows.at(-1).status).toBe(200);
});
it.each([false,true])('whole preview is separate from completed progress/cache and cleared on failure/Stop=%s',async stop=>{
 let release!:(value:any)=>void,late!:(text:string)=>void;const source={bookId:'preview-synthetic',id:'one',revision:1,text:'甲'.repeat(2999)},states:any[]=[],writes=vi.fn(async()=>true);
 const session=new AiReadingSession(async(_input,_signal,_lease,onText)=>{late=onText!;onText?.('Đoạn đầu.\nCâu chưa đủ');return new Promise(r=>release=r);},{read:async()=>undefined,write:writes});
 const settings={...AI_DEFAULTS,model,fallbackModels:[]},key=aiReadingKey(source,settings,[]),work=session.request(source,settings,[],undefined,undefined,s=>states.push(s));const rejection=stop?expect(work).rejects.toMatchObject({name:'AbortError'}):undefined;
 await vi.waitFor(()=>expect(states.at(-1)?.previewText).toBe('Đoạn đầu.'));expect(states.at(-1).text).toBe('');expect(states.at(-1).done).toBe(0);expect(writes).not.toHaveBeenCalled();
 if(stop){session.cancel(key);expect(states.at(-1).previewText).toBe('');}
 release({result:'Hoàn tất.',model,finishReason:'STOP',inputTokens:1,outputTokens:1});if(stop)await rejection;else{await work;expect(writes).toHaveBeenCalledOnce();}
 const count=states.length;late('LATE\n');expect(states).toHaveLength(count);expect(session.get(key)?.result).toBe(stop?undefined:'Hoàn tất.');session.clear();
});
it('clears a failed model draft before fallback and never checkpoints it',async()=>{
 const source={bookId:'preview-synthetic',id:'fallback',revision:1,text:'甲'},states:any[]=[],settings={...AI_DEFAULTS,model:'gemini-3.8-flash',fallbackModels:[model]},writes=vi.fn(async()=>true);
 const session=new AiReadingSession(async(input,_s,_l,onText)=>{if(input.model!==model){onText?.('Bản lỗi.\n');throw new AiTranslateClientError('ai_timeout','Synthetic',504);}onText?.('Bản mới.\n');return {result:'Bản cuối.',model,finishReason:'STOP',inputTokens:1,outputTokens:1};},{read:async()=>undefined,write:writes});
 await session.request(source,settings,[],undefined,undefined,s=>states.push(s));const drafts=states.map(s=>s.previewText).filter(s=>s!==undefined);expect(drafts).toContain('Bản lỗi.');expect(drafts.indexOf('')).toBeLessThan(drafts.indexOf('Bản mới.'));expect(writes).toHaveBeenCalledOnce();expect(writes.mock.calls[0]).not.toContain('Bản lỗi.');session.clear();
});
it('rejects unsolicited/malformed preview events and requires a valid final envelope',async()=>{
 for(const row of [{type:'text',text:3},{type:'text',text:'hi',extra:true}])await expect(readAiStreamResponse(new Response(JSON.stringify(row)+'\n'),new AbortController().signal,()=>{},undefined,()=>{})).rejects.toThrow();
 await expect(readAiStreamResponse(new Response('{"type":"text","text":"hi"}\n'),new AbortController().signal,()=>{})).rejects.toThrow();
 await expect(readAiStreamResponse(new Response('{"type":"text","text":"hi"}\n'),new AbortController().signal,()=>{},undefined,()=>{})).rejects.toThrow();
});
it('deadline clears a promoted pending preview and ignores late callbacks',async()=>{
 vi.useFakeTimers();try{
 const source={bookId:'synthetic',id:'deadline',revision:1,text:'甲'},settings={...AI_DEFAULTS,model,fallbackModels:[]},states:any[]=[];let late!:(text:string)=>void;
 const session=new AiReadingSession(async(_r,_s,_l,text)=>{late=text!;text?.('Bản tạm.\n');return new Promise(()=>{});});
 const work=session.request(source,settings,[],undefined,undefined,undefined,{isPrewarm:true}),rejected=expect(work).rejects.toMatchObject({code:'ai_recovery_exhausted'});
 await vi.advanceTimersByTimeAsync(0);expect(session.request(source,settings,[],undefined,undefined,s=>states.push(s))).toBe(work);expect(states.at(-1).previewText).toBe('Bản tạm.');
 await vi.advanceTimersByTimeAsync(240000);await rejected;expect(states.at(-1).previewText).toBe('');const count=states.length;late('LATE\n');expect(states).toHaveLength(count);session.clear();
 }finally{vi.useRealTimers();}
});
