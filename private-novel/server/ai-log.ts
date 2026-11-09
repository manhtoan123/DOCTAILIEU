import type {D1Database} from '@cloudflare/workers-types';
import type {AiLogEvent,AiLogResponse} from '../src/shared/types/ai-log';
import {readAiLogTelemetry} from '../src/shared/types/ai-log-v2';
import {AI_MODELS,LEGACY_AI_MODELS} from '../src/features/ai/types/ai-models';
import {handleCloudDeviceAuth,type CloudDeviceEnv} from './cloud-device-auth';

export const AI_LOG_LIMIT=5000,AI_LOG_RETENTION_DAYS=30,AI_LOG_MAX_BYTES=8192;
const retentionMs=AI_LOG_RETENTION_DAYS*86400000;
const models=new Set<string>([...AI_MODELS.map(m=>m.id),...LEGACY_AI_MODELS,'gemini-2.5-pro','gemini-2.5-flash-lite','gemini-4-argon','mixed','unknown']);
export const AI_LOG_ERROR_CODES=new Set(['ai_untranslated_result','ai_request_rejected','ai_timeout','ai_network_error','ai_gateway_error','ai_rate_limited','ai_upstream_error','ai_auth_error','ai_not_configured','ai_provider_unavailable','ai_invalid_model','ai_incomplete_result','ai_invalid_response','ai_response_too_large','ai_empty_result','ai_location_unavailable','ai_recovery_exhausted','ai_cancelled','invalid_result','invalid_content_type','invalid_json','invalid_request','invalid_temperature','invalid_prompt','invalid_names','text_empty','text_too_long','prompt_too_large','method_not_allowed']);
export const AI_LOG_REASONS=new Set(['unknown','untranslated_source','request_validation','not_configured','upstream_content_type','upstream_invalid_json','upstream_body_read','upstream_schema','upstream_candidates','upstream_parts','upstream_usage','upstream_finish_reason','upstream_empty_result','size_limit','upstream_http','timeout','cancelled','network','output_limit','body_stream','json','http','content_type','empty_body','schema','finish_reason','result_type','empty_result','model','usage','chapter_deadline','send_limit','cooldown']);
const fields=new Set(['id','kind','startedAt','updatedAt','durationMs','status','model','errorCode','reason','sourceChars','attempts','upstream','schemaVersion','telemetry']);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
/** Rebuild an allowlisted record; neither arbitrary error strings nor nested input survive. */
export function readAiLogEvent(value:unknown,now=Date.now(),client=false):AiLogEvent|undefined{
 if(!object(value)||Object.keys(value).some(key=>!fields.has(key)))return;
 const v=value;if(v.kind!=='request'&&v.kind!=='chapter'||client&&v.kind!=='chapter')return;
 if(typeof v.id!=='string'||!new RegExp(`^${v.kind}:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`).test(v.id))return;
 if(!integer(v.startedAt,now-retentionMs,now+300000)||!integer(v.updatedAt,v.startedAt,now+300000)||!integer(v.durationMs,0,2147483647)||!integer(v.sourceChars,0,128000)||!integer(v.attempts,1,100000))return;
 if(!['success','error','cancelled','cache'].includes(String(v.status))||v.kind==='request'&&v.status==='cache'||typeof v.model!=='string'||!models.has(v.model))return;
 if(v.errorCode!==undefined&&(typeof v.errorCode!=='string'||!AI_LOG_ERROR_CODES.has(v.errorCode)))return;
 if(v.reason!==undefined&&(typeof v.reason!=='string'||!AI_LOG_REASONS.has(v.reason)))return;
 if((v.status==='success'||v.status==='cache')&&(v.errorCode!==undefined||v.reason!==undefined))return;
 let telemetry:AiLogEvent['telemetry'];
 if(v.schemaVersion!==undefined||v.telemetry!==undefined){
  if(v.schemaVersion!==2)return;
  telemetry=readAiLogTelemetry(v.telemetry,v.kind,models);if(!telemetry)return;
  if(v.kind==='chapter'&&v.id!==`chapter:${telemetry.trace!.workId}`)return;
 }
 let upstream:AiLogEvent['upstream'];
 if(v.upstream!==undefined){
  if(client||v.kind!=='request'||!Array.isArray(v.upstream)||v.upstream.length>32)return;
  upstream=[];
  for(const row of v.upstream){
   if(!object(row)||Object.keys(row).some(key=>!['status','errorCode','durationMs'].includes(key))||!integer(row.status,0,599)||row.status>0&&row.status<100||!integer(row.durationMs,0,2147483647)||row.errorCode!==undefined&&(typeof row.errorCode!=='string'||!AI_LOG_ERROR_CODES.has(row.errorCode)))return;
   upstream.push({status:row.status,durationMs:row.durationMs,...(typeof row.errorCode==='string'?{errorCode:row.errorCode}:{})});
  }
 }
 return {id:v.id,kind:v.kind,startedAt:v.startedAt,updatedAt:v.updatedAt,durationMs:v.durationMs,status:v.status as AiLogEvent['status'],model:v.model,sourceChars:v.sourceChars,attempts:v.attempts,...(typeof v.errorCode==='string'?{errorCode:v.errorCode}:{}),...(typeof v.reason==='string'?{reason:v.reason}:{}),...(upstream?{upstream}:{}),...(telemetry?{schemaVersion:2,telemetry}:{})};
}

