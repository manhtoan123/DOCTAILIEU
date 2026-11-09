import {LanguageEngine} from '../features/names-convert/services/language';
import {loadLanguageEngine} from '../features/names-convert/services/load-language-engine';
let engine=new LanguageEngine();
self.onmessage=async(e:MessageEvent)=>{
  const {id,type}=e.data;
  try {
    if(type==='load') {
      const next=await loadLanguageEngine(e.data.files,{onProgress:(name,percent)=>self.postMessage({id,type:'progress',message:`Đang mở từ điển đã lưu: ${name}`,percent})});
      for(const {key,value} of e.data.overrides??[])next.engine.add('vp',`${key}=${value}`);
      engine=next.engine;
      self.postMessage({id,type:'result',result:next.stats});
    }else if(type==='convert')self.postMessage({id,type:'result',result:engine.convert(e.data.text,e.data.names,e.data.options)});
    else if(type==='lookup')self.postMessage({id,type:'result',result:engine.lookup(e.data.source)});
  }catch(error){self.postMessage({id,type:'error',message:error instanceof Error?error.message:String(error)});}
};
