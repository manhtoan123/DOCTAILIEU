import {cleanImportedTitle} from '../services/import-advertising';
import {prepareDocument,importDocument} from '../services/document-convert';
import DocumentPreview from './DocumentPreview';
import {importEpub} from '../services/epub-import';
import {useEffect,useMemo,useRef,useState} from 'react';
import Dexie from 'dexie';
import {db,deleteBook} from '../../../core/db';
import {importFiles,throwIfImportAborted} from '../services/importer';
import type {ImportStatus} from '../services/txt-import-progress';
import ImportProgress from './ImportProgress';
import {cleanTitle} from '../../../core/domain';
import {commitAlbumImports,normalizeAlbum} from '../../library/services/albums';
import {readStoredAlbumRegistry} from '../../library/services/album-registry';
import ChapterSplitPreview,{ChapterLimit,validChapterLimit} from './ChapterSplitPreview';
import {Modal,errorText} from '../../../shared/components/common';
import FolderImportDialog from './FolderImportDialog';
import BatchImportDialog from './BatchImportDialog';
import AnthologyImportDialog from './AnthologyImportDialog';
import '../styles/import-dialog.css';

export default function ImportDialog({initialAlbum='',onClose,onDone}:{initialAlbum?:string;onClose:()=>void;onDone:(id:string)=>void}){
  const [folderMode,setFolderMode]=useState(false);
  const [anthologyMode,setAnthologyMode]=useState(false),[anthologyParts,setAnthologyParts]=useState<{files:File[];titles:string[];encoding:string}>();
  const [files,setFiles]=useState<File[]>([]);const isEpub=files.length===1&&/\.epub$/i.test(files[0].name);
  const isDocument=files.length===1&&/\.(pdf|docx)$/i.test(files[0].name);const isLayout=isEpub||isDocument;
  const [prepared,setPrepared]=useState<File>();
  const [title,setTitle]=useState('');
  const [paste,setPaste]=useState('');
  const [pasteExpanded,setPasteExpanded]=useState(false);
  const [encoding,setEncoding]=useState('auto');
  const [pattern,setPattern]=useState('');
  const [effectiveMaxChars,setMaxChars]=useState(0);
  const [previewValid,setPreviewValid]=useState(false);
  const previewFiles=useMemo(()=>files.length?files:paste.trim()?[new File([paste],`${title||'Truyện mới'}.txt`)]:[],[files,paste,title]);
  const [album,setAlbum]=useState(initialAlbum||'');
  const [albumList,setAlbumList]=useState<string[]>([]);
  const [status,setStatus]=useState<ImportStatus>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const abort=useRef<AbortController|undefined>(undefined);
  const mounted=useRef(true);

  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;abort.current?.abort();};},[]);
  useEffect(()=>{
    void readStoredAlbumRegistry().then(async reg=>{
      const fromReg=reg?.albums.map(a=>a.name)||[];
      const books=await db.books.toArray().catch(()=>[]);
      const fromBooks=books.map(b=>b.album).filter((a):a is string=>!!a);
      const combined=[...new Set([...fromReg,...fromBooks])].sort((a,b)=>a.localeCompare(b,'vi'));
      if(mounted.current)setAlbumList(combined);
    }).catch(()=>{});
  },[]);

  function choose(input:File[]){
    setPrepared(undefined);
    if(input.some(file=>!/\.(txt|epub|pdf|docx)$/i.test(file.name))){
      setFiles([]);
      setError('Chọn TXT, EPUB, PDF hoặc DOCX.');
      return;
    }
    setFiles(input);
    if(input.length===1&&!title) setTitle(cleanImportedTitle(cleanTitle(input[0].name)));
    setError(input.length?'':'Chọn TXT, EPUB, PDF hoặc DOCX. Mỗi file là một truyện.');
  }

  async function run(){
    if(abort.current)return;
    setError('');setStatus(undefined);setBusy(true);const controller=new AbortController();abort.current=controller;
    let staged='';let committed=false;
    try{
      normalizeAlbum(album);
      if(!isLayout&&!validChapterLimit(effectiveMaxChars))throw new Error('Giới hạn chương không hợp lệ.');
      const selected=files.length?files:[new File([paste],`${title||'Truyện mới'}.txt`,{type:'text/plain'})];
      if(isDocument&&!prepared){setStatus({message:'Đang trích chữ và ảnh…',percent:0});const next=await prepareDocument(selected[0],controller.signal);throwIfImportAborted(controller.signal);if(mounted.current)setPrepared(next);return;}
      const result=isDocument?await importDocument(selected[0],prepared!,title,setStatus,controller.signal):isEpub?await importEpub(selected[0],title,setStatus,controller.signal):await importFiles(selected,title,files.length?encoding:'utf-8',pattern,true,setStatus,controller.signal,{maxChars:effectiveMaxChars});
      staged=result.id;throwIfImportAborted(controller.signal);
      if(mounted.current)setStatus({message:'Đang lưu truyện…',percent:99});
      // Keep cancellation live through the atomic publication boundary.
      let rejectCancellation!:(reason:Error)=>void;
      const cancellation=new Promise<never>((_,reject)=>{rejectCancellation=reject;});
      const publication=db.transaction('rw',[db.books,db.importJobs],async()=>{
        const transaction=Dexie.currentTransaction!;const cancel=()=>transaction.abort();
        controller.signal.addEventListener('abort',cancel,{once:true});
        const detach=()=>controller.signal.removeEventListener('abort',cancel);
        transaction.on('complete',detach);transaction.on('abort',()=>{detach();if(controller.signal.aborted)rejectCancellation(new Error('Đã hủy nhập.'));});
        throwIfImportAborted(controller.signal);
        await commitAlbumImports([staged],album);throwIfImportAborted(controller.signal);
      });
      await Promise.race([publication,cancellation]);
      committed=true;if(mounted.current)onDone(staged);
    }catch(e){
      let message=errorText(e);
      if(staged&&!committed){try{await deleteBook(staged);}catch{message+=' Không xóa được bản tạm; mở Cài đặt → Thông tin để xử lý bản nhập chưa hoàn tất.';}}
      if(mounted.current)setError(message);
    }finally{abort.current=undefined;if(mounted.current)setBusy(false);}
  }

  function close(){if(abort.current){abort.current.abort();return;}onClose();}
  if(folderMode)return <FolderImportDialog initialAlbum={album} onClose={onClose} onDone={onDone}/>;
  if(anthologyParts)return <BatchImportDialog files={anthologyParts.files} bookTitles={anthologyParts.titles} fixedEncoding={anthologyParts.encoding} sourceNote="Các file dưới đây là những phần tách từ tuyển tập, giữ nguyên byte nguồn; từng phần được lưu riêng theo truyện." encoding={anthologyParts.encoding} pattern={pattern} initialAlbum={album} initialMaxChars={effectiveMaxChars} onClose={onClose} onDone={onDone}/>;
  if(anthologyMode&&files.length===1)return <AnthologyImportDialog file={files[0]} encoding={encoding} onBack={()=>setAnthologyMode(false)} onPrepared={(files,titles,encoding)=>setAnthologyParts({files,titles,encoding})}/>;
  if(files.length>1)return <BatchImportDialog files={files} encoding={encoding} pattern={pattern} initialAlbum={album} initialMaxChars={effectiveMaxChars} onClose={onClose} onDone={onDone}/>;

  return <Modal title="Thêm truyện" onClose={()=>void close()} wide className="import-dialog">
   <div className="import-dialog-body">
    {error&&<p className="notice error" role="alert">{error}</p>}
    <div className="import-source-card" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)choose([...e.dataTransfer.files]);}}>
      {files.length>0&&<strong>{files[0].name}</strong>}
      <div className="import-source-actions">
        <label className="import-file-picker"><span>{files.length?'Đổi file':'Chọn file'}</span><input type="file" aria-describedby={files.length?undefined:'import-formats'} accept=".txt,.epub,.pdf,.docx" multiple disabled={busy} onChange={e=>choose(Array.from(e.target.files||[]))}/></label>
        {files.length>0&&<button disabled={busy} onClick={()=>{setFiles([]);setPrepared(undefined);}}>Bỏ chọn</button>}
        {!busy&&<button onClick={()=>setFolderMode(true)}>Nhập folder truyện</button>}
      </div>
      {!files.length&&<p id="import-formats">TXT, EPUB, PDF, DOCX</p>}
    </div>
    <div className="import-book-fields">
     <label>Tên truyện<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={300} placeholder="Tự điền theo tên file" disabled={busy}/></label>
     <label>Album (không bắt buộc)
      <input
        list="album-list-options"
        value={album}
        onChange={e => setAlbum(e.target.value)}
        maxLength={120}
        disabled={busy}
        placeholder="Chọn hoặc nhập tên Album..."
      />
      <datalist id="album-list-options">
        {albumList.map(a => <option key={a} value={a}/>)}
        {initialAlbum && !albumList.includes(initialAlbum) && <option value={initialAlbum}/>}
      </datalist>
     </label>
    </div>
    {!files.length&&<details className="import-disclosure import-paste" open={pasteExpanded} onToggle={event=>setPasteExpanded(event.currentTarget.open)}><summary>Dán nội dung truyện</summary><label>Hoặc dán nội dung<textarea value={paste} onChange={e=>setPaste(e.target.value)} rows={4} placeholder="Chương 1…" disabled={busy}/></label></details>}

    {!isLayout&&<><details className="import-disclosure"><summary>Cách đọc TXT</summary><div className="import-options-body">
      <label>Encoding
        <select value={encoding} onChange={e=>setEncoding(e.target.value)} disabled={busy}>
          <option value="auto">Tự nhận diện theo file</option>
          <option value="utf-8">UTF-8 (thường dùng)</option>
          <option value="gb18030">GB18030 / GBK (tiếng Trung)</option>
          <option value="utf-16le">UTF-16 LE</option>
          <option value="utf-16be">UTF-16 BE</option>
        </select>
      </label>
      <ChapterLimit value={effectiveMaxChars} onChange={setMaxChars} disabled={busy}/>
    <details className="import-regex-options">
      <summary>Regex nhận diện tùy chỉnh</summary>
      <input aria-label="Regex nhận diện chương" value={pattern} onChange={e=>setPattern(e.target.value)} disabled={busy} placeholder="Ví dụ: ^第[0-9一二三十百]+章"/>
    </details>
    </div></details>

    <ChapterSplitPreview files={previewFiles} encoding={files.length?encoding:'utf-8'} pattern={pattern} maxChars={effectiveMaxChars} onValidity={setPreviewValid}/></>}
    {!isLayout&&files.length===1&&<button className="import-anthology" disabled={busy} onClick={()=>setAnthologyMode(true)}>Tách tuyển tập thành nhiều truyện</button>}

    {isDocument&&<p className="notice">PDF cần có lớp chữ. Kiểm tra thứ tự đoạn văn trong bản xem trước nếu trang có nhiều cột.</p>}
    {(isEpub||prepared)&&<DocumentPreview file={isEpub?files[0]:prepared!}/>}
   </div>
    <footer>
     {busy&&<ImportProgress status={status}/>}
     {(files.length>0||!!paste.trim())&&<p className="import-storage-note">Truyện tự đồng bộ nếu đã cấu hình kho chung.</p>}
     <div className="import-submit-actions">
      <button onClick={()=>void close()}>{busy?'Hủy xử lý':'Đóng'}</button>
      <button className="primary" disabled={busy||(!isLayout&&(!previewValid||!validChapterLimit(effectiveMaxChars)))||(!files.length&&!paste.trim())} onClick={()=>void run()}>
        {busy?'Đang xử lý…':isDocument&&!prepared?'Xem trước tài liệu':'Nhập truyện'}
      </button>
     </div>
    </footer>
  </Modal>;
}
