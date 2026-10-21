import {ORIGINAL_SINGLE_REQUEST_BYTES,ORIGINAL_PART_BYTES,originalPartCount,originalPartBytes} from '../../import-export/services/original-parts';
import {createSHA256} from 'hash-wasm';
import Dexie from 'dexie';
import {db} from '../../../core/db';
import {hashBlob} from '../../import-export/services/backup';
import {getCloudDeviceToken} from './cloud-device';
import {hasUsableSourceData} from '../../import-export/services/source-data';
import {originalByteLimit,parseOriginalDescriptor,type OriginalDescriptor} from './cloud-original-schema';
import type {SourceFile} from '../../../core/domain';
import {originalRevisionKey,matchesOriginalRevision,pendingOriginalSources} from './original-sync-index';

export interface CloudOriginal {descriptor:OriginalDescriptor;state:'pending'|'ready';updatedAt:number}
export interface DownloadedOriginal {blob:Blob;descriptor:OriginalDescriptor}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const JSON_LIMIT=2*1024*1024;
type Context={token:string|undefined;origin:string};
let queue:Promise<unknown>=Promise.resolve();
const responseSignals=new WeakMap<Response,AbortSignal>();
const responseCancellation=new WeakMap<Response,AbortSignal>();
class OriginalTimeoutError extends Error {constructor(){super('Tải file gốc quá thời gian. Hãy thử lại.');}}
const error=()=>new Error('Dữ liệu file gốc cloud không hợp lệ.');
function validateId(id:string){if(!UUID.test(id))throw error();}
function rootPath(bookId:string){validateId(bookId);return `/api/cloud/books/${bookId}/originals`;}
function sourcePath(bookId:string,sourceId:string){validateId(sourceId);return `${rootPath(bookId)}/${sourceId}`;}
function deletedKey(context:Context,bookId:string){return `cloud-deleted:${context.origin}:${bookId}`;}
function ackKey(context:Context,bookId:string,descriptor:OriginalDescriptor){return `cloud-original-uploaded:${context.origin}:${bookId}:${descriptor.sourceId}:${descriptor.sha256}`;}
async function context():Promise<Context>{return {token:await getCloudDeviceToken(),origin:location.origin};}
async function checkContext(captured:Context){if(location.origin!==captured.origin||await getCloudDeviceToken()!==captured.token)throw new Error('Kết nối kho đã thay đổi. Hãy thử lại.');}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw error();return value as Record<string,unknown>;}
function exact(row:Record<string,unknown>,keys:string[]){if(Object.keys(row).length!==keys.length||Object.keys(row).some(key=>!keys.includes(key)))throw error();}
function state(value:unknown):'pending'|'ready'{if(value!=='pending'&&value!=='ready')throw error();return value;}
function same(a:OriginalDescriptor,b:OriginalDescriptor){return JSON.stringify(a)===JSON.stringify(b);}
function descriptor(source:SourceFile){return parseOriginalDescriptor({version:1,sourceId:source.id,name:source.name,relativePath:source.relativePath,encoding:source.encoding,sha256:source.sha256,bytes:source.bytes});}

