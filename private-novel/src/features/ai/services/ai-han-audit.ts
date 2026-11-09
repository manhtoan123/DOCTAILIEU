import {readAiHanRepair,type AiHanRepair} from './ai-han-repair';
export interface AiHanAudit extends AiHanRepair {result:string}
export interface AiHanAudits {hanRepairs?:AiHanAudit[];hanRepairAuditTruncated?:boolean}
/** Leaf provenance is independent of assembled prose and never feeds speech text. */
export function readAiHanAudits(value:unknown):AiHanAudits{
 if(!value||typeof value!=='object')return {};
 const row=value as Record<string,unknown>,records:Array<AiHanAudit>=[];let bytes=0,truncated=row.hanRepairAuditTruncated===true;
 if(Array.isArray(row.hanRepairs))for(const item of row.hanRepairs.slice(0,129)){
  if(!item||typeof item!=='object')continue;const audit=item as Record<string,unknown>;
  if(typeof audit.result!=='string')continue;
  const clean=readAiHanRepair(audit,audit.result);if(!clean)continue;
  const record={...clean,result:audit.result},size=new TextEncoder().encode(JSON.stringify(record)).length;
  if(records.length>=128||bytes+size>256*1024){truncated=true;continue;}records.push(record);bytes+=size;
 }
 if(Array.isArray(row.hanRepairs)&&row.hanRepairs.length>128)truncated=true;
 return {...(records.length?{hanRepairs:records}:{}),...(truncated?{hanRepairAuditTruncated:true}: {})};
}
export function combineAiHanAudits(values:readonly AiHanAudits[]):AiHanAudits{
 const merged=readAiHanAudits({hanRepairs:values.flatMap(value=>value.hanRepairs??[]),hanRepairAuditTruncated:values.some(value=>value.hanRepairAuditTruncated)});
 return {hanRepairs:merged.hanRepairs,hanRepairAuditTruncated:merged.hanRepairAuditTruncated};
}
