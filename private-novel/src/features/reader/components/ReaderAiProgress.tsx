import type {AiPartsProgress} from '../../ai/services/ai-parts';
import {aiParallelStatus} from '../../ai/types/ai-parallel-status';
interface Props {progress:AiPartsProgress;error:string;waitingForSpeech:boolean;onStop:()=>void}
/** This view never starts or cancels work directly. */
export function ReaderAiProgress({progress,error,waitingForSpeech,onStop}:Props){
 const parallel=aiParallelStatus(progress);
 return <section className="ai-part-progress" aria-label="Tiến độ dịch chương">
  <div>
  <strong>{progress.half?`Nửa ${progress.half}/2 · `:''}
  {parallel.running}</strong>
  <small>{progress.leafProgress?`Đã xong ${progress.leafProgress.done}/${progress.leafProgress.total} phần`:'Chưa có dữ liệu tiến độ từng phần'}</small>
  <span>{error?'Giữ phần hoàn tất trong phiên; tải lại sẽ dùng những phần đã lưu thành công.':progress.waitUntil&&progress.waitUntil>Date.now()?`API đang bận · Chờ ${Math.max(1,Math.ceil((progress.waitUntil-Date.now())/1000))} giây`:'Đang hoàn thiện bản dịch…'}</span>{!error&&parallel.keys&&<small>{parallel.keys}</small>}
  {!error&&!!progress.retrying?.length&&<small>Đang phục hồi phần {progress.retrying.join(', ')} · Giữ các phần đã dịch.</small>}
  {waitingForSpeech&&<small>Đã đọc hết phần đã dịch — sẽ tự đọc tiếp khi có phần mới.</small>}
  {progress.text&&<small>Bạn đang đọc phần đã dịch. Chương sẽ hoàn tất khi đủ mọi phần.</small>}</div>
  <progress aria-label="Số phần đã dịch" max={progress.leafProgress?.total||1} value={progress.leafProgress?.done}/>
  <button onClick={onStop}>Dừng chương này</button>
  </section>;
}
