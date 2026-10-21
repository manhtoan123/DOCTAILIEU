import {db} from '../../../core/db';
import {aiReadingKey,type AiReadingSource,type ReadingAiSettings} from './ai-reading';
import {readingPartModels,validReadingResult} from './ai-fallback';
import type {AiTranslateClientResponse} from './ai-translate';
import type {AiPartRecord} from './ai-parts';
import {filterNamesForText} from './ai-translate';
import {hasCopiedSource} from './ai-source-copy';

export const AI_READING_CACHE_PREFIX='ai-reading-cache:v1:';
export const AI_PART_CACHE_PREFIX='ai-reading-cache:parts:v1:';
const CACHE_ROOT='ai-reading-cache:';
export const AI_READING_CACHE_MAX_RECORDS=100;
export const AI_READING_CACHE_MAX_BYTES=32*1024*1024;
const MAX_RESPONSE_BYTES=1024*1024;
type Names={key:string;value:string}[];
interface CacheEntry {version:1;bookId:string;chapterId:string;digest:string;accessedAt:number;response:AiTranslateClientResponse}
interface Row {key:string;value:unknown}
interface PartEntry {version:'parts-1';bookId:string;chapterId:string;digest:string;partId:string;accessedAt:number;response:AiTranslateClientResponse}
export const validAiPartId=(id:string)=>/^\d{1,4}(?:\/[01]){0,3}$/.test(id);
const encoder=new TextEncoder();
function bytes(value:unknown):number{try{return encoder.encode(JSON.stringify(value)).byteLength;}catch{return Infinity;}}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function response(value:unknown):AiTranslateClientResponse|undefined{
  if(!object(value)||value.finishReason!=='STOP'||typeof value.result!=='string'||!value.result.trim()||typeof value.model!=='string'||!value.model.trim())return;
  if(typeof value.inputTokens!=='number'||!Number.isSafeInteger(value.inputTokens)||value.inputTokens<0||typeof value.outputTokens!=='number'||!Number.isSafeInteger(value.outputTokens)||value.outputTokens<0)return;
  let halves:AiTranslateClientResponse['halves'];
  if(value.halves!==undefined){const h=value.halves;if(!object(h)||h.version!==1||!Array.isArray(h.models)||h.models.length!==2||h.models.some(m=>typeof m!=='string')||typeof h.sampleHash!=='string'||!/^[a-f0-9]{64}$/.test(h.sampleHash)||value.model!=='hybrid')return;halves={version:1,models:[h.models[0],h.models[1]],sampleHash:h.sampleHash};}
  if(value.model==='hybrid'&&!halves)return;
  const result={result:value.result,model:value.model,finishReason:'STOP',inputTokens:value.inputTokens,outputTokens:value.outputTokens,...(halves?{halves}:{})};
  return bytes(result)<=MAX_RESPONSE_BYTES?result:undefined;
}
function entry(row:Row):CacheEntry|undefined{
  const v=row.value;
  if(!object(v)||v.version!==1||typeof v.bookId!=='string'||typeof v.chapterId!=='string'||typeof v.digest!=='string'||!/^[a-f0-9]{64}$/.test(v.digest)||row.key!==AI_READING_CACHE_PREFIX+v.digest||typeof v.accessedAt!=='number'||!Number.isSafeInteger(v.accessedAt)||v.accessedAt<0)return;
  const r=response(v.response);if(!r)return;
  return {version:1,bookId:v.bookId,chapterId:v.chapterId,digest:v.digest,accessedAt:v.accessedAt,response:r};
}
function partEntry(row:Row):PartEntry|undefined{
 const v=row.value;if(!object(v)||v.version!=='parts-1'||typeof v.bookId!=='string'||typeof v.chapterId!=='string'||typeof v.digest!=='string'||!/^[a-f0-9]{64}$/.test(v.digest)||typeof v.partId!=='string'||!validAiPartId(v.partId)||row.key!==AI_PART_CACHE_PREFIX+v.digest+':'+v.partId||!Number.isSafeInteger(v.accessedAt)||Number(v.accessedAt)<0)return;
 const r=response(v.response);if(!r)return;return {version:'parts-1',bookId:v.bookId,chapterId:v.chapterId,digest:v.digest,partId:v.partId,accessedAt:Number(v.accessedAt),response:r};
}
const knownEntry=(row:Row)=>entry(row)??partEntry(row);
function request<T>(value:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error);});}
function cancelled(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');}
async function digest(key:string):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(key))),n=>n.toString(16).padStart(2,'0')).join('');}
/** Native completion/abort settles the promise only after commit/rollback, including late abort. */
async function transaction<T>(operation:(tx:IDBTransaction)=>Promise<T>,signal?:AbortSignal):Promise<T>{
  cancelled(signal);await db.open();cancelled(signal);
  return new Promise<T>((resolve,reject)=>{
    const tx=db.backendDB().transaction(['settings','books','chapters'],'readwrite');let result:T;let failure:unknown;
    const abort=()=>{try{tx.abort();}catch{/* Already completed; caller checks signal again. */}};
    const clean=()=>signal?.removeEventListener('abort',abort);
    tx.oncomplete=()=>{clean();if(signal?.aborted)reject(new DOMException('Cancelled','AbortError'));else resolve(result);};
    tx.onabort=()=>{clean();reject(failure??tx.error??new DOMException('Cancelled','AbortError'));};
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return;}
    void operation(tx).then(value=>{result=value;},error=>{failure=error;abort();});
  });
}
async function current(tx:IDBTransaction,source:AiReadingSource):Promise<boolean>{
  const book=await request(tx.objectStore('books').get(source.bookId));
  const chapter=await request(tx.objectStore('chapters').get(source.id));
  return book?.status==='ready'&&!book.hiddenChapterIds?.includes(source.id)&&chapter?.bookId===source.bookId&&chapter.revision===source.revision&&chapter.text===source.text;
}
function rows(tx:IDBTransaction):Promise<Row[]>{return request(tx.objectStore('settings').getAll(IDBKeyRange.bound(CACHE_ROOT,CACHE_ROOT+'\uffff')));}
async function saveRow(tx:IDBTransaction,row:Row,signal?:AbortSignal):Promise<boolean>{
 const store=tx.objectStore('settings'),all=await rows(tx),existing=all.find(r=>r.key===row.key);if(existing&&!knownEntry(existing))return false;
 const retained=all.filter(r=>r.key!==row.key);let size=retained.reduce((sum,r)=>sum+bytes(r),bytes(row)),count=retained.length+1;
 const removable=retained.flatMap(r=>{const e=knownEntry(r);return e?[{row:r,time:e.accessedAt}]:[];}).sort((a,b)=>a.time-b.time||a.row.key.localeCompare(b.row.key));
 const remove:string[]=[];for(const old of removable){if(count<=AI_READING_CACHE_MAX_RECORDS&&size<=AI_READING_CACHE_MAX_BYTES)break;remove.push(old.row.key);count--;size-=bytes(old.row);}
 if(count>AI_READING_CACHE_MAX_RECORDS||size>AI_READING_CACHE_MAX_BYTES)return false;
 cancelled(signal);for(const key of remove)await request(store.delete(key));cancelled(signal);await request(store.put(row));return true;
}

