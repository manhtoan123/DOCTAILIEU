import {isHeading} from './splitter';
/** Extra inference is allowed only for a file with an established chapter style.
 * Unique ordered runs and surrounding body reduce prose-reference false hits;
 * the result is still a proposal, reviewed before importing/appending. */
export async function scanGluedChapterNumbers(file:Blob,encoding:string,signal?:AbortSignal,onProgress?:(read:number,total:number)=>void):Promise<ReadonlySet<number>>{
 signal?.throwIfAborted();if(file.size<800)return new Set();
 const counts=new Uint8Array(100000),positions=new Uint32Array(100000),beforeDistance=new Uint32Array(100000),afterDistance=new Uint32Array(100000),clear=new Set<number>();
 const decoder=new TextDecoder(encoding,{fatal:true});let carry='',chars=0,last=-1,lastNumber=0,line='',overlong=false;
 const number=(value:string)=>Number(value.replace(/[０-９]/gu,c=>String(c.charCodeAt(0)-0xff10)));
 const finish=()=>{if(!overlong&&isHeading(line)){const match=/^第[ \t　]{0,4}([0-9０-９]{1,5})[ \t　]{0,4}章\S/u.exec(line.trim());if(match)clear.add(number(match[1]));}line='';overlong=false;};
 const append=(value:string)=>{if(!overlong){if(line.length+value.length>180){line='';overlong=true;}else line+=value;}};
 const feed=(text:string)=>{
  const value=carry+text,base=chars-carry.length;
  for(const match of value.matchAll(/第[ \t　]{0,4}([0-9０-９]{1,5})[ \t　]{0,4}章/gu)){
   const at=base+match.index!;if(at<=last)continue;const n=number(match[1]);
   if(last>=0&&counts[lastNumber]===1)afterDistance[lastNumber]=at-last;
   if(!counts[n]){positions[n]=at;beforeDistance[n]=last<0?0xffffffff:at-last;}counts[n]=Math.min(2,counts[n]+1);last=at;lastNumber=n;
  }
  chars+=text.length;carry=value.slice(-24);
  let start=0;for(let index=0;index<text.length;index++)if(text[index]==='\n'||text[index]==='\r'){append(text.slice(start,index));finish();start=index+1;}append(text.slice(start));
 };
 for(let offset=0;offset<file.size;offset+=262144){signal?.throwIfAborted();const bytes=await file.slice(offset,offset+262144).arrayBuffer();signal?.throwIfAborted();feed(decoder.decode(bytes,{stream:true}));onProgress?.(offset+bytes.byteLength,file.size);}
 signal?.throwIfAborted();feed(decoder.decode());finish();
 if(last>=0&&counts[lastNumber]===1)afterDistance[lastNumber]=chars-last;
 const eligible=new Set<number>();if(clear.size<4)return eligible;
 let run:number[]=[];const flush=()=>{if(run.length>=4)for(const n of run)eligible.add(n);run=[];};
 for(let n=1;n<counts.length;n++){
  if(counts[n]!==1||beforeDistance[n]<200||afterDistance[n]<200){flush();continue;}
  if(run.length&&(run.at(-1)!+1!==n||positions[n]<=positions[run.at(-1)!]))flush();run.push(n);
 }
 flush();return eligible;
}
