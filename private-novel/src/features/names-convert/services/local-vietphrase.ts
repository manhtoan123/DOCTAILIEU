import {db} from '../../../core/db';
import {uid} from '../../../core/domain';
import {convertBackend} from './convert-server-client';

const settingKey='local-vietphrase-overrides';
const entryLimit=4096;
const sizeLimit=64000;
type Entry={key:string;value:string};
type Overrides={revision:string;entries:Entry[]};
const emptyOverrides:Overrides={revision:'',entries:[]};

function validEntry(key:string,value:string) {
  return key.length<=256&&/^\p{Script=Han}+$/u.test(key)&&value.length<=2048&&
    !/[\p{Cc}\p{Cs}\u2028\u2029]/u.test(value)&&!/^\[i\]/i.test(value)&&/[^\s/;]/u.test(value);
}
function withinLimit(entries:Entry[]) {
  if(entries.length>entryLimit)return false;
  // Count the same UTF-16 text as one key=value record per line.
  return entries.reduce((size,{key,value})=>size+key.length+value.length+2,-1)<=sizeLimit;
}

export async function readLocalVietphrase():Promise<Overrides> {
  const row=await db.settings.get(settingKey);
  if(!row)return emptyOverrides;
  const stored=row.value as Partial<Overrides>|null;
  const error='Vietphrase đã lưu trên thiết bị không hợp lệ.';
  if(typeof stored?.revision!=='string'||!stored.revision||!Array.isArray(stored.entries)||!stored.entries.length||stored.entries.length>entryLimit)
    throw new Error(error);
  const keys=new Set<string>();
  for(const entry of stored.entries){
    if(typeof entry?.key!=='string'||typeof entry?.value!=='string'||entry.value!==entry.value.trim()||!validEntry(entry.key,entry.value)||keys.has(entry.key))
      throw new Error(error);
    keys.add(entry.key);
  }
  if(!withinLimit(stored.entries))throw new Error(error);
  return {revision:stored.revision,entries:stored.entries};
}

export async function saveLocalVietphrases(selected:readonly Entry[]):Promise<void> {
  if(!selected.length)return;
  if(convertBackend()!=='local')throw new Error('Hãy chọn Convert trên thiết bị này để lưu Vietphrase.');
  if(selected.length>entryLimit)throw new Error('Vietphrase đã chọn vượt 4.096 mục.');
  const updates=new Map<string,string>();
  for(const row of selected){
    const key=row.key.trim(),value=row.value.trim();
    if(/[\r\n\u2028\u2029]/u.test(row.key+row.value)||!validEntry(key,value))
      throw new Error('Vietphrase cần một cụm chữ Hán tối đa 256 ký tự và nghĩa tối đa 2.048 ký tự trên một dòng.');
    if(updates.has(key)&&updates.get(key)!==value)throw new Error('Mỗi cụm chữ Trung chỉ chọn một nghĩa Vietphrase.');
    updates.set(key,value);
  }
  await db.transaction('rw',db.settings,async()=>{
    const {entries}=await readLocalVietphrase();
    if(convertBackend()!=='local')throw new Error('Đích Convert đã thay đổi.');
    const pairs=new Map(entries.map(entry=>[entry.key,entry.value]));
    let changed=false;
    for(const [key,value] of updates)if(pairs.get(key)!==value){pairs.set(key,value);changed=true;}
    if(!changed)return;
    const merged=[...pairs].map(([key,value])=>({key,value}));
    if(!withinLimit(merged))throw new Error('Vietphrase đã lưu vượt 4.096 mục hoặc 64.000 ký tự UTF-16.');
    await db.settings.put({key:settingKey,value:{revision:uid(),entries:merged}});
  });
}

export function saveLocalVietphrase(source:string,meaning:string):Promise<void>{
  return saveLocalVietphrases([{key:source,value:meaning}]);
}
