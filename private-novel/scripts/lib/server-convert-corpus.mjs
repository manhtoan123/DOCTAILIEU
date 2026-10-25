import {createReadStream} from 'node:fs';
/** Same UTF-8 fatal/64KiB line contract as the browser dictionary reader. */
export async function* corpusLines(path){
 const decoder=new TextDecoder('utf8',{fatal:true});let tail='';
 for await(const chunk of createReadStream(path,{highWaterMark:262144})){
  tail+=decoder.decode(chunk,{stream:true});let start=0,end;
  while((end=tail.indexOf('\n',start))>=0){if(end-start>65536)throw Error('Dictionary line limit');yield tail.slice(start,end);start=end+1;}
  tail=tail.slice(start);if(tail.length>65536)throw Error('Dictionary line limit');
 }
 tail+=decoder.decode();if(tail.length>65536)throw Error('Dictionary line limit');if(tail)yield tail;
}
