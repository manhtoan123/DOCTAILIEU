import type {Book} from '../../../core/domain';
import CoverImage from '../../../shared/components/SharedImage';
import {BookActions} from './BookActions';
import {ConvertedTitle} from '../../names-convert/components/ConvertedTitle';
import type {ChapterMatch} from '../services/library-search';

interface LibraryBookCardProps {
  book: Book;
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
}

// Chỉ hiển thị dữ liệu; App quyết định cách mở, sửa và xóa truyện.
export function LibraryBookCard({
  book,
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
}: LibraryBookCardProps) {
  let sourceLabel = 'KHO CHUNG · MỞ ĐỂ ĐỌC';
  if (deletedOnCloud) {
    sourceLabel = 'BẢN THIẾT BỊ · KHO ĐÃ XÓA';
  } else if (isLocal) {
    const format = book.epub ? 'EPUB' : 'TXT';
    sourceLabel = `${format} · ${book.chapterCount} CHƯƠNG / PHẦN`;
  }

  const description = [
    book.author,
    book.chapterCount > 0 ? `${book.chapterCount} chương` : '',
  ].filter(Boolean).join(' · ');

  return (
    <article className="book-card">
      <button
        className={`cover cover-${index % 4}`}
        disabled={opening}
        onClick={onOpenDetails}
        aria-label={`Thông tin ${book.title}`}
      >
        {book.cover ? <CoverImage value={book.cover} title={displayTitle || book.title}/> : (
          <>
            <strong>{displayTitle || book.title}</strong>
            <small>THƯ PHÒNG / {String(index + 1).padStart(2, '0')}</small>
            <span>{sourceLabel}</span>
          </>
        )}
      </button>
      <div className="book-detail">
        <h3>
          <button className="text-button" disabled={opening} onClick={onOpenDetails}>
            <span className="title-primary" title={book.title}>{displayTitle || book.title}</span>
            {displayTitle&&displayTitle.trim()!==book.title.trim()&&<small className="title-original">{book.title}</small>}
          </button>
        </h3>
        {book.album && <p>Album: <ConvertedTitle text={book.album} bookId=""/></p>}
        {(book.author || book.chapterCount > 0) && <p>{description}</p>}
        {chapterMatch&&<p className="chapter-search-match"><button className="text-button" disabled={opening} onClick={()=>onReadChapter?.(chapterMatch.chapterId)}>Chương: {chapterMatch.displayTitle}</button>{chapterMatch.displayTitle!==chapterMatch.title&&<small className="title-original">{chapterMatch.title}</small>}{chapterMatch.count>1&&<small>+{chapterMatch.count-1} chương khác khớp</small>}</p>}
        <div>
          <button className="text-button" disabled={opening} onClick={onRead}>
            Mở sách →
          </button>
          <BookActions id={book.id} title={displayTitle||book.title} editable={isLocal} disabled={opening} onEdit={onEdit} onRemove={onRemove}/>
        </div>
      </div>
    </article>
  );
}
