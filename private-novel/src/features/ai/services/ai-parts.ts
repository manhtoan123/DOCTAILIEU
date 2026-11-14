import {combineAiHanAudits} from './ai-han-audit';
import {AiTranslateClientError} from './ai-translate';
import {hasUnknownAiParts} from './ai-leaf-progress';
import {combineAiExecution} from './ai-execution';
import {aiCompletedPrefix} from './ai-part-prefix';
import type {AiLeaseInfo,AiTranslateClientResponse} from './ai-translate';
import {isTransientAiFailure,mayRetryAiModel,waitForAiRetry} from './ai-recovery';
import {protectAiBoundary} from './ai-boundary';
import {combineAiDivision,type AiDivision,type AiDivisionReason} from './ai-division';
import type {AiRequestLimit} from './ai-scheduler';
import {combinePolishTerms,type PolishFallbackRange,type PolishTerm,type SkippedPolishPart} from './polish-output';
export interface AiPart {id:string;text:string;context?:string;start:number;end:number}
export interface AiPartsProgress {polishModels?:string[];polishTerms?:PolishTerm[];polishSkipped?:SkippedPolishPart[];/** Fallback offsets in completedText. */polishFallback?:PolishFallbackRange[];/** One-based accepted root positions, including noncontiguous parallel results. */completedParts?:number[];/** Accepted contiguous whole source roots; excludes speculative streamed text. */completedSourceEnd?:number;completedText?:string;previewText?:string;total:number;done:number;active:number[];text:string;nodes?:string[];parallel:number;retrying?:number[];waitUntil?:number;recoveryPasses?:number;half?:1|2;halfModels?:[string,string];sample?:string;promptPreview?:string;
 division?:AiDivision;
 leafProgress?:import('./ai-leaf-progress').AiLeafProgress;
 /** Runtime evidence only: no field below is inferred from a configured maximum. */
 activeRequests?:number;activeLeases?:number;parallelLeases?:number;leaseHashes?:string[];keySlots?:number[];keysAvailable?:number}
