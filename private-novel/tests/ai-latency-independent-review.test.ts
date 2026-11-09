import {expect,it,vi} from 'vitest';
import {AI_DEFAULTS,AiReadingSession,aiReadingKey,type AiReadingSource} from '../src/features/ai/services/ai-reading';
import {splitAiText,type AiPartsProgress} from '../src/features/ai/services/ai-parts';
import {AiTranslateClientError,type AiTranslateClientResponse,type AiTranslateClientRequest,type AiLeaseInfo} from '../src/features/ai/services/ai-translate';
import {aiCompletedPrefix} from '../src/features/ai/services/ai-part-prefix';
import {estimatedAiOutputTokens,planAiText,AI_PLANNED_OUTPUT_TOKENS} from '../src/features/ai/services/ai-output-plan';
import {aiSpeechEndAction} from '../src/features/ai/services/ai-listen';
import {sentences} from '../src/features/tts/services/tts';

const source=(text='a'.repeat(6000)):AiReadingSource=>({bookId:'synthetic-latency-review',id:'synthetic-chapter',revision:1,text});
const answer=(result:string):AiTranslateClientResponse=>({result,model:AI_DEFAULTS.model,finishReason:'STOP',inputTokens:1,outputTokens:2});
const cut=()=>new AiTranslateClientError('ai_incomplete_result','Synthetic truncation',502,'output_limit');
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}

it('latency review: a complete first recovery child is readable while its sibling is pending',async()=>{
 const tail=deferred<AiTranslateClientResponse>(),history:AiPartsProgress[]=[],writes:string[]=[];
 const send=vi.fn().mockRejectedValueOnce(cut()).mockResolvedValueOnce(answer('Đoạn đầu hoàn chỉnh.')).mockImplementationOnce(()=>tail.promise);
 const session=new AiReadingSession(send,{read:async()=>undefined,write:async()=>true,writePart:async(_s,_settings,_names,_plan,id)=>{writes.push(id);return true;}});
 const pending=session.request(source(),AI_DEFAULTS,[],undefined,undefined,state=>history.push(state));
 await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(3));
 expect(writes).toEqual(['0/0']);expect(history.at(-1)?.text).toBe('Đoạn đầu hoàn chỉnh.');
 expect(session.get(aiReadingKey(source(),AI_DEFAULTS,[]))).toBeUndefined();
 tail.resolve(answer('Đoạn cuối hoàn chỉnh.'));
 expect((await pending).result).toBe('Đoạn đầu hoàn chỉnh.\nĐoạn cuối hoàn chỉnh.');
});

it('latency review: resumed nested prefix stops at a missing left child and never exposes a later sibling',async()=>{
 const gate=deferred<AiTranslateClientResponse>(),history:AiPartsProgress[]=[];
 const send=vi.fn().mockImplementationOnce(()=>gate.promise).mockResolvedValue(answer('Đã bổ sung.'));
 const session=new AiReadingSession(send,{read:async()=>undefined,write:async()=>true,readParts:async()=>[
  {id:'0/0/1',response:answer('Phía sau khoảng trống.')},{id:'0/1',response:answer('Nửa cuối đã lưu.')}
 ]});
 const pending=session.request(source('a'.repeat(6000)),AI_DEFAULTS,[],undefined,undefined,state=>history.push(state));
 await vi.waitFor(()=>expect(send).toHaveBeenCalledOnce());
 expect(history.every(state=>state.text==='')).toBe(true);
 gate.resolve(answer('Mở đầu.'));const result=await pending;
 expect(result.result).toBe('Mở đầu.\nPhía sau khoảng trống.\nNửa cuối đã lưu.');
});

it('latency review: complete cached parent takes precedence over stale descendants',async()=>{
 const send=vi.fn(),history:AiPartsProgress[]=[];
 const session=new AiReadingSession(send,{read:async()=>undefined,write:async()=>true,readParts:async()=>[
  {id:'0',response:answer('Toàn chương đã lưu.')},{id:'0/0',response:answer('Con cũ.')},{id:'0/1',response:answer('Con cũ khác.')}
 ]});
 expect((await session.request(source(),AI_DEFAULTS,[],undefined,undefined,state=>history.push(state))).result).toBe('Toàn chương đã lưu.');
 expect(send).not.toHaveBeenCalled();expect(history.every(state=>!state.text.includes('Con cũ'))).toBe(true);
});

