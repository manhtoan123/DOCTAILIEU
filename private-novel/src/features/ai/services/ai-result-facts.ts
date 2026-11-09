import type {AiTranslateClientResponse} from './ai-translate';
import {readAiDivision,type AiDivision} from './ai-division';
import {validAiTextMap,type AiTextMap} from './ai-text-map';
import {readAiExecution,type AiExecution} from './ai-execution';
/** Durable result facts only. Runtime job state never belongs in this record. */
export interface AiResultFacts {division?:AiDivision;textMap?:AiTextMap;execution?:AiExecution}
export function aiResultFacts(response?:AiTranslateClientResponse,division?:AiDivision):AiResultFacts{
 if(!response)return {};
 const map=response.textMap;
 return {division:readAiDivision(division??response.division),...(readAiExecution(response.execution)?{execution:readAiExecution(response.execution)}:{}),...(validAiTextMap(map,response.result.length)?{textMap:{version:1,sourceLength:map.sourceLength,spans:map.spans.map(s=>({sourceStart:s.sourceStart,sourceEnd:s.sourceEnd,translatedStart:s.translatedStart,translatedEnd:s.translatedEnd}))}}:{})};
}
/** Keyed by the same source/settings/Names identity as the response cache. */
export class AiResultFactsStore {
 private entries=new Map<string,AiResultFacts>();
 set(key:string,response:AiTranslateClientResponse,division?:AiDivision){this.entries.set(key,aiResultFacts(response,division));}
 get(key:string):AiResultFacts|undefined{const facts=this.entries.get(key);if(!facts)return;return {division:readAiDivision(facts.division),...(facts.execution?{execution:{...facts.execution}}:{}),...(facts.textMap?{textMap:{...facts.textMap,spans:facts.textMap.spans.map(s=>({...s}))}}:{})};}
 retain(keys:string[]){const keep=new Set(keys);for(const key of this.entries.keys())if(!keep.has(key))this.entries.delete(key);}
}
