import type {D1Database,R2Bucket,R2Object,R2ObjectBody} from '@cloudflare/workers-types';
import {streamR2Body} from './r2-stream';
export interface SharedFilesEnv {DB?:D1Database;LIBRARY_BUCKET?:R2Bucket}
export const sharedBlobKey=(hash:string)=>`shared-dictionaries/v1/${hash}.txt`;
const hex=(data:ArrayBuffer)=>Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,'0')).join('');
export const verifiedSharedBlob=(object:R2Object|null,hash:string,size:number)=>!!object&&object.key===sharedBlobKey(hash)&&object.size===size&&!!object.checksums.sha256&&hex(object.checksums.sha256)===hash;
const answer=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
declare const FixedLengthStream:{new(length:number):{readable:ReadableStream<Uint8Array>;writable:WritableStream<Uint8Array>}};
export async function handleSharedFiles(request:Request,env:SharedFilesEnv,waitUntil:(p:Promise<unknown>)=>void=()=>{}):Promise<Response>{
 const hash=new URL(request.url).pathname.split('/').pop()??'';
 if(!/^[a-f0-9]{64}$/.test(hash))return answer('invalid_hash',400);
 if(!env.DB||!env.LIBRARY_BUCKET)return answer('state_files_unavailable',503);
 const db=env.DB,bucket=env.LIBRARY_BUCKET,key=sharedBlobKey(hash);
 try{
  const existing=await db.prepare('SELECT bytes,state FROM shared_state_blobs WHERE sha256=?').bind(hash).first<{bytes:number;state:string}>();
  if(request.method==='GET'||request.method==='HEAD'){
   if(existing?.state!=='ready')return answer('file_not_ready',404);
   const object=request.method==='HEAD'?await bucket.head(key):await bucket.get(key);
   if(!verifiedSharedBlob(object,hash,existing.bytes)){if(object&&'body'in object)await (object as R2ObjectBody).body.cancel();return answer('file_unavailable',503);}
   return new Response(request.method==='HEAD'?null:streamR2Body(object as any,existing.bytes,waitUntil),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(existing.bytes),'X-Content-SHA256':hash,'Cache-Control':'no-store'}});
  }
  if(request.method!=='PUT')return answer('method_not_allowed',405);
  const raw=request.headers.get('X-Dictionary-Bytes')??'',size=Number(raw);
  if(!/^\d{1,9}$/.test(raw)||!Number.isSafeInteger(size)||size<1||size>80*1048576||request.headers.get('Content-Type')!=='application/octet-stream')return answer('invalid_file',400);
  if(existing&&existing.bytes!==size)return answer('immutable_file_conflict',409);
  if(!existing)await db.prepare("INSERT INTO shared_state_blobs(sha256,bytes,state) SELECT ?,?,'pending' WHERE NOT EXISTS(SELECT 1 FROM shared_state_blobs WHERE sha256=?)").bind(hash,size,hash).run();
  const head=await bucket.head(key);
  if(!verifiedSharedBlob(head,hash,size)){
   if(head)return answer('immutable_file_conflict',409);
   if(!request.body)return answer('invalid_file',400);
   const reader=request.body.getReader(),abort=new AbortController();let received=0;
   const stream=new ReadableStream<Uint8Array>({async pull(controller){try{const next=await reader.read();if(next.done){if(received!==size)throw Error('size');controller.close();reader.releaseLock();}else{received+=next.value.byteLength;if(received>size)throw Error('size');controller.enqueue(next.value);}}catch(error){controller.error(error);await reader.cancel().catch(()=>{});}},async cancel(reason){await reader.cancel(reason).catch(()=>{});}});
   const transfer=typeof FixedLengthStream==='undefined'?undefined:new FixedLengthStream(size);
   const cancelled=()=>abort.abort();request.signal.addEventListener('abort',cancelled,{once:true});
   try{if(request.signal.aborted)throw Error('cancelled');const pipe=transfer?stream.pipeTo(transfer.writable,{signal:abort.signal}):Promise.resolve();void pipe.catch(()=>{});const checksum=new Uint8Array(hash.match(/../g)!.map(b=>parseInt(b,16)));
    const stored=await bucket.put(key,(transfer?.readable??stream) as any,{sha256:checksum,onlyIf:{etagDoesNotMatch:'*'}});
    if(!stored){abort.abort();void reader.cancel().catch(()=>{});await pipe.catch(()=>{});}else await pipe;
    if(stored&&!verifiedSharedBlob(stored,hash,size))throw Error('checksum');
   }catch{abort.abort();await reader.cancel().catch(()=>{});return answer('file_validation_failed',400);}finally{request.signal.removeEventListener('abort',cancelled);}
  }else void request.body?.cancel().catch(()=>{});
  if(!verifiedSharedBlob(await bucket.head(key),hash,size))return answer('file_unavailable',503);
  await db.prepare("UPDATE shared_state_blobs SET state='ready' WHERE sha256=? AND bytes=?").bind(hash,size).run();
  return Response.json({sha256:hash,bytes:size},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return answer(error instanceof Error&&/state_blob_budget_exceeded/.test(error.message)?'state_file_limit':'state_files_unavailable',error instanceof Error&&/state_blob_budget_exceeded/.test(error.message)?413:503);}
}
