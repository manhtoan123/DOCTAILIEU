/** Shared request admission for the visible chapter and prewarm. No keys live here. */
import {waitForAiRetry} from './ai-recovery';
export const AI_TOOL_REQUEST_LIMIT = 4;
export type AiRequestLimit = 2 | typeof AI_TOOL_REQUEST_LIMIT;
export interface AiPartsControl {
 immediate?:boolean;throttled:boolean;waitUntil:number;throttledUntil?:number;changed?:()=>void;activeRequests?:number;
 waiters?:Set<()=>void>;queue?:{priority:number;wake:()=>void}[];
 listeners?:Set<()=>void>;
}
export function aiQuotaFeedback(control:AiPartsControl,delay:number){
 if(control.immediate){control.throttled=true;control.waitUntil=0;control.throttledUntil=0;control.changed?.();for(const listener of control.listeners??[])listener();return;}
 control.throttled=true;control.waitUntil=Math.max(control.waitUntil,Date.now()+Math.max(0,delay));
 control.throttledUntil=Math.max(control.throttledUntil??0,control.waitUntil,Date.now()+60000);
 control.changed?.();for(const listener of control.listeners??[])listener();
}
export function wakeAiRequestQueue(control:AiPartsControl){for(const waiting of control.queue??[])waiting.wake();}
export async function withAiRequestCapacity<T>(control:AiPartsControl,signal:AbortSignal,send:()=>Promise<T>,priority:number|(()=>number)=0,limit:AiRequestLimit=2):Promise<T>{
 const entry={get priority(){return typeof priority==='function'?priority():priority;},wake:()=>{}};
 (control.queue??=[]).push(entry);
 const remove=()=>{const index=control.queue!.indexOf(entry);if(index>=0)control.queue!.splice(index,1);};
 const wakeAll=()=>wakeAiRequestQueue(control);
 try{
  for(;;){
   if(signal.aborted)throw new DOMException('Cancelled','AbortError');
   const delay=control.immediate?0:control.waitUntil-Date.now();if(delay>0){await waitForAiRetry(delay,signal);continue;}
   const first=control.queue!.reduce((best,item)=>item.priority<best.priority?item:best);
   if(first===entry&&(control.activeRequests??0)<(control.throttled?1:limit)){
    control.activeRequests=(control.activeRequests??0)+1;remove();wakeAll();break;
   }
   await new Promise<void>((resolve,reject)=>{
    const clean=()=>{entry.wake=()=>{};signal.removeEventListener('abort',abort);};
    const abort=()=>{clean();reject(new DOMException('Cancelled','AbortError'));};
    entry.wake=()=>{clean();resolve();};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
   });
  }
 }catch(error){remove();wakeAll();throw error;}
 try{if(signal.aborted)throw new DOMException('Cancelled','AbortError');return await send();}
 finally{control.activeRequests!--;wakeAll();}
}

/** Recover concurrency only at an idle job boundary, never during the current cooldown. */
export function resetIdleAiCapacity(control:AiPartsControl){
 if(!(control.activeRequests??0)&&!control.queue?.length&&control.waitUntil<=Date.now()&&(control.throttledUntil??0)<=Date.now())control.throttled=false;
}
