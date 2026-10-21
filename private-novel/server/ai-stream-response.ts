import {secure} from './auth';
import {AI_STREAM_TYPE,type AiStreamLease} from '../src/features/ai/services/ai-stream-protocol';
/** Only safe progress markers and the already-validated JSON response cross the boundary. */
export function aiStreamResponse(request:Request,run:(request:Request,activity:(lease?:AiStreamLease)=>void)=>Promise<Response>):Response{
 const controller=new AbortController(),encoder=new TextEncoder();
 const abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
 const forwarded=new Request(request,{signal:controller.signal});
 let stopped=false,lastProgress=-Infinity,leaseSent=false;
 const stream=new ReadableStream<Uint8Array>({
  start(sink){
   const emit=(value:unknown)=>{if(!stopped)sink.enqueue(encoder.encode(JSON.stringify(value)+'\n'));};
   const activity=(lease?:AiStreamLease)=>{
    // Lease evidence is emitted once, as soon as the server has reserved a key.
    if(lease&&!leaseSent){leaseSent=true;lastProgress=Date.now();emit({type:'progress',lease});return;}
    if(Date.now()-lastProgress>=250){lastProgress=Date.now();emit({type:'progress'});}
   };
   void run(forwarded,activity).then(async response=>{
    const headers:Record<string,string>={};
    for(const key of ['X-AI-Request-Id','X-AI-Duration-Ms','X-AI-Failure-Reason','X-AI-Parallel','X-AI-Keys-Available','X-AI-Lease-Id-Hash','X-AI-Key-Slot','Retry-After']){const value=response.headers.get(key);if(value!==null)headers[key]=value;}
    emit({type:'result',status:response.status,headers,data:await response.json()});
   }).catch(()=>emit({type:'result',status:502,headers:{},data:{error:'ai_network_error'}})).finally(()=>{
    request.signal.removeEventListener('abort',abort);if(!stopped){stopped=true;sink.close();}
   });
  },
  cancel(){stopped=true;abort();request.signal.removeEventListener('abort',abort);},
 });
 return secure(new Response(stream,{headers:{'Content-Type':AI_STREAM_TYPE+';charset=utf-8','X-AI-Stream':'1'}}));
}
