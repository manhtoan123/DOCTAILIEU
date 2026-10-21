import {db} from '../../../core/db';
import {sharedCommonNames,SHARED_COMMON_PREFIX} from '../../sync-cloud/services/shared-common-names';
import {markSharedDictionary,SHARED_DICTIONARY_PREFIX} from '../../sync-cloud/services/shared-dictionaries';
import {dictionaryEntry,readDictionary} from './dictionary-reader';
import {hashBlob} from '../../import-export/services/backup';
import {readConvertNames,deleteConvertName,type ConvertName} from './convert-names';

export async function readCommonNames():Promise<ConvertName[]>{
  const entries=new Map<string,string>();const row=await db.dictionaries.get('names');
  if(row)await readDictionary('names',row.blob,row.name,line=>{const p=dictionaryEntry('names',line);if(p)entries.set(...p);});
  for(const record of await sharedCommonNames())if(record.value===null)entries.delete(record.key);else entries.set(record.key,record.value as string);
  for(const entry of await readConvertNames())entries.set(entry.key,entry.value);
  return [...entries].map(([key,value])=>({key,value}));
}
/** Hash outside the transaction, then compare-and-swap. Keep comments/unrelated lines. */
export async function editCommonName(key:string,value:string|null):Promise<void>{
  if(!key.trim()||key!==key.trim()||key.length>256||/[\r\n=]/.test(key)||key.startsWith('#')||value!==null&&(!value.trim()||value.length>4096||/[\r\n]/.test(value)))throw new Error('Name cần dạng chữ nguồn=tên Việt trên một dòng.');
  const original=await db.dictionaries.get('names');
  const lines=original?(await original.blob.text()).split(/\r?\n/):[];let written=false;
  const next=lines.flatMap(line=>{
    if(dictionaryEntry('names',line)?.[0]!==key)return [line];
    if(written||value===null)return [];
    written=true;return [`${key}=${value.trim()}`];
  });
  if(value!==null&&!written)next.push(`${key}=${value.trim()}`);
  const blob=new Blob([next.join('\n')],{type:'text/plain;charset=utf-8'});
  if(blob.size>80*1048576)throw new Error('Names chung vượt 80 MiB.');
  const sha256=await hashBlob(blob);
  await db.transaction('rw',[db.dictionaries,db.settings],async()=>{
    const current=await db.dictionaries.get('names');
    if(current?.sha256!==original?.sha256||current?.updatedAt!==original?.updatedAt)throw new Error('Names chung đã thay đổi ở tab khác; thử lại.');
    if(original&&!await db.settings.get(SHARED_DICTIONARY_PREFIX+'names'))await markSharedDictionary(original);
    await db.settings.put({key:SHARED_COMMON_PREFIX+encodeURIComponent(key),value:{kind:'common-name',key,value:value===null?null:value.trim()}});
    if(original||value!==null)await db.dictionaries.put({kind:'names',name:original?.name||'Names.txt',blob,sha256,updatedAt:Date.now()});
    await deleteConvertName(key);
  });
}
