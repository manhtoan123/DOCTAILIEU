import {cleanImportedTitle,cleanImportedText} from './import-advertising';
import Dexie from 'dexie';
import {db} from '../../../core/db';
import {cleanTitle,uid,type Chapter,type SourceFile} from '../../../core/domain';
import type {ImportStatus} from './importer';
import {throwIfImportAborted} from './importer';
import {assertStorageBudget} from '../../../core/storage';
import {StreamingSplitter,type Part} from './splitter';
import {resolveTextEncoding} from './text-encoding';
import {scanGluedChapterNumbers} from './glued-headings';

export interface FolderImportGroup {path:string;title:string;files:File[]}
export interface FolderImportPlan {groups:FolderImportGroup[];ignored:string[]}
export const MAX_FOLDER_CHAPTER_CHARS=64000;
export const MAX_FOLDER_FILE_BYTES=2*1024*1024;
export const MAX_FOLDER_SOURCE_BYTES=32*1024*1024;
const natural=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
function compareNames(a:string,b:string){return natural.compare(a,b)||(a<b?-1:a>b?1:0);}

/** Relative paths are input, never filesystem paths. Validate even ignored files. */
function relativePath(file:File){
  const path=file.webkitRelativePath;
  const parts=path.split('/');
  if(parts.length<2||parts.some(p=>!p||p==='.'||p==='..'||/[\\:\u0000-\u001f]/.test(p))||parts.at(-1)!==file.name)
    throw new Error(`Đường dẫn folder không hợp lệ: ${path||file.name}`);
  return path;
}
export function planFolderImport(files:File[],includeEpub=false):FolderImportPlan{
  const seen=new Set<string>();const folders=new Map<string,FolderImportGroup>();const ignored:string[]=[];
  for(const file of files){
    const path=relativePath(file);
    if(seen.has(path))throw new Error(`Đường dẫn trùng trong folder: ${path}`);
    seen.add(path);
    if(!(includeEpub?/\.(txt|epub)$/i:/\.txt$/i).test(file.name)){ignored.push(path);continue;}
    const parent=path.slice(0,path.lastIndexOf('/'));
    let group=folders.get(parent);
    if(!group){group={path:parent,title:parent.split('/').at(-1)!,files:[]};folders.set(parent,group);}
    group.files.push(file);
  }
  const groups=[...folders.values()].sort((a,b)=>compareNames(a.path,b.path));
  for(const group of groups)group.files.sort((a,b)=>compareNames(a.name,b.name));
  return {groups,ignored:ignored.sort(compareNames)};
}
/** Each TXT contributes ordered chapters; headings/long text split losslessly. */
export async function importFolderGroup(group:FolderImportGroup,encoding:string,onProgress:(p:ImportStatus)=>void,signal:AbortSignal,maxChars?:number):Promise<{id:string}>{
  throwIfImportAborted(signal);
  // Revalidate at the mutation boundary: a caller may have edited the preview.
  const plan=planFolderImport(group.files);
  if(plan.ignored.length||plan.groups.length!==1||plan.groups[0].path!==group.path)throw new Error('Nhóm folder không hợp lệ.');
  const files=plan.groups[0].files;
  let totalBytes=0;
  for(const file of files){
    if(file.size>MAX_FOLDER_FILE_BYTES)throw new Error(`${file.name}: file vượt giới hạn đọc 2 MiB cho TXT trong folder; hãy nhập riêng để tự chia chương.`);
    totalBytes+=file.size;
  }
  if(totalBytes>MAX_FOLDER_SOURCE_BYTES)throw new Error('Folder vượt giới hạn 32 MiB; hãy chọn nhóm nhỏ hơn.');
  const estimate=typeof navigator==='undefined'?undefined:await navigator.storage?.estimate?.();
  assertStorageBudget(estimate,totalBytes*5);
  throwIfImportAborted(signal);
  const id=uid();const chapters:Chapter[]=[];const sources:SourceFile[]=[];let chars=0;
  for(const [order,file] of files.entries()){
    throwIfImportAborted(signal);
    const bytes=new Uint8Array(await file.arrayBuffer());
    throwIfImportAborted(signal);
    let result:{encoding:string;text:string};
    try{const actual=await resolveTextEncoding(file,encoding,signal);result={encoding:actual,text:new TextDecoder(actual,{fatal:true}).decode(bytes).replace(/\r\n?/g,'\n')};}catch{throwIfImportAborted(signal);throw new Error(`${file.name}: không giải mã được; hãy kiểm tra encoding.`);}
    if(!result.text.trim())throw new Error(`${file.name}: chương rỗng; folder chưa được nhập.`);
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    throwIfImportAborted(signal);
    const sourceId=uid();
    sources.push({id:sourceId,bookId:id,name:file.name,relativePath:file.webkitRelativePath,encoding:result.encoding,sha256:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join(''),bytes:file.size,blob:file});
    const parts:Part[]=[];
    const glued=await scanGluedChapterNumbers(file,result.encoding,signal);
    const splitter=new StreamingSplitter(cleanTitle(file.name),part=>{if(part.text.trim())parts.push({...part,title:cleanImportedTitle(part.title)});},undefined,maxChars??MAX_FOLDER_CHAPTER_CHARS,true,glued);
    splitter.feed(cleanImportedText(result.text),true);
    for(const part of parts) chapters.push({id:uid(),bookId:id,sourceId,order:chapters.length,title:part.title,text:part.text,revision:1});
    chars+=parts.reduce((sum,part)=>sum+part.text.length,0);
    onProgress({message:`${order+1}/${files.length} · ${file.name}`,percent:Math.round((order+1)/files.length*90)});
  }
  throwIfImportAborted(signal);
  if(!chapters.length)throw new Error('Không còn nội dung truyện sau khi lọc quảng cáo.');
  const now=Date.now();
  await db.transaction('rw',[db.books,db.chapters,db.sources,db.importJobs],async()=>{
    const transaction=Dexie.currentTransaction!;
    const abort=()=>transaction.abort();
    signal.addEventListener('abort',abort,{once:true});
    // Keep listener until actual completion, beyond the final write request.
    transaction.on('complete',()=>signal.removeEventListener('abort',abort));
    transaction.on('abort',()=>signal.removeEventListener('abort',abort));
    throwIfImportAborted(signal);
    await db.books.add({id,title:cleanImportedTitle(group.title.trim()||plan.groups[0].title),author:'',createdAt:now,updatedAt:now,status:'staging',chapterCount:chapters.length,charCount:chars});
    throwIfImportAborted(signal);await db.chapters.bulkAdd(chapters);
    throwIfImportAborted(signal);await db.sources.bulkAdd(sources);
    throwIfImportAborted(signal);await db.importJobs.add({jobId:uid(),bookId:id,phase:'preview',totalFiles:files.length,processedFiles:files.length,processedBytes:totalBytes,checkpoint:files.length,duplicateFiles:[],updatedAt:now});
    throwIfImportAborted(signal);
  }).catch(error=>{throwIfImportAborted(signal);throw error;});
  // No user callback after commit: callback failure must never report a saved import as failed.
  return {id};
}
