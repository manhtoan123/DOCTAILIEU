import {readEffectiveBookNames,validateAlbumNameCapacity} from '../../names-convert/services/scoped-names';
import {nameAlbumRoot} from '../../names-convert/services/album-name-schema';
import {validateHiddenChapterIds} from './chapter-state-schema';
import {validateSharedImage} from './shared-image-schema';
import {db} from '../../../core/db';
import {uid,type Book,type Chapter,type NameEntry} from '../../../core/domain';
import {readConvertNames} from '../../names-convert/services/convert-names';
import {assertStorageBudget} from '../../../core/storage';
import {validateEpubBook,validateEpubLayout} from '../../import-export/services/epub-layout-schema';
import {encodeCloudSnapshot,decodeCloudSnapshot,MAX_CLOUD_BYTES} from './cloud-snapshot-codec';
import {BOOK_METADATA_MAX_CHARS} from '../../../shared/constants/book-metadata';

export {MAX_CLOUD_BYTES} from './cloud-snapshot-codec';
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export interface CloudSnapshot {format:'thu-phong-cloud';version:1|2;book:Book;chapters:Chapter[];names:{key:string;value:string}[]}
export function normalizeCloudAlbum(value:unknown):string|undefined{
  if(value===undefined)return undefined;
  if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Album cloud không hợp lệ.');
  const album=value.trim();
  if(album.length>120)throw new Error('Album cloud vượt 120 ký tự.');
  try{encodeURIComponent(album);}catch{throw new Error('Album cloud không hợp lệ.');}
  return album||undefined;
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Bản cloud không hợp lệ.');return value as Record<string,unknown>;}
function text(value:unknown,max:number,field='Trường chữ'):string{
 if(typeof value!=='string')throw new Error(`${field}: cần dữ liệu dạng chữ, nhận ${value===null?'null':typeof value}.`);
 if(value.length>max)throw new Error(`${field}: ${value.length.toLocaleString('vi-VN')} ký tự, vượt mức ${max.toLocaleString('vi-VN')}; dữ liệu gốc được giữ nguyên.`);
 return value;
}
function integer(value:unknown,min=0):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min)throw new Error('Số trong bản cloud không hợp lệ.');return value;}
function id(value:unknown):string{const result=text(value,36);if(!UUID.test(result))throw new Error('ID cloud không hợp lệ.');return result;}
export function validateCloudSnapshot(value:unknown):CloudSnapshot{
  const data=object(value),row=object(data.book);
  if(data.format!=='thu-phong-cloud'||![1,2].includes(data.version as number)||row.status!=='ready')throw new Error('Định dạng cloud không được hỗ trợ.');
  const book:Book={id:id(row.id),title:text(row.title,BOOK_METADATA_MAX_CHARS,'Tên truyện'),author:text(row.author??'',BOOK_METADATA_MAX_CHARS,'Tác giả'),createdAt:integer(row.createdAt),updatedAt:integer(row.updatedAt),status:'ready',chapterCount:integer(row.chapterCount,data.version===2?0:1),charCount:integer(row.charCount)};
  if(row.hiddenChapterIds!==undefined){if(data.version!==2||row.epub)throw Error('Trạng thái chương cloud không được hỗ trợ.');book.hiddenChapterIds=validateHiddenChapterIds(row.hiddenChapterIds);}
  const album=normalizeCloudAlbum(row.album);if(album)book.album=album;
  if(row.cover!==undefined)book.cover=validateSharedImage(row.cover);
  if(row.epub!==undefined)book.epub=validateEpubBook(row.epub);
  if(row.displayTitle!==undefined)book.displayTitle=text(row.displayTitle,BOOK_METADATA_MAX_CHARS,'Tên truyện hiển thị/Convert');
  if(!book.title.trim()||!Array.isArray(data.chapters)||data.chapters.length>100000||!Array.isArray(data.names)||data.names.length>20000)throw new Error('Mục lục hoặc Name cloud không hợp lệ.');
  const chapterIds=new Set<string>();let chars=0;
  const chapters:Chapter[]=data.chapters.map((value,index)=>{
    const item=object(value);const chapter:Chapter={id:id(item.id),bookId:id(item.bookId),order:integer(item.order),title:text(item.title,1000,`Chương ${index+1}: tên chương`),text:text(item.text,128000,`Chương ${index+1}: nội dung`),revision:integer(item.revision,1),sourceId:''};
    if(item.displayTitle!==undefined)chapter.displayTitle=text(item.displayTitle,1000,`Chương ${index+1}: tên hiển thị/Convert`);
    if(chapter.bookId!==book.id||chapter.order!==index||chapterIds.has(chapter.id)||item.sourceId!=='')throw new Error('Chương cloud sai truyện, thứ tự hoặc trùng ID.');
    if(item.epub!==undefined){chapter.epub=validateEpubLayout(item.epub);if(!book.epub||book.epub.spine[index]!==chapter.epub.path||chapter.text!==chapter.epub.nodes.join('\n'))throw Error('Bố cục EPUB không khớp chữ hoặc thứ tự.');}else if(book.epub)throw Error('EPUB thiếu bố cục chương.');
    chapterIds.add(chapter.id);chars+=chapter.text.length;return chapter;
  });
  if(book.epub&&book.epub.spine.length!==chapters.length)throw Error('EPUB thiếu chương.');
  const hidden=new Set(book.hiddenChapterIds??[]);if([...hidden].some(id=>!chapterIds.has(id)))throw Error('Thiếu chương đã xóa trong bản cloud.');const active=chapters.filter(c=>!hidden.has(c.id));
  if(active.length!==book.chapterCount||active.reduce((n,c)=>n+c.text.length,0)!==book.charCount)throw new Error('Tổng ký tự cloud không khớp.');
  const keys=new Set<string>();
  const names=data.names.map((value,index)=>{const entry=object(value),key=text(entry.key,256,`Name ${index+1}: khóa`),meaning=text(entry.value,2048,`Name ${index+1}: nghĩa`);if(!key.trim()||!meaning.trim()||/[\r\n=]/.test(key)||/[\r\n]/.test(meaning)||keys.has(key))throw new Error('Name cloud không hợp lệ hoặc trùng khóa.');keys.add(key);return {key,value:meaning};});
  return {format:'thu-phong-cloud',version:data.version as 1|2,book,chapters,names};
}
/** Read a consistent compact snapshot; originals/dictionaries/progress stay local. */
export async function createCloudSnapshot(bookId:string):Promise<Uint8Array>{
  return (await createCloudSnapshotWithMetadata(bookId)).bytes;
}
/** Metadata headers and bytes must come from the same consistent DB read. */
export async function createCloudSnapshotWithMetadata(bookId:string):Promise<{bytes:Uint8Array;book:Book}>{
  const snapshot=await db.transaction('r',[db.books,db.chapters,db.names,db.settings],async()=>{
    const book=await db.books.get(bookId);if(!book||book.status!=='ready')throw new Error('Truyện chưa sẵn sàng đồng bộ.');
    const chapters=(await db.chapters.where('bookId').equals(bookId).sortBy('order')).map((chapter,order)=>({...chapter,order,sourceId:''}));
    const merged=new Map((await readConvertNames()).map(name=>[name.key,name.value]));
    for(const name of await readEffectiveBookNames(bookId))merged.set(name.key,name.value);
    const active=chapters.filter(c=>!book.hiddenChapterIds?.includes(c.id));const snapshotBook={...book,hiddenChapterIds:book.hiddenChapterIds?.length?book.hiddenChapterIds:undefined,chapterCount:active.length,charCount:active.reduce((sum,chapter)=>sum+chapter.text.length,0)};
    return validateCloudSnapshot({format:'thu-phong-cloud',version:book.hiddenChapterIds?.length?2:1,book:snapshotBook,chapters,names:[...merged].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>({key,value}))});
  });
  return {bytes:await encodeCloudSnapshot(snapshot),book:snapshot.book};
}
export async function contentHash(bytes:Uint8Array):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
/** Add-only restore. Never replace any existing book/chapter/name/settings. */
export async function restoreCloudSnapshot(bytes:Uint8Array,bookId:string,sha256:string,guard?:()=>Promise<void>):Promise<'added'|'existing'>{
  if(bytes.length>MAX_CLOUD_BYTES||!/^[a-f0-9]{64}$/.test(sha256)||await contentHash(bytes)!==sha256)throw new Error('Bản cloud sai kích thước hoặc checksum.');
  const decoded=await decodeCloudSnapshot(bytes),data=validateCloudSnapshot(decoded.value);
  if(data.book.id!==bookId)throw new Error('ID bản cloud không khớp truyện yêu cầu.');
  assertStorageBudget(await navigator.storage?.estimate?.(),decoded.decodedBytes*3);
  return db.transaction('rw',[db.books,db.chapters,db.names,db.settings],async()=>{
    // Check captured device identity under the same settings lock as the writes.
    // A rejected guard aborts the transaction before any book access or mutation.
    await guard?.();
    if(await db.books.get(bookId))return 'existing';
    if((await db.chapters.bulkGet(data.chapters.map(chapter=>chapter.id))).some(Boolean))throw new Error('Chương cloud trùng ID dữ liệu local; giữ nguyên dữ liệu.');
    await db.books.add(data.book);await db.chapters.bulkAdd(data.chapters);
    const names:NameEntry[]=data.names.map(name=>({id:uid(),bookId,...name}));await db.names.bulkAdd(names);
    const root=nameAlbumRoot(data.book.album);if(root)await validateAlbumNameCapacity([root]);
    await db.settings.put({key:'shared-download-baseline:'+bookId,value:{book:{title:data.book.title,author:data.book.author,...(data.book.displayTitle?{displayTitle:data.book.displayTitle}:{}),...(data.book.cover?{cover:data.book.cover}:{}),...(data.book.album?{album:data.book.album}:{})},names:Object.fromEntries(data.names.map(n=>[n.key,n.value]))}});return 'added';
  });
}
