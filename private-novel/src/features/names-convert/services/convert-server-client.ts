import {useSyncExternalStore} from 'react';
import {hashBlob} from '../../import-export/services/backup';
import type {DictKind} from '../../../core/domain';
import type {ConvertOptions,Token} from './language';
import {
  convertServerOrigin,isProfileId,MAX_DICTIONARY_BYTES,MAX_MANIFEST_BYTES,MAX_PROFILE_BYTES,MAX_PROFILE_FILES,
  PROFILE_TYPE,profileFiles,type ProfileStatus,
} from './convert-server-protocol';

const key='convert-backend';
type Backend='local'|'server';
export const chooseBackendMessage='Hãy chọn đích Convert trong Cài đặt → Từ điển.';
export const serverOrigin=convertServerOrigin(import.meta.env.VITE_CONVERT_SERVER_ORIGIN);
const listeners=new Set<()=>void>();

export function convertBackend():Backend|'unset' {
  try {
    const saved=localStorage.getItem(key);
    if(saved==='server'||saved==='local')return saved;
  } catch {/* Require an explicit choice when a server is configured. */}
  return serverOrigin?'unset':'local';
}
function subscribe(listener:()=>void){
  const storage=(event:StorageEvent)=>{if(!event.key||event.key===key)listener();};
  window.addEventListener('storage',storage);
  listeners.add(listener);
  return ()=>{listeners.delete(listener);window.removeEventListener('storage',storage);};
}
export function useConvertBackend(){return useSyncExternalStore(subscribe,convertBackend);}
export function setConvertBackend(backend:Backend){
  localStorage.setItem(key,backend);
  for(const listener of listeners)listener();
}

const errors:Record<string,string>={
  loading:'Máy chủ đang nạp chỉ mục từ điển. Hãy thử lại sau.',
  empty:'Máy chủ chưa có bộ từ điển. Hãy tải TXT lên trong Cài đặt → Từ điển.',
  error:'Máy chủ không mở được bộ từ điển. Hãy kiểm tra trạng thái hoặc thay bộ TXT.',
  invalid_profile:'Bộ TXT sai định dạng, sai SHA-256 hoặc vượt giới hạn chỉ mục. Hãy kiểm tra tệp rồi thử lại.',
  invalid_input:'Dữ liệu Convert sai định dạng hoặc vượt giới hạn của máy chủ.',
  request_too_large:'Dữ liệu vượt giới hạn máy chủ. Hãy chọn bộ TXT nhỏ hơn hoặc chia đoạn cần Convert.',
  text_too_large:'Máy chủ nhận tối đa 128.000 ký tự UTF-16. Với chương dài hơn, hãy chọn Thiết bị này trong Cài đặt → Từ điển.',
  output_limit:'Đoạn này vượt giới hạn xử lý của máy chủ. Hãy chia đoạn hoặc chọn Thiết bị này.',
  update_in_progress:'Máy chủ đang cập nhật từ điển. Hãy thử lại sau.',
  profile_changed:'Bộ từ điển trên máy chủ đã thay đổi. Hãy kiểm tra trạng thái trước khi thử lại.',
  commit_unconfirmed:'Chưa xác nhận được lưu bền vững. Hãy kiểm tra lại trạng thái máy chủ.',
  busy:'Máy chủ Convert đang bận. Hãy thử lại.',
};

async function request(path:string,init:RequestInit={},timeout=60_000){
  if(!serverOrigin)throw new Error('Trang này chưa cấu hình địa chỉ máy chủ Convert.');
  const deadline=AbortSignal.timeout(timeout);
  try {
    const response=await fetch(serverOrigin+'/v1/'+path,{
      ...init,credentials:'include',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
      signal:init.signal?AbortSignal.any([init.signal,deadline]):deadline,
    });
    const result:unknown=await response.json();
    if(response.ok||path==='health'&&response.status===503&&result&&typeof result==='object'&&'state' in result)return result;
    const code=result&&typeof result==='object'&&'error' in result?String(result.error):'';
    throw new ConvertServerError(Object.hasOwn(errors,code)?errors[code]:`Máy chủ Convert trả lỗi (${response.status}). Hãy thử lại.`);
  } catch(error){
    if(error instanceof ConvertServerError)throw error;
    if(init.signal?.aborted)throw new Error('Đã ngừng chờ. Hãy kiểm tra lại trạng thái trước khi cập nhật lần nữa.');
    if(deadline.aborted)throw new Error('Máy chủ Convert phản hồi quá chậm. Hãy thử lại.');
    throw new Error('Không kết nối được máy chủ Convert. Hãy kiểm tra mạng và chứng chỉ thiết bị rồi thử lại.');
  }
}
class ConvertServerError extends Error {}

function status(value:unknown):ProfileStatus {
  const row=value as Partial<ProfileStatus>|null;
  if(!row||!['ready','empty','loading','error'].includes(row.state??'')||row.profile!==null&&!isProfileId(row.profile))
    throw new Error('Trạng thái máy chủ Convert không hợp lệ.');
  return {...row,files:profileFiles(row.files)} as ProfileStatus;
}
export async function readServerProfile(){return status(await request('health'));}

export async function replaceServerProfile(files:{kind:DictKind;file:File}[],expected:ProfileStatus,signal:AbortSignal){
  if(files.length>MAX_PROFILE_FILES||files.some(({file})=>!file.size||file.size>MAX_DICTIONARY_BYTES)||
    files.reduce((total,{file})=>total+file.size,0)>MAX_PROFILE_BYTES)
    throw new Error('Tối đa 32 file TXT, 80 MiB mỗi file và 128 MiB mỗi bộ. Chọn file có nội dung.');
  const entries=[];
  for(const {kind,file} of files){
    signal.throwIfAborted();
    entries.push({kind,name:file.name,sha256:await hashBlob(file),bytes:file.size});
  }
  const manifest=new TextEncoder().encode(JSON.stringify(profileFiles(entries)));
  if(manifest.length>MAX_MANIFEST_BYTES)throw new Error('Tên file làm danh sách từ điển quá dài.');
  const header=new ArrayBuffer(4);
  new DataView(header).setUint32(0,manifest.length);
  return status(await request('profile',{
    method:'PUT',headers:{'Content-Type':PROFILE_TYPE,'If-Match':`"${expected.profile??'none'}"`},
    body:new Blob([header,manifest,...files.map(({file})=>file)]),signal,
  },300_000));
}

function post(path:string,body:unknown,signal?:AbortSignal){
  return request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
}
type Meaning={meanings:string[];hanviet:string;english?:string[];names?:string[]};
export async function convertOnServer(text:string,names:{key:string;value:string}[],options:ConvertOptions,signal?:AbortSignal){
  return await post('convert',{text,names,options},signal) as Token[];
}
export async function convertAndLookupOnServer(text:string,names:{key:string;value:string}[],options:ConvertOptions,signal:AbortSignal){
  const result=await post('convert',{text,names,options,includeLookup:true},signal) as {tokens:Token[];meaning:Meaning};
  return [result.meaning,result.tokens] as const;
}
export async function lookupOnServer(source:string){
  return await post('lookup',{source}) as Meaning;
}
