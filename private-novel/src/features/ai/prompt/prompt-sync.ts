import {db} from '../../../core/db';
import {queueAiSettings} from '../services/ai-reading';
import {getPromptStock,applySharedPromptStock} from './prompt-stock';
import {PROMPT_STOCK_KEY,DEFAULT_PROMPT_PROFILE_ID,validatePromptProfile,validatePromptStock,type PromptStock,type PromptProfile} from './prompt-schema';
export const PROMPT_SYNC_KEY='prompt-sync-v1';
export interface SharedPromptRow{id:string;revision:number;profile:PromptProfile|null}
interface Meta{version:1;cursor:number;base:Record<string,SharedPromptRow>;conflicts:Record<string,SharedPromptRow>}
export interface PromptSyncStatus{state:'local'|'syncing'|'synced'|'conflict';message:string}
let status:PromptSyncStatus={state:'local',message:'Đang dùng prompt trên thiết bị'},flight:Promise<void>|undefined;
const empty=():Meta=>({version:1,cursor:0,base:Object.create(null),conflicts:Object.create(null)});
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function row(value:unknown):SharedPromptRow{
 const r=value as SharedPromptRow;if(!r||typeof r.id!=='string'||!r.id||r.id.length>300||/^(?:__proto__|prototype|constructor)$/.test(r.id)||r.id===DEFAULT_PROMPT_PROFILE_ID||!Number.isSafeInteger(r.revision)||r.revision<1)throw Error('Dữ liệu đồng bộ prompt không hợp lệ.');
 const profile=r.profile===null?null:validatePromptProfile(r.profile);if(profile&&profile.id!==r.id)throw Error('ID prompt không khớp.');return {id:r.id,revision:r.revision,profile};
}
async function meta():Promise<Meta>{
 const stored=await db.settings.get(PROMPT_SYNC_KEY);if(!stored)return empty();const m=stored.value as Meta;
 if(!m||m.version!==1||!Number.isSafeInteger(m.cursor)||m.cursor<0||!m.base||typeof m.base!=='object'||Array.isArray(m.base)||!m.conflicts||typeof m.conflicts!=='object'||Array.isArray(m.conflicts))throw Error('Trạng thái đồng bộ prompt hỏng; dữ liệu được giữ nguyên.');
 for(const [id,r] of [...Object.entries(m.base),...Object.entries(m.conflicts)])if(row(r).id!==id)throw Error('Trạng thái đồng bộ prompt không khớp.');return {...m,base:Object.assign(Object.create(null),m.base),conflicts:Object.assign(Object.create(null),m.conflicts)};
}
function publish(value:PromptSyncStatus){status=value;if(typeof window!=='undefined')window.dispatchEvent(new Event('prompt-sync-status'));}
export const getPromptSyncStatus=()=>status;
export function promptStockChanged(){if(typeof window!=='undefined')window.dispatchEvent(new Event('prompt-stock-changed'));}
async function response(response:Response):Promise<any>{
 const reader=response.body?.getReader();if(!reader)throw Error('Không nhận được kho prompt.');let bytes=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
 // Server caps profile JSON at8MiB; up to2000 IDs/tombstones add metadata.
 try{for(;;){const p=await reader.read();if(p.done)break;bytes+=p.value.length;if(bytes>12*1048576)throw Error('Kho prompt đồng bộ quá lớn.');text+=decoder.decode(p.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function localOperation<T>(operation:()=>Promise<T>){return queueAiSettings(PROMPT_STOCK_KEY,()=>db.transaction('rw',db.settings,operation));}
async function receive(rows:SharedPromptRow[],revision:number){
 await localOperation(async()=>{
  const m=await meta(),stored=await db.settings.get(PROMPT_STOCK_KEY);const stock=validatePromptStock(stored?.value);
  const profiles=new Map(stock.profiles.map(p=>[p.id,p]));
  for(const remote of rows){
   const current=profiles.get(remote.id)??null,base=m.base[remote.id]?.profile??null;
   if(m.base[remote.id]&&remote.revision<=m.base[remote.id].revision)continue;
   if(equal(current,remote.profile)){delete m.conflicts[remote.id];}
   else if(!equal(current,base)){m.conflicts[remote.id]=remote;}
   else {if(remote.profile)profiles.set(remote.id,remote.profile);else profiles.delete(remote.id);delete m.conflicts[remote.id];}
   m.base[remote.id]=remote;
  }
  m.cursor=Math.max(m.cursor,revision);await applySharedPromptStock({...stock,profiles:[...profiles.values()]});await db.settings.put({key:PROMPT_SYNC_KEY,value:m});
 });
}
async function run(){
 publish({state:'syncing',message:'Đang đồng bộ prompt…'});
 try{
  await getPromptStock();const before=await meta();
  const received=await fetch(`/api/prompts?after=${before.cursor}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!received.ok)throw Error('Chưa kết nối được kho prompt chung.');
  const data=await response(received);if(!Number.isSafeInteger(data.revision)||data.revision<before.cursor||!Array.isArray(data.rows)||data.rows.length>2000)throw Error('Kho prompt chung không hợp lệ.');
  const rows=data.rows.map(row);if(new Set(rows.map((r:SharedPromptRow)=>r.id)).size!==rows.length||rows.some((r:SharedPromptRow)=>r.revision>data.revision))throw Error('Phiên bản kho prompt không hợp lệ.');
  await receive(rows,data.revision);
  const stock=await getPromptStock(),m=await meta(),profiles=new Map(stock.profiles.filter(p=>p.id!==DEFAULT_PROMPT_PROFILE_ID).map(p=>[p.id,p]));
  for(const id of new Set([...profiles.keys(),...Object.keys(m.base)])){
   if(m.conflicts[id])continue;const profile=profiles.get(id)??null,base=m.base[id];if(equal(profile,base?.profile??null))continue;
   const sent=await fetch('/api/prompts',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,baseRevision:base?.revision??0,profile}),signal:AbortSignal.timeout(15000)});
   const result=await response(sent);if(sent.status===409){await receive([row(result.row)],data.revision);continue;}if(!sent.ok)throw Error('Chưa gửi được thay đổi prompt; bản trên máy vẫn được giữ.');
   const acknowledged=row(result.row);if(acknowledged.id!==id||acknowledged.revision<=(base?.revision??0)||!equal(acknowledged.profile,profile))throw Error('Máy chủ chưa xác nhận đúng prompt.');
   await localOperation(async()=>{const latest=await meta();if(!latest.base[id]||latest.base[id].revision<=acknowledged.revision){latest.base[id]=acknowledged;delete latest.conflicts[id];await db.settings.put({key:PROMPT_SYNC_KEY,value:latest});}});
  }
  const latest=await meta(),current=await getPromptStock();const conflict=Object.keys(latest.conflicts).length;
  const pending=current.profiles.some(p=>p.id!==DEFAULT_PROMPT_PROFILE_ID&&!equal(p,latest.base[p.id]?.profile))||Object.values(latest.base).some(r=>r.profile&&!current.profiles.some(p=>p.id===r.id));
  publish(conflict?{state:'conflict',message:`${conflict} prompt có hai bản khác nhau`}:pending?{state:'local',message:'Có thay đổi chưa đồng bộ'}:{state:'synced',message:'Đã đồng bộ giữa các thiết bị'});
 }catch(error){publish({state:'local',message:error instanceof Error?error.message:'Chưa đồng bộ; bản trên thiết bị vẫn được giữ.'});}
}
export function syncPromptStock():Promise<void>{if(!flight)flight=run().finally(()=>{flight=undefined;});return flight;}
export async function getPromptConflicts(){return Object.values((await meta()).conflicts);}
export async function resolvePromptConflict(id:string,choice:'local'|'shared'){
 if(flight)await flight;
 await localOperation(async()=>{const m=await meta(),remote=m.conflicts[id];if(!remote)return;const stored=await db.settings.get(PROMPT_STOCK_KEY),stock=validatePromptStock(stored?.value);
  if(choice==='shared'){const profiles=stock.profiles.filter(p=>p.id!==id);if(remote.profile)profiles.push(remote.profile);await applySharedPromptStock({...stock,profiles});}
  delete m.conflicts[id];await db.settings.put({key:PROMPT_SYNC_KEY,value:m});
 });await syncPromptStock();
}
export function startPromptSync(){
 const run=()=>{if(document.visibilityState==='visible')void syncPromptStock();};run();
 const timer=setInterval(run,30000);window.addEventListener('online',run);window.addEventListener('focus',run);window.addEventListener('prompt-stock-changed',run);document.addEventListener('visibilitychange',run);
 return()=>{clearInterval(timer);window.removeEventListener('online',run);window.removeEventListener('focus',run);window.removeEventListener('prompt-stock-changed',run);document.removeEventListener('visibilitychange',run);};
}
