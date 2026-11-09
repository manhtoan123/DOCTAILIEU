import {AiTranslateClientError} from './ai-translate';
import type {AiRunMetrics} from './ai-metrics';
import {AiRequestAttempts} from '../types/ai-request-attempts';

export const AI_CHAPTER_LIMITS={durationMs:240_000,sends:24};
export const EPUB_AI_CHAPTER_LIMITS={durationMs:600_000,sends:256};
export const AI_CACHE_READ_MS=2000,AI_CACHE_WRITE_MS=1000;
export interface AiChapterBudget {id:string;createdAt:number;deadline:number;sends:number;recoveryAt?:number}
export function createAiChapterBudget(limits=AI_CHAPTER_LIMITS):AiChapterBudget{const createdAt=Date.now();return {id:crypto.randomUUID(),createdAt,deadline:createdAt+limits.durationMs,sends:0};}
const requestAttempts=new WeakMap<AiChapterBudget,AiRequestAttempts>();
/** A new cooled-down recovery round may retry a failed request. Total sends and deadline stay unchanged. */
export function resumeAiChapterBudget(budget:AiChapterBudget){requestAttempts.delete(budget);}

export const AI_RECOVERY_ROUND_WAIT_MS=60_000;
/** Renewal is allowed only for exhausted budgets, after a cooling interval. */
export function selectAiChapterBudget(previous:AiChapterBudget|undefined,limits=AI_CHAPTER_LIMITS,options:{automatic?:boolean;renewBudget?:boolean}={}):AiChapterBudget{
  if(!options.automatic||!previous)return createAiChapterBudget(limits);
  const exhausted=Date.now()>=previous.deadline||previous.sends>=limits.sends;
  const eligible=previous.recoveryAt??previous.deadline+AI_RECOVERY_ROUND_WAIT_MS;
  if(options.renewBudget&&exhausted&&Date.now()>=eligible)return createAiChapterBudget(limits);
  resumeAiChapterBudget(previous);return previous;
}

/** One chapter, including cache, model fallback, child retries and cooldowns. */
export class AiChapterJob {
  readonly controller=new AbortController();
  readonly budget:AiChapterBudget;
  private failure?:AiTranslateClientError;
  constructor(private limits=AI_CHAPTER_LIMITS,readonly metrics?:AiRunMetrics,budget?:AiChapterBudget,private immediate=false){this.budget=budget??createAiChapterBudget(limits);}
  private exhaust(reason:'chapter_deadline'|'send_limit'){
    this.budget.recoveryAt??=Date.now()+AI_RECOVERY_ROUND_WAIT_MS;
    this.failure??=new AiTranslateClientError('ai_recovery_exhausted',this.immediate?'Đợt dịch đã hết lượt hoặc thời gian thực hiện. Đã giữ tiến độ; bạn có thể tiếp tục ngay.':reason==='chapter_deadline'
      ?'Đợt dịch vượt thời gian chờ; đang giữ tiến độ để tự phục hồi.'
      :'Đợt dịch đã dùng hết lượt thử; đang giữ tiến độ để tự phục hồi.',undefined,reason);
    this.controller.abort();return this.failure;
  }
  check(){
    if(this.failure)throw this.failure;
    if(this.controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
    if(Date.now()>=this.budget.deadline)throw this.exhaust('chapter_deadline');
  }
  send<T>(operation:()=>Promise<T>,identity?:string):Promise<T>{
    if(identity!==undefined){let attempts=requestAttempts.get(this.budget);if(!attempts)requestAttempts.set(this.budget,attempts=new AiRequestAttempts());return attempts.send(identity,()=>this.send(operation));}
    this.check();if(this.budget.sends>=this.limits.sends)throw this.exhaust('send_limit');
    this.budget.sends++;return this.metrics?this.metrics.send(operation):operation();
  }
  run<T>(operation:()=>Promise<T>):Promise<T>{
    let timer:ReturnType<typeof setTimeout>|undefined,abort!:()=>void;
    const stopped=new Promise<never>((_,reject)=>{
      abort=()=>reject(this.failure??new DOMException('Cancelled','AbortError'));
      this.controller.signal.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>this.exhaust('chapter_deadline'),Math.max(0,this.budget.deadline-Date.now()));
      if(this.controller.signal.aborted)abort();
    });
    let work:Promise<T>;
    try{this.check();work=operation();}catch(error){work=Promise.reject(error);}
    return Promise.race([work,stopped]).then(value=>{this.metrics?.finish();return value;},error=>{this.metrics?.finish(error);throw error;}).finally(()=>{clearTimeout(timer);this.controller.signal.removeEventListener('abort',abort);});
  }
}

/** Optional cache failure cannot hold a finished chapter hostage. Abort only its transaction. */
export async function optionalAiCache<T>(signal:AbortSignal,timeoutMs:number,fallback:T,operation:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,abort!:()=>void;
  const stopped=new Promise<T>(resolve=>{
    abort=()=>{controller.abort();resolve(fallback);};
    signal.addEventListener('abort',abort,{once:true});
    timer=setTimeout(abort,timeoutMs);if(signal.aborted)abort();
  });
  try{
    if(signal.aborted)return fallback;
    return await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)return fallback;return operation(controller.signal);}).catch(()=>fallback),stopped]);
  }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
