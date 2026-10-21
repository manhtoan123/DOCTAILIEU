import {useEffect,useRef,useState} from 'react';
import {prepareTxtAppend,commitTxtAppend,discardAppendPreview,appendEligibleChapters,type AppendPreview,type AppendMode} from '../services/chapter-append';
import {db} from '../../../core/db';
import {ChapterLimit,validChapterLimit} from './ChapterSplitPreview';
import UpdateTxtPreview from './UpdateTxtPreview';
export function UpdateTxt({bookId}:{bookId:string}){
 const [file,setFile]=useState<File>(),[encoding,setEncoding]=useState('utf-8'),[maxChars,setMaxChars]=useState(0),[pattern,setPattern]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[preview,setPreview]=useState<AppendPreview>();
 const [selected,setSelected]=useState<string[]>([]);
 const fileInput=useRef<HTMLInputElement>(null);
 const [mode,setMode]=useState<AppendMode>('full');
 const controller=useRef<AbortController|undefined>(undefined),current=useRef<AppendPreview|undefined>(undefined),alive=useRef(true);
 useEffect(()=>{alive.current=true;void db.sources.where('bookId').equals(bookId).first().then(s=>{if(alive.current&&s&&['utf-8','gb18030','utf-16le'].includes(s.encoding))setEncoding(s.encoding);});return()=>{alive.current=false;controller.current?.abort();if(current.current)void discardAppendPreview(current.current);};},[bookId]);
 const clear=async()=>{const previous=current.current;current.current=undefined;if(alive.current)setPreview(undefined);if(previous)await discardAppendPreview(previous);};
 const prepare=async()=>{
  if(!file||busy)return;if(!validChapterLimit(maxChars)){setMessage('Giới hạn phải là số nguyên từ 100 đến 128.000 ký tự hoặc chọn giữ nguyên chương.');return;}const stop=new AbortController();controller.current=stop;setBusy(true);setMessage('Đang đọc và đối chiếu chương…');
  try{await clear();const result=await prepareTxtAppend(bookId,file,encoding,maxChars,pattern,s=>{if(alive.current&&!stop.signal.aborted)setMessage(s.message);},stop.signal,mode);if(!alive.current||stop.signal.aborted){await discardAppendPreview(result);return;}current.current=result;setPreview(result);setSelected(result.match==='exact'?appendEligibleChapters(result).map(c=>c.id):[]);setMessage(result.match==='title'?'Tìm thấy mốc theo tiêu đề nhưng nội dung khác. Hãy xem và tích chọn chương muốn thêm; chưa tích sẵn chương nào.':result.match==='manual'?'Chưa xác định được mốc duy nhất. Danh sách hiển thị từ cuối file; hãy xem và tự tích chọn chương mới. Chương nhận diện trùng đã được khóa.':mode==='full'?'Đã đối chiếu mốc cuối. Chỉ các chương mới dưới đây sẽ được thêm.':'File chỉ có chương mới: kiểm tra tiêu đề và thứ tự dưới đây trước khi thêm vào cuối truyện.');}
  catch(error){if(alive.current)setMessage(stop.signal.aborted?'Đã hủy; truyện được giữ nguyên.':error instanceof Error?error.message:'Không thể kiểm tra file.');}
  finally{if(alive.current)setBusy(false);}
 };
 const commit=async()=>{const candidate=current.current;if(!candidate||busy||!selected.length)return;const stop=new AbortController();controller.current=stop;setBusy(true);
  try{const count=await commitTxtAppend(candidate,stop.signal,selected);current.current=undefined;if(alive.current){setPreview(undefined);setSelected([]);setFile(undefined);if(fileInput.current)fileInput.current.value='';setMessage(`Đã thêm ${count.toLocaleString('vi-VN')} chương mới. Tiến độ đọc và bản dịch cũ được giữ.`);}}
  catch(error){if(alive.current)setMessage(stop.signal.aborted?'Đã hủy; truyện được giữ nguyên.':error instanceof Error?error.message:'Chưa cập nhật được chương.');}
  finally{if(alive.current)setBusy(false);}
 };
 const eligible=preview?appendEligibleChapters(preview):[];
 return <details className="panel"><summary>Cập nhật chương từ file TXT</summary><label>Loại file cập nhật<select value={mode} disabled={busy||!!preview} onChange={e=>{setMode(e.target.value as AppendMode);setMessage('');}}><option value="full">File TXT đầy đủ</option><option value="new-only">File chỉ có chương mới</option></select></label><p>{mode==='full'?'Chọn file có cả phần đầu và chương mới. Ưu tiên đối chiếu từ cuối file; nếu nội dung khác sẽ gợi ý theo tiêu đề hoặc cho tự tích chọn chương.':'Chọn file chỉ chứa chương muốn thêm, theo đúng thứ tự. Các chương được tích sẽ được nối vào cuối truyện; hãy kiểm tra bản xem trước vì không có chương cũ để đối chiếu mốc.'}</p>
  <label>{mode==='full'?'File TXT đầy đủ':'File chỉ có chương mới'}<input ref={fileInput} type="file" accept=".txt,text/plain" disabled={busy||!!preview} onChange={e=>{setFile(e.target.files?.[0]);setMessage('');}}/></label>
  <details><summary>Cách đọc file</summary><p>Tự nhận diện tiêu đề bằng cùng bộ chia chương với Nhập truyện. Mặc định giữ nguyên chương; có thể đổi giới hạn hoặc Regex rồi kiểm tra lại.</p><label>Encoding cập nhật<select value={encoding} disabled={busy||!!preview} onChange={e=>setEncoding(e.target.value)}><option value="utf-8">UTF-8</option><option value="gb18030">GB18030 / GBK</option><option value="utf-16le">UTF-16 LE</option></select></label><ChapterLimit value={maxChars} onChange={setMaxChars} disabled={busy||!!preview}/><label>Regex nhận diện chương cập nhật<input value={pattern} disabled={busy||!!preview} onChange={e=>setPattern(e.target.value)}/></label></details>
  {message&&<p role="status">{message}</p>}
  {preview?<><p>{eligible.length} {preview.match==='manual'||preview.match==='title'?'chương cần kiểm tra':'chương mới'}{!!eligible.length&&` · từ “${eligible[0].title}” đến “${eligible.at(-1)!.title}”`}.</p><UpdateTxtPreview key={preview.stageId} preview={preview} selected={selected} onChange={setSelected} disabled={busy}/><button disabled={busy||!selected.length} onClick={()=>void commit()}>Thêm các chương mới</button><button disabled={busy} onClick={()=>{void clear();setMessage('Đã bỏ bản xem trước; truyện được giữ nguyên.');}}>Bỏ bản xem trước</button></>:<button disabled={!file||busy} onClick={()=>void prepare()}>Kiểm tra chương mới</button>}
  {busy&&<button onClick={()=>controller.current?.abort()}>Hủy cập nhật</button>}
 </details>;
}






