import {publishSharedImages} from './shared-images';
import {validateSharedImage,type SharedImage} from './shared-image-schema';
import {db} from '../../../core/db';
import {createCloudSnapshotWithMetadata,normalizeCloudAlbum,restoreCloudSnapshot,contentHash,MAX_CLOUD_BYTES,UUID} from './cloud-snapshot';
import {getCloudDeviceToken} from './cloud-device';
import {syncBookOriginals} from './cloud-original-client';
import {pendingOriginalBooks} from './original-sync-index';

export interface CloudBook {cover?:SharedImage;id:string;title:string;author?:string;album?:string;displayTitle?:string;sha256:string;bytes:number;updatedAt:number}
const ACK='cloud-uploaded:';
const DELETED='cloud-deleted:';
let queue:Promise<unknown>=Promise.resolve();
let publicLibrary=false;
export function isPublicCloudLibrary(){return publicLibrary;}
class CloudDeletedError extends Error {}
function exclusive<T>(task:()=>Promise<T>):Promise<T>{const result=queue.then(task,task);queue=result.catch(()=>{});return result;}
type DeviceContext={token:string|undefined};
async function checkDevice(context:DeviceContext){if(await getCloudDeviceToken()!==context.token)throw new Error('Kết nối kho cloud đã thay đổi. Hãy thử lại thao tác.');}
async function acknowledge(key:string,value:unknown,context:DeviceContext,bookId?:string){await db.transaction('rw',db.settings,async()=>{await checkDevice(context);if(bookId&&await db.settings.get(`${DELETED}${location.origin}:${bookId}`))throw new CloudDeletedError('Truyện đã bị xóa khỏi kho chung.');await db.settings.put({key,value});});}
async function request(path:string,init:RequestInit|undefined,context:DeviceContext):Promise<Response>{
  const token=await getCloudDeviceToken();if(token!==context.token)throw new Error('Kết nối kho cloud đã thay đổi. Hãy thử lại thao tác.');
  const headers=new Headers(init?.headers);if(token)headers.set('Authorization',`Bearer ${token}`);
  const response=await fetch(`/api/cloud/${path}`,{...init,headers,credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(120000)});
  await checkDevice(context);
  publicLibrary=response.headers.get('X-Library-Access')==='public';
  if(response.status===401)throw new Error('Kết nối thiết bị với kho cloud để tiếp tục.');
  if(response.status===503){
    const payload=await response.json().catch(()=>null);
    const code=payload?.error;
    if(code==='cloud_not_configured')throw new Error('Kho cloud chưa được cấu hình: cần hoàn tất thiết lập R2.');
    if(code==='cloud_read_limit')throw new Error('Kho cloud đã hết hạn mức đọc D1 hôm nay. Hãy thử lại sau khi hạn mức được đặt lại. Bản trên thiết bị vẫn được giữ.');
    if(code==='cloud_auth_unavailable')throw new Error('Kết nối kho cloud chưa sẵn sàng. Hãy thử lại sau.');
    if(code==='storage_migration_required'||code==='parts_migration_required')throw new Error('Kho cloud cần cập nhật cấu trúc lưu trữ. Bản trên thiết bị vẫn được giữ.');
    throw new Error('Kho cloud tạm thời không khả dụng. Hãy thử lại. Bản trên thiết bị vẫn được giữ.');
  }
  if(response.status===409)throw new Error('Truyện đã có bản cloud khác. Không ghi đè; bản local vẫn được giữ.');
  if(response.status===410)throw new CloudDeletedError('Truyện đã bị xóa khỏi kho chung. Bản trên thiết bị vẫn được giữ.');
  if(response.status===507)throw new Error('Kho cloud đã đạt giới hạn an toàn. Bản local vẫn được giữ.');
  if(!response.ok)throw new Error(`Kho cloud báo lỗi ${response.status}. Bản local vẫn được giữ.`);
  if(!response.headers.get('Content-Type')?.includes('application/json'))throw new Error('Kho cloud chưa hoạt động trên địa chỉ này.');
  return response;
}
function cloudBook(value:unknown):CloudBook{
  const book=value as Partial<CloudBook>|null;
  if(!book||typeof book.id!=='string'||!UUID.test(book.id)||typeof book.title!=='string'||book.title.length>300||typeof book.sha256!=='string'||!/^[a-f0-9]{64}$/.test(book.sha256)||!Number.isSafeInteger(book.bytes)||book.bytes!<=0||book.bytes!>MAX_CLOUD_BYTES||!Number.isSafeInteger(book.updatedAt))throw new Error('Danh sách cloud không hợp lệ.');
  if(book.author!==undefined&&(typeof book.author!=='string'||book.author.length>300))throw Error('Tác giả trên kho không hợp lệ.');
  if(book.displayTitle!==undefined&&(typeof book.displayTitle!=='string'||book.displayTitle.length>300))throw Error('Tiêu đề hiển thị trên kho không hợp lệ.');
  const album=normalizeCloudAlbum(book.album);
  return {...book,...(book.displayTitle?{displayTitle:book.displayTitle}:{}),...(book.cover===undefined?{}:{cover:validateSharedImage(book.cover)}),...(album?{album}:{album:undefined})} as CloudBook;
}
export async function listCloudBooks():Promise<CloudBook[]>{
  const context={token:await getCloudDeviceToken()};
  const books:CloudBook[]=[],seen=new Set<string>();let cursor:string|null=null;
  do{
    const result=await (await request(`books${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,undefined,context)).json();
    if(!Array.isArray(result.books)||result.books.length>100||!(result.cursor===null||typeof result.cursor==='string'))throw new Error('Danh sách cloud không hợp lệ.');
    for(const value of result.books){const book=cloudBook(value);if(seen.has(book.id))throw new Error('Danh sách cloud trùng truyện.');seen.add(book.id);books.push(book);}
    cursor=result.cursor;if(cursor&&(!result.books.length||books.length>100000))throw new Error('Phân trang cloud không hợp lệ.');
  }while(cursor);await checkDevice(context);return books;
}
export function syncLocalBooks(onStatus:(message:string)=>void=()=>{}):Promise<number>{return exclusive(async()=>{
  const context={token:await getCloudDeviceToken()};
  // Probe before allocating snapshots or sending any local content.
  await request('books',undefined,context);const books=await db.books.where('status').equals('ready').toArray();let uploaded=0;const failed:string[]=[];
  let originalsSupported=false;
  if(books.length&&await db.sources.count()){
    const capabilities=await(await request('books?features=1',undefined,context)).json();
    originalsSupported=capabilities?.features?.originalsV1===true;
  }
  const pendingOriginals=originalsSupported?await pendingOriginalBooks(new Set(books.map(book=>book.id)),location.origin):new Set<string>();
  const receipts=await db.settings.bulkGet(books.flatMap(book=>[`${ACK}${location.origin}:${book.id}`,`${DELETED}${location.origin}:${book.id}`]));
  for(const [index,book]of books.entries()){
    const key=`${ACK}${location.origin}:${book.id}`;if(receipts[index*2+1])continue;
    const alreadyUploaded=!!receipts[index*2];if(alreadyUploaded&&!pendingOriginals.has(book.id))continue;
    await checkDevice(context);if(await db.settings.get(`${DELETED}${location.origin}:${book.id}`))continue;
    try{
    if(!alreadyUploaded){
    onStatus(`Đang gửi truyện: ${book.title}`);
    const {bytes,book:snapshotBook}=await createCloudSnapshotWithMetadata(book.id);await publishSharedImages({kind:'book',bookId:book.id,key:'',value:snapshotBook});const hash=await contentHash(bytes);
    const headers:Record<string,string>={'Content-Type':'application/json','X-Book-Title':encodeURIComponent(snapshotBook.title),'X-Content-SHA256':hash};
    if(snapshotBook.displayTitle)headers['X-Book-Display-Title']=encodeURIComponent(snapshotBook.displayTitle);
    if(snapshotBook.album)headers['X-Book-Album']=encodeURIComponent(snapshotBook.album);
    const response=await request(`books/${book.id}`,{method:'PUT',headers,body:new Blob([new Uint8Array(bytes)],{type:'application/json'})},context);
    const result=await response.json();if(result.id!==book.id||result.sha256!==hash)throw new Error('Xác nhận upload cloud không khớp; chưa đánh dấu đồng bộ.');
    await acknowledge(key,{sha256:hash,uploadedAt:Date.now()},context,book.id);uploaded++;
    }
    if(pendingOriginals.has(book.id))await syncBookOriginals(book.id,onStatus,true);
    }catch(error){if(error instanceof CloudDeletedError)await acknowledge(`${DELETED}${location.origin}:${book.id}`,true,context);else failed.push(`${book.title}: ${error instanceof Error?error.message:String(error)}`);}
  }
  if(failed.length)throw new Error(`Đã đồng bộ ${uploaded} truyện; ${failed.length} truyện cần thử lại. ${failed.slice(0,3).join(' · ')}`);
  await checkDevice(context);return uploaded;
});}

export async function listDeletedCloudBooks():Promise<string[]>{
  const context={token:await getCloudDeviceToken()};const ids:string[]=[],seen=new Set<string>();let cursor:string|null=null;
  do{
    const response=await request(`deletions${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,undefined,context);
    const result=await response.json();
    if(!Array.isArray(result.ids)||result.ids.length>100||!(result.cursor===null||typeof result.cursor==='string'))throw new Error('Danh sách xóa trên kho không hợp lệ.');
    for(const id of result.ids){if(typeof id!=='string'||!UUID.test(id)||seen.has(id))throw new Error('Danh sách xóa trên kho không hợp lệ.');seen.add(id);ids.push(id);}
    const next=result.cursor;
    if(next&&(!UUID.test(next)||next===cursor||!result.ids.length||ids.length>100000))throw new Error('Phân trang xóa trên kho không hợp lệ.');
    cursor=next;
  }while(cursor);
  await db.transaction('rw',db.settings,async()=>{await checkDevice(context);for(const id of ids)await db.settings.put({key:`${DELETED}${location.origin}:${id}`,value:true});});
  return ids;
}

export async function deleteCloudBook(id:string):Promise<void>{
  if(!UUID.test(id))throw new Error('ID truyện không hợp lệ.');
  const context={token:await getCloudDeviceToken()};
  const result=await (await request(`books/${id}`,{method:'DELETE'},context)).json();
  if(result.id!==id||result.deleted!==true)throw new Error('Chưa xác nhận xóa truyện khỏi kho.');
  await db.transaction('rw',db.settings,async()=>{await checkDevice(context);await db.settings.put({key:`${DELETED}${location.origin}:${id}`,value:true});await db.settings.delete(`${ACK}${location.origin}:${id}`);});
}
export function downloadCloudBook(book:CloudBook):Promise<'added'|'existing'>{return exclusive(async()=>{
  book=cloudBook(book);
  const context={token:await getCloudDeviceToken()};
  if(await db.books.get(book.id))return 'existing';
  const response=await request(`books/${book.id}`,undefined,context);if(!response.body)throw new Error('Bản cloud thiếu nội dung.');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_CLOUD_BYTES||size>book.bytes)throw new Error('Bản cloud vượt kích thước khai báo.');chunks.push(part.value);}}finally{await reader.cancel();reader.releaseLock();}
  if(size!==book.bytes)throw new Error('Bản cloud thiếu dữ liệu.');const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  await checkDevice(context);const result=await restoreCloudSnapshot(bytes,book.id,book.sha256,async()=>{await checkDevice(context);if(await db.settings.get(`${DELETED}${location.origin}:${book.id}`))throw new CloudDeletedError('Truyện đã bị xóa khỏi kho chung.');});
  if(result==='added')await acknowledge(`${ACK}${location.origin}:${book.id}`,{sha256:book.sha256,uploadedAt:Date.now()},context,book.id);
  return result;
});}
