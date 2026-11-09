import type {RefObject} from 'react';
import {NavigationLink} from '../../../shared/components/NavigationLink';
import {readerRoutePath} from '../services/reader-route';
import type {Chapter} from '../../../core/domain';
import {Modal} from '../../../shared/components/common';
import {ConvertedTitle} from '../../names-convert/components/ConvertedTitle';
type TocChapter=Pick<Chapter,'id'|'title'|'displayTitle'>;
interface Props {
 bookId:string;chapterId:string;currentChapter?:TocChapter;skipConvert:boolean;
 filtered:TocChapter[];filter:string;page:number;listRef:RefObject<HTMLDivElement|null>;
 onClose:()=>void;onFilterChange:(value:string)=>void;onPageChange:(page:number)=>void;onChapterChange:(id:string)=>void;
}
/** Filtering, page ownership and scroll restoration remain in Reader. */
export function ReaderToc({bookId,chapterId,currentChapter,skipConvert,filtered,filter,page,listRef,onClose,onFilterChange,onPageChange,onChapterChange}:Props){
 return <Modal title="Mục lục" onClose={onClose}>
  <p className="toc-reading">Đang đọc: <strong>
   <ConvertedTitle text={currentChapter?.title||''} bookId={bookId} displayTitle={currentChapter?.displayTitle} skipConvert={skipConvert}/>
  </strong></p>
  <input aria-label="Tìm chương" placeholder="Tìm chương…" value={filter} onChange={e=>onFilterChange(e.target.value)}/>
  <div className="toc" ref={listRef}>
   {filtered.slice(page*60,page*60+60).map(c=><NavigationLink
    aria-current={c.id===chapterId?'page':undefined}
    className={c.id===chapterId?'current':''}
    key={c.id} href={readerRoutePath({kind:'read',bookId,chapterId:c.id})} onNavigate={()=>onChapterChange(c.id)}
   >
    <ConvertedTitle text={c.title} bookId={bookId} displayTitle={c.displayTitle} skipConvert={skipConvert}/>
    {c.id===chapterId&&<span className="toc-current-label">Đang đọc</span>}
   </NavigationLink>)}
  </div>
  <div className="pager">
   <button disabled={!page} onClick={()=>onPageChange(page-1)}>Trước</button>
   <span>{page+1}</span>
   <button disabled={(page+1)*60>=filtered.length} onClick={()=>onPageChange(page+1)}>Tiếp</button>
  </div>
 </Modal>;
}
