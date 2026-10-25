import {db} from '../../../core/db';
import {getCloudDeviceToken} from '../../sync-cloud/services/cloud-device';
interface Alias {bookId:string;code:number}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const prefix=()=>`reader-route:${location.origin}:`;
function valid(value:unknown):value is Alias{const row=value as Alias;return !!row&&typeof row.bookId==='string'&&uuid.test(row.bookId)&&Number.isSafeInteger(row.code)&&row.code>=10001&&row.code<=999999999999;}
async function cached(kind:'book'|'code',id:string|number){
 const value=(await db.settings.get(prefix()+kind+':'+id))?.value;
 if(!valid(value)||(kind==='book'?value.bookId!==id:value.code!==id))return;
 const reverse=(await db.settings.get(prefix()+(kind==='book'?'code:'+value.code:'book:'+value.bookId)))?.value;
 return valid(reverse)&&reverse.bookId===value.bookId&&reverse.code===value.code?value:undefined;
}
async function remember(row:Alias){await db.transaction('rw',db.settings,async()=>{
 const book=(await db.settings.get(prefix()+'book:'+row.bookId))?.value,code=(await db.settings.get(prefix()+'code:'+row.code))?.value;
 if(valid(book)&&book.code!==row.code||valid(code)&&code.bookId!==row.bookId)throw Error('Mã truyện không khớp bản đã lưu.');
 await db.settings.bulkPut([{key:prefix()+'book:'+row.bookId,value:row},{key:prefix()+'code:'+row.code,value:row}]);
});}
async function request(query:string,method:'GET'|'POST'){
 const token=await getCloudDeviceToken(),response=await fetch('/api/reader-route?'+query,{method,headers:token?{Authorization:`Bearer ${token}`}:{},credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error(`Chưa tra được mã truyện (${response.status}).`);
 const row:unknown=await response.json();if(!valid(row))throw Error('Mã truyện máy chủ không hợp lệ.');return row;
}
const pending=new Map<string,Promise<number|undefined>>();
export function ensureBookNumber(bookId:string):Promise<number|undefined>{
 if(!uuid.test(bookId))return Promise.resolve(undefined);
 const old=pending.get(bookId);if(old)return old;
 const work=(async()=>{try{const local=await cached('book',bookId);if(local)return local.code;if(!navigator.onLine)return;const row=await request('book='+encodeURIComponent(bookId),'POST');if(row.bookId!==bookId)throw Error('Mã truyện không khớp.');await remember(row);return row.code;}catch{return undefined;}})().finally(()=>pending.delete(bookId));pending.set(bookId,work);return work;
}
export async function bookIdForNumber(code:number){
 const local=await cached('code',code);if(local)return local.bookId;
 const row=await request('code='+code,'GET');if(row.code!==code)throw Error('Mã truyện không khớp.');await remember(row);return row.bookId;
}
