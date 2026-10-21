import {MAX_EPUB_ORIGINAL_BYTES} from '../../sync-cloud/services/cloud-original-schema';
import {importEpub} from './epub-import';
import Dexie from 'dexie';
import {db,deleteBook,commitImport} from '../../../core/db';
import {cleanTitle} from '../../../core/domain';
import {importFiles,throwIfImportAborted,reportImportProgress,type ImportStatus} from './importer';
import {assertStorageBudget} from '../../../core/storage';

export const MAX_BATCH_FILES=100;
export const MAX_BATCH_FILE_BYTES=40*1024*1024;
export const MAX_BATCH_SOURCE_BYTES=256*1024*1024;
export const MAX_EPUB_SELECTION_BYTES=4*1024*1024*1024;
export const selectionByteLimit=(files:File[])=>files.some(file=>/\.epub$/i.test(file.name))?MAX_EPUB_SELECTION_BYTES:MAX_BATCH_SOURCE_BYTES;

/** Selection order is book order; each TXT has its own Worker and staging book. */
export async function prepareBatchFiles(files:File[],encoding:string,pattern:string,detect:boolean,onProgress:(p:ImportStatus)=>void,signal:AbortSignal,maxChars?:number,titles?:readonly string[]):Promise<{ids:string[]}>{
  throwIfImportAborted(signal);
  const selection=[...files];
  if(!selection.length||selection.length>MAX_BATCH_FILES)throw new Error('Chọn từ 1 đến 100 file TXT hoặc EPUB.');
  if(titles&&(titles.length!==selection.length||titles.some(title=>!title.trim()||title.length>300)))throw new Error('Danh sách tên truyện không hợp lệ.');
  let bytes=0;
  for(const file of selection){
    if(!/\.(txt|epub)$/i.test(file.name))throw new Error(`${file.name}: chỉ hỗ trợ file TXT hoặc EPUB.`);
    if(file.size>(/\.epub$/i.test(file.name)?MAX_EPUB_ORIGINAL_BYTES:MAX_BATCH_FILE_BYTES))throw new Error(`${file.name}: vượt giới hạn TXT 40 MiB / EPUB 256 MiB.`);
    bytes+=file.size;
  }
  if(bytes>selectionByteLimit(selection))throw new Error(`Lô nhập vượt ${selectionByteLimit(selection)/1048576} MiB; hãy chọn lô nhỏ hơn.`);
  const estimate=typeof navigator==='undefined'?undefined:await navigator.storage?.estimate?.();
  assertStorageBudget(estimate,bytes*5);
  throwIfImportAborted(signal);
  const ids:string[]=[];
  try{
    for(const [index,file] of selection.entries()){
      throwIfImportAborted(signal);
      const progress=(status:ImportStatus)=>{
        reportImportProgress(onProgress,{message:`${index+1}/${selection.length} · ${file.name}`,percent:Math.round((index+status.percent/100)/selection.length*100)});
      };
      const title=titles?.[index].trim()||cleanTitle(file.name);
      const result=/\.epub$/i.test(file.name)?await importEpub(file,title,progress,signal,{dedupe:'none'}):await importFiles([file],title,encoding,pattern,detect,progress,signal,{dedupe:'none',maxChars});
      ids.push(result.id);
      throwIfImportAborted(signal);
    }
    return {ids};
  }catch(error){
    // importFiles owns cleanup of the active file; only this batch's completed
    // staging IDs are removed here. Never use source hashes to select deletions.
    await db.transaction('rw',[db.books,db.chapters,db.sources,db.progress,db.names,db.importJobs],async()=>{
      for(const id of ids)await deleteBook(id);
    });
    throw error;
  }
}

/** A later invalid preview rolls back earlier ready transitions in the same tx. */
export async function commitBatchImports(ids:string[],signal?:AbortSignal):Promise<void>{
  if(!ids.length||new Set(ids).size!==ids.length)throw new Error('Danh sách bản nhập không hợp lệ.');
  if(signal)throwIfImportAborted(signal);
  await db.transaction('rw',[db.books,db.importJobs],async()=>{
    const transaction=Dexie.currentTransaction!;
    const abort=()=>transaction.abort();
    signal?.addEventListener('abort',abort,{once:true});
    transaction.on('complete',()=>signal?.removeEventListener('abort',abort));
    transaction.on('abort',()=>signal?.removeEventListener('abort',abort));
    for(const id of ids){if(signal)throwIfImportAborted(signal);await commitImport(id);}
    if(signal)throwIfImportAborted(signal);
  }).catch(error=>{if(signal)throwIfImportAborted(signal);throw error;});
  // The committed transaction is the success boundary: a subsequent abort must
  // never turn saved books into a reported failure.
}
