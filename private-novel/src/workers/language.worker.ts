import {LanguageEngine} from '../language';
import type {DictKind} from '../domain';
let engine=new LanguageEngine();
self.onmessage=async(e:MessageEvent)=>{
  const {id,type}=e.data;
  try {
    if(type==='load') {
      engine=new LanguageEngine();const stats=[];
      for(const file of e.data.files as {kind:DictKind;blob:Blob;name:string}[]) {
        let tail='';let valid=0;let invalid=0;let processed=0;
        const decoder=new TextDecoder('utf-8',{fatal:true});
        const line=(s:string)=>{if(!s.trim()||s.trim().startsWith('#'))return;engine.add(file.kind,s)?valid++:invalid++;};
        for(let offset=0;offset<file.blob.size;offset+=262144){
          const bytes=await file.blob.slice(offset,offset+262144).arrayBuffer();processed+=bytes.byteLength;
          tail+=decoder.decode(bytes,{stream:true});let p:number;while((p=tail.indexOf('\n'))>=0){line(tail.slice(0,p));tail=tail.slice(p+1);}
          if(tail.length>65536)throw new Error(`Dòng từ điển quá dài: ${file.name}`);
          self.postMessage({id,type:'progress',message:`Đang nạp ${file.name}`,percent:Math.round(processed/file.blob.size*100)});
        }
        tail+=decoder.decode();if(tail)line(tail);stats.push({name:file.name,valid,invalid});
      }
      self.postMessage({id,type:'result',result:stats});
    }else if(type==='convert')self.postMessage({id,type:'result',result:engine.convert(e.data.text,e.data.names)});
    else if(type==='lookup')self.postMessage({id,type:'result',result:engine.lookup(e.data.source)});
  }catch(error){self.postMessage({id,type:'error',message:error instanceof Error?error.message:String(error)});}
};

