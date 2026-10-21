import {db} from '../../../core/db';
import type {Chapter,Progress} from '../../../core/domain';
import type {AiReadingSource} from '../../ai/services/ai-reading';
import {paragraphRanges,isHiddenChapter} from '../../../core/domain';

function matches(progress:Progress,chapter:Chapter|undefined):chapter is Chapter{
 return !!chapter&&chapter.bookId===progress.bookId&&chapter.revision===progress.revision&&Number.isSafeInteger(progress.paragraph)&&progress.paragraph>=0&&progress.paragraph<paragraphRanges(chapter.text).length&&Number.isSafeInteger(progress.offset)&&progress.offset>=0&&progress.offset<=chapter.text.length;
}
/** AI completion is the book's bookmark, including prewarm; cached older chapters cannot rewind it. */
export async function saveAiReadingProgress(source:AiReadingSource,isCurrent:()=>boolean=()=>true):Promise<boolean>{
 return db.transaction('rw',[db.books,db.chapters,db.progress,db.settings],async()=>{
  const book=await db.books.get(source.bookId),chapter=await db.chapters.get(source.id),old=await db.progress.get(source.bookId);
  if(isHiddenChapter(book,source.id)||!isCurrent()||book?.status!=='ready'||!chapter||chapter.bookId!==source.bookId||chapter.revision!==source.revision||chapter.text!==source.text)return false;
  if(typeof location!=='undefined'&&await db.settings.get(`cloud-deleted:${location.origin}:${source.bookId}`))return false;
  if(old?.mode==='ai'){
   const previous=await db.chapters.get(old.chapterId);
   if(matches(old,previous)&&(previous.order>chapter.order||previous.id===chapter.id))return false;
  }
  if(!isCurrent())return false;
  await db.progress.put({bookId:source.bookId,chapterId:source.id,revision:source.revision,paragraph:0,offset:0,mode:'ai',updatedAt:Date.now()});return true;
 });
}
/** Scrolling/raw-reader cleanup must not replace a completed AI bookmark. */
export async function saveReadingProgress(progress:Progress):Promise<boolean>{
 return db.transaction('rw',[db.books,db.chapters,db.progress],async()=>{
  if(isHiddenChapter(await db.books.get(progress.bookId),progress.chapterId)||(await db.progress.get(progress.bookId))?.mode==='ai'||(await db.books.get(progress.bookId))?.status!=='ready'||!matches(progress,await db.chapters.get(progress.chapterId)))return false;
  await db.progress.put(progress);return true;
 });
}
/** Only AI bookmarks have an automatic merge; normal progress/tombstones keep existing conflict rules. */
export async function chooseAiReadingProgress(local:Progress,remote:Progress):Promise<'local'|'remote'|undefined>{
 if(local.bookId!==remote.bookId||local.mode!=='ai'&&remote.mode!=='ai')return;
 const left=await db.chapters.get(local.chapterId),right=await db.chapters.get(remote.chapterId);
 const book=await db.books.get(local.bookId);if(isHiddenChapter(book,local.chapterId)||isHiddenChapter(book,remote.chapterId)||!matches(local,left)||!matches(remote,right))return;
 if(local.mode!=='ai')return 'remote';if(remote.mode!=='ai')return 'local';
 if(left.order===right.order&&left.id!==right.id)return;
 return left.order>=right.order?'local':'remote';
}
