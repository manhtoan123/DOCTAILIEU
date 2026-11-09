import {db} from '../../../core/db';
import {readNameScope,saveScopedBookNames} from '../../names-convert/services/scoped-names';
import {canonicalNameKey,resolveNameKey,formatNameEntry} from '../../names-convert/services/name-format';
import type {NameEntry} from '../../../core/domain';
export async function saveDiscoveredNames(input:{bookId:string;chapterId:string;revision:number;source:string;album:string|null;baseline:NameEntry[]},rows:{key:string;value:string}[]){
 if(!rows.length)throw Error('Chọn ít nhất một Name trước khi lưu.');
 const unique=new Set<string>();for(const row of rows){const key=canonicalNameKey(row.key);if(unique.has(key))throw Error('Mỗi chữ Trung chỉ được chọn một nghĩa.');unique.add(key);if(!input.source.includes(key)||!row.value.trim()||/[\r\n\u0000-\u001f]/u.test(row.value)||row.value.length>4096)throw Error('Name không khớp nguồn hoặc nghĩa Việt không hợp lệ.');}
 return db.transaction('rw',[db.books,db.chapters,db.names,db.settings],async()=>{
  const book=await db.books.get(input.bookId);if(!book||book.hiddenChapterIds?.includes(input.chapterId))throw Error('Chương không còn khả dụng để lưu Name.');
  const chapter=await db.chapters.get(input.chapterId);if(chapter?.bookId!==input.bookId||chapter.revision!==input.revision||chapter.text!==input.source)throw Error('Chương đã thay đổi. Quét lại trước khi lưu Name.');
  const scope=await readNameScope(input.bookId);if((scope.album??null)!==input.album)throw Error('Kho Name/Album đã thay đổi. Mở lại danh sách trước khi lưu.');
  for(const row of rows){
   const key=canonicalNameKey(row.key),matching=(values:NameEntry[])=>values.filter(n=>canonicalNameKey(n.key)===key).map(n=>[n.id,n.key,n.value]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   if(JSON.stringify(matching(scope.rows))!==JSON.stringify(matching(input.baseline)))throw Error(`Name ${key} đã đổi ở nơi khác. Mở lại danh sách để đối chiếu.`);
   resolveNameKey(key,scope.rows);
  }
  return saveScopedBookNames(input.bookId,rows.map(r=>formatNameEntry(r.key,r.value)).join('\n'),input.album);
 });
}
