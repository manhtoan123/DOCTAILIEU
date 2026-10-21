import type {AiPartsProgress} from '../services/ai-parts';
/** Truthful UI text for AI part translation: parallel claims require runtime lease evidence. */
export interface AiParallelStatusText {running:string;keys?:string;verifiedTwoKeys:boolean}
export function aiParallelStatus(progress?:AiPartsProgress):AiParallelStatusText{
 if(!progress)return {running:'',verifiedTwoKeys:false};
 const activeLeases=progress.activeLeases??0;
 const verifiedTwoKeys=activeLeases>=2;
 // Direct evidence of two simultaneous distinct leases wins over a possibly stale capacity snapshot.
 const keys=verifiedTwoKeys?'2 key đang chạy':progress.keysAvailable===1?'Đang chạy tuần tự — 1 key khả dụng':undefined;
 return {running:`Đang chạy ${progress.active.length}/${progress.total} phần`,keys,verifiedTwoKeys};
}
