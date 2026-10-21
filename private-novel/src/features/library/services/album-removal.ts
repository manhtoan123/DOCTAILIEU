import {db} from '../../../core/db';
import {deleteCloudBook,listCloudBooks} from '../../sync-cloud/services/cloud-client';
import {removeBookWithLocalData} from './book-removal';
import {readStoredAlbumRegistry,removeEmptyAlbum} from './album-registry';
import {withBookLock} from './book-lock';

/** A failed remote delete must never discard its local copy or hide the Album. */
export async function deleteAlbumAndBooks(name:string,shared:boolean){
  const allLocal=await db.books.where('status').equals('ready').toArray();const local=allLocal.filter(b=>b.album===name);const elsewhere=new Set(allLocal.filter(b=>b.album!==name).map(b=>b.id));
  const cloud=shared?await listCloudBooks():[];
  const ids=new Set([...local.map(b=>b.id),...cloud.filter(b=>b.album===name&&!elsewhere.has(b.id)).map(b=>b.id)]);
  for(const id of ids){
    await withBookLock(id,async()=>{
    const current=await db.books.get(id);if(current&&current.album!==name)return;
    if(shared||await db.settings.get(`cloud-uploaded:${location.origin}:${id}`))await deleteCloudBook(id);
    const fresh=await db.books.get(id);if(fresh&&fresh.album!==name)throw new Error('Truyện đã được chuyển Album trong lúc xóa; giữ bản local và dừng xóa.');
    await removeBookWithLocalData(id);
    });
  }
  // Concurrent imports belong to their original Album; do not silently unassign them.
  if(await db.books.filter(b=>b.album===name).count()||(shared&&(await listCloudBooks()).some(b=>b.album===name&&!elsewhere.has(b.id))))
    throw new Error('Album có truyện mới được thêm trong lúc xóa; hãy xóa Album lần nữa.');
  const registry=await readStoredAlbumRegistry();const album=registry?.albums.find(a=>a.name===name);
  if(album)await removeEmptyAlbum(album.id);
  return ids.size;
}
