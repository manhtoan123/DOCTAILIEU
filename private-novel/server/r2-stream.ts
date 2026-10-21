import type {R2ObjectBody} from '@cloudflare/workers-types';

// Cloudflare's built-in constructor. The portable byte-stream shape also type
// checks when handler tests use DOM globals; the runtime class is never replaced.
declare const FixedLengthStream: {new(length:number):{readable:ReadableStream<Uint8Array>;writable:WritableStream<Uint8Array>}};

export function streamR2Body(object:Pick<R2ObjectBody,'body'>,expectedBytes:number,waitUntil:(promise:Promise<unknown>)=>void):ReadableStream<Uint8Array>{
  if(typeof FixedLengthStream!=='undefined'){
    const transfer=new FixedLengthStream(expectedBytes);
    waitUntil(object.body.pipeTo(transfer.writable));
    return transfer.readable;
  }
  // Node handler tests do not expose the Workers native stream constructor.
  // Retain bounded, cancellation-aware validation there; production uses native IO.
  const reader=object.body.getReader();let received=0;
  return new ReadableStream<Uint8Array>({
    async pull(controller){
      try{const part=await reader.read();if(part.done){if(received!==expectedBytes)throw new Error('R2 size mismatch');controller.close();reader.releaseLock();return;}
        received+=part.value.byteLength;if(received>expectedBytes)throw new Error('R2 size mismatch');controller.enqueue(part.value);
      }catch{controller.error(new Error('Dictionary stream unavailable'));await reader.cancel().catch(()=>{});reader.releaseLock();}
    },
    async cancel(reason){await reader.cancel(reason).catch(()=>{});reader.releaseLock();}
  },{highWaterMark:0});
}
