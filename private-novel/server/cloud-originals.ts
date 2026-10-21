import {ORIGINAL_SINGLE_REQUEST_BYTES,originalPartCount,originalPartBytes,originalPartKey} from '../src/features/import-export/services/original-parts';
import type {R2Object,R2ObjectBody,ReadableStream as WorkerReadableStream,WritableStream as WorkerWritableStream,TransformStream as WorkerTransformStream} from '@cloudflare/workers-types';
import type {CloudLibraryEnv} from './cloud-library';
import {streamR2Body} from './r2-stream';
import {MAX_ORIGINAL_DESCRIPTOR_BYTES,parseOriginalDescriptorJson,originalObjectKey,type OriginalDescriptor} from '../src/features/sync-cloud/services/cloud-original-schema';

export const ORIGINAL_UPLOAD_DEADLINE_MS=120_000;
declare const FixedLengthStream:{new(length:number):{readable:WorkerReadableStream<Uint8Array>;writable:WorkerWritableStream<Uint8Array>}};
declare const TransformStream:{new<I,O>():WorkerTransformStream<I,O>};
interface OriginalRow {book_id:string;source_id:string;descriptor_json:string;sha256:string;bytes:number;object_key:string;state:'pending'|'ready';updated_at:number}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const error=(status:number,code:string)=>Response.json({error:code},{status});
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
async function deleted(env:CloudLibraryEnv,id:string){return await env.DB.prepare('SELECT id FROM cloud_book_deletions WHERE id=?').bind(id).first()!==null;}
async function available(env:CloudLibraryEnv,id:string){return await env.DB.prepare("SELECT id FROM cloud_books WHERE id=? AND state='ready' AND NOT EXISTS(SELECT 1 FROM cloud_book_deletions WHERE id=cloud_books.id)").bind(id).first()!==null;}
function descriptor(row:OriginalRow):OriginalDescriptor{
  const value=parseOriginalDescriptorJson(row.descriptor_json);
  if(value.sourceId!==row.source_id||value.sha256!==row.sha256||value.bytes!==row.bytes||originalObjectKey(row.book_id,value)!==row.object_key||JSON.stringify(value)!==row.descriptor_json)throw new Error('invalid_stored_original');
  return value;
}
function matches(object:R2Object|null,row:OriginalRow){return !!object&&object.key===row.object_key&&object.size===row.bytes&&!!object.checksums.sha256&&hex(object.checksums.sha256)===row.sha256;}
async function cancelBody(request:Request){await request.body?.cancel().catch(()=>{});}
type OriginalReader={read:()=>Promise<{done:boolean;value?:Uint8Array}>;cancel:(reason?:unknown)=>Promise<unknown>;releaseLock:()=>void};
function originalReader(body:Pick<WorkerReadableStream<Uint8Array>,'getReader'>|Pick<ReadableStream<Uint8Array>,'getReader'>):OriginalReader{
  try{
    const reader=body.getReader({mode:'byob'});
    if(!('readAtLeast' in reader)||typeof reader.readAtLeast!=='function'){reader.releaseLock();throw new Error('byob_extension_unavailable');}
    return {read:()=>reader.readAtLeast(256*1024,new Uint8Array(256*1024)),cancel:reason=>reader.cancel(reason),releaseLock:()=>reader.releaseLock()};
  }catch{
    const reader=body.getReader();return {read:()=>reader.read(),cancel:reason=>reader.cancel(reason),releaseLock:()=>reader.releaseLock()};
  }
}
async function discardReader(reader:OriginalReader,maxBytes:number){
  if(maxBytes<0)throw new Error('original_size_mismatch');
  let seen=0;while(true){const part=await reader.read();seen+=part.value?.byteLength??0;if(seen>maxBytes)throw new Error('original_size_mismatch');if(part.done)return;}
}
/** Consume bounded retry bytes before returning a verified existing receipt.
 * Cancelling an in-flight HTTP upload can reset the peer before it gets the ACK. */
