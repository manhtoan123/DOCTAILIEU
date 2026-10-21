import {db,commitImport} from '../../../core/db';
import {commitBatchImports} from '../../import-export/services/batch-import';

export interface AlbumImportAssignment {id:string;album:string}

/** Folder publication exposes all final parent Albums and ready jobs atomically. */
export async function commitMappedAlbumImports(assignments:AlbumImportAssignment[]):Promise<void>{
  const ids=assignments.map(item=>item.id);
  if(!ids.length||new Set(ids).size!==ids.length)throw new Error('Danh sách bản nhập không hợp lệ.');
  const normalized=assignments.map(item=>({id:item.id,album:normalizeAlbum(item.album)}));
  if(normalized.some(item=>!item.album))throw new Error('Folder phải có Album.');
  await db.transaction('rw',[db.books,db.importJobs],async()=>{
    for(const {id,album} of normalized){
      const book=await db.books.get(id);
      if(!book||book.status!=='staging')throw new Error('Bản nhập không còn ở trạng thái xem trước.');
      await db.books.update(id,{album});
    }
    if(ids.length===1)await commitImport(ids[0]);
    else await commitBatchImports(ids);
  });
}

/** Album is optional metadata; it never changes book or chapter identities. */
export function normalizeAlbum(value:string):string|undefined{
  const album=value.trim();
  if(album.length>120)throw new Error('Tên Album tối đa 120 ký tự.');
  if(/[\u0000-\u001f\u007f]/.test(album)||/[\uD800-\uDFFF]/u.test(album))throw new Error('Tên Album chứa ký tự không hợp lệ.');
  return album||undefined;
}

/** Publish metadata and readiness together so autosync sees the selected Album. */
export async function commitAlbumImports(ids:string[],value:string):Promise<void>{
  if(!ids.length||new Set(ids).size!==ids.length)throw new Error('Danh sách bản nhập không hợp lệ.');
  const album=normalizeAlbum(value);
  await db.transaction('rw',[db.books,db.importJobs],async()=>{
    for(const id of ids){
      const book=await db.books.get(id);
      if(!book||book.status!=='staging')throw new Error('Bản nhập không còn ở trạng thái xem trước.');
      await db.books.update(id,{album});
    }
    if(ids.length===1)await commitImport(ids[0]);
    else await commitBatchImports(ids);
  });
}
