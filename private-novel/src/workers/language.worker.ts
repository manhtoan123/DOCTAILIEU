import {LanguageEngine} from '../features/names-convert/services/language';
import type {DictKind} from '../core/domain';
import {readDictionary} from '../features/names-convert/services/dictionary-reader';
let engine=new LanguageEngine();
self.onmessage=async(e:MessageEvent)=>{
  const {id,type}=e.data;
  try {
    if(type==='load') {
      const next=new LanguageEngine();const stats=[];
      for(const file of e.data.files as {kind:DictKind;blob:Blob;name:string}[]) {
        const kind=file.kind==='names2'&&/^(DaiTuNhanXung|Pronouns|DaiTu)\.txt$/i.test(file.name)?'pronouns':file.kind;
        stats.push(await readDictionary(kind,file.blob,file.name,line=>{next.add(kind,line);},percent=>self.postMessage({id,type:'progress',message:`Đang mở từ điển đã lưu: ${file.name}`,percent})));
      }
      engine=next;
      self.postMessage({id,type:'result',result:stats});
    }else if(type==='convert')self.postMessage({id,type:'result',result:engine.convert(e.data.text,e.data.names,e.data.options)});
    else if(type==='lookup')self.postMessage({id,type:'result',result:engine.lookup(e.data.source)});
  }catch(error){self.postMessage({id,type:'error',message:error instanceof Error?error.message:String(error)});}
};