/** Optional local cache. Failure is a miss; never prevents a successful translation being shown. */
export async function readAiReadingCache(source:AiReadingSource,settings:ReadingAiSettings,names:Names,signal?:AbortSignal):Promise<AiTranslateClientResponse|undefined>{
  try{
    source={...source};const key=aiReadingKey(source,settings,names);cancelled(signal);const hash=await digest(key);cancelled(signal);
    const result=await transaction(async tx=>{
      if(!await current(tx,source))return;
      const store=tx.objectStore('settings'),row=await request(store.get(AI_READING_CACHE_PREFIX+hash)) as Row|undefined;
      const cached=row&&entry(row);if(!cached||cached.bookId!==source.bookId||cached.chapterId!==source.id||!validReadingResult(cached.response,settings)||hasCopiedSource(source.text,cached.response.result,names.map(n=>n.value)))return;
      cancelled(signal);await request(store.put({key:row!.key,value:{...cached,accessedAt:Date.now()}}));
      return cached.response;
    },signal);cancelled(signal);return result;
  }catch{return undefined;}
}

export async function writeAiReadingCache(source:AiReadingSource,settings:ReadingAiSettings,names:Names,result:AiTranslateClientResponse,signal?:AbortSignal):Promise<boolean>{
  try{
    source={...source};const key=aiReadingKey(source,settings,names),completed=response(result);if(!completed||!validReadingResult(completed,settings)||hasCopiedSource(source.text,completed.result,names.map(n=>n.value)))return false;
    cancelled(signal);const hash=await digest(key);cancelled(signal);
    const saved=await transaction(async tx=>{
      if(!await current(tx,source))return false;
      const cacheKey=AI_READING_CACHE_PREFIX+hash;
      const row:Row={key:cacheKey,value:{version:1,bookId:source.bookId,chapterId:source.id,digest:hash,accessedAt:Date.now(),response:completed} satisfies CacheEntry};
      return saveRow(tx,row,signal);
    },signal);cancelled(signal);return saved;
  }catch{return false;}
}

