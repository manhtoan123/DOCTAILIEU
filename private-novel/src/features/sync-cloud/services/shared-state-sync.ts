import {publishSharedImages} from './shared-images';
import {CHAPTER_STATE_PENDING,validateChapterState} from './chapter-state-schema';
import {applyChapterVisibility} from './chapter-state-local';
import {db} from '../../../core/db';
import {publishSharedDictionary,initializeSharedDictionaries} from './shared-dictionaries';
import {initializeSharedChapters,type SharedChapterPatch} from './shared-chapters';
import {applyPendingCommonNames} from './shared-common-names';
import {chooseAiReadingProgress} from '../../reader/services/reading-progress';
import type {Progress} from '../../../core/domain';
import {liveQuery} from 'dexie';
import {queueAiSettings} from '../../ai/services/ai-reading';
import {ttsHash,mirrorTtsCursor,type TtsCursor} from '../../tts/services/tts-cursor';
import {validateSharedRecord,validateSharedDescriptor,sharedRecordId,type SharedRecord} from './shared-state-schema';
import {captureSharedRecords,readLocalSharedRecord,applyLocalSharedRecord,prepareSharedChapter,LocalSharedConflict,sharedJson} from './shared-state-local';

export const SHARED_STATE_KEY='shared-state-replica-v1';
export const SHARED_STATE_EVENT='shared-state-status';
interface Descriptor {kind:SharedRecord['kind'];bookId?:string;key:string}
interface Base {descriptor:Descriptor;revision:number;hash:string}
export interface SharedStateRow {id:string;revision:number;record:SharedRecord}
export interface SharedReplica {version:1;changeCursor?:number;cursors:Record<string,number>;base:Record<string,Base>;conflicts:Record<string,SharedStateRow>}
export interface SharedSyncStatus {state:'local'|'syncing'|'synced'|'conflict';message:string;pending:number}
let status:SharedSyncStatus={state:'local',message:'Chưa đồng bộ chỉnh sửa.',pending:0},flight:Promise<void>|undefined;
const empty=():SharedReplica=>({version:1,cursors:Object.create(null),base:Object.create(null),conflicts:Object.create(null)});
const descriptor=(r:SharedRecord):Descriptor=>({kind:r.kind,...(r.bookId?{bookId:r.bookId}:{}),key:r.key});
const normalized=(current:SharedRecord|undefined,d:Descriptor)=>current??{...d,value:null};
const immutableAppend=(r:Descriptor)=>r.kind==='chapter-append'||r.kind==='chapter-append-packet';
const ignoredAppendKey=(id:string)=>'shared-append-ignored:'+id;
async function ignoredAppend(id:string,hash:string,revision:number|undefined){const ignored=(await db.settings.get(ignoredAppendKey(id)))?.value as {hash?:string;revision?:number}|undefined;return ignored?.hash===hash&&ignored?.revision===revision;}
function recordHash(record:SharedRecord){let value=record.value;if(value&&['progress','tts-cursor'].includes(record.kind)){const {updatedAt:_,...position}=value as Record<string,unknown>;value=position;}return ttsHash(JSON.stringify({...record,value}));}
function publish(next:SharedSyncStatus){status=next;if(typeof window!=='undefined')window.dispatchEvent(new Event(SHARED_STATE_EVENT));}
export function sharedSyncStatus(){return status;}
interface PendingChapterState {record:SharedRecord;id:string;baseRevision:number;operationId:string;ack?:SharedStateRow}
/** Fixed CAS journal: an ambiguous response is retried without overwriting a newer decision. */
export async function retryChapterState(bookId:string){
 const key=CHAPTER_STATE_PENDING+bookId,pending=(await db.settings.get(key))?.value as PendingChapterState|undefined;if(!pending)return;
 if((await db.books.get(bookId))?.status!=='ready'||await db.settings.get(`cloud-deleted:${location.origin}:${bookId}`)){await db.settings.delete(key);return;}
 let row=pending.ack;
 if(!row){
  const {response,data}=await request('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:pending.id,baseRevision:pending.baseRevision,record:pending.record})});
  if(response.status===410){await db.settings.delete(key);throw Error('Truyện đã bị xóa trên kho.');}
  if(response.status===400||response.status===413||response.status===409&&!data.row){await db.settings.delete(key);throw Error('Kho từ chối cập nhật danh sách chương. Hãy đồng bộ rồi thử lại.');}
  if(!response.ok&&response.status!==409)throw Error('Chưa xác nhận được trên kho. Chương vẫn giữ nguyên; sẽ thử lại khi đồng bộ.');
  row=await validateRow(data.row,pending.id);
  if(JSON.stringify(row.record)!==JSON.stringify(pending.record)){
   await db.settings.delete(key);await receive(row);throw Error('Danh sách chương đã thay đổi trên thiết bị khác. Hãy kiểm tra lại.');
  }
  if(row.revision<=pending.baseRevision)throw Error('Xác nhận danh sách chương không hợp lệ.');
  await db.transaction('rw',db.settings,async()=>{const latest=(await db.settings.get(key))?.value as PendingChapterState|undefined;if(latest?.operationId===pending.operationId)await db.settings.put({key,value:{...pending,ack:row}});});
 }
 const hash=await recordHash(row.record),ack=row;
 let changed=false,superseded=false;
 await locked(()=>db.transaction('rw',[db.settings,db.books,db.chapters,db.progress],async()=>{
  const latest=(await db.settings.get(key))?.value as PendingChapterState|undefined;if(latest?.operationId!==pending.operationId)return;
  const replica=await readSharedReplica();
  if((replica.base[ack.id]?.revision??0)>ack.revision){await db.settings.delete(key);superseded=true;return;}
  await applyChapterVisibility(ack.record);replica.base[ack.id]={descriptor:descriptor(ack.record),revision:ack.revision,hash};delete replica.conflicts[ack.id];
  await db.settings.put({key:SHARED_STATE_KEY,value:replica});await db.settings.delete(key);changed=true;
 }));
 if(superseded)throw Error('Đã có danh sách chương mới hơn. Hãy kiểm tra lại.');
 if(changed)await applied(ack.record);
}
export async function changeChapterVisibility(bookId:string,ids:string[],hide:boolean){
 if(flight)await flight;
 // Capture the chosen IDs, not a stale replacement of the whole list.
 const record=await db.transaction('r',[db.books,db.chapters,db.settings],async()=>{
  const book=await db.books.get(bookId);if(book?.status!=='ready'||book.epub)throw Error('Chỉ quản lý chương TXT đã nhập xong.');
  if(await db.settings.get(CHAPTER_STATE_PENDING+bookId))throw Error('Đang chờ xác nhận lần trước. Hãy đồng bộ rồi thử lại.');
  if(!ids.length||ids.length>10000)throw Error('Hãy chọn chương.');
  for(const chapter of await db.chapters.bulkGet(ids))if(!chapter||chapter.bookId!==bookId)throw Error('Chương không còn khả dụng.');
  const hidden=new Set(book.hiddenChapterIds??[]);for(const id of ids)if(hide)hidden.add(id);else hidden.delete(id);
  const ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${bookId}`))?.value as {sha256:string}|undefined;
  return validateSharedRecord({kind:'chapter-state',bookId,key:'',value:{version:1,baseSha256:ack?.sha256??'0'.repeat(64),hiddenIds:[...hidden]}});
 });
 if(validateChapterState(record.value).baseSha256==='0'.repeat(64)){
  await db.transaction('rw',[db.settings,db.books,db.chapters,db.progress],async()=>{const current=await db.books.get(bookId);const expected=validateChapterState(record.value).hiddenIds;const hidden=new Set(current?.hiddenChapterIds??[]);for(const id of ids)if(hide)hidden.add(id);else hidden.delete(id);if(JSON.stringify([...hidden].sort())!==JSON.stringify(expected))throw Error('Danh sách chương đã thay đổi. Hãy thử lại.');if(await db.settings.get(`cloud-uploaded:${location.origin}:${bookId}`))throw Error('Truyện vừa được đồng bộ. Hãy thử lại.');await applyChapterVisibility(record);});await applied(record);return;
 }
 const id=await sharedRecordId(record),replica=await readSharedReplica();if(replica.conflicts[id])throw Error('Hãy giải quyết xung đột đồng bộ trước khi xóa chương.');
 await db.settings.add({key:CHAPTER_STATE_PENDING+bookId,value:{record,id,baseRevision:replica.base[id]?.revision??0,operationId:crypto.randomUUID()} satisfies PendingChapterState});
 await retryChapterState(bookId);
}
export async function readSharedReplica():Promise<SharedReplica>{
 const value=(await db.settings.get(SHARED_STATE_KEY))?.value;if(!value)return empty();
 const v=value as SharedReplica;if(v.version!==1||!v.cursors||!v.base||!v.conflicts||Object.keys(v.base).length>60000)throw new Error('Lịch sử đồng bộ không hợp lệ; giữ nguyên dữ liệu trên máy.');
 const result=empty();if(v.changeCursor!==undefined){if(!Number.isSafeInteger(v.changeCursor)||v.changeCursor<0)throw new Error('Mốc đồng bộ không hợp lệ.');result.changeCursor=v.changeCursor;}for(const [scope,cursor] of Object.entries(v.cursors)){if(scope.length>200||!Number.isSafeInteger(cursor)||cursor<0)throw new Error('Mốc đồng bộ không hợp lệ.');result.cursors[scope]=cursor;}
 for(const [id,base] of Object.entries(v.base)){if(!/^[a-f0-9]{64}$/.test(id)||!Number.isSafeInteger(base.revision)||base.revision<1||!/^[a-f0-9]{64}$/.test(base.hash))throw new Error('Lịch sử đồng bộ không hợp lệ.');validateSharedDescriptor(base.descriptor);result.base[id]=base;}
 for(const [id,row] of Object.entries(v.conflicts))result.conflicts[id]=parseRow(row,id);
 return result;
}
function parseRow(value:unknown,id?:string):SharedStateRow{
 const r=value as SharedStateRow;if(!r||typeof r.id!=='string'||!/^[a-f0-9]{64}$/.test(r.id)||id&&r.id!==id||!Number.isSafeInteger(r.revision)||r.revision<1)throw new Error('Phản hồi đồng bộ không hợp lệ.');return {id:r.id,revision:r.revision,record:validateSharedRecord(r.record)};
}
async function validateRow(value:unknown,id?:string):Promise<SharedStateRow>{
 const row=parseRow(value,id);if(await sharedRecordId(row.record)!==row.id)throw new Error('Phản hồi đồng bộ sai định danh.');return row;
}
async function request(url:string,init?:RequestInit){
 const response=await fetch(url,{...init,credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(30000)});
 const reader=response.body?.getReader();if(!reader)throw new Error('Kho đồng bộ trả phản hồi rỗng.');let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2*1024*1024)throw new Error('Phản hồi đồng bộ quá lớn.');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 let data;try{data=JSON.parse(text);}catch{throw new Error('Kho đồng bộ chưa sẵn sàng.');}return {response,data};
}
function locked<T>(operation:()=>Promise<T>):Promise<T>{return queueAiSettings(SHARED_STATE_KEY,operation);}
function recordLock<T>(record:SharedRecord,operation:()=>Promise<T>):Promise<T>{const key=record.kind==='reader'?'reader':record.kind==='reader-options'?'reader-options':record.kind==='ai-settings'?(record.bookId?'ai-book-settings:'+record.bookId:'ai-translate-settings'):record.kind==='tts-cursor'?'tts-cursor-shared:'+record.bookId:undefined;return key?queueAiSettings(key,operation):operation();}
async function applied(record:SharedRecord){if(record.kind==='chapter-state'){const cursor=(await db.settings.get('tts-cursor-shared:'+record.bookId))?.value as TtsCursor|null;mirrorTtsCursor(record.bookId!,cursor??null);}if(record.kind==='tts-cursor')await recordLock(record,async()=>{const current=(await db.settings.get('tts-cursor-shared:'+record.bookId))?.value as TtsCursor|null;mirrorTtsCursor(record.bookId!,current??null);record={...record,value:current??null};});if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('shared-state-applied',{detail:record}));}
// Only distinct Names share a transaction. Other kinds retain their own lock,
// preparation and event ordering; hashes are computed outside IndexedDB.
async function receiveRows(rows:SharedStateRow[]){
 const snapshots:{row:SharedStateRow;before:SharedRecord|undefined;expected:string|undefined;currentHash:string;remoteHash:string;prepared:Awaited<ReturnType<typeof prepareSharedChapter>>;prepareFailed:boolean}[]=[];
 for(const row of rows){
  const before=await readLocalSharedRecord(row.record),expected=sharedJson(before),current=normalized(before,descriptor(row.record)),currentHash=await recordHash(current),remoteHash=await recordHash(row.record);
  let prepared:Awaited<ReturnType<typeof prepareSharedChapter>>,prepareFailed=false;
  if(currentHash!==remoteHash)try{prepared=await prepareSharedChapter(row.record);}catch{prepareFailed=true;}
  snapshots.push({row,before,expected,currentHash,remoteHash,prepared,prepareFailed});
 }
 const appliedRows:SharedRecord[]=[];
 await recordLock(rows[0].record,()=>locked(()=>db.transaction('rw',[db.settings,db.books,db.names,db.progress,db.chapters,db.dictionaries,db.sources],async()=>{
  const replica=await readSharedReplica();let updated=false;
  for(const {row,before,expected,currentHash,remoteHash,prepared,prepareFailed} of snapshots){
  const base=replica.base[row.id];if(base&&row.revision<=base.revision)continue;
  const latest=await readLocalSharedRecord(row.record),changed=sharedJson(latest)!==expected;
  const downloaded=(await db.settings.get('shared-download-baseline:'+row.record.bookId))?.value as {book:unknown;names:Record<string,string>}|undefined;const initial=row.record.kind==='book'?downloaded?.book:row.record.kind==='name'&&downloaded&&Object.hasOwn(downloaded.names,row.record.key)?downloaded.names[row.record.key]:undefined;
  const knownInitial=initial!==undefined&&JSON.stringify(before?.value)===JSON.stringify(initial);
  const dirty=changed||currentHash!==remoteHash&&(base?currentHash!==base.hash:before!==undefined&&!knownInitial);
  const progressChoice=row.record.kind==='progress'&&latest?.value&&row.record.value?await chooseAiReadingProgress(latest.value as Progress,row.record.value as Progress):undefined;
  let conflict=progressChoice===undefined?dirty||prepareFailed:prepareFailed;
  if(!conflict&&progressChoice!=='local'&&(currentHash!==remoteHash||changed))try{await applyLocalSharedRecord(row.record,progressChoice===undefined?expected:sharedJson(latest),prepared);appliedRows.push(row.record);}catch(error){if(!(error instanceof LocalSharedConflict))throw error;conflict=true;}
  if(conflict)replica.conflicts[row.id]=row;else delete replica.conflicts[row.id];
  replica.base[row.id]={descriptor:descriptor(row.record),revision:row.revision,hash:remoteHash};updated=true;
  }
  if(updated)await db.settings.put({key:SHARED_STATE_KEY,value:replica});
 })));
 for(const record of appliedRows)await applied(record);
}
const receive=(row:SharedStateRow)=>receiveRows([row]);
async function receivePage(rows:SharedStateRow[]){
 for(let index=0;index<rows.length;){
  const first=rows[index],group=[first],ids=new Set([first.id]);index++;
  if(first.record.kind==='name')while(index<rows.length&&rows[index].record.kind==='name'&&!ids.has(rows[index].id)){
   ids.add(rows[index].id);group.push(rows[index++]);
  }
  await receiveRows(group);
 }
}
async function discoverScopes(scopes:string[]):Promise<{scopes:string[];checkpoint?:number}>{
 const {response,data}=await request('/api/state?head=1');
 if(!response.ok)throw new Error('Chưa kết nối được kho đồng bộ; chỉnh sửa vẫn giữ trên máy.');
 // An older server returns the legacy global page for an unknown parameter.
 if(data.changesV1!==true)return {scopes};
 const head=data.revision,replica=await readSharedReplica(),before=replica.changeCursor;
 if(!Number.isSafeInteger(head)||head<0||before!==undefined&&head<before)throw new Error('Mốc đồng bộ chung không hợp lệ.');
 if(before===undefined)return {scopes,checkpoint:head};
 const relevant=new Set(scopes),selected=new Set(scopes.filter(scope=>replica.cursors[scope]===undefined));
 let after=before,pages=0;
 if(after<head)for(;;){
  const {response,data}=await request(`/api/state?changes=1&after=${after}&until=${head}`);
  if(!response.ok)throw new Error('Chưa kết nối được kho đồng bộ; chỉnh sửa vẫn giữ trên máy.');
  if(data.changesV1!==true||data.revision!==head||!Number.isSafeInteger(data.cursor)||data.cursor<after||data.cursor>head||typeof data.more!=='boolean'||!Array.isArray(data.changes)||data.changes.length>100||data.more&&(data.cursor<=after||data.changes.length!==100||data.changes.at(-1)?.revision!==data.cursor)||!data.more&&data.cursor!==head)throw new Error('Trang thay đổi đồng bộ không hợp lệ.');
  let previous=after;
  for(const change of data.changes){
   if(!change||typeof change.scope!=='string'||change.scope.length>200||/[\u0000-\u001f]/.test(change.scope)||!Number.isSafeInteger(change.revision)||change.revision<=previous||change.revision>data.cursor)throw new Error('Trang thay đổi đồng bộ không hợp lệ.');
   previous=change.revision;if(relevant.has(change.scope))selected.add(change.scope);
  }
  after=data.cursor;if(!data.more)break;if(++pages>1000)throw new Error('Kho còn cập nhật; sẽ tiếp tục đồng bộ lượt sau.');
 }
 return {scopes:scopes.filter(scope=>selected.has(scope)),checkpoint:head};
}
async function perform(){
 publish({state:'syncing',message:'Đang đồng bộ chỉnh sửa…',pending:0});
 try{
  const dictionariesInitialized=await initializeSharedDictionaries();await initializeSharedChapters();
  const scopes=['',...(await db.books.where('status').equals('ready').toArray()).map(b=>b.id)];
  const discovery=await discoverScopes(scopes);
  for(const scope of discovery.scopes){let pages=0;for(;;){const replica=await readSharedReplica(),after=replica.cursors[scope]??0;const {response,data}=await request(`/api/state?${scope?`book=${encodeURIComponent(scope)}&`:''}after=${after}`);
    if(response.status===410)break;if(!response.ok)throw new Error('Chưa kết nối được kho đồng bộ; chỉnh sửa vẫn giữ trên máy.');
    if(!Number.isSafeInteger(data.cursor)||data.cursor<after||typeof data.more!=='boolean'||!Array.isArray(data.rows)||data.rows.length>99||data.more&&data.cursor<=after)throw new Error('Trang đồng bộ không hợp lệ.');
    const rows=await Promise.all(data.rows.map((r:unknown)=>validateRow(r)));if(rows.some(r=>(r.record.bookId??'')!==scope))throw new Error('Trang đồng bộ sai truyện.');
    await receivePage(rows);
    await locked(()=>db.transaction('rw',db.settings,async()=>{const latest=await readSharedReplica();latest.cursors[scope]=Math.max(latest.cursors[scope]??0,data.cursor);await db.settings.put({key:SHARED_STATE_KEY,value:latest});}));
    if(!data.more)break;if(++pages>1000)throw new Error('Kho còn cập nhật; sẽ tiếp tục đồng bộ lượt sau.');
  }}
  if(discovery.checkpoint!==undefined)await locked(()=>db.transaction('rw',db.settings,async()=>{const latest=await readSharedReplica();if((latest.changeCursor??-1)<discovery.checkpoint!){latest.changeCursor=discovery.checkpoint;await db.settings.put({key:SHARED_STATE_KEY,value:latest});}}));
  for(const pending of await db.settings.where('key').startsWith(CHAPTER_STATE_PENDING).toArray())await retryChapterState(pending.key.slice(CHAPTER_STATE_PENDING.length));
  const records=await captureSharedRecords(),replica=await readSharedReplica(),local=new Map<string,SharedRecord>();
  for(const record of records)local.set(await sharedRecordId(record),record);
  // Missing local keys are explicit tombstones only when this device has seen
  // their shared base. A fresh device does not delete records it never loaded.
  const readyIds=new Set(records.filter(r=>r.kind==='book').map(r=>r.bookId!));
  for(const [id,base] of Object.entries(replica.base))if(!local.has(id)&&!immutableAppend(base.descriptor)&&base.descriptor.kind!=='chapter-state'&&(!base.descriptor.bookId||readyIds.has(base.descriptor.bookId))){
   const existing=await readLocalSharedRecord(base.descriptor);local.set(id,normalized(existing,base.descriptor));
  }
  let waiting=dictionariesInitialized?0:1;
  for(const [id,record] of local){const base=replica.base[id],hash=await recordHash(record);if(replica.conflicts[id]||hash===base?.hash||immutableAppend(record)&&await ignoredAppend(id,hash,base?.revision))continue;
   if(record.bookId&&(await db.books.get(record.bookId))?.status!=='ready')continue;
   await publishSharedImages(record);if(record.kind==='dictionary')await publishSharedDictionary(record); // Verify immutable blob before publishing metadata.
   const {response,data}=await request('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,baseRevision:base?.revision??0,record})});
   if(response.status===410||response.status===425)continue;
   if(response.status===409&&data.row){await receive(await validateRow(data.row,id));continue;}
   if(!response.ok)throw new Error(response.status===413?'Kho đồng bộ đạt giới hạn; thay đổi vẫn giữ trên máy.':'Chưa gửi được chỉnh sửa; bản trên máy được giữ.');
   const row=await validateRow(data.row,id);if(row.revision<=(base?.revision??0)||JSON.stringify(row.record)!==JSON.stringify(record))throw new Error('Xác nhận đồng bộ không khớp.');
   await locked(()=>db.transaction('rw',db.settings,async()=>{const latest=await readSharedReplica();latest.base[id]={descriptor:descriptor(record),revision:row.revision,hash};delete latest.conflicts[id];await db.settings.put({key:SHARED_STATE_KEY,value:latest});}));
  }
  await applyPendingCommonNames();
  const latest=await readSharedReplica(),conflicts=Object.keys(latest.conflicts).length;
  const final=await captureSharedRecords(),finalIds=new Set<string>(),finalBooks=new Set(final.filter(r=>r.kind==='book').map(r=>r.bookId!));
  for(const record of final){const id=await sharedRecordId(record),hash=await recordHash(record);finalIds.add(id);if(!latest.conflicts[id]&&hash!==latest.base[id]?.hash&&!(immutableAppend(record)&&await ignoredAppend(id,hash,latest.base[id]?.revision)))waiting++;}
  for(const [id,base] of Object.entries(latest.base))if(!finalIds.has(id)&&!immutableAppend(base.descriptor)&&base.descriptor.kind!=='chapter-state'&&!latest.conflicts[id]&&(!base.descriptor.bookId||finalBooks.has(base.descriptor.bookId))){const record=normalized(await readLocalSharedRecord(base.descriptor),base.descriptor);if(await recordHash(record)!==base.hash)waiting++;}
  if(!waiting&&!conflicts)for(const bookId of finalBooks)await db.settings.delete('shared-download-baseline:'+bookId);
  publish({state:conflicts?'conflict':waiting?'local':'synced',message:conflicts?`${conflicts} chỉnh sửa cần chọn bản giữ.`:waiting?'Còn chỉnh sửa chờ truyện/file được lưu trên kho.':'Các chỉnh sửa đã đồng bộ.',pending:waiting+conflicts});
 }catch(error){publish({state:'local',message:error instanceof Error?error.message:'Chưa đồng bộ được; giữ chỉnh sửa trên máy.',pending:status.pending});}
}
export function syncSharedState():Promise<void>{return flight??=(perform().finally(()=>{flight=undefined;}));}
export async function resolveSharedState(id:string,choice:'local'|'shared'){
 if(flight)await flight;const replica=await readSharedReplica(),row=replica.conflicts[id];if(!row)return;
 const before=await readLocalSharedRecord(row.record),expected=sharedJson(before);let selected=row.record;
 if(row.record.kind==='chapter'&&before?.value&&row.record.value){
  const remote=row.record.value as SharedChapterPatch,local=before.value as SharedChapterPatch,preferred=choice==='local'?local:remote,other=choice==='local'?remote:local;
  const targets=[...preferred.chapters,...other.chapters.filter(c=>!preferred.chapters.some(p=>p.id===c.id))].map(c=>({...c}));
  for(const target of targets){const current=await db.chapters.get(target.id),old=remote.chapters.find(c=>c.id===target.id);const floor=Math.max(current?.revision??0,old?.revision??0);if(current&&(current.text!==target.text||current.title!==target.title||current.order!==target.order||JSON.stringify(current.epub)!==JSON.stringify(target.epub))||old&&(old.text!==target.text||old.title!==target.title||old.order!==target.order||JSON.stringify(old.epub)!==JSON.stringify(target.epub)))target.revision=Math.max(target.revision,floor+1);else target.revision=Math.max(target.revision,floor);}
  selected=validateSharedRecord({...row.record,value:{...remote,editRevision:(remote.editRevision??remote.chapters[0].revision)+1,chapters:targets}});
 }
 const shouldApply=choice==='shared'||row.record.kind==='chapter',prepared=shouldApply?await prepareSharedChapter(selected,true):undefined,ignore=choice==='local'&&immutableAppend(row.record)?await recordHash(normalized(before,descriptor(row.record))):undefined;
 await recordLock(row.record,()=>locked(()=>db.transaction('rw',[db.settings,db.books,db.names,db.progress,db.chapters,db.dictionaries,db.sources],async()=>{const current=await readSharedReplica();if(current.conflicts[id]?.revision!==row.revision)throw new LocalSharedConflict();if(shouldApply)await applyLocalSharedRecord(selected,expected,prepared,true);if(ignore!==undefined){if(sharedJson(await readLocalSharedRecord(row.record))!==expected)throw new LocalSharedConflict();await db.settings.put({key:ignoredAppendKey(id),value:{hash:ignore,revision:row.revision}});}delete current.conflicts[id];await db.settings.put({key:SHARED_STATE_KEY,value:current});})));if(shouldApply)await applied(selected);await syncSharedState();
}
export function startSharedStateSync(){
 let alive=true,timer:ReturnType<typeof setTimeout>|undefined,subscription:{unsubscribe():void}|undefined,observation=0;
 const run=()=>{if(alive&&!document.hidden)void syncSharedState();};
 const changed=()=>{clearTimeout(timer);if(!alive||document.hidden)return;timer=setTimeout(()=>{if(flight)void flight.then(changed);else run();},1200);};
 const suspend=()=>{observation++;subscription?.unsubscribe();subscription=undefined;clearTimeout(timer);};
 const observe=()=>{
  if(!alive||document.hidden||subscription)return;
  const current=++observation;
  // TTS checkpoints still persist while hidden. Avoid recapturing the entire
  // library for each checkpoint; a fresh visible subscription reads all edits.
  subscription=liveQuery(captureSharedRecords).subscribe({next:()=>{if(current===observation)changed();},error:error=>{if(alive&&!document.hidden&&current===observation)publish({state:'local',message:error instanceof Error?error.message:'Chưa đọc được chỉnh sửa.',pending:0});}});
 };
 const visibility=()=>{if(document.hidden)suspend();else{observe();run();}};
 observe();run();const interval=setInterval(run,300000);window.addEventListener('focus',run);window.addEventListener('online',run);window.addEventListener('shared-state-changed',changed);document.addEventListener('visibilitychange',visibility);
 return()=>{alive=false;suspend();clearInterval(interval);window.removeEventListener('focus',run);window.removeEventListener('online',run);window.removeEventListener('shared-state-changed',changed);document.removeEventListener('visibilitychange',visibility);};
}
