import {useEffect,useRef,useState} from 'react';
import Dexie from 'dexie';
import {db,deleteBook} from '../../../core/db';
import {prepareBatchFiles} from '../services/batch-import';
import {commitAlbumImports,normalizeAlbum} from '../../library/services/albums';
import {readStoredAlbumRegistry} from '../../library/services/album-registry';
import {throwIfImportAborted,type ImportStatus} from '../services/importer';
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
    setBusy(true);setError('');const controller=new AbortController();abort.current=controller;
    let ids:string[]=[];let committed=false;
    try{
      normalizeAlbum(album);
      if(!validChapterLimit(effectiveMaxChars))throw new Error('Giới hạn chương không hợp lệ.');
      const result=await prepareBatchFiles(files,selectedEncoding,selectedPattern,true,setStatus,controller.signal,effectiveMaxChars,bookTitles);
      ids=result.ids;throwIfImportAborted(controller.signal);
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

  return <Modal title="Nhập nhiều truyện" wide onClose={()=>void close()}>
    <p>{files.length} file TXT / EPUB → {files.length} truyện riêng. Tách chương bên trong từng file và thêm vào tủ sách sau một lần bấm nhập.</p>
    {sourceNote&&<p className="notice">{sourceNote}</p>}
    <p className="muted">Tối đa 100 file, TXT 40 MiB / EPUB 256 MiB và lô có EPUB tối đa 4 GiB (chỉ TXT: 256 MiB). Bố cục sau xử lý tối đa 128 MiB mỗi EPUB. Nếu xử lý lỗi hoặc bị hủy, xóa bản tạm của lô này và giữ truyện cũ.</p>
    {error&&<p className="notice error" role="alert">{error}</p>}
    <div className="form-grid">
      <label>Encoding các truyện
        <select disabled={busy||!!fixedEncoding} value={selectedEncoding} onChange={event=>setEncoding(event.target.value)}>
          <option value="utf-8">UTF-8</option>
          <option value="gb18030">GB18030 / GBK</option>
          <option value="utf-16le">UTF-16 LE</option>
          <option value="utf-16be">UTF-16 BE</option>
        </select>
      </label>
      <ChapterLimit value={effectiveMaxChars} onChange={setMaxChars} disabled={busy}/>
    </div>
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
    <label>Regex nhận diện tùy chỉnh<input disabled={busy} value={selectedPattern} onChange={event=>setPattern(event.target.value)}/></label>
    <section aria-label="Xem trước nhiều truyện"><ol>{files.map((file,index)=><li key={index}>{file.name}</li>)}</ol></section>
    <ChapterSplitPreview files={files.filter(file=>/\.txt$/i.test(file.name))} encoding={selectedEncoding} pattern={selectedPattern} maxChars={effectiveMaxChars}/>
    {busy&&<p role="status">{status?.message||'Đang xử lý…'}</p>}
    <footer>
      <button onClick={()=>void close()}>{busy?'Hủy xử lý':'Đóng'}</button>
      <button className="primary" disabled={busy||!validChapterLimit(effectiveMaxChars)} onClick={()=>void run()}>{busy?'Đang nhập…':'Nhập nhiều truyện'}</button>
    </footer>
  </Modal>;
}
