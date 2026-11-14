import {AI_MODELS,normalizeAiModel} from '../types/ai-models';
import {AiTranslateClientError} from './ai-translate';
import {isTransientAiFailure} from './ai-recovery';
import type {ReadingAiSettings} from '../types/ai-settings-type';
import {isHybridLiteModel} from './ai-hybrid-prompt';
/** Quality order explicitly requested by the user; no provider change/fan-out. */
export const AI_QUALITY_ORDER=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash','gemini-2.5-flash','qwen/qwen3.8-27b','gemini-3.5-flash-lite','gemma-4-26b-a4b-it','gemini-3-flash-preview'] as const;
export const DEFAULT_AI_FALLBACK_ORDER=[...AI_QUALITY_ORDER,...AI_MODELS.map(({id})=>id).filter(id=>!(AI_QUALITY_ORDER as readonly string[]).includes(id))];
export function normalizeAiFallbackOrder(value:unknown):string[]{
 const allowed=new Set<string>(AI_MODELS.map(({id})=>id)),order=Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'&&allowed.has(id)):[];
 return [...new Set([...order,...DEFAULT_AI_FALLBACK_ORDER])];
}
export function recommendedFallbackModels(model:string,order:readonly string[]=DEFAULT_AI_FALLBACK_ORDER):string[]{
 if(order!==DEFAULT_AI_FALLBACK_ORDER){const normalized=normalizeAiFallbackOrder(order),index=normalized.indexOf(model);return index<0?normalized.filter(id=>id!==model):[...normalized.slice(index+1),...normalized.slice(0,index)];}
 const index=AI_QUALITY_ORDER.findIndex(candidate=>candidate===model);
 return index>=0?AI_QUALITY_ORDER.slice(index+1):['gemini-2.5-flash','qwen/qwen3.8-27b','gemini-3.5-flash-lite','gemini-3-flash-preview'];
}
export function readingAiModels(settings:Pick<ReadingAiSettings,'model'|'modelMode'|'fallbackModels'|'fallbackOrder'|'continuation'|'hybrid'>):string[]{return [...new Set([settings.model,...(settings.modelMode==='fixed'?[]:settings.modelMode==='auto'?recommendedFallbackModels(settings.model,settings.fallbackOrder??DEFAULT_AI_FALLBACK_ORDER):(settings.fallbackModels??recommendedFallbackModels(settings.model,settings.fallbackOrder??DEFAULT_AI_FALLBACK_ORDER)))].filter(m=>!settings.hybrid||!isHybridLiteModel(m)).map(m=>settings.continuation&&isHybridLiteModel(m)?m:normalizeAiModel(m)??m))];}
export function validReadingResult(result:import('./ai-translate').AiTranslateClientResponse,settings:ReadingAiSettings):boolean{
 const models=readingAiModels(settings);
 if(result.model!=='hybrid')return !result.halves&&models.includes(result.model);
 const h=result.halves;return !!settings.hybrid&&h?.version===1&&Array.isArray(h.models)&&h.models.length===2&&models.includes(h.models[0])&&h.models[1]===settings.hybrid.liteModel&&typeof h.sampleHash==='string'&&/^[a-f0-9]{64}$/.test(h.sampleHash);
}
export const readingPartModels=(settings:ReadingAiSettings)=>[...readingAiModels(settings),...(settings.hybrid?[settings.hybrid.liteModel]:[])];
export function mayFallbackModel(error:unknown,immediate=false):error is AiTranslateClientError{return error instanceof AiTranslateClientError&&error.code==='ai_provider_unavailable'||isTransientAiFailure(error)||immediate&&error instanceof AiTranslateClientError&&(error.code==='ai_untranslated_result'||error.code==='ai_empty_result'||error.code==='ai_incomplete_result'&&error.reason==='output_limit')||error instanceof AiTranslateClientError&&['ai_upstream_error','ai_invalid_model'].includes(error.code)&&error.status===404;}
