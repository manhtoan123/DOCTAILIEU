import type {Chapter,NameEntry} from '../../../core/domain';
import {convertBatchTitles} from '../../names-convert/services/title-converter';
import {hasChinese} from './title-resolver';
import {normalizeLibrarySearch} from './fuzzy-library-search';

export {normalizeLibrarySearch,searchFuzzyLibraryBooks,type FuzzyLibraryBook,type FuzzyLibraryHit,type FuzzyLibraryRow} from './fuzzy-library-search';

export type SearchChapter=Pick<Chapter,'id'|'bookId'|'order'|'title'|'displayTitle'>;
export interface ChapterMatch {chapterId:string;title:string;displayTitle:string;count:number}

export async function searchChapterTitles(chapters:SearchChapter[],query:string,namesByBook:Map<string,NameEntry[]>,signal:AbortSignal):Promise<Record<string,ChapterMatch>>{
  const matches:Record<string,ChapterMatch>=Object.create(null);
  const needle=normalizeLibrarySearch(query);
  if(!needle)return matches;
  const groups=new Map<string,SearchChapter[]>();
  for(const chapter of chapters){
    const group=groups.get(chapter.bookId)||[];
    group.push(chapter);groups.set(chapter.bookId,group);
  }
  for(const [bookId,group] of groups){
    const names=namesByBook.get(bookId)||[];
    group.sort((left,right)=>left.order-right.order);
    for(let offset=0;offset<group.length;offset+=60){
      signal.throwIfAborted();
      const batch=group.slice(offset,offset+60);
      const pending=batch.filter(chapter=>hasChinese(chapter.title)&&(!chapter.displayTitle||names.some(name=>name.key&&chapter.title.includes(name.key))));
      const converted=await convertBatchTitles(pending.map(chapter=>chapter.title),names);
      signal.throwIfAborted();
      const titles=new Map(pending.map((chapter,index)=>[chapter.id,converted[index]]));
      for(const chapter of batch){
        const displayTitle=titles.get(chapter.id)||chapter.displayTitle||chapter.title;
        if(![chapter.title,chapter.displayTitle||'',displayTitle].some(title=>normalizeLibrarySearch(title).includes(needle)))continue;
        if(matches[bookId])matches[bookId].count++;
        else matches[bookId]={chapterId:chapter.id,title:chapter.title,displayTitle,count:1};
      }
    }
  }
  return matches;
}
