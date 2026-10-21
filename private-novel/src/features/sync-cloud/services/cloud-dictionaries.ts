import {db} from '../../../core/db';
import {loadSharedDictionaries,SHARED_DICTIONARY_PREFIX} from './shared-dictionaries';
import {applyPendingCommonNames} from './shared-common-names';
import {dictionaryKinds,type DictKind,type DictionaryFile} from '../../../core/domain';
import {getCloudDeviceToken} from './cloud-device';
import {hashBlob} from '../../import-export/services/backup';
import {readDictionary} from '../../names-convert/services/dictionary-reader';

const MAX=80*1048576;
type Entry={kind:DictKind;name:string;sha256:string;bytes:number};
const loading=new Map<string,Promise<number>>();
async function bytes(response:Response,limit:number):Promise<Blob>{
  if(!response.body)throw new Error('Từ điển trên kho thiếu nội dung.');
  const reader=response.body.getReader();const parts:Uint8Array<ArrayBuffer>[]=[];let total=0;
  try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>limit)throw new Error('Từ điển vượt kích thước khai báo.');parts.push(new Uint8Array(part.value));}}finally{await reader.cancel();reader.releaseLock();}
  return new Blob(parts);
}
function entry(value:unknown):Entry{
  const e=value as Partial<Entry>|null;
  if(!e||!dictionaryKinds.includes(e.kind as DictKind)||typeof e.name!=='string'||!e.name.trim()||e.name.length>300||/[\u0000-\u001f\u007f]/.test(e.name)||typeof e.sha256!=='string'||!/^[a-f0-9]{64}$/.test(e.sha256)||!Number.isSafeInteger(e.bytes)||e.bytes!<=0||e.bytes!>MAX)throw new Error('Danh sách từ điển trên kho không hợp lệ.');
  return e as Entry;
}
/** Install only missing kinds. Never replace a dictionary chosen on this device. */
export function installDefaultDictionaries(onStatus:(text:string)=>void=()=>{},kinds:readonly DictKind[]=dictionaryKinds):Promise<number>{
  const key=kinds.join(',');if(loading.has(key))return loading.get(key)!;const job=(async()=>{
    await loadSharedDictionaries(onStatus,kinds);
    await applyPendingCommonNames();
    const token=await getCloudDeviceToken();
    const check=async()=>{if(await getCloudDeviceToken()!==token)throw new Error('Kết nối kho đã thay đổi; chưa lưu từ điển.');};
    const request=async(path:string)=>{await check();const response=await fetch(`/api/cloud/dictionaries${path}`,{headers:token?{Authorization:`Bearer ${token}`}:{},credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(120000)});await check();return response;};
    const manifestResponse=await request('');
    if(manifestResponse.status===401||manifestResponse.status===404)return 0;
    if(!manifestResponse.ok)throw new Error(`Chưa tải được từ điển sẵn (${manifestResponse.status}).`);
    const manifest=JSON.parse(await (await bytes(manifestResponse,16384)).text());
    if(manifest.version!==1||!Array.isArray(manifest.dictionaries)||manifest.dictionaries.length>10)throw new Error('Danh sách từ điển trên kho không hợp lệ.');
    const entries:Entry[]=manifest.dictionaries.map(entry);const seen=new Set<string>();
    for(const e of entries){if(seen.has(e.kind))throw new Error('Danh sách từ điển trùng loại.');seen.add(e.kind);}
    const rows:DictionaryFile[]=[];
    for(const e of entries){
      if(!kinds.includes(e.kind)||await db.settings.get(SHARED_DICTIONARY_PREFIX+e.kind)||await db.dictionaries.get(e.kind))continue;
      onStatus(`Đang chuẩn bị ${e.name} lần đầu…`);
      const response=await request(`/${e.kind}/${e.sha256}`);
      if(!response.ok)throw new Error(`Chưa tải được ${e.name} (${response.status}).`);
      const blob=await bytes(response,e.bytes);
      if(blob.size!==e.bytes)throw new Error(`${e.name}: tải chưa đủ dữ liệu (${blob.size}/${e.bytes} byte); hãy thử mở truyện lại.`);
      if(await hashBlob(blob)!==e.sha256)throw new Error(`${e.name}: dữ liệu tải về không khớp checksum.`);
      const report=await readDictionary(e.kind,blob,e.name);if(!report.valid)throw new Error(`${e.name}: không có từ điển hợp lệ.`);
      rows.push({...e,blob,updatedAt:Date.now()});
    }
    const installed=await db.transaction('rw',db.settings,db.dictionaries,async()=>{
      await check();let installed=0;
      for(const row of rows)if(!await db.dictionaries.get(row.kind)&&!await db.settings.get(SHARED_DICTIONARY_PREFIX+row.kind)){await db.dictionaries.add(row);installed++;}
      return installed;
    });
    await applyPendingCommonNames();return installed;
  })().finally(()=>{loading.delete(key);});loading.set(key,job);return job;
}
