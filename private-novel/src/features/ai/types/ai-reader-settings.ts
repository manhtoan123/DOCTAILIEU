import {db} from '../../../core/db';
import {AI_DEFAULTS,aiBookSettingsKey,queueAiSettings,readReadingAiSettings} from '../services/ai-settings';
import type {ReadingAiSettings} from './ai-settings-type';
import {normalizeAiModel} from './ai-models';
import {AI_QUALITY_ORDER} from '../services/ai-fallback';
import {DEFAULT_SECOND_HALF_PROMPT} from '../services/ai-hybrid-prompt';
import {getEligibleProfiles,readStoredPromptStock} from '../prompt/prompt-stock';
import {validatePromptSettings} from '../prompt/prompt-schema';
export const AI_COMMON_SETTINGS_KEY='ai-translate-settings';
export const READER_FIRST_MODEL='gemma-4-26b-a4b-it',READER_SECOND_MODEL='gemini-3.5-flash-lite' as const;
const rowObject=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** Runtime policy only: never migrate stored profiles, caches or book data on read. */
export function automaticAiSettings(value:unknown):ReadingAiSettings{
 const {hybrid,...settings}=readReadingAiSettings(value);return {...settings,model:value===undefined?READER_FIRST_MODEL:settings.model,modelMode:settings.modelMode??'fixed',fallbackModels:[],splitParts:settings.splitParts??true,addressingRules:settings.addressingRules??hybrid?.rules??''};
}
/** Global templates/options; each book retains its chosen prompt and hybrid switch. */
export function resolveReaderAiSettings(bookValue:unknown,commonValue:unknown):ReadingAiSettings{
 const common=automaticAiSettings(commonValue),base=automaticAiSettings(bookValue??commonValue);
 return {...base,temperature:commonValue===undefined?base.temperature:common.temperature,splitParts:readReadingAiSettings(bookValue).splitParts??common.splitParts};
}
export async function readReaderAiPreferences(bookId:string){
 const [book,common]=await Promise.all([db.settings.get(aiBookSettingsKey(bookId)),db.settings.get(AI_COMMON_SETTINGS_KEY)]);
 return {book:book?.value,common:common?.value,settings:resolveReaderAiSettings(book?.value,common?.value),chosenId:rowObject(book?.value??common?.value).chosenProfileId as string|undefined};
}
/** Display source for a book's custom prompt: its own row when present, otherwise the inherited common row. */
export function customAiDisplaySettings(bookValue:unknown,commonValue:unknown):ReadingAiSettings{
 const row=bookValue??commonValue,settings=readReadingAiSettings(row);
 return {...settings,hybrid:settings.hybrid??readReadingAiSettings((row as {chosenProfileSettings?:unknown}|undefined)?.chosenProfileSettings).hybrid};
}
/** A single settings write preserves prompt identity while changing only this book's switch. */
export function setReaderHybrid(bookId:string,enabled:boolean):Promise<ReadingAiSettings>{
 return queueAiSettings(aiBookSettingsKey(bookId),()=>db.transaction('rw',db.settings,async()=>{
  const preferences=await readReaderAiPreferences(bookId),previous=rowObject(preferences.book??preferences.common),base=readReadingAiSettings(preferences.book??preferences.common),common=readReadingAiSettings(preferences.common);
  const selected=readReadingAiSettings(previous.chosenProfileSettings).hybrid;
  const value:Record<string,unknown>={...previous,...base,hybrid:enabled?{version:1 as const,liteModel:READER_SECOND_MODEL,rules:selected?.rules??common.hybrid?.rules??base.hybrid?.rules??'',secondHalfPrompt:selected?.secondHalfPrompt??common.hybrid?.secondHalfPrompt??base.hybrid?.secondHalfPrompt??DEFAULT_SECOND_HALF_PROMPT}:undefined};
  if(!enabled)delete value.hybrid;
  await db.settings.put({key:aiBookSettingsKey(bookId),value});return resolveReaderAiSettings(value,preferences.common);
 }));
}
export function setReaderSplitParts(bookId:string,enabled:boolean):Promise<ReadingAiSettings>{
 return queueAiSettings(aiBookSettingsKey(bookId),()=>db.transaction('rw',db.settings,async()=>{
  const preferences=await readReaderAiPreferences(bookId);
  const value={...rowObject(preferences.book??preferences.common),...readReadingAiSettings(preferences.book??preferences.common),splitParts:enabled};
  await db.settings.put({key:aiBookSettingsKey(bookId),value});
  return resolveReaderAiSettings(value,preferences.common);
 }));
}
/** Model choice belongs to this reader scope, independently of the selected prompt. */
export function setReaderModel(bookId:string,model:string,modelMode?:'auto'|'fixed'):Promise<ReadingAiSettings>{
 const selected=normalizeAiModel(model);if(!selected)return Promise.reject(Error('Model không hợp lệ.'));
 return queueAiSettings(aiBookSettingsKey(bookId),()=>db.transaction('rw',db.settings,async()=>{
  const preferences=await readReaderAiPreferences(bookId);
  const value={...rowObject(preferences.book??preferences.common),...readReadingAiSettings(preferences.book??preferences.common),model:selected,modelMode:modelMode??preferences.settings.modelMode??'fixed'};
  await db.settings.put({key:aiBookSettingsKey(bookId),value});return resolveReaderAiSettings(value,preferences.common);
 }));
}
/** Select a snapshot atomically; choosing a prompt does not change the hybrid switch. */
export function selectReaderPrompt(id:string,bookId?:string):Promise<ReadingAiSettings>{
 const key=bookId?aiBookSettingsKey(bookId):AI_COMMON_SETTINGS_KEY;
 return queueAiSettings(key,()=>db.transaction('rw',db.settings,async()=>{
  const stock=await readStoredPromptStock(),profile=getEligibleProfiles(stock,bookId).find(p=>p.id===id);if(!profile||profile.id===stock.defaultProfileId)throw Error('Prompt không thuộc phạm vi này hoặc đã bị xóa.');
  const [row,common]=await Promise.all([db.settings.get(key),db.settings.get(AI_COMMON_SETTINGS_KEY)]),previous=readReadingAiSettings(row?.value);
  const template=profile.settings.hybrid??previous.hybrid;
  const model=automaticAiSettings(row?.value??common?.value).model;
  const value={...profile.settings,model,modelMode:automaticAiSettings(row?.value??common?.value).modelMode,...(bookId?{splitParts:previous.splitParts??automaticAiSettings(common?.value).splitParts}:{}),hybrid:bookId?(previous.hybrid?{...previous.hybrid,...template}:undefined):template,chosenProfileId:profile.id,chosenProfileSettings:{...profile.settings}};
  await db.settings.put({key,value});return bookId?resolveReaderAiSettings(value,common?.value):automaticAiSettings(value);
 }));
}
export const commonAiEditorDefaults=()=>({...AI_DEFAULTS,model:READER_FIRST_MODEL,splitParts:true,addressingRules:''});

/** Optimistic save for a legacy custom draft; never overwrite a remote edit. */
export function saveCustomAiDraft(bookId:string|undefined,settings:ReadingAiSettings,expected:unknown){
 const key=bookId?aiBookSettingsKey(bookId):AI_COMMON_SETTINGS_KEY,value=validatePromptSettings(settings);
 return queueAiSettings(key,()=>db.transaction('rw',db.settings,async()=>{
  const current=await db.settings.get(key);if(JSON.stringify(current?.value)!==JSON.stringify(expected))throw Error('Cài đặt đã đổi trên thiết bị khác. Bản đang soạn vẫn được giữ.');
  const previous=rowObject(current?.value);
  // A book owns its hybrid switch; editing a template does not enable it.
  const next:Record<string,unknown>={...previous,...value,...(bookId?{splitParts:readReadingAiSettings(current?.value).splitParts??automaticAiSettings((await db.settings.get(AI_COMMON_SETTINGS_KEY))?.value).splitParts}:{}),hybrid:bookId?(readReadingAiSettings(current?.value).hybrid?value.hybrid:undefined):value.hybrid};
  delete next.chosenProfileId;
  next.chosenProfileSettings={...value};
  await db.settings.put({key,value:next});return next;
 }));
}
