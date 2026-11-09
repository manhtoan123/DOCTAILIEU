import {useEffect,useMemo,useRef,useState} from 'react';
import Dexie from 'dexie';
import {db,deleteBook} from '../../../core/db';
import {prepareBatchFiles,prepareBatchDocuments} from '../services/batch-import';
import DocumentPreview from './DocumentPreview';
import {commitAlbumImports,normalizeAlbum} from '../../library/services/albums';
import {readStoredAlbumRegistry} from '../../library/services/album-registry';
import {throwIfImportAborted} from '../services/importer';
import type {ImportStatus} from '../services/txt-import-progress';
import ImportProgress from './ImportProgress';
import ChapterSplitPreview,{ChapterLimit,validChapterLimit} from './ChapterSplitPreview';
import {Modal,errorText} from '../../../shared/components/common';

export default function BatchImportDialog({
  files,
  encoding,
  pattern,
  initialAlbum,
  initialMaxChars = 0,bookTitles,fixedEncoding,sourceNote,
  onClose,
  onDone
}:{
  files:File[];
  encoding:string;
  pattern:string;
  initialAlbum:string;
  initialMaxChars?:number;
  bookTitles?:string[];fixedEncoding?:string;sourceNote?:string;
  onClose:()=>void;
  onDone:(id:string)=>void;
}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [status,setStatus]=useState<ImportStatus>();
  const documents=useMemo(()=>files.filter(file=>/\.(pdf|docx)$/i.test(file.name)),[files]);
  const txtFiles=useMemo(()=>files.filter(file=>/\.txt$/i.test(file.name)),[files]),hasTxt=!!txtFiles.length;
  const [previewValid,setPreviewValid]=useState(false);
  const [prepared,setPrepared]=useState<Map<File,File>>(),[previewIndex,setPreviewIndex]=useState(0);
  const [selectedEncoding,setEncoding]=useState(fixedEncoding??encoding);
  const [selectedPattern,setPattern]=useState(pattern);
  const [effectiveMaxChars,setMaxChars]=useState(initialMaxChars);
  const [album,setAlbum]=useState(initialAlbum||'');
  const [albumList,setAlbumList]=useState<string[]>([]);
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

  async function run(){
    if(abort.current)return;
    setBusy(true);setError('');setStatus(undefined);const controller=new AbortController();abort.current=controller;
    let ids:string[]=[];let committed=false;
    try{
      normalizeAlbum(album);
      if(hasTxt&&!validChapterLimit(effectiveMaxChars))throw new Error('Giới hạn chương không hợp lệ.');
      if(documents.length&&!prepared){const next=await prepareBatchDocuments(files,setStatus,controller.signal);throwIfImportAborted(controller.signal);if(mounted.current)setPrepared(next);return;}
      if(hasTxt&&!previewValid)throw new Error('Chờ xem trước TXT hoàn tất trước khi nhập.');
      const result=await prepareBatchFiles(files,selectedEncoding,selectedPattern,true,setStatus,controller.signal,effectiveMaxChars,bookTitles,prepared);
      ids=result.ids;throwIfImportAborted(controller.signal);
      if(mounted.current)setStatus({message:'Đang lưu các truyện…',percent:99});
      let rejectCancellation!:(reason:Error)=>void;
      const cancellation=new Promise<never>((_,reject)=>{rejectCancellation=reject;});
      const publication=db.transaction('rw',[db.books,db.importJobs],async()=>{
        const transaction=Dexie.currentTransaction!;const cancel=()=>transaction.abort();
        controller.signal.addEventListener('abort',cancel,{once:true});
        const detach=()=>controller.signal.removeEventListener('abort',cancel);
        transaction.on('complete',detach);transaction.on('abort',()=>{detach();if(controller.signal.aborted)rejectCancellation(new Error('Đã hủy nhập.'));});
        throwIfImportAborted(controller.signal);
        await commitAlbumImports(ids,album);throwIfImportAborted(controller.signal);
      });
      await Promise.race([publication,cancellation]);
      committed=true;if(mounted.current)onDone(ids[0]);
    }catch(e){
      let message=errorText(e);
      const cleanup=committed?[]:await Promise.allSettled(ids.map(id=>deleteBook(id)));
      if(cleanup.some(result=>result.status==='rejected'))message+=' Không xóa được một số bản tạm; mở Cài đặt → Thông tin để xử lý bản nhập chưa hoàn tất.';
      if(mounted.current)setError(message);
    }finally{abort.current=undefined;if(mounted.current)setBusy(false);}
  }

  function close(){if(abort.current){abort.current.abort();return;}onClose();}

  return <Modal title="Nhập nhiều truyện" wide className="batch-import-dialog" onClose={()=>void close()}>
    <p>{files.length} file TXT / EPUB / PDF / DOCX → {files.length} truyện riêng. Mỗi file là một truyện, giữ thứ tự đã chọn và thêm cả lô sau một lần bấm nhập.</p>
    {sourceNote&&<p className="notice">{sourceNote}</p>}
    <p className="muted">Tối đa 100 file; TXT/PDF/DOCX 40 MiB/file, EPUB 256 MiB/file. Lô không EPUB tối đa 256 MiB; lô có EPUB tối đa 4 GiB, riêng nguồn PDF/DOCX tối đa 256 MiB và bản đọc xem trước tổng 128 MiB. Lỗi hoặc hủy: không lưu một phần lô, giữ truyện cũ.</p>
    {error&&<p className="notice error" role="alert">{error}</p>}
    {hasTxt&&<div className="form-grid">
      <label>Encoding các truyện
        <select disabled={busy||!!fixedEncoding} value={selectedEncoding} onChange={event=>{setPreviewValid(false);setEncoding(event.target.value);}}>
          <option value="auto">Tự nhận diện từng file</option>
          <option value="utf-8">UTF-8</option>
          <option value="gb18030">GB18030 / GBK</option>
          <option value="utf-16le">UTF-16 LE</option>
          <option value="utf-16be">UTF-16 BE</option>
        </select>
      </label>
      <ChapterLimit value={effectiveMaxChars} onChange={value=>{setPreviewValid(false);setMaxChars(value);}} disabled={busy}/>
    </div>}
    <label>Album (không bắt buộc)
      <input
        list="batch-album-list-options"
        value={album}
        onChange={e => setAlbum(e.target.value)}
        maxLength={120}
        disabled={busy}
        placeholder="Chọn hoặc nhập tên Album..."
      />
      <datalist id="batch-album-list-options">
        {albumList.map(a => <option key={a} value={a}/>)}
        {initialAlbum && !albumList.includes(initialAlbum) && <option value={initialAlbum}/>}
      </datalist>
    </label>
    {hasTxt&&<label>Regex nhận diện tùy chỉnh (TXT)<input disabled={busy} value={selectedPattern} onChange={event=>{setPreviewValid(false);setPattern(event.target.value);}}/></label>}
    {hasTxt&&<ChapterSplitPreview files={txtFiles} encoding={selectedEncoding} pattern={selectedPattern} maxChars={effectiveMaxChars} onValidity={setPreviewValid}/>}
    <section aria-label="Xem trước nhiều truyện"><ol>{files.map((file,index)=><li key={index}>{file.name}</li>)}</ol></section>
    {!!documents.length&&<p className="notice">PDF/DOCX giữ ảnh và file gốc, chỉ chia theo tiêu đề chương thật. Xem trước cả lô rồi chọn Nhập nhiều truyện; không cần nhập từng file.</p>}
    {prepared&&<><label>Tài liệu xem trước<select aria-label="Tài liệu xem trước" disabled={busy} value={previewIndex} onChange={e=>setPreviewIndex(Number(e.target.value))}>{documents.map((file,i)=><option key={i} value={i}>{file.name}</option>)}</select></label><DocumentPreview key={previewIndex} file={prepared.get(documents[previewIndex])!}/></>}
    <footer>
      {busy&&<ImportProgress status={status}/>}
      <button onClick={()=>void close()}>{busy?'Hủy xử lý':'Đóng'}</button>
      <button className="primary" disabled={busy||(hasTxt&&(!validChapterLimit(effectiveMaxChars)||(!previewValid&&(!documents.length||!!prepared))))} onClick={()=>void run()}>{busy?'Đang xử lý…':documents.length&&!prepared?'Xem trước các tài liệu':'Nhập nhiều truyện'}</button>
    </footer>
  </Modal>;
}
