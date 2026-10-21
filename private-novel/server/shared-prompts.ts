import type {D1Database} from '@cloudflare/workers-types';
import {secure} from './auth';
import {validatePromptProfile,DEFAULT_PROMPT_PROFILE_ID} from '../src/features/ai/prompt/prompt-schema';
type Row={id:string;profile:string|null;revision:number;deleted:number};
const view=(row:Row)=>({id:row.id,revision:row.revision,profile:row.deleted?null:validatePromptProfile(JSON.parse(row.profile!))});
const answer=(data:unknown,status=200)=>secure(Response.json(data,{status}));
async function body(request:Request){const reader=request.body?.getReader();if(!reader)throw Error('body');let text='',bytes=0;const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>98304)throw Error('size');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
export async function handleSharedPrompts(request:Request,env:{DB?:D1Database}):Promise<Response>{
 if(!env.DB)return answer({error:'prompt_sync_unavailable'},503);
 const database=env.DB;
 try{
  if(request.method==='GET'){
   const after=Number(new URL(request.url).searchParams.get('after')||0);if(!Number.isSafeInteger(after)||after<0)return answer({error:'invalid_cursor'},400);
   const result=await database.batch([database.prepare('SELECT revision FROM prompt_sync_meta WHERE id=1'),database.prepare('SELECT * FROM shared_prompts WHERE revision>? ORDER BY revision,id').bind(after)]);
   return answer({revision:(result[0].results[0] as {revision:number}).revision,rows:(result[1].results as Row[]).map(view)});
  }
  if(request.method!=='PUT')return answer({error:'method_not_allowed'},405);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return answer({error:'invalid_content_type'},415);
  let data:{id:string;baseRevision:number;profile:unknown};try{data=await body(request);if(!data||typeof data.id!=='string'||!data.id.trim()||data.id.length>300||/[\u0000-\u001f]/.test(data.id)||data.id===DEFAULT_PROMPT_PROFILE_ID||/^(?:__proto__|prototype|constructor)$/.test(data.id)||!Number.isSafeInteger(data.baseRevision)||data.baseRevision<0)throw Error('validation');}catch{return answer({error:'invalid_prompt'},400);}
  let json:string|null;try{const profile=data.profile===null?null:validatePromptProfile(data.profile);if(profile&&profile.id!==data.id)throw Error('id');json=profile?JSON.stringify(profile):null;}catch{return answer({error:'invalid_prompt'},400);}
  const quota='(SELECT COALESCE(SUM(length(CAST(profile AS BLOB))),0) FROM shared_prompts)-COALESCE((SELECT length(CAST(profile AS BLOB)) FROM shared_prompts WHERE id=?),0)+?<=8388608';
  const size=json?new TextEncoder().encode(json).length:0;
  const statement=data.baseRevision===0?
   database.prepare(`INSERT INTO shared_prompts(id,profile,revision,deleted) SELECT ?,?,(SELECT revision FROM prompt_sync_meta WHERE id=1),0 WHERE ? IS NOT NULL AND NOT EXISTS(SELECT 1 FROM shared_prompts WHERE id=?) AND (SELECT COUNT(*) FROM shared_prompts)<2000 AND (SELECT COUNT(*) FROM shared_prompts WHERE deleted=0)<499 AND ${quota} RETURNING *`).bind(data.id,json,json,data.id,data.id,size):
   database.prepare(`UPDATE shared_prompts SET profile=?,deleted=?,revision=(SELECT revision FROM prompt_sync_meta WHERE id=1) WHERE id=? AND revision=? AND ${quota} AND (? IS NULL OR deleted=0 OR (SELECT COUNT(*) FROM shared_prompts WHERE deleted=0)<499) AND (? IS NULL OR deleted=1 OR json_extract(profile,'$.bookId') IS json_extract(?,'$.bookId')) RETURNING *`).bind(json,json===null?1:0,data.id,data.baseRevision,data.id,size,json,json,json);
  const written=await database.batch([database.prepare('UPDATE prompt_sync_meta SET revision=revision+1 WHERE id=1'),statement,database.prepare('SELECT * FROM shared_prompts WHERE id=?').bind(data.id)]);
  if(written[1].results.length)return answer({row:view(written[1].results[0] as Row)});
  const current=written[2].results[0] as Row|undefined;
  return current&&current.revision!==data.baseRevision?answer({error:'prompt_conflict',row:view(current)},409):answer({error:'prompt_limit'},413);
 }catch{return answer({error:'prompt_sync_unavailable'},503);}
}
