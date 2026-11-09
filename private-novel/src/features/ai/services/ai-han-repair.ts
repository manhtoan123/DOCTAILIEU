import {parseNameValue} from '../../names-convert/services/name-images';
export interface AiHanRepair {version:1;original:string;count:number}
export interface AiHanRepairSpan {id:string;text:string;before:string;after:string;start:number;end:number;json:boolean}
export interface AiHanRepairPlan {original:string;spans:AiHanRepairSpan[]}
const HAN=/\p{Script=Han}/u;
const safeReplacement=(value:unknown):value is string=>typeof value==='string'&&value.length<=256&&!!value.trim()&&!/[\p{Script=Han}\u0000-\u001f\u007f-\u009f\u2028\u2029<>\[\]{}`*_]/u.test(value);
interface Node {text:string;start:number;end:number;json:boolean;bounds:number[]}
/** Keep original JSON syntax and key bytes outside the selected value spans. */
function nodes(original:string):Node[]|undefined{
 let start=0,end=original.length;while(/\s/u.test(original[start]??'')&&start<end)start++;while(end>start&&/\s/u.test(original[end-1]))end--;
 const fenced=/^```(?:json)?\s*\n?([\s\S]*?)\s*```$/u.exec(original.slice(start,end));if(fenced){start+=fenced[0].indexOf(fenced[1]);end=start+fenced[1].length;}
 const raw=original.slice(start,end);
 if(!raw.startsWith('{')&&!raw.startsWith('"'))return [{text:original,start:0,end:original.length,json:false,bounds:Array.from({length:original.length+1},(_,i)=>i)}];
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{return [{text:original,start:0,end:original.length,json:false,bounds:Array.from({length:original.length+1},(_,i)=>i)}];}
 if(typeof parsed!=='string'&&(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!Object.values(parsed).every(value=>typeof value==='string')))return;
 const tokens=[...raw.matchAll(/"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/gu)];
 if(typeof parsed!=='string'&&tokens.length!==Object.keys(parsed).length*2)return;
 const values=typeof parsed==='string'?tokens:tokens.filter((_,index)=>index%2===1),out:Node[]=[];
 for(const match of values){const token=match[0],base=start+match.index!;let text='',i=1;const bounds=[base+1];
  while(i<token.length-1){const begin=i;let value:string;if(token[i]==='\\'){if(token[i+1]==='u'){value=String.fromCharCode(parseInt(token.slice(i+2,i+6),16));i+=6;}else{value=JSON.parse('"'+token.slice(i,i+2)+'"');i+=2;}}else{value=String.fromCodePoint(token.codePointAt(i)!);i+=value.length;}text+=value;for(let unit=1;unit<=value.length;unit++)bounds.push(unit===value.length?base+i:base+begin+unit);}
  out.push({text,start:base+1,end:base+token.length-1,json:true,bounds});
 }
 return out;
}
export function planAiHanRepair(original:string,allowedNameValues:readonly string[]=[]):AiHanRepairPlan|undefined{
 if(typeof original!=='string'||original.length>128000)return;if(!HAN.test(original)&&!original.includes('\\u'))return {original,spans:[]};const values=nodes(original);if(!values)return;const spans:AiHanRepairSpan[]=[];let count=0;
 const names=[...new Set(allowedNameValues.map(value=>parseNameValue(value).label).filter(label=>label&&HAN.test(label)))].sort((a,b)=>b.length-a.length);
 for(const node of values){const protectedRanges=new Uint8Array(node.text.length);for(const label of names){let at=0;while((at=node.text.indexOf(label,at))!==-1){protectedRanges.fill(1,at,at+label.length);at+=label.length;}}for(const tag of node.text.matchAll(/<[^>]*>|\[i\][\s\S]*?\[\/\]/gu))protectedRanges.fill(1,tag.index!,tag.index!+tag[0].length);
  const protectedAt=(index:number)=>protectedRanges[index]===1;let runStart=-1;
  const add=(end:number)=>{if(runStart<0)return;const text=node.text.slice(runStart,end);count+=Array.from(text).length;spans.push({id:String(spans.length),text,before:Array.from(node.text.slice(0,runStart)).slice(-100).join(''),after:Array.from(node.text.slice(end)).slice(0,100).join(''),start:node.bounds[runStart],end:node.bounds[end],json:node.json});runStart=-1;};
  let index=0;for(const point of node.text){if(HAN.test(point)&&!protectedAt(index)){if(runStart<0)runStart=index;}else add(index);index+=point.length;}add(index);if(spans.length>32||count>128)return;
 }
 return {original,spans};
}
export function applyAiHanRepair(plan:AiHanRepairPlan,replacements:unknown):string|undefined{
 if(!replacements||typeof replacements!=='object'||Array.isArray(replacements))return;const values=replacements as Record<string,unknown>,keys=Object.keys(values);if(keys.length!==plan.spans.length||keys.some(key=>!plan.spans.some(span=>span.id===key)))return;
 let result=plan.original;for(const span of [...plan.spans].reverse()){const value=values[span.id];if(!safeReplacement(value))return;let replacement:string=value;
  const before=Array.from(span.before).at(-1)??'',after=Array.from(span.after)[0]??'';if(/[\p{Script=Latin}\p{N}\p{M}]/u.test(before)&&/^[\p{Script=Latin}\p{N}]/u.test(replacement))replacement=' '+replacement;if(/[\p{Script=Latin}\p{N}\p{M}]/u.test(after)&&/[\p{Script=Latin}\p{N}\p{M}]$/u.test(replacement))replacement+=' ';
  if(!safeReplacement(replacement))return;result=result.slice(0,span.start)+(span.json?JSON.stringify(replacement).slice(1,-1):replacement)+result.slice(span.end);
 }return result.length<=128000&&result!==plan.original?result:undefined;
}
/** Bounded edit validation permits only Han deletions paired with non-Han insertions.
 * Equal Han (including protected Name captions) remains valid without a Name table. */
function changedHanOnly(original:string,result:string,expected:number):boolean{
 let visits=0,checks=0;const seen=new Set<string>();
 const walk=(a:number,b:number,count:number,han:number):boolean=>{if(++visits>4096)return false;while(a<original.length&&b<result.length&&original.codePointAt(a)===result.codePointAt(b)){const width=String.fromCodePoint(original.codePointAt(a)!).length;a+=width;b+=width;}if(a===original.length&&b===result.length)return count===expected;if(count>=expected||!HAN.test(String.fromCodePoint(original.codePointAt(a)??0)))return false;const state=`${a}/${b}/${count}/${han}`;if(seen.has(state))return false;seen.add(state);
  const ends:number[]=[];let finish=a,added=0;while(finish<original.length){const point=String.fromCodePoint(original.codePointAt(finish)!);if(!HAN.test(point)||han+ ++added>128)break;finish+=point.length;ends.push(finish);}
  let limit=b;while(limit<result.length&&limit-b<258&&!HAN.test(String.fromCodePoint(result.codePointAt(limit)!)))limit+=String.fromCodePoint(result.codePointAt(limit)!).length;
  for(let end=b+1;end<=limit;end++){const replacement=result.slice(b,end);if(!safeReplacement(replacement))continue;for(let index=0;index<ends.length;index++){if(++checks>100000)return false;const next=ends[index];if((next===original.length&&end===result.length||original.codePointAt(next)===result.codePointAt(end))&&walk(next,end,count+1,han+index+1))return true;}}
  return false;
 };return walk(0,0,0,0);
}
/** With Names available, every changed byte must belong to an exact planned span. */
function matchesPlannedSpans(plan:AiHanRepairPlan,result:string):boolean{
 let checks=0;const seen=new Set<string>();
 const walk=(index:number,originalAt:number,resultAt:number):boolean=>{if(++checks>10000)return false;if(index===plan.spans.length)return result.slice(resultAt)===plan.original.slice(originalAt);const span=plan.spans[index],prefix=plan.original.slice(originalAt,span.start);if(!result.startsWith(prefix,resultAt))return false;const start=resultAt+prefix.length,state=index+'/'+start;if(seen.has(state))return false;seen.add(state);const suffix=plan.original.slice(span.end,plan.spans[index+1]?.start??plan.original.length);
  for(let end=start+1;end<=Math.min(result.length,start+(span.json?1536:256));end++){if(++checks>10000)return false;if(!result.startsWith(suffix,end))continue;let value:unknown=result.slice(start,end);if(span.json)try{value=JSON.parse('"'+value+'"');}catch{continue;}if(safeReplacement(value)&&walk(index+1,span.end,end))return true;}return false;
 };return walk(0,0,0);
}
export function readAiHanRepair(value:unknown,result:string,allowedNameValues?:readonly string[]):AiHanRepair|undefined{
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof result!=='string'||result.length>128000)return;const row=value as Record<string,unknown>;if(row.version!==1||typeof row.original!=='string'||row.original.length>128000||row.original===result||!Number.isInteger(row.count)||Number(row.count)<1||Number(row.count)>32)return;
 const before=nodes(row.original),after=nodes(result);if(!before||!after||before.length!==after.length)return;
 const scaffold=(text:string,parts:Node[])=>{let at=0,out='';for(const part of parts){out+=text.slice(at,part.start)+'\u0000';at=part.end;}return out+text.slice(at);};if(scaffold(row.original,before)!==scaffold(result,after))return;
 // Join with a sentinel that cannot occur in any validated replacement.
 const old=before.map(node=>node.text).join('\u0000'),next=after.map(node=>node.text).join('\u0000');if(!changedHanOnly(old,next,Number(row.count)))return;
 if(allowedNameValues){const plan=planAiHanRepair(row.original,allowedNameValues);if(!plan||plan.spans.length!==row.count||!matchesPlannedSpans(plan,result))return;}
 return {version:1,original:row.original,count:Number(row.count)};
}
