import type {D1Database} from '@cloudflare/workers-types';
import engine from '../experiments/server-convert/worker';
import {convertManifest,convertVersion} from './convert-manifest';
export interface ConvertEnv {PROBE_DB:D1Database;PROBE_STORAGE?:'rows'|'packed';PROBE_SQL_CANDIDATES?:string}
const reply=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'private, no-store'}});
const RESERVE=2000000,DAILY=3000000;
let verified:{db:D1Database;pending:Promise<boolean>}|undefined;
async function indexReady(db:D1Database){
 if(verified?.db!==db)verified={db,pending:db.prepare('SELECT version,manifest FROM convert_index_version WHERE id=1').first<{version:string;manifest:string}>().then(row=>row?.version===convertVersion&&row.manifest===JSON.stringify(convertManifest)).catch(()=>false)};
 const ready=await verified.pending;if(!ready)verified=undefined;return ready;
}
export default {async fetch(request:Request,env:ConvertEnv):Promise<Response>{
 if(!['GET','POST'].includes(request.method))return reply('method_not_allowed',405);
 if(!await indexReady(env.PROBE_DB))return reply('dictionary_version',503);
 if(request.method==='GET')return Response.json({version:convertVersion,dictionaries:convertManifest},{headers:{'Cache-Control':'private, no-store'}});
 if(request.method!=='POST')return reply('method_not_allowed',405);
 if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return reply('content_type',415);
 if(request.headers.get('X-Convert-Version')!==convertVersion)return reply('dictionary_version',409);
 let body='';if(!request.body)return reply('body_required',400);
 const reader=request.body.getReader(),decoder=new TextDecoder();let bytes=0;
 try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>32768){await reader.cancel();return reply('body_limit',413);}body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();}catch{return reply('invalid_body',400);}finally{reader.releaseLock();}
 let input:{text?:unknown;names?:unknown;includeLookup?:unknown};try{input=JSON.parse(body);}catch{return reply('invalid_json',400);}
 if(!input||typeof input.text!=='string'||!input.text.trim()||input.text.length>256||!Array.isArray(input.names)||input.names.length>100)return reply('invalid_input',400);
 if(input.includeLookup!==undefined&&typeof input.includeLookup!=='boolean')return reply('invalid_input',400);
 body=JSON.stringify({text:input.text,names:input.names,includeLookup:input.includeLookup===true});
 if(new TextEncoder().encode(body).byteLength>32768)return reply('body_limit',413);
 // Bound potentially expanded Name output before reserving shared resources.
 if(input.names.some((n:unknown)=>!n||typeof n!=='object'||Array.isArray(n)||typeof (n as any).key!=='string'||typeof (n as any).value!=='string'||!(n as any).key.trim()||!(n as any).value.trim()||/[\r\n=]/.test((n as any).key)||/[\r\n]/.test((n as any).value)||(n as any).key.length>256||(n as any).value.length>256))return reply('name_limit',413);
 const now=Date.now(),day=Math.floor(now/86400000),lease=crypto.randomUUID();
 try{
  const granted=await env.PROBE_DB.prepare('INSERT INTO convert_budget(day,spent,lease,until_ms) VALUES(?,?,?,?) ON CONFLICT(day) DO UPDATE SET spent=spent+excluded.spent,lease=excluded.lease,until_ms=excluded.until_ms WHERE spent<=? AND until_ms<=? RETURNING lease').bind(day,RESERVE,lease,now+120000,DAILY-RESERVE,now).first<{lease:string}>();
  if(granted?.lease!==lease)return reply('convert_busy_or_daily_limit',429);
  let cost=RESERVE;
  try{
   const response=await engine.fetch(new Request('https://convert.internal/convert',{method:'POST',headers:{'Content-Type':'application/json'},body}),{...env,CONVERT_VERSION:convertVersion});
   // Only this private service consumes accounting headers. Relay the bounded
   // JSON stream without parsing and serializing the whole payload again.
   const rawMeasured=response.headers.get('X-Convert-Reads'),measured=rawMeasured===null?NaN:Number(rawMeasured);
   if((response.ok||['candidate_limit','match_limit','output_limit'].includes(response.headers.get('X-Convert-Error')??''))&&rawMeasured!==null&&/^\d+$/.test(rawMeasured)&&Number.isSafeInteger(measured)&&measured>=0)cost=Math.max(1,measured+3);
   return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
  }finally{
   await env.PROBE_DB.prepare('UPDATE convert_budget SET spent=spent-?+?,lease=NULL,until_ms=0 WHERE day=? AND lease=?').bind(RESERVE,cost,day,lease).run();
  }
 }catch{return reply('convert_unavailable',503);}
}};