async function discardRetryBody(request:Request,maxBytes:number){
  if(!request.body)return;const reader=originalReader(request.body);let expired=false;
  const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>{});},ORIGINAL_UPLOAD_DEADLINE_MS);
  try{await discardReader(reader,maxBytes);if(expired||request.signal.aborted)throw new Error('original_upload_failed');}
  catch(e){await reader.cancel().catch(()=>{});throw e;}finally{clearTimeout(timer);reader.releaseLock();}
}
export async function cleanupCloudOriginals(env:CloudLibraryEnv,bookId:string):Promise<void>{
  // Legacy DELETE remains available before rollout; no original objects can exist
  // without the table. Do not swallow failures when the new schema is present.
  const installed=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cloud_originals'").first();
  if(!installed)return;
  const rows=await env.DB.prepare('SELECT * FROM cloud_originals WHERE book_id=? LIMIT 100').bind(bookId).all<OriginalRow>();
  const keys:string[]=[];for(const row of rows.results){try{descriptor(row);}catch{continue;}keys.push(row.object_key);}
  // One R2 delete for <=100 exact keys; no per-object subrequest loop or listing.
  if(await partsInstalled(env))for(const row of rows.results){try{descriptor(row);}catch{continue;}await cleanParts(env,row);}
  if(keys.length)await env.LIBRARY_BUCKET!.delete(keys).catch(()=>{});
}
async function cleanupOne(env:CloudLibraryEnv,row:OriginalRow){descriptor(row);await env.LIBRARY_BUCKET!.delete(row.object_key).catch(()=>{});}
/** Hold the final read chunk until EOF. Otherwise an overlong R2 stream can
 * complete Content-Length before its trailing error reaches the HTTP consumer. */
export function streamOriginalBody(object:Pick<R2ObjectBody,'body'>,expectedBytes:number,waitUntil:(promise:Promise<unknown>)=>void){
  const transfer=new TransformStream<Uint8Array,Uint8Array>(),writer=transfer.writable.getWriter();
  // Native R2 can deliver tiny chunks. Read bounded batches to avoid thousands
  // of JS continuations exhausting the Free CPU budget on a large download.
  const reader=originalReader(object.body);
  void writer.closed.catch(()=>reader.cancel().catch(()=>{}));
  const checked=(async()=>{let received=0,tail:Uint8Array|undefined;try{
    while(true){const part=await reader.read();if(part.value?.byteLength){received+=part.value.byteLength;if(received>expectedBytes)throw new Error('original_stream_unavailable');if(tail)await writer.write(tail);tail=part.value;}if(part.done)break;}
    if(received!==expectedBytes)throw new Error('original_stream_unavailable');if(tail)await writer.write(tail);await writer.close();
  }catch(e){await reader.cancel().catch(()=>{});await writer.abort(e).catch(()=>{});throw e;}finally{reader.releaseLock();writer.releaseLock();}})();
  waitUntil(checked);return streamR2Body({body:transfer.readable},expectedBytes,waitUntil);
}
async function jsonBody(request:Request):Promise<string>{
  if(!request.body)throw new Error('empty');const reader=request.body.getReader(),chunks:Uint8Array[]=[];let count=0;
  let expired=false;const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>{});},ORIGINAL_UPLOAD_DEADLINE_MS);
  try{while(true){if(request.signal.aborted||expired)throw new Error('deadline');const part=await reader.read();if(part.done)break;count+=part.value.byteLength;if(count>MAX_ORIGINAL_DESCRIPTOR_BYTES)throw new Error('large');chunks.push(part.value);}if(expired||request.signal.aborted)throw new Error('deadline');const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes);}
  catch(e){await reader.cancel().catch(()=>{});throw e;}finally{clearTimeout(timer);reader.releaseLock();}
}
/** Bounded native checksum upload. Conditional skips stop the R2 pump, then
 * drain bounded request bytes so the peer can receive its verified receipt. */
