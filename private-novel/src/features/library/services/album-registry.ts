import {db} from '../../../core/db';
import {withBookLock} from './book-lock';
import {normalizeAlbum} from './albums';
import type {Book} from '../../../core/domain';
import {ALBUM_NAMES_PREFIX,albumNameKey,albumNameSetting,nameAlbumRoot,parseAlbumNameKey} from '../../names-convert/services/album-name-schema';
import {validateSharedRecord} from '../../sync-cloud/services/shared-state-schema';

export const ALBUM_REGISTRY_KEY='album-registry-v1';
export interface AlbumEntry {id:string;name:string;updatedAt:number}
export interface AlbumRegistry {version:1;albums:AlbumEntry[]}
const MAX_ALBUMS=1000;
function fail():never{throw new Error('Kho Album không hợp lệ; dữ liệu đã lưu được giữ nguyên.');}
function record(v:unknown):Record<string,unknown>{return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();}
function name(value:unknown):string{
  if(typeof value!=='string')fail();const result=normalizeAlbum(value as string);if(!result)throw new Error('Nhập tên Album.');return result;
}
function validate(value:unknown):AlbumRegistry{
  const v=record(value);if(v.version!==1||!Array.isArray(v.albums)||v.albums.length>MAX_ALBUMS)fail();
  const albums=(v.albums as unknown[]).map(value=>{
    const a=record(value);
    if(typeof a.id!=='string'||!a.id.trim()||a.id.length>200||/[\u0000-\u001f\u007f]/.test(a.id)||typeof a.updatedAt!=='number'||!Number.isSafeInteger(a.updatedAt)||a.updatedAt<0)fail();
    const albumName=name(a.name);if(albumName!==a.name)fail();
    return {id:a.id as string,name:albumName,updatedAt:a.updatedAt as number};
  });
  if(new Set(albums.map(a=>a.id)).size!==albums.length||new Set(albums.map(a=>a.name)).size!==albums.length)fail();
  return {version:1,albums};
}
interface State {registry:AlbumRegistry;books:Book[]}
/** Label bridge for old imports; never rewrites legacy books or staging rows. */
async function readState():Promise<State>{
  const row=await db.settings.get(ALBUM_REGISTRY_KEY);
  const registry=row?validate(row.value):{version:1 as const,albums:[]};
  const books=await db.books.where('status').equals('ready').toArray();
  let changed=!row;
  for(const book of books){
    if(book.album===undefined)continue;
    const albumName=name(book.album);if(albumName!==book.album)fail();
    if(!registry.albums.some(a=>a.name===albumName)){registry.albums.push({id:crypto.randomUUID(),name:albumName,updatedAt:Date.now()});changed=true;}
  }
  if(changed)await db.settings.put({key:ALBUM_REGISTRY_KEY,value:validate(registry)});
  return {registry,books};
}
function transaction<T>(operation:(state:State)=>Promise<T>):Promise<T>{
  // Native readwrite transactions serialize across both connections and tabs.
  // All awaits below are IndexedDB operations; no external work inside the transaction.
  return db.transaction('rw',[db.settings,db.books],async()=>operation(await readState()));
}
function find(registry:AlbumRegistry,id:string):AlbumEntry{
  const album=registry.albums.find(a=>a.id===id);if(!album)throw new Error('Album đã bị xóa hoặc không tồn tại.');return album;
}
async function store(registry:AlbumRegistry){await db.settings.put({key:ALBUM_REGISTRY_KEY,value:validate(registry)});}
export function getAlbumRegistry():Promise<AlbumRegistry>{return transaction(async({registry})=>registry);}
/** Read-only observation; ready-book reconciliation runs through getAlbumRegistry. */
export async function readStoredAlbumRegistry():Promise<AlbumRegistry|undefined>{
  const row=await db.settings.get(ALBUM_REGISTRY_KEY);return row?validate(row.value):undefined;
}
export async function createAlbum(value:string):Promise<AlbumEntry>{
  const albumName=name(value);return transaction(async({registry})=>{
    if(registry.albums.some(a=>a.name===albumName))throw new Error('Tên Album đã tồn tại.');
    const album={id:crypto.randomUUID(),name:albumName,updatedAt:Date.now()};registry.albums.push(album);await store(registry);return album;
  });
}
export async function renameAlbum(id:string,value:string):Promise<AlbumEntry>{
  const albumName=name(value);return transaction(async({registry,books})=>{
    const old=find(registry,id);if(registry.albums.some(a=>a.id!==id&&a.name===albumName))throw new Error('Tên Album đã tồn tại.');
    if(old.name===albumName)return old;
    // Renaming an author root carries its whole tree and explicit Name pool.
    // Refuse destination collisions rather than silently merging two authors.
    if(nameAlbumRoot(old.name)===old.name&&nameAlbumRoot(albumName)===albumName){
      const inside=(value:string)=>nameAlbumRoot(value)===old.name;
      if(registry.albums.some(a=>!inside(a.name)&&nameAlbumRoot(a.name)===albumName)||books.some(b=>nameAlbumRoot(b.album)===albumName))throw Error('Album đích đã có truyện hoặc series.');
      const renamed=registry.albums.filter(a=>inside(a.name)).map(a=>({...a,name:name(a.name===old.name?albumName:albumName+a.name.slice(old.name.length)),updatedAt:Date.now()}));
      const settings=await db.settings.where('key').startsWith(ALBUM_NAMES_PREFIX).toArray();
      const records=settings.map(row=>validateSharedRecord(row.value));
      if(records.some(r=>parseAlbumNameKey(r.key)[0]===albumName))throw Error('Album đích đã có kho Name; dữ liệu được giữ nguyên.');
      for(const r of records){const [root,key]=parseAlbumNameKey(r.key);if(root!==old.name)continue;const next=validateSharedRecord({...r,key:albumNameKey(albumName,key)});await db.settings.put({key:albumNameSetting(next.key),value:next});await db.settings.put({key:albumNameSetting(r.key),value:{...r,value:null}});}
      for(const book of books)if(book.album&&inside(book.album))await db.books.update(book.id,{album:book.album===old.name?albumName:albumName+book.album.slice(old.name.length)});
      const byId=new Map(renamed.map(a=>[a.id,a]));registry.albums=registry.albums.map(a=>byId.get(a.id)??a);await store(registry);return byId.get(id)!;
    }
    const updated={...old,name:albumName,updatedAt:Date.now()};
    for(const book of books)if(book.album===old.name)await db.books.put({...book,album:albumName});
    registry.albums=registry.albums.map(a=>a.id===id?updated:a);await store(registry);return updated;
  });
}
export function removeAlbum(id:string):Promise<void>{return transaction(async({registry,books})=>{
  const album=find(registry,id);
  for(const book of books)if(book.album===album.name){const {album:_album,...retained}=book;await db.books.put(retained);}
  registry.albums=registry.albums.filter(a=>a.id!==id);await store(registry);
});}
export function moveBookToAlbum(bookId:string,albumId?:string):Promise<void>{return withBookLock(bookId,()=>transaction(async({registry,books})=>{
  const book=books.find(b=>b.id===bookId);if(!book)throw new Error('Chỉ chuyển truyện đã nhập xong trên thiết bị này.');
  const album=albumId===undefined?undefined:find(registry,albumId);
  if(book.album===album?.name)return;
  const {album:_album,...retained}=book;await db.books.put(album?{...retained,album:album.name}:retained);
}));}

/** Deletion must never unassign books imported concurrently. */
export function removeEmptyAlbum(id:string):Promise<void>{return transaction(async({registry,books})=>{
  const album=find(registry,id);if(books.some(book=>book.album===album.name)||await db.books.filter(book=>book.album===album.name).count())throw new Error('Album có truyện mới; hãy xóa lần nữa.');
  registry.albums=registry.albums.filter(a=>a.id!==id);await store(registry);
});}
