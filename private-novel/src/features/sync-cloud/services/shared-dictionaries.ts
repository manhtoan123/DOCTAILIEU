import {db} from '../../../core/db';
import {hashBlob} from '../../import-export/services/backup';
import {readDictionary} from '../../names-convert/services/dictionary-reader';
import {dictionaryKinds,type DictKind,type DictionaryFile} from '../../../core/domain';
import {validateSharedRecord,type SharedRecord} from './shared-state-schema';
export const SHARED_DICTIONARY_PREFIX='shared-dictionary:';
const stashKey=(hash:string)=>'shared-dictionary-blob:'+hash;
export interface SharedDictionary {name:string;sha256:string;bytes:number;parts:number}
/** Caller owns a settings transaction; keep upload bytes if the current file changes. */
export async function markSharedDictionary(row:DictionaryFile){
 const value:SharedDictionary={name:row.name,sha256:row.sha256,bytes:row.blob.size,parts:Math.ceil(row.blob.size/1048576)};
 const record=validateSharedRecord({kind:'dictionary',key:row.kind,value});
 await db.settings.put({key:SHARED_DICTIONARY_PREFIX+row.kind,value:record});await db.settings.put({key:stashKey(row.sha256),value:row.blob});
}
export async function removeSharedDictionary(kind:DictKind){await db.transaction('rw',[db.dictionaries,db.settings],async()=>{await db.dictionaries.delete(kind);await db.settings.put({key:SHARED_DICTIONARY_PREFIX+kind,value:{kind:'dictionary',key:kind,value:null}});});}
async function bounded(response:Response,limit:number){
 const reader=response.body?.getReader();if(!reader)throw Error('Từ điển thiếu nội dung.');let size=0;const parts:Uint8Array<ArrayBuffer>[]=[];try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit)throw Error('Từ điển vượt kích thước khai báo.');parts.push(new Uint8Array(part.value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return new Blob(parts);
}
/** Migrate selected custom dictionaries once; stock dictionary bytes stay on their existing endpoint. */
export async function initializeSharedDictionaries(){
 if(await db.settings.get('shared-dictionaries-initialized'))return true;
 const rows:DictionaryFile[]=[];for(const row of await db.dictionaries.toArray())if(!await db.settings.get(SHARED_DICTIONARY_PREFIX+row.kind))rows.push(row);if(!rows.length){await db.settings.put({key:'shared-dictionaries-initialized',value:true});return true;}
 let defaults:{kind:string;sha256:string}[]=[];
 try{const response=await fetch('/api/cloud/dictionaries',{credentials:'same-origin',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error();const manifest=JSON.parse(await(await bounded(response,16384)).text());if(manifest.version!==1||!Array.isArray(manifest.dictionaries)||manifest.dictionaries.length>10)throw Error();defaults=manifest.dictionaries;}catch{return false;}
 await db.transaction('rw',[db.settings,db.dictionaries],async()=>{for(const row of rows){const current=await db.dictionaries.get(row.kind);if(current?.sha256!==row.sha256||await db.settings.get(SHARED_DICTIONARY_PREFIX+row.kind))continue;if(!defaults.some(d=>d.kind===row.kind&&d.sha256===row.sha256))await markSharedDictionary(row);}await db.settings.put({key:'shared-dictionaries-initialized',value:true});});
 return true;
}
export async function publishSharedDictionary(record:SharedRecord){
 if(record.value===null)return;const value=record.value as SharedDictionary,url='/api/state-files/'+value.sha256;
 const head=await fetch(url,{method:'HEAD',credentials:'same-origin',signal:AbortSignal.timeout(30000)});
 if(head.ok&&head.headers.get('X-Content-SHA256')===value.sha256&&Number(head.headers.get('Content-Length'))===value.bytes){await db.settings.delete(stashKey(value.sha256));return;}
 const stored=(await db.settings.get(stashKey(value.sha256)))?.value;
 const current=await db.dictionaries.get(record.key as DictKind),blob=stored instanceof Blob?stored:current?.sha256===value.sha256?current.blob:undefined;
 if(!blob||blob.size!==value.bytes||await hashBlob(blob)!==value.sha256)throw Error('File từ điển đã đổi trước khi tải lên; bản sửa vẫn giữ trên máy.');
 const response=await fetch(url,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-Dictionary-Bytes':String(blob.size)},body:blob,signal:AbortSignal.timeout(180000)});
 const reply=JSON.parse(await(await bounded(response,4096)).text());if(!response.ok||reply.sha256!==value.sha256||reply.bytes!==blob.size)throw Error('Chưa đồng bộ được file từ điển; bản trên máy vẫn được giữ.');
 await db.settings.delete(stashKey(value.sha256));
}
const loading=new Map<string,Promise<number>>();
/** Explicit Convert/settings only. No text bytes are fetched by metadata synchronization. */
export function loadSharedDictionaries(onStatus:(text:string)=>void=()=>{},kinds:readonly DictKind[]=dictionaryKinds){const key=kinds.join(',');if(loading.has(key))return loading.get(key)!;const job=(async()=>{
 let count=0;for(const setting of await db.settings.where('key').startsWith(SHARED_DICTIONARY_PREFIX).toArray()){
  const record=validateSharedRecord(setting.value);if(record.value===null||!kinds.includes(record.key as DictKind))continue;const value=record.value as SharedDictionary,kind=record.key as DictKind;if(!dictionaryKinds.includes(kind))throw Error('Loại từ điển không hợp lệ.');
  const before=await db.dictionaries.get(kind);if(before?.sha256===value.sha256)continue;
  const patched=kind==='names'?(await db.settings.get('shared-common-applied'))?.value as {baseSha256?:string;sha256:string}|undefined:undefined;if(patched?.baseSha256===value.sha256&&patched.sha256===before?.sha256)continue;
  onStatus(`Đang tải ${value.name} đã đồng bộ…`);const response=await fetch('/api/state-files/'+value.sha256,{credentials:'same-origin',signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('File từ điển chưa tải được.');
  const blob=await bounded(response,value.bytes);if(blob.size!==value.bytes||await hashBlob(blob)!==value.sha256)throw Error('Từ điển tải về không khớp checksum.');if(!(await readDictionary(kind,blob,value.name)).valid)throw Error('Từ điển tải về không hợp lệ.');
  await db.transaction('rw',[db.settings,db.dictionaries],async()=>{const latest=await db.settings.get(setting.key),current=await db.dictionaries.get(kind);if(JSON.stringify(latest?.value)!==JSON.stringify(setting.value)||current?.sha256!==before?.sha256||current?.updatedAt!==before?.updatedAt)return;await db.dictionaries.put({kind,name:value.name,sha256:value.sha256,blob,updatedAt:Date.now()});count++;});
 }return count;
})().finally(()=>{loading.delete(key);});loading.set(key,job);return job;}
