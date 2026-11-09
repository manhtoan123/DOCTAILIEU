import {cleanImportedTitle} from './import-advertising';
import {MAX_EPUB_ORIGINAL_BYTES} from '../../sync-cloud/services/cloud-original-schema';
import {thumbnail,storeSharedImage} from '../../sync-cloud/services/shared-images';
import type {SharedImage} from '../../sync-cloud/services/shared-image-schema';
import {readEpubEntry} from './epub-zip';
import {db,deleteBook} from '../../../core/db';
import Dexie from 'dexie';
import {hashBlob} from './backup';
import {uid,cleanTitle,type Chapter} from '../../../core/domain';
import {openEpubPackage,readEpubChapter} from './epub-package';
import {parseOriginalDescriptor} from '../../sync-cloud/services/cloud-original-schema';
import {assertStorageBudget} from '../../../core/storage';
import {throwIfImportAborted,reportImportProgress,type ImportStatus} from './importer';
import {usableSourceHashes} from './source-data';
export const MAX_EPUB_DERIVED_BYTES=128*1048576;
export const EPUB_IMPORT_BATCH_BYTES=1048576;
export const EPUB_IMPORT_BATCH_CHAPTERS=32;
export async function importEpub(file:File,title:string,onProgress:(p:ImportStatus)=>void,signal:AbortSignal,options:{dedupe?:'none'}={}){
 throwIfImportAborted(signal);if(!/\.epub$/i.test(file.name)||!file.size||file.size>MAX_EPUB_ORIGINAL_BYTES)throw Error('Chọn EPUB tối đa 256 MiB.');assertStorageBudget(await navigator.storage?.estimate?.(),file.size*2);const sha256=await hashBlob(file);throwIfImportAborted(signal);if(options.dedupe!=='none'&&usableSourceHashes(await db.sources.toArray()).has(sha256))throw Error('EPUB này đã có trên thiết bị.');const pkg=await openEpubPackage(file,signal),id=uid(),sourceId=uid(),jobId=uid();
 const source=parseOriginalDescriptor({version:1,sourceId,name:file.name,relativePath:file.webkitRelativePath||file.name,encoding:'epub',sha256,bytes:file.size}),encoder=new TextEncoder();let owned=false,derivedBytes=0,written=0,chars=0,batchBytes=0;let batch:Chapter[]=[];
 const write=async(operation:()=>Promise<void>)=>db.transaction('rw',[db.books,db.chapters,db.sources,db.importJobs],async()=>{const transaction=Dexie.currentTransaction!,cancel=()=>transaction.abort();signal.addEventListener('abort',cancel,{once:true});const detach=()=>signal.removeEventListener('abort',cancel);transaction.on('complete',detach);transaction.on('abort',detach);throwIfImportAborted(signal);await operation();throwIfImportAborted(signal);});
 const flush=async()=>{if(!batch.length)return;throwIfImportAborted(signal);assertStorageBudget(await navigator.storage?.estimate?.(),batchBytes*3);throwIfImportAborted(signal);const nextCount=written+batch.length,nextChars=chars+batch.reduce((n,c)=>n+c.text.length,0);await write(async()=>{await db.chapters.bulkAdd(batch);await db.books.update(id,{chapterCount:nextCount,charCount:nextChars,updatedAt:Date.now()});await db.importJobs.update(jobId,{checkpoint:nextCount,updatedAt:Date.now()});});written=nextCount;chars=nextChars;batch=[];batchBytes=0;};
 try{
  const now=Date.now();await write(async()=>{await db.books.add({id,title:cleanImportedTitle(title.trim()||pkg.title||cleanTitle(file.name)),author:pkg.author,status:'staging',createdAt:now,updatedAt:now,chapterCount:0,charCount:0,epub:{source,spine:pkg.spine.map(s=>s.path),...(pkg.coverPath?{coverPath:pkg.coverPath}:{})}});await db.sources.add({id:sourceId,bookId:id,name:file.name,relativePath:file.webkitRelativePath||file.name,encoding:'epub',sha256,bytes:file.size,blob:file});await db.importJobs.add({jobId,bookId:id,phase:'processing',totalFiles:1,processedFiles:0,processedBytes:0,checkpoint:0,duplicateFiles:[],updatedAt:now});});owned=true;
  for(const [order,section] of pkg.spine.entries()){
   throwIfImportAborted(signal);reportImportProgress(onProgress,{message:`Giữ bố cục EPUB: ${order+1}/${pkg.spine.length}`,percent:Math.round(order/pkg.spine.length*95)});throwIfImportAborted(signal);const epub=await readEpubChapter(pkg,section.path,signal,true);throwIfImportAborted(signal);const layoutBytes=encoder.encode(JSON.stringify(epub)).length,text=epub.nodes.join('\n'),size=layoutBytes+encoder.encode(text).length;derivedBytes+=layoutBytes;if(derivedBytes>MAX_EPUB_DERIVED_BYTES)throw Error('Bố cục EPUB vượt 128 MiB; bản tạm sẽ được xóa.');
   if(batch.length&&batchBytes+size>EPUB_IMPORT_BATCH_BYTES)await flush();batch.push({id:uid(),bookId:id,order,title:cleanImportedTitle(section.title),text,revision:1,sourceId,epub});batchBytes+=size;if(batchBytes>=EPUB_IMPORT_BATCH_BYTES||batch.length>=EPUB_IMPORT_BATCH_CHAPTERS)await flush();
  }
  await flush();throwIfImportAborted(signal);if(written!==pkg.spine.length)throw Error('EPUB chưa nhập đủ chương.');let cover:SharedImage|undefined;const entry=pkg.coverPath?pkg.entries.get(pkg.coverPath):undefined;if(entry){try{cover=await storeSharedImage(await thumbnail(new Blob([new Uint8Array(await readEpubEntry(file,entry,8*1048576,signal))])));}catch(error){throwIfImportAborted(signal);}}throwIfImportAborted(signal);
  await write(async()=>{if(cover)await db.books.update(id,{cover});await db.importJobs.update(jobId,{phase:'preview',processedFiles:1,processedBytes:file.size,checkpoint:written,updatedAt:Date.now()});});throwIfImportAborted(signal);
 }catch(error){if(owned){try{await deleteBook(id);}catch{throw Error(`${error instanceof Error?error.message:String(error)} Không xóa được bản tạm; bản chưa hoàn tất vẫn chưa được công nhận.`);}}throw error;}
 reportImportProgress(onProgress,{message:'EPUB giữ nguyên thứ tự, ảnh và kiểu trình bày.',percent:100});return {id,duplicates:[] as string[]};
}
