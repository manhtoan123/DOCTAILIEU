import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey,type AiReadingCache,type AiReadingSource} from '../src/features/ai/services/ai-reading';
import {planAiText,AI_WHOLE_CHAPTER_CHARS} from '../src/features/ai/services/ai-output-plan';
import {splitAiText,type AiPartsProgress} from '../src/features/ai/services/ai-parts';
import {translateComplete} from '../src/features/ai/services/ai-complete';
import {AiTranslateClientError,type AiTranslateClientRequest,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import {EPUB_AI_CHAPTER_LIMITS} from '../src/features/ai/services/ai-job';

const settings={...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[]};
const source=(text='甲'.repeat(2999)):AiReadingSource=>({bookId:'synthetic-short-whole',id:'chapter',revision:1,text});
const answer=(result='Bản dịch hoàn chỉnh.',model=settings.model):AiTranslateClientResponse=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:2});
const failure=(code:string,reason?:string,status=502)=>new AiTranslateClientError(code,'Synthetic failure',status,reason);
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(0);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

it.each([false,true])('keeps 2999 UTF-16 units in one source span with splitParts=%s',async splitParts=>{
 const text='😀'.repeat(1499)+'甲',chapter=source(text),selected={...settings,splitParts},before=JSON.stringify({chapter,selected});
 expect(text.length).toBe(AI_WHOLE_CHAPTER_CHARS-1);
 const planned=planAiText(text,[],splitParts);
 expect(planned.parts).toEqual([{id:'0',text,start:0,end:text.length}]);
 const calls:AiTranslateClientRequest[]=[],states:AiPartsProgress[]=[],session=new AiReadingSession(async input=>{calls.push(input);return answer();});
 try{
  expect((await session.request(chapter,selected,[],undefined,undefined,state=>states.push(state))).result).toBe(answer().result);
  expect(calls).toHaveLength(1);expect(calls[0].text).toBe(text);expect(calls[0].context).toBeUndefined();
  expect(states.at(-1)).toMatchObject({total:1,done:1,leafProgress:{done:1,total:1}});
  expect(JSON.stringify({chapter,selected})).toBe(before);
 }finally{session.clear();}
});

it.each([false,true])('keeps dense Han below 3000 whole despite output estimate and splitParts=%s',async splitParts=>{
 const chapter=source(),calls:AiTranslateClientRequest[]=[],session=new AiReadingSession(async input=>{calls.push(input);return answer();});
 try{await session.request(chapter,{...settings,splitParts},[]);expect(calls.map(input=>input.text)).toEqual([chapter.text]);}finally{session.clear();}
});

it.each([false,true])('retains existing split planning at exactly 3000 with splitParts=%s',async splitParts=>{
 const chapter=source('甲'.repeat(3000)),planned=planAiText(chapter.text,[],splitParts),calls:AiTranslateClientRequest[]=[],session=new AiReadingSession(async input=>{calls.push(input);return answer();});
 expect(planned.parts.length).toBeGreaterThan(1);expect(planned.parts.map(part=>part.text).join('')).toBe(chapter.text);
 try{await session.request(chapter,{...settings,splitParts},[]);expect(calls.length).toBeGreaterThan(1);expect(calls.map(input=>input.text).join('')).toBe(chapter.text);}finally{session.clear();}
});

it('retains recursive output-limit recovery for an original 3000-character chapter',async()=>{
 const chapter=source('a'.repeat(1500)+'b'.repeat(1500)),send=vi.fn().mockRejectedValueOnce(failure('ai_incomplete_result','output_limit')).mockResolvedValue(answer()),session=new AiReadingSession(send);
 try{expect((await session.request(chapter,{...settings,splitParts:false},[])).result).toBe(answer().result+'\n'+answer().result);expect(send.mock.calls.map(([input])=>input.text.length)).toEqual([3000,1500,1500]);expect(send.mock.calls[1][0].text+send.mock.calls[2][0].text).toBe(chapter.text);}finally{session.clear();}
});

