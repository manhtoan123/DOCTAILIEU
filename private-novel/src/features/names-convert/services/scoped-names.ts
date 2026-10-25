import {db} from '../../../core/db';
import {parseEntry,type NameEntry,type Book} from '../../../core/domain';
import {validateSharedRecord,type SharedRecord} from '../../sync-cloud/services/shared-state-schema';
import {nameTombKey} from '../../sync-cloud/services/shared-name-intents';
import {saveBookNames} from './book-names';
import {ALBUM_NAMES_PREFIX,albumNameKey,albumNameSetting,nameAlbumRoot,parseAlbumNameKey} from './album-name-schema';

/** Old private rows stay intact. Unambiguous legacy entries are shared by observation.
 * Conflicting old meanings remain private until an explicit Album entry resolves them. */
export async function readNameScope(bookId:string){
 return db.transaction('r',[db.books,db.names,db.settings],async()=>{
  const book=await db.books.get(bookId),album=nameAlbumRoot(book?.album);
  if(!book||book.status!=='ready')return {album:undefined,rows:[] as NameEntry[],conflicts:0,members:0};
  if(!album)return {album,rows:await db.names.where('bookId').equals(bookId).toArray(),conflicts:0,members:1};
  const members=(await db.books.where('status').equals('ready').toArray()).filter(b=>nameAlbumRoot(b.album)===album);
  const privateRows=await db.names.where('bookId').anyOf(members.map(b=>b.id)).toArray();
  const prefix=ALBUM_NAMES_PREFIX+encodeURIComponent(JSON.stringify([album]).slice(0,-1)+',');
  return resolveAlbum(bookId,album,members,privateRows,await db.settings.where('key').startsWith(prefix).toArray());
 });
}
function resolveAlbum(bookId:string,album:string,members:Book[],privateRows:NameEntry[],settings:{key:string;value:unknown}[]){
  const candidates=new Map<string,Set<string>>(),own=new Map<string,NameEntry>();
  for(const row of privateRows){const values=candidates.get(row.key)??new Set<string>();values.add(row.value);candidates.set(row.key,values);if(row.bookId===bookId)own.set(row.key,row);}
  const rows=new Map<string,NameEntry>();let conflicts=0;
  for(const [key,values]of candidates){if(values.size===1)rows.set(key,{id:'legacy-album:'+albumNameKey(album,key),bookId,key,value:[...values][0]});else{conflicts++;const row=own.get(key);if(row)rows.set(key,row);}}
  for(const setting of settings){
   const record=validateSharedRecord(setting.value);if(record.kind!=='album-name'||albumNameSetting(record.key)!==setting.key)throw Error('Kho Name Album không hợp lệ.');
   const [owner,key]=parseAlbumNameKey(record.key);if(owner!==album)throw Error('Name sai Album.');
   if((candidates.get(key)?.size??0)>1)conflicts--;
   if(record.value===null)rows.delete(key);else rows.set(key,{id:'album:'+record.key,bookId,key,value:record.value as string});
  }
  if(rows.size>20000)throw Error('Kho Name Album vượt 20.000 tên.');
  return {album,rows:[...rows.values()].sort((a,b)=>a.key.localeCompare(b.key)),conflicts,members:members.length};
}

/** One DB snapshot for the library; avoid one full-library scan per title. */
export async function readEffectiveNamesByBook(){
 return db.transaction('r',[db.books,db.names,db.settings],async()=>{
  const books=await db.books.where('status').equals('ready').toArray(),names=await db.names.toArray(),settings=await db.settings.where('key').startsWith(ALBUM_NAMES_PREFIX).toArray();
  const result=new Map<string,NameEntry[]>(),groups=new Map<string,{books:Book[];names:NameEntry[];settings:{key:string;value:unknown}[]}>(),owners=new Map(books.map(b=>[b.id,b]));
  for(const book of books){const album=nameAlbumRoot(book.album);if(!album){result.set(book.id,[]);continue;}const group=groups.get(album)??{books:[],names:[],settings:[]};group.books.push(book);groups.set(album,group);}
  for(const row of names){const book=owners.get(row.bookId);if(!book)continue;const album=nameAlbumRoot(book.album);if(album)groups.get(album)!.names.push(row);else result.get(book.id)!.push(row);}
  for(const row of settings){const record=validateSharedRecord(row.value);if(record.kind!=='album-name'||albumNameSetting(record.key)!==row.key)throw Error('Kho Name Album không hợp lệ.');groups.get(parseAlbumNameKey(record.key)[0])?.settings.push(row);}
  for(const [album,group]of groups)for(const book of group.books)result.set(book.id,resolveAlbum(book.id,album,group.books,group.names,group.settings).rows);
  return result;
 });
}

export async function readEffectiveBookNames(bookId:string){return (await readNameScope(bookId)).rows;}

/** Merge explicit keys atomically; never copy, rewrite or remove legacy Name rows. */
export async function saveScopedBookNames(bookId:string,text:string,expectedAlbum?:string|null){
 if(text.length>2*1048576)throw Error('Name List tối đa 2 MB.');
 const entries=text.split(/\r?\n/).map(parseEntry).filter((v):v is [string,string]=>!!v);
 return db.transaction('rw',[db.books,db.names,db.settings],async()=>{
  const book=await db.books.get(bookId);if(book?.status!=='ready')throw Error('Truyện không còn trong thư viện.');
  const album=nameAlbumRoot(book.album);if(expectedAlbum!==undefined&&(album??null)!==expectedAlbum)throw Error('Album đã thay đổi; mở lại kho Name trước khi lưu.');
  if(!album)return saveBookNames(bookId,text);
  const records=entries.map(([key,value])=>validateSharedRecord({kind:'album-name',key:albumNameKey(album,key),value}));
  for(const record of records)await db.settings.put({key:albumNameSetting(record.key),value:record});
  await readNameScope(bookId); // Validate effective capacity before committing all writes.
  return entries.length;
 });
}
export async function deleteScopedBookName(bookId:string,key:string,expected?:Pick<NameEntry,'id'|'value'>,expectedAlbum?:string|null){
 return db.transaction('rw',[db.books,db.names,db.settings],async()=>{
  const book=await db.books.get(bookId);if(book?.status!=='ready')throw Error('Truyện không còn trong thư viện.');
  const scope=await readNameScope(bookId),current=scope.rows.find(row=>row.key===key);
  if(expectedAlbum!==undefined&&(scope.album??null)!==expectedAlbum)throw Error('Album đã thay đổi; mở lại trước khi xóa Name.');
  if(!current||expected&&(current.id!==expected.id||current.value!==expected.value))throw Error('Name đã thay đổi; mở lại trước khi xóa.');
  if(scope.album){const record:SharedRecord=validateSharedRecord({kind:'album-name',key:albumNameKey(scope.album,key),value:null});await db.settings.put({key:albumNameSetting(record.key),value:record});}
  else{await db.names.where('[bookId+key]').equals([bookId,key]).delete();await db.settings.put({key:nameTombKey(bookId,key),value:{kind:'name',bookId,key,value:null}});}
 });
}
