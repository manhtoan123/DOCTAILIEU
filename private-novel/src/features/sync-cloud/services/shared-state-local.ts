import {ALBUM_NAMES_PREFIX,albumNameSetting} from '../../names-convert/services/album-name-schema';
import {matchesReadingProgress} from '../../reader/services/reading-progress';
import {nameTombKey,convertTombKey,SHARED_NAME_TOMBS,SHARED_CONVERT_TOMBS} from './shared-name-intents';
import {db,refreshChapterCounts} from '../../../core/db';
import {isHiddenChapter} from '../../../core/domain';
import {CHAPTER_STATE_PREFIX} from './chapter-state-schema';
import {applyChapterVisibility} from './chapter-state-local';
import {uid,type Book,type Progress,type Chapter,type DictKind,defaults} from '../../../core/domain';
import {CONVERT_NAMES_KEY,formatConvertNames,parseConvertNames,type ConvertName} from '../../names-convert/services/convert-names';
import {ALBUM_REGISTRY_KEY,type AlbumRegistry} from '../../library/services/album-registry';
import {aiBookSettingsKey,readReadingAiSettings} from '../../ai/services/ai-reading';
import {readTtsCursor,writeTtsCursor,clearTtsCursor,ttsHash,type TtsCursor} from '../../tts/services/tts-cursor';
import type {SharedChapterPatch} from './shared-chapters';
import {validateSharedRecord,type SharedRecord} from './shared-state-schema';
import {APPEND_PREFIX,APPEND_PACKET_PREFIX,type AppendManifest} from '../../import-export/services/chapter-append-schema';
import {applyAppendRecord,prepareAppendRecord,type PreparedAppend} from '../../import-export/services/chapter-append';