it.each([
 ['timeout',()=>failure('ai_timeout',undefined,504)],
 ['output limit',()=>failure('ai_incomplete_result','output_limit')],
 ['untranslated error',()=>failure('ai_untranslated_result','untranslated_source')],
] as const)('retries %s using the identical whole request and publishes only completion',async(_label,error)=>{
 const chapter=source(),selected={...settings,splitParts:true},names=[{key:'甲甲',value:'Giáp Giáp'}],states:AiPartsProgress[]=[];
 const send=vi.fn().mockRejectedValueOnce(error()).mockRejectedValueOnce(error()).mockResolvedValue(answer()),write=vi.fn(async()=>true);
 const session=new AiReadingSession(send,{read:async()=>undefined,write});
 try{
  const pending=session.request(chapter,selected,names,undefined,undefined,state=>states.push(state));
  await vi.advanceTimersByTimeAsync(0);expect(send).toHaveBeenCalledTimes(1);expect(write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(600);expect(send).toHaveBeenCalledTimes(2);expect(states.every(state=>state.text==='')).toBe(true);
  await vi.advanceTimersByTimeAsync(2500);expect((await pending).result).toBe(answer().result);
  expect(send).toHaveBeenCalledTimes(3);for(const call of send.mock.calls){expect(call[0]).toEqual(send.mock.calls[0][0]);expect(call[0].text).toBe(chapter.text);}
  expect(write).toHaveBeenCalledOnce();expect(states.at(-1)).toMatchObject({total:1,done:1,text:answer().result,leafProgress:{done:1,total:1}});
 }finally{session.clear();}
});

it('retries copied STOP output detected by coverage without exposing or caching it',async()=>{
 const chapter=source(),copied=answer('甲'.repeat(32)),states:AiPartsProgress[]=[],write=vi.fn(async()=>true);
 const send=vi.fn().mockResolvedValueOnce(copied).mockResolvedValue(answer()),session=new AiReadingSession(send,{read:async()=>undefined,write});
 try{
  const pending=session.request(chapter,settings,[],undefined,undefined,state=>states.push(state));
  await vi.advanceTimersByTimeAsync(0);expect(write).not.toHaveBeenCalled();expect(states.every(state=>state.text==='')).toBe(true);
  await vi.advanceTimersByTimeAsync(600);expect((await pending).result).toBe(answer().result);
  expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls.map(([input])=>input.text)).toEqual([chapter.text,chapter.text]);
  expect(write).toHaveBeenCalledOnce();expect(states.every(state=>!state.text.includes('甲'))).toBe(true);
 }finally{session.clear();}
});

it.each(['ai_timeout','ai_incomplete_result','ai_untranslated_result'])('bounds repeated %s failures without splitting or caching',async code=>{
 const error=failure(code,code==='ai_incomplete_result'?'output_limit':code==='ai_untranslated_result'?'untranslated_source':undefined),send=vi.fn().mockRejectedValue(error),write=vi.fn(async()=>true),session=new AiReadingSession(send,{read:async()=>undefined,write});
 try{
  const chapter=source(),pending=session.request(chapter,settings,[]),rejected=expect(pending).rejects.toBe(error);
  await vi.advanceTimersByTimeAsync(3100);await rejected;
  expect(send).toHaveBeenCalledTimes(3);expect(send.mock.calls.every(([input])=>input.text===chapter.text)).toBe(true);expect(write).not.toHaveBeenCalled();
  expect(session.get(aiReadingKey(chapter,settings,[]))).toBeUndefined();
  await vi.advanceTimersByTimeAsync(100000);expect(send).toHaveBeenCalledTimes(3);
 }finally{session.clear();}
});

it.each([
 failure('ai_auth_error',undefined,403),failure('invalid_prompt',undefined,400),failure('ai_incomplete_result','upstream_finish_reason'),failure('ai_invalid_response','upstream_schema'),
])('does not retry permanent or safety failures %#',async error=>{
 const send=vi.fn().mockRejectedValue(error),session=new AiReadingSession(send);
 try{await expect(session.request(source(),settings,[])).rejects.toBe(error);await vi.advanceTimersByTimeAsync(100000);expect(send).toHaveBeenCalledOnce();}finally{session.clear();}
});

it('Stop cancels short-whole backoff and blocks late retries and publication',async()=>{
 const chapter=source(),send=vi.fn().mockRejectedValueOnce(failure('ai_incomplete_result','output_limit')).mockResolvedValue(answer()),write=vi.fn(async()=>true),states:AiPartsProgress[]=[],session=new AiReadingSession(send,{read:async()=>undefined,write});
 try{
  const pending=session.request(chapter,settings,[],undefined,undefined,state=>states.push(state)),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
  await vi.advanceTimersByTimeAsync(300);session.cancel(aiReadingKey(chapter,settings,[]));await rejected;const count=states.length;
  await vi.advanceTimersByTimeAsync(100000);expect(send).toHaveBeenCalledOnce();expect(write).not.toHaveBeenCalled();expect(states).toHaveLength(count);
 }finally{session.clear();}
});

