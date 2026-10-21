import {useState} from 'react';
import {appendEligibleChapters,type AppendPreview} from '../services/chapter-append';

const PAGE_SIZE=50;
export default function UpdateTxtPreview({preview,selected,onChange,disabled}:{preview:AppendPreview;selected:string[];onChange:(ids:string[])=>void;disabled:boolean}){
 const [page,setPage]=useState(0),[opened,setOpened]=useState<string>();
 const eligible=appendEligibleChapters(preview),allowedIds=new Set(eligible.map(c=>c.id)),chosen=new Set(selected),pages=Math.ceil(preview.staged.length/PAGE_SIZE);
 const rows=preview.staged.map((chapter,index)=>({chapter,index})).reverse();
 return <section aria-label="Chọn chương cập nhật">
  <p>{eligible.length} chương có thể thêm · Đã chọn {selected.length} chương. {preview.start>0&&`${preview.start} chương trước mốc đối chiếu không được thêm lại.`}</p>
  <p className="muted">Hiển thị từ cuối file lên đầu để kiểm tra chương mới trước. Chỉ chương được tích mới được thêm, theo thứ tự gốc trong file.</p>
  {selected.length<eligible.length&&<p className="notice">Bỏ qua chương có thể khiến lần cập nhật bằng file đầy đủ sau không tìm được mốc khớp. Khi đó hãy dùng file chỉ có chương mới.</p>}
  <button disabled={disabled||!eligible.length} onClick={()=>onChange(eligible.map(c=>c.id))}>Chọn tất cả chương có thể thêm</button>
  <button disabled={disabled||!selected.length} onClick={()=>onChange([])}>Bỏ chọn tất cả</button>
  <ol reversed start={preview.staged.length-page*PAGE_SIZE}>
   {rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(({chapter:c,index})=>{const allowed=allowedIds.has(c.id);return <li key={c.id}>
    <label style={{flexDirection:'row',alignItems:'center',fontSize:'inherit'}}><input type="checkbox" style={{width:18,height:18,padding:0,flexShrink:0}} disabled={disabled||!allowed} checked={allowed&&chosen.has(c.id)} onChange={e=>onChange(e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/><span style={{overflowWrap:'anywhere'}}>{c.displayTitle||c.title}{!allowed?(index<preview.start?' — Trước mốc đối chiếu':' — Trùng tiêu đề hoặc nội dung'):''}</span></label>
    <small>{c.text.length.toLocaleString('vi-VN')} ký tự</small>{' '}
    <button type="button" aria-label={`${opened===c.id?'Đóng nội dung':'Xem nội dung'}: ${c.displayTitle||c.title}`} aria-expanded={opened===c.id} onClick={()=>setOpened(opened===c.id?undefined:c.id)}>{opened===c.id?'Đóng nội dung':'Xem nội dung'}</button>
    {opened===c.id&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:'24rem',overflow:'auto'}}>{c.text}</pre>}
   </li>;})}
  </ol>
  {pages>1&&<nav aria-label="Trang chương cập nhật"><button disabled={page===0} onClick={()=>{setPage(page-1);setOpened(undefined);}}>Trang trước</button><span> Trang {page+1}/{pages} </span><button disabled={page===pages-1} onClick={()=>{setPage(page+1);setOpened(undefined);}}>Trang sau</button></nav>}
 </section>;
}
