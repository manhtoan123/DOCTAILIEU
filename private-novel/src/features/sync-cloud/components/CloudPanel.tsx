import {useEffect,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {syncLocalBooks,listCloudBooks,downloadCloudBook,isPublicCloudLibrary,type CloudBook} from '../services/cloud-client';
import {getCloudDeviceToken,forgetCloudDevice,buildCloudDeviceLink} from '../services/cloud-device';
import {errorText} from '../../../shared/components/common';
export default function CloudPanel({status,onSync,onRead}:{status:string;onSync:()=>Promise<void>;onRead?:(id:string)=>void}){
  const [books,setBooks]=useState<CloudBook[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const[publicMode,setPublicMode]=useState(isPublicCloudLibrary);
  const token=useLiveQuery(()=>getCloudDeviceToken(),[]);
  useEffect(()=>{
    let alive=true;

    setBusy(true);
    void listCloudBooks().then(result=>{if(alive){setBooks(result);setPublicMode(isPublicCloudLibrary());setMessage('Đã lấy danh sách truyện trên cloud.');}}).catch(error=>{if(alive)setMessage(errorText(error));}).finally(()=>{if(alive)setBusy(false);});
    return()=>{alive=false;};
  },[token]);
  async function refresh(){setBusy(true);try{setBooks(await listCloudBooks());setPublicMode(isPublicCloudLibrary());setMessage('Đã lấy danh sách truyện trên cloud.');}catch(error){setMessage(errorText(error));}finally{setBusy(false);}}
  async function download(book:CloudBook,read=false){setBusy(true);try{const result=await downloadCloudBook(book);setMessage(result==='added'?`Đã tải ${book.title} về thiết bị.`:'Truyện đã có trên thiết bị; giữ nguyên bản local.');if(read)onRead?.(book.id);}catch(error){setMessage(errorText(error));}finally{setBusy(false);}}
  async function copyLink(){try{const current=await getCloudDeviceToken();if(!current)throw new Error('Mở liên kết kết nối ban đầu trên thiết bị này trước.');await navigator.clipboard.writeText(buildCloudDeviceLink(current));setMessage('Đã sao chép liên kết để mở trên thiết bị khác. Liên kết này cấp quyền vào kho của bạn.');}catch(error){setMessage(errorText(error));}}
  async function disconnect(){setBusy(true);try{await forgetCloudDevice();setBooks([]);setMessage('Đã ngắt kết nối kho trên thiết bị này. Truyện local vẫn được giữ.');}catch(error){setMessage(errorText(error));}finally{setBusy(false);}}
  return <section aria-label="Kho truyện cloud"><h1>Kho truyện cloud</h1><div className="panel">
    <p>{publicMode?'Kho chung dùng được ngay. Mọi người có URL đều có quyền đọc, thêm và xóa truyện.':token?'Thiết bị đã kết nối. Truyện mới được tự đưa lên kho R2.':'Đang kiểm tra kho chung…'}</p>
    <p>Bản đầu lưu chữ, chương và Name tại lúc thêm truyện. File gốc, từ điển, ảnh EPUB, vị trí đọc và các sửa đổi về sau chưa đồng bộ.</p>
    <p>Giới hạn: 64 MiB mỗi bản truyện và 9 GB cho kho này.</p>
    <div className="center-actions"><button disabled={busy} onClick={async()=>{setMessage('');setBusy(true);try{await onSync();}finally{setBusy(false);}}}>Đồng bộ tất cả truyện</button><button disabled={busy} onClick={()=>void refresh()}>Lấy danh sách cloud</button>
    {token&&!publicMode&&<><button disabled={busy} onClick={()=>void copyLink()}>Kết nối thiết bị khác</button><button disabled={busy} onClick={()=>void disconnect()}>Ngắt kết nối thiết bị</button></>}
    </div><p role="status">{[message,status].filter(Boolean).join(' ')||'Chưa kết nối kho cloud.'}</p>
  </div><div className="panel">{books.map(book=><div className="restore-row" key={book.id}><span>{book.title} · {(book.bytes/1048576).toFixed(1)} MiB</span><div>{onRead&&<button disabled={busy} onClick={()=>void download(book,true)}>Đọc truyện</button>}<button disabled={busy} onClick={()=>void download(book)}>Tải về thiết bị</button></div></div>)}</div></section>;
}
export {syncLocalBooks};
