import type {D1Database} from '@cloudflare/workers-types';
import {loadCapcutRuntime,mergeCapcutCookies,storeCapcutRuntime,validCapcutCookie,type CapcutRuntime} from './capcut-session';
import {capcutMd5} from './capcut-md5';
import {capcutVietnameseVoices} from '../src/shared/constants/capcut-voices';
import {sha256} from './auth';

export interface CapcutTtsEnv {DB?:D1Database;CAPCUT_SESSION_JSON?:string;CAPCUT_SESSION_PERSISTENCE?:string}
interface Session {cookie:string;deviceId:string;tdid:string;region:string;appVersion:string}
const upstream='https://edit-api-sg.capcut.com/storyboard/v1/tts/multi_platform';
const voices:Record<string,{resource:string;name:string}>=Object.fromEntries(capcutVietnameseVoices.map(voice=>[voice.serverId,{resource:voice.resource,name:voice.name}]));
const DEADLINE_MS=20000,MAX_BODY=4096,MAX_JSON=64*1024,MAX_AUDIO=1024*1024;
class Failure extends Error {constructor(readonly status:number,readonly code:string,readonly retryAfter=0){super(code);}}
const reply=(status:number,code:string,retryAfter=0)=>Response.json({success:false,error:code},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(retryAfter?{'Retry-After':String(retryAfter)}:{})}});
function session(raw:string|undefined):Session {
  if(!raw)throw new Failure(503,'capcut_not_configured');
  if(raw.length>16*1024)throw new Failure(503,'capcut_configuration_invalid');
  let data:unknown;try{data=JSON.parse(raw);}catch{throw new Failure(503,'capcut_configuration_invalid');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Failure(503,'capcut_configuration_invalid');
  const p=data as Record<string,unknown>,cookie=p.cookie,deviceId=p.deviceId,tdid=p.tdid??'',region=p.region??'VN',appVersion=p.appVersion??'5.8.0';
  if(!validCapcutCookie(cookie)
    ||typeof deviceId!=='string'||!/^\d{1,32}$/.test(deviceId)
    ||typeof tdid!=='string'||!/^(?:\d{0,32}|web)$/.test(tdid)
    ||typeof region!=='string'||!/^[A-Z]{2}$/.test(region)
    ||typeof appVersion!=='string'||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(appVersion))throw new Failure(503,'capcut_configuration_invalid');
  return {cookie,deviceId,tdid,region,appVersion};
}
async function bounded(source:Request|Response,limit:number,signal:AbortSignal):Promise<Uint8Array>{
  const declared=source.headers.get('Content-Length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit)){void source.body?.cancel().catch(()=>{});throw new Failure(source instanceof Request?413:502,'tts_payload_too_large');}
  const reader=source.body?.getReader();if(!reader)throw new Failure(400,'tts_empty_body');
  const chunks:Uint8Array[]=[];let size=0;
  let rejectAbort!:(error:Error)=>void;
  const canceled=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  const abort=()=>{void reader.cancel().catch(()=>{});rejectAbort(new Failure(504,'tts_timeout'));};
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  try{for(;;){const part=await Promise.race([reader.read(),canceled]);if(signal.aborted)throw new Failure(504,'tts_timeout');if(part.done)break;size+=part.value.length;if(size>limit)throw new Failure(source instanceof Request?413:502,'tts_payload_too_large');chunks.push(part.value);}}
  finally{signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}return bytes;
}
function json(bytes:Uint8Array):Record<string,unknown>{
  try{const p:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));if(p&&typeof p==='object'&&!Array.isArray(p))return p as Record<string,unknown>;}catch{/* sanitized below */}
  throw new Failure(502,'capcut_invalid_response');
}
async function admit(request:Request,db:D1Database|undefined,signal:AbortSignal){
  if(!db)throw new Failure(503,'tts_admission_unavailable',30);
  const now=Date.now(),minute=Math.floor(now/60000),day=Math.floor(now/86400000),ip=await sha256(request.headers.get('CF-Connecting-IP')??'local');
  try{
    // Atomic per bucket, shared across isolates. Failed admission may consume a
    // preceding bucket conservatively, but can never admit over any limit.
    for(const [bucket,limit,end]of [[`ip:${ip}:${minute}`,30,(minute+1)*60000],[`all:${minute}`,120,(minute+1)*60000],[`day:${day}`,6000,(day+1)*86400000]] as const){
      if(signal.aborted)throw new Failure(504,'tts_timeout');
      const row=await db.prepare('INSERT INTO login_limits (bucket, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 WHERE attempts < ? RETURNING attempts').bind('capcut-tts:'+bucket,end+60000,limit).first<{attempts:number}>();
      if(!row)throw new Failure(429,'tts_rate_limited',Math.max(1,Math.ceil((end-now)/1000)));
    }
    if(signal.aborted)throw new Failure(504,'tts_timeout');
    await db.prepare("DELETE FROM login_limits WHERE rowid IN (SELECT rowid FROM login_limits WHERE bucket LIKE 'capcut-tts:%' AND expires_at < ? LIMIT 32)").bind(now).run();
  }catch(error){if(error instanceof Failure)throw error;throw new Failure(503,'tts_admission_unavailable',30);}
}
function audioUrl(value:unknown):string {
  if(typeof value!=='string'||value.length>4096)throw new Failure(502,'capcut_invalid_audio_url');
  let url:URL;try{url=new URL(value);}catch{throw new Failure(502,'capcut_invalid_audio_url');}
  const domains=['byteoversea.com','byteoversea.net','ibytedtos.com','tiktokcdn.com','capcut.com'];
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!domains.some(domain=>url.hostname.endsWith('.'+domain)))throw new Failure(502,'capcut_invalid_audio_url');
  return url.toString();
}
function isMp3(bytes:Uint8Array){
  return bytes.length>=10&&bytes[0]===0x49&&bytes[1]===0x44&&bytes[2]===0x33
    ||bytes.length>=4&&bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0&&(bytes[1]&0x18)!==8&&(bytes[1]&6)!==0&&(bytes[2]&0xf0)!==0&&(bytes[2]&0xf0)!==0xf0&&(bytes[2]&12)!==12;
}
/** User-owned CapCut web session. No login/account creation, credential logging,
 * arbitrary upstream, persistence, or automatic provider/voice fallback. */
