/** Local execution facts, never inferred from model text or the current switch. */
export const AI_DIVISION_REASONS=['parallel','request_limit','output_limit','untranslated','timeout','transient','resumed','legacy','hybrid','mapping'] as const;
export type AiDivisionReason=typeof AI_DIVISION_REASONS[number];
export interface AiDivision {version:1;parts:number;reasons:AiDivisionReason[]}
export function readAiDivision(value:unknown):AiDivision|undefined{
 if(!value||typeof value!=='object')return;
 const v=value as AiDivision;
 if(v.version!==1||!Number.isSafeInteger(v.parts)||v.parts<1||v.parts>4096||!Array.isArray(v.reasons)||v.reasons.length>AI_DIVISION_REASONS.length||v.reasons.some(r=>!AI_DIVISION_REASONS.includes(r))||v.parts>1&&!v.reasons.length)return;
 return {version:1,parts:v.parts,reasons:[...new Set(v.reasons)]};
}
export function combineAiDivision(items:({division?:AiDivision})[],reason?:AiDivisionReason):AiDivision{
 return {version:1,parts:items.reduce((sum,item)=>sum+(item.division?.parts??1),0),reasons:[...new Set([...(reason?[reason]:[]),...items.flatMap(item=>item.division?.reasons??[])])]};
}
/** Split IDs are stable source-tree paths, so revisiting a saved branch is not another part. */
export function aiDivisionAt(id:string,completed:Map<string,{division?:AiDivision}>,splits:Map<string,AiDivisionReason>):AiDivision{
 const known=completed.get(id)?.division;if(known)return known;
 const reason=splits.get(id);if(!reason)return {version:1,parts:1,reasons:[]};
 return combineAiDivision([{division:aiDivisionAt(id+'/0',completed,splits)},{division:aiDivisionAt(id+'/1',completed,splits)}],reason);
}
const LABELS:Record<AiDivisionReason,string>={parallel:'Đã bật chia song song khi bắt đầu dịch',request_limit:'Nguồn vượt giới hạn mỗi yêu cầu',output_limit:'AI trả bản dịch bị cắt',untranslated:'AI còn bỏ sót đoạn chưa dịch',timeout:'Yêu cầu dịch quá thời gian',transient:'Lỗi kết nối hoặc dịch vụ tạm thời',resumed:'Tiếp tục các phần phục hồi đã lưu',legacy:'Tiếp tục bố cục phần dịch cũ',hybrid:'Chế độ dịch kết hợp cũ',mapping:'Bản dịch EPUB chưa đúng cấu trúc'};
export function aiDivisionReasonText(division:AiDivision){return division.reasons.map(reason=>LABELS[reason]).join('; ');}
