import type {ReadingAiSettings} from '../types/ai-settings-type';
import {normalizeAiModel} from '../types/ai-models';
import {readAiHybrid} from '../services/ai-hybrid-prompt';
export const PROMPT_STOCK_KEY = 'prompt-stock-v1';
export const DEFAULT_PROMPT_PROFILE_ID = 'default';
export interface PromptProfile { id:string; title:string; bookId?:string; settings:ReadingAiSettings; updatedAt:number }
export interface PromptStock { version:1; profiles:PromptProfile[]; defaultProfileId:string }
export interface PromptProfileInput { id?:string; title:string; bookId?:string; settings:ReadingAiSettings }
export function fail():never { throw new Error('Kho prompt không hợp lệ; dữ liệu đã lưu được giữ nguyên.'); }
export const object = (v:unknown):Record<string,unknown> => v && typeof v==='object' && !Array.isArray(v) ? v as Record<string,unknown> : fail();
export function text(v:unknown,max:number):string { return typeof v==='string' && v.trim() && v.length<=max && !/[\u0000-\u001f]/.test(v) ? v : fail(); }
export function validatePromptSettings(value:unknown):ReadingAiSettings {
  const v=object(value);
  const model=normalizeAiModel(v.model);
  if(model===undefined)fail();
  if(typeof v.systemPrompt!=='string'||v.systemPrompt.length>8000||typeof v.userPromptTemplate!=='string'||v.userPromptTemplate.length>8000||!v.userPromptTemplate.includes('{{text}}')||typeof v.temperature!=='number'||!Number.isFinite(v.temperature)||v.temperature<0||v.temperature>1)fail();
  if(v.modelMode!==undefined&&v.modelMode!=='auto'&&v.modelMode!=='fixed')fail();
  let fallbackModels:string[]|undefined;
  if(v.fallbackModels!==undefined){if(!Array.isArray(v.fallbackModels)||v.fallbackModels.length>3)fail();fallbackModels=v.fallbackModels.map(m=>normalizeAiModel(m)??fail());if(fallbackModels.includes(model)||new Set(fallbackModels).size!==fallbackModels.length)fail();}
  if(v.splitParts!==undefined&&typeof v.splitParts!=='boolean')fail();
  if(v.addressingRules!==undefined&&(typeof v.addressingRules!=='string'||v.addressingRules.length>2000))fail();
  const hybrid=v.hybrid===undefined?undefined:readAiHybrid(v.hybrid);
  if(v.hybrid!==undefined&&!hybrid)fail();
  return {systemPrompt:v.systemPrompt as string,userPromptTemplate:v.userPromptTemplate as string,model,...(v.modelMode===undefined?{}:{modelMode:v.modelMode as 'auto'|'fixed'}),temperature:v.temperature as number,...(fallbackModels===undefined?{}:{fallbackModels}),...(hybrid?{hybrid}:{}),...(v.splitParts===undefined?{}:{splitParts:v.splitParts as boolean}),...(v.addressingRules===undefined?{}:{addressingRules:v.addressingRules as string})};
}
export function validatePromptProfile(value:unknown):PromptProfile {
  const v=object(value);const id=text(v.id,300),title=text(v.title,120),bookId=v.bookId===undefined?undefined:text(v.bookId,200);
  if(typeof v.updatedAt!=='number'||!Number.isSafeInteger(v.updatedAt)||v.updatedAt<0)fail();
  return {id,title,...(bookId===undefined?{}:{bookId}),settings:validatePromptSettings(v.settings),updatedAt:v.updatedAt as number};
}
export function validatePromptStock(value:unknown):PromptStock {
  const v=object(value);if(v.version!==1||!Array.isArray(v.profiles)||v.profiles.length<1||v.profiles.length>500)fail();
  const profiles=(v.profiles as unknown[]).map(validatePromptProfile),ids=new Set(profiles.map(p=>p.id));
  const defaultProfileId=text(v.defaultProfileId,300);
  if(ids.size!==profiles.length||defaultProfileId!==DEFAULT_PROMPT_PROFILE_ID||!profiles.some(p=>p.id===defaultProfileId&&p.bookId===undefined))fail();
  return {version:1,profiles,defaultProfileId};
}