export async function handleCapcutTts(request:Request,env:CapcutTtsEnv):Promise<Response>{
  if(request.method!=='POST')return reply(405,'method_not_allowed');
  if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return reply(403,'invalid_origin');
  if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply(415,'json_required');
  const controller=new AbortController(),cancel=()=>controller.abort();
  request.signal.addEventListener('abort',cancel,{once:true});if(request.signal.aborted)cancel();
  const timer=setTimeout(cancel,DEADLINE_MS);
  let rejectAbort!:(error:Error)=>void;const canceled=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  const reject=()=>rejectAbort(new Failure(504,'tts_timeout'));controller.signal.addEventListener('abort',reject,{once:true});
  // Attach immediately so a request already canceled before work starts cannot
  // leave a rejected cancellation promise unobserved.
  void canceled.catch(()=>{});if(controller.signal.aborted)reject();
  const call=async(url:string,init:RequestInit)=>{
    if(controller.signal.aborted)throw new Failure(504,'tts_timeout');
    return Promise.race([fetch(url,{...init,redirect:'manual',signal:controller.signal}),canceled]);
  };
  try{
    const conf=session(env.CAPCUT_SESSION_JSON);
    const inputBytes=await bounded(request,MAX_BODY,controller.signal);
    let input:Record<string,unknown>;try{input=json(inputBytes);}catch{throw new Failure(400,'invalid_tts_input');}
    if(Object.keys(input).some(key=>key!=='text'&&key!=='voice')||typeof input.text!=='string'||!input.text.trim()||Array.from(input.text).length>200||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.text)||/[\uD800-\uDFFF]/u.test(input.text)||typeof input.voice!=='string'||!Object.hasOwn(voices,input.voice))return reply(400,'invalid_tts_input');
    let runtime:CapcutRuntime|undefined;
    if(env.CAPCUT_SESSION_PERSISTENCE==='1'){
      if(!env.DB)throw new Failure(503,'tts_session_unavailable',30);
      try{runtime=await Promise.race([loadCapcutRuntime(env.DB,env.CAPCUT_SESSION_JSON!,conf.cookie),canceled]);}catch{throw new Failure(503,'tts_session_unavailable',30);}
      conf.cookie=runtime.cookie;if(runtime.blocked)throw new Failure(401,'capcut_session_expired',60);
    }
    const expired=async()=>{if(runtime&&env.DB)await Promise.race([storeCapcutRuntime(env.DB,runtime,conf.cookie,true),canceled]).catch(()=>{});throw new Failure(401,'capcut_session_expired',60);};
    await Promise.race([admit(request,env.DB,controller.signal),canceled]);
    const voice=voices[input.voice],time=Math.floor(Date.now()/1000).toString();
    // Protocol recipe from kuwacom/CapCut-TTS (MIT), pinned in M0. These public
    // constants are not account credentials; only conf.cookie grants a session.
    const sign=capcutMd5(`9e2c|${new URL(upstream).pathname.slice(-7)}|7|${conf.appVersion}|${time}|${conf.tdid}|11ac`);
    const response=await call(upstream,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Origin:'https://www.capcut.com',Referer:'https://www.capcut.com/','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',Cookie:conf.cookie,appid:'348188',appvr:conf.appVersion,'device-time':time,did:conf.deviceId,pf:'7',sign,'sign-ver':'1','store-country-code':conf.region.toLowerCase(),'store-country-code-src':'uid',tdid:conf.tdid},body:JSON.stringify({texts:[input.text],tts_conf:{speaker:input.voice,rate:1,volume:100,name:voice.name,platform:'sami',effect_id:voice.resource,resource_id:voice.resource,is_clone:false},need_url:true})});
    if(response.status===401){void response.body?.cancel().catch(()=>{});return await expired();}
    if(response.status===403){void response.body?.cancel().catch(()=>{});throw new Failure(403,'capcut_access_denied',60);}
    if(response.status===429){void response.body?.cancel().catch(()=>{});throw new Failure(429,'capcut_busy',30);}
    if(!response.ok||!response.headers.get('Content-Type')?.toLowerCase().includes('application/json')){void response.body?.cancel().catch(()=>{});throw new Failure(502,'capcut_unavailable');}
    const payload=json(await bounded(response,MAX_JSON,controller.signal));
    if(payload.ret!==undefined&&payload.ret!==0&&payload.ret!=='0'){
      const message=typeof payload.errmsg==='string'?payload.errmsg:typeof payload.message==='string'?payload.message:'';
      if(/check login error|login required|session expired|not logged in/i.test(message))return await expired();
      throw new Failure(422,'capcut_request_rejected');
    }
    if(runtime&&env.DB){const cookie=mergeCapcutCookies(conf.cookie,response.headers);if(cookie!==conf.cookie)await Promise.race([storeCapcutRuntime(env.DB,runtime,cookie),canceled]).catch(()=>{});}
    const data=payload.data as {tts_materials?:{meta_data?:{url?:unknown}}[]}|undefined;
    const target=audioUrl(data?.tts_materials?.[0]?.meta_data?.url);
    const audio=await call(target,{method:'GET',headers:{Accept:'audio/mpeg'}});
    if(!audio.ok||!/^audio\/(?:mpeg|mp3)(?:;|$)/i.test(audio.headers.get('Content-Type')??'')){void audio.body?.cancel().catch(()=>{});throw new Failure(502,'capcut_invalid_audio');}
    const bytes=await bounded(audio,MAX_AUDIO,controller.signal);if(!isMp3(bytes))throw new Failure(502,'capcut_invalid_audio');
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return Response.json({success:true,data:btoa(binary)},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){const failure=error instanceof Failure?error:new Failure(controller.signal.aborted?504:502,controller.signal.aborted?'tts_timeout':'capcut_unavailable');return reply(failure.status,failure.code,failure.retryAfter);}
  finally{clearTimeout(timer);request.signal.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',reject);controller.abort();}
}
