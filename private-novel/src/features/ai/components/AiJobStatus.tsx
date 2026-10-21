import type {AiPartsProgress} from '../services/ai-parts';
import {aiModelLabel} from '../services/ai-hybrid-prompt';
import {aiParallelStatus} from '../types/ai-parallel-status';
export interface AiJobView {
  target:string;status:string;model?:string;progress?:AiPartsProgress;error?:string;retryIn?:number;configuration?:'keys'|'settings';history?:string[];errorCode?:string;requestId?:string;
}
export function AiJobStatus({job,onRetry,onStop,onPauseRetry}:{job:AiJobView;onRetry?:()=>void;onStop?:()=>void;onPauseRetry?:()=>void}){
  const p=job.progress,parallel=aiParallelStatus(p);
  return <section className="ai-job-summary" aria-label="Tình trạng dịch AI">
    <strong>{job.target}</strong>
    {p?.half===2&&p.halfModels&&<p>Nửa đầu: ✓ Hoàn tất · {aiModelLabel(p.halfModels[0])}</p>}
    <p role="status">{job.status}{p&&<>{job.status?' · ':''}{parallel.running}</>}</p>
    {job.model&&<p>{p?.half?`Nửa ${p.half}/2 · `:''}{job.model}</p>}
    {p&&<><progress aria-label="Tiến độ nửa đang dịch" max={p.total||1} value={p.done}/><small>{p.done}/{p.total} phần hoàn tất</small>{parallel.keys&&<small> · {parallel.keys}</small>}</>}
    {job.error&&<p className="ai-job-error">{job.error}</p>}{job.configuration&&<small>{job.configuration==='keys'?'Kiểm tra API keys bên dưới trước khi tiếp tục.':'Kiểm tra model và prompt bên dưới trước khi tiếp tục.'}</small>}
    {job.retryIn!==undefined&&<p>Tự thử lại sau <span aria-live="off">{job.retryIn}</span> giây</p>}
    <div className="ai-actions">{onRetry&&<button onClick={onRetry}>{p?.done||p?.half===2?'Tiếp tục phần còn thiếu':'Thử lại AI'}</button>}{onPauseRetry&&<button onClick={onPauseRetry}>Dừng tự thử lại</button>}{onStop&&<button onClick={onStop}>Dừng dịch</button>}</div>
    {job.error&&<small>Giữ phần hoàn tất trong phiên. Khi tải lại, ứng dụng dùng những phần đã lưu thành công trên máy.</small>}
    {(job.history?.length||job.errorCode)&&<details className="ai-job-details"><summary>Chi tiết lượt dịch</summary>{!!job.history?.length&&<p>{job.history.join(' → ')}</p>}{job.errorCode&&<p>Mã lỗi: <code>{job.errorCode}</code></p>}{job.requestId&&<p>Mã yêu cầu: <code>{job.requestId}</code></p>}{!!p?.recoveryPasses&&<p>Phục hồi {p.recoveryPasses} phần.</p>}</details>}
  </section>;
}