async function request(path:string,init:RequestInit|undefined,captured:Context){
  await checkContext(captured);const headers=new Headers(init?.headers);if(captured.token)headers.set('Authorization',`Bearer ${captured.token}`);
  let response:Response;const timeout=AbortSignal.timeout(120000),signal=init?.signal?AbortSignal.any([init.signal,timeout]):timeout;
  try{response=await fetch(path,{...init,headers,credentials:'same-origin',redirect:'error',signal});}catch{init?.signal?.throwIfAborted();if(signal.aborted)throw new OriginalTimeoutError();throw new Error('Không tải được file gốc. Hãy thử lại.');}
  responseSignals.set(response,signal);if(init?.signal)responseCancellation.set(response,init.signal);
  try{await checkContext(captured);if(!response.ok){const messages:Record<number,string>={401:'Kết nối kho đã hết hiệu lực.',409:'File gốc cloud khác bản trên thiết bị.',410:'Truyện đã bị xóa khỏi kho.',503:'Kho file gốc chưa sẵn sàng.',507:'Kho đã đạt giới hạn lưu trữ.'};throw new Error(messages[response.status]??`Kho báo lỗi ${response.status}.`);}}
  catch(cause){await response.body?.cancel().catch(()=>{});throw cause;}return response;
}
function read(response:Response,reader:ReadableStreamDefaultReader<Uint8Array>):Promise<ReadableStreamReadResult<Uint8Array>>{
  const signal=responseSignals.get(response)!,external=responseCancellation.get(response);if(signal.aborted)return Promise.reject(external?.aborted?external.reason:new OriginalTimeoutError());
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(external?.aborted?external.reason:new OriginalTimeoutError());};
    signal.addEventListener('abort',abort,{once:true});
    reader.read().then(value=>{signal.removeEventListener('abort',abort);resolve(value);},cause=>{signal.removeEventListener('abort',abort);reject(cause);});
  });
}
async function json(response:Response,captured:Context):Promise<unknown>{
  const length=response.headers.get('Content-Length');
  if(response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json'||(length!==null&&(!/^\d+$/.test(length)||Number(length)>JSON_LIMIT))){await response.body?.cancel().catch(()=>{});throw error();}
  if(!response.body)throw error();const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,result='';
  try{while(true){const next=await read(response,reader);if(next.done)break;bytes+=next.value.length;if(bytes>JSON_LIMIT)throw error();result+=decoder.decode(next.value,{stream:true});}result+=decoder.decode();if(length!==null&&bytes!==Number(length))throw error();await checkContext(captured);return JSON.parse(result);}
  catch(cause){responseCancellation.get(response)?.throwIfAborted();if(cause instanceof OriginalTimeoutError)throw cause;throw error();}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function parseList(value:unknown):CloudOriginal[]{const row=object(value);exact(row,['originals']);if(!Array.isArray(row.originals)||row.originals.length>100)throw error();const seen=new Set<string>();return row.originals.map(value=>{const item=object(value);exact(item,['descriptor','state','updatedAt']);const original=parseOriginalDescriptor(item.descriptor);if(seen.has(original.sourceId)||!Number.isSafeInteger(item.updatedAt)||Number(item.updatedAt)<0)throw error();seen.add(original.sourceId);return {descriptor:original,state:state(item.state),updatedAt:Number(item.updatedAt)};});}
async function list(bookId:string,captured:Context,signal?:AbortSignal){return parseList(await json(await request(rootPath(bookId),signal?{signal}:undefined,captured),captured));}
export async function listBookOriginals(bookId:string):Promise<CloudOriginal[]>{return list(bookId,await context());}

async function checkLocal(bookId:string,expected:OriginalDescriptor,captured:Context){
  await checkContext(captured);const book=await db.books.get(bookId),source=await db.sources.get(expected.sourceId);
  if(!book||book.status!=='ready'||!source||source.bookId!==bookId||!hasUsableSourceData(source)||!same(descriptor(source),expected)||await db.settings.get(deletedKey(captured,bookId)))throw new Error('File gốc trên thiết bị đã thay đổi hoặc bị xóa.');
}
async function acknowledge(bookId:string,expected:OriginalDescriptor,captured:Context){
  // Metadata alone cannot identify a same-size Blob replacement. Keep native
  // source/settings locks through a fresh byte digest and the final ACK write.
  // Native abort can settle rollback while waitFor still awaits an external
  // promise: race the transaction's abort event so callers/queue never hang.
  let rejectAbort!:(cause:Error)=>void;
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  const publication=db.transaction('rw',[db.books,db.sources,db.settings],async()=>{
    const transaction=Dexie.currentTransaction!;
    transaction.on('abort',()=>rejectAbort(new Error('Đã hủy lưu trạng thái file gốc.')));
    await checkLocal(bookId,expected,captured);
    if(!(await db.sources.get(expected.sourceId))?.syncRevision)await db.sources.update(expected.sourceId,{syncRevision:crypto.randomUUID()});
    const current=await db.sources.get(expected.sourceId);
    // Equivalent to waitFor(function): installed runtime supports that form,
    // but its typings only declare PromiseLike/value. Explicit ignoreTransaction
    // keeps hash promises outside Dexie's zone while waitFor retains the locks.
    if(!current||await Dexie.waitFor(Dexie.ignoreTransaction(()=>hashBlob(current.blob)))!==expected.sha256)throw new Error('File gốc trên thiết bị đã thay đổi.');
    await checkLocal(bookId,expected,captured);
    await db.settings.put({key:ackKey(captured,bookId,expected),value:{descriptor:expected,uploadedAt:Date.now()}});
    if(current.syncRevision)await db.settings.put({key:originalRevisionKey(captured.origin,expected.sourceId),value:{bookId,revision:current.syncRevision}});
  });
  await Promise.race([publication,aborted]);
}
/** Sequential original upload; large EPUB retries resume verified parts. Sources remain immutable. */
export function syncBookOriginals(bookId:string,onStatus:(message:string)=>void=()=>{},pendingOnly=false):Promise<number>{
  const operation=async()=>{
    validateId(bookId);const captured=await context(),book=await db.books.get(bookId);if(!book||book.status!=='ready'||await db.settings.get(deletedKey(captured,bookId)))throw new Error('Truyện chưa sẵn sàng lưu file gốc.');
    const sourceIds=pendingOnly?(await pendingOriginalSources(new Set([bookId]),captured.origin)).get(bookId)||[]:undefined;
    let sources=sourceIds?(await db.sources.bulkGet(sourceIds)).filter((source):source is SourceFile=>!!source):await db.sources.where('bookId').equals(bookId).toArray();
    if(pendingOnly){
      const receipts=await db.settings.bulkGet(sources.map(source=>originalRevisionKey(captured.origin,source.id)));
      sources=sources.filter((source,index)=>source.dataStatus!=='missing'&&source.blob.size>0&&!matchesOriginalRevision(receipts[index]?.value,bookId,source.syncRevision));
      if(!sources.length){await checkContext(captured);return 0;}
    }
    const remote=await list(bookId,captured);let completed=0;
    for(const source of sources){
      if(source.dataStatus==='missing'||source.blob.size===0)continue;
      const expected=descriptor(source);if(!hasUsableSourceData(source)||source.blob.size>originalByteLimit(expected.encoding)||await hashBlob(source.blob)!==expected.sha256)throw new Error('File gốc trên thiết bị sai kích thước hoặc checksum.');
      await checkLocal(bookId,expected,captured);
      const found=remote.find(item=>item.descriptor.sourceId===expected.sourceId);if(found&&!same(found.descriptor,expected))throw new Error('File gốc cloud khác bản trên thiết bị.');
      if(found?.state!=='ready'){
        onStatus(`Lưu file gốc: ${expected.name}`);
        const reservation=object(await json(await request(sourcePath(bookId,source.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(expected)},captured),captured));exact(reservation,['descriptor','state']);if(!same(parseOriginalDescriptor(reservation.descriptor),expected))throw error();
        if(state(reservation.state)!=='ready'){
          await checkLocal(bookId,expected,captured);
          let result:Record<string,unknown>;
          if(expected.bytes>ORIGINAL_SINGLE_REQUEST_BYTES){
            const root=sourcePath(bookId,source.id),manifest=object(await json(await request(`${root}/parts`,undefined,captured),captured));exact(manifest,['parts']);if(!Array.isArray(manifest.parts)||manifest.parts.length>16)throw error();const parts=new Map<number,Record<string,unknown>>();for(const value of manifest.parts){const row=object(value);exact(row,['part','sha256','bytes','state']);if(typeof row.part!=='number'||parts.has(row.part)||row.bytes!==originalPartBytes(expected.bytes,row.part)||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256))throw error();state(row.state);parts.set(row.part,row);}
            for(let part=1;part<=originalPartCount(expected.bytes);part++){await checkLocal(bookId,expected,captured);const blob=source.blob.slice((part-1)*ORIGINAL_PART_BYTES,part*ORIGINAL_PART_BYTES),sha=await hashBlob(blob),old=parts.get(part);if(old&&old.sha256!==sha)throw error();if(old?.state==='ready')continue;onStatus(`Lưu file gốc: ${expected.name} · phần ${part}/${originalPartCount(expected.bytes)}`);const receipt=object(await json(await request(`${root}/parts/${part}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Part-SHA256':sha},body:blob},captured),captured));exact(receipt,['part','sha256','bytes','state']);if(receipt.part!==part||receipt.sha256!==sha||receipt.bytes!==blob.size||receipt.state!=='ready')throw error();}
            await checkLocal(bookId,expected,captured);result=object(await json(await request(`${root}/complete`,{method:'POST'},captured),captured));
          }else result=object(await json(await request(`${sourcePath(bookId,source.id)}/data`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:source.blob},captured),captured));exact(result,['sourceId','sha256','state']);if(result.sourceId!==expected.sourceId||result.sha256!==expected.sha256||result.state!=='ready')throw error();
        }
      }
      await acknowledge(bookId,expected,captured);completed++;
    }return completed;
  };
  const result=queue.then(operation,operation);queue=result.catch(()=>{});return result;
}

/** Verified bytes only. Caller decides whether to download or explicitly persist. */
export async function downloadOriginal(bookId:string,sourceId:string,signal?:AbortSignal):Promise<DownloadedOriginal>{
  sourcePath(bookId,sourceId);const captured=await context();const localBook=await db.books.get(bookId),localSource=await db.sources.get(sourceId);
  const guard=async()=>{signal?.throwIfAborted();await checkContext(captured);if(await db.settings.get(deletedKey(captured,bookId))||(localBook&&(!(await db.books.get(bookId))||((await db.books.get(bookId))?.status!=='ready'))))throw new Error('Truyện đã thay đổi hoặc bị xóa.');if(localSource){const current=await db.sources.get(sourceId);if(!current||current.bookId!==localSource.bookId||!same(descriptor(current),descriptor(localSource))||current.dataStatus!==localSource.dataStatus)throw new Error('File gốc đã thay đổi.');}};
  await guard();const found=(await list(bookId,captured,signal)).find(item=>item.descriptor.sourceId===sourceId&&item.state==='ready');if(!found)throw new Error('File gốc chưa có trên kho.');const expected=found.descriptor;
  if(localSource&&!same(expected,descriptor(localSource)))throw new Error('File gốc cloud khác bản trên thiết bị.');
  const response=await request(`${sourcePath(bookId,sourceId)}/data`,signal?{signal}:undefined,captured);
  if(response.headers.get('Content-Length')!==String(expected.bytes)||response.headers.get('X-Content-SHA256')!==expected.sha256||response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/octet-stream'||!response.body){await response.body?.cancel().catch(()=>{});throw error();}
  const hash=await createSHA256();hash.init();const parts:Uint8Array<ArrayBuffer>[]=[],reader=response.body.getReader();let bytes=0;
  try{while(true){const next=await read(response,reader);if(next.done)break;bytes+=next.value.length;if(bytes>expected.bytes||bytes>originalByteLimit(expected.encoding))throw error();hash.update(next.value);parts.push(new Uint8Array(next.value));}if(bytes!==expected.bytes||hash.digest('hex')!==expected.sha256)throw error();await guard();return {blob:new Blob(parts,{type:'application/octet-stream'}),descriptor:expected};}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