it('latency review: cancelling during a recovery child rejects stale callbacks and retry reuses its completed sibling',async()=>{
 const oldTail=deferred<AiTranslateClientResponse>(),history:AiPartsProgress[]=[],writes:string[]=[],whole=vi.fn(async()=>true);
 const send=vi.fn().mockRejectedValueOnce(cut()).mockResolvedValueOnce(answer('Phần giữ lại.')).mockImplementationOnce(()=>oldTail.promise).mockResolvedValueOnce(answer('Phần mới.'));
 const chapter=source(),key=aiReadingKey(chapter,AI_DEFAULTS,[]);
 const session=new AiReadingSession(send,{read:async()=>undefined,write:whole,writePart:async(_s,_settings,_names,_plan,id,result)=>{writes.push(id+':'+result.result);return true;}});
 const old=session.request(chapter,AI_DEFAULTS,[],undefined,undefined,state=>history.push(state)),rejected=expect(old).rejects.toMatchObject({name:'AbortError'});
 await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(3));expect(history.at(-1)?.text).toBe('Phần giữ lại.');
 session.cancel(key);await rejected;const count=history.length;
 const retry=session.request(chapter,AI_DEFAULTS,[]);oldTail.resolve(answer('Kết quả cũ muộn.'));
 expect((await retry).result).toBe('Phần giữ lại.\nPhần mới.');expect(send).toHaveBeenCalledTimes(4);
 expect(history).toHaveLength(count);expect(writes.every(value=>!value.includes('Kết quả cũ muộn.'))).toBe(true);expect(whole).toHaveBeenCalledOnce();
});

it('latency review: old whole-request checkpoint layout survives a new proactive plan',async()=>{
 const chapter=source('甲'.repeat(6400)),oldParts=splitAiText(chapter.text,[],32000),oldPlan=JSON.stringify(['txt-whole-1',oldParts.map(p=>[p.start,p.end])]);
 const queried:string[]=[],send=vi.fn();
 const session=new AiReadingSession(send,{read:async()=>undefined,write:async()=>true,readParts:async(_s,_settings,_names,plan)=>{queried.push(plan);return plan===oldPlan?[{id:'0',response:answer('Kế hoạch cũ còn nguyên.')}]:[];}});
 expect((await session.request(chapter,AI_DEFAULTS,[])).result).toBe('Kế hoạch cũ còn nguyên.');
 expect(queried).toContain(oldPlan);expect(send).not.toHaveBeenCalled();
});

it('latency review: old 1800-character checkpoint layout is resumed without mixing the new layout',async()=>{
 const chapter=source('甲'.repeat(6400)),oldParts=splitAiText(chapter.text),oldPlan=JSON.stringify(['txt-parts-2',oldParts.map(p=>[p.start,p.end])]);
 const sent:string[]=[],writtenPlans:string[]=[];
 const send=vi.fn(async input=>{sent.push(input.text);return answer('Dịch mới.');});
 const session=new AiReadingSession(send,{read:async()=>undefined,write:async()=>true,readParts:async(_s,_settings,_names,plan)=>plan===oldPlan?[{id:'0',response:answer('Phần cũ.')}]:[],writePart:async(_s,_settings,_names,plan)=>{writtenPlans.push(plan);return true;}});
 const result=await session.request(chapter,AI_DEFAULTS,[]);
 expect(result.result).toBe(['Phần cũ.',...oldParts.slice(1).map(()=> 'Dịch mới.')].join('\n'));
 expect(sent).toEqual(oldParts.slice(1).map(p=>p.text));expect(writtenPlans.every(plan=>plan===oldPlan)).toBe(true);
});

it('latency review: two-key lease starts a sibling before first output while keeping at most two sends active',async()=>{
 const first=deferred<AiTranslateClientResponse>(),second=deferred<AiTranslateClientResponse>(),settings={...AI_DEFAULTS,splitParts:true,fallbackModels:[]};
 let active=0,maximum=0;
 const send=vi.fn(async(_input:AiTranslateClientRequest,_signal:AbortSignal,onLease?: (lease:AiLeaseInfo)=>void)=>{
  const index=send.mock.calls.length-1;maximum=Math.max(maximum,++active);
  onLease?.({requestId:'synthetic-'+index,leaseIdHash:'safe-hash-'+index,keySlot:index%2,keysAvailable:2});
  try{return await (index===0?first.promise:index===1?second.promise:Promise.resolve(answer('Phần còn lại.')));}finally{active--;}
 });
 const session=new AiReadingSession(send),pending=session.request(source('甲'.repeat(7200)),settings,[]);
 await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(2));expect(active).toBe(2);
 second.resolve(answer('Phần hai.'));await vi.waitFor(()=>expect(send.mock.calls.length).toBeGreaterThan(2));
 first.resolve(answer('Phần đầu.'));const result=await pending;
 expect(result.result.startsWith('Phần đầu.\nPhần hai.')).toBe(true);expect(maximum).toBe(2);
});

