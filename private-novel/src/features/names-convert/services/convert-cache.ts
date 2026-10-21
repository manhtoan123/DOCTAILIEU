import Dexie, {type Table} from 'dexie';
import type {ConvertOptions, Token} from './language';
import {validNameImage,NAME_IMAGE_LIMIT} from './name-images';

// Bump whenever conversion/token semantics change. This DB is disposable and
// deliberately separate from the library, backups and their migrations.
export const CONVERT_CACHE_VERSION=2;
export const CONVERT_CACHE_DB='thu-phong-convert-cache-v1';
export const CONVERT_CACHE_TOTAL_BYTES=16*1024*1024;
export const CONVERT_CACHE_ENTRY_BYTES=2*1024*1024;
const ENTRY_COUNT_LIMIT=256;
type Row={key:string;version:number;payload:string;digest:string;bytes:number;touchedAt:number};
export type CacheInputs={text:string;options:ConvertOptions;globalNames:{key:string;value:string}[];bookNames:{key:string;value:string}[];dictionarySignature:string};
const encoder=new TextEncoder();
async function sha256(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function effectiveConvertOptions(options:ConvertOptions={}):Required<ConvertOptions>{
  return {mode:options.mode??'vietphrase',multipleMeanings:options.multipleMeanings??false,reference:options.reference??true,standardizePunctuation:options.standardizePunctuation??true,capitalize:options.capitalize??true};
}
export async function convertCacheKey(input:CacheInputs):Promise<string|undefined>{
  try{return await sha256(JSON.stringify({version:CONVERT_CACHE_VERSION,textHash:await sha256(JSON.stringify(input.text)),options:effectiveConvertOptions(input.options),globalNames:input.globalNames,bookNames:input.bookNames,dictionarySignature:input.dictionarySignature}));}catch{return undefined;}
}
function validTokens(value:unknown,text:string):value is Token[]{
  if(!Array.isArray(value))return false;
  let covered=0,imageCount=0;
  for(const item of value){
    if(item?.nameImage!==undefined&&(!validNameImage(item.nameImage)||++imageCount>NAME_IMAGE_LIMIT))return false;
    if(!item||typeof item!=='object'||!Number.isSafeInteger(item.sourceStart)||!Number.isSafeInteger(item.sourceEnd)||item.sourceStart!==covered||item.sourceEnd<=covered||item.sourceEnd>text.length||item.source!==text.slice(item.sourceStart,item.sourceEnd)||typeof item.targetText!=='string'||typeof item.type!=='string'||typeof item.hanviet!=='string'||!Array.isArray(item.meanings)||!item.meanings.every((s:unknown)=>typeof s==='string'))return false;
    // Reader edits must never split a Unicode surrogate pair.
    if(item.sourceEnd<text.length&&/[\uD800-\uDBFF]/.test(text[item.sourceEnd-1])&&/[\uDC00-\uDFFF]/.test(text[item.sourceEnd]))return false;
    covered=item.sourceEnd;
  }
  return covered===text.length;
}
export const convertCacheMetrics={hits:0,misses:0,writes:0,failures:0};
export class ConvertCache {
  readonly database:Dexie;
  readonly entries:Table<Row,string>;
  private clock=0;
  constructor(name=CONVERT_CACHE_DB,private totalBytes=CONVERT_CACHE_TOTAL_BYTES,private entryBytes=CONVERT_CACHE_ENTRY_BYTES){
    this.totalBytes=Math.min(totalBytes,CONVERT_CACHE_TOTAL_BYTES);this.entryBytes=Math.min(entryBytes,CONVERT_CACHE_ENTRY_BYTES);
    this.database=new Dexie(name);this.database.version(1).stores({entries:'key,touchedAt'});this.entries=this.database.table('entries');
  }
  async get(key:string|undefined,text:string):Promise<Token[]|undefined>{
    if(!key)return undefined;
    try{
      const row=await this.entries.get(key);
      if(row&&row.version===CONVERT_CACHE_VERSION&&typeof row.payload==='string'&&row.bytes===encoder.encode(row.payload).byteLength+256&&row.bytes<=this.entryBytes&&await sha256(row.payload)===row.digest){
        const tokens:unknown=JSON.parse(row.payload);
        if(validTokens(tokens,text)){await this.entries.update(key,{touchedAt:this.touch()});convertCacheMetrics.hits++;return tokens;}
      }
      if(row)await this.entries.delete(key);
      convertCacheMetrics.misses++;
    }catch{convertCacheMetrics.failures++;}
    return undefined;
  }
  private touch(){return this.clock=Math.max(Date.now(),this.clock+1);}
  async put(key:string|undefined,text:string,tokens:Token[]):Promise<void>{
    if(!key||!validTokens(tokens,text))return;
    try{
      const payload=JSON.stringify(tokens),bytes=encoder.encode(payload).byteLength+256;
      if(bytes>this.entryBytes||bytes>this.totalBytes)return;
      const row:Row={key,version:CONVERT_CACHE_VERSION,payload,digest:await sha256(payload),bytes,touchedAt:this.touch()};
      // Hashing stays outside the transaction: awaiting WebCrypto inside an
      // IndexedDB transaction can close it before the write.
      await this.database.transaction('rw',this.entries,async()=>{
        const previous=await this.entries.toArray();let used=bytes,count=1;
        const keep=previous.filter(r=>r.key!==key&&r.version===CONVERT_CACHE_VERSION&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=this.entryBytes&&Number.isFinite(r.touchedAt)&&typeof r.payload==='string'&&r.bytes===encoder.encode(r.payload).byteLength+256);
        const keepKeys=new Set(keep.map(r=>r.key));const remove=previous.filter(r=>r.key!==key&&!keepKeys.has(r.key)).map(r=>r.key);
        for(const item of keep){used+=item.bytes;count++;}
        keep.sort((a,b)=>a.touchedAt-b.touchedAt||a.key.localeCompare(b.key));
        for(const item of keep){if(used<=this.totalBytes&&count<=ENTRY_COUNT_LIMIT)break;remove.push(item.key);used-=item.bytes;count--;}
        await this.entries.bulkDelete(remove);await this.entries.put(row);
      });
      convertCacheMetrics.writes++;
    }catch{convertCacheMetrics.failures++;}
  }
  close(){this.database.close();}
}
export const convertCache=new ConvertCache();
/** Diagnostic only: no content or dictionary data leaves the local cache. */
export async function hasCachedConversions(){try{return await convertCache.entries.count()>0;}catch{return false;}}
