import {useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../../../core/db';
import {saveBookNames} from '../services/book-names';
import type {Book,NameEntry} from '../../../core/domain';
import {errorText} from '../../../shared/components/common';
const nameText=(rows:NameEntry[])=>[...rows].sort((a,b)=>a.key.localeCompare(b.key)).map(row=>`${row.key}=${row.value}`).join('\n');

export default function BookNamesSettings({books,bookId,onSelect}:{books?:Book[];bookId?:string;onSelect:(id:string)=>void}){
 const activeId=bookId??books?.[0]?.id??'',book=books?.find(row=>row.id===activeId);
 const loaded=useLiveQuery(async()=>({bookId:activeId,rows:activeId?await db.names.where('bookId').equals(activeId).toArray():[]}),[activeId]);
 const rows=loaded?.bookId===activeId?loaded.rows:undefined;
 const [drafts,setDrafts]=useState<Record<string,string>>({}),[saving,setSaving]=useState(false),[notice,setNotice]=useState<{bookId:string;error?:string;message?:string}>();
 const busy=useRef(false),hasDraft=Object.prototype.hasOwnProperty.call(drafts,activeId),text=hasDraft?drafts[activeId]:rows?nameText(rows):'';
 async function save(){
  if(busy.current||!book||!rows)return;const target=activeId,input=text;busy.current=true;setSaving(true);setNotice(undefined);
  try{await saveBookNames(target,input);setDrafts(old=>{const next={...old};delete next[target];return next;});setNotice({bookId:target,message:'Đã lưu Name riêng.'});}
  catch(error){setNotice({bookId:target,error:errorText(error)});}
  finally{busy.current=false;setSaving(false);}
 }
 return <section className="book-names-settings" aria-label="Name riêng">
  <h2>Name riêng</h2>
  {books===undefined?<p role="status">Đang tải truyện…</p>:!books.length?<p>Chưa có truyện trên thiết bị. Mở hoặc nhập truyện để sửa Name riêng.</p>:<>
   <label>Truyện<select aria-label="Truyện dùng Name riêng" value={activeId} disabled={saving} onChange={event=>onSelect(event.target.value)}>{!book&&<option value={activeId}>Truyện không còn trên thiết bị</option>}{books.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}</select></label>
   {book?<>
    <label>Name riêng<textarea aria-label="Name riêng của truyện" rows={12} maxLength={2*1048576} disabled={saving||rows===undefined} value={text} placeholder="张三=Trương Tam" onChange={event=>{const value=event.target.value;setDrafts(old=>({...old,[activeId]:value}));setNotice(undefined);}}/></label>
    <p className="muted">Mỗi dòng: chữ gốc=tên Việt. Lưu thêm hoặc cập nhật Name của truyện này.</p>
    <p className="muted">Name kèm ảnh: <code>$可可多拉=[i]URL ảnh[/]Aron</code>. Hỗ trợ ảnh PNG, JPG, WebP từ archives.bulbagarden.net; dùng trong Convert và Dịch AI.</p>
    {rows===undefined&&<p role="status">Đang tải Name…</p>}
    {notice?.bookId===activeId&&notice.error&&<p role="alert">{notice.error}</p>}
    {notice?.bookId===activeId&&notice.message&&<p role="status">{notice.message}</p>}
    <button className="primary" disabled={saving||rows===undefined} onClick={()=>void save()}>{saving?'Đang lưu…':'Lưu'}</button>
   </>:<p>Chọn một truyện trên thiết bị để sửa Name riêng.</p>}
  </>}
 </section>;
}
