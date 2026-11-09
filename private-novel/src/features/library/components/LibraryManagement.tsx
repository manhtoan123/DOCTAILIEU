import {BOOK_METADATA_MAX_CHARS} from '../../../shared/constants/book-metadata';
import {useEffect,useState} from 'react';
import type {Book} from '../../../core/domain';
import type {CloudBook} from '../../sync-cloud/services/cloud-client';
import {Modal,errorText} from '../../../shared/components/common';
import {previewLibraryDeletion,executeLibraryDeletion,renameManagedBook,renameManagedAlbum,type DeletionPlan,type ManagedBook} from '../services/library-management';
import {getAlbumRegistry,type AlbumEntry} from '../services/album-registry';
import {albumContains} from '../services/album-tree';
import '../styles/library-management.css';

/** Only the reviewed selection enters existing rename/delete services. */
export function LibraryManagement({books,cloudBooks,bookIds,albumPaths,action,shared,onClose,onChanged}:{books:Book[];cloudBooks:CloudBook[];bookIds:string[];albumPaths:string[];action:'rename'|'delete';shared:boolean;onClose:()=>void;onChanged:()=>void}){
 const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[message,setMessage]=useState(''),[plan,setPlan]=useState<DeletionPlan>();
 const [book,setBook]=useState<ManagedBook>(),[album,setAlbum]=useState<AlbumEntry>(),[name,setName]=useState('');
 useEffect(()=>{let alive=true;void (async()=>{try{
  if(action==='delete'){const next=await previewLibraryDeletion(bookIds,albumPaths,shared);if(alive)setPlan(next);}
  else if(bookIds.length+albumPaths.length!==1)throw Error('Chọn đúng một mục để sửa tên.');
  else if(albumPaths.length){const registry=await getAlbumRegistry(),path=albumPaths[0],next=registry.albums.find(row=>row.name===path)??([...books,...cloudBooks].some(row=>albumContains(path,row.album))?{id:'',name:path,updatedAt:0}:undefined);if(!next)throw Error('Album không còn tồn tại; hãy chọn lại.');if(alive){setAlbum(next);setName(next.name.split('/').at(-1)||'');}}
  else{const next=books.find(row=>row.id===bookIds[0])??cloudBooks.find(row=>row.id===bookIds[0]);if(!next)throw Error('Truyện không còn tồn tại; hãy chọn lại.');if(alive){setBook(next);setName(next.title);}}
  if(alive)setReady(true);
 }catch(error){if(alive)setMessage(errorText(error));}})();return()=>{alive=false;};},[]);
 async function save(){if(busy||!ready)return;setBusy(true);setMessage('');try{
  if(action==='delete'){if(!plan)return;const result=await executeLibraryDeletion(plan);if(result.failed.length){onChanged();setReady(false);setMessage(`Hoàn tất ${result.completed.length}/${plan.books.length} truyện; kho đã xác nhận ${result.cloudDeleted.length}. ${result.failed.map(row=>row.message).join(' ')} Chọn lại các mục còn lại để tiếp tục.`);return;}}
  else if(album)await renameManagedAlbum(album,name);
  else if(book)await renameManagedBook(book,name,cloudBooks.find(row=>row.id===book.id));
  else return;
  onChanged();onClose();
 }catch(error){setMessage(errorText(error));}finally{setBusy(false);}}
 return <Modal title={action==='delete'?'Xác nhận xóa':albumPaths.length?'Sửa tên Album':'Sửa tên truyện'} wide onClose={()=>{if(!busy)onClose();}} dismissOnBackdrop={false} keyboardEnabled={!busy} className="library-management">
  {message&&<p role="alert" className="notice">{message}</p>}
  {!ready&&!message&&<p role="status">Đang lấy danh sách đã chọn…</p>}
  {ready&&(action==='delete'?<>
   <p>Xóa {albumPaths.length?`${albumPaths.length} Album và `:''}{plan?.books.length??0} truyện? Chỉ dọn bản trên thiết bị sau khi kho xác nhận xóa.</p>
   {!!albumPaths.length&&<ul>{albumPaths.map(path=><li key={path}>📁 {path} (gồm Album con)</li>)}</ul>}
   <ul className="chapter-delete-preview">{plan?.books.map(row=><li key={row.id}>{row.title}</li>)}</ul>
  </>:<label>Tên {album?'Album':'truyện'}<input autoFocus maxLength={album?120:BOOK_METADATA_MAX_CHARS} value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label>)}
  <footer><button disabled={busy} onClick={onClose}>{ready?'Hủy':'Đóng'}</button><button className={action==='delete'?'btn-danger':'primary'} disabled={busy||!ready||(action==='rename'&&!name.trim())} onClick={()=>void save()}>{busy?'Đang xử lý…':action==='delete'?'Xác nhận xóa':'Lưu'}</button></footer>
 </Modal>;
}
