import {combineAiHanAudits} from './ai-han-audit';
import {AiTranslateClientError,assertAiTranslationCoverage,type AiTranslateClientRequest,type AiTranslateClientResponse} from './ai-translate';
import {isTransientAiFailure} from './ai-recovery';
import {combineAiExecution} from './ai-execution';
import {protectAiBoundary} from './ai-boundary';
import {combineAiDivision,type AiDivisionReason} from './ai-division';
import {combinePolishTerms} from './polish-output';

export interface AiCompletionCheckpoint {
  id:string;
  completed:Map<string,AiTranslateClientResponse>;
  save:(id:string,result:AiTranslateClientResponse)=>Promise<void>;
  protectedKeys?:string[];
  onSplit?:(reason:AiDivisionReason,id:string)=>void;
  parallel?:(model:string|undefined)=>boolean;
  onInvalid?:(id:string,error:unknown)=>void;
  /** Structured tasks retain their proven source/Convert boundaries. */
  cut?:(text:string,offset:number)=>number;
  prepare?:(input:AiTranslateClientRequest,offset:number)=>AiTranslateClientRequest;
  validate?:(result:AiTranslateClientResponse)=>void;
  accept?:(result:AiTranslateClientResponse,text:string,offset:number)=>AiTranslateClientResponse;
  separator?:string;
}
/** The same deterministic cut is used before sending and when resuming saved children. */
export function aiRecoveryCut(text:string,protectedKeys:string[]=[]):number{
  let cut=Math.floor(text.length/2);const newline=text.lastIndexOf('\n',cut);
  if(newline>text.length/4)cut=newline+1;
  return protectAiBoundary(text,cut,protectedKeys);
}

/** Recover truncation and exhausted transient failures. Publish complete children only. */
export async function translateComplete(input:AiTranslateClientRequest,signal:AbortSignal,send:(input:AiTranslateClientRequest,partId?:string)=>Promise<AiTranslateClientResponse>,splitTransient:boolean|'timeout'|'none'=true,checkpoint?:AiCompletionCheckpoint):Promise<AiTranslateClientResponse>{
  const check=()=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};
  let requests=0;
  async function translate(text:string,depth:number,id=checkpoint?.id??'',inherited:AiDivisionReason[]=[],allowFork=true,offset=0):Promise<AiTranslateClientResponse>{
    check();const cached=checkpoint?.completed.get(id);
    if(cached&&cached.model===input.model&&cached.finishReason==='STOP'&&cached.result.trim()){
      try{assertAiTranslationCoverage({...input,text},cached);checkpoint?.validate?.(cached);return cached;}catch{checkpoint!.completed.delete(id);}
    }
    const recoverChildren=checkpoint&&[...checkpoint.completed.keys()].some(key=>key.startsWith(id+'/'));
    const children=async(reason:AiDivisionReason,cause?:unknown)=>{
      const cut=checkpoint?.cut?checkpoint.cut(text,offset):aiRecoveryCut(text,checkpoint?.protectedKeys);if(cut<=0||cut>=text.length){if(checkpoint?.cut&&cause)throw cause;throw Error('Không thể chia phần dịch an toàn mà vẫn giữ cặp nguồn. Giữ phần đã hoàn tất.');}
      checkpoint?.onSplit?.(reason,id);
      const reasons=[...new Set([...inherited,reason])];
      let first:AiTranslateClientResponse,second:AiTranslateClientResponse;
      if(allowFork&&checkpoint?.parallel?.(input.model)){
        // No recursive fan-out. Shared request admission still owns both slots.
        // Drain siblings before throwing so late saves cannot enter a new job.
        const pair=await Promise.allSettled([translate(text.slice(0,cut),depth+1,id+'/0',reasons,false,offset),translate(text.slice(cut),depth+1,id+'/1',reasons,false,offset+cut)]);
        check();if(pair[0].status==='rejected')throw pair[0].reason;if(pair[1].status==='rejected')throw pair[1].reason;
        first=pair[0].value;second=pair[1].value;
      }else{first=await translate(text.slice(0,cut),depth+1,id+'/0',reasons,allowFork,offset);second=await translate(text.slice(cut),depth+1,id+'/1',reasons,allowFork,offset+cut);}
      check();const result=first.result+(checkpoint?.separator??'\n')+second.result;
      if(result.length>128000)throw new Error('Bản dịch vượt giới hạn lưu trữ.');
      if(first.model!==second.model)throw new Error('Model thay đổi trong khi phục hồi.');
      return {...first,...combineAiExecution([first,second]),...combineAiHanAudits([first,second]),...(first.polishTerms||second.polishTerms?{polishTerms:combinePolishTerms([first.polishTerms,second.polishTerms])}:{}),division:first.division&&second.division?combineAiDivision([first,second],reason):undefined,result,inputTokens:first.inputTokens+second.inputTokens,outputTokens:first.outputTokens+second.outputTokens};
    };
    if(splitTransient!=='none'&&recoverChildren){const reason=[...checkpoint!.completed].find(([key])=>key.startsWith(id+'/'))?.[1].division?.reasons[0]??'resumed';return children(reason);}
    if(++requests>1000)throw new Error('Chưa dịch xong trong giới hạn phục hồi.');
    let observedResponse=false,validatedResponse=false;
    try{const request={...input,text},raw=await send(checkpoint?.prepare?checkpoint.prepare(request,offset):request,id);observedResponse=true;check();if(raw.finishReason!=='STOP'||!raw.result.trim())throw new Error('Bản dịch chưa hoàn chỉnh.');assertAiTranslationCoverage(request,raw);checkpoint?.validate?.(raw);const accepted=checkpoint?.accept?checkpoint.accept(raw,text,offset):raw;if(checkpoint&&input.model&&raw.model!==input.model)throw Error('Model thay đổi trong khi phục hồi.');const result=inherited.length?{...accepted,division:{version:1 as const,parts:1,reasons:inherited}}:accepted;validatedResponse=true;if(checkpoint&&depth>0)await checkpoint.save(id,result);check();return result;}
    catch(e){
      if(observedResponse&&!validatedResponse&&!signal.aborted)checkpoint?.onInvalid?.(id,e);
      check();
      const canSplit=splitTransient!=='none'&&e instanceof AiTranslateClientError&&(e.code==='ai_untranslated_result'||(e.code==='ai_incomplete_result'&&e.reason==='output_limit')
        ||(splitTransient&&isTransientAiFailure(e)&&e.code!=='ai_rate_limited'&&e.status!==429&&(splitTransient!=='timeout'||e.code==='ai_timeout'||e.status===408)));
      if(!canSplit||text.length<400)throw e;
      return children(e.code==='ai_incomplete_result'?'output_limit':e.code==='ai_untranslated_result'?'untranslated':e.code==='ai_timeout'||e.status===408?'timeout':'transient',e);
    }
  }
  return translate(input.text,0);
}
