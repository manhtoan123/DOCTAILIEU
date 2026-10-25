import {db} from '../../../core/db';
import type {Chapter,Progress} from '../../../core/domain';
import type {AiReadingSource} from '../../ai/services/ai-reading';
import {paragraphRanges,isHiddenChapter} from '../../../core/domain';

/** Stamp an observation, not a later flush; preserve order even within one millisecond. */
export function readingObservationTime(previous=0){return Math.max(Date.now(),Number.isSafeInteger(previous)&&previous<Number.MAX_SAFE_INTEGER?previous+1:0);}

/** AI paragraph indexes refer to translated text, never the source paragraph count. */
export function matchesReadingProgress(progress:Progress,chapter:Chapter|undefined):chapter is Chapter{
 if(!chapter||chapter.bookId!==progress.bookId||chapter.revision!==progress.revision||!Number.isSafeInteger(progress.paragraph)||progress.paragraph<0||!Number.isSafeInteger(progress.offset)||progress.offset<0)return false;
 return progress.mode==='ai'?progress.offset===0&&progress.paragraph<=(progress.reading?512000:0):progress.paragraph<paragraphRanges(chapter.text).length&&progress.offset<=chapter.text.length;
}
/** Called only for the visible AI chapter, including loading. Prewarm never calls this. */
export async function saveAiReadingProgress(source:AiReadingSource,isCurrent:()=>boolean=()=>true):Promise<boolean>{
 return db.transaction('rw',[db.books,db.chapters,db.progress,db.settings],async()=>{
  const book=await db.books.get(source.bookId),chapter=await db.chapters.get(source.id),old=await db.progress.get(source.bookId);
  if(isHiddenChapter(book,source.id)||!isCurrent()||book?.status!=='ready'||!chapter||chapter.bookId!==source.bookId||chapter.revision!==source.revision||chapter.text!==source.text)return false;
  if(typeof location!=='undefined'&&await db.settings.get(`cloud-deleted:${location.origin}:${source.bookId}`))return false;
  // Keep the saved translated position until the complete render can restore it.
  if(old?.reading&&old.mode==='ai'&&old.chapterId===source.id&&matchesReadingProgress(old,chapter))return false;
  if(!isCurrent())return false;
  await db.progress.put({bookId:source.bookId,chapterId:source.id,revision:source.revision,paragraph:0,offset:0,mode:'ai',reading:true,updatedAt:readingObservationTime(old?.reading?old.updatedAt:0)});return true;
 });
}
/** Save observed reading, in either direction. Older asynchronous writes cannot win. */
export async function saveReadingProgress(progress:Progress,isCurrent:()=>boolean=()=>true):Promise<boolean>{
 const actual={...progress,reading:true as const};
 return db.transaction('rw',[db.books,db.chapters,db.progress,db.settings],async()=>{
  const book=await db.books.get(progress.bookId),chapter=await db.chapters.get(progress.chapterId),old=await db.progress.get(progress.bookId);
  if(!isCurrent()||isHiddenChapter(book,progress.chapterId)||book?.status!=='ready'||!matchesReadingProgress(actual,chapter)||!Number.isSafeInteger(progress.updatedAt)||progress.updatedAt<0)return false;
  if(typeof location!=='undefined'&&await db.settings.get(`cloud-deleted:${location.origin}:${progress.bookId}`))return false;
  if(old?.reading&&old.updatedAt>progress.updatedAt||!isCurrent())return false;
  await db.progress.put(actual);return true;
 });
}
/** Legacy AI completions cannot replace actual reading; chapter order is irrelevant. */
export async function chooseAiReadingProgress(local:Progress,remote:Progress):Promise<'local'|'remote'|undefined>{
 if(local.bookId!==remote.bookId||local.mode!=='ai'&&remote.mode!=='ai')return;
 const left=await db.chapters.get(local.chapterId),right=await db.chapters.get(remote.chapterId),book=await db.books.get(local.bookId);
 if(isHiddenChapter(book,local.chapterId)||isHiddenChapter(book,remote.chapterId)||!matchesReadingProgress(local,left)||!matchesReadingProgress(remote,right))return;
 if(local.reading&&remote.mode==='ai'&&!remote.reading)return 'local';
 if(remote.reading&&local.mode==='ai'&&!local.reading)return 'remote';
 if(local.updatedAt!==remote.updatedAt)return local.updatedAt>remote.updatedAt?'local':'remote';
 if(local.chapterId===remote.chapterId&&local.paragraph===remote.paragraph&&local.offset===remote.offset&&local.mode===remote.mode)return 'local';
}
