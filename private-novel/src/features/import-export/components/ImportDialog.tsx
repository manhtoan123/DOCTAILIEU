import {importEpub} from '../services/epub-import';
import {useEffect,useMemo,useRef,useState} from 'react';
import Dexie from 'dexie';
import {db,deleteBook} from '../../../core/db';
import {importFiles,throwIfImportAborted,type ImportStatus} from '../services/importer';
import {cleanTitle} from '../../../core/domain';
import {commitAlbumImports,normalizeAlbum} from '../../library/services/albums';
import {readStoredAlbumRegistry} from '../../library/services/album-registry';
import ChapterSplitPreview,{ChapterLimit,validChapterLimit} from './ChapterSplitPreview';
import {Modal,errorText} from '../../../shared/components/common';
import FolderImportDialog from './FolderImportDialog';
import BatchImportDialog from './BatchImportDialog';
import AnthologyImportDialog from './AnthologyImportDialog';

export default function ImportDialog({initialAlbum='',onClose,onDone}:{initialAlbum?:string;onClose:()=>void;onDone:(id:string)=>void}){
  const [folderMode,setFolderMode]=useState(false);
  const [anthologyMode,setAnthologyMode]=useState(false),[anthologyParts,setAnthologyParts]=useState<{files:File[];titles:string[];encoding:string}>();
  const [files,setFiles]=useState<File[]>([]);const isEpub=files.length===1&&/\.epub$/i.test(files[0].name);
  const [title,setTitle]=useState('');
  const [paste,setPaste]=useState('');
  const [encoding,setEncoding]=useState('utf-8');
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
    if(input.some(file=>!/\.(txt|epub)$/i.test(file.name))){
      setFiles([]);
      setError('Chọn file TXT hoặc EPUB.');
      return;
    }
    setFiles(input);
    if(input.length===1&&!title) setTitle(cleanTitle(input[0].name));
    setError(input.length?'':'Chọn file TXT hoặc EPUB. Mỗi file là một truyện.');
  }

  async function run(){
    if(abort.current)return;
    setError('');setBusy(true);const controller=new AbortController();abort.current=controller;
    let staged='';let committed=false;
    try{
      normalizeAlbum(album);
      if(!isEpub&&!validChapterLimit(effectiveMaxChars))throw new Error('Giới hạn chương không hợp lệ.');
      const selected=files.length?files:[new File([paste],`${title||'Truyện mới'}.txt`,{type:'text/plain'})];
      const result=isEpub?await importEpub(selected[0],title,setStatus,controller.signal):await importFiles(selected,title,files.length?encoding:'utf-8',pattern,true,setStatus,controller.signal,{maxChars:effectiveMaxChars});
      staged=result.id;throwIfImportAborted(controller.signal);
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

  return <Modal title="Thêm truyện vào thư phòng" onClose={()=>void close()} wide>
    <p className="muted">Lưu trên thiết bị trước; truyện đã nhập tự đồng bộ khi kho cloud được cấu hình. File gốc trên máy được giữ nguyên.</p>
    {!busy&&<button onClick={()=>setFolderMode(true)}>Nhập folder truyện</button>}
    {error&&<p className="notice error" role="alert">{error}</p>}
    <label>Tên truyện<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={300} placeholder="Đặt tên cho cuốn sách mới" disabled={busy}/></label>
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
    <div className="dropzone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)choose([...e.dataTransfer.files]);}}>
      <strong>Kéo thả TXT hoặc EPUB vào đây</strong>
      <span>TXT tự nhận diện chương; EPUB giữ mục lục, bố cục và ảnh gốc</span>
      <input aria-label="Chọn file TXT hoặc EPUB" type="file" accept=".txt,.epub" multiple disabled={busy} onChange={e=>choose(Array.from(e.target.files||[]))}/>
      {files.length>0&&<small>1 file đã chọn · {(files[0].size/1048576).toFixed(1)} MB <button disabled={busy} onClick={()=>setFiles([])}>Bỏ chọn</button></small>}
    </div>
    {!files.length&&<label>Hoặc dán nội dung<textarea value={paste} onChange={e=>setPaste(e.target.value)} rows={5} placeholder="Chương 1…" disabled={busy}/></label>}

    {!isEpub&&<><div className="form-grid">
      <label>Encoding
        <select value={encoding} onChange={e=>setEncoding(e.target.value)} disabled={busy}>
          <option value="utf-8">UTF-8 (thường dùng)</option>
          <option value="gb18030">GB18030 / GBK (tiếng Trung)</option>
          <option value="utf-16le">UTF-16 LE</option>
        </select>
      </label>
      <ChapterLimit value={effectiveMaxChars} onChange={setMaxChars} disabled={busy}/>
    </div>

    <details>
      <summary>Regex nhận diện tùy chỉnh</summary>
      <input value={pattern} onChange={e=>setPattern(e.target.value)} disabled={busy} placeholder="Ví dụ: ^第[0-9一二三十百]+章"/>
      <p className="muted">Áp dụng từng dòng. Để trống dùng bộ nhận diện mặc định thông minh (hỗ trợ Chương/Hồi/Tiết, 第X章/话/集, mốc số, lọc thông báo hệ thống, giữ nguyên văn bản).</p>
    </details>

    <ChapterSplitPreview files={previewFiles} encoding={files.length?encoding:'utf-8'} pattern={pattern} maxChars={effectiveMaxChars} onValidity={setPreviewValid}/></>}{isEpub&&<p className="notice">Giữ bố cục EPUB gốc, tối đa 128 MiB bố cục sau xử lý. Không chia lại mục lục. Có thể chọn Bản gốc, Convert hoặc Dịch AI khi đọc.</p>}
    {!isEpub&&files.length===1&&<button disabled={busy} onClick={()=>setAnthologyMode(true)}>Tách tuyển tập thành nhiều truyện</button>}

    {busy&&<div className="progress"><progress max={100} value={status?.percent||0}/><span>{status?.message||'Đang chuẩn bị…'}</span></div>}
    <footer>
      <button onClick={()=>void close()}>{busy?'Hủy xử lý':'Đóng'}</button>
      <button className="primary" disabled={busy||(!isEpub&&(!previewValid||!validChapterLimit(effectiveMaxChars)))||(!files.length&&!paste.trim())} onClick={()=>void run()}>
        {busy?'Đang nhập…':'Nhập truyện'}
      </button>
    </footer>
  </Modal>;
}
