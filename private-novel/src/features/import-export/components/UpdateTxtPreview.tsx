import {useState} from 'react';
import {appendEligibleChapters,type AppendPreview,type AppendMode} from '../services/chapter-append';
import {TxtAppendAnchor} from './TxtAppendAnchor';

const PAGE_SIZE=50;
export default function UpdateTxtPreview({preview,mode,selected,onChange,disabled}:{preview:AppendPreview;mode:AppendMode;selected:string[];onChange:(ids:string[])=>void;disabled:boolean}){
 const [page,setPage]=useState(0),[opened,setOpened]=useState<string>();
 const eligible=appendEligibleChapters(preview),allowedIds=new Set(eligible.map(c=>c.id)),chosen=new Set(selected),pages=Math.ceil(preview.staged.length/PAGE_SIZE);
 const rows=preview.staged.map((chapter,index)=>({chapter,index})).reverse();
 const firstSelected=eligible.find(chapter=>chosen.has(chapter.id));
 const anchorIndex=mode==='full'&&(preview.match==='exact'||preview.match==='title')&&preview.start>0?preview.start-1:-1;
 return <section className="txt-update-preview" aria-label="Chọn chương cập nhật">
  <TxtAppendAnchor preview={preview} mode={mode} firstSelected={firstSelected}/>
  <div className="txt-update-selection-heading">
   <p>{eligible.length} chương có thể thêm · Đã chọn {selected.length} chương. {preview.start>0&&`${preview.start} chương đến mốc đối chiếu không được thêm lại.`}</p>
   <p className="txt-update-help">Cuối file hiện trước. Chương được chọn vẫn thêm theo thứ tự gốc.</p>
   <div className="txt-update-selection-actions">
    <button disabled={disabled||!eligible.length} onClick={()=>onChange(eligible.map(c=>c.id))}>Chọn tất cả chương có thể thêm</button>
    <button disabled={disabled||!selected.length} onClick={()=>onChange([])}>Bỏ chọn tất cả</button>
   </div>
  </div>
  {selected.length<eligible.length&&<p className="txt-update-caution">Bỏ qua chương có thể khiến lần cập nhật bằng file đầy đủ sau không tìm được mốc khớp. Khi đó hãy dùng file chỉ có chương mới.</p>}
  <ol className="txt-update-chapters" reversed start={preview.staged.length-page*PAGE_SIZE}>
   {rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(({chapter:c,index})=>{const allowed=allowedIds.has(c.id),anchor=index===anchorIndex;return <li key={c.id} data-selected={allowed&&chosen.has(c.id)||undefined} data-locked={!allowed||undefined} data-anchor={anchor||undefined}>
    <div className="txt-update-chapter-row">
     <span className="txt-update-position" aria-hidden="true">{index+1}</span>
     <div className="txt-update-chapter-content">
      <label><input type="checkbox" disabled={disabled||!allowed} checked={allowed&&chosen.has(c.id)} onChange={e=>onChange(e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/><span>{c.displayTitle||c.title}{!allowed?(anchor?' — Mốc đối chiếu':index<preview.start?' — Trước mốc đối chiếu':' — Trùng tiêu đề hoặc nội dung'):''}</span></label>
      <small>{c.text.length.toLocaleString('vi-VN')} ký tự{firstSelected?.id===c.id&&<span className="txt-update-first-selected">Bắt đầu thêm</span>}</small>
     </div>
     <button type="button" aria-label={`${opened===c.id?'Đóng nội dung':'Xem nội dung'}: ${c.displayTitle||c.title}`} aria-expanded={opened===c.id} onClick={()=>setOpened(opened===c.id?undefined:c.id)}>{opened===c.id?'Đóng nội dung':'Xem nội dung'}</button>
    </div>
    {opened===c.id&&<pre tabIndex={0}>{c.text}</pre>}
   </li>;})}
  </ol>
  {pages>1&&<nav className="txt-update-pagination" aria-label="Trang chương cập nhật"><button disabled={page===0} onClick={()=>{setPage(page-1);setOpened(undefined);}}>Trang trước</button><span>Trang {page+1} / {pages}</span><button disabled={page===pages-1} onClick={()=>{setPage(page+1);setOpened(undefined);}}>Trang sau</button></nav>}
 </section>;
}