it('honors whole-request Retry-After and does not split while waiting',async()=>{
 const chapter=source(),send=vi.fn().mockRejectedValueOnce(new AiTranslateClientError('ai_rate_limited','Synthetic quota',429,'http',undefined,undefined,10000)).mockResolvedValue(answer()),session=new AiReadingSession(send);
 try{const pending=session.request(chapter,settings,[]);await vi.advanceTimersByTimeAsync(9999);expect(send).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1);await pending;expect(send.mock.calls.map(([input])=>input.text)).toEqual([chapter.text,chapter.text]);}finally{session.clear();}
});

it('preserves the existing total-send ceiling during short-whole retries',async()=>{
 const previous=EPUB_AI_CHAPTER_LIMITS.sends;EPUB_AI_CHAPTER_LIMITS.sends=2;
 const send=vi.fn().mockRejectedValue(failure('ai_incomplete_result','output_limit')),session=new AiReadingSession(send);
 try{const pending=session.request(source(),settings,[]),rejected=expect(pending).rejects.toMatchObject({code:'ai_recovery_exhausted',reason:'send_limit'});await vi.advanceTimersByTimeAsync(3100);await rejected;expect(send).toHaveBeenCalledTimes(2);}finally{session.clear();EPUB_AI_CHAPTER_LIMITS.sends=previous;}
});

it('preserves the existing chapter deadline and prevents a late completion',async()=>{
 let release!:(value:AiTranslateClientResponse)=>void;
 const chapter=source(),send=vi.fn(()=>new Promise<AiTranslateClientResponse>(resolve=>release=resolve)),write=vi.fn(async()=>true),session=new AiReadingSession(send,{read:async()=>undefined,write});
 try{
  const pending=session.request(chapter,settings,[]),rejected=expect(pending).rejects.toMatchObject({code:'ai_recovery_exhausted',reason:'chapter_deadline'});
  await vi.advanceTimersByTimeAsync(EPUB_AI_CHAPTER_LIMITS.durationMs);await rejected;release(answer());await vi.advanceTimersByTimeAsync(0);
  expect(send).toHaveBeenCalledOnce();expect(write).not.toHaveBeenCalled();expect(session.get(aiReadingKey(chapter,settings,[]))).toBeUndefined();
 }finally{session.clear();}
});

it('reuses a finished historical chapter cache without retranslating or rewriting it',async()=>{
 const completed={...answer('Bản dịch cũ đầy đủ.'),division:{version:1 as const,parts:4,reasons:['parallel' as const]}},send=vi.fn(),write=vi.fn(async()=>true),readParts=vi.fn(async()=>[]),session=new AiReadingSession(send,{read:async()=>completed,write,readParts});
 const chapter=source(),selected={...settings,splitParts:true};
 try{expect(await session.request(chapter,selected,[])).toEqual(completed);expect(session.facts(aiReadingKey(chapter,selected,[]))?.division).toEqual(completed.division);expect(send).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();expect(readParts).not.toHaveBeenCalled();}finally{session.clear();}
});

it('retains explicit single-part facts when only the new-plan root checkpoint survives reload',async()=>{
 const chapter=source(),selected={...settings,splitParts:true},key=aiReadingKey(chapter,selected,[]),saved=new Map<string,Map<string,AiTranslateClientResponse>>();
 const cache:AiReadingCache={read:async()=>undefined,write:async()=>false,readParts:async(_source,_settings,_names,plan)=>[...(saved.get(plan)??[])].map(([id,response])=>({id,response})),writePart:async(_source,_settings,_names,plan,id,response)=>{let rows=saved.get(plan);if(!rows)saved.set(plan,rows=new Map());rows.set(id,response);return true;}};
 const facts={version:1 as const,parts:1,reasons:[]},raw=Object.freeze(answer()),send=vi.fn(async()=>raw),first=new AiReadingSession(send,cache);
 try{
  expect(await first.request(chapter,selected,[])).toBe(raw);expect(first.get(key)).toBe(raw);expect(raw).not.toHaveProperty('division');expect(first.facts(key)?.division).toEqual(facts);
  expect(send).toHaveBeenCalledOnce();const roots=[...saved.values()].flatMap(rows=>[...rows]);expect(roots).toHaveLength(1);expect(roots[0][0]).toBe('0');expect(roots[0][1].division).toEqual(facts);
 }finally{first.clear();}
 const offline=vi.fn(async()=>{throw new Error('Completed root checkpoint must satisfy reload');}),states:AiPartsProgress[]=[],reloaded=new AiReadingSession(offline,cache);
 try{
  expect((await reloaded.request(chapter,selected,[],undefined,undefined,state=>states.push(state))).division).toEqual(facts);
  expect(offline).not.toHaveBeenCalled();expect(reloaded.facts(key)?.division).toEqual(facts);
  expect(states.at(-1)).toMatchObject({total:1,done:1,division:facts,leafProgress:{done:1,total:1}});
 }finally{reloaded.clear();}
});

