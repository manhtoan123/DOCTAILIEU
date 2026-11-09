import {useEffect,useState} from 'react';
import {readAiAttemptTimeline,type AiAttemptTimeline} from '../services/ai-metrics';
import {aiModelLabel} from '../services/ai-hybrid-prompt';
import {friendlyAiError} from '../services/ai-translate';
import '../styles/ai-attempt-history.css';
const clock=(at:number)=>new Date(at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const seconds=(ms:number)=>`${(ms/1000).toLocaleString('vi-VN',{maximumFractionDigits:1})} giây`;
/** Request-local observations only. A cached chapter has no invented request clock. */
export function AiAttemptHistory({workId,label}:{workId?:string;label:string}){
 const [open,setOpen]=useState(false),[timeline,setTimeline]=useState<AiAttemptTimeline>(),[now,setNow]=useState(Date.now());
 useEffect(()=>{const refresh=()=>setTimeline(readAiAttemptTimeline(workId)),changed=(event:Event)=>{if((event as CustomEvent<string>).detail===workId)refresh();};refresh();window.addEventListener('reader-ai-attempt',changed);return()=>window.removeEventListener('reader-ai-attempt',changed);},[workId]);
 const visibleTimeline=timeline?.workId===workId?timeline:undefined;
 const running=visibleTimeline?.attempts.some(row=>row.status==='running')??false;
 useEffect(()=>{if(!open||!running)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[open,running,workId]);
 return <details className="ai-attempt-history" aria-label={`Lịch sử model ${label.toLocaleLowerCase('vi-VN')}`} open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>Lịch sử lượt gọi model{visibleTimeline?.attempts.length?` (${visibleTimeline.attempts.length})`:''}</summary>
  {!visibleTimeline?.attempts.length?<p>Chưa có lịch sử request của lượt này trên thiết bị. Bản cache hoặc phiên cũ không có thời gian quan sát.</p>:<>
   <p>Mỗi dòng là một request từ trình đọc, gồm các lần thử lại; không phải số lần máy chủ đổi key. Thời lượng request có thể chồng nhau khi dịch song song.</p>
   {visibleTimeline.truncated&&<p>Chỉ giữ tối đa 128 lượt gần nhất của phiên dịch này.</p>}
   <ol>{visibleTimeline.attempts.map(row=><li key={row.id}>
    <strong>{aiModelLabel(row.model)}</strong><span> · Lượt {row.id} · Phần {row.partPath}</span>
    <span className="ai-attempt-status">{row.status==='running'?'Đang gọi':row.status==='complete'?'Đã nhận phản hồi':row.status==='cancelled'?'Đã hủy':'Thất bại'}</span>
    <dl><dt>Bắt đầu</dt><dd><time dateTime={new Date(row.startedAt).toISOString()}>{clock(row.startedAt)}</time></dd><dt>Kết thúc</dt><dd>{row.endedAt===undefined?'Chưa kết thúc':<time dateTime={new Date(row.endedAt).toISOString()}>{clock(row.endedAt)}</time>}</dd><dt>Thời lượng</dt><dd>{row.durationMs!==undefined?seconds(row.durationMs):row.status==='running'?`${seconds(Math.max(0,now-row.startedAt))} (đang chạy)`:'Chưa xác định'}</dd></dl>
    {row.errorCode&&<p>{friendlyAiError(row.errorCode)} <code>{row.errorCode}</code>{row.httpStatus?` · HTTP ${row.httpStatus}`:''}</p>}
   </li>)}</ol>
  </>}
 </details>;
}
