import type {D1Database} from '@cloudflare/workers-types';
import {validateSharedRecord,sharedRecordId,SHARED_STATE_MAX_ROW_BYTES,SHARED_STATE_MAX_BYTES,SHARED_STATE_MAX_ROWS,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
interface Row {id:string;scope:string;kind:string;entity_key:string;record:string;revision:number;deleted:number;bytes:number}
const answer=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const view=(row:Row)=>({id:row.id,revision:row.revision,record:validateSharedRecord(JSON.parse(row.record))});
async function body(request:Request){const reader=request.body?.getReader();if(!reader)throw Error('body');let text='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>SHARED_STATE_MAX_ROW_BYTES+4096)throw Error('size');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
export async function handleSharedState(request:Request,env:{DB?:D1Database}):Promise<Response>{
 if(!env.DB)return answer({error:'state_sync_unavailable'},503);const db=env.DB;
 try{
  if(request.method==='GET'){
   const params=new URL(request.url).searchParams,scope=params.get('book')??'',after=Number(params.get('after')??0);
   if(scope.length>200||/[\u0000-\u001f]/.test(scope)||!Number.isSafeInteger(after)||after<0)return answer({error:'invalid_cursor'},400);
   if(params.has('head')||params.has('changes')){
    if(scope||params.has('head')&&params.has('changes')||params.has('head')&&params.get('head')!=='1'||params.has('changes')&&params.get('changes')!=='1')return answer({error:'invalid_discovery'},400);
    if(params.has('head')){
     const head=await db.prepare('SELECT revision FROM shared_state_meta WHERE id=1').first<{revision:number}>();
     if(!head)throw Error('state metadata unavailable');
     return answer({changesV1:true,revision:head.revision});
    }
    const until=Number(params.get('until'));
    if(!params.has('until')||!Number.isSafeInteger(until)||until<after)return answer({error:'invalid_cursor'},400);
    const batch=await db.batch([db.prepare('SELECT revision FROM shared_state_meta WHERE id=1'),db.prepare('SELECT scope,revision FROM shared_state WHERE revision>? AND revision<=? ORDER BY revision LIMIT 100').bind(after,until)]);
    const revision=(batch[0].results[0] as {revision:number}).revision;
    if(until>revision)return answer({error:'invalid_cursor'},400);
    const changes=batch[1].results as {scope:string;revision:number}[],more=changes.length===100;
    return answer({changesV1:true,revision:until,changes,more,cursor:more?changes[changes.length-1].revision:until});
   }
   if(scope&&await db.prepare('SELECT id FROM cloud_book_deletions WHERE id=?').bind(scope).first())return answer({error:'book_deleted'},410);
   const batch=await db.batch([db.prepare('SELECT revision FROM shared_state_meta WHERE id=1'),db.prepare('SELECT id,revision,bytes FROM shared_state WHERE scope=? AND revision>? ORDER BY revision LIMIT 99').bind(scope,after)]);
   const revision=(batch[0].results[0] as {revision:number}).revision,metadata=batch[1].results as Pick<Row,'id'|'revision'|'bytes'>[];
   let size=0;const chosen:typeof metadata=[];for(const item of metadata){if(chosen.length&&size+item.bytes>1048576)break;chosen.push(item);size+=item.bytes;}
   // Read only the bounded page. A row updated between metadata and this read is
   // delivered on the next delta page instead of advancing past a newer change.
   const rows=chosen.length?(await db.prepare(`SELECT * FROM shared_state WHERE id IN (${chosen.map(()=>'?').join(',')}) AND revision<=? ORDER BY revision`).bind(...chosen.map(r=>r.id),revision).all<Row>()).results:[];
   const more=chosen.length<metadata.length||metadata.length===99;
   return answer({cursor:more?(chosen.at(-1)?.revision??after):revision,more,rows:rows.map(view)});
  }
  if(request.method!=='PUT')return answer({error:'method_not_allowed'},405);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??''))return answer({error:'invalid_content_type'},415);
  let data:{id:string;baseRevision:number;record:SharedRecord};try{data=await body(request);if(!data||typeof data.id!=='string'||!/^[a-f0-9]{64}$/.test(data.id)||!Number.isSafeInteger(data.baseRevision)||data.baseRevision<0)throw Error('input');data.record=validateSharedRecord(data.record);if(await sharedRecordId(data.record)!==data.id)throw Error('id');}catch{return answer({error:'invalid_state'},400);}
  if(data.record.kind==='chapter'&&data.record.value===null)return answer({error:'chapter_tombstone_not_supported'},400);
  const scope=data.record.bookId??'';
  if(scope){if(await db.prepare('SELECT id FROM cloud_book_deletions WHERE id=?').bind(scope).first())return answer({error:'book_deleted'},410);if(!await db.prepare("SELECT id FROM cloud_books WHERE id=? AND state='ready'").bind(scope).first())return answer({error:'book_not_ready'},425);}
  if(['chapter','chapter-append','chapter-state'].includes(data.record.kind)&&data.record.value!==null){const original=await db.prepare('SELECT sha256 FROM cloud_books WHERE id=?').bind(scope).first<{sha256:string}>();if(original?.sha256!==(data.record.value as {baseSha256:string}).baseSha256)return answer({error:'source_base_mismatch'},409);}
  const json=JSON.stringify(data.record),size=new TextEncoder().encode(json).length;
  const immutableAppend=['chapter-append','chapter-append-packet'].includes(data.record.kind);
  if(immutableAppend){const previous=await db.prepare('SELECT * FROM shared_state WHERE id=?').bind(data.id).first<Row>();if(previous)return previous.record===json?answer({row:view(previous)}):answer({error:'state_conflict',row:view(previous)},409);}
  const quota='(SELECT used_bytes FROM shared_state_meta WHERE id=1)-COALESCE((SELECT bytes FROM shared_state WHERE id=?),0)+?<=?';
  const alive="(?='' OR EXISTS(SELECT 1 FROM cloud_books WHERE id=? AND state='ready') AND NOT EXISTS(SELECT 1 FROM cloud_book_deletions WHERE id=?))";
  const value=data.record.value as any;
  let guard=['chapter','chapter-append','chapter-state'].includes(data.record.kind)&&value!==null?" AND EXISTS(SELECT 1 FROM cloud_books WHERE id=? AND sha256=? AND state='ready')" :data.record.kind==='dictionary'&&value!==null?" AND EXISTS(SELECT 1 FROM shared_state_blobs WHERE sha256=? AND bytes=? AND state='ready')":'';
  const guardArgs:unknown[]=['chapter','chapter-append','chapter-state'].includes(data.record.kind)&&value!==null?[scope,value.baseSha256]:data.record.kind==='dictionary'&&value!==null?[value.sha256,value.bytes]:[];
  const image=value!==null?(data.record.kind==='book'?value.cover:data.record.kind==='reader'?value.libraryBackground:undefined):undefined;if(image){guard+=" AND EXISTS(SELECT 1 FROM shared_state_blobs WHERE sha256=? AND bytes=? AND state='ready')";guardArgs.push(image.sha256,image.bytes);}
  const newer=data.record.kind==='chapter'&&value!==null?" AND COALESCE(json_extract(record,'$.value.editRevision'),json_extract(record,'$.value.chapters[0].revision'),0)<? AND json_extract(record,'$.value.sourceHash')=json_extract(?,'$.value.sourceHash') AND json_extract(record,'$.value.sourceRevision')=json_extract(?,'$.value.sourceRevision') AND NOT EXISTS(SELECT 1 FROM json_each(record,'$.value.chapters') old WHERE NOT EXISTS(SELECT 1 FROM json_each(?,'$.value.chapters') next WHERE json_extract(next.value,'$.id')=json_extract(old.value,'$.id') AND json_extract(next.value,'$.revision')>=json_extract(old.value,'$.revision') AND (json_extract(next.value,'$.revision')>json_extract(old.value,'$.revision') OR json_extract(next.value,'$.text')=json_extract(old.value,'$.text') AND json_extract(next.value,'$.title')=json_extract(old.value,'$.title') AND json_extract(next.value,'$.order')=json_extract(old.value,'$.order') AND COALESCE(json_extract(next.value,'$.epub'),'null')=COALESCE(json_extract(old.value,'$.epub'),'null'))))":'';
  const newerArgs=newer?[value.editRevision??value.chapters[0].revision,json,json,json]:[];
  const statement=data.baseRevision===0?
   db.prepare(`INSERT INTO shared_state(id,scope,kind,entity_key,record,revision,deleted,bytes) SELECT ?,?,?,?,?,(SELECT revision FROM shared_state_meta WHERE id=1),?,? WHERE NOT EXISTS(SELECT 1 FROM shared_state WHERE id=?) AND (SELECT row_count FROM shared_state_meta WHERE id=1)<? AND ${quota} AND ${alive}${guard} RETURNING *`).bind(data.id,scope,data.record.kind,data.record.key,json,data.record.value===null?1:0,size,data.id,SHARED_STATE_MAX_ROWS,data.id,size,SHARED_STATE_MAX_BYTES,scope,scope,scope,...guardArgs):
   db.prepare(`UPDATE shared_state SET record=?,revision=(SELECT revision FROM shared_state_meta WHERE id=1),deleted=?,bytes=? WHERE id=? AND revision=? AND ${quota} AND ${alive}${guard}${newer}${immutableAppend?' AND 0':''} RETURNING *`).bind(json,data.record.value===null?1:0,size,data.id,data.baseRevision,data.id,size,SHARED_STATE_MAX_BYTES,scope,scope,scope,...guardArgs,...newerArgs);
  const result=await db.batch([db.prepare('UPDATE shared_state_meta SET revision=revision+1 WHERE id=1'),statement,db.prepare('SELECT * FROM shared_state WHERE id=?').bind(data.id)]);
  if(result[1].results.length)return answer({row:view(result[1].results[0] as Row)});
  if(scope&&await db.prepare('SELECT id FROM cloud_book_deletions WHERE id=?').bind(scope).first())return answer({error:'book_deleted'},410);
  const current=result[2].results[0] as Row|undefined;
  return current&&current.revision!==data.baseRevision?answer({error:'state_conflict',row:view(current)},409):answer({error:'state_limit'},413);
 }catch{return answer({error:'state_sync_unavailable'},503);}
}

