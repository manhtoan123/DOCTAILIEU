import type {AppendMode,AppendPreview} from '../services/chapter-append';
import type {Chapter} from '../../../core/domain';
import {useState} from 'react';

const title=(chapter:Chapter)=>chapter.displayTitle||chapter.title;
function ChapterTitle({chapter}:{chapter:Chapter}){
 return <><span>{title(chapter)}</span>{chapter.displayTitle&&chapter.displayTitle!==chapter.title&&<small className="txt-update-original-title">{chapter.title}</small>}</>;
}

export function TxtAppendAnchor({preview,mode,firstSelected}:{preview:AppendPreview;mode:AppendMode;firstSelected?:Chapter}){
 const [showContent,setShowContent]=useState(false);
 const saved=preview.before.at(-1);
 const matched=mode==='full'&&(preview.match==='exact'||preview.match==='title')&&preview.start>0?preview.staged[preview.start-1]:undefined;
 const kind=mode==='new-only'?'new-only':matched?preview.match!:'manual';
 const label=kind==='exact'?'Khớp nội dung':kind==='title'?'Chỉ khớp tiêu đề':kind==='new-only'?'File chỉ có chương mới':'Chưa xác định mốc';
 const explanation=kind==='exact'?'Đã khớp tiêu đề và nội dung các chương cuối. Chương mốc chỉ để đối chiếu, không được thêm lại.':kind==='title'?'Mới khớp chuỗi tiêu đề; chưa xác nhận nội dung. Hãy xem đối chiếu và tự chọn chương muốn thêm.':kind==='new-only'?'File không chứa chương cũ để đối chiếu. Chương được chọn sẽ nối sau chương cuối đang lưu.':'Chưa xác định được mốc tương ứng trong file. Kiểm tra nội dung trước khi chọn; không suy mốc nối từ số chương.';
 return <section className="txt-update-anchor" aria-label="Đối chiếu mốc nối">
  <header><h3>Đối chiếu mốc nối</h3><span className="txt-update-match" data-kind={kind}>{label}</span></header>
  <p className="txt-update-help">{explanation}</p>
  <dl className="txt-update-anchor-pair">
   <div><dt>Chương cuối đang lưu</dt><dd>{saved?<><ChapterTitle chapter={saved}/>{preview.book.hiddenChapterIds?.includes(saved.id)&&<small>Đang ẩn khỏi mục lục</small>}</>:'Không có chương đang lưu'}</dd></div>
   <div><dt>Tương ứng trong file mới</dt><dd>{matched?<><ChapterTitle chapter={matched}/><small>Mục {preview.start.toLocaleString('vi-VN')} trong file · Không thêm lại</small></>:<span className="txt-update-help">{mode==='new-only'?'Không có trong file chỉ chứa chương mới':'Chưa xác định được'}</span>}</dd></div>
   <div className="txt-update-anchor-next"><dt>Bắt đầu thêm từ</dt><dd aria-live="polite">{firstSelected?<ChapterTitle chapter={firstSelected}/>:<span className="txt-update-help">Chưa chọn chương để thêm</span>}</dd></div>
  </dl>
  {saved&&<details className="txt-update-anchor-content" onToggle={event=>setShowContent(event.currentTarget.open)}>
   <summary>Xem nội dung chương mốc</summary>
   {showContent&&<div className="txt-update-anchor-texts">
    <section aria-label="Nội dung mốc đang lưu"><h4>Đang lưu</h4><pre tabIndex={0}>{saved.text}</pre></section>
    {matched&&<section aria-label="Nội dung mốc trong file mới"><h4>Trong file mới</h4><pre tabIndex={0}>{matched.text}</pre></section>}
   </div>}
  </details>}
 </section>;
}