async function upload(request:Pick<Request,'body'|'signal'>,env:CloudLibraryEnv,row:OriginalRow,waitUntil:(promise:Promise<unknown>)=>void):Promise<R2Object|null>{
  if(!request.body)throw new Error('invalid_original_body');
  const transfer=typeof FixedLengthStream==='undefined'?new TransformStream<Uint8Array,Uint8Array>():new FixedLengthStream(row.bytes);
  const reader=originalReader(request.body),writer=transfer.writable.getWriter();let seen=0,expired=false,conditionalSkip=false;
  const stop=(reason:unknown)=>{void reader.cancel(reason).catch(()=>{});void transfer.readable.cancel(reason).catch(()=>{});void writer.abort(reason).catch(()=>{});};
  let rejectDeadline:(reason:Error)=>void=()=>{};
  const deadline=new Promise<never>((_resolve,reject)=>{rejectDeadline=reject;});
  const timer=setTimeout(()=>{expired=true;stop(new Error('upload_deadline'));rejectDeadline(new Error('upload_deadline'));},ORIGINAL_UPLOAD_DEADLINE_MS);
  const abort=()=>stop(new Error('upload_aborted'));request.signal.addEventListener('abort',abort,{once:true});
  const pump=(async()=>{try{while(true){if(expired||request.signal.aborted)throw new Error('upload_aborted');const part=await reader.read();if(part.value?.byteLength){seen+=part.value.byteLength;if(seen>row.bytes)throw new Error('original_size_mismatch');await writer.write(part.value);}if(part.done)break;}if(seen!==row.bytes)throw new Error('original_size_mismatch');await writer.close();}catch(e){
    if(conditionalSkip&&seen<=row.bytes&&!expired&&!request.signal.aborted){try{await discardReader(reader,row.bytes-seen);return;}catch(drainError){stop(drainError);throw drainError;}}
    stop(e);throw e;
  }finally{reader.releaseLock();writer.releaseLock();}})();
  const put=env.LIBRARY_BUCKET!.put(row.object_key,transfer.readable,{onlyIf:{etagDoesNotMatch:'*'},sha256:row.sha256,httpMetadata:{contentType:'application/octet-stream'},customMetadata:{sha256:row.sha256}});
  void put.then(result=>{if(result===null){conditionalSkip=true;void transfer.readable.cancel().catch(()=>{});void writer.abort(new Error('conditional_skip')).catch(()=>{});}},stop);
  const settled=Promise.allSettled([put,pump]);
  waitUntil(settled.then(async([stored])=>{if(expired&&stored.status==='fulfilled'&&await deleted(env,row.book_id))await cleanupOne(env,row);}));
  try{const [stored,pumped]=await Promise.race([settled,deadline]);
    if(stored.status==='fulfilled'&&stored.value===null&&pumped.status==='fulfilled'&&!expired&&!request.signal.aborted)return env.LIBRARY_BUCKET!.head(row.object_key);
    if(stored.status==='rejected'||pumped.status==='rejected'||expired||request.signal.aborted)throw new Error('original_upload_failed');
    return stored.value;
  }finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);}
}
interface OriginalPartRow {book_id:string;source_id:string;part:number;sha256:string;bytes:number;object_key:string;state:'pending'|'ready';updated_at:number}
async function partsInstalled(env:CloudLibraryEnv){return !!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cloud_original_parts'").first();}
function checkedPart(row:OriginalRow,part:OriginalPartRow){if(part.book_id!==row.book_id||part.source_id!==row.source_id||!/^[a-f0-9]{64}$/.test(part.sha256)||part.bytes!==originalPartBytes(row.bytes,part.part)||part.object_key!==originalPartKey(row.object_key,part.part,part.sha256))throw Error('invalid_original_part');return {...row,bytes:part.bytes,sha256:part.sha256,object_key:part.object_key};}
async function partRows(env:CloudLibraryEnv,row:OriginalRow){const list=await env.DB.prepare('SELECT * FROM cloud_original_parts WHERE book_id=? AND source_id=? ORDER BY part LIMIT 16').bind(row.book_id,row.source_id).all<OriginalPartRow>();for(const part of list.results)checkedPart(row,part);return list.results;}
async function cleanParts(env:CloudLibraryEnv,row:OriginalRow){const parts=await partRows(env,row);if(parts.length)await env.LIBRARY_BUCKET!.delete(parts.map(part=>part.object_key));await env.DB.prepare('DELETE FROM cloud_original_parts WHERE book_id=? AND source_id=?').bind(row.book_id,row.source_id).run();}
function assembledParts(env:CloudLibraryEnv,row:OriginalRow,parts:OriginalPartRow[],signal:AbortSignal):ReadableStream<Uint8Array<ArrayBuffer>>{
 let index=0,reader:OriginalReader|undefined;
 return new ReadableStream<Uint8Array<ArrayBuffer>>({
  async pull(controller){try{
   while(true){
    signal.throwIfAborted();
    if(!reader){if(index===parts.length){controller.close();return;}const part=parts[index++],expected=checkedPart(row,part),object=await env.LIBRARY_BUCKET!.get(part.object_key);if(!matches(object,expected)){await object?.body.cancel().catch(()=>{});throw Error('original_part_unavailable');}reader=originalReader(object!.body);}
    const chunk=await reader.read();
    if(chunk.done){reader.releaseLock();reader=undefined;}
    if(chunk.value?.byteLength){controller.enqueue(new Uint8Array(chunk.value));return;}
    // EOF can contain no bytes. Advance within this pull so the pending read
    // receives the next part (or close), rather than waiting for another pull.
   }
  }catch(e){await reader?.cancel(e).catch(()=>{});reader?.releaseLock();reader=undefined;controller.error(e);}},
  async cancel(reason){await reader?.cancel(reason);reader?.releaseLock();reader=undefined;}
 },{highWaterMark:1});
}
async function routePart(request:Request,env:CloudLibraryEnv,row:OriginalRow,action:string,number:number|undefined,waitUntil:(promise:Promise<unknown>)=>void){
 if(!await partsInstalled(env)){await cancelBody(request);return error(503,'parts_migration_required');}
 if(descriptor(row).encoding!=='epub'||row.bytes<=ORIGINAL_SINGLE_REQUEST_BYTES){await cancelBody(request);return error(400,'large_epub_required');}
 if(action==='parts'&&request.method==='GET'){const parts=await partRows(env,row),result=[];for(const part of parts){const safe=checkedPart(row,part),ready=part.state==='ready'&&matches(await env.LIBRARY_BUCKET!.head(part.object_key),safe);result.push({part:part.part,sha256:part.sha256,bytes:part.bytes,state:ready?'ready':'pending'});}if(await deleted(env,row.book_id))return error(410,'book_deleted');return Response.json({parts:result});}
 if(action.startsWith('parts/')&&request.method==='PUT'){
  if(row.state==='ready'){await cancelBody(request);return error(409,'original_already_ready');}if(await env.DB.prepare('SELECT token FROM cloud_original_parts_locks WHERE book_id=? AND source_id=? AND expires_at>?').bind(row.book_id,row.source_id,Date.now()).first()){await cancelBody(request);return error(409,'original_completing');}
  let bytes:number;try{bytes=originalPartBytes(row.bytes,number!);}catch{await cancelBody(request);return error(400,'invalid_original_part');}
  const sha=request.headers.get('X-Part-SHA256')??'',length=request.headers.get('Content-Length');if(!/^[a-f0-9]{64}$/.test(sha)||request.headers.get('Content-Type')!=='application/octet-stream'||length!==null&&(!/^\d+$/.test(length)||Number(length)!==bytes)){await cancelBody(request);return error(400,'invalid_original_part');}
  const key=originalPartKey(row.object_key,number!,sha);try{await env.DB.prepare(`INSERT INTO cloud_original_parts(book_id,source_id,part,sha256,bytes,object_key,state,updated_at) VALUES(?,?,?,?,?,?,'pending',?) ON CONFLICT(book_id,source_id,part) DO NOTHING`).bind(row.book_id,row.source_id,number!,sha,bytes,key,Date.now()).run();}catch(e){await cancelBody(request);if(String(e).includes('original_parts_budget_exceeded'))return error(507,'original_parts_budget_exceeded');if(await deleted(env,row.book_id))return error(410,'book_deleted');return error(409,'invalid_original_part');}
  const part=await env.DB.prepare('SELECT * FROM cloud_original_parts WHERE book_id=? AND source_id=? AND part=?').bind(row.book_id,row.source_id,number!).first<OriginalPartRow>();if(!part||part.sha256!==sha||part.bytes!==bytes||part.object_key!==key){await cancelBody(request);return error(409,'immutable_original_part');}const safe=checkedPart(row,part);
  let stored=await env.LIBRARY_BUCKET!.head(key);try{if(stored){await discardRetryBody(request,bytes);}else stored=await upload(request,env,safe,waitUntil);}catch{if(await deleted(env,row.book_id)){await env.LIBRARY_BUCKET!.delete(key).catch(()=>{});return error(410,'book_deleted');}return error(422,'original_part_upload_failed');}
  if(!matches(stored,safe))return error(503,'original_part_unavailable');
  const published=await env.DB.prepare(`UPDATE cloud_original_parts SET state='ready',updated_at=? WHERE book_id=? AND source_id=? AND part=? AND sha256=? AND NOT EXISTS(SELECT 1 FROM cloud_original_parts_locks WHERE book_id=cloud_original_parts.book_id AND source_id=cloud_original_parts.source_id AND expires_at>?) AND EXISTS(SELECT 1 FROM cloud_originals o WHERE o.book_id=cloud_original_parts.book_id AND o.source_id=cloud_original_parts.source_id AND o.state='pending') AND EXISTS(SELECT 1 FROM cloud_books WHERE id=? AND state='ready') AND NOT EXISTS(SELECT 1 FROM cloud_book_deletions WHERE id=?) RETURNING part`).bind(Date.now(),row.book_id,row.source_id,number!,sha,Date.now(),row.book_id,row.book_id).first();if(!published||await deleted(env,row.book_id)){const current=await env.DB.prepare('SELECT state FROM cloud_originals WHERE book_id=? AND source_id=?').bind(row.book_id,row.source_id).first<{state:string}>();if(current?.state==='ready'||await deleted(env,row.book_id))await env.LIBRARY_BUCKET!.delete(key).catch(()=>{});return error(await deleted(env,row.book_id)?410:409,'original_part_changed');}return Response.json({part:number!,sha256:sha,bytes,state:'ready'});
 }
 if(action==='complete'&&request.method==='POST'){
  await cancelBody(request);const lockToken=crypto.randomUUID(),now=Date.now();await env.DB.prepare('DELETE FROM cloud_original_parts_locks WHERE book_id=? AND source_id=? AND expires_at<=?').bind(row.book_id,row.source_id,now).run();const locked=await env.DB.prepare('INSERT INTO cloud_original_parts_locks(book_id,source_id,token,expires_at) VALUES(?,?,?,?) ON CONFLICT(book_id,source_id) DO NOTHING RETURNING token').bind(row.book_id,row.source_id,lockToken,now+ORIGINAL_UPLOAD_DEADLINE_MS*2+30000).first<{token:string}>();if(locked?.token!==lockToken)return error(409,'original_completing');
  try{let stored=await env.LIBRARY_BUCKET!.head(row.object_key);const parts=await partRows(env,row);if(!stored){if(parts.length!==originalPartCount(row.bytes)||parts.some((part,i)=>part.part!==i+1||part.state!=='ready'))return error(409,'original_parts_incomplete');try{stored=await upload({body:assembledParts(env,row,parts,request.signal),signal:request.signal},env,row,waitUntil);}catch{if(await deleted(env,row.book_id)){await cleanupOne(env,row);await cleanParts(env,row);return error(410,'book_deleted');}return error(422,'original_complete_failed');}}
   if(!matches(stored,row))return error(503,'original_unavailable');if(await deleted(env,row.book_id)){await cleanupOne(env,row);await cleanParts(env,row);return error(410,'book_deleted');}
   await cleanParts(env,row);
   const published=await env.DB.prepare(`UPDATE cloud_originals SET state='ready',updated_at=? WHERE book_id=? AND source_id=? AND descriptor_json=? AND EXISTS(SELECT 1 FROM cloud_original_parts_locks WHERE book_id=cloud_originals.book_id AND source_id=cloud_originals.source_id AND token=? AND expires_at>?) AND EXISTS(SELECT 1 FROM cloud_books WHERE id=? AND state='ready') AND NOT EXISTS(SELECT 1 FROM cloud_book_deletions WHERE id=?) RETURNING source_id`).bind(Date.now(),row.book_id,row.source_id,row.descriptor_json,lockToken,Date.now(),row.book_id,row.book_id).first();if(!published){if(await deleted(env,row.book_id)){await cleanupOne(env,row);return error(410,'book_deleted');}return error(503,'original_publish_failed');}
   if(parts.length)await env.LIBRARY_BUCKET!.delete(parts.map(part=>part.object_key));if(await deleted(env,row.book_id)){await cleanupOne(env,row);return error(410,'book_deleted');}return Response.json({sourceId:row.source_id,sha256:row.sha256,state:'ready'},{status:row.state==='ready'?200:201});
  }finally{await env.DB.prepare('DELETE FROM cloud_original_parts_locks WHERE book_id=? AND source_id=? AND token=?').bind(row.book_id,row.source_id,lockToken).run();}
 }
 await cancelBody(request);return error(405,'method_not_allowed');
}
export async function routeCloudOriginals(request:Request,env:CloudLibraryEnv,waitUntil:(promise:Promise<unknown>)=>void):Promise<Response>{
  const match=/^\/api\/cloud\/books\/([^/]+)\/originals(?:\/([^/]+)(?:\/(data|complete|parts(?:\/(\d+))?))?)?$/.exec(new URL(request.url).pathname);
  if(!match)return error(404,'not_found');const bookId=match[1],sourceId=match[2],action=match[3]??'',data=action==='data',part=match[4]===undefined?undefined:Number(match[4]);
  if(!uuid.test(bookId)||sourceId!==undefined&&!uuid.test(sourceId))return error(400,'invalid_original_id');
  if(!(request.method==='GET'&&!sourceId||request.method==='POST'&&sourceId&&!action||['GET','PUT'].includes(request.method)&&sourceId&&data||sourceId&&(action==='parts'&&request.method==='GET'||action.startsWith('parts/')&&request.method==='PUT'||action==='complete'&&request.method==='POST')))return error(405,'method_not_allowed');
  // Require the complete migration before any original access; no old quota fallback.
  if(!await env.DB.prepare('SELECT used_bytes FROM cloud_storage_budget WHERE id=1').first())return error(503,'storage_migration_required');
  if(await deleted(env,bookId)){await cancelBody(request);return error(410,'book_deleted');}
  if(!await available(env,bookId)){await cancelBody(request);return error(404,'book_not_ready');}
  if(request.method==='GET'&&!sourceId){const rows=await env.DB.prepare('SELECT * FROM cloud_originals WHERE book_id=? ORDER BY source_id LIMIT 100').bind(bookId).all<OriginalRow>();
    const originals=rows.results.map(row=>({descriptor:descriptor(row),state:row.state,updatedAt:row.updated_at}));
    if(await deleted(env,bookId))return error(410,'book_deleted');return Response.json({originals});}
  if(request.method==='POST'&&!action){
    if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')??'')){await cancelBody(request);return error(415,'json_required');}
    let value:OriginalDescriptor;try{value=parseOriginalDescriptorJson(await jsonBody(request));}catch{return error(400,'invalid_original_descriptor');}
    if(value.sourceId!==sourceId)return error(400,'original_id_mismatch');const canonical=JSON.stringify(value),key=originalObjectKey(bookId,value);
    try{await env.DB.prepare(`INSERT INTO cloud_originals(book_id,source_id,descriptor_json,sha256,bytes,object_key,state,updated_at)
      SELECT ?,?,?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM cloud_books WHERE id=? AND state='ready')
      AND NOT EXISTS(SELECT 1 FROM cloud_book_deletions WHERE id=?) ON CONFLICT(book_id,source_id) DO NOTHING`)
      .bind(bookId,sourceId,canonical,value.sha256,value.bytes,key,Date.now(),bookId,bookId).run();
    }catch(e){if(String(e).includes('cloud_storage_budget_exceeded'))return error(507,'cloud_storage_budget_exceeded');if(String(e).includes('original_count_exceeded'))return error(409,'original_count_exceeded');if(String(e).includes('immutable_original_descriptor'))return error(409,'immutable_original_conflict');throw e;}
    if(await deleted(env,bookId))return error(410,'book_deleted');const row=await env.DB.prepare('SELECT * FROM cloud_originals WHERE book_id=? AND source_id=?').bind(bookId,sourceId).first<OriginalRow>();
    if(!row)return error(404,'book_not_ready');descriptor(row);if(row.descriptor_json!==canonical)return error(409,'immutable_original_conflict');return Response.json({descriptor:value,state:row.state},{status:row.state==='pending'?201:200});
  }
  const row=await env.DB.prepare('SELECT * FROM cloud_originals WHERE book_id=? AND source_id=?').bind(bookId,sourceId).first<OriginalRow>();
  if(!row){await cancelBody(request);return error(404,'original_not_found');}descriptor(row);
  if(action&&!data)return routePart(request,env,row,action,part,waitUntil);
  if(request.method==='GET'){
    if(row.state!=='ready')return error(409,'original_not_ready');const object=await env.LIBRARY_BUCKET!.get(row.object_key);
    if(await deleted(env,bookId)){await object?.body.cancel().catch(()=>{});return error(410,'book_deleted');}
    if(!matches(object,row)){await object?.body.cancel().catch(()=>{});return error(503,'original_unavailable');}
    return new Response(streamOriginalBody(object!,row.bytes,waitUntil),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(row.bytes),'X-Content-SHA256':row.sha256}});
  }
  if(request.method==='PUT'&&row.bytes>ORIGINAL_SINGLE_REQUEST_BYTES){await cancelBody(request);return error(413,'original_parts_required');}
  if(request.headers.get('Content-Type')!=='application/octet-stream'){await cancelBody(request);return error(415,'binary_required');}
  const length=request.headers.get('Content-Length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==row.bytes)){await cancelBody(request);return error(400,'original_size_mismatch');}
  const existing=await env.LIBRARY_BUCKET!.head(row.object_key);
  if(await deleted(env,bookId)){await cancelBody(request);await cleanupOne(env,row);return error(410,'book_deleted');}
  let stored=existing;
  if(existing){try{await discardRetryBody(request,row.bytes);}catch{return error(422,'original_upload_failed');}if(!matches(existing,row))return error(503,'original_unavailable');}
  else try{stored=await upload(request,env,row,waitUntil);}catch{
    if(await deleted(env,bookId)){await cleanupOne(env,row);return error(410,'book_deleted');}return error(422,'original_upload_failed');
  }
  if(await deleted(env,bookId)){await cleanupOne(env,row);return error(410,'book_deleted');}
  if(!matches(stored,row))return error(503,'original_unavailable');
  const published=await env.DB.prepare(`UPDATE cloud_originals SET state='ready',updated_at=? WHERE book_id=? AND source_id=? AND descriptor_json=?
    AND EXISTS(SELECT 1 FROM cloud_books WHERE id=? AND state='ready') AND NOT EXISTS(SELECT 1 FROM cloud_book_deletions WHERE id=?) RETURNING source_id`)
    .bind(Date.now(),bookId,sourceId,row.descriptor_json,bookId,bookId).first();
  if(!published){if(await deleted(env,bookId)){await cleanupOne(env,row);return error(410,'book_deleted');}return error(503,'original_publish_failed');}
  if(await deleted(env,bookId)){await cleanupOne(env,row);return error(410,'book_deleted');}
  return Response.json({sourceId,sha256:row.sha256,state:'ready'},{status:row.state==='ready'?200:201});
}
