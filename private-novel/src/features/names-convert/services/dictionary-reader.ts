import {parseEntry,type DictKind} from '../../../core/domain';
export interface DictionaryStats {name:string;valid:number;invalid:number;ignored:number}
export function dictionaryEntry(kind:DictKind,line:string):[string,string]|null {
  const raw=line.trim().replace(/^\uFEFF/,'');
  const entry=kind==='blacklist'&&raw&&!raw.startsWith('#')?[raw.split('=')[0].trim(),''] as [string,string]:parseEntry(line);if(!entry)return null;
  const [key,value]=entry;
  if(!key||key.length>256||value.length>65536)return null;
  if(kind==='rules'){
    if(!key.includes('{0}'))return null;
    const parts=key.split('{0}');
    if(parts.length!==2)return null;
    if(!parts[0]&&!parts[1])return null;
  }
  return entry;
}
/** Stream validation without retaining a second dictionary index on the main thread. */
export async function readDictionary(kind:DictKind,blob:Blob,name:string,onLine?:(line:string)=>void,onProgress?:(percent:number)=>void):Promise<DictionaryStats>{
  const stats={name,valid:0,invalid:0,ignored:0};let tail='';
  const decoder=new TextDecoder('utf-8',{fatal:true});
  const line=(text:string)=>{
    if(!text.trim()||text.trim().replace(/^\uFEFF/,'').startsWith('#')){stats.ignored++;return;}
    if(dictionaryEntry(kind,text)){stats.valid++;onLine?.(text);}else stats.invalid++;
  };
  for(let offset=0;offset<blob.size;offset+=262144){
    tail+=decoder.decode(await blob.slice(offset,offset+262144).arrayBuffer(),{stream:true});
    let start=0;let end:number;
    while((end=tail.indexOf('\n',start))>=0){
      if(end-start>65536)throw new Error(`Dòng từ điển quá dài: ${name}`);
      line(tail.slice(start,end));start=end+1;
    }
    tail=tail.slice(start);if(tail.length>65536)throw new Error(`Dòng từ điển quá dài: ${name}`);
    onProgress?.(Math.round(Math.min(blob.size,offset+262144)/blob.size*100));
  }
  tail+=decoder.decode();if(tail.length>65536)throw new Error(`Dòng từ điển quá dài: ${name}`);
  if(tail)line(tail);return stats;
}