it('latency review: one-key lease keeps planned parts serial before and after the first output',async()=>{
 const first=deferred<AiTranslateClientResponse>(),settings={...AI_DEFAULTS,splitParts:true,fallbackModels:[]};
 let active=0,maximum=0;
 const send=vi.fn(async(_input:AiTranslateClientRequest,_signal:AbortSignal,onLease?: (lease:AiLeaseInfo)=>void)=>{
  const index=send.mock.calls.length-1;maximum=Math.max(maximum,++active);
  onLease?.({requestId:'single-'+index,leaseIdHash:'single-hash-'+index,keySlot:0,keysAvailable:1});
  try{return await (index===0?first.promise:Promise.resolve(answer('Phần sau.')));}finally{active--;}
 });
 const session=new AiReadingSession(send),pending=session.request(source('甲'.repeat(7200)),settings,[]);
 await vi.waitFor(()=>expect(send).toHaveBeenCalledOnce());await Promise.resolve();expect(active).toBe(1);
 first.resolve(answer('Phần đầu.'));await pending;expect(send.mock.calls.length).toBeGreaterThan(1);expect(maximum).toBe(1);
});

it('latency review: early lease cannot speculate mixed models before first-response fallback is pinned',async()=>{
 const failed=deferred<void>(),fallback='gemini-2.5-flash',settings={...AI_DEFAULTS,splitParts:true,fallbackModels:[fallback]};
 const send=vi.fn(async(input:AiTranslateClientRequest,_signal:AbortSignal,onLease?: (lease:AiLeaseInfo)=>void)=>{
  onLease?.({requestId:'fallback-review',leaseIdHash:'fallback-safe-hash',keySlot:0,keysAvailable:2});
  if(input.model===AI_DEFAULTS.model){await failed.promise;throw new AiTranslateClientError('ai_invalid_model','Synthetic unavailable model',404);}
  return {...answer('Đúng model dự phòng.'),model:fallback};
 });
 const pending=new AiReadingSession(send).request(source('甲'.repeat(7200)),settings,[]);
 await vi.waitFor(()=>expect(send).toHaveBeenCalledOnce());await Promise.resolve();expect(send).toHaveBeenCalledOnce();
 failed.resolve();const result=await pending;
 expect(result.model).toBe(fallback);expect(send.mock.calls.slice(1).every(([input])=>input.model===fallback)).toBe(true);
});

it('latency review: proactive split cannot reject a safe whole request solely because protected Names overlap across its new target',async()=>{
 const chapter=source('甲'.repeat(6000)),names=[{key:'甲甲',value:'Giáp Giáp'}],send=vi.fn(async(_input:AiTranslateClientRequest)=>answer('Bản dịch toàn chương.'));
 const result=await new AiReadingSession(send).request(chapter,{...AI_DEFAULTS,splitParts:false,fallbackModels:[]},names);
 expect(result.result).toBe('Bản dịch toàn chương.');expect(send).toHaveBeenCalledOnce();
 expect(send.mock.calls[0]?.[0]).toMatchObject({text:chapter.text,names:{甲甲:'Giáp Giáp'}});
});

it('latency review: mixed-density source is planned against each individual request output budget',()=>{
 const text='甲'.repeat(4000)+'a'.repeat(4000),planned=planAiText(text,[],false);
 expect(planned.parts.map(part=>part.text).join('')).toBe(text);expect(planned.parts.length).toBeGreaterThan(1);
 for(const part of planned.parts)expect(estimatedAiOutputTokens(part.text)).toBeLessThanOrEqual(AI_PLANNED_OUTPUT_TOKENS-2048);
});

