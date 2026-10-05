import {useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db,deleteBook,commitImport} from '../db';
import {importFiles,type ImportStatus} from '../importer';
import {cleanTitle} from '../domain';
import {Modal,errorText} from './common';
export default function ImportDialog({onClose,onDone}:{onClose:()=>void;onDone:(id:string)=>void}){
  const [files,setFiles]=useState<File[]>([]);const [title,setTitle]=useState('');const [paste,setPaste]=useState('');const [encoding,setEncoding]=useState('utf-8');const [pattern,setPattern]=useState('');const [detect,setDetect]=useState(true);
  const [status,setStatus]=useState<ImportStatus>();const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [staged,setStaged]=useState('');const [duplicates,setDuplicates]=useState<string[]>([]);const [page,setPage]=useState(0);const abort=useRef<AbortController|undefined>(undefined);
  const book=useLiveQuery(()=>staged?db.books.get(staged):undefined,[staged]);
  const chapters=useLiveQuery(()=>staged?db.chapters.where('[bookId+order]').between([staged,-1],[staged,Infinity]).offset(page*20).limit(20).toArray():[],[staged,page]);
  function choose(input:File[]){const txt=input.filter(f=>/\.txt$/i.test(f.name));if(txt.length>1){setFiles([]);setError('Chỉ chọn một file TXT mỗi lần; mỗi file là một truyện.');return;}const file=txt[0];setFiles(file?[file]:[]);if(file&&!title)setTitle(cleanTitle(file.name));setError(file?'':'Chọn một file .txt. Mỗi file là một truyện.');}
  async function run(){setError('');setBusy(true);abort.current=new AbortController();try{const selected=files.length?files:[new File([paste],`${title||'Truyện mới'}.txt`,{type:'text/plain'})];const result=await importFiles(selected,title,files.length?encoding:'utf-8',pattern,detect,setStatus,abort.current.signal);setStaged(result.id);setDuplicates(result.duplicates);}catch(e){setError(errorText(e));}finally{setBusy(false);}}
  async function close(){if(busy){abort.current?.abort();return;}if(staged)await deleteBook(staged);onClose();}
  async function merge(index:number){try{const all=await db.chapters.where('bookId').equals(staged).sortBy('order');const pos=all.findIndex(c=>c.order===index);const a=all[pos],b=all[pos+1];if(!a||!b)return;if(a.text.length+b.text.length>128000)throw new Error('Hai phần quá dài để gộp (tối đa 128.000 ký tự).');await db.transaction('rw',[db.chapters,db.books],async()=>{await db.chapters.update(a.id,{text:a.text+b.text,revision:a.revision+1});await db.chapters.delete(b.id);await db.books.update(staged,{chapterCount:all.length-1});});}catch(e){setError(errorText(e));}}
  return <Modal title={staged?'Xem trước bản nhập':'Thêm truyện vào thư phòng'} onClose={()=>void close()} wide>
    <p className="muted">Nội dung chỉ lưu trong trình duyệt này. File gốc trên máy được giữ nguyên.</p>
    {error&&<p className="notice error" role="alert">{error}</p>}
    {!staged?<><label>Tên truyện<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={300} placeholder="Đặt tên cho cuốn sách mới" disabled={busy}/></label>
      <div className="dropzone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)choose([...e.dataTransfer.files]);}}><strong>Kéo thả một TXT vào đây</strong><span>Mỗi file TXT là một truyện; các tiêu đề bên trong sẽ thành mục lục chương</span><input aria-label="Chọn file TXT" type="file" accept=".txt" disabled={busy} onChange={e=>choose(Array.from(e.target.files||[]))}/>{files.length>0&&<small>1 file đã chọn · {(files[0].size/1048576).toFixed(1)} MB <button onClick={()=>setFiles([])}>Bỏ chọn</button></small>}</div>
      {!files.length&&<label>Hoặc dán nội dung<textarea value={paste} onChange={e=>setPaste(e.target.value)} rows={5} placeholder="Chương 1…" disabled={busy}/></label>}
      <div className="form-grid"><label>Encoding<select value={encoding} onChange={e=>setEncoding(e.target.value)} disabled={busy}><option value="utf-8">UTF-8 (thường dùng)</option><option value="gb18030">GB18030 / GBK (tiếng Trung)</option><option value="utf-16le">UTF-16 LE</option></select></label><label>Cách nhập<select value={String(detect)} onChange={e=>setDetect(e.target.value==='true')} disabled={busy}><option value="true">Tự nhận diện tiêu đề chương</option><option value="false">Mỗi file là một chương</option></select></label></div>
      <details><summary>Regex nhận diện tùy chỉnh</summary><input value={pattern} onChange={e=>setPattern(e.target.value)} disabled={busy} placeholder="Ví dụ: ^第[0-9一二三十百]+章"/><p className="muted">Áp dụng từng dòng. Để trống dùng bộ nhận diện mặc định; tác vụ treo sẽ bị dừng.</p></details>
      {busy&&<div className="progress"><progress max={100} value={status?.percent||0}/><span>{status?.message||'Đang chuẩn bị…'}</span></div>}
      <footer><button onClick={()=>void close()}>{busy?'Hủy xử lý':'Đóng'}</button><button className="primary" disabled={busy||(!files.length&&!paste.trim())} onClick={()=>void run()}>{busy?'Đang xử lý…':'Tách chương & xem trước →'}</button></footer></>:<>
      <div className="notice">{book?.chapterCount} chương/phần · {book?.charCount.toLocaleString('vi-VN')} ký tự. Đổi tiêu đề hoặc gộp phần bên dưới; chưa lưu vào thư viện chính.</div>
      {duplicates.length>0&&<p className="notice">Bỏ qua {duplicates.length} file trùng SHA-256 với file đã nhập.</p>}
      <div className="preview-list">{chapters?.map(c=><article key={c.id}><input aria-label={`Tiêu đề ${c.order+1}`} value={c.title} onChange={e=>void db.chapters.update(c.id,{title:e.target.value})}/><small>{c.text.length.toLocaleString()} ký tự</small><p>{c.text.slice(0,180)}</p><button onClick={()=>void merge(c.order)}>Gộp với phần kế</button></article>)}</div>
      <div className="pager"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>← Trước</button><span>Trang {page+1}</span><button disabled={(page+1)*20>=(book?.chapterCount||0)} onClick={()=>setPage(p=>p+1)}>Tiếp →</button></div>
      <footer><button onClick={()=>void close()}>Hủy bản nhập</button><button className="primary" onClick={async()=>{try{await commitImport(staged);onDone(staged);}catch(e){setError(errorText(e));}}}>Xác nhận vào thư viện</button></footer>
    </>}
  </Modal>;
}
