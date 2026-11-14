import {AI_MODELS,isAiModelId} from '../types/ai-models';
import type {ReadingAiSettings} from '../types/ai-settings-type';
import {filterNamesForText,type AiTranslateClientResponse} from './ai-translate';
import type {AiReadingSource} from './ai-reading';
import {recommendedFallbackModels} from './ai-fallback';

type Names={key:string;value:string}[];
export const mayReuseCompletedAi=(settings:ReadingAiSettings)=>!settings.hybrid&&!settings.continuation;
/** Only a whole, accepted chapter may cross a model preference change. */
export const validCompletedAi=(result:AiTranslateClientResponse)=>result.finishReason==='STOP'&&!!result.result.trim()&&!result.halves&&isAiModelId(result.model);
export function completedAiCandidates(settings:ReadingAiSettings):ReadingAiSettings[]{
  if(!mayReuseCompletedAi(settings))return [settings];
  return [settings,...AI_MODELS.flatMap(({id})=>[undefined,'auto','fixed'].flatMap(modelMode=>
    [settings.fallbackModels,undefined,[],recommendedFallbackModels(id),recommendedFallbackModels(id,settings.fallbackOrder)].map(fallbackModels=>({...settings,model:id,modelMode,fallbackModels} as ReadingAiSettings))))];
}
function stable(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)]));
  return value;
}
function identity(source:AiReadingSource,settings:ReadingAiSettings,names:Names):string{
  const {model:_model,modelMode:_mode,fallbackModels:_fallback,fallbackOrder:_fallbackOrder,...contentSettings}=settings;
  return JSON.stringify(stable([source.bookId,source.id,source.revision,source.text,contentSettings,filterNamesForText(source.text,names)]));
}
/** Survives retain() during a preference change, bounded to current + next chapter.
 * Persistent cache remains authoritative after leaving the reader/reloading. */
export class AiCompletedMemory<T extends AiTranslateClientResponse>{
  private values=new Map<string,T>();
  get(source:AiReadingSource,settings:ReadingAiSettings,names:Names):T|undefined{
    return mayReuseCompletedAi(settings)?this.values.get(identity(source,settings,names)):undefined;
  }
  set(source:AiReadingSource,settings:ReadingAiSettings,names:Names,result:T){
    if(!mayReuseCompletedAi(settings)||!validCompletedAi(result))return;
    const key=identity(source,settings,names);this.values.delete(key);this.values.set(key,result);
    while(this.values.size>2)this.values.delete(this.values.keys().next().value!);
  }
  clear(){this.values.clear();}
}