it('latency review: ordered prefix includes nested left leaves but hides incomplete or model-mismatched children',()=>{
 const roots=[{id:'0'},{id:'1'}],completed=new Map<string,AiTranslateClientResponse>([
  ['0/0/0',answer('A')],['0/1',answer('Later')],['1',answer('Last')]
 ]);
 expect(aiCompletedPrefix(roots,completed)).toBe('A');
 completed.set('0/0/1',{...answer('Incomplete'),finishReason:'MAX_TOKENS'});expect(aiCompletedPrefix(roots,completed)).toBe('A');
 completed.set('0/0/1',{...answer('Wrong'),model:'gemini-2.5-flash'});expect(aiCompletedPrefix(roots,completed)).toBe('A');
 completed.set('0/0/1',answer('B'));expect(aiCompletedPrefix(roots,completed)).toBe('A\nB\nLater\nLast');
 completed.set('0',answer('Parent'));expect(aiCompletedPrefix(roots,completed)).toBe('Parent\nLast');
});

it('latency review: failed parallel child drains its sibling before rejection and retry retains that safe sibling',async()=>{
 const tail=deferred<AiTranslateClientResponse>(),settings={...AI_DEFAULTS,splitParts:true,fallbackModels:[]},chapter=source('甲'.repeat(7200)),kept=[1,2,3].map(id=>({id:String(id),response:answer('Phần đã lưu '+id+'.')}));
 let settled=false;
 const send=vi.fn(async(_input:AiTranslateClientRequest,_signal:AbortSignal,onLease?: (lease:AiLeaseInfo)=>void)=>{
  const index=send.mock.calls.length-1;onLease?.({requestId:'drain-'+index,leaseIdHash:'drain-safe-'+index,keysAvailable:2,keySlot:index%2});
  if(index===0)throw cut();if(index===1)throw Error('Synthetic child failure');if(index===2)return tail.promise;
  return answer('Đầu mới.');
 });
 const session=new AiReadingSession(send,{read:async()=>undefined,write:async()=>true,readParts:async()=>kept}),pending=session.request(chapter,settings,[]);
 const observed=pending.then(()=>{settled=true;return undefined;},error=>{settled=true;return error as Error;});
 await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(3));await Promise.resolve();expect(settled).toBe(false);
 tail.resolve(answer('Cuối giữ lại.'));expect((await observed)?.message).toBe('Synthetic child failure');
 expect((await session.request(chapter,settings,[])).result).toBe(['Đầu mới.','Cuối giữ lại.',...kept.map(row=>row.response.result)].join('\n'));expect(send).toHaveBeenCalledTimes(4);
});

it('latency review: nested sibling lease evidence counts both actual child leases and releases each separately',async()=>{
 const left=deferred<AiTranslateClientResponse>(),right=deferred<AiTranslateClientResponse>(),history:AiPartsProgress[]=[],settings={...AI_DEFAULTS,splitParts:true,fallbackModels:[]};
 const send=vi.fn(async(_input:AiTranslateClientRequest,_signal:AbortSignal,onLease?: (lease:AiLeaseInfo)=>void)=>{
  const index=send.mock.calls.length-1;onLease?.({requestId:'nested-'+index,leaseIdHash:'nested-safe-'+index,keysAvailable:2,keySlot:index%2});
  if(index===0)throw cut();return index===1?left.promise:right.promise;
 });
 const kept=[1,2,3].map(id=>({id:String(id),response:answer('Phần đã lưu '+id+'.')}));
 const pending=new AiReadingSession(send,{read:async()=>undefined,write:async()=>true,readParts:async()=>kept}).request(source('甲'.repeat(7200)),settings,[],undefined,undefined,state=>history.push(state));
 await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(3));
 expect(history.at(-1)).toMatchObject({activeLeases:2,parallelLeases:2});
 left.resolve(answer('Đầu.'));await vi.waitFor(()=>expect(history.at(-1)?.text).toBe('Đầu.'));
 expect(history.at(-1)?.activeLeases).toBe(1);right.resolve(answer('Cuối.'));await pending;
 expect(history.at(-1)).toMatchObject({activeLeases:0,parallelLeases:2});
});

it('latency review: continuation lands on the next strict audio sentence boundary even when the new paragraph is indented',()=>{
 const first='Giáp 😀 đã đi.',second='— Ất ngồi cạnh cửa sổ.';
 for(const gap of ['\n','\r\n','\n\n  ','\n\t','\t\n  ']){
  const text=first+gap+second,strict=sentences(text),next=strict.find(sentence=>sentence.text.includes(second));
  expect(next).toBeDefined();
  const action=aiSpeechEndAction({aiReady:false,availableText:text,availableLength:text.length,spokenEnd:first.length,autoNext:false,hasNext:false});
  expect(action).toEqual({action:'continue',from:next!.start});
  if(action.action==='continue')expect(strict.find(sentence=>sentence.end>action.from)?.text).not.toContain(first);
 }
});