export interface AiPartRecord {id:string;response:AiTranslateClientResponse}
export interface PolishPartsResume {
 retained:ReadonlyMap<string,AiTranslateClientResponse>;
 skipped?:SkippedPolishPart[];
}
/** Safe trace: lease ids are server-derived hashes, never credential material. */
export interface AiPartsTrace {type:'start'|'lease'|'end'|'error';jobId?:string;partId:string;at:number;activeRequests:number;parallel:number;requestId?:string;leaseIdHash?:string;keySlot?:number}
let traceSink:((event:AiPartsTrace)=>void)|undefined;
/** Test/diagnostic instrumentation only; no production caller is required. */
export function setAiPartsTrace(sink?:((event:AiPartsTrace)=>void)|undefined):void {traceSink=sink;}
export const AI_PART_CHARS=1800;
export const AI_TEXT_REQUEST_CHARS=32000;
export {aiQuotaFeedback,withAiRequestCapacity,type AiPartsControl} from './ai-scheduler';
import type {AiPartsControl} from './ai-scheduler';
/** Stable, lossless source spans. Prefer paragraphs/sentences/words without dropping separators. */
export function splitAiText(text:string,protectedKeys:string[]=[],maxChars=AI_PART_CHARS):AiPart[]{
 if(!Number.isSafeInteger(maxChars)||maxChars<1||maxChars>AI_TEXT_REQUEST_CHARS)throw Error("Giới hạn phần dịch không hợp lệ.");
 const parts:AiPart[]=[];let start=0;
 while(start<text.length){
  const remaining=text.length-start,target=Math.ceil(remaining/Math.ceil(remaining/maxChars));let end=Math.min(text.length,start+target);
  if(end<text.length){const segment=text.slice(start,end),matches=[...segment.matchAll(/\n|[。！？!?](?:[”’」』"])?|[.!?]\s|\s+/g)],cut=matches.filter(m=>m.index!>=target/2).at(-1);if(cut)end=start+cut.index!+cut[0].length;if(/[\uD800-\uDBFF]/.test(text[end-1])&&/[\uDC00-\uDFFF]/.test(text[end]))end--;}
  if(end<text.length){end=protectAiBoundary(text,end,protectedKeys,start,Math.min(text.length,start+maxChars));if(end<=start)throw Error('Các Name chồng lấn vượt giới hạn chia đoạn AI.');}
  let contextStart=Math.max(0,start-300);if(/[\uDC00-\uDFFF]/.test(text[contextStart])&&/[\uD800-\uDBFF]/.test(text[contextStart-1]))contextStart++;
  const context=start?text.slice(contextStart,start):undefined;
  parts.push({id:String(parts.length),text:text.slice(start,end),start,end,...(context?{context}: {})});start=end;
 }
 return parts;
}
/** One recovery pass for local transient failures; all sends still use the caller's chapter budget. */
export async function runAiParts(parts:AiPart[],signal:AbortSignal,completed:Map<string,AiTranslateClientResponse>,send:(part:AiPart,onLease?:(lease:AiLeaseInfo)=>void,onRelease?:(leaseIdHash:string)=>void)=>Promise<AiTranslateClientResponse>,publish:(state:AiPartsProgress)=>void,save?:(part:AiPart,result:AiTranslateClientResponse)=>Promise<void>,render?:(completed:Map<string,AiTranslateClientResponse>)=>Pick<AiPartsProgress,'text'|'nodes'>,initialParallel:1|2=1,control?:AiPartsControl,jobId?:string,splitReason?:AiDivisionReason,canExpandEarly?:()=>boolean,separator='\n',requestLimit:AiRequestLimit=2,skipFailure?:(error:unknown)=>boolean,polishResume?:PolishPartsResume):Promise<AiTranslateClientResponse>{
 const retained=polishResume?.retained;
 const unknownDivision=hasUnknownAiParts(parts,retained?.size?new Map([...retained,...completed]):completed);
 let width:number=initialParallel,cursor=0,failure:unknown,model=completed.values().next().value?.model,waitUntil=0,throttled=false;const active=new Set<number>(),deferred=new Map<number,number>(),attempts=new Map<number,number>();
 const leases=new Map<string,{owner:number;leaseIdHash:string;keySlot?:number;requestId?:string}>(),observedLeases=new Set<string>(),observedSlots=new Set<number>();
 let keysAvailable:number|undefined,maxActiveLeases=0;
 let measuredCapacity=false;
 // Retained roots participate in assembly only. New sends and their recovery
 // checkpoints still follow the single-model contract.
 const accepted=(id:string)=>completed.get(id)??retained?.get(id);
 const skipped=new Map(polishResume?.skipped?.map(row=>[row.part-1,row] as const));
 const skip=(index:number,error:unknown)=>{
  if(!signal.aborted&&skipFailure?.(error))skipped.set(index,{part:index+1,message:error instanceof Error?error.message:String(error)});
  else failure??=error;
 };
 const polishTerms=()=>combinePolishTerms(parts.map(part=>accepted(part.id)?.polishTerms));
 const skippedParts=()=>[...skipped.values()].sort((a,b)=>a.part-b.part);
 let writeTail:Promise<void>=Promise.resolve();const writes=new Set<Promise<void>>();
 const trace=(event:Pick<AiPartsTrace,'type'|'partId'|'requestId'|'leaseIdHash'|'keySlot'>)=>{try{traceSink?.({...event,at:Date.now(),activeRequests:Math.max(active.size,leases.size),parallel:width,...(jobId?{jobId}:{})});}catch{/* instrumentation must never break translation */}};
 if([...completed.values()].some(r=>r.model!==model))throw Error('Model của các phần dịch không thống nhất.');
 const check=()=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};
 const preview=()=>render?render(completed):{text:aiCompletedPrefix(parts,completed,separator)};
 let wakeDispatch:(()=>void)|undefined;
 const expand=(keys:number)=>{
  if(throttled||control?.throttled)return;
  const next=Math.min(requestLimit,parts.length,keys);
  if(next>width){width=next;wakeDispatch?.();}
 };
 /** Lease evidence comes only from server-issued hashes on requests that actually ran. */
 const evidence=()=>{
  const activeLeases=new Set<string>();for(const lease of leases.values())if(active.has(lease.owner))activeLeases.add(lease.leaseIdHash);
  if(activeLeases.size>maxActiveLeases)maxActiveLeases=activeLeases.size;
  return {activeRequests:Math.max(active.size,activeLeases.size),activeLeases:activeLeases.size,parallelLeases:maxActiveLeases,...(observedLeases.size?{leaseHashes:[...observedLeases]}:{}),...(observedSlots.size?{keySlots:[...observedSlots]}:{}),...(keysAvailable!==undefined?{keysAvailable}:{})};
 };
 const remember=(result:AiTranslateClientResponse)=>{const debug=result.debug;if(!debug)return;if(debug.leaseIdHash)observedLeases.add(debug.leaseIdHash);if(debug.keySlot!==undefined)observedSlots.add(debug.keySlot);if(debug.keysAvailable!==undefined)keysAvailable=debug.keysAvailable;};
 const emit=()=>{check();if(control?.throttled){throttled=true;width=1;waitUntil=Math.max(waitUntil,control.waitUntil);}const completedParts=parts.flatMap((p,i)=>accepted(p.id)?[i+1]:[]);publish({...(skipFailure?{polishTerms:polishTerms(),polishSkipped:skippedParts()}:{}),completedParts,total:parts.length,done:completedParts.length,active:[...active].map(i=>i+1),parallel:width,...(deferred.size?{retrying:[...deferred.keys()].map(i=>i+1)}:{}),...(attempts.size?{recoveryPasses:attempts.size}:{}),...(waitUntil>Date.now()?{waitUntil}:{}),...(splitReason&&!unknownDivision?{division:combineAiDivision(parts.map(p=>accepted(p.id)??{}),parts.length>1?splitReason:undefined)}:{}),...evidence(),...preview()});};
 const changed=()=>{if(!signal.aborted)emit();};
 if(control)(control.listeners??=new Set()).add(changed);
 const one=async(index:number)=>{
  const part=parts[index];active.add(index);emit();trace({type:'start',partId:part.id});
  try{check();const result=await send(part,(lease:AiLeaseInfo)=>{
    if(signal.aborted)return;
    leases.set(lease.leaseIdHash,{owner:index,leaseIdHash:lease.leaseIdHash,...(lease.keySlot!==undefined?{keySlot:lease.keySlot}:{}),...(lease.requestId?{requestId:lease.requestId}:{})});
    if(lease.leaseIdHash)observedLeases.add(lease.leaseIdHash);
    if(lease.keySlot!==undefined)observedSlots.add(lease.keySlot);
    if(lease.keysAvailable!==undefined)keysAvailable=lease.keysAvailable;
    if(canExpandEarly?.()){
     if(requestLimit===2||lease.freeKeys===undefined)expand(Math.min(2,lease.keysAvailable??0));
     else if(!measuredCapacity){measuredCapacity=true;expand(1+lease.freeKeys);}
    }
    trace({type:'lease',partId:part.id,requestId:lease.requestId,leaseIdHash:lease.leaseIdHash,keySlot:lease.keySlot});
    try{emit();}catch{/* a cancelled publish must not reject the lease callback */}
   },hash=>{leases.delete(hash);if(!signal.aborted)try{emit();}catch{/* release telemetry cannot change request outcome */}});check();if(result.finishReason!=='STOP'||!result.result.trim())throw Error('Phần dịch chưa hoàn chỉnh.');model??=result.model;if(result.model!==model)throw Error('Model thay đổi giữa các phần dịch.');remember(result);skipped.delete(index);completed.set(part.id,result);if(result.parallel===2)expand(2);emit();trace({type:'end',partId:part.id,...(result.debug?{requestId:result.debug.requestId,leaseIdHash:result.debug.leaseIdHash,keySlot:result.debug.keySlot}:{})});if(save){const write=writeTail.then(()=>{check();return save(part,result);}).catch(error=>{failure??=error;}).finally(()=>writes.delete(write));writeTail=write;writes.add(write);}}
  catch(error){
   trace({type:'error',partId:part.id});
   if(!signal.aborted&&parts.length>1&&(mayRetryAiModel(model??'')||model===undefined&&(error instanceof AiTranslateClientError&&(error.status===429||error.code==='ai_rate_limited')))&&isTransientAiFailure(error)&&(attempts.get(index)??0)<1){
    const rate=error.status===429||error.code==='ai_rate_limited',delay=error.retryAfterMs??(rate?30000:600);
    if(delay<=30000){attempts.set(index,1);const at=Date.now()+Math.max(0,delay);deferred.set(index,at);if(rate){throttled=true;width=1;waitUntil=Math.max(waitUntil,at);}}
    else skip(index,error);
   }else skip(index,error);
  }finally{active.delete(index);for(const [hash,lease]of leases)if(lease.owner===index)leases.delete(hash);if(!signal.aborted)try{emit();}catch(error){failure??=error;}}
 };
 emit();const running=new Set<Promise<void>>();
 try{while(cursor<parts.length||running.size||deferred.size){
  check();while(!failure&&running.size<width&&waitUntil<=Date.now()){
   // Bound the disk queue without making every API slot wait for its own write.
   if(writes.size>=4){await Promise.race(writes);check();continue;}
   const retry=[...deferred].find(([,at])=>at<=Date.now());let index:number;
   if(retry){index=retry[0];deferred.delete(index);}else if(cursor<parts.length)index=cursor++;else break;
   if(accepted(parts[index].id))continue;const task=one(index).finally(()=>running.delete(task));running.add(task);
  }
  if(running.size){await new Promise<void>(resolve=>{let settled=false;const finish=()=>{if(settled)return;settled=true;wakeDispatch=undefined;resolve();};wakeDispatch=finish;void Promise.race(running).then(finish,finish);});continue;}
  if(failure)break;
  if(waitUntil>Date.now()||deferred.size){const at=waitUntil>Date.now()?waitUntil:Math.min(...deferred.values());if(at>Date.now())await waitForAiRetry(at-Date.now(),signal);emit();}else break;
 }}finally{control?.listeners?.delete(changed);await Promise.allSettled([...writes]);}
 check();if(failure)throw failure;const values=parts.map(p=>accepted(p.id));if(values.some((r,index)=>!r&&!skipped.has(index)))throw Error('Chương chưa được dịch đầy đủ.');
 const results=values.filter((row):row is AiTranslateClientResponse=>!!row);
 const last=(retained?.size?results.filter(row=>row.model===model).at(-1):undefined)??results.at(-1);
 if(!last)throw Error('Mọi phần đều lỗi. Bản Convert được giữ nguyên.');if(parts.some(part=>{const row=completed.get(part.id);return row&&row.model!==model;}))throw Error('Model của các phần dịch không thống nhất.');
 if(values.length===1)return last;
 let targetStart=0;
 const polishFallback:PolishFallbackRange[]=[];
 const output=values.map((row,index)=>{
  const part=parts[index],text=row?.result??part.text;
  if(!row)polishFallback.push({sourceStart:part.start,sourceEnd:part.end,targetStart,targetEnd:targetStart+text.length});
  targetStart+=text.length+separator.length;
  return text;
 });
 let translatedStart=0;
 const textMap=render||skipped.size?undefined:{version:1 as const,sourceLength:parts.at(-1)!.end,spans:parts.map((part,i)=>{const span={sourceStart:part.start,sourceEnd:part.end,translatedStart,translatedEnd:translatedStart+results[i].result.length};translatedStart=span.translatedEnd+separator.length;return span;})};
 const polishModels=polishResume?.retained.size?[...new Set(results.map(row=>row.model))]:[];
 return {...last,...combineAiExecution(results),...combineAiHanAudits(results),division:splitReason&&!unknownDivision?combineAiDivision(results,splitReason):undefined,textMap,...(skipFailure?{polishTerms:polishTerms(),polishSkipped:skippedParts(),...(polishFallback.length?{polishFallback}:{}),...(polishModels.length>1?{polishModels}:{})}:{}),result:output.join(separator),inputTokens:results.reduce((n,r)=>n+r.inputTokens,0),outputTokens:results.reduce((n,r)=>n+r.outputTokens,0)};
}
