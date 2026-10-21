import {db} from '../../../core/db';
import {markSharedDictionary} from '../../sync-cloud/services/shared-dictionaries';
import {hashBlob} from '../../import-export/services/backup';
import {readDictionary,type DictionaryStats} from './dictionary-reader';
import type {DictKind,DictionaryFile} from '../../../core/domain';
export async function installDictionaries(files:{file:File;kind:DictKind}[]):Promise<DictionaryStats[]>{
  const stats:DictionaryStats[]=[];const groups=new Map<DictKind,{file:File;kind:DictKind}[]>();
  for(const item of files){
    if(item.file.size>80*1048576)throw new Error(`${item.file.name} vượt 80 MB.`);
    const report=await readDictionary(item.kind,item.file,item.file.name);
    if(!report.valid)throw new Error(`${item.file.name}: không có dòng từ điển hợp lệ (key=value).`);
    stats.push(report);const group=groups.get(item.kind)||[];group.push(item);groups.set(item.kind,group);
  }
  const rows:DictionaryFile[]=[];
  for(const[kind,group]of groups){
    const blob=new Blob(group.flatMap(({file},i)=>i?['\n',file]:[file]),{type:'text/plain;charset=utf-8'});
    if(blob.size>80*1048576)throw new Error(`Tổng ${kind} vượt 80 MB.`);
    rows.push({kind,name:group.map(({file})=>file.name).join(' + '),blob,sha256:await hashBlob(blob),updatedAt:Date.now()});
  }
  await db.transaction('rw',[db.dictionaries,db.settings],async()=>{await db.dictionaries.bulkPut(rows);for(const row of rows)await markSharedDictionary(row);});
  return stats;
}
