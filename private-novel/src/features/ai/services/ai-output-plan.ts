import {splitAiText,AI_PART_CHARS,AI_TEXT_REQUEST_CHARS,type AiPart} from './ai-parts';
import type {AiDivisionReason} from './ai-division';

// Existing server cap; this planner leaves reasoning/headroom without changing
// generation settings. Estimates are conservative, not a provider tokenizer.
export const AI_PLANNED_OUTPUT_TOKENS=8192;
export const AI_WHOLE_CHAPTER_CHARS=3000;
const HEADROOM=2048,FIXED_OUTPUT=512;
export function estimatedAiOutputTokens(text:string){
 let tokens=FIXED_OUTPUT;
 for(const point of text)tokens+=/\p{Script=Han}/u.test(point)?3:/\s|\p{P}/u.test(point)?0.25:/[\x00-\x7f]/u.test(point)?0.5:1;
 return Math.ceil(tokens);
}
export function planAiText(text:string,protectedKeys:string[],parallel:boolean){
 if(text.length>0&&text.length<AI_WHOLE_CHAPTER_CHARS){
  const parts:AiPart[]=[{id:'0',text,start:0,end:text.length}];
  return {parts,plan:JSON.stringify(['txt-short-whole-1',[[0,text.length]]]),reason:'request_limit' as AiDivisionReason};
 }
 const maximum=parallel?AI_PART_CHARS:AI_TEXT_REQUEST_CHARS,available=AI_PLANNED_OUTPUT_TOKENS-HEADROOM-FIXED_OUTPUT;
 const budgetChars=(value:string)=>Math.max(1,Math.floor(value.length*available/Math.max(1,estimatedAiOutputTokens(value)-FIXED_OUTPUT)));
 let limit=Math.min(maximum,budgetChars(text)),parts:AiPart[];
 const refine=(part:AiPart,base=0):AiPart[]=>{
  if(estimatedAiOutputTokens(part.text)<=AI_PLANNED_OUTPUT_TOKENS-HEADROOM)return [{...part,start:base+part.start,end:base+part.end}];
  const children=splitAiText(part.text,protectedKeys,Math.min(part.text.length-1,budgetChars(part.text)));
  if(children.length<2)throw Error('Không thể chia theo ngân sách đầu ra an toàn.');
  return children.flatMap(child=>refine(child,base+part.start));
 };
 try{parts=splitAiText(text,protectedKeys,limit).flatMap(part=>refine(part));}catch(error){if(limit===maximum)throw error;limit=maximum;parts=splitAiText(text,protectedKeys,maximum);}
 // Refinement changes local tree IDs and contexts; restore one canonical root list.
 parts=parts.map((part,index)=>{let start=Math.max(0,part.start-300);if(/[\uDC00-\uDFFF]/.test(text[start])&&/[\uD800-\uDBFF]/.test(text[start-1]))start++;return {id:String(index),text:part.text,start:part.start,end:part.end,...(part.start?{context:text.slice(start,part.start)}:{})};});
 const budgetSplit=limit<maximum&&parts.length>1;
 const plan=JSON.stringify([budgetSplit?'txt-output-budget-1':parallel?'txt-parallel-1':'txt-whole-1',parts.map(part=>[part.start,part.end])]);
 return {parts,plan,reason:(budgetSplit?'request_limit':parallel?'parallel':'request_limit') as AiDivisionReason};
}
