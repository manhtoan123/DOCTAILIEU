import {AiTranslateClientError,assertAiTranslationCoverage,type AiTranslateClientRequest,type AiTranslateClientResponse} from './ai-translate';
import {isTransientAiFailure} from './ai-recovery';
import {protectAiBoundary} from './ai-boundary';

export interface AiCompletionCheckpoint {
  id:string;
  completed:Map<string,AiTranslateClientResponse>;
  save:(id:string,result:AiTranslateClientResponse)=>Promise<void>;
  protectedKeys?:string[];
}
/** The same deterministic cut is used before sending and when resuming saved children. */
export function aiRecoveryCut(text:string,protectedKeys:string[]=[]):number{
  let cut=Math.floor(text.length/2);const newline=text.lastIndexOf('\n',cut);
  if(newline>text.length/4)cut=newline+1;
  return protectAiBoundary(text,cut,protectedKeys);
}

/** Recover truncation and exhausted transient failures. Publish complete children only. */
export async function translateComplete(input:AiTranslateClientRequest,signal:AbortSignal,send:(input:AiTranslateClientRequest)=>Promise<AiTranslateClientResponse>,splitTransient:boolean|'timeout'|'none'=true,checkpoint?:AiCompletionCheckpoint):Promise<AiTranslateClientResponse>{
  const check=()=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};
  let requests=0;
  async function translate(text:string,depth:number,id=checkpoint?.id??''):Promise<AiTranslateClientResponse>{
    check();const cached=checkpoint?.completed.get(id);
    if(cached&&cached.model===input.model&&cached.finishReason==='STOP'&&cached.result.trim()){
      try{assertAiTranslationCoverage({...input,text},cached);return cached;}catch{checkpoint!.completed.delete(id);}
    }
    const recoverChildren=checkpoint&&[...checkpoint.completed.keys()].some(key=>key.startsWith(id+'/'));
    const children=async()=>{
      const cut=aiRecoveryCut(text,checkpoint?.protectedKeys);if(cut<=0||cut>=text.length)throw Error('Không thể chia phần dịch an toàn.');
      const first=await translate(text.slice(0,cut),depth+1,id+'/0'),second=await translate(text.slice(cut),depth+1,id+'/1');
      check();const result=first.result+'\n'+second.result;
      if(result.length>128000)throw new Error('Bản dịch vượt giới hạn lưu trữ.');
      if(first.model!==second.model)throw new Error('Model thay đổi trong khi phục hồi.');
      return {...first,result,inputTokens:first.inputTokens+second.inputTokens,outputTokens:first.outputTokens+second.outputTokens};
    };
    if(recoverChildren&&depth<3)return children();
    if(++requests>15)throw new Error('Chưa dịch xong trong giới hạn phục hồi.');
    try{const result=await send({...input,text});check();if(result.finishReason!=='STOP'||!result.result.trim())throw new Error('Bản dịch chưa hoàn chỉnh.');assertAiTranslationCoverage({...input,text},result);if(checkpoint&&input.model&&result.model!==input.model)throw Error('Model thay đổi trong khi phục hồi.');if(checkpoint&&depth>0)await checkpoint.save(id,result);check();return result;}
    catch(e){
      check();
      const canSplit=splitTransient!=='none'&&e instanceof AiTranslateClientError&&(e.code==='ai_untranslated_result'||(e.code==='ai_incomplete_result'&&e.reason==='output_limit')
        ||(splitTransient&&isTransientAiFailure(e)&&e.code!=='ai_rate_limited'&&e.status!==429&&(splitTransient!=='timeout'||e.code==='ai_timeout'||e.status===408)));
      if(!canSplit||depth>=3||text.length<400)throw e;
      return children();
    }
  }
  return translate(input.text,0);
}
