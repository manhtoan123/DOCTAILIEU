import {db,deleteBook} from './db';
import {uid,cleanTitle,type Chapter,type ImportJob} from './domain';
import type {Part} from './splitter';
import {assertStorageBudget} from './storage';
import {usableSourceHashes} from './source-data';
export interface ImportStatus { message:string; percent:number }
export function acceptSourceHash(knownHashes:Set<string>,hash:string){if(knownHashes.has(hash))return false;knownHashes.add(hash);return true;}
export function throwIfImportAborted(signal:AbortSignal){if(signal.aborted)throw new Error('Đã hủy nhập.');}
export async function importFiles(files:File[],title:string,encoding:string,pattern:string,detect:boolean,onProgress:(p:ImportStatus)=>void,signal:AbortSignal) {
  if(files.length!==1)throw new Error('Mỗi lần nhập chỉ chọn một file TXT; mỗi file là một truyện.');
  const id=uid();let order=0;let chars=0;const duplicates:string[]=[];
  const knownHashes=usableSourceHashes(await db.sources.toArray());
  const jobId=uid();const job:ImportJob={jobId,bookId:id,phase:'processing',totalFiles:files.length,processedFiles:0,processedBytes:0,checkpoint:0,duplicateFiles:[],updatedAt:Date.now()};
  await db.transaction('rw',[db.books,db.importJobs],async()=>{await db.books.add({id,title:title.trim()||cleanTitle(files[0].name),author:'',createdAt:Date.now(),updatedAt:Date.now(),status:'staging',chapterCount:0,charCount:0});await db.importJobs.add(job);});
  try {
    for(let i=0;i<files.length;i++) {
      const file=files[i];throwIfImportAborted(signal);const estimate=typeof navigator==='undefined'?undefined:await navigator.storage?.estimate?.();assertStorageBudget(estimate,file.size);
      const sourceId=uid();const startOrder=order;
      const result=await new Promise<{sha256:string;chars:number}>((resolve,reject)=>{
        const worker=new Worker(new URL('./workers/import.worker.ts',import.meta.url),{type:'module'});
        let timer:ReturnType<typeof setTimeout>;let settled=false;
        const stop=(error?:Error,result?:{sha256:string;chars:number})=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(result!);};
        const abort=()=>stop(new Error('Đã hủy nhập.'));
        const watchdog=()=>{clearTimeout(timer);timer=setTimeout(()=>stop(new Error('Xử lý quá lâu. Hãy kiểm tra Regex hoặc chia lô nhỏ hơn.')),30000);};
        signal.addEventListener('abort',abort,{once:true});watchdog();
        worker.onerror=()=>stop(new Error('Worker nhập TXT bị lỗi.'));
        worker.onmessage=async(e)=>{
          const msg=e.data;watchdog();
          try {
            if(msg.type==='batch') {
              const rows:Chapter[]=msg.parts.map((p:Part)=>({id:uid(),bookId:id,order:order++,title:p.title,text:p.text,revision:1,sourceId}));
              await db.chapters.bulkAdd(rows);if(!settled)worker.postMessage({type:'ack'});
            } else if(msg.type==='progress')onProgress({message:`${i+1}/${files.length} · ${file.name}`,percent:Math.round((i+msg.read/Math.max(1,msg.total))/files.length*100)});
            else if(msg.type==='done')stop(undefined,msg);
            else if(msg.type==='error')stop(new Error(`${file.name}: ${msg.message}. Có thể cần đổi encoding.`));
          }catch(error){stop(error instanceof Error?error:new Error(String(error)));}
        };
        worker.postMessage({type:'start',file,title:cleanTitle(file.name),encoding,pattern,detect});
      });
      if(!acceptSourceHash(knownHashes,result.sha256)) {
        duplicates.push(file.name);await db.chapters.where('bookId').equals(id).filter(c=>c.sourceId===sourceId).delete();order=startOrder;
      }else {await db.sources.add({id:sourceId,bookId:id,name:file.name,relativePath:file.webkitRelativePath||file.name,encoding,sha256:result.sha256,bytes:file.size,blob:file});chars+=result.chars;}
      await db.importJobs.update(jobId,{processedFiles:i+1,processedBytes:Math.min(files.slice(0,i+1).reduce((sum,item)=>sum+item.size,0),Number.MAX_SAFE_INTEGER),checkpoint:i+1,duplicateFiles:[...duplicates],updatedAt:Date.now()});
    }
    if(order===0)throw new Error('Không có nội dung mới: file rỗng hoặc đã có trong thư viện.');
    await db.books.update(id,{chapterCount:order,charCount:chars,updatedAt:Date.now()});await db.importJobs.update(jobId,{phase:'preview',updatedAt:Date.now()});return {id,duplicates};
  }catch(error){await deleteBook(id);throw error;}
}
