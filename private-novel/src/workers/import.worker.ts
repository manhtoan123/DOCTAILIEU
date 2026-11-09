import {cleanImportedTitle,ImportAdvertisingFilter} from '../features/import-export/services/import-advertising';
import {createSHA256} from 'hash-wasm';
import {StreamingSplitter,type Part} from '../features/import-export/services/splitter';
import {cleanTitle} from '../core/domain';
import {resolveTextEncoding} from '../features/import-export/services/text-encoding';
import {scanGluedChapterNumbers} from '../features/import-export/services/glued-headings';
import type {TxtWorkerProgress} from '../features/import-export/services/txt-import-progress';

const chunkBytes=262144,batchSize=128;
let resolveAck:(()=>void)|undefined;

self.onmessage=async(e:MessageEvent)=>{
  if(e.data.type==='ack'){resolveAck?.();resolveAck=undefined;return;}
  if(e.data.type==='ping'){self.postMessage({type:'pong'});return;}
  const preview=e.data.type==='preview';
  if(!preview&&e.data.type!=='start')return;
  const {file,title,encoding,pattern,detect,maxChars=64000}=e.data as {file:File;title:string;encoding:string;pattern:string;detect:boolean;maxChars?:number};
  let lastPhase:TxtWorkerProgress['phase']|undefined,lastReport=0;
  const progress=(phase:TxtWorkerProgress['phase'],read:number,total:number)=>{
    const now=performance.now();
    if(phase===lastPhase&&read!==total&&now-lastReport<100)return;
    lastPhase=phase;lastReport=now;
    self.postMessage({type:'progress',phase,read,total} satisfies TxtWorkerProgress);
  };
  try{
    const regex=pattern?new RegExp(pattern,'iu'):undefined;
    progress('encoding',0,file.size);
    const actualEncoding=await resolveTextEncoding(file,encoding,undefined,(read,total)=>progress('encoding',read,total));
    if(!pattern)progress('headings',0,file.size);
    const glued=pattern?undefined:await scanGluedChapterNumbers(file,actualEncoding,undefined,(read,total)=>progress('headings',read,total));
    progress('chapters',0,file.size);
    const hash=preview?undefined:await createSHA256();
    hash?.init();
    const decoder=new TextDecoder(actualEncoding,{fatal:true});
    const rows:{order:number;title:string;charCount:number}[]=[];
    let parts:Part[]=[],chapterCount=0,chars=0,hasContent=false;
    const split=new StreamingSplitter(preview?cleanTitle(file.name):title,p=>{
      hasContent||=/\S/u.test(p.text);
      const title=cleanImportedTitle(p.title);
      chapterCount++;chars+=p.text.length;
      if(!preview)parts.push({title,text:p.text});
      else if(rows.length<300)rows.push({order:chapterCount,title,charCount:p.text.length});
    },regex,maxChars,preview||detect,glued);
    const filter=new ImportAdvertisingFilter(text=>split.feed(text));
    async function send(){
      for(let i=0;i<parts.length;i+=batchSize){
        const wait=new Promise<void>(resolve=>{resolveAck=resolve;});
        self.postMessage({type:'batch',parts:parts.slice(i,i+batchSize)});
        await wait;
      }
      parts=[];
    }
    // The original bytes are only read in slices. Hash and split in the same pass.
    for(let offset=0;offset<file.size;offset+=chunkBytes){
      const bytes=new Uint8Array(await file.slice(offset,offset+chunkBytes).arrayBuffer());
      hash?.update(bytes);
      filter.feed(decoder.decode(bytes,{stream:true}));
      if(parts.length)await send();
      const read=offset+bytes.byteLength;
      if(read<file.size)progress('chapters',read,file.size);
    }
    filter.feed(decoder.decode(),true);
    split.feed('',true);
    if(!hasContent)throw Error('Nội dung TXT rỗng hoặc chỉ có khoảng trắng.');
    if(parts.length)await send();
    progress('chapters',file.size,file.size);
    const common={encoding:actualEncoding,inferredHeadings:split.inferredHeadings};
    self.postMessage(preview
      ?{type:'preview_done',chapters:rows,chapterCount,totalChars:chars,...common}
      :{type:'done',sha256:hash!.digest('hex'),chars,...common});
  }catch(error){
    self.postMessage({type:preview?'preview_error':'error',message:error instanceof Error?error.message:String(error)});
  }
};
