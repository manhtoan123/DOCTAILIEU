import type {DictKind} from '../../../core/domain';
import {readDictionary,type DictionaryStats} from './dictionary-reader';
import {LanguageEngine} from './language';
import {PACKED_KINDS,PackedBuilder,PackedIndex} from './packed-index';
import {packedSignature,readPackedCache,writePackedCache,prunePackedCache} from './packed-cache';

export interface EngineDictionary {kind:DictKind;blob:Blob;name:string;sha256?:string;updatedAt?:number}

export async function loadLanguageEngine(
  files:Iterable<EngineDictionary>|AsyncIterable<EngineDictionary>,
  callbacks:{
    onProgress?:(name:string,percent:number)=>void;
    onDictionary?:(report:DictionaryStats)=>void;
    onEntry?:(kind:DictKind)=>void;
    packed?:{enabled:true;idb?:IDBFactory;normalizeKey:(key:string)=>string};
  }={},
) {
  const {onProgress,onDictionary,onEntry,packed}=callbacks;
  const engine=new LanguageEngine();
  const stats:DictionaryStats[]=[];
  const seen=new Set<DictKind>();
  for await(const file of files){
    seen.add(file.kind);
    const kind=file.kind==='names2'&&/^(DaiTuNhanXung|Pronouns|DaiTu)\.txt$/i.test(file.name)?'pronouns':file.kind;
    if(packed?.enabled&&(PACKED_KINDS as readonly string[]).includes(kind)&&file.sha256&&file.updatedAt!==undefined){
      const signature=packedSignature({sha256:file.sha256,updatedAt:file.updatedAt}),hit=await readPackedCache(kind as typeof PACKED_KINDS[number],signature,packed.idb);
      if(hit){engine.setPacked(kind as 'vp'|'hanviet',new PackedIndex(hit.data,packed.normalizeKey));stats.push(hit.stats);onProgress?.(file.name,100);onDictionary?.(hit.stats);continue;}
      const builder=new PackedBuilder(packed.normalizeKey),report=await readDictionary(kind,file.blob,file.name,line=>{onEntry?.(kind);const entry=line.trim().replace(/^\uFEFF/,'');const p=entry.indexOf('=');if(p>0)builder.add(entry.slice(0,p).trim(),entry.slice(p+1).trim());},percent=>onProgress?.(file.name,percent));
      const data=await builder.build(percent=>onProgress?.(file.name,percent));stats.push(report);onDictionary?.(report);await writePackedCache({kind:kind as typeof PACKED_KINDS[number],signature,stats:report,data},packed.idb);engine.setPacked(kind as 'vp'|'hanviet',new PackedIndex(data,packed.normalizeKey));continue;
    }
    const report=await readDictionary(kind,file.blob,file.name,line=>{onEntry?.(kind);engine.add(kind,line);},
      onProgress?percent=>onProgress(file.name,percent):undefined);
    onDictionary?.(report);
    stats.push(report);
  }
  if(packed?.enabled)await prunePackedCache(seen,packed.idb);
  return {engine,stats};
}