it('ignores legacy split roots and child checkpoints without changing their saved records',async()=>{
 const chapter=source(),selected={...settings,splitParts:true},oldParts=splitAiText(chapter.text),oldPlan=JSON.stringify(['txt-parallel-1',oldParts.map(part=>[part.start,part.end])]);
 const oldRows=[{id:'0',response:answer('Phần đầu cũ.')},{id:'1/0',response:answer('Nhánh cũ.')}],snapshot=JSON.stringify(oldRows),queried:string[]=[],saved:string[]=[];
 const cache:AiReadingCache={read:async()=>undefined,write:async()=>true,readParts:async(_s,_settings,_names,plan)=>{queried.push(plan);return plan===oldPlan?oldRows:[{id:'0/0',response:answer('Nhánh không đủ.')}];},writePart:async(_s,_settings,_names,plan)=>{saved.push(plan);return true;}};
 const states:AiPartsProgress[]=[],send=vi.fn(async(_input:AiTranslateClientRequest)=>answer('Toàn chương mới.')),session=new AiReadingSession(send,cache);
 try{
  expect((await session.request(chapter,selected,[],undefined,undefined,state=>states.push(state))).result).toBe('Toàn chương mới.');
  expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0].text).toBe(chapter.text);expect(queried).not.toContain(oldPlan);
  expect(saved.every(plan=>plan!==oldPlan)).toBe(true);expect(JSON.stringify(oldRows)).toBe(snapshot);expect(states.every(state=>!state.text.includes('cũ')&&!state.text.includes('không đủ'))).toBe(true);
 }finally{session.clear();}
});

it('none mode ignores saved recovery children and sends the whole source',async()=>{
 const text='甲'.repeat(1600),completed=new Map([['0/0',answer('Nhánh cũ.')]]),save=vi.fn(async()=>{}),split=vi.fn(),send=vi.fn(async(_input:AiTranslateClientRequest)=>answer());
 expect((await translateComplete({text,model:settings.model},new AbortController().signal,send,'none',{id:'0',completed,save,onSplit:split})).result).toBe(answer().result);
 expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0].text).toBe(text);expect(split).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();expect(completed.get('0/0')?.result).toBe('Nhánh cũ.');
});

it('translates a short legacy hybrid chapter in one priority-model request',async()=>{
 const selected={...settings,splitParts:true,hybrid:{version:1 as const,liteModel:'gemini-3.1-flash-lite' as const,rules:'Gọi anh.'}},calls:AiTranslateClientRequest[]=[],session=new AiReadingSession(async input=>{calls.push(input);return answer(undefined,input.model);});
 try{const result=await session.request(source(),selected,[]);expect(calls).toHaveLength(1);expect(calls[0].text).toBe(source().text);expect(calls[0].continuation).toBeUndefined();expect(result.model).toBe(settings.model);expect(result.halves).toBeUndefined();}finally{session.clear();}
});

it('keeps nested stage splitting for an original legacy hybrid chapter at 6000',async()=>{
 const chapter=source('甲'.repeat(3000)+'乙'.repeat(3000)),selected={...settings,splitParts:true,hybrid:{version:1 as const,liteModel:'gemini-3.1-flash-lite' as const,rules:''}},calls:AiTranslateClientRequest[]=[],session=new AiReadingSession(async input=>{calls.push(input);return answer('Đoạn '+calls.length+'.',input.model);});
 try{const result=await session.request(chapter,selected,[]);expect(result.model).toBe('hybrid');expect(calls).toHaveLength(4);expect(calls.map(input=>input.text).join('')).toBe(chapter.text);expect(calls.slice(0,2).every(input=>!input.continuation)).toBe(true);expect(calls.slice(2).every(input=>!!input.continuation)).toBe(true);expect(calls.every(input=>input.text.length===1500)).toBe(true);}finally{session.clear();}
});
