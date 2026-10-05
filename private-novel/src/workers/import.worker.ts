import {createSHA256} from 'hash-wasm';
import {StreamingSplitter,type Part} from '../splitter';
let resolveAck:(()=>void)|undefined;
self.onmessage=async(e:MessageEvent)=>{
  if(e.data.type==='ack') {resolveAck?.();resolveAck=undefined;return;}
  if(e.data.type!=='start')return;
  const {file,title,encoding,pattern,detect}=e.data as {file:File;title:string;encoding:string;pattern:string;detect:boolean};
  try {
    const regex=pattern?new RegExp(pattern,'iu'):undefined;
    const hash=await createSHA256(); hash.init(); const decoder=new TextDecoder(encoding,{fatal:true});
    let batch:Part[]=[];let chars=0;let read=0;
    const split=new StreamingSplitter(title,p=>{batch.push(p);chars+=p.text.length;},regex,64000,detect);
    const send=async()=>{if(batch.length){const wait=new Promise<void>(r=>{resolveAck=r;});self.postMessage({type:'batch',parts:batch});batch=[];await wait;}self.postMessage({type:'progress',read,total:file.size});};
    // Blob.slice bounds both the decoder and output batch; no full-file arrayBuffer.
    for(let offset=0;offset<file.size;offset+=262144) {
      const bytes=new Uint8Array(await file.slice(offset,offset+262144).arrayBuffer());hash.update(bytes);read+=bytes.length;
      split.feed(decoder.decode(bytes,{stream:true}));await send();
    }
    split.feed(decoder.decode(),true);await send();self.postMessage({type:'done',sha256:hash.digest('hex'),chars});
  } catch(err) {self.postMessage({type:'error',message:err instanceof Error?err.message:String(err)});}
};

