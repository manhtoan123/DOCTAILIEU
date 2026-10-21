import {resetIdleAiCapacity} from './ai-scheduler';
import {aiTranslate,filterNamesForText,assertAiTranslationCoverage,type AiLeaseInfo,AiTranslateClientError,type AiTranslateClientResponse,type AiTranslateClientRequest} from './ai-translate';
import {hasCopiedSource} from './ai-source-copy';
import {nameSourceKey} from '../../names-convert/services/name-images';
import {AiRecovery} from './ai-recovery';
import {readingAiModels,mayFallbackModel,validReadingResult} from './ai-fallback';
import {translateComplete,aiRecoveryCut,type AiCompletionCheckpoint} from './ai-complete';
import {aiUserPromptPreview,isHybridLiteModel,hybridTemplateValid,DEFAULT_SECOND_HALF_PROMPT} from './ai-hybrid-prompt';
import {runHybridStages,hybridResult,type HybridMemory} from './ai-hybrid';
import {AiChapterJob,AI_CHAPTER_LIMITS,EPUB_AI_CHAPTER_LIMITS,createAiChapterBudget,resumeAiChapterBudget,type AiChapterBudget,optionalAiCache,AI_CACHE_READ_MS,AI_CACHE_WRITE_MS} from './ai-job';
import {splitAiText,runAiParts,aiQuotaFeedback,withAiRequestCapacity,AI_TEXT_REQUEST_CHARS,type AiPart,type AiPartsControl,type AiPartsProgress,type AiPartRecord} from './ai-parts';
export type {ReadingAiSettings} from '../types/ai-settings-type';
import type {ReadingAiSettings} from '../types/ai-settings-type';
import {AiRunMetrics} from './ai-metrics';
export {AI_DEFAULTS,aiBookSettingsKey,queueAiSettings,readReadingAiSettings} from './ai-settings';
export interface AiReadingSource {bookId:string;id:string;revision:number;text:string}
export interface AiReadingRequestOptions {automatic?:boolean;isPrewarm?:boolean;onLease?:(lease:AiLeaseInfo)=>void}
/** Wrapper used by tests/Reader: optional third argument carries safe lease evidence. */
export type AiReadingTranslate=(input:AiTranslateClientRequest,signal:AbortSignal,onLease?:(lease:AiLeaseInfo)=>void)=>Promise<AiTranslateClientResponse>;
export interface AiReadingCache {
  read:(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],signal?:AbortSignal)=>Promise<AiTranslateClientResponse|undefined>;
  write:(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],result:AiTranslateClientResponse,signal?:AbortSignal)=>Promise<boolean>;
  readParts?:(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],plan:string,signal?:AbortSignal,legacyIdentity?:boolean)=>Promise<AiPartRecord[]>;
  writePart?:(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],plan:string,id:string,result:AiTranslateClientResponse,signal?:AbortSignal)=>Promise<boolean>;
}
export function aiReadingKey(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[]):string{
  const effective=settings.hybrid?{...settings,hybridProtocol:3,hybrid:{...settings.hybrid,secondHalfPrompt:settings.hybrid.secondHalfPrompt??DEFAULT_SECOND_HALF_PROMPT}}:settings;
  return JSON.stringify([source.bookId,source.id,source.revision,source.text,effective,settings.continuation||settings.hybrid?names:filterNamesForText(source.text,names)]);
}
/** Current and next chapter; ordered part previews, complete-only cache and model fallback. */
export class AiReadingSession {
  private recovery=new AiRecovery();
  private modelBusyUntil=new Map<string,number>();
  private cache=new Map<string,AiTranslateClientResponse>();
  private parts=new Map<string,Map<string,AiTranslateClientResponse>>();
  private partPlans=new Map<string,{parts:AiPart[];plan:string}>();
  private progress=new Map<string,AiPartsProgress>();
  private listeners=new Map<string,Set<(state:AiPartsProgress)=>void>>();
  private pending=new Map<string,{controller:AbortController;promise:Promise<AiTranslateClientResponse>}>();
  private capacity?:{model:string;until:number};
  private budgets=new Map<string,AiChapterBudget>();
  private hybridMemory=new Map<string,HybridMemory>();
  constructor(private translate:AiReadingTranslate=aiTranslate,private persisted?:AiReadingCache,private onQuota?:(delay:number,pause:boolean)=>void,private observeMetrics=true,sharedRecovery?:AiRecovery,private sharedControl?:AiPartsControl){if(sharedRecovery)this.recovery=sharedRecovery;}
  retain(keys:string[]){const keep=new Set(keys);for(const [key,job] of this.pending)if(!keep.has(key)){job.controller.abort();this.pending.delete(key);}for(const map of [this.cache,this.parts,this.partPlans,this.progress,this.listeners,this.budgets,this.hybridMemory])for(const key of map.keys())if(!keep.has(key))map.delete(key);}
  get(key:string){return this.cache.get(key);}
  retryDeadline(key:string){return this.budgets.get(key)?.deadline;}
  cancel(key:string){const job=this.pending.get(key);job?.controller.abort();this.pending.delete(key);this.listeners.delete(key);}
  request(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],validate?:(result:AiTranslateClientResponse)=>void,onModel?:(model:string)=>void,onProgress?:(state:AiPartsProgress)=>void,options:AiReadingRequestOptions={}){
    if(this.sharedControl)resetIdleAiCapacity(this.sharedControl);
    source={...source};settings={...settings,...(settings.hybrid?{hybrid:{...settings.hybrid}}:{}),...(settings.continuation?{continuation:{...settings.continuation}}:{}),...(settings.fallbackModels?{fallbackModels:[...settings.fallbackModels]}:{})};names=names.map(name=>({...name}));
    if(source.text.length>128000)return Promise.reject(new Error('Chương vượt giới hạn 128.000 ký tự.'));
    if(!source.text.trim())return Promise.reject(new AiTranslateClientError('text_empty','Văn bản dịch không được để trống.'));
    if(settings.hybrid&&(isHybridLiteModel(settings.model)||!hybridTemplateValid(settings.userPromptTemplate)))return Promise.reject(new AiTranslateClientError('invalid_prompt','Dịch kết hợp cần model ưu tiên cho nửa đầu và đúng một {{text}}.'));
    const key=aiReadingKey(source,settings,names),cached=this.cache.get(key);if(cached){validate?.(cached);return Promise.resolve(cached);}
    if(onProgress){let listeners=this.listeners.get(key);if(!listeners)this.listeners.set(key,listeners=new Set());listeners.add(onProgress);const progress=this.progress.get(key);if(progress)onProgress(progress);}
    const old=this.pending.get(key);if(old)return validate?old.promise.then(result=>{validate(result);return result;}):old.promise;
    const limits=!validate&&source.text.length>1800?EPUB_AI_CHAPTER_LIMITS:AI_CHAPTER_LIMITS,budget=options.automatic&&this.budgets.get(key)||createAiChapterBudget(limits);this.budgets.set(key,budget);if(options.automatic)resumeAiChapterBudget(budget);
    const job=new AiChapterJob(limits,validate||!this.observeMetrics?undefined:new AiRunMetrics('txt',source.text.length,budget),budget),controller=job.controller;
    const models=readingAiModels(settings);
    const control:AiPartsControl=this.sharedControl??{throttled:false,waitUntil:0},quota=(delay:number)=>{job.check();this.capacity=undefined;const pause=!!pinned||models.length===1;if(pause)aiQuotaFeedback(control,delay);else{control.throttled=true;control.changed?.();}this.onQuota?.(delay,pause);};
    let pinned:string|undefined;
    const requestLease=options.onLease;
    const send=async(text=source.text,context?:string,checkpoint?:AiCompletionCheckpoint,onLease?:(lease:AiLeaseInfo)=>void)=>{
      const leaseNotify=onLease??requestLease;
      const choices=pinned?[pinned]:models,available=choices.filter(model=>(this.modelBusyUntil.get(model)??0)<=Date.now());
      if(!available.length){const delay=Math.max(1,Math.min(...choices.map(model=>(this.modelBusyUntil.get(model)??Date.now())-Date.now())));throw new AiTranslateClientError('ai_rate_limited','Các model đang chờ; sẽ tự thử lại.',429,'cooldown',undefined,undefined,delay);}
      let lastError:unknown;
      for(const model of available){
        // Earlier models fail over promptly. Once the final model has split a long
        // request, retry its failing child in place so completed siblings are kept.
        // Full-source overload still makes one attempt per model; no split/fan-out.
        try{job.check();onModel?.(model);const result=await translateComplete({text,...settings,model,...(settings.hybrid?.rules&&!settings.continuation?{addressingRules:settings.hybrid.rules}:{}),...(context?{context}: {}),names:filterNamesForText(settings.continuation?names.map(n=>nameSourceKey(n.key)).join('\n'):text,names)},controller.signal,input=>this.recovery.run(model,controller.signal,()=>withAiRequestCapacity(control,controller.signal,()=>job.send(()=>this.translate(input,controller.signal,leaseNotify),JSON.stringify(input)),options.isPrewarm?100:0),input.text.length<400,choices.length===1||model===available.at(-1)&&input.text.length<text.length?2:0,quota),validate?'none':model===available.at(-1)?choices.length>1?'timeout':true:false,checkpoint);if(result.parallel===2&&!control.throttled)this.capacity={model:result.model,until:Date.now()+60000};return result;}
        catch(error){if(this.capacity?.model===model)this.capacity=undefined;if(controller.signal.aborted||!mayFallbackModel(error)||choices.length===1||pinned)throw error;lastError=error;this.modelBusyUntil.set(model,Date.now()+Math.max(15000,error.retryAfterMs??15000));}
      }
      if(lastError instanceof AiTranslateClientError)throw new AiTranslateClientError(lastError.code,lastError.message,lastError.status,lastError.reason,lastError.requestId,lastError.durationMs,Math.max(1,Math.min(...models.map(model=>(this.modelBusyUntil.get(model)??Date.now())-Date.now()))));
      throw lastError;
    };
    const planned=async()=>{
      if(settings.hybrid&&!validate&&source.text.length>1800){
        const cut=aiRecoveryCut(source.text,names.map(n=>nameSourceKey(n.key)));if(cut<=0||cut>=source.text.length)throw Error('Không thể chia hai nửa an toàn.');
        let memory=this.hybridMemory.get(key);if(!memory)this.hybridMemory.set(key,memory=new Map());
        const relevant=Object.entries(filterNamesForText(source.text,names)).map(([key,value])=>({key,value})),sessions:AiReadingSession[]=[];
        const abort=()=>sessions.forEach(s=>s.clear());controller.signal.addEventListener('abort',abort,{once:true});
        let firstPartCount=1;
        const emit=(stage:0|1,state:AiPartsProgress,first?:AiTranslateClientResponse)=>{
          job.check();const progress={...state,half:(stage+1) as 1|2,halfModels:first?[first.model,settings.hybrid!.liteModel] as [string,string]:undefined,sample:first?.result,text:stage?first!.result+'\n'+state.text:state.text};
          if(progress.text.length>512000)throw Error('Bản dịch vượt giới hạn hiển thị.');
          if(stage===0)firstPartCount=state.total;job.metrics?.progress(progress.done+(stage?firstPartCount:0),progress.total+(stage?firstPartCount:0),progress.text,progress.recoveryPasses);this.progress.set(key,progress);for(const listener of this.listeners.get(key)||[])listener(progress);
        };
        try{const [first,second,hash]=await runHybridStages(source,settings,relevant,JSON.stringify(['txt',cut]),memory,this.persisted,controller.signal,source.text.slice(0,cut),async(index,selected,cache,publish)=>{
          let latest:AiPartsProgress|undefined,promptPreview:string|undefined;const progress=(state:AiPartsProgress)=>{latest=state;publish({...state,...(promptPreview?{promptPreview}:{})});};
          const session=new AiReadingSession((input,signal)=>{job.check();if(input.continuation){promptPreview=aiUserPromptPreview(input);if(latest)progress(latest);}return job.send(()=>this.translate(input,signal),JSON.stringify(input));},cache,this.onQuota,false,this.recovery);sessions.push(session);
          return session.request({...source,text:index?source.text.slice(cut):source.text.slice(0,cut)},selected,relevant,undefined,onModel,progress);
        },emit);const result=hybridResult(first,second,hash);if(result.result.length>512000)throw Error('Bản dịch vượt giới hạn hiển thị.');return result;}finally{controller.signal.removeEventListener('abort',abort);abort();}
      }
      const protectedKeys=names.map(n=>nameSourceKey(n.key));if(validate)return send();
      const remembered=this.partPlans.get(key);let parts=remembered?.parts??splitAiText(source.text,protectedKeys,settings.splitParts?1800:AI_TEXT_REQUEST_CHARS),plan=remembered?.plan??JSON.stringify([settings.splitParts?'txt-parallel-1':'txt-whole-1',parts.map(p=>[p.start,p.end])]);
      let completed=this.parts.get(key);if(!completed)this.parts.set(key,completed=new Map());
      const usable=(rows:AiPartRecord[],targets:AiPart[])=>rows.filter(row=>/^\d{1,4}(?:\/[01]){0,3}$/.test(row.id)&&targets.some(p=>p.id===row.id.split('/')[0])&&row.response.finishReason==='STOP'&&row.response.result.trim()&&models.includes(row.response.model)&&!hasCopiedSource(source.text,row.response.result,names.map(n=>n.value)));
      if(this.persisted?.readParts){
        let legacy:AiPart[]|undefined;try{if(!remembered)legacy=splitAiText(source.text,protectedKeys);}catch{/* Optional legacy layout must not prevent a valid whole request. */}
        const legacyPlan=legacy&&JSON.stringify(['txt-parts-2',legacy.map(p=>[p.start,p.end])]),collected={rows:[] as AiPartRecord[],old:[] as AiPartRecord[]};
        const found=await optionalAiCache(controller.signal,AI_CACHE_READ_MS,collected,async signal=>{
          const read=()=>this.persisted!.readParts!(source,settings,names,plan,signal),old=()=>legacyPlan?this.persisted!.readParts!(source,settings,names,legacyPlan,signal):Promise.resolve([]);
          await Promise.allSettled([Promise.resolve().then(read).then(rows=>{if(!signal.aborted)collected.rows=rows;}),Promise.resolve().then(old).then(rows=>{if(!signal.aborted)collected.old=rows;})]);return collected;
        });job.check();let rows=usable(found.rows,parts);
        if(!remembered&&!rows.length&&legacy&&legacyPlan){const old=usable(found.old,legacy);if(old.length){parts=legacy;plan=legacyPlan;rows=old;}}
        for(const row of rows)completed.set(row.id,row.response);
      }
      this.partPlans.set(key,{parts,plan});
      pinned=completed.get('0')?.model??completed.values().next().value?.model;if(pinned)for(const [id,result] of completed)if(result.model!==pinned)completed.delete(id);
      const warm=this.capacity&&this.capacity.until>Date.now()&&(pinned??models[0])===this.capacity.model&&(this.modelBusyUntil.get(this.capacity.model)??0)<=Date.now();if(warm)pinned??=this.capacity!.model;
      const save=async(id:string,result:AiTranslateClientResponse)=>{job.check();if(pinned&&pinned!==result.model)throw Error('Model thay đổi trong khi phục hồi.');pinned??=result.model;completed.set(id,result);if(this.persisted?.writePart)await optionalAiCache(controller.signal,AI_CACHE_WRITE_MS,false,signal=>this.persisted!.writePart!(source,settings,names,plan,id,result,signal));};
      const result=await runAiParts(parts,controller.signal,completed,async(part,onLease)=>{const response=await send(part.text,part.context,{id:part.id,completed,save,protectedKeys},onLease);pinned??=response.model;return response;},state=>{job.check();if(state.text.length>512000)throw Error('Bản dịch vượt giới hạn hiển thị.');job.metrics?.progress(state.done,state.total,state.text,state.recoveryPasses);this.progress.set(key,state);for(const listener of this.listeners.get(key)||[])listener(state);},(part,result)=>save(part.id,result),undefined,warm?2:1,control,`${source.bookId}/${source.id}`);
      if(result.result.length>512000)throw Error('Bản dịch vượt giới hạn hiển thị.');return result;
    };
    let persistedHit=false;
    const promise=job.run(()=>{
    const work=this.persisted?optionalAiCache(controller.signal,AI_CACHE_READ_MS,undefined,signal=>this.persisted!.read(source,settings,names,signal)).then(cached=>{job.check();const usable=cached&&!hasCopiedSource(source.text,cached.result,names.map(n=>n.value))?cached:undefined;persistedHit=!!usable;if(usable)job.metrics?.cache();return usable??planned();}):planned();
    return work.then(async result=>{
      job.check();
      if(controller.signal.aborted||this.pending.get(key)?.controller!==controller)throw new DOMException('Cancelled','AbortError');
      if(result.finishReason!=='STOP'||!result.result.trim()||!validReadingResult(result,settings))throw new Error('Bản dịch chưa hoàn chỉnh hoặc sai model.');
      assertAiTranslationCoverage({text:source.text,names:Object.fromEntries(names.map(n=>[n.key,n.value]))},result);
      validate?.(result);
      if(this.persisted&&!persistedHit)await optionalAiCache(controller.signal,AI_CACHE_WRITE_MS,false,signal=>this.persisted!.write(source,settings,names,result,signal));
      job.check();
      if(controller.signal.aborted||this.pending.get(key)?.controller!==controller)throw new DOMException('Cancelled','AbortError');
      this.cache.set(key,result);return result;
    });
    }).finally(()=>{if(this.pending.get(key)?.controller===controller){this.pending.delete(key);this.listeners.delete(key);}});
    this.pending.set(key,{controller,promise});return promise;
  }
  clear(){this.retain([]);}
}

