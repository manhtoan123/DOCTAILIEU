import {AI_DIVISION_REASONS} from '../../features/ai/services/ai-division';
import {readAiExecution,readUsageToken} from '../../features/ai/services/ai-execution';
import {AI_LOG_CONTEXT_MAX_BYTES,type AiLogClientFacts,type AiLogClientTiming,type AiLogContext,type AiLogRequestContext,type AiLogServerFacts,type AiLogTelemetry,type AiLogTrace} from './ai-log';

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(key=>allowed.includes(key));
const integer=(v:unknown,min=0,max=2147483647):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const path=(v:unknown):v is string=>typeof v==='string'&&/^0(?:\.[0-9]{1,4}){0,12}$/.test(v);
const purpose=(v:unknown)=>['foreground','prewarm','trial'].includes(String(v));
const has=(v:Record<string,unknown>,key:string,valid:(value:unknown)=>boolean)=>v[key]===undefined||valid(v[key]);
const pick=<T>(v:Record<string,unknown>):T=>Object.fromEntries(Object.entries(v).filter(([,value])=>value!==undefined)) as T;
export function readAiLogTrace(value:unknown):AiLogTrace|undefined{
 if(!object(value)||!keys(value,['workId','partPath','parentPartPath','purpose','initialPurpose','fallbackIndex','retryOfWorkId','fallbackCause']))return;
 const v=value;
 if(!uuid(v.workId)||!path(v.partPath)||!purpose(v.purpose)||!purpose(v.initialPurpose)||!integer(v.fallbackIndex,0,8)||!has(v,'parentPartPath',path)||!has(v,'retryOfWorkId',uuid)||!has(v,'fallbackCause',x=>['timeout','network','quota','upstream','validation','output_limit','unknown'].includes(String(x))))return;
 if(v.parentPartPath!==undefined&&(!v.partPath.startsWith(`${v.parentPartPath}.`)||v.partPath.slice(String(v.parentPartPath).length+1).includes('.')))return;
 return pick<AiLogTrace>(v);
}
export function readAiLogContext(value:unknown):AiLogContext|undefined{
 if(!object(value)||!keys(value,['format','appVersion','policyVersion','validationVersion','contextChars','strategy','splitDepth','splitReason','trialGroupId','trialVariant']))return;
 const v=value;
 for(const name of ['appVersion','policyVersion','validationVersion'])if(!has(v,name,x=>typeof x==='string'&&/^[a-zA-Z0-9._-]{1,64}$/.test(x)))return;
 if(!has(v,'format',x=>x==='txt'||x==='epub')||!has(v,'contextChars',x=>integer(x,0,128000))||!has(v,'strategy',x=>x==='whole'||x==='split')||!has(v,'splitDepth',x=>integer(x,0,12))||!has(v,'splitReason',x=>[...AI_DIVISION_REASONS,'invalid_result','size_limit'].includes(String(x)))||!has(v,'trialGroupId',uuid)||!has(v,'trialVariant',x=>x==='A'||x==='B'))return;
 return pick<AiLogContext>(v);
}
function readTiming(value:unknown):AiLogClientTiming|undefined{
 if(!object(value)||!keys(value,['epoch','sequence','foregroundAt','foregroundMs','previewVisibleMs','acceptedContentVisibleMs','workCompleteMs','foregroundAcceptedMs','foregroundCompleteMs']))return;
 if(!uuid(value.epoch)||!integer(value.sequence,1,1000000))return;
 for(const key of ['foregroundMs','previewVisibleMs','acceptedContentVisibleMs','workCompleteMs','foregroundAcceptedMs','foregroundCompleteMs'])if(!has(value,key,integer))return;
 if(!has(value,'foregroundAt',x=>integer(x,0,8640000000000000)))return;
 return pick<AiLogClientTiming>(value);
}
function readClient(value:unknown,models:ReadonlySet<string>):AiLogClientFacts|undefined{
 if(!object(value)||!keys(value,['timing','leafParts','acceptedLeafParts','retries','modelSwitches','validation','recovery','completeness','parts']))return;
 const timing=readTiming(value.timing);if(!timing)return;
 for(const key of ['leafParts','acceptedLeafParts','retries','modelSwitches'])if(!has(value,key,x=>integer(x,0,100000)))return;
 if(typeof value.leafParts==='number'&&typeof value.acceptedLeafParts==='number'&&value.acceptedLeafParts>value.leafParts)return;
 if(!has(value,'validation',x=>['accepted','rejected','incomplete','unknown'].includes(String(x)))||!has(value,'recovery',x=>['none','retry','model','split','mixed'].includes(String(x)))||!has(value,'completeness',x=>x==='observed'||x==='partial'))return;
 let parts:AiLogClientFacts['parts'];
 if(value.parts!==undefined){
  if(!Array.isArray(value.parts)||value.parts.length>32)return;parts=[];
  for(const row of value.parts){
   if(!object(row)||!keys(row,['partPath','parentPartPath','requestId','model','validation','validationReason','splitReason'])||!has(row,'splitReason',x=>(AI_DIVISION_REASONS as readonly string[]).includes(String(x)))||!has(row,'validationReason',x=>['mapping','untranslated','output_limit','invalid_response'].includes(String(x)))||!path(row.partPath)||!has(row,'parentPartPath',path)||!has(row,'requestId',uuid)||!has(row,'model',x=>typeof x==='string'&&models.has(x))||!['accepted','rejected','incomplete','unknown'].includes(String(row.validation)))return;
   if(row.parentPartPath!==undefined&&(!row.partPath.startsWith(`${row.parentPartPath}.`)||row.partPath.slice(String(row.parentPartPath).length+1).includes('.')))return;
   parts.push(pick<NonNullable<AiLogClientFacts['parts']>[number]>(row));
  }
 }
 return {...pick<AiLogClientFacts>(value),timing,...(parts?{parts}:{})};
}
const finishes=['STOP','MAX_TOKENS','SAFETY','RECITATION','OTHER','BLOCKLIST','PROHIBITED_CONTENT','SPII','MALFORMED_FUNCTION_CALL','LANGUAGE'];
export function readAiLogFinishReason(value:unknown):AiLogServerFacts['finishReason']|undefined{return typeof value==='string'&&finishes.includes(value)?value as AiLogServerFacts['finishReason']:undefined;}
function readServer(value:unknown,models:ReadonlySet<string>):AiLogServerFacts|undefined{
 if(!object(value)||!keys(value,['execution','usage','timing','finishReason']))return;
 let execution:AiLogServerFacts['execution'];if(value.execution!==undefined){
  if(!object(value.execution)||!keys(value.execution,['version','model','temperature','thinking','maxOutputTokens','promptId']))return;
  execution=readAiExecution(value.execution);if(!execution||!models.has(execution.model))return;
 }
 let usage:AiLogServerFacts['usage'];
 if(value.usage!==undefined){if(!object(value.usage)||!keys(value.usage,['inputTokens','outputTokens','thinkingTokens','totalTokens']))return;usage={};for(const key of ['inputTokens','outputTokens','thinkingTokens','totalTokens'] as const)if(value.usage[key]!==undefined){const token=readUsageToken(value.usage[key]);if(token===undefined)return;usage[key]=token;}}
 const t=value.timing;
 if(!object(t)||!keys(t,['clock','preparationMs','firstSendMs','admissionMs','headersMs','firstChunkMs','completeMs'])||t.clock!=='server-monotonic'||!integer(t.completeMs))return;
 for(const key of ['preparationMs','firstSendMs','admissionMs','headersMs','firstChunkMs'])if(!has(t,key,integer)||typeof t[key]==='number'&&Number(t[key])>t.completeMs)return;
 if(typeof t.preparationMs==='number'&&typeof t.firstSendMs==='number'&&(t.preparationMs>t.firstSendMs||t.admissionMs!==undefined&&t.admissionMs!==t.firstSendMs-t.preparationMs))return;
 if(typeof t.firstSendMs==='number'&&typeof t.headersMs==='number'&&t.firstSendMs>t.headersMs)return;
 if(typeof t.headersMs==='number'&&t.headersMs>t.completeMs||typeof t.firstChunkMs==='number'&&(t.firstChunkMs>t.completeMs||typeof t.headersMs==='number'&&t.firstChunkMs<t.headersMs))return;
 if(value.finishReason!==undefined&&!readAiLogFinishReason(value.finishReason))return;
 return {...(execution?{execution}:{}),...(usage?{usage}:{}),timing:pick<AiLogServerFacts['timing']>(t),...(value.finishReason?{finishReason:readAiLogFinishReason(value.finishReason)}:{})};
}
export function readAiLogTelemetry(value:unknown,kind:'request'|'chapter',models:ReadonlySet<string>):AiLogTelemetry|undefined{
 if(!object(value)||!keys(value,['metricVersion','trace','context','client','server'])||value.metricVersion!==1)return;
 const trace=value.trace===undefined?undefined:readAiLogTrace(value.trace),context=value.context===undefined?undefined:readAiLogContext(value.context);
 if(value.trace!==undefined&&!trace||value.context!==undefined&&!context)return;
 if(kind==='request'&&value.client!==undefined||kind==='chapter'&&value.server!==undefined)return;
 const client=value.client===undefined?undefined:readClient(value.client,models),server=value.server===undefined?undefined:readServer(value.server,models);
 if(value.client!==undefined&&!client||value.server!==undefined&&!server||kind==='chapter'&&(!client||!trace)||kind==='request'&&!server)return;
 return {metricVersion:1,...(trace?{trace}:{}),...(context?{context}:{}),...(client?{client}:{}),...(server?{server}:{})};
}
/** A malformed diagnostics header is discarded as a unit; translation payload is untouched. */
export function readAiLogRequestContext(raw:string|null):AiLogRequestContext|undefined{
 if(!raw||raw.length>AI_LOG_CONTEXT_MAX_BYTES||!/^[\x20-\x7e]+$/.test(raw))return;
 try{const v:unknown=JSON.parse(raw);if(!object(v)||!keys(v,['schemaVersion','trace','context'])||v.schemaVersion!==2)return;const trace=readAiLogTrace(v.trace),context=v.context===undefined?undefined:readAiLogContext(v.context);if(!trace||v.context!==undefined&&!context)return;return {schemaVersion:2,trace,...(context?{context}:{})};}catch{return;}
}
