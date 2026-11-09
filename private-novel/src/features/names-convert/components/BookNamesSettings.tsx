import {useRef,useState,type SetStateAction} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import type {Book} from '../../../core/domain';
import NameManager from './NameManager';
import {readNameScope,saveScopedBookNames,deleteScopedBookName} from '../services/scoped-names';
import {nameAlbumRoot} from '../services/album-name-schema';
import {formatNameList,removeNameDraftKey} from '../services/name-format';

export default function BookNamesSettings({books,bookId,onSelect}:{books?:Book[];bookId?:string;onSelect:(id:string)=>void}){
 const groups=new Map<string,{id:string;label:string;count:number}>();
 for(const book of books??[]){const album=nameAlbumRoot(book.album),key=album?'album:'+album:'book:'+book.id,group=groups.get(key);if(group)group.count++;else groups.set(key,{id:book.id,label:album??book.displayTitle??book.title,count:1});}
 const activeId=bookId??books?.[0]?.id??'',book=books?.find(b=>b.id===activeId),album=nameAlbumRoot(book?.album),scopeKey=album?'album:'+album:'book:'+activeId;
 const loaded=useLiveQuery(async()=>({id:activeId,scope:await readNameScope(activeId)}),[activeId]);
 const scope=loaded?.id===activeId&&loaded.scope.album===album?loaded.scope:undefined;
 const [drafts,setDrafts]=useState<Record<string,string>>({}),[saving,setSaving]=useState(false);const busy=useRef(false);
 const draft=drafts[scopeKey]??(scope?formatNameList(scope.rows):'');
 function setDraft(update:SetStateAction<string>){setDrafts(old=>({...old,[scopeKey]:typeof update==='function'?update(old[scopeKey]??draft):update}));}
 async function save(text:string){
  if(busy.current||!book||!scope)throw Error('Kho Name chưa sẵn sàng.');
  busy.current=true;setSaving(true);const target=scopeKey;
  try{await saveScopedBookNames(activeId,text,album??null);setDrafts(old=>{const next={...old};delete next[target];return next;});}finally{busy.current=false;setSaving(false);}
 }
 return <section className="book-names-settings" aria-label="Name riêng">
  <h2>Kho Name</h2>
  {books===undefined?<p role="status">Đang tải kho Name…</p>:!books.length?<p>Chưa có truyện trên thiết bị.</p>:<>
   <label>Album / Truyện<select aria-label="Kho Name" value={scopeKey} disabled={saving} onChange={event=>{const group=groups.get(event.target.value);if(group)onSelect(group.id);}}>{!book&&<option value={scopeKey}>Truyện không còn trên thiết bị</option>}{[...groups].sort((a,b)=>a[1].label.localeCompare(b[1].label,'vi')).map(([key,g])=><option key={key} value={key}>{g.label}{key.startsWith('album:')?` · ${g.count} truyện`:''}</option>)}</select></label>
   <p className="muted">{album?`Dùng chung cho ${scope?.members??groups.get(scopeKey)?.count??0} truyện trong Album ${album}, gồm các series.`:'Truyện ngoài Album dùng kho Name riêng.'}</p>
   {!scope?<p role="status">Đang tải Name…</p>:<>
    {scope.conflicts>0&&<p className="name-scope-note">{scope.conflicts} chữ có nghĩa cũ khác nhau giữa các truyện. Tên riêng đang hiện theo truyện “{book?.displayTitle??book?.title}”; lưu lại để dùng chung cho Album.</p>}
    <NameManager key={scopeKey} bookId={activeId} names={scope.rows} draft={draft} setDraft={setDraft} saving={saving} onSave={save} onDelete={async entry=>{await deleteScopedBookName(activeId,entry.key,entry,album??null);setDraft(old=>removeNameDraftKey(old,entry.key,scope.rows));}} notify={()=>undefined} scopeLabel={album?`Album ${album}`:undefined} pageSize={10}/>
    <details className="name-settings-help"><summary>Định dạng Name</summary><p>Mỗi dòng: $中文=Việt. Dấu $ là ký hiệu hiển thị và nhập/xuất. Bỏ dòng khỏi bản nháp không xóa Name đã lưu. Name dùng cho Convert và lần dịch AI sau.</p><p>Name ảnh: <code>$可可多拉=[i]URL ảnh[/]Aron</code>, PNG/JPG/WebP từ archives.bulbagarden.net.</p></details>
   </>}
  </>}
 </section>;
}
