import {BOOK_METADATA_MAX_CHARS} from '../../../shared/constants/book-metadata';
import {db} from '../../../core/db';
import type {Book} from '../../../core/domain';
import {deleteCloudBook,listCloudBooks,downloadCloudBook,type CloudBook} from '../../sync-cloud/services/cloud-client';
import {albumContains} from './album-tree';
import {getAlbumRegistry,readStoredAlbumRegistry,removeEmptyAlbum,renameAlbum,createAlbum,type AlbumEntry} from './album-registry';
import {withBookLock} from './book-lock';
import {removeBookWithLocalData} from './book-removal';
import {validateAlbumNameCapacity} from '../../names-convert/services/scoped-names';
import {nameAlbumRoot} from '../../names-convert/services/album-name-schema';

export interface ManagedBook {id:string;title:string;album?:string;updatedAt?:number;remote?:CloudBook;localPresent?:boolean}
export interface DeletionPlan {books:ManagedBook[];albums:AlbumEntry[];roots:string[];shared:boolean}
const sameOwner=(a:ManagedBook,b:ManagedBook)=>a.album===b.album;
const sameSnapshot=(a:ManagedBook,b:ManagedBook)=>sameOwner(a,b)&&a.title===b.title&&(b.updatedAt===undefined||a.updatedAt===b.updatedAt);
const sameRemote=(a:CloudBook|undefined,b:CloudBook|undefined)=>a===undefined&&b===undefined||!!a&&!!b&&sameSnapshot(a,b)&&a.sha256===b.sha256&&a.bytes===b.bytes&&a.author===b.author&&a.displayTitle===b.displayTitle&&JSON.stringify(a.cover)===JSON.stringify(b.cover);
/** Freeze exact IDs for review; never discover more books while executing. */
export async function previewLibraryDeletion(bookIds:string[],albumNames:string[],shared:boolean):Promise<DeletionPlan>{
  const [local,registry,cloud]=await Promise.all([db.books.toArray(),getAlbumRegistry(),listCloudBooks()]);
  const byId=new Map<string,ManagedBook>(cloud.map(book=>[book.id,book]));
  for(const book of local)byId.set(book.id,book);
  const ids=new Set(bookIds),roots=[...new Set(albumNames)];
  for(const root of roots){
    if(!registry.albums.some(a=>albumContains(root,a.name))&&!Array.from(byId.values()).some(b=>albumContains(root,b.album)))throw Error('Album không còn tồn tại; hãy chọn lại.');
    for(const book of byId.values())if(albumContains(root,book.album))ids.add(book.id);
  }
  const books=[...ids].map(id=>{const book=byId.get(id);if(!book)throw Error('Truyện không còn tồn tại; hãy chọn lại.');if(local.some(b=>b.id===id&&b.status!=='ready'))throw Error('Có truyện đang nhập; hãy chờ nhập xong.');const remote=cloud.find(b=>b.id===id);if(remote&&!sameOwner(remote,book))throw Error('Truyện local và kho khác Album; hãy đồng bộ trước khi xóa.');return {id:book.id,title:book.title,album:book.album,updatedAt:book.updatedAt,remote,localPresent:local.some(b=>b.id===id)};});
  return {books,albums:registry.albums.filter(a=>roots.some(root=>albumContains(root,a.name))),roots,shared:shared||cloud.length>0||albumNames.length>0};
}
export interface DeletionResult {completed:string[];cloudDeleted:string[];localDeleted:string[];removedAlbums:string[];failed:{id:string;message:string}[]}
/** Remote batch is intentionally partial: stop on first failure and report exact completion. */
export async function executeLibraryDeletion(plan:DeletionPlan):Promise<DeletionResult>{
  const result:DeletionResult={completed:[],cloudDeleted:[],localDeleted:[],removedAlbums:[],failed:[]};
  try{
    // Recheck the reviewed ownership for the entire batch before the first mutation.
    const cloud=await listCloudBooks();
    const registryBefore=await readStoredAlbumRegistry();
    for(const album of plan.albums)if(registryBefore?.albums.find(a=>a.id===album.id)?.name!==album.name)throw Error('Album đã thay đổi; hãy xem lại lựa chọn trước khi xóa.');
    for(const target of plan.books){const local=await db.books.get(target.id),remote=cloud.find(b=>b.id===target.id);if(!sameRemote(remote,target.remote)||local&&(!sameSnapshot(local,target)||local.status!=='ready')||!local&&(!remote||!sameSnapshot(remote,target)))throw Error('Danh sách đã thay đổi; hãy xem lại lựa chọn trước khi xóa.');}
    for(const target of plan.books){
      try{await withBookLock(target.id,async()=>{
        const current=await db.books.get(target.id);
        if(current&&(!sameSnapshot(current,target)||current.status!=='ready'))throw Error('Truyện đã thay đổi hoặc đang nhập; giữ bản local.');
        const uploaded=!!await db.settings.get(`cloud-uploaded:${location.origin}:${target.id}`);
        if(plan.shared||uploaded||cloud.some(b=>b.id===target.id)){
          const remote=(await listCloudBooks()).find(b=>b.id===target.id);
          if(!sameRemote(remote,target.remote))throw Error('Truyện trên kho đã thay đổi; dừng xóa.');
          await deleteCloudBook(target.id,target.remote??null);
          result.cloudDeleted.push(target.id);
        }
        const fresh=await db.books.get(target.id);
        if(fresh&&(!sameSnapshot(fresh,target)||fresh.status!=='ready'))throw Error('Kho đã xác nhận xóa nhưng truyện local đã thay đổi; giữ bản local và dừng.');
        await removeBookWithLocalData(target.id,book=>{
          if(book&&(!target.localPresent||!sameSnapshot(book,target)||book.status!=='ready'))throw Error('Kho đã xác nhận xóa nhưng bản local mới hoặc đã thay đổi; giữ bản local.');
        });
        if(fresh)result.localDeleted.push(target.id);
        await db.settings.delete(`cloud-delete-review:${location.origin}:${target.id}`);
      });result.completed.push(target.id);}catch(error){
        if(error&&typeof error==='object'&&'cloudDeleted'in error&&error.cloudDeleted===true&&'bookId'in error&&error.bookId===target.id&&!result.cloudDeleted.includes(target.id))result.cloudDeleted.push(target.id);
        if(!await db.books.get(target.id)){if(target.localPresent&&!result.localDeleted.includes(target.id))result.localDeleted.push(target.id);await db.settings.delete(`cloud-delete-review:${location.origin}:${target.id}`);}result.failed.push({id:target.id,message:error instanceof Error?error.message:String(error)});return result;}
    }
    if(plan.roots.length){
      const [local,cloud,registry]=await Promise.all([db.books.toArray(),listCloudBooks(),readStoredAlbumRegistry()]);
      if([...local,...cloud].some(b=>plan.roots.some(root=>albumContains(root,b.album))))throw Error('Album có truyện mới hoặc đã thay đổi; giữ Album. Hãy xem lại lựa chọn.');
      const reviewed=new Set(plan.albums.map(a=>a.id));
      if(registry?.albums.some(a=>plan.roots.some(root=>albumContains(root,a.name))&&!reviewed.has(a.id)))throw Error('Album có Series mới; giữ Album và xem lại lựa chọn.');
      const removed:string[]=[];
      await db.transaction('rw',[db.books,db.settings,db.names],async()=>{
        if((await db.books.toArray()).some(b=>plan.roots.some(root=>albumContains(root,b.album))))throw Error('Album có truyện mới; giữ Album.');
        const freshRegistry=await readStoredAlbumRegistry();
        if(freshRegistry?.albums.some(a=>plan.roots.some(root=>albumContains(root,a.name))&&!reviewed.has(a.id)))throw Error('Album có Series mới; giữ Album.');
        for(const album of [...plan.albums].sort((a,b)=>b.name.split('/').length-a.name.split('/').length)){
          const current=freshRegistry?.albums.find(a=>a.id===album.id);
          if(!current)continue;if(current.name!==album.name)throw Error('Album đã đổi tên; giữ Album và xem lại lựa chọn.');
          await removeEmptyAlbum(album.id);removed.push(album.name);
        }
      });result.removedAlbums.push(...removed);
    }
  }catch(error){result.failed.push({id:'Lựa chọn',message:error instanceof Error?error.message:String(error)});}
  return result;
}

