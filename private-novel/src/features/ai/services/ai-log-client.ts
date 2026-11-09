import type {AiLogEvent,AiLogResponse} from '../../../shared/types/ai-log';
import {getCloudDeviceToken} from '../../sync-cloud/services/cloud-device';

const KEY='ai-log-outbox:v1',LIMIT=100;
let flushing:Promise<void>|undefined,initialized=false,capability:Promise<void>|undefined;
let v2=false;
export const supportsAiLogV2=()=>v2;
export function noteAiLogCapabilities(value:unknown){v2=Array.isArray(value)&&value.includes(2);}
/** A separate best-effort probe never gates translation or the outbox GET. */
function probe(){if(capability||typeof navigator==='undefined'||navigator.onLine===false)return;capability=(async()=>{const response=await fetch('/api/ai/logs',{headers:await headers(),credentials:'same-origin',cache:'no-store'});if(response.ok){const data=await response.json();noteAiLogCapabilities(data?.schemaVersions);if(v2)void flushAiLogOutbox();}})().catch(()=>{}).finally(()=>{capability=undefined;});}
function read():AiLogEvent[]{
 try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value.filter(row=>row&&typeof row.id==='string'&&/^chapter:[a-f0-9-]{36}$/.test(row.id)&&row.kind==='chapter').slice(-LIMIT):[];}catch{return [];}
}
function write(rows:AiLogEvent[]){try{if(rows.length)localStorage.setItem(KEY,JSON.stringify(rows.slice(-LIMIT)));else localStorage.removeItem(KEY);}catch{/* Telemetry cannot block reading. */}}
function sameSnapshot(a:AiLogEvent,b:AiLogEvent){if(a.id!==b.id||a.updatedAt!==b.updatedAt||a.attempts!==b.attempts||a.schemaVersion!==b.schemaVersion)return false;if(a.schemaVersion!==2)return true;const x=a.telemetry?.client?.timing,y=b.telemetry?.client?.timing;return x?.epoch===y?.epoch&&x?.sequence===y?.sequence;}
async function headers(){const token=await getCloudDeviceToken();return {'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})};}
export function queueAiChapterLog(event:AiLogEvent){
 if(typeof window==='undefined')return;
 const rows=read(),index=rows.findIndex(row=>row.id===event.id);
 if(index>=0){const old=rows[index];if((old.status==='success'||old.status==='cache')&&old.status!==event.status||old.attempts>event.attempts||old.schemaVersion!==2&&old.updatedAt>event.updatedAt||old.schemaVersion===2&&event.schemaVersion===2&&(old.telemetry?.client?.timing.sequence??0)>=(event.telemetry?.client?.timing.sequence??0))return;rows.splice(index,1);}
 write([...rows,event]);initializeAiLogOutbox();void flushAiLogOutbox();
}
export function initializeAiLogOutbox(){
 if(initialized||typeof window==='undefined')return;initialized=true;
 window.addEventListener('online',()=>{probe();void flushAiLogOutbox();});probe();void flushAiLogOutbox();
}
export function flushAiLogOutbox():Promise<void>{
 if(typeof window==='undefined'||typeof navigator==='undefined'||navigator.onLine===false)return Promise.resolve();
 if(flushing)return flushing;
 flushing=(async()=>{
  let auth:Awaited<ReturnType<typeof headers>>;try{auth=await headers();}catch{return;}
  // Rejected v2 snapshots stay bounded in this outbox, but are skipped for the
  // remainder of this flush so a stale/mixed server cannot starve newer work.
  const deferred:AiLogEvent[]=[];
  for(let sent=0;sent<LIMIT;sent++){
   const row=read().find(candidate=>(candidate.schemaVersion!==2||v2)&&!deferred.some(old=>sameSnapshot(old,candidate)));if(!row){if(read().length&&!v2)probe();return;}const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
   try{
    const response=await fetch('/api/ai/logs',{method:'POST',headers:auth,body:JSON.stringify(row),signal:controller.signal,credentials:'same-origin'});
    // Malformed/expired individual records cannot permanently block newer logs.
    if(!response.ok){if(![400,413,422].includes(response.status))return;if(row.schemaVersion===2){deferred.push(row);continue;}}
    write(read().filter(current=>!sameSnapshot(current,row)));
   }catch{return;}finally{clearTimeout(timer);}
  }
 })().catch(()=>{}).finally(()=>{flushing=undefined;});return flushing;
}
export async function fetchAiLogs(signal?:AbortSignal):Promise<AiLogResponse>{
 initializeAiLogOutbox();
 void flushAiLogOutbox();
 const response=await fetch('/api/ai/logs',{headers:await headers(),signal,credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw Error(response.status===401?'Cần kết nối lại thiết bị để xem nhật ký.':'Chưa tải được nhật ký chung. Bạn có thể thử lại.');
 const data=await response.json() as AiLogResponse;
 if(!data||!Array.isArray(data.rows)||data.rows.length>5000||!Number.isFinite(data.serverNow))throw Error('Nhật ký chưa trả dữ liệu hợp lệ.');
 noteAiLogCapabilities(data.schemaVersions);return data;
}
