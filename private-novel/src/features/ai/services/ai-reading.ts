import {AiResultFactsStore} from './ai-result-facts';
import {aiTreeFacts,hasUnknownAiParts} from './ai-leaf-progress';
import {aiDivisionAt,combineAiDivision,type AiDivision,type AiDivisionReason} from './ai-division';
import {AI_TOOL_REQUEST_LIMIT,resetIdleAiCapacity,type AiRequestLimit} from './ai-scheduler';
import {aiTranslate,filterNamesForText,assertAiTranslationCoverage,type AiLeaseInfo,AiTranslateClientError,type AiTranslateClientResponse,type AiTranslateClientRequest} from './ai-translate';
import {nameSourceKey} from '../../names-convert/services/name-images';
import {AiRecovery} from './ai-recovery';
import {readingAiModels,readingPartModels,mayFallbackModel,validReadingResult} from './ai-fallback';
import {supportsAiTemperature} from '../types/ai-models';
import {translateComplete,aiRecoveryCut,type AiCompletionCheckpoint} from './ai-complete';
import {aiUserPromptPreview,isHybridLiteModel,hybridTemplateValid,DEFAULT_SECOND_HALF_PROMPT} from './ai-hybrid-prompt';
import {runHybridStages,hybridResult,type HybridMemory} from './ai-hybrid';
import {aiCompletedPrefix} from './ai-part-prefix';
import {planPolishText,formatPolishPairs,polishPairsInRange,polishPairCut,acceptedPolishText,type PolishPair} from './convert-polish';
import {planAiText,AI_WHOLE_CHAPTER_CHARS} from './ai-output-plan';
import {maySkipPolishPart,readPolishOutput,type PolishFallbackRange} from './polish-output';
import {AiChapterJob,AI_CHAPTER_LIMITS,EPUB_AI_CHAPTER_LIMITS,selectAiChapterBudget,type AiChapterBudget,optionalAiCache,AI_CACHE_READ_MS,AI_CACHE_WRITE_MS} from './ai-job';
import {splitAiText,runAiParts,aiQuotaFeedback,withAiRequestCapacity,AI_TEXT_REQUEST_CHARS,type AiPart,type AiPartsControl,type AiPartsProgress,type AiPartRecord,type PolishPartsResume} from './ai-parts';
import {AiJobHandoff} from './ai-job-handoff';
import {AiCompletedMemory,mayReuseCompletedAi,validCompletedAi} from './ai-completed-reuse';
export type {ReadingAiSettings} from '../types/ai-settings-type';
import type {ReadingAiSettings} from '../types/ai-settings-type';
import {AiRunMetrics,aiMetricPartPath,aiFallbackCause} from './ai-metrics';
export {AI_DEFAULTS,aiBookSettingsKey,queueAiSettings,readReadingAiSettings} from './ai-settings';
export interface AiReadingSource {bookId:string;id:string;revision:number;text:string;/** Paired editorial data; text and progress offsets remain Convert. */polishPairs?:PolishPair[];polishPreserveLines?:boolean}
export interface AiReadingRequestOptions {/** Internal parent work correlation, excluded from cache identity. */logMetrics?:AiRunMetrics;logPartPath?:string;automatic?:boolean;renewBudget?:boolean;isPrewarm?:boolean;/** Runtime admission policy, never persisted. */immediate?:boolean;requestLimit?:AiRequestLimit;skipFailedPolishParts?:boolean;/** Shared live role for nested sessions; not part of cache identity. */isForeground?:()=>boolean;onLease?:(lease:AiLeaseInfo)=>void;onRelease?:(leaseIdHash:string)=>void}
/** Wrapper used by tests/Reader: optional third argument carries safe lease evidence. */
export type AiReadingTranslate=(input:AiTranslateClientRequest,signal:AbortSignal,onLease?:(lease:AiLeaseInfo)=>void,onText?:(text:string)=>void,immediate?:boolean,avoidKeySlot?:number,logContext?:import('../../../shared/types/ai-log').AiLogRequestContext)=>Promise<AiTranslateClientResponse>;
export interface AiReadingCache {
  /** Opt-in whole-chapter reuse after changing model preferences; never for parts. */
  readCompleted?:AiReadingCache['read'];
  read:(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],signal?:AbortSignal)=>Promise<AiTranslateClientResponse|undefined>;
  write:(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],result:AiTranslateClientResponse,signal?:AbortSignal)=>Promise<boolean>;
  readParts?:(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],plan:string,signal?:AbortSignal,legacyIdentity?:boolean)=>Promise<AiPartRecord[]>;
  writePart?:(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],plan:string,id:string,result:AiTranslateClientResponse,signal?:AbortSignal)=>Promise<boolean>;
}
export function legacyAiReadingKey(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[]):string{
  // Fallback priority only changes retry order, so existing complete translations remain reusable.
  const {fallbackOrder:_fallbackOrder,...orderIndependent}=settings;settings=orderIndependent;
  // Fixed is the previously deployed policy: retain existing validated cache identities.
  if(settings.modelMode==='fixed'){const {modelMode,...previous}=settings;settings=previous;}
  const effective=settings.hybrid?{...settings,hybridProtocol:3,hybrid:{...settings.hybrid,secondHalfPrompt:settings.hybrid.secondHalfPrompt??DEFAULT_SECOND_HALF_PROMPT}}:settings;
  return JSON.stringify([source.bookId,source.id,source.revision,source.text,effective,settings.continuation||settings.hybrid?names:filterNamesForText(source.text,names),...(source.polishPairs?[source.polishPairs,!!source.polishPreserveLines]:[])]);
}
export function aiReadingKey(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[]):string{
 const effective=readingPartModels(settings).every(model=>!supportsAiTemperature(model))?{...settings,temperature:0}:settings;
 return legacyAiReadingKey(source,effective,names);
}
/** Current and next chapter; ordered part previews, complete-only cache and model fallback. */
export class AiReadingSession {
  private recovery=new AiRecovery();
  private modelBusyUntil=new Map<string,number>();
  private cache=new Map<string,AiTranslateClientResponse>();
  private completed=new AiCompletedMemory<AiTranslateClientResponse>();
  private resultFacts=new AiResultFactsStore();
  private parts=new Map<string,Map<string,AiTranslateClientResponse>>();
  private partPlans=new Map<string,{parts:AiPart[];plan:string}>();
  private polishRun?:{key:string;identity:string;resume:PolishPartsResume};
  private progress=new Map<string,AiPartsProgress>();
  private listeners=new Map<string,Set<(state:AiPartsProgress)=>void>>();
  private pending=new Map<string,{controller:AbortController;promise:Promise<AiTranslateClientResponse>;handoff:AiJobHandoff}>();
  private capacity?:{model:string;until:number};
  private budgets=new Map<string,AiChapterBudget>();
  private hybridMemory=new Map<string,HybridMemory>();
  constructor(private translate:AiReadingTranslate=aiTranslate,private persisted?:AiReadingCache,private onQuota?:(delay:number,pause:boolean)=>void,private observeMetrics=true,sharedRecovery?:AiRecovery,private sharedControl?:AiPartsControl,private planOutput=true){if(sharedRecovery)this.recovery=sharedRecovery;}
  retain(keys:string[]){this.resultFacts.retain(keys);const keep=new Set(keys);if(this.polishRun&&!keep.has(this.polishRun.key))this.polishRun=undefined;for(const [key,job] of this.pending)if(!keep.has(key)){this.clearPreview(key);job.handoff.close();job.controller.abort();this.pending.delete(key);}for(const map of [this.cache,this.parts,this.partPlans,this.progress,this.listeners,this.budgets,this.hybridMemory])for(const key of map.keys())if(!keep.has(key))map.delete(key);}
  /** Keep a live Convert plan across explicit model changes. Only whole roots
   * can cross that boundary. Child recovery remains tied to its request model. */
  preparePolishRun(source:AiReadingSource,settings:ReadingAiSettings,resume:boolean){
    const key=aiReadingKey(source,settings,[]);
    const identity=legacyAiReadingKey(source,{...settings,model:''},[]);
    const previous=this.polishRun;
    if(resume){
      if(!previous||previous.identity!==identity)return false;
      if(previous.key===key)return true;
      const plan=this.partPlans.get(previous.key);
      if(!plan)return false;
      const retained=new Map(previous.resume.retained),completed=this.parts.get(previous.key);
      for(const part of plan.parts){
        const result=completed?.get(part.id);
        if(result)retained.set(part.id,result);
      }
      const skipped=this.progress.get(previous.key)?.polishSkipped??previous.resume.skipped;
      this.retain([]);
      this.partPlans.set(key,plan);
      this.polishRun={key,identity,resume:{retained,skipped}};
    }else{
      this.retain([]);
      this.polishRun={key,identity,resume:{retained:new Map()}};
    }
    return true;
  }
  get(key:string){return this.cache.get(key);}
  facts(key:string){return this.resultFacts.get(key);}
  visible(key:string,preview:boolean,accepted:boolean){const budget=this.budgets.get(key);if(budget){const metric=AiRunMetrics.existing(budget);metric?.foreground();metric?.visible(preview,accepted);}}
  workId(key:string){return this.budgets.get(key)?.id;}
  retryDeadline(key:string){return this.budgets.get(key)?.deadline;}
  private clearPreview(key:string){const old=this.progress.get(key);if(old?.previewText){const state={...old,previewText:''};this.progress.set(key,state);for(const listener of this.listeners.get(key)||[])listener(state);}}
  cancel(key:string){this.clearPreview(key);const job=this.pending.get(key);job?.handoff.close();job?.controller.abort();this.pending.delete(key);this.listeners.delete(key);}
  request(source:AiReadingSource,settings:ReadingAiSettings,names:{key:string;value:string}[],validate?:(result:AiTranslateClientResponse)=>void,onModel?:(model:string)=>void,onProgress?:(state:AiPartsProgress)=>void,options:AiReadingRequestOptions={}){
    if(this.sharedControl)resetIdleAiCapacity(this.sharedControl);
    source={...source,...(source.polishPairs?{polishPairs:source.polishPairs.map(p=>({...p}))}:{})};settings={...settings,...(settings.hybrid?{hybrid:{...settings.hybrid}}:{}),...(settings.continuation?{continuation:{...settings.continuation}}:{}),...(settings.fallbackModels?{fallbackModels:[...settings.fallbackModels]}:{})};names=names.map(name=>({...name}));
    if(!source.text.trim())return Promise.reject(new AiTranslateClientError('text_empty','Văn bản dịch không được để trống.'));
    // Only full TXT chapters use this policy. Structured EPUB and internal
    // hybrid stage sessions retain their original chapter's execution contract.
    const wholeShort=this.planOutput&&!validate&&!source.polishPairs&&source.text.length<AI_WHOLE_CHAPTER_CHARS;
    if(settings.hybrid&&(isHybridLiteModel(settings.model)||!hybridTemplateValid(settings.userPromptTemplate)))return Promise.reject(new AiTranslateClientError('invalid_prompt','Dịch kết hợp cần model ưu tiên cho nửa đầu và đúng một {{text}}.'));
    const key=aiReadingKey(source,settings,names),cached=this.cache.get(key);if(cached){validate?.(cached);return Promise.resolve(cached);}
    const polishRun=source.polishPairs&&options.skipFailedPolishParts&&!this.persisted&&this.polishRun?.key===key?this.polishRun.resume:undefined;
    const reuseCompleted=!!this.persisted?.readCompleted&&this.planOutput&&!validate&&!source.polishPairs&&mayReuseCompletedAi(settings);
    const kept=reuseCompleted?this.completed.get(source,settings,names):undefined;
    if(kept){this.cache.set(key,kept);this.resultFacts.set(key,kept);return Promise.resolve(kept);}
    if(onProgress){let listeners=this.listeners.get(key);if(!listeners)this.listeners.set(key,listeners=new Set());listeners.add(onProgress);const progress=this.progress.get(key);if(progress)onProgress(progress);}
    const old=this.pending.get(key);if(old){if(options.isPrewarm!==true){const budget=this.budgets.get(key);if(budget&&this.observeMetrics)AiRunMetrics.forWork('txt',source.text.length,budget).foreground();}old.handoff.attach(onModel,options.isPrewarm!==true);return validate?old.promise.then(result=>{validate(result);return result;}):old.promise;}
    const previousBudget=this.budgets.get(key);
    const limits=!validate&&source.text.length>1800?EPUB_AI_CHAPTER_LIMITS:AI_CHAPTER_LIMITS,budget=selectAiChapterBudget(this.budgets.get(key),limits,options);this.budgets.set(key,budget);
    const job=new AiChapterJob(limits,validate||!this.observeMetrics?undefined:AiRunMetrics.forWork('txt',source.text.length,budget,options.isPrewarm?'prewarm':'foreground',previousBudget?.id!==budget.id?previousBudget?.id:undefined),budget,options.immediate),controller=job.controller;
    const logMetrics=options.logMetrics??job.metrics;
    const models=readingAiModels(settings);
    const requestLimit=options.requestLimit??(source.polishPairs&&settings.splitParts?AI_TOOL_REQUEST_LIMIT:2);
    const control:AiPartsControl=this.sharedControl??{throttled:false,waitUntil:0},quota=(delay:number)=>{job.check();this.capacity=undefined;const pause=!!pinned||models.length===1;if(pause)aiQuotaFeedback(control,delay);else{control.throttled=true;control.changed?.();}this.onQuota?.(delay,pause);};
    if(options.immediate){control.immediate=true;control.waitUntil=0;control.throttledUntil=0;}
    const handoff=new AiJobHandoff(control,options.isPrewarm===true,onModel);
    let pinned:string|undefined,knownDivision:AiDivision|undefined,leaseCapacity:{model:string;keys:number}|undefined;
    const abortPreview=()=>{if(this.pending.get(key)?.controller===controller)this.clearPreview(key);};controller.signal.addEventListener('abort',abortPreview,{once:true});
    const isForeground=options.isForeground??handoff.isForeground,allowedModel=(model:string)=>isForeground()||models.length===1||model!=='gemini-3.5-flash-lite';
    let lastKeySlot:number|undefined;
    const requestLease=options.onLease;
    const preview=(text:string)=>{if(controller.signal.aborted)return;const previous=this.progress.get(key);if(!previous)return;const state={...previous,previewText:text};this.progress.set(key,state);for(const listener of this.listeners.get(key)||[])listener(state);};
    const send=async(text=source.text,context?:string,checkpoint?:AiCompletionCheckpoint,onLease?:(lease:AiLeaseInfo)=>void,onRelease?:(leaseIdHash:string)=>void)=>{
      const leaseNotify=onLease??requestLease,releaseNotify=onRelease??options.onRelease;
      const choices=pinned?[pinned]:models,available=choices.filter(model=>options.immediate||(this.modelBusyUntil.get(model)??0)<=Date.now());
      if(!available.some(allowedModel)){const delay=Math.max(1,Math.min(30000,...choices.filter(allowedModel).map(model=>(this.modelBusyUntil.get(model)??Date.now())-Date.now())));throw new AiTranslateClientError('ai_rate_limited','Các model đang chờ; sẽ tự thử lại.',429,'cooldown',undefined,undefined,delay);}
      let lastError:unknown;
      const attempted=new Set<string>();
      for(;;){
        const eligible=available.filter(candidate=>!attempted.has(candidate)&&allowedModel(candidate)),model=eligible[0];if(!model)break;const finalModel=eligible.at(-1),roleCount=choices.filter(allowedModel).length;attempted.add(model);
        // Earlier models fail over promptly. Once the final model has split a long
        // request, retry its failing child in place so completed siblings are kept.
        // Full-source overload still makes one attempt per model; no split/fan-out.
        try{
          job.check();handoff.model(model);
          const result=await translateComplete({text,...settings,model,...(settings.hybrid?.rules&&!settings.continuation?{addressingRules:settings.hybrid.rules}:{}),...(context?{context}: {}),names:filterNamesForText(settings.continuation?names.map(n=>nameSourceKey(n.key)).join('\n'):text,names)},controller.signal,
            (input,partId)=>this.recovery.run(model,controller.signal,()=>withAiRequestCapacity(control,controller.signal,()=>job.send(async()=>{
              let ownedLease:string|undefined,attemptId:number|undefined,attemptEnded=false,draft='',previewActive=true;if(wholeShort)preview('');
              try{
                const logPath=options.logPartPath?(wholeShort||!partId?options.logPartPath:aiMetricPartPath(partId,options.logPartPath)):wholeShort?'0':aiMetricPartPath(partId??'0');logMetrics?.attempt(model,logPath,lastError!==undefined);attemptId=logMetrics?.beginAttempt(model,logPath);
                const response=await this.translate(requestLimit>2?{...input,reportFreeKeys:true}:input,controller.signal,lease=>{lastKeySlot=lease.keySlot;ownedLease=lease.leaseIdHash;if(lease.keysAvailable!==undefined)leaseCapacity={model,keys:lease.keysAvailable};leaseNotify?.(lease);},wholeShort?text=>{if(!previewActive||controller.signal.aborted)return;draft+=text;if(draft.length>512000)return;const end=draft.lastIndexOf('\n');if(end>=0)preview(draft.slice(0,end).trimEnd());}:undefined,options.immediate||false,options.immediate?lastKeySlot:undefined,logMetrics?.context(logPath,models.indexOf(model),lastError?aiFallbackCause(lastError):undefined,{contextChars:input.context?.length??0,strategy:wholeShort?'whole':'split',splitDepth:logPath.split('.').length-1})).catch(error=>{logMetrics?.failure(logPath,model,error);throw error;});
                // Validate inside the retry boundary too: copied STOP output
                // from adapters must retry whole, never become a child split.
                if(wholeShort)assertAiTranslationCoverage(input,response);
                logMetrics?.result(logPath,response,'unknown');logMetrics?.endAttempt(attemptId);attemptEnded=true;
                return response;
              }catch(error){if(!attemptEnded)logMetrics?.endAttempt(attemptId,error);throw error;}finally{previewActive=false;if(wholeShort&&!attemptEnded)preview('');if(ownedLease)releaseNotify?.(ownedLease);}
            },JSON.stringify({...input,requestPart:partId})),()=>isForeground()?0:100,requestLimit),wholeShort||input.text.length<400,wholeShort?(model===finalModel?2:0):roleCount===1||model===finalModel&&input.text.length<text.length?2:0,quota,wholeShort,options.immediate),
            validate||wholeShort?'none':model===finalModel?roleCount>1?'timeout':true:false,checkpoint?{...checkpoint,onInvalid:(id,error)=>logMetrics?.rejectAttempt(options.logPartPath?(!id?options.logPartPath:aiMetricPartPath(id,options.logPartPath)):aiMetricPartPath(id||'0'),model,error)}:checkpoint);
          if(result.parallel===2&&!control.throttled){this.capacity={model:result.model,until:Date.now()+60000};leaseCapacity={model:result.model,keys:2};}return result;
        }
        catch(error){if(this.capacity?.model===model)this.capacity=undefined;if(controller.signal.aborted||!mayFallbackModel(error,options.immediate)||choices.length===1||pinned)throw error;lastError=error;if(!options.immediate)this.modelBusyUntil.set(model,Date.now()+Math.max(15000,error.retryAfterMs??15000));}
      }
      if(lastError instanceof AiTranslateClientError)throw new AiTranslateClientError(lastError.code,lastError.message,lastError.status,lastError.reason,lastError.requestId,lastError.durationMs,Math.max(1,Math.min(30000,...models.filter(allowedModel).map(model=>(this.modelBusyUntil.get(model)??Date.now())-Date.now()))));
      throw lastError;
    };
    const planned=async()=>{
      if(settings.hybrid&&!validate&&!wholeShort&&source.text.length>1800){logMetrics?.planSplit('hybrid');
        const cut=aiRecoveryCut(source.text,names.map(n=>nameSourceKey(n.key)));if(cut<=0||cut>=source.text.length)throw Error('Không thể chia hai nửa an toàn.');
        let memory=this.hybridMemory.get(key);if(!memory)this.hybridMemory.set(key,memory=new Map());
        const relevant=Object.entries(filterNamesForText(source.text,names)).map(([key,value])=>({key,value})),sessions:AiReadingSession[]=[];
        const abort=()=>sessions.forEach(s=>s.clear());controller.signal.addEventListener('abort',abort,{once:true});
        let firstPartCount=1;const hybridLeaves:({done:number;total:number}|undefined)[]=[];
        const emit=(stage:0|1,state:AiPartsProgress,first?:AiTranslateClientResponse)=>{
          job.check();const progress={...state,division:undefined,leafProgress:undefined,half:(stage+1) as 1|2,halfModels:first?[first.model,settings.hybrid!.liteModel] as [string,string]:undefined,sample:first?.result,text:stage?first!.result+'\n'+state.text:state.text};
          if(progress.text.length>512000)throw Error('Bản dịch vượt giới hạn hiển thị.');
          hybridLeaves[stage]=state.leafProgress;job.metrics?.tree(hybridLeaves[0]&&hybridLeaves[1]?{done:hybridLeaves[0].done+hybridLeaves[1].done,total:hybridLeaves[0].total+hybridLeaves[1].total}:undefined);if(stage===0)firstPartCount=state.total;job.metrics?.progress(progress.done+(stage?firstPartCount:0),progress.total+(stage?firstPartCount:0),progress.text,progress.recoveryPasses);this.progress.set(key,progress);for(const listener of this.listeners.get(key)||[])listener(progress);
        };
        try{const [first,second,hash]=await runHybridStages(source,settings,relevant,JSON.stringify(['txt',cut]),memory,this.persisted,controller.signal,source.text.slice(0,cut),async(index,selected,cache,publish)=>{
          let latest:AiPartsProgress|undefined,promptPreview:string|undefined;const progress=(state:AiPartsProgress)=>{latest=state;publish({...state,...(promptPreview?{promptPreview}:{})});};
          const session=new AiReadingSession((input,signal,onLease,onText,_immediate,avoidKeySlot,logContext)=>{job.check();if(input.continuation){promptPreview=aiUserPromptPreview(input);if(latest)progress(latest);}return job.send(()=>this.translate(input,signal,onLease,onText,options.immediate||false,options.immediate?avoidKeySlot:undefined,logContext));},cache,this.onQuota,false,this.recovery,undefined,false);sessions.push(session);
          return session.request({...source,text:index?source.text.slice(cut):source.text.slice(0,cut)},selected,relevant,undefined,handoff.model,progress,{isForeground,immediate:options.immediate,logMetrics,logPartPath:aiMetricPartPath(String(index),options.logPartPath)}).then(result=>latest?.division?{...result,division:result.division??latest.division}:result);
        },emit);const result=hybridResult(first,second,hash);if(result.result.length>512000)throw Error('Bản dịch vượt giới hạn hiển thị.');return result;}finally{controller.signal.removeEventListener('abort',abort);abort();}
      }
      const protectedKeys=names.map(n=>nameSourceKey(n.key));if(validate)return send();
      // Legacy hybrid stages retain their own two-half contract and checkpoints.
      const remembered=this.partPlans.get(key),legacyParts=!this.planOutput?splitAiText(source.text,protectedKeys,settings.splitParts?1800:AI_TEXT_REQUEST_CHARS):undefined;
      const proposed=source.polishPairs?remembered??planPolishText(source.text,source.polishPairs,settings):wholeShort?planAiText(source.text,protectedKeys,false):remembered??(legacyParts?{parts:legacyParts,plan:JSON.stringify([settings.splitParts?'txt-parallel-1':'txt-whole-1',legacyParts.map(p=>[p.start,p.end])])}:planAiText(source.text,protectedKeys,!!settings.splitParts));let parts=proposed.parts,plan=proposed.plan;
      let completed=wholeShort&&remembered?.plan!==plan?undefined:this.parts.get(key);if(!completed)this.parts.set(key,completed=new Map());
      const usable=(rows:AiPartRecord[],targets:AiPart[])=>rows.filter(row=>(!wholeShort||row.id==='0'&&(row.response.division?.parts??1)===1)&&/^\d{1,4}(?:\/[01])*$/.test(row.id)&&targets.some(p=>p.id===row.id.split('/')[0])&&row.response.finishReason==='STOP'&&row.response.result.trim()&&models.includes(row.response.model));
      if(this.persisted?.readParts){
        const candidates:{parts:AiPart[];plan:string;rows:AiPartRecord[]}[]=[{parts,plan,rows:[]}];
        if(!remembered&&!wholeShort&&!source.polishPairs){
          for(const [tag,limit]of [[settings.splitParts?'txt-parallel-1':'txt-whole-1',settings.splitParts?1800:AI_TEXT_REQUEST_CHARS],['txt-parts-2',1800]] as const)try{
            const oldParts=splitAiText(source.text,protectedKeys,limit),oldPlan=JSON.stringify([tag,oldParts.map(p=>[p.start,p.end])]);if(!candidates.some(candidate=>candidate.plan===oldPlan))candidates.push({parts:oldParts,plan:oldPlan,rows:[]});
          }catch{/* Optional old layouts cannot block a safe new plan. */}
        }
        const collected={candidates};
        const found=await optionalAiCache(controller.signal,AI_CACHE_READ_MS,collected,async signal=>{
          await Promise.allSettled(candidates.map(async candidate=>{const rows=await this.persisted!.readParts!(source,settings,names,candidate.plan,signal);if(!signal.aborted)candidate.rows=rows;}));return collected;
        });job.check();let rows:AiPartRecord[]=[];
        for(const candidate of found.candidates){const valid=usable(candidate.rows,candidate.parts);if(valid.length){parts=candidate.parts;plan=candidate.plan;rows=valid;break;}}
        for(const row of rows)completed.set(row.id,wholeShort?{...row.response,division:{version:1,parts:1,reasons:[]}}:row.response);
      }
      this.partPlans.set(key,{parts,plan});
      pinned=completed.get('0')?.model??completed.values().next().value?.model;if(pinned)for(const [id,result] of completed)if(result.model!==pinned)completed.delete(id);
      const warm=this.capacity&&this.capacity.until>Date.now()&&(pinned??models[0])===this.capacity.model&&(options.immediate||(this.modelBusyUntil.get(this.capacity.model)??0)<=Date.now());
      // Auto must accept a part before warming/pinning can suppress fallback.
      // A fixed single-model request can safely reuse capacity immediately.
      const warmParallel=!!warm&&!!settings.splitParts&&parts.length>1&&(!!pinned||models.length===1);if(warmParallel&&models.length===1)pinned??=this.capacity!.model;
      const splitReason:AiDivisionReason=plan.includes('txt-parts-2')?'legacy':plan.includes('txt-output-budget-1')?'request_limit':settings.splitParts?'parallel':'request_limit';
      if(parts.length>1)logMetrics?.planSplit(splitReason);
      const retained=polishRun?.retained;
      const acceptedParts=()=>retained?.size?new Map([...retained,...completed!]):completed!;
      const splitEvents=new Map<string,AiDivisionReason>(),unknownDivision=hasUnknownAiParts(parts,acceptedParts());let freshSingle=false;
      const publish=(state:AiPartsProgress)=>{
        job.check();
        const acceptedRoots=acceptedParts();
        const tree=wholeShort?{division:{version:1 as const,parts:1,reasons:[]},leafProgress:{done:completed!.has('0')?1:0,total:1}}:aiTreeFacts(parts,acceptedRoots,splitEvents,splitReason,unknownDivision);
        const text=aiCompletedPrefix(parts,completed!,source.polishPairs?'':'\n'),draft=wholeShort&&!text?this.progress.get(key)?.previewText:undefined;
        // Lease/progress events may arrive after the last stream chunk but
        // before completed.set(). Keep its draft until acceptance or explicit clear.
        let completedSourceEnd=0,targetStart=0;
        const polishFallback:PolishFallbackRange[]=[];
        const accepted:string[]=[], acceptedModels=new Set<string>(), skippedRoots=new Set(state.polishSkipped?.map(row=>row.part));
        for(const [index,part] of parts.entries()){
          const result=acceptedRoots.get(part.id);
          let acceptedText:string;
          if(result?.finishReason==='STOP'&&result.result.trim()){
            acceptedText=result.result;
            if(retained?.size)acceptedModels.add(result.model);
          }
          else if(skippedRoots.has(index+1)){
            acceptedText=part.text;
            polishFallback.push({sourceStart:part.start,sourceEnd:part.end,targetStart,targetEnd:targetStart+acceptedText.length});
          }
          else break;
          accepted.push(acceptedText);
          targetStart+=acceptedText.length+(source.polishPairs?0:1);
          completedSourceEnd=part.end;
        }
        const completedText=accepted.join(source.polishPairs?'':'\n');
        const progress={...state,text:retained?.size?completedText:text,completedSourceEnd,completedText,...(acceptedModels.size?{polishModels:[...acceptedModels]}:{}),...(polishFallback.length?{polishFallback}:{}),...(draft?{previewText:draft}:{}),...tree};if(progress.text.length>512000)throw Error('Bản dịch vượt giới hạn hiển thị.');job.metrics?.tree(progress.leafProgress);job.metrics?.progress(progress.done,progress.total,progress.text,progress.recoveryPasses);this.progress.set(key,progress);for(const listener of this.listeners.get(key)||[])listener(progress);};
      const split=(reason:AiDivisionReason,id:string)=>{logMetrics?.split(aiMetricPartPath(id,options.logPartPath),reason);splitEvents.set(id,reason);const previous=this.progress.get(key);if(previous)publish(previous);};
      const save=async(id:string,result:AiTranslateClientResponse)=>{
        job.check();logMetrics?.result(wholeShort?(options.logPartPath??'0'):aiMetricPartPath(id,options.logPartPath),result);if(pinned&&pinned!==result.model)throw Error('Model thay đổi trong khi phục hồi.');pinned??=result.model;completed.set(id,result);const previous=this.progress.get(key);if(previous)publish(previous);
        // Keep the live response identity; only durable checkpoints carry the
        // independently known whole-chapter facts for a checkpoint-only reload.
        const checkpoint=wholeShort?{...result,division:{version:1 as const,parts:1,reasons:[]}}:result;
        if(this.persisted?.writePart)await optionalAiCache(controller.signal,AI_CACHE_WRITE_MS,false,signal=>this.persisted!.writePart!(source,settings,names,plan,id,checkpoint,signal));
      };
      const canParallel=(model:string|undefined)=>!!settings.splitParts&&!control.throttled&&leaseCapacity?.model===model&&(leaseCapacity?.keys??0)>=2&&(!!pinned||models.length===1);
      const result=await runAiParts(parts,controller.signal,completed,async(part,onLease,onRelease)=>{
        const paired=source.polishPairs,editorial:Partial<AiCompletionCheckpoint>=paired?{
          prepare:(input,offset)=>({...input,polishOutput:true,text:formatPolishPairs(polishPairsInRange(paired,part.start+offset,part.start+offset+input.text.length))}),
          cut:(text,offset)=>polishPairCut(paired,part.start+offset,part.start+offset+text.length),
          accept:(result,text,offset)=>{
            const output=readPolishOutput(result.result,polishPairsInRange(paired,part.start+offset,part.start+offset+text.length),!!options.skipFailedPolishParts);
            return {...result,result:acceptedPolishText(text,output.text,source.polishPreserveLines),polishTerms:output.terms};
          },separator:'',
        }:{};
        const response=await send(part.text,part.context,{id:part.id,completed,save,protectedKeys,onSplit:split,parallel:paired?()=>false:canParallel,...editorial},onLease,onRelease);if(parts.length===1&&!response.division&&!unknownDivision)freshSingle=true;pinned??=response.model;return response;
      },publish,(part,result)=>save(part.id,result),undefined,warmParallel&&requestLimit===2?2:1,control,`${source.bookId}/${source.id}`,splitReason,()=>!!settings.splitParts&&(!!pinned||models.length===1),source.polishPairs?'':'\n',requestLimit,source.polishPairs&&options.skipFailedPolishParts?maySkipPolishPart:undefined,
        polishRun&&{retained:polishRun.retained,skipped:this.progress.get(key)?.polishSkipped??polishRun.skipped});
      knownDivision=wholeShort?{version:1,parts:1,reasons:[]}:result.division??(freshSingle?{version:1,parts:1,reasons:[]}:undefined);
      if(result.result.length>512000)throw Error('Bản dịch vượt giới hạn hiển thị.');return result;
    };
    let persistedHit=false;
    const promise=job.run(()=>{
    const work=this.persisted?optionalAiCache(controller.signal,AI_CACHE_READ_MS,undefined,signal=>(reuseCompleted?this.persisted!.readCompleted!:this.persisted!.read)(source,settings,names,signal)).then(cached=>{job.check();const usable=cached??undefined;persistedHit=!!usable;if(usable)job.metrics?.cache();return usable??planned();}):planned();
    return work.then(async result=>{
      job.check();
      if(controller.signal.aborted||this.pending.get(key)?.controller!==controller)throw new DOMException('Cancelled','AbortError');
      // If no new root was accepted, the aggregate still has an old model.
      // New responses are validated in send().
      const retainedOnly=!!polishRun?.retained.size&&
        this.partPlans.get(key)?.parts.length===polishRun.retained.size+(result.polishSkipped?.length??0)&&
        [...polishRun.retained.values()].some(row=>row.model===result.model);
      if(result.finishReason!=='STOP'||!result.result.trim()||!(persistedHit&&reuseCompleted?validCompletedAi(result):validReadingResult(result,settings)||retainedOnly))throw new Error('Bản dịch chưa hoàn chỉnh hoặc sai model.');
      validate?.(result);
      if(this.persisted&&!persistedHit&&!result.polishSkipped?.length)await optionalAiCache(controller.signal,AI_CACHE_WRITE_MS,false,signal=>this.persisted!.write(source,settings,names,knownDivision?{...result,division:knownDivision}:result,signal));
      job.check();
      if(controller.signal.aborted||this.pending.get(key)?.controller!==controller)throw new DOMException('Cancelled','AbortError');
      if(wholeShort)logMetrics?.result(options.logPartPath??'0',result);if(wholeShort)job.metrics?.tree({done:1,total:1});
      this.resultFacts.set(key,result,knownDivision);if(!result.polishSkipped?.length&&!polishRun?.retained.size)this.cache.set(key,result);if(reuseCompleted)this.completed.set(source,settings,names,knownDivision?{...result,division:knownDivision}:result);return result;
    });
    }).finally(()=>{controller.signal.removeEventListener('abort',abortPreview);handoff.close();if(this.pending.get(key)?.controller===controller){this.pending.delete(key);this.listeners.delete(key);}});
    this.pending.set(key,{controller,promise,handoff});return promise;
  }
  clear(){this.retain([]);this.completed.clear();}
}

