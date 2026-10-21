import {useEffect,useMemo,useRef,useState} from 'react';
import Dexie from 'dexie';
import {db,deleteBook} from '../../../core/db';
import {throwIfImportAborted} from '../services/importer';
import type {FolderImportGroup} from '../services/folder-import';
import {planFolderSelection,prepareFolderSelection} from '../services/folder-selection';
import {cleanTitle} from '../../../core/domain';
import {commitMappedAlbumImports} from '../../library/services/albums';
import ChapterSplitPreview,{ChapterLimit,validChapterLimit} from './ChapterSplitPreview';
import {Modal,errorText} from '../../../shared/components/common';

export default function FolderImportDialog({onClose,onDone}:{initialAlbum:string;onClose:()=>void;onDone:(id:string)=>void}){
  const [groups,setGroups]=useState<FolderImportGroup[]>([]),[ignored,setIgnored]=useState<string[]>([]);
  const [files,setFiles]=useState<File[]>([]);
  const [encoding,setEncoding]=useState('utf-8'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [maxChars,setMaxChars]=useState(0),[pattern,setPattern]=useState('');
  const previewFiles=useMemo(()=>groups.flatMap(group=>group.files).filter(file=>/\.txt$/i.test(file.name)),[groups]);
  const abort=useRef<AbortController|undefined>(undefined);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;abort.current?.abort();};},[]);
  function close(){if(abort.current){abort.current.abort();return;}onClose();}
  async function run(){
    if(abort.current)return;
    setBusy(true);setError('');const controller=new AbortController();abort.current=controller;
    let ids:string[]=[];let committed=false;
    try{
      if(!validChapterLimit(maxChars))throw new Error('Giới hạn chương không hợp lệ.');
      const result=await prepareFolderSelection(files,encoding,status=>setMessage(status.message),controller.signal,{maxChars,pattern});
      ids=result.ids;throwIfImportAborted(controller.signal);
      let rejectCancellation!:(reason:Error)=>void;
      const cancellation=new Promise<never>((_,reject)=>{rejectCancellation=reject;});
      const publication=db.transaction('rw',[db.books,db.importJobs],async()=>{
        const transaction=Dexie.currentTransaction!;const cancel=()=>transaction.abort();
        controller.signal.addEventListener('abort',cancel,{once:true});
        const detach=()=>controller.signal.removeEventListener('abort',cancel);
        transaction.on('complete',detach);transaction.on('abort',()=>{detach();if(controller.signal.aborted)rejectCancellation(new Error('Đã hủy nhập.'));});
        throwIfImportAborted(controller.signal);
        await commitMappedAlbumImports(result.assignments);throwIfImportAborted(controller.signal);
      });
      // Native abort completes rollback even if an awaited nested promise is delayed.
      // Race observes both promises, so late rejection cannot become unhandled.
      await Promise.race([publication,cancellation]);
      committed=true;if(mounted.current)onDone(ids[0]);
    }catch(e){
      let message=errorText(e);
      const cleanup=committed?[]:await Promise.allSettled(ids.map(id=>deleteBook(id)));
      if(cleanup.some(result=>result.status==='rejected'))message+=' Không xóa được một số bản tạm; mở Cài đặt → Thông tin để xử lý bản nhập chưa hoàn tất.';
      if(mounted.current){setError(message);setMessage('');}
    }finally{abort.current=undefined;if(mounted.current)setBusy(false);}
  }
  return <Modal title="Nhập folder truyện" onClose={()=>void close()} wide>
    <p>Tác giả (Album) → Series (Album con) → Truyện → Chương. Folder con nằm trong Album cha theo đường dẫn, kể cả khi folder cha không có file truyện. Mỗi file TXT hoặc EPUB là một truyện; TXT tự tách tiêu đề chương, EPUB giữ mục lục và bố cục gốc; giới hạn ký tự bên dưới cho phép chia chương dài thành phần.</p>
    <p className="muted">Chọn folder trên máy. Sau khi bấm nhập, truyện được lưu trên thiết bị và tự đồng bộ nếu kho cloud được cấu hình.</p>
    <p className="muted">Giới hạn: TXT 40 MiB / EPUB 256 MiB, lượt có EPUB tối đa 4 GiB; chỉ TXT tối đa 256 MiB. Bố cục sau xử lý tối đa 128 MiB mỗi EPUB. Nội dung rỗng sẽ báo lỗi.</p>
    {error&&<p role="alert" className="notice error">{error}</p>}
    <><label>Chọn folder truyện<input aria-label="Chọn folder truyện" type="file" multiple disabled={busy} ref={element=>{element?.setAttribute('webkitdirectory','');}} onChange={event=>{try{const selection=Array.from(event.target.files||[]);const plan=planFolderSelection(selection);setFiles(selection);setGroups(plan.groups);setIgnored(plan.ignored);setError('');setMessage('');}catch(e){setFiles([]);setGroups([]);setIgnored([]);setMessage('');setError(errorText(e));}}}/></label>
    <label>Encoding chương<select value={encoding} disabled={busy} onChange={event=>setEncoding(event.target.value)}><option value="utf-8">UTF-8</option><option value="gb18030">GB18030 / GBK</option><option value="utf-16le">UTF-16 LE</option></select></label></>
    <ChapterLimit value={maxChars} onChange={setMaxChars} disabled={busy}/>
    <label>Regex nhận diện tùy chỉnh<input value={pattern} disabled={busy} onChange={e=>setPattern(e.target.value)}/></label>
    {!!groups.length&&groups.some(group=>group.files.some(file=>/\.epub$/i.test(file.name)))&&<p className="notice">EPUB giữ mục lục, định dạng và ảnh gốc; phần xem trước chia chương bên dưới chỉ dành cho TXT.</p>}
    <ChapterSplitPreview files={previewFiles} encoding={encoding} pattern={pattern} maxChars={maxChars}/>
    {!!groups.length&&<section aria-label="Xem trước folder"><p>{groups.length} Album · {groups.reduce((sum,group)=>sum+group.files.length,0)} truyện · {groups.reduce((sum,group)=>sum+group.files.length,0)} file TXT / EPUB</p>{groups.map(group=><details key={group.path}><summary>{group.title} — {group.files.length} truyện</summary><ol>{group.files.map(file=><li key={file.webkitRelativePath}>{cleanTitle(file.name)} — {file.name}</li>)}</ol></details>)}</section>}
    {!!ignored.length&&<details><summary>Không nhập {ignored.length} file không phải TXT / EPUB</summary><ul>{ignored.map(path=><li key={path}>{path}</li>)}</ul></details>}
    {message&&<p role="status">{message}</p>}
    <footer className="import-folder-footer"><button onClick={()=>void close()}>{busy?'Hủy xử lý':'Đóng'}</button><button className="primary" disabled={busy||!groups.length||!validChapterLimit(maxChars)} onClick={()=>void run()}>{busy?'Đang nhập…':'Nhập folder'}</button></footer>
  </Modal>;
}

