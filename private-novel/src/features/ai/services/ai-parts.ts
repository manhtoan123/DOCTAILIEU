import {hasUnknownAiParts} from './ai-leaf-progress';
import type {AiLeaseInfo,AiTranslateClientResponse} from './ai-translate';
import {isTransientAiFailure,waitForAiRetry} from './ai-recovery';
import {protectAiBoundary} from './ai-boundary';
import {combineAiDivision,type AiDivision,type AiDivisionReason} from './ai-division';
export interface AiPart {id:string;text:string;context?:string;start:number;end:number}
export interface AiPartsProgress {total:number;done:number;active:number[];text:string;nodes?:string[];parallel:number;retrying?:number[];waitUntil?:number;recoveryPasses?:number;half?:1|2;halfModels?:[string,string];sample?:string;promptPreview?:string;
 division?:AiDivision;
 leafProgress?:import('./ai-leaf-progress').AiLeafProgress;
 /** Runtime evidence only: no field below is inferred from a configured maximum. */
 activeRequests?:number;activeLeases?:number;parallelLeases?:number;leaseHashes?:string[];keySlots?:number[];keysAvailable?:number}
export interface AiPartRecord {id:string;response:AiTranslateClientResponse}
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
export async function runAiParts(parts:AiPart[],signal:AbortSignal,completed:Map<string,AiTranslateClientResponse>,send:(part:AiPart,onLease?:(lease:AiLeaseInfo)=>void)=>Promise<AiTranslateClientResponse>,publish:(state:AiPartsProgress)=>void,save?:(part:AiPart,result:AiTranslateClientResponse)=>Promise<void>,render?:(completed:Map<string,AiTranslateClientResponse>)=>Pick<AiPartsProgress,'text'|'nodes'>,initialParallel:1|2=1,control?:AiPartsControl,jobId?:string,splitReason?:AiDivisionReason):Promise<AiTranslateClientResponse>{
 const unknownDivision=hasUnknownAiParts(parts,completed);
 let width=initialParallel,cursor=0,failure:unknown,model=completed.values().next().value?.model,waitUntil=0,throttled=false;const active=new Set<number>(),deferred=new Map<number,number>(),attempts=new Map<number,number>();
 const leases=new Map<number,{leaseIdHash:string;keySlot?:number;requestId?:string}>(),observedLeases=new Set<string>(),observedSlots=new Set<number>();
 let keysAvailable:number|undefined,maxActiveLeases=0;
 let writeTail:Promise<void>=Promise.resolve();const writes=new Set<Promise<void>>();
 const trace=(event:Pick<AiPartsTrace,'type'|'partId'|'requestId'|'leaseIdHash'|'keySlot'>)=>{try{traceSink?.({...event,at:Date.now(),activeRequests:active.size,parallel:width,...(jobId?{jobId}:{})});}catch{/* instrumentation must never break translation */}};
 if([...completed.values()].some(r=>r.model!==model))throw Error('Model của các phần dịch không thống nhất.');
 const check=()=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};
 const preview=()=>{if(render)return render(completed);const prefix:string[]=[];for(const part of parts){const done=completed.get(part.id);if(!done)break;prefix.push(done.result);}return {text:prefix.join('\n')};};
 /** Lease evidence comes only from server-issued hashes on requests that actually ran. */
 const evidence=()=>{
  const activeLeases=new Set<string>();for(const index of active){const lease=leases.get(index);if(lease)activeLeases.add(lease.leaseIdHash);}
  if(activeLeases.size>maxActiveLeases)maxActiveLeases=activeLeases.size;
  return {activeRequests:active.size,activeLeases:activeLeases.size,parallelLeases:maxActiveLeases,...(observedLeases.size?{leaseHashes:[...observedLeases]}:{}),...(observedSlots.size?{keySlots:[...observedSlots]}:{}),...(keysAvailable!==undefined?{keysAvailable}:{})};
 };
 const remember=(result:AiTranslateClientResponse)=>{const debug=result.debug;if(!debug)return;if(debug.leaseIdHash)observedLeases.add(debug.leaseIdHash);if(debug.keySlot!==undefined)observedSlots.add(debug.keySlot);if(debug.keysAvailable!==undefined)keysAvailable=debug.keysAvailable;};
 const emit=()=>{check();if(control?.throttled){throttled=true;width=1;waitUntil=Math.max(waitUntil,control.waitUntil);}publish({total:parts.length,done:parts.filter(p=>completed.has(p.id)).length,active:[...active].map(i=>i+1),parallel:width,...(deferred.size?{retrying:[...deferred.keys()].map(i=>i+1)}:{}),...(attempts.size?{recoveryPasses:attempts.size}:{}),...(waitUntil>Date.now()?{waitUntil}:{}),...(splitReason&&!unknownDivision?{division:combineAiDivision(parts.map(p=>completed.get(p.id)??{}),parts.length>1?splitReason:undefined)}:{}),...evidence(),...preview()});};
 const changed=()=>{if(!signal.aborted)emit();};
 if(control)(control.listeners??=new Set()).add(changed);
 const one=async(index:number)=>{
  const part=parts[index];active.add(index);emit();trace({type:'start',partId:part.id});
  try{check();const result=await send(part,(lease:AiLeaseInfo)=>{
    if(signal.aborted)return;
    leases.set(index,{leaseIdHash:lease.leaseIdHash,...(lease.keySlot!==undefined?{keySlot:lease.keySlot}:{}),...(lease.requestId?{requestId:lease.requestId}:{})});
    if(lease.leaseIdHash)observedLeases.add(lease.leaseIdHash);
    if(lease.keySlot!==undefined)observedSlots.add(lease.keySlot);
    if(lease.keysAvailable!==undefined)keysAvailable=lease.keysAvailable;
    trace({type:'lease',partId:part.id,requestId:lease.requestId,leaseIdHash:lease.leaseIdHash,keySlot:lease.keySlot});
    try{emit();}catch{/* a cancelled publish must not reject the lease callback */}
   });check();if(result.finishReason!=='STOP'||!result.result.trim())throw Error('Phần dịch chưa hoàn chỉnh.');model??=result.model;if(result.model!==model)throw Error('Model thay đổi giữa các phần dịch.');remember(result);completed.set(part.id,result);if(result.parallel===2&&!throttled)width=2;emit();trace({type:'end',partId:part.id,...(result.debug?{requestId:result.debug.requestId,leaseIdHash:result.debug.leaseIdHash,keySlot:result.debug.keySlot}:{})});if(save){const write=writeTail.then(()=>{check();return save(part,result);}).catch(error=>{failure??=error;}).finally(()=>writes.delete(write));writeTail=write;writes.add(write);}}
  catch(error){
   trace({type:'error',partId:part.id});
   if(!signal.aborted&&parts.length>1&&(model!==undefined||initialParallel===2)&&isTransientAiFailure(error)&&(attempts.get(index)??0)<1){
    const rate=error.status===429||error.code==='ai_rate_limited',delay=rate?error.retryAfterMs??30000:600;
    if(delay<=30000){attempts.set(index,1);const at=Date.now()+Math.max(0,delay);deferred.set(index,at);if(rate){throttled=true;width=1;waitUntil=Math.max(waitUntil,at);}}
    else failure??=error;
   }else failure??=error;
  }finally{active.delete(index);leases.delete(index);if(!signal.aborted)try{emit();}catch(error){failure??=error;}}
 };
 emit();const running=new Set<Promise<void>>();
 try{while(cursor<parts.length||running.size||deferred.size){
  check();while(!failure&&running.size<width&&waitUntil<=Date.now()){
   // Bound the disk queue without making every API slot wait for its own write.
   if(writes.size>=4){await Promise.race(writes);check();continue;}
   const retry=[...deferred].find(([,at])=>at<=Date.now());let index:number;
   if(retry){index=retry[0];deferred.delete(index);}else if(cursor<parts.length)index=cursor++;else break;
   if(completed.has(parts[index].id))continue;const task=one(index).finally(()=>running.delete(task));running.add(task);
  }
  if(running.size){await Promise.race(running);continue;}
  if(failure)break;
  if(waitUntil>Date.now()||deferred.size){const at=waitUntil>Date.now()?waitUntil:Math.min(...deferred.values());await waitForAiRetry(Math.max(0,at-Date.now()),signal);emit();}else break;
 }}finally{control?.listeners?.delete(changed);await Promise.allSettled([...writes]);}
 check();if(failure)throw failure;const values=parts.map(p=>completed.get(p.id));if(values.some(r=>!r))throw Error('Chương chưa được dịch đầy đủ.');
 const results=values as AiTranslateClientResponse[],last=results.at(-1)!;if(results.some(r=>r.model!==model))throw Error('Model của các phần dịch không thống nhất.');
 if(results.length===1)return last;
 let translatedStart=0;
 const textMap=render?undefined:{version:1 as const,sourceLength:parts.at(-1)!.end,spans:parts.map((part,i)=>{const span={sourceStart:part.start,sourceEnd:part.end,translatedStart,translatedEnd:translatedStart+results[i].result.length};translatedStart=span.translatedEnd+1;return span;})};
 return {...last,division:splitReason&&!unknownDivision?combineAiDivision(results,splitReason):undefined,textMap,result:results.map(r=>r.result).join('\n'),inputTokens:results.reduce((n,r)=>n+r.inputTokens,0),outputTokens:results.reduce((n,r)=>n+r.outputTokens,0)};
}
