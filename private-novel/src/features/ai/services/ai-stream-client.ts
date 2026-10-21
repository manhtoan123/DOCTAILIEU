import {AI_STREAM_MAX_BYTES,AI_STREAM_MAX_EVENTS,type AiStreamLease} from './ai-stream-protocol';
export class AiStreamProtocolError extends Error{}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,HEX=/^[a-f0-9]{16,64}$/i;
const STREAM_HEADERS=['X-AI-Request-Id','X-AI-Duration-Ms','X-AI-Failure-Reason','X-AI-Parallel','X-AI-Keys-Available','X-AI-Lease-Id-Hash','X-AI-Key-Slot','Retry-After'];
/** Only identifiers cross the boundary; a lease token or credential never does. */
function validLease(value:unknown):value is AiStreamLease{
 if(!record(value))return false;
 if(typeof value.requestId!=='string'||!UUID.test(value.requestId))return false;
 if(typeof value.leaseIdHash!=='string'||!HEX.test(value.leaseIdHash))return false;
 if(!Number.isSafeInteger(value.keySlot)||(value.keySlot as number)<1||(value.keySlot as number)>32)return false;
 if(value.keysAvailable!==undefined&&(!Number.isSafeInteger(value.keysAvailable)||(value.keysAvailable as number)<0||(value.keysAvailable as number)>32))return false;
 return true;
}
/** Activity never escapes as a saved/displayed translation. EOF and a final envelope are required. */
export async function readAiStreamResponse(response:Response,signal:AbortSignal,activity:()=>void,onLease?:(lease:AiStreamLease)=>void):Promise<Response>{
 const reader=response.body?.getReader();if(!reader)throw new AiStreamProtocolError('empty_body');
 const decoder=new TextDecoder('utf-8',{fatal:true});let buffer='',size=0,events=0,complete:Response|undefined,ended=false,lease:AiStreamLease|undefined;
 function fail():never{throw new AiStreamProtocolError('body_stream');}
 const line=(raw:string)=>{
  if(!raw.trim())return;
  if(++events>AI_STREAM_MAX_EVENTS||complete)fail();
  let row:unknown;try{row=JSON.parse(raw);}catch{fail();}
  if(!record(row))fail();
  if(row.type==='progress'){
   if(Object.keys(row).length===1){activity();return;}
   if(Object.keys(row).length!==2||!validLease(row.lease))fail();
   lease=row.lease;onLease?.(lease);return;
  }
  if(row.type!=='result'||!Number.isSafeInteger(row.status)||(row.status!==200&&(Number(row.status)<400||Number(row.status)>599))||!record(row.headers)||!record(row.data))fail();
  const headers=new Headers({'Content-Type':'application/json'});
  for(const key of STREAM_HEADERS){
   const value=row.headers[key];if(value!==undefined){if(typeof value!=='string'||value.length>128||/[\r\n]/.test(value))fail();headers.set(key,value);}
  }
  // A progress-carried lease is still valid evidence for this request.
  if(lease){headers.set('X-AI-Lease-Id-Hash',lease.leaseIdHash);headers.set('X-AI-Key-Slot',String(lease.keySlot));headers.set('X-AI-Request-Id',lease.requestId);if(lease.keysAvailable!==undefined)headers.set('X-AI-Keys-Available',String(lease.keysAvailable));}
  complete=new Response(JSON.stringify(row.data),{status:Number(row.status),headers});
 };
 const consume=(text:string)=>{buffer+=text;let at:number;while((at=buffer.indexOf('\n'))>=0){line(buffer.slice(0,at));buffer=buffer.slice(at+1);}};
 const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{
  for(;;){
   if(signal.aborted)throw new DOMException('Cancelled','AbortError');
   const {done,value}=await reader.read();if(signal.aborted)throw new DOMException('Cancelled','AbortError');if(done)break;
   size+=value.byteLength;if(size>AI_STREAM_MAX_BYTES)fail();consume(decoder.decode(value,{stream:true}));
  }
  consume(decoder.decode());if(buffer)line(buffer);if(!complete)fail();ended=true;return complete;
 }finally{signal.removeEventListener('abort',abort);if(!ended)void reader.cancel().catch(()=>{});reader.releaseLock();}
}
