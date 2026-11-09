import {MAX_EPUB_ORIGINAL_BYTES} from '../../sync-cloud/services/cloud-original-schema';
import {importEpub} from './epub-import';
import Dexie from 'dexie';
import {db,deleteBook,commitImport} from '../../../core/db';
import {cleanTitle} from '../../../core/domain';
import {importFiles,throwIfImportAborted,reportImportProgress,waitForImportStep,type ImportStatus} from './importer';
import {assertStorageBudget} from '../../../core/storage';
import {prepareDocument,importDocument} from './document-convert';
import {createImportProgress} from './txt-import-progress';

export const MAX_BATCH_FILES=100;
export const MAX_BATCH_FILE_BYTES=40*1024*1024;
export const MAX_BATCH_SOURCE_BYTES=256*1024*1024;
export const MAX_EPUB_SELECTION_BYTES=4*1024*1024*1024;
export const selectionByteLimit=(files:File[])=>files.some(file=>/\.epub$/i.test(file.name))?MAX_EPUB_SELECTION_BYTES:MAX_BATCH_SOURCE_BYTES;
export function validateBatchSelection(files:File[]):number{
 if(!files.length||files.length>MAX_BATCH_FILES)throw Error('Chọn từ 1 đến 100 file TXT, EPUB, PDF hoặc DOCX.');
 let bytes=0,documentBytes=0;
 for(const file of files){
  if(!/\.(txt|epub|pdf|docx)$/i.test(file.name))throw Error(`${file.name}: chỉ hỗ trợ TXT, EPUB, PDF hoặc DOCX.`);
  if(!file.size||file.size>(/\.epub$/i.test(file.name)?MAX_EPUB_ORIGINAL_BYTES:MAX_BATCH_FILE_BYTES))throw Error(`${file.name}: file rỗng hoặc vượt giới hạn TXT/PDF/DOCX 40 MiB / EPUB 256 MiB.`);
  bytes+=file.size;if(/\.(pdf|docx)$/i.test(file.name))documentBytes+=file.size;
 }
 if(bytes>selectionByteLimit(files)||documentBytes>MAX_BATCH_SOURCE_BYTES)throw Error(`Lô nhập vượt giới hạn: ${selectionByteLimit(files)/1048576} MiB toàn lô và 256 MiB nguồn PDF/DOCX; hãy chọn lô nhỏ hơn.`);
 return bytes;
}
export const MAX_BATCH_DOCUMENT_PREVIEW_BYTES=128*1048576;
/** Conversion is read-only: confirm the whole selection before creating staging books. */
export async function prepareBatchDocuments(files:File[],onProgress:(p:ImportStatus)=>void,signal:AbortSignal):Promise<Map<File,File>>{
 throwIfImportAborted(signal);validateBatchSelection(files);
 const documents=files.filter(file=>/\.(pdf|docx)$/i.test(file.name)),prepared=new Map<File,File>();let bytes=0;
 for(const [index,file] of documents.entries()){
  throwIfImportAborted(signal);reportImportProgress(onProgress,{message:`Xem trước ${index+1}/${documents.length} · ${file.name}`,percent:Math.round(index/documents.length*100)});
  const converted=await prepareDocument(file,signal);throwIfImportAborted(signal);bytes+=converted.size;
  if(bytes>MAX_BATCH_DOCUMENT_PREVIEW_BYTES)throw Error('Bản đọc PDF/DOCX của lô vượt 128 MiB; hãy chọn ít file hơn. Chưa nhập truyện.');
  prepared.set(file,converted);
 }
 return prepared;
}

/** Selection order is book order; each TXT has its own Worker and staging book. */
export async function prepareBatchFiles(files:File[],encoding:string,pattern:string,detect:boolean,onProgress:(p:ImportStatus)=>void,signal:AbortSignal,maxChars?:number,titles?:readonly string[],documents?:ReadonlyMap<File,File>):Promise<{ids:string[]}>{
  throwIfImportAborted(signal);
  const selection=[...files];
  const bytes=validateBatchSelection(selection);
  if(titles&&(titles.length!==selection.length||titles.some(title=>!title.trim()||title.length>300)))throw new Error('Danh sách tên truyện không hợp lệ.');
  const estimate=typeof navigator==='undefined'?undefined:await waitForImportStep(async()=>navigator.storage?.estimate?.(),signal);
  assertStorageBudget(estimate,bytes*5);
  throwIfImportAborted(signal);
  const documentFiles=selection.filter(file=>/\.(pdf|docx)$/i.test(file.name));
  const prepared=documentFiles.length?(documents??await prepareBatchDocuments(selection,onProgress,signal)):undefined;
  let previewBytes=0;
  for(const file of documentFiles){const cached=prepared?.get(file);if(!cached||!cached.size||!/\.epub$/i.test(cached.name))throw Error(`${file.name}: bản xem trước không còn khớp; hãy xem trước lại lô.`);previewBytes+=cached.size;}
  if(previewBytes>MAX_BATCH_DOCUMENT_PREVIEW_BYTES)throw Error('Bản đọc PDF/DOCX của lô vượt 128 MiB; hãy chọn ít file hơn. Chưa nhập truyện.');
  throwIfImportAborted(signal);
  const ids:string[]=[];
  const overall=createImportProgress();
  let completedBytes=0;
  try{
    for(const [index,file] of selection.entries()){
      throwIfImportAborted(signal);
      const progress=(status:ImportStatus)=>{
        const fraction=(completedBytes+file.size*status.percent/100)/bytes;
        reportImportProgress(onProgress,overall(`${index+1}/${selection.length} · ${status.message}`,Math.min(.99,fraction)));
      };
      const title=titles?.[index].trim()||cleanTitle(file.name);
      const result=/\.(pdf|docx)$/i.test(file.name)?await importDocument(file,prepared!.get(file)!,title,progress,signal,{dedupe:'none'}):/\.epub$/i.test(file.name)?await importEpub(file,title,progress,signal,{dedupe:'none'}):await importFiles([file],title,encoding,pattern,detect,progress,signal,{dedupe:'none',maxChars});
      ids.push(result.id);
      throwIfImportAborted(signal);
      completedBytes+=file.size;
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
