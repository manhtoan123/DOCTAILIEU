import {it,expect,vi} from 'vitest';
import {readAiNameResult,readAiNameInput} from '../src/shared/ai-name-result';
import {AiNameDiscoveryRun,nameDiscoveryPlan,DEFAULT_AI_NAME_PROMPT,AI_NAME_PART_CHARS} from '../src/features/ai/services/ai-name-discovery';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';
const report=(list:string)=>`1. Chưa xác định tác phẩm.\n2. Rà soát theo nguồn.\n3. Tên nhân vật.\n4. Danh sách\n\`\`\`text\n${list}\n\`\`\``;
const source={bookId:'fixture',id:'chapter',revision:1,title:'Vườn tổng hợp',text:'林安打开门，白云山很安静。',names:[]};
it('extracts only source-evidenced rows from one text block and retains conflicting meanings for user review',()=>{
 expect(readAiNameResult(report('$林安=Lâm An\n$白云山=Bạch Vân Sơn\n$林安=Lâm An\n$林安=Lâm Yên'),source.text)).toEqual([{key:'白云山',value:'Bạch Vân Sơn'},{key:'林安',value:'Lâm An'},{key:'林安',value:'Lâm Yên'}]);
});
it.each(['Tôi không thể hỗ trợ yêu cầu này.',report('$不存在=Không Có'),report('$林安=林安'),report('林安=Lâm An'),report('$林安='),report('$林安=Lâm An')+'\n```text\n$林安=Lâm An\n```'])('rejects invalid/refusal/hallucinated result without silently saving any rows: %s',text=>expect(()=>readAiNameResult(text,source.text)).toThrow());
it('accepts explicit empty findings but not free-form missing lists',()=>{expect(readAiNameResult(report('# Không tìm thấy Name.'),source.text)).toEqual([]);expect(()=>readAiNameInput('{}')).toThrow();expect(readAiNameInput(JSON.stringify({version:1,source:source.text}))).toEqual({source:source.text});});
it('plans only the current chapter losslessly and counts JSON/prompts/metadata without adjacent context',()=>{
 const input={...source,text:source.text.repeat(1500)},plan=nameDiscoveryPlan(input,'gemini-2.5-flash',DEFAULT_AI_NAME_PROMPT);
 expect(plan.parts.map(p=>p.text).join('')).toBe(input.text);expect(plan.parts.length).toBeGreaterThan(2);expect(plan.parts.every(p=>p.text.length<=AI_NAME_PART_CHARS)).toBe(true);expect(AI_NAME_PART_CHARS).toBe(2500);
 for(const p of plan.parts){expect(p.context).toBeUndefined();expect(plan.encode(p.text).length+plan.settings.systemPrompt.length+plan.settings.userPromptTemplate.length).toBeLessThanOrEqual(16000);}
});
it('uses shared technical session and accepts complete reports only; never writes Names by itself',async()=>{
 const calls:any[]=[],rows:any[]=[];
 const run=new AiNameDiscoveryRun(source,'gemini-2.5-flash',DEFAULT_AI_NAME_PROMPT,undefined,async input=>{calls.push(input);return {model:input.model!,result:report('$林安=Lâm An'),finishReason:'STOP',inputTokens:1,outputTokens:1};});
 await run.run(()=>{},found=>rows.push(...found));expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({task:'name-extraction',modelMode:'fixed'});expect(rows).toEqual([{key:'林安',value:'Lâm An'}]);
});
it.each([[1,1,true],[2,2,true],[3,3,true],[8,4,true],[8,2,false]])('uses %i eligible keys with at most %i overlapping Name requests',async(keysAvailable,limit,reportFreeKeys)=>{
 let active=0,maximum=0,sequence=0;const found:any[]=[];
 const run=new AiNameDiscoveryRun({...source,text:source.text.repeat(1000)},'gemini-2.5-flash',DEFAULT_AI_NAME_PROMPT,undefined,async(input,signal,onLease)=>{
  const id=++sequence;maximum=Math.max(maximum,++active);onLease?.({requestId:'synthetic-'+id,leaseIdHash:String(id),keysAvailable,...(reportFreeKeys?{freeKeys:Math.max(0,keysAvailable-active)}:{})});
  try{await new Promise(r=>setTimeout(r,1));signal.throwIfAborted();return {model:input.model!,result:report('$林安=Lâm An'),finishReason:'STOP',inputTokens:1,outputTokens:1,...(keysAvailable>=2?{parallel:2 as const}:{})};}
  finally{active--;}
 });await run.run(()=>{},rows=>found.push(...rows));expect(maximum).toBe(limit);expect(found.length).toBeGreaterThan(4);
});
it('Stop rejects late results before candidates appear',async()=>{
 let finish!:(x:any)=>void;const accepted=vi.fn(),run=new AiNameDiscoveryRun(source,'gemini-2.5-flash',DEFAULT_AI_NAME_PROMPT,undefined,()=>new Promise(resolve=>finish=resolve));
 const promise=run.run(()=>{},accepted);const rejected=expect(promise).rejects.toMatchObject({name:'AbortError'});await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));run.cancel();finish({model:'gemini-2.5-flash',result:report('$林安=Lâm An'),finishReason:'STOP',inputTokens:1,outputTokens:1});await rejected;expect(accepted).not.toHaveBeenCalled();
});

