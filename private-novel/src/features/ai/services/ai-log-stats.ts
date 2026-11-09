import type {AiLogEvent} from '../../../shared/types/ai-log';

export interface AiLogSummary {
 total:number;success:number;errors:number;cancelled:number;cache:number;sample:number;successRate:number|null;failureRate:number|null;
 durationN:number;meanMs:number|null;medianMs:number|null;p90Ms:number|null;per1000CharsMs:number|null;
}
export interface AiLogModelSummary extends AiLogSummary {model:string}
export const AI_LOG_TIME_ZONE='Asia/Ho_Chi_Minh';
const hourFormat=new Intl.DateTimeFormat('en-GB',{timeZone:AI_LOG_TIME_ZONE,hour:'2-digit',hourCycle:'h23'});
export function aiLogHour(startedAt:number):number{return Number(hourFormat.format(startedAt));}
export function aiLogDuration(row:AiLogEvent):number|undefined{
 const value=row.schemaVersion===2&&row.kind==='chapter'?row.telemetry?.client?.timing.workCompleteMs:row.durationMs;
 return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined;
}
export function summarize(rows:readonly AiLogEvent[]):AiLogSummary{
 const success=rows.filter(row=>row.status==='success');
 const timed=success.filter(row=>aiLogDuration(row)!==undefined);
 const durations=timed.map(row=>aiLogDuration(row)!).sort((a,b)=>a-b);
 const n=durations.length,errors=rows.filter(row=>row.status==='error').length,sample=success.length+errors;
 const charRows=timed.filter(row=>row.sourceChars>0);
 const chars=charRows.reduce((sum,row)=>sum+row.sourceChars,0);
 return {total:rows.length,success:success.length,errors,cancelled:rows.filter(row=>row.status==='cancelled').length,cache:rows.filter(row=>row.status==='cache').length,sample,successRate:sample?success.length/sample:null,failureRate:sample?errors/sample:null,
  durationN:n,meanMs:n?durations.reduce((sum,value)=>sum+value,0)/n:null,
  medianMs:n?(durations[Math.floor((n-1)/2)]+durations[Math.ceil((n-1)/2)])/2:null,
  p90Ms:n?durations[Math.ceil(n*.9)-1]:null,
  per1000CharsMs:chars?charRows.reduce((sum,row)=>sum+aiLogDuration(row)!,0)/chars*1000:null};
}
function byModel(rows:readonly AiLogEvent[]):AiLogModelSummary[]{
 const groups=new Map<string,AiLogEvent[]>();
 for(const row of rows){const model=row.model||'unknown';const group=groups.get(model)||[];group.push(row);groups.set(model,group);}
 return Array.from(groups,([model,group])=>({model,...summarize(group)})).sort((a,b)=>a.model.localeCompare(b.model));
}
/** Uses direct successful samples; upstream HTTP outcomes never determine validation success. */
export function aggregateAiLogs(rows:readonly AiLogEvent[],options:{now:number;days:number;model?:string;purpose?:string}){
 const cutoff=options.now-options.days*86_400_000;
 const filtered=rows.filter(row=>row.startedAt>=cutoff&&row.startedAt<=options.now&&(!options.model||row.model===options.model)&&(!options.purpose||options.purpose==='all'||(options.purpose==='reading'?row.telemetry?.trace?.purpose!=='trial':options.purpose==='unknown'?!row.telemetry?.trace:row.telemetry?.trace?.purpose===options.purpose)));
 const requests=filtered.filter(row=>row.kind==='request'),chapters=filtered.filter(row=>row.kind==='chapter');
 const reasons=new Map<string,{reason:string;requests:number;chapters:number}>();
 for(const row of filtered.filter(row=>row.status==='error')){
  const reason=row.reason||row.errorCode||'unknown',group=reasons.get(reason)||{reason,requests:0,chapters:0};
  if(row.kind==='request')group.requests++;else group.chapters++;
  reasons.set(reason,group);
 }
 const upstream={total:0,httpOk:0,httpErrors:0,transportErrors:0,reportedErrors:0,failed:0};
 const upstreamCauses=new Map<string,number>();
 for(const row of requests){
  if(row.status==='cache'||row.status==='cancelled')continue;
  for(const attempt of row.upstream||[]){
   upstream.total++;
   if(attempt.status>=200&&attempt.status<300)upstream.httpOk++;
   else if(attempt.status===0)upstream.transportErrors++;
   else upstream.httpErrors++;
   if(attempt.errorCode)upstream.reportedErrors++;
   if(attempt.errorCode||attempt.status<200||attempt.status>=300){
    upstream.failed++;
    const reason=attempt.errorCode||(attempt.status===0?'network':`http_${attempt.status}`);
    upstreamCauses.set(reason,(upstreamCauses.get(reason)||0)+1);
   }
  }
 }
 return {rows:[...filtered].sort((a,b)=>b.startedAt-a.startedAt),request:summarize(requests),chapter:summarize(chapters),
  requestModels:byModel(requests),chapterModels:byModel(chapters),
  hours:Array.from({length:24},(_,hour)=>({hour,...summarize(requests.filter(row=>aiLogHour(row.startedAt)===hour))})),
  reasons:[...reasons.values()].sort((a,b)=>(b.requests+b.chapters)-(a.requests+a.chapters)||a.reason.localeCompare(b.reason)),upstream,
  upstreamReasons:Array.from(upstreamCauses,([reason,count])=>({reason,count,share:count/upstream.failed})).sort((a,b)=>b.count-a.count||a.reason.localeCompare(b.reason))};
}
