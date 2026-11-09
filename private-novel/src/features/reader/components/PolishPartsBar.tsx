import type {AiPartsProgress} from '../../ai/services/ai-parts';

/** Root positions stay stable when a request is split internally or retried. */
export function PolishPartsBar({progress,busy}:{progress:AiPartsProgress;busy:boolean}){
 const {total,done}=progress;
 if(total<1)return null;
 const completed=new Set(progress.completedParts??[]),active=new Set(busy?progress.active:[]);
 const skipped=new Set(progress.polishSkipped?.map(part=>part.part));
 return <div className="polish-parts">
  <div className="polish-parts-track" role="progressbar" aria-label="Tiến độ trau chuốt từng phần" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done+skipped.size} aria-valuetext={`${done}/${total} phần hoàn tất${skipped.size?`, ${skipped.size} bỏ qua`:''}`}>
   {Array.from({length:total},(_,i)=>{const position=i+1,state=completed.has(position)?'done':active.has(position)?'active':skipped.has(position)?'skipped':'pending';return <span key={position} data-state={state} title={`Phần ${position}/${total}: ${state==='done'?'Đã hoàn tất':state==='active'?'Đang chạy':state==='skipped'?'Giữ bản Convert':'Chưa hoàn tất'}`} aria-hidden="true"/>;})}
  </div>
  <small>{done}/{total} phần xong{skipped.size>0&&` · ${skipped.size} giữ Convert`}{busy&&!!progress.activeLeases&&` · ${progress.activeLeases} luồng`}</small>
 </div>;
}
