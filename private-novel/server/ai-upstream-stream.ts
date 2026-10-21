/** Bounded SSE decoding; only nonempty, validated model text counts as activity. */
export class AiUpstreamStreamError extends Error {
  constructor(readonly reason:string){super('Invalid AI stream');}
}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export async function readAiUpstreamStream(response:Response,signal:AbortSignal,activity:()=>void,limit:number,maxResult:number):Promise<unknown>{
  if(response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='text/event-stream')throw new AiUpstreamStreamError('upstream_content_type');
  const reader=response.body?.getReader();if(!reader)throw new AiUpstreamStreamError('upstream_empty_result');
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});let size=0,buffer='',event:string[]=[],answer='',finishReason:unknown,usage:Record<string,unknown>|undefined,ended=false,events=0;
  function fail(reason='upstream_schema'):never{throw new AiUpstreamStreamError(reason);}
  const dispatch=()=>{
    if(!event.length)return;const raw=event.join('\n');event=[];
    if(++events>8192)fail('size_limit');
    if(raw==='[DONE]'){if(finishReason===undefined)fail('upstream_finish_reason');return;}
    let data:unknown;try{data=JSON.parse(raw);}catch{fail('upstream_invalid_json');}
    if(!record(data)||data.error!==undefined)fail();
    if(data.usageMetadata!==undefined){
      if(!record(data.usageMetadata))fail('upstream_usage');
      for(const key of ['promptTokenCount','candidatesTokenCount']){const value=data.usageMetadata[key];if(value!==undefined&&(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>1000000))fail('upstream_usage');}
      usage={...usage,...data.usageMetadata};
    }
    // Protobuf JSON may omit an empty repeated candidates field on usage-only events.
    if(data.candidates===undefined&&data.usageMetadata!==undefined)return;
    if(!Array.isArray(data.candidates)||data.candidates.length>1)fail('upstream_candidates');
    if(!data.candidates.length){if(data.usageMetadata===undefined)fail('upstream_candidates');return;}
    const candidate=data.candidates[0];if(!record(candidate)||candidate.index!==undefined&&candidate.index!==0)fail('upstream_candidates');
    if(candidate.finishReason!==undefined){if(finishReason!==undefined||typeof candidate.finishReason!=='string')fail('upstream_finish_reason');}
    const parts=record(candidate.content)?candidate.content.parts:undefined;
    if(parts!==undefined){
      if(!Array.isArray(parts))fail('upstream_parts');
      for(const part of parts){
        if(!record(part)||typeof part.text!=='string'||part.thought!==undefined&&typeof part.thought!=='boolean')fail('upstream_parts');
        if(part.text){
          if(finishReason!==undefined)fail('upstream_finish_reason');
          if(part.thought!==true){answer+=part.text;if(answer.length>maxResult)fail('size_limit');}
          activity(); // Reasoning content stays server-side, but proves upstream activity.
        }
      }
    }else if(candidate.finishReason===undefined)fail('upstream_parts');
    if(candidate.finishReason!==undefined)finishReason=candidate.finishReason;
  };
  const line=(value:string)=>{if(value==='')dispatch();else if(value.startsWith('data:'))event.push(value.slice(5).replace(/^ /,''));};
  const consume=(text:string)=>{
    buffer+=text;let next:number;
    while((next=buffer.indexOf('\n'))!==-1){line(buffer.slice(0,next).replace(/\r$/,''));buffer=buffer.slice(next+1);}
  };
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
    for(;;){
      if(signal.aborted)throw new DOMException('Cancelled','AbortError');
      const chunk=await reader.read();if(signal.aborted)throw new DOMException('Cancelled','AbortError');
      if(chunk.done)break;
      size+=chunk.value.byteLength;if(size>limit)fail('size_limit');
      consume(decoder.decode(chunk.value,{stream:true}));
    }
    consume(decoder.decode());if(buffer)line(buffer.replace(/\r$/,''));dispatch();
    ended=true;
    if(finishReason===undefined)fail('upstream_finish_reason');
    return {candidates:[{content:{parts:[{text:answer}]},finishReason}],...(usage?{usageMetadata:usage}:{})};
  }catch(error){if(error instanceof AiUpstreamStreamError||signal.aborted)throw error;throw new AiUpstreamStreamError('upstream_body_read');}
  finally{signal.removeEventListener('abort',abort);if(!ended)void reader.cancel().catch(()=>{});reader.releaseLock();}
}
