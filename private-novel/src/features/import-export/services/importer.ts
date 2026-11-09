import {cleanImportedTitle} from './import-advertising';
import {db,deleteBook} from '../../../core/db';
import {uid,cleanTitle,type Chapter,type ImportJob} from '../../../core/domain';
import type {Part} from './splitter';
import {assertStorageBudget} from '../../../core/storage';
import {usableSourceHashes} from './source-data';
import {hasChinese,sanitizeDownloadFilename} from '../../library/services/title-resolver';
import {convertBatchTitles,convertSingleTitle} from '../../names-convert/services/title-converter';
import {isTextEncoding} from './text-encoding';
import {createImportProgress,createTxtWatchdog,txtPhaseLabel,txtProgressFraction,type ImportStatus,type TxtWorkerProgress} from './txt-import-progress';
export type {ImportStatus} from './txt-import-progress';
export interface ImportOptions {dedupe?:'library'|'none'; maxChars?:number}
export function reportImportProgress(callback:(p:ImportStatus)=>void,status:ImportStatus){try{callback(status);}catch{/* Observers cannot change import integrity. */}}
export function acceptSourceHash(knownHashes:Set<string>,hash:string){if(knownHashes.has(hash))return false;knownHashes.add(hash);return true;}
export function throwIfImportAborted(signal:AbortSignal){if(signal.aborted)throw new Error('Đã hủy nhập.');}
/** Stop waiting for read-only work. IndexedDB writes must drain before rollback. */
export async function waitForImportStep<T>(operation:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  throwIfImportAborted(signal);
  let abort!:()=>void;
  const cancelled=new Promise<never>((_,reject)=>{abort=()=>reject(new Error('Đã hủy nhập.'));});
  signal.addEventListener('abort',abort,{once:true});
  try{return await Promise.race([operation(),cancelled]);}
  finally{signal.removeEventListener('abort',abort);}
}
export async function importFiles(files:File[],title:string,encoding:string,pattern:string,_detect:boolean,onProgress:(p:ImportStatus)=>void,signal:AbortSignal,options:ImportOptions={}) {
  if(files.length!==1)throw new Error('Mỗi lần nhập chỉ chọn một file TXT; mỗi file là một truyện.');
  throwIfImportAborted(signal);
  const progress=createImportProgress();let fraction=0;
  const report=(stage:string)=>reportImportProgress(onProgress,progress(stage,fraction));
  report('Đang chuẩn bị TXT…');
  const id=uid();let order=0;let chars=0;let inferredHeadings=0;const duplicates:string[]=[];
  const knownHashes=options.dedupe==='none'?new Set<string>():usableSourceHashes(await db.sources.toArray());
  throwIfImportAborted(signal);
  const rawTitle=cleanImportedTitle(title.trim()||cleanTitle(files[0].name));
  const bookDisplayTitle=hasChinese(rawTitle)?await waitForImportStep(()=>convertSingleTitle(rawTitle),signal):undefined;
  const estimate=typeof navigator==='undefined'?undefined:await waitForImportStep(async()=>navigator.storage?.estimate?.(),signal);
  assertStorageBudget(estimate,files[0].size);
  throwIfImportAborted(signal);
  const jobId=uid();const job:ImportJob={jobId,bookId:id,phase:'processing',totalFiles:files.length,processedFiles:0,processedBytes:0,checkpoint:0,duplicateFiles:[],updatedAt:Date.now()};
  await db.transaction('rw',[db.books,db.importJobs],async()=>{throwIfImportAborted(signal);await db.books.add({id,title:rawTitle,...(bookDisplayTitle?{displayTitle:bookDisplayTitle}:{}),author:'',createdAt:Date.now(),updatedAt:Date.now(),status:'staging',chapterCount:0,charCount:0});throwIfImportAborted(signal);await db.importJobs.add(job);throwIfImportAborted(signal);});
  try {
    for(let i=0;i<files.length;i++) {
      const file=files[i];throwIfImportAborted(signal);const sourceId=uid();const startOrder=order;
      const result=await new Promise<{sha256:string;chars:number;encoding?:string;inferredHeadings?:number}>((resolve,reject)=>{
        const worker=new Worker(new URL('../../../workers/import.worker.ts',import.meta.url),{type:'module'});
        let settled=false;let writes=Promise.resolve();
        const titleWait=new AbortController();
        // Termination cannot cancel an IndexedDB request already in flight. Drain it
        // before rejecting, otherwise deleteBook can race a late chapter write.
        const stop=(error?:Error,result?:{sha256:string;chars:number;encoding?:string})=>{if(settled)return;settled=true;watchdog.clear();worker.terminate();titleWait.abort();signal.removeEventListener('abort',abort);void writes.then(()=>{if(error)reject(error);else resolve(result!);},writeError=>reject(error||writeError));};
        const abort=()=>stop(new Error('Đã hủy nhập.'));
        const watchdog=createTxtWatchdog(()=>stop(new Error(`${file.name}: bộ xử lý TXT không phản hồi. Nếu có Regex tùy chỉnh, hãy kiểm tra lại.`)),undefined,()=>worker.postMessage({type:'ping'}));
        signal.addEventListener('abort',abort,{once:true});watchdog.arm();
        worker.onerror=()=>stop(new Error('Worker nhập TXT bị lỗi.'));
        worker.onmessage=(e)=>{
          if(settled)return;const msg=e.data;
            if(msg.type==='batch') {
              // A worker waiting for ACK cannot advance. The bounded DB batch
              // drains before rollback, including on cancellation.
              watchdog.clear();
              report(`Đang chuẩn bị và lưu chương · ${file.name}`);
              writes=writes.then(async()=>{
                if(settled)return;throwIfImportAborted(signal);
                const parts=msg.parts as Part[];
                const converted=await waitForImportStep(()=>convertBatchTitles(parts.map(p=>p.title)),titleWait.signal);
                if(settled)return;throwIfImportAborted(signal);
                const rows:Chapter[]=parts.map((p,idx)=>{
                  const display=hasChinese(p.title)&&converted[idx]!==p.title?converted[idx]:undefined;
                  return {id:uid(),bookId:id,order:order++,title:p.title,...(display?{displayTitle:display}:{}),text:p.text,revision:1,sourceId};
                });
                await db.chapters.bulkAdd(rows);if(!settled){watchdog.arm();worker.postMessage({type:'ack'});}
              });
              void writes.catch(error=>stop(error instanceof Error?error:new Error(String(error))));
            } else if(msg.type==='progress'){
              const checkpoint=msg as TxtWorkerProgress;
              watchdog.advance(checkpoint);
              fraction=txtProgressFraction(checkpoint);
              report(`${txtPhaseLabel(checkpoint.phase)} · ${file.name}`);
            }
            else if(msg.type==='pong')watchdog.responsive();
            else if(msg.type==='done')stop(undefined,msg);
            else if(msg.type==='error')stop(new Error(`${file.name}: ${msg.message}. Có thể cần đổi encoding.`));
        };
        if(signal.aborted){abort();return;}
        // Keep the legacy call signature, but new imports always split headings.
        worker.postMessage({type:'start',file,title:cleanTitle(file.name),encoding,pattern,detect:true,maxChars:options.maxChars??64000});
      });
      throwIfImportAborted(signal);
      fraction=.99;report(`Đang lưu file gốc · ${file.name}`);
      const actualEncoding=result.encoding??encoding;
      if(!isTextEncoding(actualEncoding))throw Error('Worker chưa xác nhận encoding thực của file; chưa lưu nguồn.');
      const inferred=result.inferredHeadings;
      if(typeof inferred==='number'&&Number.isSafeInteger(inferred)&&inferred>0&&inferred<=100000)inferredHeadings+=inferred;
      if(!acceptSourceHash(knownHashes,result.sha256)) {
        duplicates.push(file.name);await db.chapters.where('bookId').equals(id).filter(c=>c.sourceId===sourceId).delete();order=startOrder;
      }else {
        const cleanName=cleanTitle(file.name);
        const sourceDisplayName=hasChinese(cleanName)?sanitizeDownloadFilename(await waitForImportStep(()=>convertSingleTitle(cleanName),signal)):undefined;
        throwIfImportAborted(signal);
        await db.sources.add({id:sourceId,bookId:id,name:file.name,...(sourceDisplayName?{displayName:sourceDisplayName}:{}),relativePath:file.webkitRelativePath||file.name,encoding:actualEncoding,sha256:result.sha256,bytes:file.size,blob:file});chars+=result.chars;
      }
      throwIfImportAborted(signal);await db.importJobs.update(jobId,{processedFiles:i+1,processedBytes:Math.min(files.slice(0,i+1).reduce((sum,item)=>sum+item.size,0),Number.MAX_SAFE_INTEGER),checkpoint:i+1,duplicateFiles:[...duplicates],updatedAt:Date.now()});
    }
    if(order===0)throw new Error('Không có nội dung mới: file rỗng hoặc đã có trong thư viện.');
    throwIfImportAborted(signal);await db.books.update(id,{chapterCount:order,charCount:chars,updatedAt:Date.now()});throwIfImportAborted(signal);await db.importJobs.update(jobId,{phase:'preview',updatedAt:Date.now()});throwIfImportAborted(signal);return {id,duplicates,...(inferredHeadings?{inferredHeadings}:{})};
  }catch(error){await deleteBook(id);throw error;}
}
