import {MAX_EPUB_ORIGINAL_BYTES} from '../../sync-cloud/services/cloud-original-schema';
import {importEpub} from './epub-import';
import {deleteBook} from '../../../core/db';
import {cleanTitle} from '../../../core/domain';
import {planFolderImport,type FolderImportGroup} from './folder-import';
import {normalizeAlbum,type AlbumImportAssignment} from '../../library/services/albums';
import {MAX_BATCH_FILE_BYTES,selectionByteLimit} from './batch-import';
import {importFiles,reportImportProgress,throwIfImportAborted,type ImportStatus} from './importer';
import {assertStorageBudget} from '../../../core/storage';

export interface FolderSelectionPlan {groups:FolderImportGroup[];assignments:{file:File;album:string}[];ignored:string[]}

/** Every TXT is one book, and its full direct-parent path is its Album. */
export function planFolderSelection(files:File[]):FolderSelectionPlan{
  const original=planFolderImport(files,true);
  const groups=original.groups.map(group=>{
    const album=normalizeAlbum(group.path);
    if(!album)throw new Error('Tên Album từ folder không được để trống.');
    return {...group,title:album};
  });
  const assignments=groups.flatMap(group=>group.files.map(file=>({file,album:group.title})));
  // Trimming must never collapse distinct folder paths into the same Album.
  if(new Set(groups.map(group=>group.title)).size!==groups.length)throw new Error('Tên Album từ folder bị trùng sau chuẩn hóa.');
  return {groups,assignments,ignored:original.ignored};
}

/** All units are validated before any writes; ready/Album transitions belong to confirmation. */
export async function prepareFolderSelection(files:File[],encoding:string,onProgress:(p:ImportStatus)=>void,signal:AbortSignal,options:{maxChars?:number;pattern?:string}={}):Promise<{ids:string[];assignments:AlbumImportAssignment[]}>{
  throwIfImportAborted(signal);
  const plan=planFolderSelection([...files]);
  if(!plan.assignments.length)throw new Error('Folder không có file TXT hoặc EPUB.');
  let bytes=0;
  for(const {file} of plan.assignments){
    if(file.size>(/\.epub$/i.test(file.name)?MAX_EPUB_ORIGINAL_BYTES:MAX_BATCH_FILE_BYTES))throw new Error(`${file.webkitRelativePath}: vượt giới hạn TXT 40 MiB / EPUB 256 MiB.`);
    bytes+=file.size;
  }
  if(bytes>selectionByteLimit(files))throw new Error(`Lô nhập vượt ${selectionByteLimit(files)/1048576} MiB; hãy chọn lô nhỏ hơn.`);
  const estimate=typeof navigator==='undefined'?undefined:await navigator.storage?.estimate?.();
  assertStorageBudget(estimate,bytes*5);
  throwIfImportAborted(signal);
  const ids:string[]=[];const assignments:AlbumImportAssignment[]=[];const count=plan.assignments.length;
  const progress=(label:string)=>(status:ImportStatus)=>reportImportProgress(onProgress,{message:`${ids.length+1}/${count} · ${label}: ${status.message}`,percent:Math.round((ids.length+status.percent/100)/count*100)});
  try{
    for(const {file,album} of plan.assignments){
      throwIfImportAborted(signal);
      const result=/\.epub$/i.test(file.name)?await importEpub(file,cleanTitle(file.name),progress(file.webkitRelativePath),signal,{dedupe:'none'}):await importFiles([file],cleanTitle(file.name),encoding,options.pattern||'',true,progress(file.webkitRelativePath),signal,{dedupe:'none',maxChars:options.maxChars});
      ids.push(result.id);assignments.push({id:result.id,album});throwIfImportAborted(signal);
    }
    return {ids,assignments};
  }catch(error){
    // The active importer owns its cleanup; only completed IDs from this selection are ours.
    const cleanup=await Promise.allSettled(ids.map(id=>deleteBook(id)));
    if(cleanup.some(result=>result.status==='rejected'))throw new Error(`${error instanceof Error?error.message:String(error)} Không xóa được một số bản tạm; trở về tủ sách để xử lý bản nhập chưa hoàn tất.`);
    throw error;
  }
}
