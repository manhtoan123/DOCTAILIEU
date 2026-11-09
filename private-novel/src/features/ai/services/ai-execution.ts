import {disablesAiThinking,supportsAiTemperature} from '../types/ai-models';

/** Server-recorded request configuration only; never contains source, prompt or credentials. */
export interface AiExecution {version:1;model:string;temperature:number|null;thinking:'provider-default'|'disabled';maxOutputTokens:number;promptId:string}
export const AI_EXECUTION_HEADER='X-AI-Execution';
export const AI_USAGE_HEADERS=['X-AI-Thought-Tokens','X-AI-Total-Tokens'] as const;
export function readAiExecution(value:unknown):AiExecution|undefined{
 if(!value||typeof value!=='object'||Array.isArray(value))return;
 const v=value as Record<string,unknown>;
 if(v.version!==1||typeof v.model!=='string'||v.model.length>80||!/^[a-z0-9]+(?:[.-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[.-][a-z0-9]+)*)?$/.test(v.model)||!['provider-default','disabled'].includes(v.thinking as string)||!Number.isSafeInteger(v.maxOutputTokens)||Number(v.maxOutputTokens)<1||Number(v.maxOutputTokens)>1000000||typeof v.promptId!=='string'||!/^[a-f0-9]{64}$/.test(v.promptId))return;
 if(v.temperature!==null&&(typeof v.temperature!=='number'||!Number.isFinite(v.temperature)||v.temperature<0||v.temperature>2))return;
 return {version:1,model:v.model,temperature:v.temperature as number|null,thinking:v.thinking as AiExecution['thinking'],maxOutputTokens:Number(v.maxOutputTokens),promptId:v.promptId};
}
export function readExecutionHeader(headers:Headers){try{const raw=headers.get(AI_EXECUTION_HEADER);return raw&&raw.length<=512?readAiExecution(JSON.parse(raw)):undefined;}catch{return undefined;}}
export function readUsageToken(value:unknown):number|undefined{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=1000000?value:undefined;}
export function readUsageHeader(headers:Headers,name:string){const value=headers.get(name);return value!==null&&/^\d{1,7}$/.test(value)?readUsageToken(Number(value)):undefined;}
export async function describeAiExecution(model:string,temperature:number,systemPrompt:string,userPromptTemplate:string,addressingRules='',continuationTemplate=''):Promise<AiExecution>{
 const bytes=new TextEncoder().encode(JSON.stringify([systemPrompt,userPromptTemplate,addressingRules,continuationTemplate]));
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return {version:1,model,temperature:supportsAiTemperature(model)?temperature:null,thinking:disablesAiThinking(model)?'disabled':'provider-default',maxOutputTokens:8192,promptId:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};
}
export function combineAiExecution(results:{execution?:AiExecution;thinkingTokens?:number;totalTokens?:number}[]){
 const first=readAiExecution(results[0]?.execution);
 const sum=(key:'thinkingTokens'|'totalTokens')=>results.length&&results.every(r=>readUsageToken(r[key])!==undefined)?readUsageToken(results.reduce((n,r)=>n+r[key]!,0)):undefined;
 return {execution:first&&results.every(r=>JSON.stringify(readAiExecution(r.execution))===JSON.stringify(first))?first:undefined,thinkingTokens:sum('thinkingTokens'),totalTokens:sum('totalTokens')};
}
