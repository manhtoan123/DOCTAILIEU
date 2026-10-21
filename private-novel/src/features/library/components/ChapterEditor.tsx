import {useState} from 'react';
import type {Chapter} from '../../../core/domain';
import {saveSharedChapter} from '../../sync-cloud/services/shared-chapters';

/** The opening snapshot is the CAS base; failed saves keep the draft open. */
export function ChapterEditor({chapter,onClose}:{chapter:Chapter;onClose:()=>void}){
 const [title,setTitle]=useState(chapter.title),[text,setText]=useState(chapter.text),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <section className="panel chapter-editor" aria-label="Sửa chương">
  <h3>Sửa chương</h3>
  <label>Tên chương<input value={title} maxLength={1000} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>
  <label>Nội dung<textarea aria-label="Nội dung" value={text} rows={14} maxLength={128000} disabled={busy} onChange={e=>setText(e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  <div className="chapter-manage-actions"><button disabled={busy||!title.trim()} onClick={async()=>{setBusy(true);setError('');try{await saveSharedChapter(chapter,text,undefined,title);onClose();}catch(e){setError(e instanceof Error?e.message:'Không lưu được chương.');}finally{setBusy(false);}}}>{busy?'Đang lưu…':'Lưu'}</button><button disabled={busy} onClick={onClose}>Hủy</button></div>
 </section>;
}