it('bisects technical failures twice, skips only failed leaves, then retries just those with a new model',async()=>{
 const text='林安'+'甲'.repeat(2398), oldModel='gemini-2.5-flash', newModel='gemini-3.5-flash';
 const calls:{text:string;model:string}[]=[];
 const run=new AiNameDiscoveryRun({...source,text},oldModel,DEFAULT_AI_NAME_PROMPT,undefined,async input=>{
  const {source:part}=readAiNameInput(input.text),model=input.model!;
  calls.push({text:part,model});
  if(model===oldModel&&part.includes('林安'))throw new AiTranslateClientError('ai_incomplete_result','Cắt đầu ra',502,'output_limit');
  return {model,result:report(part.includes('林安')?'$林安=Lâm An':'# Không tìm thấy Name.'),finishReason:'STOP',inputTokens:1,outputTokens:1};
 });
 const accepted=vi.fn(),progress=vi.fn();
 const skipped=await run.run(progress,accepted);
 expect(calls.map(call=>call.text.length)).toEqual([2400,1200,600,600,1200]);
 expect(skipped).toMatchObject([{part:{id:'0/0/0',start:0,end:600}}]);
 expect(progress).toHaveBeenLastCalledWith({done:2,skipped:1,total:3});
 expect([skipped[0].part,...accepted.mock.calls.map(args=>args[2])].map(part=>part.text).join('')).toBe(text);
 await expect(run.run(progress,accepted,newModel,true)).resolves.toEqual([]);
 expect(calls.slice(5)).toEqual([{text:text.slice(0,600),model:newModel}]);
 expect(progress).toHaveBeenLastCalledWith({done:3,skipped:0,total:3});
});

it.each([
 ['ai_empty_result','upstream_empty_result'],
 ['ai_invalid_response','name_result'],
] as const)('skips %s/%s without splitting and pauses globally on unavailable keys',async(code,reason)=>{
 const input={...source,text:'甲'.repeat(4500)},model='gemini-2.5-flash';
 let calls=0;
 const run=new AiNameDiscoveryRun(input,model,DEFAULT_AI_NAME_PROMPT,undefined,async()=>{
  if(++calls===1){
   if(reason==='name_result')return {model,result:'Không có danh sách Name hợp lệ.',finishReason:'STOP',inputTokens:1,outputTokens:1};
   throw new AiTranslateClientError(code,'Không có nội dung kết quả',502,reason);
  }
  if(calls===2)throw new AiTranslateClientError('ai_provider_unavailable','Thiếu key',503);
  return {model,result:report('# Không tìm thấy Name.'),finishReason:'STOP',inputTokens:1,outputTokens:1};
 });
 const accepted=vi.fn(),progress=vi.fn();
 await expect(run.run(progress,accepted)).rejects.toMatchObject({code:'ai_provider_unavailable'});
 expect(calls).toBe(2);
 expect(progress).toHaveBeenLastCalledWith({done:0,skipped:1,total:2});
 await expect(run.run(progress,accepted)).resolves.toMatchObject([{part:{id:'0'},retryable:false}]);
 expect(calls).toBe(3);
 expect(accepted).toHaveBeenCalledTimes(1);
});

it.each([
 ['ai_incomplete_result','upstream_finish_reason'],
 ['ai_incomplete_result','finish_reason'],
 ['ai_invalid_response','upstream_finish_reason'],
 ['ai_invalid_response','upstream_schema'],
 ['ai_invalid_response','upstream_candidates'],
 ['ai_invalid_response','upstream_parts'],
] as const)('splits a broken response %s/%s and continues after a failed child',async(code,reason)=>{
 const model='gemini-2.5-flash', text='林安'+'甲'.repeat(1198);
 const sizes:number[]=[];
 const run=new AiNameDiscoveryRun({...source,text},model,DEFAULT_AI_NAME_PROMPT,undefined,async input=>{
  const part=readAiNameInput(input.text).source;
  sizes.push(part.length);
  if(part.includes('林安'))throw new AiTranslateClientError(code,'Phản hồi hỏng',502,reason);
  return {model,result:report('# Không tìm thấy Name.'),finishReason:'STOP',inputTokens:1,outputTokens:1};
 });
 const progress=vi.fn();
 await expect(run.run(progress,()=>{})).resolves.toMatchObject([{part:{start:0,end:600},retryable:true}]);
 expect(sizes).toEqual([1200,600,600]);
 expect(progress).toHaveBeenLastCalledWith({done:1,skipped:1,total:2});
});

it('pauses instead of splitting when an oversized response carries a quota status',async()=>{
 const translate=vi.fn(async()=>{throw new AiTranslateClientError('ai_response_too_large','Phản hồi quá lớn',429);});
 const run=new AiNameDiscoveryRun({...source,text:'甲'.repeat(2400)},'gemini-2.5-flash',DEFAULT_AI_NAME_PROMPT,undefined,translate);
 await expect(run.run(()=>{},()=>{})).rejects.toMatchObject({status:429});
 expect(translate).toHaveBeenCalledTimes(1);
});

it('cancels an in-flight sibling promptly when a global error pauses the scan',async()=>{
 const model='gemini-2.5-flash', text='甲'.repeat(4500);
 let calls=0, siblingSignal:AbortSignal|undefined, siblingStarted!:()=>void;
 const started=new Promise<void>(resolve=>{siblingStarted=resolve;});
 const run=new AiNameDiscoveryRun({...source,text},model,DEFAULT_AI_NAME_PROMPT,undefined,async(_input,signal,onLease)=>{
  if(++calls===1){
   onLease?.({requestId:'synthetic',leaseIdHash:'first',keysAvailable:2});
   await started;
   throw new AiTranslateClientError('ai_provider_unavailable','Thiếu key',503);
  }
  siblingSignal=signal;
  siblingStarted();
  return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 });
 const accepted=vi.fn();
 await expect(run.run(()=>{},accepted)).rejects.toMatchObject({code:'ai_provider_unavailable'});
 expect(siblingSignal?.aborted).toBe(true);
 expect(accepted).not.toHaveBeenCalled();
});
