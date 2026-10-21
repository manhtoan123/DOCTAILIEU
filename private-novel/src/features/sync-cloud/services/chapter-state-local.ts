import {db,readyChapters,refreshChapterCounts} from '../../../core/db';
import {validateChapterState,CHAPTER_STATE_PREFIX} from './chapter-state-schema';
import type {SharedRecord} from './shared-state-schema';
/** Visibility only. Retain chapter rows/source bytes so restore never reconstructs content. */
export async function applyChapterVisibility(record:SharedRecord){
 const value=validateChapterState(record.value),book=await db.books.get(record.bookId!);
 if(book?.status!=='ready'||book.epub||await db.settings.get(`cloud-deleted:${location.origin}:${book.id}`))throw Error('Truyện không còn khả dụng để sửa danh sách chương.');
 const ack=(await db.settings.get(`cloud-uploaded:${location.origin}:${book.id}`))?.value as {sha256:string}|undefined;
 if(value.baseSha256!==(ack?.sha256??'0'.repeat(64)))throw Error('Bản gốc đã thay đổi; cần đồng bộ lại.');
 for(const row of await db.chapters.bulkGet(value.hiddenIds))if(row&&row.bookId!==book.id)throw Error('Chương thuộc truyện khác.');
 const hidden=new Set(value.hiddenIds),all=await readyChapters(book.id),active=all.filter(c=>!hidden.has(c.id));
 await db.books.update(book.id,{hiddenChapterIds:value.hiddenIds});await refreshChapterCounts(book.id);
 const progress=await db.progress.get(book.id);
 if(progress&&hidden.has(progress.chapterId)){
  const old=all.find(c=>c.id===progress.chapterId),next=active.find(c=>c.order>(old?.order??-1))??active.at(-1);
  if(next)await db.progress.put({bookId:book.id,chapterId:next.id,revision:next.revision,paragraph:0,offset:0,updatedAt:Date.now()});else await db.progress.delete(book.id);
 }
 const cursor=(await db.settings.get('tts-cursor-shared:'+book.id))?.value as {chapterId?:string}|null|undefined;
 if(cursor?.chapterId&&hidden.has(cursor.chapterId))await db.settings.put({key:'tts-cursor-shared:'+book.id,value:null});
 await db.settings.put({key:CHAPTER_STATE_PREFIX+book.id,value:record});
}
