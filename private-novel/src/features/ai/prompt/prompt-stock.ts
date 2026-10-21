import {fail,object,text} from './prompt-schema';
import {DEFAULT_SECOND_HALF_PROMPT} from '../services/ai-hybrid-prompt';
import {promptStockChanged} from './prompt-sync';
import { db } from '../../../core/db';
import { AI_DEFAULTS, aiBookSettingsKey, queueAiSettings, type ReadingAiSettings } from '../services/ai-reading';


export {PROMPT_STOCK_KEY,DEFAULT_PROMPT_PROFILE_ID,validatePromptSettings} from './prompt-schema';
export type {PromptProfile,PromptStock,PromptProfileInput} from './prompt-schema';
import {PROMPT_STOCK_KEY,DEFAULT_PROMPT_PROFILE_ID,validatePromptSettings,validatePromptProfile as profile,validatePromptStock as stock,type PromptProfile,type PromptStock,type PromptProfileInput} from './prompt-schema';
/** Called only inside a settings rw transaction. Legacy values are never rewritten. */
async function readStock():Promise<PromptStock> {
  const stored=await db.settings.get(PROMPT_STOCK_KEY);if(stored)return stock(stored.value);
  const legacy=await db.settings.get('ai-translate-settings');
  const profiles:PromptProfile[]=[{id:DEFAULT_PROMPT_PROFILE_ID,title:'Mặc định',settings:legacy?validatePromptSettings(legacy.value):{...AI_DEFAULTS},updatedAt:Date.now()}];
  const books=await db.settings.where('key').startsWith('ai-book-settings:').toArray();
  for(const row of books){const bookId=text(row.key.slice('ai-book-settings:'.length),200);profiles.push({id:`legacy-book:${bookId}`,title:'Prompt đã lưu',bookId,settings:validatePromptSettings(row.value),updatedAt:Date.now()});}
  const initial=stock({version:1,profiles,defaultProfileId:DEFAULT_PROMPT_PROFILE_ID});
  await db.settings.put({key:PROMPT_STOCK_KEY,value:initial});return initial;
}
function transaction<T>(operation:(value:PromptStock)=>Promise<T>):Promise<T> {
  return queueAiSettings(PROMPT_STOCK_KEY,()=>db.transaction('rw',db.settings,async()=>operation(await readStock())));
}
export function getPromptStock():Promise<PromptStock>{return transaction(async value=>value);}
/** Read-only subscription path; initialize with getPromptStock outside liveQuery. */
export async function readStoredPromptStock():Promise<PromptStock>{
  const row=await db.settings.get(PROMPT_STOCK_KEY);if(!row)return fail();return stock(row.value);
}
export function getEligibleProfiles(value:PromptStock,bookId?:string):PromptProfile[]{return value.profiles.filter(p=>p.bookId===undefined||(bookId!==undefined&&p.bookId===bookId));}
async function save(value:PromptStock,input:PromptProfileInput,expected?:PromptProfile):Promise<PromptProfile>{
  const old=input.id?value.profiles.find(p=>p.id===input.id):undefined;
  if(input.id&&(!old||old.id===value.defaultProfileId))throw new Error('Không sửa được prompt mặc định hoặc prompt đã xóa.');
  if(expected&&JSON.stringify(old)!==JSON.stringify(expected))throw new Error('Prompt đã thay đổi trên thiết bị khác. Bản đang soạn được giữ; hãy mở lại prompt trước khi lưu.');
  if(old&&old.bookId!==input.bookId)throw new Error('Không đổi phạm vi khi sửa prompt; hãy nhân bản.');
  const next=profile({...input,id:input.id??crypto.randomUUID(),updatedAt:Date.now()});
  const profiles=old?value.profiles.map(p=>p.id===next.id?next:p):[...value.profiles,next];
  await db.settings.put({key:PROMPT_STOCK_KEY,value:stock({...value,profiles})});return next;
}
export function savePromptProfile(input:PromptProfileInput,expected?:PromptProfile):Promise<PromptProfile>{return transaction(value=>save(value,input,expected)).then(value=>{promptStockChanged();return value;});}
export function copyPromptProfile(id:string,title:string,bookId?:string):Promise<PromptProfile>{return transaction(async value=>{
  const source=value.profiles.find(p=>p.id===id);if(!source)throw new Error('Prompt đã bị xóa.');
  return save(value,{title,bookId,settings:{...source.settings}});
}).then(value=>{promptStockChanged();return value;});}
function same(a:ReadingAiSettings,b:ReadingAiSettings):boolean{return a.systemPrompt===b.systemPrompt&&a.userPromptTemplate===b.userPromptTemplate&&a.model===b.model&&a.temperature===b.temperature&&a.addressingRules===b.addressingRules&&JSON.stringify(a.fallbackModels)===JSON.stringify(b.fallbackModels)&&(!a.hybrid||!b.hybrid||a.hybrid.rules===b.hybrid.rules&&(a.hybrid.secondHalfPrompt??DEFAULT_SECOND_HALF_PROMPT)===(b.hybrid.secondHalfPrompt??DEFAULT_SECOND_HALF_PROMPT));}
function selectedValue(p:PromptProfile,previous?:ReadingAiSettings,bookSwitch=true){return {...p.settings,...(previous?{...(bookSwitch?{splitParts:previous.splitParts}:{}),hybrid:bookSwitch?(previous.hybrid?{...previous.hybrid,...p.settings.hybrid}:undefined):p.settings.hybrid??previous.hybrid}:{}),chosenProfileId:p.id,chosenProfileSettings:{...p.settings}};}
/** Caller owns a settings rw transaction. Refresh selected profiles, preserve manual overrides. */
export async function applySharedPromptStock(next:PromptStock):Promise<void>{
  next=stock(next);const fallback=next.profiles.find(p=>p.id===next.defaultProfileId)!;
  const rows=await db.settings.where('key').startsWith('ai-book-settings:').toArray(),common=await db.settings.get('ai-translate-settings');if(common)rows.push(common);
  for(const row of rows){
    const value=object(row.value);if(typeof value.chosenProfileId!=='string')continue;
    const selected=next.profiles.find(p=>p.id===value.chosenProfileId&&(p.bookId===undefined||p.bookId===row.key.slice('ai-book-settings:'.length)));
    if(value.chosenProfileSettings&&same(validatePromptSettings(value),validatePromptSettings(value.chosenProfileSettings)))await db.settings.put({key:row.key,value:selectedValue(selected??fallback,validatePromptSettings(value),row.key!=='ai-translate-settings')});
    else if(!selected){const {chosenProfileId:_id,chosenProfileSettings:_settings,...rest}=value;await db.settings.put({key:row.key,value:rest});}
  }
  await db.settings.put({key:PROMPT_STOCK_KEY,value:next});
}
export function selectPromptProfile(bookId:string,id:string):Promise<ReadingAiSettings>{
  text(bookId,200);return queueAiSettings(aiBookSettingsKey(bookId),()=>transaction(async value=>{
    const p=getEligibleProfiles(value,bookId).find(p=>p.id===id);if(!p)throw new Error('Prompt không thuộc truyện này hoặc đã bị xóa.');
    await db.settings.put({key:aiBookSettingsKey(bookId),value:selectedValue(p)});return {...p.settings};
  }));
}
export async function getBookPromptSelection(bookId:string):Promise<string|undefined>{
  const row=await db.settings.get(aiBookSettingsKey(bookId));if(!row)return undefined;
  const value=object(row.value);if(typeof value.chosenProfileId!=='string'||!value.chosenProfileSettings)return undefined;
  return same(validatePromptSettings(value),validatePromptSettings(value.chosenProfileSettings))?value.chosenProfileId:undefined;
}
export function deletePromptProfile(id:string):Promise<void>{return transaction(async value=>{
  if(id===value.defaultProfileId)throw new Error('Không xóa prompt mặc định.');
  if(!value.profiles.some(p=>p.id===id))return;
  const fallback=value.profiles.find(p=>p.id===value.defaultProfileId)!;
  const books=await db.settings.where('key').startsWith('ai-book-settings:').toArray(),common=await db.settings.get('ai-translate-settings');if(common)books.push(common);
  for(const row of books){const v=object(row.value);if(v.chosenProfileId!==id)continue;
    const current=validatePromptSettings(v);
    if(v.chosenProfileSettings&&same(current,validatePromptSettings(v.chosenProfileSettings)))await db.settings.put({key:row.key,value:selectedValue(fallback,current,row.key!=='ai-translate-settings')});
    else {const {chosenProfileId:_id,chosenProfileSettings:_settings,...rest}=v;await db.settings.put({key:row.key,value:rest});}
  }
  await db.settings.put({key:PROMPT_STOCK_KEY,value:{...value,profiles:value.profiles.filter(p=>p.id!==id)}});
}).then(()=>{promptStockChanged();});}
