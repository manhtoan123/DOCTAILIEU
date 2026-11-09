import type {AiLogEvent} from '../../../shared/types/ai-log';
import {summarize} from './ai-log-stats';
const known=(value:unknown)=>value===undefined||value===null?'unknown':String(value);
export function aiLogCohort(row:AiLogEvent){
 const t=row.telemetry,e=t?.server?.execution,c=t?.context;
 return [row.model,row.schemaVersion??1,t?.metricVersion??'unknown',e?.promptId,known(e?.temperature),e?.thinking,e?.maxOutputTokens,
  t?.trace?.purpose,t?.trace?.initialPurpose,t?.trace?.fallbackIndex,c?.format,c?.strategy,row.sourceChars<6000?'under6000':'6000plus',c?.appVersion,c?.policyVersion,c?.validationVersion].map(known).join('|');
}
function measured(values:(number|undefined)[]){const xs=values.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0).sort((a,b)=>a-b),n=xs.length;return {n,mean:n?xs.reduce((a,b)=>a+b,0)/n:null,median:n?(xs[Math.floor((n-1)/2)]+xs[Math.ceil((n-1)/2)])/2:null,p90:n?xs[Math.ceil(n*.9)-1]:null};}
export function aiLogInsights(rows:readonly AiLogEvent[],filters:{purpose?:string;format?:string;prompt?:string}={}){
 const promptCandidates=new Set(rows.filter(r=>r.kind==='request'&&r.telemetry?.server?.execution?.promptId===filters.prompt).flatMap(r=>r.telemetry?.trace?[r.telemetry.trace.workId]:[]));
 const promptWorks=new Set([...promptCandidates].filter(id=>rows.filter(r=>r.kind==='request'&&r.telemetry?.trace?.workId===id).every(r=>r.telemetry?.server?.execution?.promptId===filters.prompt)));
 const selected=rows.filter(r=>(!filters.purpose||r.telemetry?.trace?.purpose===filters.purpose)&&(!filters.format||r.telemetry?.context?.format===filters.format)&&(!filters.prompt||(r.kind==='request'?r.telemetry?.server?.execution?.promptId===filters.prompt:!!r.telemetry?.trace&&promptWorks.has(r.telemetry.trace.workId))));
 const groups=new Map<string,AiLogEvent[]>();
 for(const row of selected.filter(r=>r.kind==='request')){const key=aiLogCohort(row);groups.set(key,[...(groups.get(key)??[]),row]);}
 const chapters=selected.filter(r=>r.kind==='chapter'&&r.status==='success');
 const linked=new Map<string,{id:string;chapter?:AiLogEvent;requests:AiLogEvent[]}>();
 for(const row of selected){const id=row.telemetry?.trace?.workId;if(!id)continue;const work=linked.get(id)??{id,requests:[]};if(row.kind==='chapter')work.chapter=row;else work.requests.push(row);linked.set(id,work);}
 return {selected,legacy:selected.filter(r=>r.schemaVersion!==2).length,unlinked:selected.filter(r=>!r.telemetry?.trace).length,
  cohorts:[...groups].map(([key,samples])=>({key,row:samples[0],...summarize(samples)})),
  firstChunk:measured(selected.filter(r=>r.kind==='request'&&r.status==='success').map(r=>r.telemetry?.server?.timing.firstChunkMs)),
  preview:measured(chapters.map(r=>r.telemetry?.client?.timing.previewVisibleMs)),
  accepted:measured(chapters.map(r=>r.telemetry?.client?.timing.acceptedContentVisibleMs)),
  foreground:measured(chapters.filter(r=>r.telemetry?.trace?.purpose==='foreground').map(r=>r.telemetry?.client?.timing.foregroundAcceptedMs)),
  complete:measured(chapters.map(r=>r.telemetry?.client?.timing.workCompleteMs)),
  recovered:chapters.filter(r=>r.telemetry?.client?.recovery&&r.telemetry.client.recovery!=='none').length,
  works:[...linked.values()].sort((a,b)=>(b.chapter?.startedAt??b.requests[0]?.startedAt??0)-(a.chapter?.startedAt??a.requests[0]?.startedAt??0))};
}