export async function readAiParts(source:AiReadingSource,settings:ReadingAiSettings,names:Names,plan:string,signal?:AbortSignal,legacyIdentity=false):Promise<AiPartRecord[]>{
 try{
  source={...source};cancelled(signal);
  const key=legacyIdentity?JSON.stringify([source.bookId,source.id,source.revision,source.text,settings,settings.continuation||settings.hybrid?names:filterNamesForText(source.text,names)]):aiReadingKey(source,settings,names);
  const hash=await digest(JSON.stringify([key,plan]));cancelled(signal);
  const result=await transaction(async tx=>{if(!await current(tx,source))return [];const all=await rows(tx);return all.flatMap(row=>{const part=partEntry(row);return part&&part.digest===hash&&part.bookId===source.bookId&&part.chapterId===source.id&&!part.response.halves&&readingPartModels(settings).includes(part.response.model)&&!hasCopiedSource(source.text,part.response.result,names.map(n=>n.value))?[{id:part.partId,response:part.response}]:[];});},signal);cancelled(signal);return result;
 }catch{return [];}
}
export async function writeAiPart(source:AiReadingSource,settings:ReadingAiSettings,names:Names,plan:string,id:string,result:AiTranslateClientResponse,signal?:AbortSignal):Promise<boolean>{
 try{
  source={...source};const completed=response(result);if(!completed||completed.halves||!validAiPartId(id)||!readingPartModels(settings).includes(completed.model)||hasCopiedSource(source.text,completed.result,names.map(n=>n.value)))return false;
  cancelled(signal);const hash=await digest(JSON.stringify([aiReadingKey(source,settings,names),plan]));cancelled(signal);
  const row:Row={key:AI_PART_CACHE_PREFIX+hash+':'+id,value:{version:'parts-1',bookId:source.bookId,chapterId:source.id,digest:hash,partId:id,accessedAt:Date.now(),response:completed} satisfies PartEntry};
  const saved=await transaction(async tx=>{if(!await current(tx,source))return false;return saveRow(tx,row,signal);},signal);cancelled(signal);return saved;
 }catch{return false;}
}

/** Only known cache records for this book; unrelated settings and unknown formats survive. */
export async function clearBookAiReadingCache(bookId:string):Promise<void>{
  try{await transaction(async tx=>{for(const row of await rows(tx)){const cached=knownEntry(row);if(cached?.bookId===bookId)await request(tx.objectStore('settings').delete(row.key));}});}catch{/* Disposable cache; source guard still prevents hits for deleted books. */}
}