/** Atomic bounds; v2 sequence uses a single clock epoch, independent of wall-clock changes.
 * Terminal outcomes may gain visibility timing later, but cannot be downgraded. */
export async function writeAiLogEvent(db:D1Database|undefined,input:AiLogEvent,now=Date.now()):Promise<void>{
 if(!db)return;const event=readAiLogEvent(input,now);if(!event)throw new Error('invalid_ai_log');const json=JSON.stringify(event);if(new TextEncoder().encode(json).byteLength>AI_LOG_MAX_BYTES)throw new Error('invalid_ai_log');
 await db.batch([
  db.prepare('DELETE FROM ai_log WHERE started_at < ?').bind(now-retentionMs),
  db.prepare(`INSERT INTO ai_log (id,kind,started_at,updated_at,received_at,status,attempts,event) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,received_at=excluded.received_at,status=excluded.status,attempts=excluded.attempts,event=excluded.event
   WHERE ai_log.kind='chapter' AND excluded.kind='chapter' AND ai_log.started_at=excluded.started_at AND (
    (json_extract(ai_log.event,'$.schemaVersion') IS NULL AND json_extract(excluded.event,'$.schemaVersion') IS NULL AND ai_log.status NOT IN ('success','cache') AND excluded.attempts>=ai_log.attempts AND excluded.updated_at>=ai_log.updated_at)
    OR (json_extract(ai_log.event,'$.schemaVersion')=2 AND json_extract(excluded.event,'$.schemaVersion')=2
     AND json_extract(ai_log.event,'$.telemetry.client.timing.epoch')=json_extract(excluded.event,'$.telemetry.client.timing.epoch')
     AND json_extract(excluded.event,'$.telemetry.client.timing.sequence')>json_extract(ai_log.event,'$.telemetry.client.timing.sequence')
     AND excluded.attempts>=ai_log.attempts
     AND json_extract(excluded.event,'$.durationMs')>=json_extract(ai_log.event,'$.durationMs')
     AND (ai_log.status NOT IN ('success','cache') OR ai_log.status=excluded.status)
    )
   )`).bind(event.id,event.kind,event.startedAt,event.updatedAt,now,event.status,event.attempts,json),
  db.prepare('DELETE FROM ai_log WHERE id IN (SELECT id FROM ai_log ORDER BY started_at DESC,id DESC LIMIT -1 OFFSET ?)').bind(AI_LOG_LIMIT),
 ]);
}
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function boundedJson(request:Request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))throw new Error('content_type');
 const reader=request.body?.getReader();if(!reader)throw new Error('body');let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>AI_LOG_MAX_BYTES)throw new Error('size');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function handleAiLogs(request:Request,env:CloudDeviceEnv):Promise<Response>{
 return handleCloudDeviceAuth(request,env,async()=>{
  if(request.method!=='GET'&&request.method!=='POST')return response({error:'method_not_allowed'},405);
  try{
   const now=Date.now();
   if(request.method==='POST'){
    let input:unknown;try{input=await boundedJson(request);}catch{return response({error:'invalid_ai_log'},400);}
    const event=readAiLogEvent(input,now,true);if(!event)return response({error:'invalid_ai_log'},400);
    await writeAiLogEvent(env.DB,event,now);return response({ok:true});
   }
   const result=await env.DB.prepare('SELECT event FROM ai_log WHERE started_at>=? ORDER BY started_at DESC,id DESC LIMIT ?').bind(now-retentionMs,AI_LOG_LIMIT).all<{event:string}>();
   const rows=result.results.flatMap(row=>{try{const event=readAiLogEvent(JSON.parse(row.event),now);return event?[event]:[];}catch{return [];}});
   const body:AiLogResponse={rows,serverNow:now,earliest:rows.length?Math.min(...rows.map(row=>row.startedAt)):null,limit:AI_LOG_LIMIT,retentionDays:AI_LOG_RETENTION_DAYS,schemaVersions:[1,2]};return response(body);
  }catch{return response({error:'ai_log_unavailable'},503);}
 });
}
