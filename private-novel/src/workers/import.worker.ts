import {createSHA256} from 'hash-wasm';
import {StreamingSplitter,type Part} from '../features/import-export/services/splitter';
import {cleanTitle} from '../core/domain';
let resolveAck:(()=>void)|undefined;
self.onmessage=async(e:MessageEvent)=>{
  if(e.data.type==='ack') {resolveAck?.();resolveAck=undefined;return;}
  if(e.data.type==='preview') {
    const {file,encoding,pattern,maxChars=64000}=e.data as {file:File;encoding:string;pattern:string;maxChars?:number};
    try {
      const regex=pattern?new RegExp(pattern,'iu'):undefined;
      const prefix=new Uint8Array(await file.slice(0,3).arrayBuffer());
      const actualEncoding=prefix[0]===0xef&&prefix[1]===0xbb&&prefix[2]===0xbf?'utf-8':prefix[0]===0xff&&prefix[1]===0xfe?'utf-16le':prefix[0]===0xfe&&prefix[1]===0xff?'utf-16be':encoding;
      const decoder=new TextDecoder(actualEncoding,{fatal:true});
      const previewList:{order:number;title:string;charCount:number}[]=[];
      let totalChars=0;let chapterCount=0;let hasContent=false;
      const split=new StreamingSplitter(cleanTitle(file.name),p=>{
        chapterCount++;
        if(previewList.length<300)previewList.push({order:chapterCount,title:p.title,charCount:p.text.length});
        totalChars+=p.text.length;
      },regex,maxChars,true);
      for(let offset=0;offset<file.size;offset+=262144) {
        const bytes=new Uint8Array(await file.slice(offset,offset+262144).arrayBuffer());
        const text=decoder.decode(bytes,{stream:true});
        hasContent=hasContent||/\S/.test(text);
        split.feed(text);
      }
      const tail=decoder.decode();
      hasContent=hasContent||/\S/.test(tail);
      split.feed(tail,true);
      if(!hasContent)throw new Error('Nội dung TXT rỗng hoặc chỉ có khoảng trắng.');
      self.postMessage({type:'preview_done',chapters:previewList,chapterCount,totalChars,encoding:actualEncoding});
    } catch(err) {
      self.postMessage({type:'preview_error',message:err instanceof Error?err.message:String(err)});
    }
    return;
  }
  if(e.data.type!=='start')return;
  const {file,title,encoding,pattern,detect,maxChars=64000}=e.data as {file:File;title:string;encoding:string;pattern:string;detect:boolean;maxChars?:number};
  try {
    const regex=pattern?new RegExp(pattern,'iu'):undefined;
    const prefix=new Uint8Array(await file.slice(0,3).arrayBuffer());
    const actualEncoding=prefix[0]===0xef&&prefix[1]===0xbb&&prefix[2]===0xbf?'utf-8':prefix[0]===0xff&&prefix[1]===0xfe?'utf-16le':prefix[0]===0xfe&&prefix[1]===0xff?'utf-16be':encoding;
    const hash=await createSHA256(); hash.init(); const decoder=new TextDecoder(actualEncoding,{fatal:true});
    let batch:Part[]=[];let chars=0;let read=0;let hasContent=false;
    const split=new StreamingSplitter(title,p=>{batch.push(p);chars+=p.text.length;},regex,maxChars,detect);
    const send=async()=>{if(batch.length){const wait=new Promise<void>(r=>{resolveAck=r;});self.postMessage({type:'batch',parts:batch});batch=[];await wait;}self.postMessage({type:'progress',read,total:file.size});};
    // Blob.slice bounds both the decoder and output batch; no full-file arrayBuffer.
    for(let offset=0;offset<file.size;offset+=262144) {
      const bytes=new Uint8Array(await file.slice(offset,offset+262144).arrayBuffer());hash.update(bytes);read+=bytes.length;
      const text=decoder.decode(bytes,{stream:true});hasContent=hasContent||/\S/.test(text);
      split.feed(text);await send();
    }
    const tail=decoder.decode();hasContent=hasContent||/\S/.test(tail);split.feed(tail,true);
    if(!hasContent)throw new Error('Nội dung TXT rỗng hoặc chỉ có khoảng trắng.');
    await send();self.postMessage({type:'done',sha256:hash.digest('hex'),chars,encoding:actualEncoding});
  } catch(err) {self.postMessage({type:'error',message:err instanceof Error?err.message:String(err)});}
};
