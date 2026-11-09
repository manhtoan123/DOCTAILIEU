import {NavigationLink} from '../../../shared/components/NavigationLink';
import {readerRoutePath} from '../../reader/services/reader-route';
import type {Book} from '../../../core/domain';
import CoverImage from '../../../shared/components/SharedImage';
import {BookActions} from './BookActions';
import {ConvertedTitle} from '../../names-convert/components/ConvertedTitle';
import type {ChapterMatch} from '../services/library-search';

interface LibraryBookCardProps {
  book: Book;
  compact?: boolean;
  index: number;
  displayTitle: string;
  isLocal: boolean;
  deletedOnCloud: boolean;
  opening: boolean;
  onOpenDetails: () => void;
  onRead: () => void;
  onEdit: () => void;
  onRemove: () => void;
  chapterMatch?: ChapterMatch;
  onReadChapter?: (chapterId: string) => void;
  selected?:boolean;
  onToggle?:()=>void;
  hideActions?:boolean;
}

// Chỉ hiển thị dữ liệu; App quyết định cách mở, sửa và xóa truyện.
export function LibraryBookCard({
  book,
  compact=false,
  index,
  displayTitle,
  isLocal,
  deletedOnCloud,
  opening,
  onOpenDetails,
  onRead,
  onEdit,
  onRemove,
  chapterMatch,
  onReadChapter,
  selected=false,
  onToggle,
  hideActions=false,
}: LibraryBookCardProps) {
  const checkbox=onToggle&&<label className="library-select"><input type="checkbox" aria-label={`Chọn truyện ${displayTitle||book.title}`} checked={selected} disabled={opening} onChange={onToggle}/></label>;
  if(compact)return <article className={`book-card compact-book-row ${selected?'library-item-selected':''}`}>
    {checkbox}
    <h3><NavigationLink className="text-button" disabled={opening} href={readerRoutePath({kind:'book',bookId:book.id})} onNavigate={onOpenDetails} title={book.title}>{displayTitle||book.title}</NavigationLink></h3>
    <span className="compact-chapter-count">{book.chapterCount} chương</span>
    {chapterMatch&&<div className="chapter-search-match"><NavigationLink className="text-button" disabled={opening} href={readerRoutePath({kind:'read',bookId:book.id,chapterId:chapterMatch.chapterId})} onNavigate={()=>onReadChapter?.(chapterMatch.chapterId)}>Chương: {chapterMatch.displayTitle}</NavigationLink></div>}
  </article>;

  const description = [
    book.author,
    book.chapterCount > 0 ? `${book.chapterCount} chương` : '',
    deletedOnCloud ? 'Kho đã xóa' : !isLocal ? 'Kho chung' : '',
  ].filter(Boolean).join(' · ');

  return (
    <article className={`book-card ${onToggle?'selectable-book':''} ${selected?'library-item-selected':''}`}>
      {checkbox}
      <NavigationLink
        className={`cover cover-${index % 4}`}
        disabled={opening}
        href={readerRoutePath({kind:'book',bookId:book.id})} onNavigate={onOpenDetails}
        aria-label={`Thông tin ${book.title}`}
      >
        {book.cover ? <CoverImage value={book.cover} title={displayTitle || book.title}/> : <strong>{displayTitle || book.title}</strong>}
      </NavigationLink>
      <div className="book-detail">
        <h3>
          <NavigationLink className="text-button" disabled={opening} href={readerRoutePath({kind:'book',bookId:book.id})} onNavigate={onOpenDetails}>
            <span className="title-primary" title={book.title}>{displayTitle || book.title}</span>
            {displayTitle&&displayTitle.trim()!==book.title.trim()&&<small className="title-original">{book.title}</small>}
          </NavigationLink>
        </h3>
        {book.album && <p className="book-album"><ConvertedTitle text={book.album} bookId=""/></p>}
        {description && <p className="book-description">{description}</p>}
        {chapterMatch&&<p className="chapter-search-match"><NavigationLink className="text-button" disabled={opening} href={readerRoutePath({kind:'read',bookId:book.id,chapterId:chapterMatch.chapterId})} onNavigate={()=>onReadChapter?.(chapterMatch.chapterId)}>Chương: {chapterMatch.displayTitle}</NavigationLink>{chapterMatch.displayTitle!==chapterMatch.title&&<small className="title-original">{chapterMatch.title}</small>}{chapterMatch.count>1&&<small>+{chapterMatch.count-1} chương khác khớp</small>}</p>}
        <div className="book-card-actions">
          <NavigationLink className="text-button" disabled={opening} href={readerRoutePath({kind:'read',bookId:book.id})} onNavigate={onRead}>
            Mở sách →
          </NavigationLink>
          {!onToggle&&!hideActions&&<BookActions id={book.id} title={displayTitle||book.title} editable={isLocal} disabled={opening} onEdit={onEdit} onRemove={onRemove}/>}
        </div>
      </div>
    </article>
  );
}