export async function renameManagedBook(target:ManagedBook,value:string,remote?:CloudBook){
  const title=value.trim();if(!title||title.length>BOOK_METADATA_MAX_CHARS)throw Error(`Tên truyện cần từ 1 đến ${BOOK_METADATA_MAX_CHARS} ký tự.`);
  if(title===target.title)return;
  if(!await db.books.get(target.id)){if(!remote)throw Error('Truyện không còn tồn tại.');await materializeManagedBook(remote);}
  return withBookLock(target.id,async()=>{
    const current=await db.books.get(target.id);if(!current||current.status!=='ready'||!sameOwner(current,target))throw Error('Truyện đã thay đổi; hãy chọn lại.');
    // Same metadata path as the existing book editor, with a fresh owner check.
    await db.books.update(target.id,{title,displayTitle:undefined,updatedAt:Date.now()});
  });
}
const metadata=(book:Pick<Book,'title'|'author'|'album'|'displayTitle'|'cover'>|CloudBook)=>({title:book.title,author:book.author??'',album:book.album,displayTitle:book.displayTitle,cover:book.cover});
/** Restore immutable bytes first, then reconcile only a newly-added, untouched row
 * with the independently validated current catalog metadata. Never overwrite an
 * existing local book or a shared-sync/user edit that won the race. */
