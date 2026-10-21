/** Bounded, local diagnostics. No source, prompt, Names, book IDs or credentials. */
export interface AiRunMetric {
  workId:string;attempts:number;kind:'txt'|'epub';sourceChars:number;status:'complete'|'error'|'cancelled';
  durationMs:number;firstReadableMs?:number;requests:number;apiMs:number;
  totalParts:number;completeParts:number;recoveryPasses:number;cacheHit:boolean;errorCode?:string;
}
const history:AiRunMetric[]=[];
export const getAiRunMetrics=()=>history.map(row=>({...row}));
const safeCodes=new Set(['ai_untranslated_result','ai_request_rejected','ai_timeout','ai_network_error','ai_gateway_error','ai_rate_limited','ai_upstream_error','ai_auth_error','ai_not_configured','ai_invalid_model','ai_incomplete_result','ai_invalid_response','ai_response_too_large','ai_empty_result','ai_location_unavailable','ai_recovery_exhausted']);
export class AiRunMetrics {
  private firstReadableMs?:number;private requests=0;private apiMs=0;
  private totalParts=0;private completeParts=0;private recoveryPasses=0;private cacheHit=false;private finished=false;
  constructor(private kind:'txt'|'epub',private sourceChars:number,private work:{id:string;createdAt:number}={id:crypto.randomUUID(),createdAt:Date.now()}){}
  cache(){this.cacheHit=true;}
  progress(done:number,total:number,text:string,recoveryPasses=0){this.completeParts=done;this.totalParts=total;if(text&&this.firstReadableMs===undefined)this.firstReadableMs=Date.now()-this.work.createdAt;this.recoveryPasses=Math.max(this.recoveryPasses,recoveryPasses);}
  async send<T>(operation:()=>Promise<T>):Promise<T>{this.requests++;const start=Date.now();try{return await operation();}finally{this.apiMs+=Date.now()-start;}}
  finish(error?:unknown){
    if(this.finished)return;this.finished=true;const failed=arguments.length>0,failure=error as {name?:string;code?:string}|undefined;
    const index=history.findIndex(row=>row.workId===this.work.id),old=history[index],first=old?.firstReadableMs??this.firstReadableMs;
    const row:AiRunMetric={workId:this.work.id,attempts:(old?.attempts??0)+1,kind:this.kind,sourceChars:this.sourceChars,status:failed?failure?.name==='AbortError'?'cancelled':'error':'complete',durationMs:Date.now()-this.work.createdAt,requests:(old?.requests??0)+this.requests,apiMs:(old?.apiMs??0)+this.apiMs,totalParts:this.totalParts,completeParts:this.completeParts,recoveryPasses:(old?.recoveryPasses??0)+this.recoveryPasses,cacheHit:this.cacheHit,...(first===undefined?{}:{firstReadableMs:first}),...(failed?{errorCode:safeCodes.has(failure?.code??'')?failure?.code:'invalid_result'}:{})};
    if(index>=0)history.splice(index,1);history.push(row);if(history.length>128)history.shift();
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('reader-ai-metric',{detail:{...row}}));
  }
}
