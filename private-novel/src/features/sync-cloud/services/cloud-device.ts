import {db} from '../../../core/db';

export const CLOUD_DEVICE_TOKEN_KEY='cloud-device-token';
const TOKEN=/^[a-f0-9]{64}$/;
const INVALID_LINK='Liên kết kết nối thiết bị không hợp lệ.';
const STORAGE_ERROR='Không thể lưu kết nối thiết bị. Hãy kiểm tra bộ nhớ trình duyệt và thử lại.';
function validToken(value:unknown):value is string{return typeof value==='string'&&value.length===64&&TOKEN.test(value);}
function acknowledgementsPrefix(){return `cloud-uploaded:${location.origin}:`;}
async function clearAcknowledgements(){await db.settings.where('key').startsWith(acknowledgementsPrefix()).delete();await db.settings.where('key').startsWith(`cloud-original-uploaded:${location.origin}:`).delete();}

/** Fragment credentials never become request URLs or remain in browser history. */
export async function connectCloudDeviceFromLocation():Promise<boolean>{
  const fragment=location.hash;
  if(!fragment.startsWith('#cloud-connect'))return false;
  // This runs before any await, validation or IndexedDB access. Keep the rest
  // of the address unchanged; query parameters are never credential input.
  try{history.replaceState(history.state,'',`${location.pathname}${location.search}`);}catch{throw new Error(INVALID_LINK);}
  const token=fragment.slice('#cloud-connect='.length);
  if(!fragment.startsWith('#cloud-connect=')||!validToken(token))throw new Error(INVALID_LINK);
  try{
    await db.transaction('rw',db.settings,async()=>{
      const current=await db.settings.get(CLOUD_DEVICE_TOKEN_KEY);
      if(current?.value!==token)await clearAcknowledgements();
      await db.settings.put({key:CLOUD_DEVICE_TOKEN_KEY,value:token});
    });
  }catch{throw new Error(STORAGE_ERROR);}
  return true;
}
export async function getCloudDeviceToken():Promise<string|undefined>{
  try{const row=await db.settings.get(CLOUD_DEVICE_TOKEN_KEY);return validToken(row?.value)?row.value:undefined;}
  catch{throw new Error('Không thể đọc kết nối thiết bị. Hãy kiểm tra bộ nhớ trình duyệt.');}
}
export async function forgetCloudDevice():Promise<void>{
  try{await db.transaction('rw',db.settings,async()=>{await clearAcknowledgements();await db.settings.delete(CLOUD_DEVICE_TOKEN_KEY);});}
  catch{throw new Error('Không thể xóa kết nối thiết bị. Hãy kiểm tra bộ nhớ trình duyệt và thử lại.');}
}
export function buildCloudDeviceLink(token:string):string{
  if(!validToken(token))throw new Error(INVALID_LINK);
  return `${location.origin}/#cloud-connect=${token}`;
}
let startupConnection:Promise<boolean>|undefined;
/** One shared bootstrap survives React StrictMode effect replay. */
export function initializeCloudDevice():Promise<boolean>{return startupConnection??=connectCloudDeviceFromLocation();}
