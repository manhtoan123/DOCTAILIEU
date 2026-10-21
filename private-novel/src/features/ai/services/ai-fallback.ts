import {normalizeAiModel} from '../types/ai-models';
import {AiTranslateClientError} from './ai-translate';
import {isTransientAiFailure} from './ai-recovery';
import type {ReadingAiSettings} from '../types/ai-settings-type';
import {isHybridLiteModel} from './ai-hybrid-prompt';
/** Quality order explicitly requested by the user; no provider change/fan-out. */
export const AI_QUALITY_ORDER=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash','gemma-4-26b-a4b-it','gemini-2.5-flash','gemini-3-flash-preview'] as const;
export function recommendedFallbackModels(model:string):string[]{
 const index=AI_QUALITY_ORDER.findIndex(candidate=>candidate===model);
 return index>=0?AI_QUALITY_ORDER.slice(index+1):['gemini-2.5-flash','gemini-3-flash-preview'];
}
export function readingAiModels(settings:Pick<ReadingAiSettings,'model'|'fallbackModels'|'continuation'|'hybrid'>):string[]{return [...new Set([settings.model,...(settings.fallbackModels??recommendedFallbackModels(settings.model))].filter(m=>!settings.hybrid||!isHybridLiteModel(m)).map(m=>settings.continuation&&isHybridLiteModel(m)?m:normalizeAiModel(m)??m))];}
export function validReadingResult(result:import('./ai-translate').AiTranslateClientResponse,settings:ReadingAiSettings):boolean{
 const models=readingAiModels(settings);
 if(result.model!=='hybrid')return !result.halves&&models.includes(result.model);
 const h=result.halves;return !!settings.hybrid&&h?.version===1&&Array.isArray(h.models)&&h.models.length===2&&models.includes(h.models[0])&&h.models[1]===settings.hybrid.liteModel&&typeof h.sampleHash==='string'&&/^[a-f0-9]{64}$/.test(h.sampleHash);
}
export const readingPartModels=(settings:ReadingAiSettings)=>[...readingAiModels(settings),...(settings.hybrid?[settings.hybrid.liteModel]:[])];
export function mayFallbackModel(error:unknown):error is AiTranslateClientError{return isTransientAiFailure(error)||error instanceof AiTranslateClientError&&['ai_upstream_error','ai_invalid_model'].includes(error.code)&&error.status===404;}
