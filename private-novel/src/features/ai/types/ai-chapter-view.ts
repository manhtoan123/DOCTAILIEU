import type {AiResultFacts} from '../services/ai-result-facts';
import type {AiPartsProgress} from '../services/ai-parts';
export type AiChapterPhase='idle'|'running'|'waiting'|'stopped'|'needs_config';
export interface AiChapterView extends AiResultFacts {model?:string;content:'absent'|'partial'|'complete';phase:AiChapterPhase;label:string;progress?:AiPartsProgress['leafProgress'];unavailable?:boolean;workId?:string}
interface Input {workId?:string;immediate?:boolean;model?:string;facts?:AiResultFacts;progress?:AiPartsProgress;complete:boolean;running:boolean;stopped:boolean;online:boolean;error?:string;configuration?:string;retryAt?:number;now:number;off?:boolean;unavailable?:boolean}
export function aiChapterView(input:Input):AiChapterView{
 const {model,facts,progress,complete,stopped,now}=input;
 const content=complete?'complete':progress?.text.trim()?'partial':'absent';
 const waitingAt=Math.max(input.retryAt??0,progress?.waitUntil??0);
 const phase:AiChapterPhase=complete?'idle':stopped?'stopped':input.configuration&&input.error?'needs_config':(!input.online&&(input.running||!!input.error||waitingAt>now)||waitingAt>now||!!input.error)?'waiting':input.running?'running':'idle';
 const label=input.unavailable?'Hết truyện':complete?'Đã xong':phase==='stopped'?'Đã dừng':phase==='needs_config'?'Cần sửa cấu hình':phase==='waiting'?(!input.online?'Chờ kết nối mạng':waitingAt>now?`Chờ thử lại · ${Math.max(1,Math.ceil((waitingAt-now)/1000))} giây`:input.error?'Chưa hoàn tất — cần thử lại':'Chờ điều kiện dịch'):phase==='running'?'Đang dịch':input.off?'Đã tắt dịch sẵn':'Chưa dịch';
 return {model,content,phase,label,workId:input.workId,unavailable:input.unavailable,...facts,progress:complete?(facts?.division?{done:facts.division.parts,total:facts.division.parts}:undefined):progress?.leafProgress};
}