async function materializeManagedBook(remote:CloudBook){
  await withBookLock(remote.id,async()=>{
    if(await db.books.get(remote.id))return;
    const result=await downloadCloudBook(remote);if(result!=='added')return;
    const currentRemote=(await listCloudBooks()).find(b=>b.id===remote.id);
    if(!sameRemote(currentRemote,remote))throw Error('Metadata trên kho đã thay đổi trong lúc tải; bản đã tải được giữ, hãy thử lại.');
    await db.transaction('rw',[db.books,db.settings,db.names],async()=>{
      const current=await db.books.get(remote.id),row=await db.settings.get('shared-download-baseline:'+remote.id);
      const baseline=row?.value as {book?:Parameters<typeof metadata>[0];names?:unknown}|undefined;
      if(!current||current.status!=='ready'||!baseline?.book||JSON.stringify(metadata(current))!==JSON.stringify(metadata(baseline.book)))throw Error('Bản vừa tải đã được chỉnh sửa; giữ nguyên và chọn lại.');
      await db.books.update(remote.id,{...metadata(remote)});
      await validateAlbumNameCapacity([nameAlbumRoot(current.album),nameAlbumRoot(remote.album)].filter((root):root is string=>!!root));
      await db.settings.put({key:'shared-download-baseline:'+remote.id,value:{...baseline,book:metadata(remote)}});
    });
  });
}
export async function renameManagedAlbum(album:AlbumEntry,value:string){
  const leaf=value.trim();if(!leaf||leaf.includes('/')||leaf.includes('\\'))throw Error('Nhập tên Album, không gồm đường dẫn.');
  const parent=album.name.includes('/')?album.name.slice(0,album.name.lastIndexOf('/')):'';
  const before=await getAlbumRegistry();if(album.id&&before.albums.find(a=>a.id===album.id)?.name!==album.name)throw Error('Album đã đổi tên; hãy chọn lại.');
  if(leaf===album.name.split('/').at(-1))return album;
  // Explicit save may materialize remote-only books; download skips existing local rows.
  const cloud=await listCloudBooks();
  for(const book of cloud)if(albumContains(album.name,book.album)){
    await materializeManagedBook(book);
    const current=await db.books.get(book.id);
    if(!current||current.status!=='ready'||!sameOwner(current,book))throw Error('Bản local khác Album trên kho; hãy đồng bộ trước khi đổi tên Album. Dữ liệu được giữ nguyên.');
  }
  const registry=await getAlbumRegistry();
  if(album.id&&registry.albums.find(a=>a.id===album.id)?.name!==album.name)throw Error('Album đã đổi tên trong lúc tải; dữ liệu đã tải được giữ nguyên.');
  const actual=registry.albums.find(a=>a.name===album.name)??await createAlbum(album.name);
  // Prefix subtree rename keeps every nested Series within its original parent.
  return renameAlbum(actual.id,parent?`${parent}/${leaf}`:leaf);
}
