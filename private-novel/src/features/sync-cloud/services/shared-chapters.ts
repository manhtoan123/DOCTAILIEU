import {editEpubText} from '../../import-export/services/epub-layout-schema';
import {db,refreshChapterCounts} from '../../../core/db';
import Dexie from 'dexie';
import {ttsHash} from '../../tts/services/tts-cursor';
import {type Chapter,uid} from '../../../core/domain';
import {validateSharedRecord,type SharedRecord} from './shared-state-schema';
export const SHARED_CHAPTER_PREFIX='shared-chapter:';
export interface SharedChapterPatch {baseSha256:string;sourceHash:string;sourceRevision:number;editRevision?:number;legacy?:boolean;chapters:Chapter[]}
const key=(bookId:string,id:string)=>SHARED_CHAPTER_PREFIX+bookId+':'+id;
/** User edit, source identity rechecked and patch/split publication recorded atomically. */
export async function saveSharedChapter(before:Chapter,text:string,splitAt?:number,title?:string){
 if(before.epub&&splitAt!==undefined)throw Error('EPUB giữ nguyên mục lục gốc; không chia lại chương.');
 if(title!==undefined&&(!title.trim()||title.length>1000))throw Error('Tên chương cần có từ 1 đến 1.000 ký tự.');
 if(text.length>128000)throw Error('Mỗi phần tối đa 128.000 ký tự.');
 const sourceHash=await ttsHash(before.text);
 await db.transaction('rw',[db.books,db.chapters,db.settings],async()=>{
  const current=await db.chapters.get(before.id),book=await db.books.get(before.bookId);if(!current||JSON.stringify(current)!==JSON.stringify(before)||book?.status!=='ready'||book.hiddenChapterIds?.includes(before.id)||await db.settings.get(`cloud-deleted:${location.origin}:${before.bookId}`))throw Error('Chương đã thay đổi ở thiết bị khác; bản đang soạn vẫn được giữ.');
  const records=await db.settings.where('key').startsWith(SHARED_CHAPTER_PREFIX+before.bookId+':').toArray();
  const owner=records.find(r=>(r.value as SharedRecord).value&&( (r.value as SharedRecord).value as SharedChapterPatch).chapters.some(c=>c.id===before.id));
  const prior=owner?(owner.value as SharedRecord).value as SharedChapterPatch:undefined,root=owner?(owner.value as SharedRecord).key:before.id;
  const ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${before.bookId}`))?.value as {sha256:string}|undefined;
  const patch:SharedChapterPatch=prior?{...prior,chapters:prior.chapters.map(c=>({...c})),editRevision:(prior.editRevision??prior.chapters[0].revision)+1}:{baseSha256:ack?.sha256??'0'.repeat(64),sourceHash,sourceRevision:before.revision,editRevision:before.revision+1,chapters:[{...before}]};
  const split=!!splitAt&&splitAt>0&&splitAt<text.length;
  const replacement={...current,...(title!==undefined?{title:title.trim(),displayTitle:undefined}:{}),text:split?text.slice(0,splitAt):text,revision:current.revision+1,...(current.epub?{epub:editEpubText(current.epub,text)}:{})};patch.chapters=patch.chapters.map(c=>c.id===before.id?replacement:c);
  if(split){const next=await db.chapters.where('bookId').equals(before.bookId).filter(c=>c.order>before.order).sortBy('order');patch.chapters.push({...before,id:uid(),order:next[0]?(before.order+next[0].order)/2:before.order+1,title:before.title+' · tiếp',text:text.slice(splitAt),revision:1});}
  const record=validateSharedRecord({kind:'chapter',bookId:before.bookId,key:root,value:patch});
  for(const target of (record.value as SharedChapterPatch).chapters){const old=await db.chapters.get(target.id);if(old&&old.bookId!==before.bookId)throw Error('ID chương trùng truyện khác.');await db.chapters.put({...target,sourceId:old?.sourceId??before.sourceId});}
  await db.settings.put({key:key(before.bookId,root),value:record});
  await refreshChapterCounts(before.bookId);
 });
}
/** Existing edited chapters need an explicit comparison if their old anchor is unknown. */
export async function initializeSharedChapters(){
 for(const book of await db.books.where('status').equals('ready').toArray()){
  if(await db.settings.get('shared-chapters-initialized:'+book.id))continue;
  const groups=new Map<string,Chapter[]>();let root:Chapter|undefined;
  await db.chapters.where('[bookId+order]').between([book.id,Dexie.minKey],[book.id,Dexie.maxKey]).each(chapter=>{if(Number.isInteger(chapter.order)&&!(root&&root.revision>1&&chapter.sourceId===root.sourceId&&chapter.title.startsWith(root.title+' · tiếp'))){root=chapter;if(chapter.revision>1)groups.set(chapter.id,[chapter]);}else if(root){if(!groups.has(root.id))groups.set(root.id,[root]);groups.get(root.id)!.push(chapter);}});
  for(const [id,chapters] of groups){const sourceHash=await ttsHash(chapters[0].text);await db.transaction('rw',[db.settings,db.chapters],async()=>{if(await db.settings.get(key(book.id,id)))return;for(const chapter of chapters){const current=await db.chapters.get(chapter.id);if(!current||JSON.stringify(current)!==JSON.stringify(chapter))return;}
   const ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${book.id}`))?.value as {sha256:string}|undefined;
   const targets=chapters.map((c,i)=>({...c,revision:i===0?Math.max(2,c.revision):c.revision}));const record=validateSharedRecord({kind:'chapter',bookId:book.id,key:id,value:{baseSha256:ack?.sha256??'0'.repeat(64),sourceHash,sourceRevision:1,editRevision:targets[0].revision,legacy:true,chapters:targets}});await db.settings.put({key:key(book.id,id),value:record});});}
  await db.settings.put({key:'shared-chapters-initialized:'+book.id,value:true});
 }
}
