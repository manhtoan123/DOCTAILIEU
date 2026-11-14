import {useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import {type NameEntry} from '../../../core/domain';
import {canonicalNameKey,displayNameKey,formatNameEntry,formatNameDraft,parseNameEntry,resolveNameKey} from '../services/name-format';
import {download} from '../../import-export/services/backup';
import {errorText} from '../../../shared/components/common';
import '../styles/name-manager.css';

export interface NameManagerProps {
  bookId:string;
  scopeLabel?:string;
  pageSize?:number;
  names:NameEntry[];
  /** Owned by Reader so closing the panel retains unsaved changes. */
  draft:string;
  setDraft:Dispatch<SetStateAction<string>>;
  /** Must reject on failure. Inline sends one key; bulk sends the full draft. */
  onSave:(text:string)=>Promise<void>;
  saving:boolean;
  /** Parent removes the exact entry and synchronizes its draft after commit. */
  onDelete:(entry:NameEntry)=>Promise<void>;
  notify:(message:string)=>void;
}
const PAGE_SIZE=50;
const MAX_DRAFT=2*1048576;

function mergeKey(text:string,key:string,value:string){
  let replaced=false;
  const lines=text.split(/\r?\n/).flatMap(line=>{
    if(parseNameEntry(line)?.[0]!==canonicalNameKey(key))return [line];
    if(replaced)return [];
    replaced=true;return [formatNameEntry(key,value)];
  });
  if(!replaced)lines.push(formatNameEntry(key,value));
  return lines.filter((line,index)=>index!==0||line!=='').join('\n');
}

export default function NameManager({bookId,names,draft,setDraft,onSave,saving,onDelete,notify,scopeLabel='Truyện này',pageSize=PAGE_SIZE}:NameManagerProps){
  const [query,setQuery]=useState('');const [page,setPage]=useState(0);
  const [editing,setEditing]=useState<NameEntry|null>(null);const [editor,setEditor]=useState(false);
  const [key,setKey]=useState('');const [value,setValue]=useState('');
  const [error,setError]=useState('');const [status,setStatus]=useState('');
  const [working,setWorking]=useState(false);const [importing,setImporting]=useState(false);
  const alive=useRef(false);const activeBook=useRef(bookId);activeBook.current=bookId;
  const generation=useRef(0);const importGeneration=useRef(0);const busy=useRef(false);
  const draftRef=useRef(draft);draftRef.current=draft;
  const textarea=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{
    alive.current=true;generation.current++;importGeneration.current++;
    busy.current=false;setWorking(false);setQuery('');setPage(0);setEditing(null);setEditor(false);setKey('');setValue('');setError('');setStatus('');setImporting(false);
    return()=>{alive.current=false;generation.current++;importGeneration.current++;};
  },[bookId]);
  function sizeTextarea(){
    const element=textarea.current;if(!element)return;
    element.style.height='auto';element.style.height=`${Math.min(160,Math.max(72,element.scrollHeight))}px`;
  }
  useEffect(sizeTextarea,[draft]);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase();
    return names.filter(entry=>entry.bookId===bookId&&(!needle||`${entry.key}\n${entry.value}`.toLocaleLowerCase().includes(needle)));
  },[names,bookId,query]);
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const currentPage=Math.min(page,pages-1);
  const entries=filtered.slice(currentPage*pageSize,(currentPage+1)*pageSize);
  const disabled=saving||working;
  function choose(entry:NameEntry|null){
    setEditing(entry);setKey(entry?displayNameKey(entry.key):'');
    const ambiguous=entry&&new Set(names.filter(row=>canonicalNameKey(row.key)===canonicalNameKey(entry.key)).map(row=>row.key)).size>1;
    const pending=entry&&!ambiguous?draft.split(/\r?\n/).map(parseNameEntry).filter(item=>item?.[0]===canonicalNameKey(entry.key)).at(-1):undefined;
    setValue(pending?.[1]??entry?.value??'');setEditor(true);setError('');setStatus('');
  }
  function current(session:number,sourceBook:string){return alive.current&&generation.current===session&&activeBook.current===sourceBook;}
  async function persist(text:string,single?:{key:string;value:string}){
    if(disabled||busy.current)return;
    const session=generation.current,sourceBook=bookId;busy.current=true;setWorking(true);setError('');setStatus('');
    try{await onSave(text);if(current(session,sourceBook)){setStatus(scopeLabel==='Truyện này'?'Đã lưu Name cho truyện này.':`Đã lưu Name cho ${scopeLabel}.`);if(single&&!editing)setEditing({id:'',bookId:sourceBook,...single});}}
    catch(reason){if(current(session,sourceBook))setError(errorText(reason));}
    finally{if(current(session,sourceBook)){busy.current=false;setWorking(false);}}
  }
  function saveOne(){
    if(disabled||busy.current)return;
    const source=canonicalNameKey(key),replacement=value.trim();
    if(!source||/[\r\n=]/.test(source)||source.startsWith('#')||/[\r\n]/.test(replacement)){
      setError('Chữ nguồn không được để trống, chứa dấu = hoặc bắt đầu bằng #. Nghĩa phải nằm trên một dòng.');return;
    }
    if(source.length>256||replacement.length>4096){setError('Tên hoặc nghĩa quá dài (tối đa 256 / 4.096 ký tự).');return;}
    try{resolveNameKey(source,names);}catch(reason){setError(errorText(reason));return;}
    if(!editing&&names.some(entry=>entry.bookId===bookId&&canonicalNameKey(entry.key)===source)){setError('Chữ nguồn đã có Name. Chọn tên đó trong danh sách để sửa.');return;}
    if(mergeKey(draftRef.current,source,replacement).length>MAX_DRAFT){setError('Name List tối đa 2 MB.');return;}
    setDraft(old=>mergeKey(old,source,replacement));
    void persist(formatNameEntry(source,replacement),{key:source,value:replacement});
  }
  async function remove(entry:NameEntry){
    if(disabled||busy.current)return;
    const session=generation.current,sourceBook=bookId;busy.current=true;setWorking(true);setError('');setStatus('');
    try{await onDelete(entry);if(current(session,sourceBook)){if(editing?.key===entry.key){setEditing(null);setEditor(false);setKey('');setValue('');}setStatus(`Đã xóa Name ${displayNameKey(entry.key)}.`);}}
    catch(reason){if(current(session,sourceBook))setError(errorText(reason));}
    finally{if(current(session,sourceBook)){busy.current=false;setWorking(false);}}
  }
  async function importFile(file:File){
    const session=generation.current,sourceBook=bookId,request=++importGeneration.current;setImporting(true);setError('');setStatus('');
    try{
      if(file.size>MAX_DRAFT)throw new Error('Name List tối đa 2 MB.');
      const text=formatNameDraft(await file.text());
      if(!current(session,sourceBook)||request!==importGeneration.current)return;
      if(draftRef.current.length+text.length+(draftRef.current?'\n'.length:0)>MAX_DRAFT)throw new Error('Bản nháp sau nhập vượt 2 MB.');
      // Append to the latest parent draft, including typing done while File.text was pending.
      setDraft(old=>old+(old?'\n':'')+text);
      const lines=text.split(/\r?\n/).filter(line=>line.trim());const valid=lines.filter(line=>parseNameEntry(line)).length;
      const message=`Đã đưa file vào bản nháp: ${valid} dòng hợp lệ, ${lines.length-valid} dòng bị bỏ khi lưu. Bấm Lưu nhiều tên để áp dụng.`;
      setStatus(message);notify(message);
    }catch(reason){if(current(session,sourceBook)&&request===importGeneration.current)setError(errorText(reason));}
    finally{if(current(session,sourceBook)&&request===importGeneration.current)setImporting(false);}
  }
  return <div className="name-manager" aria-busy={disabled}>
    <div className="name-manager-search"><label>Tìm Name<input type="search" aria-label="Tìm Name" placeholder="Chữ nguồn hoặc tên Việt…" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label><button type="button" disabled={disabled} onClick={()=>choose(null)}>Thêm tên</button></div>
    {editor&&<form className="name-manager-editor" onSubmit={event=>{event.preventDefault();saveOne();}}>
      <label>Chữ nguồn<input aria-label="Chữ nguồn của Name" value={key} readOnly={!!editing} disabled={disabled} onChange={event=>{setKey(event.target.value);setError('');setStatus('');}}/></label>
      <label>Tên Việt<input aria-label="Tên Việt của Name" placeholder="Để trống để ẩn trong Convert" value={value} disabled={disabled} onChange={event=>{const next=event.target.value;setValue(next);if(editing){try{resolveNameKey(editing.key,names);setDraft(old=>mergeKey(old,editing.key,next));}catch{/* Keep conflicting legacy draft entries intact. */}}setError('');setStatus('');}}/></label>
      <div className="name-manager-save"><small>Phạm vi: {scopeLabel}</small><button className="primary" type="submit" disabled={disabled}>{disabled?'Đang lưu…':'Lưu tên'}</button></div>
    </form>}
    {error&&<p className="name-manager-feedback" role="alert">{error}</p>}
    {status&&<p className="name-manager-feedback" role="status">{status}</p>}
    <details className="name-manager-advanced" onToggle={sizeTextarea}>
      <summary>Nhập / xuất và sửa nhiều dòng</summary>
      <p>Mỗi dòng: $中文=Việt. Lưu gộp các tên được nhập. Xóa dòng ở đây không xóa Name đã lưu.</p>
      <textarea ref={textarea} aria-label="Nội dung Name List" rows={3} disabled={disabled} value={draft} onChange={event=>{setDraft(event.target.value);setError('');setStatus('');}} placeholder="$张三=Trương Tam"/>
      <div className="name-manager-bulk-actions"><button className="primary" type="button" disabled={disabled} onClick={()=>void persist(draft)}>Lưu nhiều tên</button><button type="button" onClick={()=>download(new Blob([formatNameDraft(draft)],{type:'text/plain;charset=utf-8'}),'NameList.txt')}>Xuất bản nháp</button></div>
      <label>Nhập file vào bản nháp<input type="file" accept=".txt,text/plain" aria-label="Nhập Name List" disabled={disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importFile(file);}}/></label>
      {importing&&<p role="status">Đang đọc file Name… Bạn vẫn có thể sửa bản nháp.</p>}
    </details>
    <p className="name-manager-count">Đã lưu: {names.filter(entry=>entry.bookId===bookId).length} · Tìm thấy: {filtered.length}</p>
    <ul className="name-manager-list" aria-label="Name đã lưu">
      {entries.map(entry=><li key={entry.id}><button type="button" className="name-manager-row" aria-label={`Sửa Name ${displayNameKey(entry.key)}`} aria-pressed={editing?.key===entry.key} disabled={disabled} onClick={()=>choose(entry)}><span>{displayNameKey(entry.key)}</span><span>{entry.value?`=${entry.value}`:"(Ẩn trong Convert)"}</span></button><button type="button" className="name-manager-delete" aria-label={`Xóa Name ${displayNameKey(entry.key)}`} disabled={disabled} onClick={()=>void remove(entry)}>×</button></li>)}
    </ul>
    {!filtered.length&&<p className="muted">{query?'Không có Name khớp tìm kiếm.':'Chưa có Name riêng. Bấm Thêm tên để bắt đầu.'}</p>}
    {pages>1&&<nav className="name-manager-pager" aria-label="Trang Name"><button type="button" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>Trước</button><span>{currentPage+1} / {pages}</span><button type="button" disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>Tiếp</button></nav>}
  </div>;
}
