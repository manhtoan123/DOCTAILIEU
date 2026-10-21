import type {AiReadingSource,AiReadingCache,ReadingAiSettings} from './ai-reading';
import {AiTranslateClientError,type AiTranslateClientResponse} from './ai-translate';
import {AI_HYBRID_SAMPLE_CHARS,AI_HYBRID_SOURCE_CHARS,hybridTemplateValid,isHybridLiteModel,DEFAULT_SECOND_HALF_PROMPT,secondHalfTemplateValid,HYBRID_LITE_MODELS} from './ai-hybrid-prompt';
import type {AiPartsProgress} from './ai-parts';
import {readingAiModels} from './ai-fallback';
export type HybridMemory=Map<string,AiTranslateClientResponse>;
export async function hybridSampleHash(sample:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sample))),n=>n.toString(16).padStart(2,'0')).join('');}
/** Each stage cache is bound to the ORIGINAL source, its stage plan and full sample digest. */
export function hybridStageCache(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],stagePlan:string,memory:HybridMemory,persisted?:AiReadingCache,models=readingAiModels(settings),legacy?:ReadingAiSettings):AiReadingCache{
 const token=(plan:string,id:string)=>JSON.stringify([stagePlan,plan,id]);
 const readParts:NonNullable<AiReadingCache['readParts']>=async(_s,_t,_n,plan,signal)=>{
  const ram=new Map<string,AiTranslateClientResponse>();for(const [key,value] of memory){const [stage,p,id]=JSON.parse(key);if(stage===stagePlan&&p===plan)ram.set(id,value);}
  const cachePlan=JSON.stringify(['hybrid-halves-1',stagePlan,plan]);
  let rows=persisted?.readParts?await persisted.readParts(source,settings,names,cachePlan,signal):[];
  if(!rows.length&&!ram.size&&legacy?.hybrid&&persisted?.readParts){
   // v1's first-stage identity unnecessarily included the selected Lite. Both
   // variants have the same first-stage inputs; only validated first models pass.
   const variants=[legacy,...HYBRID_LITE_MODELS.filter(m=>m.id!==legacy.hybrid!.liteModel).map(m=>({...legacy,hybrid:{...legacy.hybrid!,liteModel:m.id}}))];
   for(const variant of variants){rows=(await persisted.readParts(source,variant,names,cachePlan,signal,true)).filter(r=>!r.response.halves&&models.includes(r.response.model));if(rows.length)break;}
  }
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const result=new Map(rows.map(r=>[r.id,r.response]));for(const [id,value] of ram)result.set(id,value);
  return [...result].filter(([,r])=>!r.halves&&models.includes(r.model)).map(([id,response])=>({id,response}));
 };
 const writePart:NonNullable<AiReadingCache['writePart']>=async(_s,_t,_n,plan,id,result,signal)=>{
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');if(result.halves||!models.includes(result.model))return false;memory.set(token(plan,id),result);
  return persisted?.writePart?persisted.writePart(source,settings,names,JSON.stringify(['hybrid-halves-1',stagePlan,plan]),id,result,signal):true;
 };
 return {readParts,writePart,read:async(s,t,n,signal)=>(await readParts(s,t,n,'complete',signal)).find(r=>r.id==='9999')?.response,write:(s,t,n,r,signal)=>writePart(s,t,n,'complete','9999',r,signal)};
}
export interface HybridStageRunner<T extends AiTranslateClientResponse> { (index:0|1,settings:ReadingAiSettings,cache:AiReadingCache,publish:(p:AiPartsProgress)=>void):Promise<T> }
/** Stages are sequential. Their inner requests must use the caller's one chapter budget. */
export async function runHybridStages<T extends AiTranslateClientResponse>(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],plan:string,memory:HybridMemory,persisted:AiReadingCache|undefined,signal:AbortSignal,firstHalfSource:string,run:HybridStageRunner<T>,publish:(stage:0|1,p:AiPartsProgress,first?:T)=>void):Promise<[T,T,string]>{
 const check=()=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};check();
 if(!settings.hybrid||!hybridTemplateValid(settings.userPromptTemplate))throw new AiTranslateClientError('invalid_prompt','Dịch kết hợp cần đúng một {{text}} trong User Prompt.');
 if(isHybridLiteModel(settings.model))throw new AiTranslateClientError('ai_invalid_model','Nửa đầu cần chọn model ưu tiên; Lite chỉ dùng cho nửa sau.');
 const {hybrid,...normal}=settings;
 const promptTemplate=hybrid.secondHalfPrompt??DEFAULT_SECOND_HALF_PROMPT;
 if(!secondHalfTemplateValid(promptTemplate))throw new AiTranslateClientError('invalid_prompt','Prompt nửa sau cần đúng một {{name}}, {{firstHalfTranslation}} và {{text}}.');
 if(!firstHalfSource.trim()||firstHalfSource.length>AI_HYBRID_SOURCE_CHARS)throw new AiTranslateClientError('prompt_too_large','Nguồn nửa đầu không nằm trong giới hạn mẫu. Giữ tiến độ; hãy chọn chế độ thường cho chương này.');
 const firstSettings={...normal,fallbackModels:readingAiModels(settings).slice(1),...(hybrid.rules?{addressingRules:hybrid.rules}:{})};
 const firstCacheSettings={...normal,addressingRules:hybrid.rules};
 const legacySettings={...settings,hybrid:{version:1 as const,liteModel:hybrid.liteModel,rules:hybrid.rules}};
 const first=await run(0,firstSettings,hybridStageCache(source,firstCacheSettings,names,JSON.stringify([plan,0]),memory,persisted,readingAiModels(firstSettings),legacySettings),p=>publish(0,p));check();
 if(first.finishReason!=='STOP'||!first.result.trim())throw Error('Nửa đầu chưa hoàn chỉnh.');
 if(first.result.length>AI_HYBRID_SAMPLE_CHARS)throw new AiTranslateClientError('prompt_too_large','Toàn bộ mẫu vượt giới hạn dịch kết hợp. Giữ tiến độ; hãy chọn chế độ thường cho chương này.');
 const hash=await hybridSampleHash(first.result),sourceHash=await hybridSampleHash(firstHalfSource);check();
 const next={...normal,model:hybrid.liteModel,fallbackModels:[],continuation:{version:3 as const,sample:first.result,rules:hybrid.rules,promptTemplate,firstHalfSource}};
 const second=await run(1,next,hybridStageCache(source,settings,names,JSON.stringify([plan,1,hash,promptTemplate,'paired-source-3',sourceHash]),memory,persisted,[hybrid.liteModel]),p=>publish(1,p,first));check();
 if(second.finishReason!=='STOP'||!second.result.trim()||second.model!==hybrid.liteModel)throw Error('Nửa sau chưa hoàn chỉnh hoặc sai model.');
 return [first,second,hash];
}
export function hybridResult(first:AiTranslateClientResponse,second:AiTranslateClientResponse,sampleHash:string):AiTranslateClientResponse{
 return {result:first.result+'\n'+second.result,model:'hybrid',finishReason:'STOP',inputTokens:first.inputTokens+second.inputTokens,outputTokens:first.outputTokens+second.outputTokens,halves:{version:1,models:[first.model,second.model],sampleHash}};
}
