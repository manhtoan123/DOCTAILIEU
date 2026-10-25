import type {D1Database} from '@cloudflare/workers-types';
import {sha256} from './auth';
interface Row {sealed:string|null;revision:number;blocked_until:number}
export interface CapcutRuntime {bootstrap:string;cookie:string;revision:number;blocked:boolean;key:CryptoKey}
const encoder=new TextEncoder();
function base64(bytes:Uint8Array){let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);}
function bytes(raw:string){return Uint8Array.from(atob(raw),c=>c.charCodeAt(0));}
export function validCapcutCookie(cookie:unknown):cookie is string{return typeof cookie==='string'&&cookie.length>0&&cookie.length<=8192&&/^[\x20-\x7e]+$/.test(cookie)&&cookie.split(';').every(p=>/^[!#$%&'*+.^_`|~0-9A-Za-z-]+=[^;]*$/.test(p.trim()))&&cookie.split(';').some(p=>/^(sessionid|sessionid_ss|sid_tt)=.+$/.test(p.trim()));}
export async function loadCapcutRuntime(db:D1Database,secret:string,cookie:string):Promise<CapcutRuntime>{
 const bootstrap=await sha256(secret),material=await crypto.subtle.digest('SHA-256',encoder.encode('capcut-runtime-key:v1:'+secret));
 const key=await crypto.subtle.importKey('raw',material,'AES-GCM',false,['encrypt','decrypt']);
 const row=await db.prepare('SELECT sealed,revision,blocked_until FROM capcut_runtime_session WHERE bootstrap=?').bind(bootstrap).first<Row>();
 if(row?.sealed){
  try{if(row.sealed.length>24*1024)throw Error();const [iv,body]=row.sealed.split('.');const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:encoder.encode(bootstrap)},key,bytes(body));const candidate=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(decoded);if(!validCapcutCookie(candidate))throw Error();cookie=candidate;}
  catch{throw Error('capcut_runtime_invalid');}
 }
 return {bootstrap,cookie,key,revision:row?.revision??0,blocked:(row?.blocked_until??0)>Date.now()};
}
/** Only Set-Cookie from the fixed authenticated synthesis endpoint is accepted. */
export function mergeCapcutCookies(cookie:string,headers:Headers,now=Date.now()){
 const cookieHeaders=headers as Headers & {getAll?:(name:string)=>string[];getSetCookie?:()=>string[]};
 const values:string[]=typeof cookieHeaders.getSetCookie==='function'?cookieHeaders.getSetCookie():typeof cookieHeaders.getAll==='function'?cookieHeaders.getAll('Set-Cookie'):[];
 if(values.length>32)return cookie;
 const pairs=new Map(cookie.split(';').map(p=>{const at=p.indexOf('=');return [p.slice(0,at).trim(),p.slice(at+1)] as const;}));
 for(const value of values){
  if(value.length>8192||!/^[\x20-\x7e]+$/.test(value))continue;
  const [pair,...parts]=value.split(';'),at=pair.indexOf('=');if(at<1)continue;
  const name=pair.slice(0,at).trim(),content=pair.slice(at+1);
  if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)||!pairs.has(name)&&!/^(sessionid|sessionid_ss|sid_tt|passport_csrf_token|passport_csrf_token_default)$/.test(name))continue;
  const attrs=new Map(parts.map(p=>{const at=p.indexOf('=');return [p.slice(0,at<0?undefined:at).trim().toLowerCase(),at<0?'':p.slice(at+1).trim()] as const;}));
  const domain=attrs.get('domain')?.toLowerCase().replace(/^\./,''),path=attrs.get('path')??'/';
  if(domain&&domain!=='capcut.com'&&domain!=='edit-api-sg.capcut.com'||!path.startsWith('/')||!('/storyboard/v1/tts/multi_platform'===path||'/storyboard/v1/tts/multi_platform'.startsWith(path.endsWith('/')?path:path+'/')))continue;
  const max=attrs.get('max-age'),expiry=attrs.get('expires');
  if(max!==undefined&&/^-?\d+$/.test(max)?Number(max)<=0:expiry!==undefined&&Number.isFinite(Date.parse(expiry))&&Date.parse(expiry)<=now)pairs.delete(name);else pairs.set(name,content);
 }
 const merged=[...pairs].map(([name,value])=>name+'='+value).join('; ');return validCapcutCookie(merged)?merged:cookie;
}
export async function storeCapcutRuntime(db:D1Database,current:CapcutRuntime,cookie:string,expired=false){
 if(!validCapcutCookie(cookie))return;
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const sealed=base64(iv)+'.'+base64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(current.bootstrap)},current.key,encoder.encode(cookie))));
 const now=Date.now();
 // Old in-flight requests cannot replace a newer rotated credential or status.
 await db.prepare('INSERT INTO capcut_runtime_session(bootstrap,sealed,revision,blocked_until,updated_at) VALUES (?,?,1,?,?) ON CONFLICT(bootstrap) DO UPDATE SET sealed=excluded.sealed,revision=capcut_runtime_session.revision+1,blocked_until=excluded.blocked_until,updated_at=excluded.updated_at WHERE capcut_runtime_session.revision=?').bind(current.bootstrap,sealed,expired?now+300000:0,now,current.revision).run();
 await db.prepare('DELETE FROM capcut_runtime_session WHERE bootstrap<>? AND bootstrap NOT IN (SELECT bootstrap FROM capcut_runtime_session ORDER BY updated_at DESC LIMIT 3)').bind(current.bootstrap).run();
}
