import {ChapterEditor} from './ChapterEditor';
import {changeChapterVisibility} from '../../sync-cloud/services/shared-state-sync';
import {ConvertedTitle} from '../../names-convert/components/ConvertedTitle';
import {OriginalFiles} from '../../sync-cloud/components/OriginalFiles';
import {UpdateTxt} from '../../import-export/components/UpdateTxt';
import { useEffect, useRef, useState } from 'react';
import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import type { Chapter } from '../../../core/domain';
import { hasChinese } from '../services/title-resolver';
import { prepareBookTitles } from '../../names-convert/services/title-converter';
import '../styles/story-detail.css';

type ChapterMetadata = Pick<Chapter, 'id' | 'title' | 'order' | 'displayTitle'>;
const PAGE_SIZE = 60;
const number = new Intl.NumberFormat('vi-VN');
const date = (value: number) => new Date(value).toLocaleDateString('vi-VN');

export function StoryDetail({ bookId, onBack, onRead }: {
  bookId: string;
  onBack: () => void;
  onRead: (chapterId?: string) => void;
}) {
  const [manage,setManage]=useState(false),[trash,setTrash]=useState(false),[selected,setSelected]=useState<string[]>([]),[editing,setEditing]=useState<Chapter>(),[confirmDelete,setConfirmDelete]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const autoPreparedRef = useRef<string>('');
  useEffect(() => { setSearch(''); setPage(0);setManage(false);setTrash(false);setSelected([]);setEditing(undefined);setConfirmDelete(false);setMessage(''); autoPreparedRef.current = ''; }, [bookId]);
  const snapshot = useLiveQuery(async () => {
    try {
      return await db.transaction('r', [db.books, db.progress, db.chapters], async () => {
        const book = await db.books.get(bookId);
        const progress = await db.progress.get(bookId);
        const chapters: ChapterMetadata[] = [];
        if (book?.status === 'ready') {
          // IndexedDB has no field projection. Retain metadata only, never chapter text.
          await db.chapters.where('[bookId+order]')
            .between([bookId, Dexie.minKey], [bookId, Dexie.maxKey])
            .each(({ id, title, order, displayTitle }) => { chapters.push({ id, title, order, displayTitle }); });
        }
        return { bookId, book, progress, chapters, error: false };
      });
    } catch {
      return { bookId, book: undefined, progress: undefined, chapters: [], error: true };
    }
  }, [bookId]);

  const { book, progress, chapters:allChapters } = snapshot || { bookId, book: undefined, progress: undefined, chapters: [], error: false };

  const chapters=allChapters.filter(c=>!book?.hiddenChapterIds?.includes(c.id));
  const deleted=allChapters.filter(c=>book?.hiddenChapterIds?.includes(c.id));
  async function applySelection(){setBusy(true);setMessage('');try{await changeChapterVisibility(bookId,selected,!trash);setSelected([]);setConfirmDelete(false);setMessage(trash?'Đã khôi phục chương.':'Đã xóa. Có thể khôi phục trong mục Đã xóa.');}catch(e){setMessage(e instanceof Error?e.message:'Không cập nhật được chương.');}finally{setBusy(false);}}

  // Chuẩn tên Việt là mặc định và tự động: tự động chuẩn bị tên Việt trong nền cho truyện cũ khi cần
  useEffect(() => {
    if (!book || book.status !== 'ready') return;
    const needsPrep = (!book.displayTitle && hasChinese(book.title)) || chapters.some(c => !c.displayTitle && hasChinese(c.title));
    if (needsPrep && autoPreparedRef.current !== bookId) {
      autoPreparedRef.current = bookId;
      void prepareBookTitles(bookId).catch(() => {});
    }
  }, [bookId, book, chapters]);

  const back = <button className="story-back" disabled={!!editing||busy} onClick={onBack}>← Tủ sách</button>;
  if (!snapshot || snapshot.bookId !== bookId) {
    return <section className="story-detail" aria-label="Thông tin truyện">{back}<p role="status">Đang tải thông tin truyện…</p></section>;
  }
  if (snapshot.error) {
    return <section className="story-detail" aria-label="Thông tin truyện">{back}<h1>Không thể tải thông tin truyện</h1><p role="alert">Không đọc được dữ liệu trên thiết bị. Hãy trở về tủ sách và thử lại.</p></section>;
  }
  if (!book || book.status !== 'ready') {
    return <section className="story-detail" aria-label="Thông tin truyện">{back}<h1>Truyện không khả dụng</h1><p>Truyện có thể đã bị xóa hoặc chưa nhập xong. Hãy trở về tủ sách.</p></section>;
  }
  const current = chapters.find(chapter => chapter.id === progress?.chapterId);
  const query = search.trim().toLocaleLowerCase('vi-VN');
  const list=manage&&trash?deleted:chapters;
  const filtered = query ? list.filter(chapter =>
    chapter.title.toLocaleLowerCase('vi-VN').includes(query)
    || (chapter.displayTitle && chapter.displayTitle.toLocaleLowerCase('vi-VN').includes(query))
    || String(chapter.order + 1).includes(query)) : list;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE);

  return <section className="story-detail" aria-label="Thông tin truyện">
    {back}
    <header className="story-summary">
      <div className="story-cover-mark" aria-hidden="true">TXT</div>
      <div className="story-summary-content">
        <h1><ConvertedTitle text={book.title} bookId={bookId} displayTitle={book.displayTitle}/></h1>
        <p className="story-author">Tác giả: {book.author.trim() || 'Chưa có thông tin'}</p>
        <dl className="story-metadata">
          <div><dt>Số chương</dt><dd>{number.format(chapters.length)}</dd></div>
          <div><dt>Số ký tự</dt><dd>{number.format(book.charCount)}</dd></div>
          <div><dt>Ngày nhập</dt><dd>{date(book.createdAt)}</dd></div>
          <div><dt>Cập nhật</dt><dd>{date(book.updatedAt)}</dd></div>
        </dl>
        <div className="story-read-actions">
          <button className="story-read-first" disabled={!chapters.length||!!editing||busy} onClick={() => onRead(chapters[0].id)}>Đọc từ đầu</button>
          <button disabled={!chapters.length||!!editing||busy} onClick={() => onRead()}>Đọc tiếp</button>
        </div>
        <p className="story-progress">
          {current ? <>Đang đọc: <ConvertedTitle text={current.title} bookId={bookId} displayTitle={current.displayTitle}/></> : progress
            ? 'Chương đã lưu không còn khả dụng. Đọc tiếp sẽ mở chương đầu tiên.'
            : 'Chưa có tiến độ đọc. Đọc tiếp sẽ mở chương đầu tiên.'}
        </p>
      </div>
    </header>
    <OriginalFiles key={bookId} bookId={bookId}/>
    {!book.epub&&<UpdateTxt key={'update:'+bookId} bookId={bookId}/>}
    <section className="story-chapters" aria-labelledby="story-chapters-title">
      <div className="story-chapters-heading">
        <h2 id="story-chapters-title">Danh sách chương</h2>
        {!book.epub&&<button aria-pressed={manage} disabled={busy||!!editing} onClick={()=>{setManage(!manage);setTrash(false);setSelected([]);setEditing(undefined);setConfirmDelete(false);setPage(0);setMessage('');}}>{manage?'Xong':'Quản lý chương'}</button>}
        <label htmlFor="story-chapter-search">Tìm chương
          <input id="story-chapter-search" type="search" placeholder="Tên hoặc số chương" value={search}
            onChange={event => { setSearch(event.target.value); setPage(0); }} />
        </label>
      </div>
      {manage&&<div className="chapter-manage-actions">
        <button aria-pressed={!trash} disabled={busy||!!editing} onClick={()=>{setTrash(false);setSelected([]);setPage(0);setConfirmDelete(false);}}>Đang dùng</button>
        <button aria-pressed={trash} disabled={busy||!!editing} onClick={()=>{setTrash(true);setSelected([]);setPage(0);setConfirmDelete(false);}}>Đã xóa ({deleted.length})</button>
        <span>{selected.length} đã chọn</span>
        <button disabled={busy||!!editing||!selected.length} onClick={()=>trash?void applySelection():setConfirmDelete(true)}>{trash?'Khôi phục':'Xóa đã chọn'}</button>
      </div>}
      {manage&&confirmDelete&&<section className="panel" aria-label="Xác nhận xóa chương"><p>Xóa {selected.length} chương đã chọn khỏi danh sách đọc? Bạn có thể khôi phục trong Đã xóa.</p><ul className="chapter-delete-preview">{allChapters.filter(c=>selected.includes(c.id)).map(c=><li key={c.id}>{c.displayTitle||c.title}{c.id===current?.id?' · Đang đọc':''}</li>)}</ul><div className="chapter-manage-actions"><button disabled={busy} onClick={()=>void applySelection()}>{busy?'Đang xóa…':'Xác nhận xóa'}</button><button disabled={busy} onClick={()=>setConfirmDelete(false)}>Hủy</button></div></section>}
      {message&&<p role="status">{message}</p>}
      {manage&&editing&&<ChapterEditor key={editing.id} chapter={editing} onClose={()=>setEditing(undefined)}/>}
      {!list.length ? <p className="story-empty" role="status">{trash?'Chưa có chương đã xóa.':'Truyện chưa có chương để đọc.'}</p>
        : !filtered.length ? <p className="story-empty" role="status">Không tìm thấy chương phù hợp.</p>
        : <>
          <p className="story-chapter-count" role="status">{number.format(filtered.length)} chương{query ? ' phù hợp' : ''} · {number.format(activePage * PAGE_SIZE + 1)}–{number.format(Math.min((activePage + 1) * PAGE_SIZE, filtered.length))}</p>
          <ol className="story-chapter-list" start={activePage * PAGE_SIZE + 1}>
            {visible.map(chapter => <li key={chapter.id} className={manage?'chapter-manage-row':undefined}>
              {manage&&<input type="checkbox" aria-label={'Chọn '+chapter.title} checked={selected.includes(chapter.id)} disabled={busy||confirmDelete||!!editing} onChange={e=>setSelected(old=>e.target.checked?[...old,chapter.id]:old.filter(id=>id!==chapter.id))}/>}
              {manage&&!trash&&<button className="chapter-edit-button" disabled={busy||confirmDelete||!!editing} onClick={async()=>{try{const row=await db.chapters.get(chapter.id);if(row)setEditing(row);}catch(e){setMessage(String(e));}}}>Sửa</button>}
              <button disabled={trash||!!editing||busy} onClick={() => onRead(chapter.id)} aria-label={chapter.title} aria-current={chapter.id === current?.id ? 'true' : undefined}>
                <ConvertedTitle text={chapter.title} bookId={bookId} displayTitle={chapter.displayTitle}/>
                {chapter.id === current?.id && <small>Đang đọc</small>}
              </button>
            </li>)}
          </ol>
          {pageCount > 1 && <nav className="story-pagination" aria-label="Trang danh sách chương">
            <button aria-label="Trang mục lục trước" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Trang trước</button>
            <span>Trang {activePage + 1} / {pageCount}</span>
            <button aria-label="Trang mục lục sau" disabled={activePage === pageCount - 1} onClick={() => setPage(activePage + 1)}>Trang sau</button>
          </nav>}
        </>}
    </section>
  </section>;
}
