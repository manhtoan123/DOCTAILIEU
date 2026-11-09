import type {DictKind} from '../../../core/domain';
import {readDictionary,type DictionaryStats} from './dictionary-reader';
import {LanguageEngine} from './language';

export interface EngineDictionary {kind:DictKind;blob:Blob;name:string}

export async function loadLanguageEngine(
  files:Iterable<EngineDictionary>|AsyncIterable<EngineDictionary>,
  callbacks:{
    onProgress?:(name:string,percent:number)=>void;
    onDictionary?:(report:DictionaryStats)=>void;
    onEntry?:(kind:DictKind)=>void;
  }={},
) {
  const {onProgress,onDictionary,onEntry}=callbacks;
  const engine=new LanguageEngine();
  const stats:DictionaryStats[]=[];
  for await(const file of files){
    const kind=file.kind==='names2'&&/^(DaiTuNhanXung|Pronouns|DaiTu)\.txt$/i.test(file.name)?'pronouns':file.kind;
    const report=await readDictionary(kind,file.blob,file.name,line=>{onEntry?.(kind);engine.add(kind,line);},
      onProgress?percent=>onProgress(file.name,percent):undefined);
    onDictionary?.(report);
    stats.push(report);
  }
  return {engine,stats};
}
