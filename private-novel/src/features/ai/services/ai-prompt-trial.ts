import {AiRunMetrics} from './ai-metrics';
import {aiTranslate,filterNamesForText,type AiTranslateClientRequest,type AiTranslateClientResponse} from './ai-translate';
import type {ReadingAiSettings} from '../types/ai-settings-type';
import {validatePromptSettings} from '../prompt/prompt-schema';
import {isAiModelId} from '../types/ai-models';
import {validateConvertNames} from '../../names-convert/services/convert-names';
import {errorText} from '../../../shared/components/common';
export interface PromptTrialInput {text:string;names:{key:string;value:string}[];model:string;temperature:number;variants:[{label:string;settings:ReadingAiSettings},{label:string;settings:ReadingAiSettings}]}
export interface PromptTrialResult {index:number;label:string;durationMs:number;response?:AiTranslateClientResponse;error?:string}
type Translate=(input:AiTranslateClientRequest,signal?:AbortSignal)=>Promise<AiTranslateClientResponse>;
/** Two explicit, sequential requests. No selection, progress, settings or response-cache writes. */
export async function runPromptComparison(input:PromptTrialInput,signal:AbortSignal,onResult:(result:PromptTrialResult)=>void,translate?:Translate):Promise<void>{
 let lastKeySlot:number|undefined;const trialGroupId=crypto.randomUUID();
 const check=()=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};check();
 if(!input.text.trim()||input.text.length>3200||!isAiModelId(input.model)||!Number.isFinite(input.temperature)||input.temperature<0||input.temperature>1||input.variants.length!==2)throw Error('Chọn model hợp lệ và nhập nguồn thử từ 1 đến 3.200 ký tự.');
 const names=filterNamesForText(input.text,validateConvertNames(input.names));
 const requests=input.variants.map(variant=>{
  const settings=validatePromptSettings({...variant.settings,model:input.model,temperature:input.temperature,fallbackModels:undefined,hybrid:undefined,addressingRules:variant.settings.addressingRules??variant.settings.hybrid?.rules??''});
  if((settings.userPromptTemplate.match(/\{\{text\}\}/g)||[]).length!==1)throw Error('Mỗi prompt thử cần đúng một {{text}}.');
  return {label:variant.label.slice(0,160),request:{text:input.text,names:{...names},model:input.model,temperature:input.temperature,systemPrompt:settings.systemPrompt,userPromptTemplate:settings.userPromptTemplate,addressingRules:settings.addressingRules??settings.hybrid?.rules??''}};
 });
 for(const [index,variant] of requests.entries()){
  check();const started=performance.now();let result:PromptTrialResult;
  try{const context=new AiRunMetrics('txt',input.text.length,undefined,'trial').context('0',0,undefined,{trialGroupId,trialVariant:index===0?'A':'B'});const response=await (translate?translate(variant.request,signal):aiTranslate(variant.request,signal,lease=>{lastKeySlot=lease.keySlot;},undefined,true,lastKeySlot,context));check();result={index,label:variant.label,durationMs:Math.round(performance.now()-started),response};}
  catch(error){check();result={index,label:variant.label,durationMs:Math.round(performance.now()-started),error:errorText(error)};}
  check();onResult(result);
 }
}