export const SHARED_CHAPTER_PREFIX='shared-chapter:';
export const SHARED_COMMON_PREFIX='shared-common-name:';
export const SHARED_DICTIONARY_PREFIX='shared-dictionary:';
export const sharedSettingsKey=(r:SharedRecord)=>r.kind==='chapter-state'?CHAPTER_STATE_PREFIX+r.bookId:r.kind==='chapter-append'?APPEND_PREFIX+r.bookId+':'+r.key:r.kind==='chapter-append-packet'?APPEND_PACKET_PREFIX+r.bookId+':'+r.key:r.kind==='reader'?'reader':r.kind==='reader-options'?'reader-options':r.kind==='albums'?ALBUM_REGISTRY_KEY:r.kind==='ai-settings'?(r.bookId?aiBookSettingsKey(r.bookId):'ai-translate-settings'):r.kind==='chapter'?`${SHARED_CHAPTER_PREFIX}${r.bookId}:${r.key}`:r.kind==='album-name'?albumNameSetting(r.key):r.kind==='common-name'?SHARED_COMMON_PREFIX+encodeURIComponent(r.key):r.kind==='dictionary'?SHARED_DICTIONARY_PREFIX+r.key:'';
async function localCursor(bookId:string){const row=await db.settings.get('tts-cursor-shared:'+bookId),mirror=readTtsCursor(bookId);if(row?.value===null)return null;const saved=row?.value as TtsCursor|undefined;const chosen=mirror&&(!saved||mirror.updatedAt>saved.updatedAt)?mirror:saved;return chosen&&isHiddenChapter(await db.books.get(bookId),chosen.chapterId)?null:chosen;}
/** Book metadata replicated to other devices; the persisted Vietnamese title travels with it. */
function bookMetadata(b:Book){return {title:b.title,author:b.author??'',...(b.displayTitle?{displayTitle:b.displayTitle}:{}),...(b.cover?{cover:b.cover}:{}),...(b.album?{album:b.album}:{})};}
export async function captureSharedRecords():Promise<SharedRecord[]>{
 const records:SharedRecord[]=[];
 await db.transaction('r',[db.books,db.names,db.settings,db.progress],async()=>{
  const books=await db.books.where('status').equals('ready').toArray(),ids=new Set(books.map(b=>b.id));
  const push=(r:SharedRecord)=>records.push(normalizeLocal(r));
  for(const b of books){push({kind:'book',bookId:b.id,key:'',value:bookMetadata(b)});const ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${b.id}`))?.value as {sha256:string}|undefined;if(ack){const stored=await db.settings.get(CHAPTER_STATE_PREFIX+b.id);if(stored||b.hiddenChapterIds?.length)push({kind:'chapter-state',bookId:b.id,key:'',value:{version:1,baseSha256:ack.sha256,hiddenIds:b.hiddenChapterIds??[]}});}}
  for(const n of await db.names.toArray())if(ids.has(n.bookId))push({kind:'name',bookId:n.bookId,key:n.key,value:n.value});
  for(const p of await db.progress.toArray())if(ids.has(p.bookId))push({kind:'progress',bookId:p.bookId,key:'',value:p});
  for(const key of ['reader','reader-options',ALBUM_REGISTRY_KEY,'ai-translate-settings',CONVERT_NAMES_KEY]){
   const row=await db.settings.get(key);if(!row)continue;
   if(key===CONVERT_NAMES_KEY){if(!Array.isArray(row.value))throw new Error('Name List không hợp lệ.');for(const n of row.value as ConvertName[])push({kind:'convert-name',key:n.key,value:n.value});}
   else push({kind:key==='reader'?'reader':key==='reader-options'?'reader-options':key===ALBUM_REGISTRY_KEY?'albums':'ai-settings',key:'',value:row.value});
  }
  for(const b of books){const row=await db.settings.get(aiBookSettingsKey(b.id));if(row)push({kind:'ai-settings',bookId:b.id,key:'',value:row.value});const cursor=await localCursor(b.id);if(cursor)push({kind:'tts-cursor',bookId:b.id,key:'',value:cursor});}
  for(const prefix of [ALBUM_NAMES_PREFIX,SHARED_CHAPTER_PREFIX,SHARED_COMMON_PREFIX,SHARED_DICTIONARY_PREFIX,SHARED_NAME_TOMBS,SHARED_CONVERT_TOMBS])for(const row of await db.settings.where('key').startsWith(prefix).toArray()){
   const record=row.value as SharedRecord;if(['name','convert-name'].includes(record.kind)&&await readLocalSharedRecord(record).then(r=>r?.value!==null&&r?.value!==undefined))continue;if(record.kind==='chapter'){const ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${record.bookId}`))?.value as {sha256:string}|undefined;if(!ack)continue;if((record.value as SharedChapterPatch).baseSha256==='0'.repeat(64))record.value={...(record.value as SharedChapterPatch),baseSha256:ack.sha256};}if(!record.bookId||ids.has(record.bookId))push(record);
  }
  // Packets precede manifests on publication, including after an offline restart.
  for(const prefix of [APPEND_PACKET_PREFIX,APPEND_PREFIX])for(const row of (await db.settings.where('key').startsWith(prefix).toArray()).sort((a,b)=>prefix===APPEND_PREFIX?((a.value as SharedRecord).value as AppendManifest).anchor.order-((b.value as SharedRecord).value as AppendManifest).anchor.order:a.key.localeCompare(b.key))){
   let record=validateSharedRecord(row.value);if(!record.bookId||!ids.has(record.bookId))continue;
   if(record.kind==='chapter-append'){const ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${record.bookId}`))?.value as {sha256:string}|undefined;if(!ack)continue;if((record.value as AppendManifest).baseSha256==='0'.repeat(64))record={...record,value:{...record.value as AppendManifest,baseSha256:ack.sha256}};}push(record);
  }
 });
 // New chapters must exist before a cursor/progress or an edit can refer to them.
 const packets=records.filter(r=>r.kind==='chapter-append-packet'),events=records.filter(r=>r.kind==='chapter-append'||r.kind==='chapter');
 events.sort((a,b)=>{const order=(r:SharedRecord)=>r.kind==='chapter-append'?(r.value as AppendManifest).anchor.order+0.5:(r.value as SharedChapterPatch).chapters[0].order;return (a.bookId??'').localeCompare(b.bookId??'')||order(a)-order(b);});
 return [...packets,...events,...records.filter(r=>r.kind!=='chapter-append-packet'&&r.kind!=='chapter-append'&&r.kind!=='chapter')];
}
export async function readLocalSharedRecord(descriptor:Pick<SharedRecord,'kind'|'bookId'|'key'>):Promise<SharedRecord|undefined>{
 const r={...descriptor,value:null} as SharedRecord;
 let value:unknown;
 if(r.kind==='name')value=(await db.names.where('[bookId+key]').equals([r.bookId!,r.key]).first())?.value;
 else if(r.kind==='convert-name')value=((await db.settings.get(CONVERT_NAMES_KEY))?.value as ConvertName[]|undefined)?.find(n=>n.key===r.key)?.value;
 else if(r.kind==='book'){const b=await db.books.get(r.bookId!);if(b?.status==='ready')value=bookMetadata(b);}
 else if(r.kind==='chapter-state'){const b=await db.books.get(r.bookId!),stored=await db.settings.get(CHAPTER_STATE_PREFIX+r.bookId),ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${r.bookId}`))?.value as {sha256:string}|undefined;if(b&&(stored||b.hiddenChapterIds?.length))value={...r,value:{version:1,baseSha256:ack?.sha256??'0'.repeat(64),hiddenIds:b.hiddenChapterIds??[]}};}
 else if(r.kind==='progress')value=await db.progress.get(r.bookId!);
 else if(r.kind==='tts-cursor'){value=await localCursor(r.bookId!);}
 else value=(await db.settings.get(sharedSettingsKey(r)))?.value;
 if(value===undefined&&r.kind==='name')return (await db.settings.get(nameTombKey(r.bookId!,r.key)))?.value as SharedRecord|undefined;
 if(value===undefined&&r.kind==='convert-name')return (await db.settings.get(convertTombKey(r.key)))?.value as SharedRecord|undefined;
 if(value===undefined)return;
 if(['album-name','chapter-state','chapter','common-name','dictionary','chapter-append','chapter-append-packet'].includes(r.kind)){const record=value as SharedRecord;if(['chapter-state','chapter','chapter-append'].includes(r.kind)&&(record.value as SharedChapterPatch)?.baseSha256==='0'.repeat(64)){const ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${r.bookId}`))?.value as {sha256:string}|undefined;if(!ack)return;return validateSharedRecord({...record,value:{...(record.value as object),baseSha256:ack.sha256}});}return validateSharedRecord(record);}
 return normalizeLocal({...r,value});
}
function normalizeLocal(r:SharedRecord):SharedRecord{if(r.value!==null&&r.kind==='reader')return validateSharedRecord({...r,value:{...defaults,...r.value as object}});if(r.value!==null&&r.kind==='ai-settings')return validateSharedRecord({...r,value:{...r.value as object,...readReadingAiSettings(r.value)}});return validateSharedRecord(r);}
export function sharedJson(record:SharedRecord|undefined){return record?JSON.stringify(record):undefined;}
export class LocalSharedConflict extends Error {constructor(){super('Bản trên máy đã thay đổi; giữ lại để chọn bản cần dùng.');}}
/** Called inside a settings/book lock transaction, after validation/hash outside it. */
export async function applyLocalSharedRecord(record:SharedRecord,expected:string|undefined,chapterBefore?:Chapter[]|PreparedAppend,force=false):Promise<void>{
 if(sharedJson(await readLocalSharedRecord(record))!==expected)throw new LocalSharedConflict();
 if(record.bookId){const b=await db.books.get(record.bookId);if(b?.status!=='ready'||await db.settings.get(`cloud-deleted:${location.origin}:${record.bookId}`))throw new LocalSharedConflict();}
 if(record.kind==='chapter-state'){try{await applyChapterVisibility(record);}catch{throw new LocalSharedConflict();}
 }else if(record.kind==='chapter-append-packet'){
  const previous=await readLocalSharedRecord(record);if(previous&&!sameAppend(previous,record))throw new LocalSharedConflict();await db.settings.put({key:sharedSettingsKey(record),value:record});
 }else if(record.kind==='chapter-append'){
  if(!chapterBefore||Array.isArray(chapterBefore))throw new LocalSharedConflict();try{await applyAppendRecord(record,chapterBefore);}catch{throw new LocalSharedConflict();}
 }else if(record.kind==='name'){
  const old=await db.names.where('[bookId+key]').equals([record.bookId!,record.key]).first();
  if(record.value===null){if(old)await db.names.delete(old.id);await db.settings.put({key:nameTombKey(record.bookId!,record.key),value:record});}else{await db.names.put({id:old?.id??uid(),bookId:record.bookId!,key:record.key,value:record.value as string});await db.settings.delete(nameTombKey(record.bookId!,record.key));}
 }else if(record.kind==='convert-name'){
  const old=((await db.settings.get(CONVERT_NAMES_KEY))?.value??[]) as ConvertName[],next=old.filter(n=>n.key!==record.key);if(record.value!==null)next.push({key:record.key,value:record.value as string});try{parseConvertNames(formatConvertNames(next));}catch{throw new LocalSharedConflict();}await db.settings.put({key:CONVERT_NAMES_KEY,value:next});if(record.value===null)await db.settings.put({key:convertTombKey(record.key),value:record});else await db.settings.delete(convertTombKey(record.key));
 }else if(record.kind==='book'){
  if(record.value!==null)await db.books.update(record.bookId!,{...(record.value as Pick<Book,'title'|'author'|'album'>),album:(record.value as Book).album,cover:(record.value as Book).cover,updatedAt:Date.now()});
 }else if(record.kind==='progress'){
  if(record.value===null)await db.progress.delete(record.bookId!);else{const p=record.value as Progress,c=await db.chapters.get(p.chapterId);if(!c||isHiddenChapter(await db.books.get(record.bookId!),c.id)||c.bookId!==record.bookId||c.revision!==p.revision||!matchesReadingProgress(p,c))throw new LocalSharedConflict();await db.progress.put(p);}
 }else if(record.kind==='tts-cursor'){
  if(record.value!==null){const cursor=record.value as TtsCursor,c=await db.chapters.get(cursor.chapterId);if(!c||isHiddenChapter(await db.books.get(record.bookId!),c.id)||c.bookId!==record.bookId||c.revision!==cursor.revision)throw new LocalSharedConflict();}await db.settings.put({key:'tts-cursor-shared:'+record.bookId,value:record.value});
 }else if(record.kind==='chapter'){
  if(record.value===null)throw new LocalSharedConflict();
  const patch=record.value as {baseSha256:string;sourceHash:string;sourceRevision:number;chapters:Chapter[]},ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${record.bookId}`))?.value as {sha256?:string}|undefined;
  if(ack?.sha256!==patch.baseSha256||!Array.isArray(chapterBefore))throw new LocalSharedConflict();
  for(const before of chapterBefore){const current=await db.chapters.get(before.id);if(!current||JSON.stringify(current)!==JSON.stringify(before))throw new LocalSharedConflict();}
  const current=await db.chapters.get(record.key);if(current&&current.bookId!==record.bookId||!current&&!(record.value as SharedChapterPatch).legacy)throw new LocalSharedConflict();
  const ownerBook=await db.books.get(record.bookId!);for(const target of patch.chapters){const old=await db.chapters.get(target.id);if(ownerBook?.epub){if(!old?.epub||!target.epub||target.order!==old.order||target.epub.path!==old.epub.path||ownerBook.epub.spine[target.order]!==target.epub.path||target.text!==target.epub.nodes.join('\n'))throw new LocalSharedConflict();}else if(target.epub)throw new LocalSharedConflict();}
  for(const target of patch.chapters){const c=await db.chapters.get(target.id);if(c&&(c.bookId!==record.bookId||!force&&target.id!==record.key&&!chapterBefore.some(before=>before.id===target.id)&&(c.text!==target.text||c.revision!==target.revision)))throw new LocalSharedConflict();}
  for(const target of patch.chapters){const old=await db.chapters.get(target.id);await db.chapters.put({...target,sourceId:old?.sourceId??current?.sourceId??''});}
  await refreshChapterCounts(record.bookId!);await db.settings.put({key:sharedSettingsKey(record),value:record});
 }else if(record.kind==='dictionary'){if(record.value===null)await db.dictionaries.delete(record.key as DictKind);await db.settings.put({key:sharedSettingsKey(record),value:record});
 }else if(record.kind==='albums'){
  const old=(await db.settings.get(ALBUM_REGISTRY_KEY))?.value as AlbumRegistry|undefined,next=record.value as AlbumRegistry|null;
  if(next)await db.settings.put({key:ALBUM_REGISTRY_KEY,value:next});else await db.settings.delete(ALBUM_REGISTRY_KEY);
 }else{
  const key=sharedSettingsKey(record);if(record.value===null&&['reader','reader-options','ai-settings'].includes(record.kind))await db.settings.delete(key);else await db.settings.put({key,value:['album-name','common-name','dictionary'].includes(record.kind)?record:record.value});
 }
}
const sameAppend=(a:SharedRecord,b:SharedRecord)=>JSON.stringify(a)===JSON.stringify(b);
export async function prepareSharedChapter(record:SharedRecord,force=false):Promise<Chapter[]|PreparedAppend|undefined>{
 if(record.kind==='chapter-append')return prepareAppendRecord(record);
 if(record.kind!=='chapter')return;
 if(record.value===null)throw new LocalSharedConflict();const patch=record.value as {sourceHash:string;sourceRevision:number;chapters:Chapter[]};
 const current=await db.chapters.get(record.key);if(current&&current.bookId!==record.bookId)throw new LocalSharedConflict();if(!current){if(force&&(record.value as SharedChapterPatch).legacy)return [];throw new LocalSharedConflict();}
 const prior=(await readLocalSharedRecord(record))?.value as {chapters?:Chapter[]}|undefined;
 const target=patch.chapters[0],old=prior?.chapters?.[0];
 if(!force&&target.revision<current.revision)throw new LocalSharedConflict();
 if(!force&&!(current.text===target.text&&current.revision===target.revision)&&!(old&&current.text===old.text&&current.revision===old.revision)&&!(!(record.value as SharedChapterPatch).legacy&&current.revision===patch.sourceRevision&&await ttsHash(current.text)===patch.sourceHash))throw new LocalSharedConflict();
 return (await Promise.all(patch.chapters.map(c=>db.chapters.get(c.id)))).filter((c):c is Chapter=>!!c);
}

