import type {ImportStatus} from '../services/txt-import-progress';

export default function ImportProgress({status}:{status?:ImportStatus}){
  const percent=Math.max(0,Math.min(100,status?.percent??0));
  const eta=status?.etaSeconds;
  const remaining=eta&&eta>=90?`${Math.round(eta/60)} phút`:`${eta} giây`;
  return <div className="progress" role="status">
    <progress max={100} value={percent} aria-label="Tiến độ xử lý"/>
    <span>{status?.message||'Đang chuẩn bị…'} · {Math.floor(percent)}%{eta!==undefined&&eta>0?` · Còn khoảng ${remaining}`:''}</span>
  </div>;
}
