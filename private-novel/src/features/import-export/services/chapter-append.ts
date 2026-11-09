import {db,deleteBook,readyChapters,refreshChapterCounts} from '../../../core/db';
import {uid,type Book,type Chapter,type SourceFile} from '../../../core/domain';
import {importFiles,type ImportStatus} from './importer';
import {ttsHash} from '../../tts/services/tts-cursor';
import {validateSharedRecord,SHARED_STATE_MAX_ROW_BYTES,type SharedRecord} from '../../sync-cloud/services/shared-state-schema';
import {APPEND_PREFIX,APPEND_PACKET_PREFIX,type AppendManifest,type AppendPacket} from './chapter-append-schema';
export interface AppendPreview {book:Book;before:Chapter[];stageId:string;staged:Chapter[];source:SourceFile;start:number;match?:'exact'|'title'|'manual';blockedIds?:string[];inferredHeadings?:number}
export interface PreparedAppend {kind:'append';recordJson:string;anchor:Chapter;anchorEdit?:{key:string;value:unknown};before:Chapter[];packets:SharedRecord[];chapters:Chapter[];source?:SourceFile}
const check=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('Đã hủy cập nhật.','AbortError');};
const normalize=(s:string)=>s.replace(/\r\n?/g,'\n').trim();
export const appendAnchorHash=(c:Chapter)=>ttsHash(JSON.stringify([c.id,c.revision,c.order,c.title,c.text]));
export type AppendMode='full'|'new-only';
export async function findNewOnlyStart(before:Chapter[],fresh:Chapter[],signal?:AbortSignal){
 if(!before.length||!fresh.length)throw Error('Truyện và file cập nhật phải có chương.');
 const identities=new Set<string>(),titles=new Set<string>();
 for(const c of before){check(signal);identities.add(await ttsHash(normalize(c.text)));titles.add(normalize(c.title));}
 for(const c of fresh){check(signal);const hash=await ttsHash(normalize(c.text)),title=normalize(c.title);if(identities.has(hash)||titles.has(title))throw Error('File có chương trùng nội dung hoặc tiêu đề; hãy kiểm tra lại hoặc chọn file TXT đầy đủ.');identities.add(hash);titles.add(title);}
 check(signal);return 0;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
async function exactAppendStarts(before:Chapter[],fresh:Chapter[],signal?:AbortSignal){
 if(!before.length)throw Error('Truyện chưa có chương để đối chiếu.');
 const identity=(c:Chapter)=>ttsHash(JSON.stringify([normalize(c.title),normalize(c.text)])),tail=before.slice(-3),hashes:string[]=[];
 for(const c of tail){check(signal);hashes.push(await identity(c));}
 const candidates:number[]=[];
 for(let i=fresh.length-1;i>=tail.length-1;i--){
  check(signal);if(normalize(fresh[i].title)!==normalize(tail.at(-1)!.title)||await identity(fresh[i])!==hashes.at(-1))continue;
  let matches=true;for(let j=0;j<tail.length-1;j++)if(await identity(fresh[i-tail.length+1+j])!==hashes[j]){matches=false;break;}
  if(matches)candidates.push(i+1);
 }
 check(signal);return candidates;
}
export async function findAppendStart(before:Chapter[],fresh:Chapter[],signal?:AbortSignal){
 const candidates=await exactAppendStarts(before,fresh,signal);
 if(candidates.length!==1)throw Error(candidates.length?'Mốc cuối xuất hiện nhiều lần; chưa thể tự nối chương.':'Không tìm thấy đủ các chương cuối khớp nội dung; hãy kiểm tra file, encoding và cách chia chương.');
 if(candidates[0]===fresh.length)throw Error('File này chưa có chương mới sau mốc hiện tại.');return candidates[0];
}
const titleKey=(s:string)=>normalize(s).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/：/g,':').replace(/\s+/gu,' ').toLowerCase();
const chapterTitles=(c:Chapter)=>[...new Set([c.title,c.displayTitle??''].map(titleKey).filter(Boolean))];
/** Duplicate guards compare metadata/content only; source bytes and old rows stay untouched. */
async function blockedAppendIds(before:Chapter[],fresh:Chapter[],signal?:AbortSignal){
 const knownTitles=new Set(before.flatMap(chapterTitles)),knownBodies=new Set<string>(),freshBodies:string[]=[],titles=new Map<string,number>(),bodies=new Map<string,number>();
 const bodyKey=(c:Chapter)=>ttsHash(normalize(c.text).replace(/\s+/gu,' '));
 for(const c of before){check(signal);knownBodies.add(await bodyKey(c));}
 for(const c of fresh){check(signal);const body=await bodyKey(c);freshBodies.push(body);bodies.set(body,(bodies.get(body)??0)+1);for(const key of chapterTitles(c))titles.set(key,(titles.get(key)??0)+1);}
 check(signal);return fresh.filter((c,i)=>knownBodies.has(freshBodies[i])||(bodies.get(freshBodies[i])??0)>1||chapterTitles(c).some(key=>knownTitles.has(key)||(titles.get(key)??0)>1)).map(c=>c.id);
}
export async function resolveAppendMatch(before:Chapter[],fresh:Chapter[],signal?:AbortSignal):Promise<Pick<AppendPreview,'start'|'match'|'blockedIds'>>{
 if(!fresh.length)throw Error('File cập nhật chưa có chương.');
 const exact=await exactAppendStarts(before,fresh,signal);
 if(exact.length===1&&exact[0]===fresh.length)throw Error('File này chưa có chương mới sau mốc hiện tại.');
 const blockedIds=await blockedAppendIds(before,fresh,signal);
 if(exact.length===1)return {start:exact[0],match:'exact',blockedIds};
 // A title sequence is a suggestion, never evidence that bodies are identical.
 const tail=before.slice(-3).map(chapterTitles),titles=fresh.map(chapterTitles),candidates:number[]=[];
 for(let i=fresh.length-1;i>=tail.length-1;i--){check(signal);if(tail.every((keys,j)=>keys.length&&keys.some(key=>titles[i-tail.length+1+j].includes(key))))candidates.push(i+1);}
 if(candidates.length===1&&candidates[0]<fresh.length)return {start:candidates[0],match:'title',blockedIds};
 return {start:0,match:'manual',blockedIds};
}
export function appendEligibleChapters(preview:AppendPreview){const blocked=new Set(preview.blockedIds??[]);return preview.staged.slice(preview.start).filter(c=>!blocked.has(c.id));}
export async function discardAppendPreview(preview:Pick<AppendPreview,'stageId'>){
 const stage=await db.books.get(preview.stageId);if(stage?.status==='staging')await deleteBook(preview.stageId);
}
export async function prepareTxtAppend(bookId:string,file:File,encoding:string,maxChars:number,pattern:string,onProgress:(s:ImportStatus)=>void,signal:AbortSignal,mode:AppendMode='full'):Promise<AppendPreview>{
 check(signal);if(!/\.txt$/i.test(file.name)||file.size>40*1024*1024||file.size===0)throw Error('Chọn một file TXT không rỗng, tối đa 40 MiB.');
 const book=await db.books.get(bookId);if(book?.status!=='ready'||book.epub)throw Error('Chỉ cập nhật truyện TXT đang có trên thiết bị.');
 const before=await readyChapters(bookId);check(signal);let stageId:string|undefined;
 try{
  const staged=await importFiles([file],book.title,encoding,pattern,true,onProgress,signal,{dedupe:'none',maxChars});stageId=staged.id;check(signal);
  const fresh=await readyChapters(stageId),sources=await db.sources.where('bookId').equals(stageId).toArray();if(sources.length!==1||sources[0].blob.size!==file.size)throw Error('Nguồn cập nhật chưa đầy đủ.');
  const match=mode==='new-only'?{start:await findNewOnlyStart(before,fresh,signal),match:'exact' as const}:await resolveAppendMatch(before,fresh,signal);check(signal);return {book,before,stageId,staged:fresh,source:sources[0],...match,...(staged.inferredHeadings?{inferredHeadings:staged.inferredHeadings}:{})};
 }catch(error){if(stageId)await discardAppendPreview({stageId});throw error;}
}
export async function makeAppendRecords(bookId:string,before:Chapter[],chapters:Chapter[],source:SourceFile,baseSha256:string,signal?:AbortSignal){
 const updateId=uid(),packets:SharedRecord[]=[],parts:AppendManifest['parts']=[];let group:Chapter[]=[];
 const row=(rows:Chapter[]):SharedRecord=>({kind:'chapter-append-packet',bookId,key:`${updateId}:${packets.length}`,value:{version:1,updateId,index:packets.length,chapters:rows}});
 const flush=async()=>{if(!group.length)return;check(signal);const record=validateSharedRecord(row(group));packets.push(record);parts.push({key:record.key,hash:await ttsHash(JSON.stringify(record.value)),count:group.length,chars:group.reduce((n,c)=>n+c.text.length,0)});group=[];};
 for(const chapter of chapters){check(signal);const next=[...group,chapter];if(group.length&&(next.length>128||next.reduce((n,c)=>n+c.text.length,0)>256000||new TextEncoder().encode(JSON.stringify(row(next))).length>SHARED_STATE_MAX_ROW_BYTES))await flush();group.push(chapter);}
 await flush();const anchor=before.at(-1)!;
 const manifest=validateSharedRecord({kind:'chapter-append',bookId,key:updateId,value:{version:1,baseSha256,anchor:{id:anchor.id,revision:anchor.revision,order:anchor.order,hash:await appendAnchorHash(anchor),count:before.length},source:{id:source.id,name:source.name,relativePath:source.relativePath,encoding:source.encoding,sha256:source.sha256,bytes:source.bytes},parts,count:chapters.length,chars:chapters.reduce((n,c)=>n+c.text.length,0)}});
 check(signal);return {packets,manifest};
}
export function selectedAppendChapters(preview:AppendPreview,selectedIds?:readonly string[]){
 if(!Number.isSafeInteger(preview.start)||preview.start<0||preview.start>=preview.staged.length||!preview.before.length)throw Error('Mốc cập nhật không hợp lệ.');
 if(preview.match&&preview.match!=='exact'&&selectedIds===undefined)throw Error('Mốc chưa khớp nội dung; hãy xem và tích chọn chương muốn thêm.');
 const eligible=appendEligibleChapters(preview),ids=selectedIds??eligible.map(c=>c.id),selected=new Set(ids),allowed=new Set(eligible.map(c=>c.id));
 if(!ids.length||ids.length!==selected.size||ids.some(id=>!allowed.has(id)))throw Error('Chọn ít nhất một chương mới hợp lệ; không được chọn chương cũ hoặc chương ngoài bản xem trước.');
 return eligible.filter(c=>selected.has(c.id));
}
export async function commitTxtAppend(preview:AppendPreview,signal?:AbortSignal,selectedIds?:readonly string[]){
 check(signal);const {book,before,stageId,source}=preview,chapters=selectedAppendChapters(preview,selectedIds).map((c,i)=>({...c,bookId:book.id,order:before.at(-1)!.order+i+1}));
 const ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${book.id}`))?.value as {sha256:string}|undefined;
 const {packets,manifest}=await makeAppendRecords(book.id,before,chapters,source,ack?.sha256??'0'.repeat(64),signal);
 await db.transaction('rw',[db.books,db.chapters,db.sources,db.importJobs,db.settings],async()=>{
  check(signal);if(!same(await db.books.get(book.id),book)||!same(await readyChapters(book.id),before)||await db.settings.get(`cloud-deleted:${location.origin}:${book.id}`))throw Error('Truyện đã thay đổi; hãy chọn file để kiểm tra lại.');
  const stage=await db.books.get(stageId),jobs=await db.importJobs.where('bookId').equals(stageId).toArray(),current=await readyChapters(stageId),currentSource=await db.sources.get(source.id);
  if(stage?.status!=='staging'||jobs.length!==1||jobs[0].phase!=='preview'||jobs[0].processedFiles!==jobs[0].totalFiles||!same(current,preview.staged)||(await db.sources.where('bookId').equals(stageId).count())!==1||!currentSource||!same(sourceIdentity(currentSource),sourceIdentity(source))||currentSource.blob.size!==source.bytes)throw Error('Bản xem trước đã thay đổi; chưa cập nhật.');
  for(const record of [...packets,manifest])await db.settings.add({key:(record.kind==='chapter-append'?APPEND_PREFIX:APPEND_PACKET_PREFIX)+book.id+':'+record.key,value:record});
  await db.chapters.where('bookId').equals(stageId).delete();await db.chapters.bulkAdd(chapters);await db.sources.put({...source,bookId:book.id});
  await refreshChapterCounts(book.id);
  await db.importJobs.where('bookId').equals(stageId).delete();await db.books.delete(stageId);check(signal);
 });return chapters.length;
}
const sourceIdentity=(s:SourceFile)=>[s.id,s.bookId,s.name,s.relativePath,s.encoding,s.sha256,s.bytes,s.dataStatus,s.blob.size];
export async function prepareAppendRecord(record:SharedRecord):Promise<PreparedAppend>{
 if(record.kind!=='chapter-append'||!record.value)throw Error('Thiếu bản cập nhật chương.');const value=record.value as AppendManifest,anchor=await db.chapters.get(value.anchor.id);
 if(!anchor||anchor.bookId!==record.bookId||anchor.order!==value.anchor.order||anchor.revision<value.anchor.revision)throw Error('Mốc nối chương không khớp.');
 const packets:SharedRecord[]=[],chapters:Chapter[]=[];
 for(const part of value.parts){
  const stored=(await db.settings.get(APPEND_PACKET_PREFIX+record.bookId+':'+part.key))?.value;if(!stored)throw Error('Chưa đủ phần cập nhật.');
  const row=validateSharedRecord(stored);if(row.kind!=='chapter-append-packet'||row.bookId!==record.bookId||row.key!==part.key||await ttsHash(JSON.stringify(row.value))!==part.hash)throw Error('Phần cập nhật không khớp SHA.');
  const payload=row.value as AppendPacket;if(payload.chapters.length!==part.count||payload.chapters.reduce((n,c)=>n+c.text.length,0)!==part.chars)throw Error('Phần cập nhật không đủ chương.');packets.push(row);chapters.push(...payload.chapters);
 }
 if(new Set(chapters.map(c=>c.id)).size!==chapters.length||chapters.some((c,i)=>c.order!==anchor.order+i+1||c.sourceId!==value.source.id)||chapters.length!==value.count)throw Error('Thứ tự cập nhật không hợp lệ.');
 const before=await readyChapters(record.bookId!),present=before.filter(c=>c.order>anchor.order),complete=chapters.every((c,i)=>existingAppendChapter(present[i],c));let anchorEdit:{key:string;value:unknown}|undefined;
 if(!complete&&(anchor.revision!==value.anchor.revision||await appendAnchorHash(anchor)!==value.anchor.hash)){
  // A genuine later synchronized edit can precede this append on a fresh device.
  // Preserve that edit; never accept a changed anchor with the same revision.
  if(anchor.revision>value.anchor.revision)for(const row of await db.settings.where('key').startsWith('shared-chapter:'+record.bookId+':').toArray()){
   const patch=(row.value as SharedRecord)?.value as {baseSha256?:string;sourceRevision?:number;chapters?:Chapter[]};
   if(patch?.baseSha256===value.baseSha256&&(patch.sourceRevision??Infinity)<=value.anchor.revision&&patch.chapters?.some(c=>c.id===anchor.id&&c.bookId===anchor.bookId&&c.revision===anchor.revision&&c.order===anchor.order&&c.title===anchor.title&&c.text===anchor.text)){anchorEdit=row;break;}
  }
  if(!anchorEdit)throw Error('Mốc nối chương không khớp.');
 }
 return {kind:'append',recordJson:JSON.stringify(record),anchor,...(anchorEdit?{anchorEdit}:{}),before,packets,chapters,source:await db.sources.get(value.source.id)};
}
// A later edit of an already present suffix is preserved, never overwritten by revision1.
const existingAppendChapter=(current:Chapter|undefined,added:Chapter)=>!!current&&current.id===added.id&&current.bookId===added.bookId&&current.order===added.order&&current.sourceId===added.sourceId&&(same(current,added)||current.revision>added.revision);
/** Inside the caller's sources/books/chapters/settings transaction; all hashing precedes it. */
export async function applyAppendRecord(record:SharedRecord,prepared:PreparedAppend){
 const value=record.value as AppendManifest,book=await db.books.get(record.bookId!);if(JSON.stringify(record)!==prepared.recordJson||book?.status!=='ready'||book.epub||!same(await readyChapters(record.bookId!),prepared.before)||!same(await db.chapters.get(prepared.anchor.id),prepared.anchor))throw Error('Truyện đã thay đổi trong lúc nối chương.');
 const ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${record.bookId}`))?.value as {sha256:string}|undefined;if(ack?.sha256!==value.baseSha256)throw Error('Bản gốc đồng bộ không khớp.');
 if(prepared.anchorEdit&&!same(await db.settings.get(prepared.anchorEdit.key),prepared.anchorEdit))throw Error('Bản sửa mốc cuối đã thay đổi.');
 for(const packet of prepared.packets)if(!same((await db.settings.get(APPEND_PACKET_PREFIX+record.bookId+':'+packet.key))?.value,packet))throw Error('Phần cập nhật đã thay đổi.');
 const present=prepared.before.filter(c=>c.order>prepared.anchor.order),complete=present.length>=prepared.chapters.length&&prepared.chapters.every((c,i)=>existingAppendChapter(present[i],c));
 if(!complete&&(prepared.before.length!==value.anchor.count||prepared.before.at(-1)?.id!==prepared.anchor.id))throw Error('Đã có chương khác sau mốc; giữ cả hai bản để kiểm tra.');
 const oldSource=await db.sources.get(value.source.id);if(oldSource&&(!prepared.source||oldSource.bookId!==record.bookId||!same(sourceIdentity(oldSource),sourceIdentity(prepared.source))||!same([oldSource.id,oldSource.name,oldSource.relativePath,oldSource.encoding,oldSource.sha256,oldSource.bytes],[value.source.id,value.source.name,value.source.relativePath,value.source.encoding,value.source.sha256,value.source.bytes])))throw Error('ID nguồn cập nhật trùng dữ liệu khác.');
 if(!complete){for(const c of prepared.chapters)if(await db.chapters.get(c.id))throw Error('ID chương cập nhật đã tồn tại.');await db.chapters.bulkAdd(prepared.chapters);}
 if(!oldSource)await db.sources.add({...value.source,bookId:record.bookId!,blob:new Blob([]),dataStatus:'missing'});
 const count=complete?prepared.before.length:prepared.before.length+prepared.chapters.length,chars=complete?prepared.before.reduce((n,c)=>n+c.text.length,0):prepared.before.reduce((n,c)=>n+c.text.length,0)+value.chars;
 await refreshChapterCounts(record.bookId!);await db.settings.put({key:APPEND_PREFIX+record.bookId+':'+record.key,value:record});
}
