import {db} from '../../../core/db';
import type {Token,ConvertOptions} from './language';
import type {DictionaryStats} from './dictionary-reader';
import {readConvertNames} from './convert-names';
import {convertCache,convertCacheKey,effectiveConvertOptions} from './convert-cache';
let epoch=0;let worker:Worker|undefined;let signature='';let sequence=0;let queue:Promise<unknown>=Promise.resolve();
let onStatus:(message:string)=>void=()=>{};let stats:DictionaryStats[]=[];
const pending=new Map<number,(error:Error)=>void>();
export function setLanguageStatus(fn:(message:string)=>void){onStatus=fn;}
export function resetLanguage(){epoch++;for(const cancel of [...pending.values()])cancel(new Error('Từ điển đã thay đổi. Hãy Convert lại.'));worker?.terminate();worker=undefined;signature='';stats=[];onStatus('');}
async function request(type:string,data:Record<string,unknown>):Promise<unknown> {
  worker??=new Worker(new URL('../../../workers/language.worker.ts',import.meta.url),{type:'module'});const w=worker;const id=++sequence;
  return new Promise((resolve,reject)=>{
    let timeout:ReturnType<typeof setTimeout>;
    const clean=()=>{clearTimeout(timeout);pending.delete(id);w.removeEventListener('message',message);w.removeEventListener('error',error);};
    const error=()=>{clean();resetLanguage();reject(new Error('Worker ngôn ngữ không phản hồi. Thử lại hoặc dùng từ điển nhỏ hơn.'));};
    const tick=()=>{clearTimeout(timeout);timeout=setTimeout(error,60000);};
    const message=(e:MessageEvent)=>{if(e.data.id!==id)return;tick();if(e.data.type==='progress')onStatus(`${e.data.message} · ${e.data.percent}%`);else{clean();onStatus('');e.data.type==='error'?reject(new Error(e.data.message)):resolve(e.data.result);}};
    pending.set(id,e=>{clean();reject(e);});
    tick();w.addEventListener('message',message);w.addEventListener('error',error);
    try{w.postMessage({id,type,...data});}catch(e){clean();reject(e);}
  });
}
function checkEpoch(expected:number){if(expected!==epoch)throw new Error('Từ điển đã thay đổi. Hãy Convert lại.');}
async function ensureLoaded(expected:number){checkEpoch(expected);const files=await db.dictionaries.toArray();checkEpoch(expected);const sig=JSON.stringify(files.map(f=>[f.kind,f.sha256,f.updatedAt,f.blob.size]));if(signature!==sig||!worker){try{stats=await request('load',{files}) as DictionaryStats[];checkEpoch(expected);signature=sig;}catch(e){if(expected===epoch)resetLanguage();throw e;}}return sig;}
export function loadDictionaries():Promise<DictionaryStats[]> {const expected=epoch;const job=queue.catch(()=>{}).then(async()=>{await ensureLoaded(expected);checkEpoch(expected);return stats;});queue=job;return job;}
async function conversionSnapshot(expected:number){
  checkEpoch(expected);const [files,saved]=await Promise.all([db.dictionaries.toArray(),readConvertNames()]);checkEpoch(expected);
  const dictionarySignature=JSON.stringify(files.map(f=>[f.kind,f.sha256,f.updatedAt,f.blob.size]));
  return {saved,dictionarySignature,identity:JSON.stringify([dictionarySignature,saved])};
}
export async function convert(text:string,names:{key:string;value:string}[],options?:ConvertOptions):Promise<Token[]> {
  const expected=epoch,bookNames=names.map(n=>({key:n.key,value:n.value})),effectiveOptions=effectiveConvertOptions(options);
  const initial=await conversionSnapshot(expected);
  const initialKey=await convertCacheKey({text,options:effectiveOptions,globalNames:initial.saved,bookNames,dictionarySignature:initial.dictionarySignature});checkEpoch(expected);
  const cached=await convertCache.get(initialKey,text);checkEpoch(expected);
  if(cached){const current=await conversionSnapshot(expected);if(current.identity===initial.identity)return cached;}
  // A hit returns before the startup warm-load queue. A miss retains the
  // serial worker protocol, including reset/cancellation checks.
  const job=queue.catch(()=>{}).then(async()=>{
    const snapshot=await conversionSnapshot(expected);const workerSignature=await ensureLoaded(expected);checkEpoch(expected);
    if(workerSignature!==snapshot.dictionarySignature)throw new Error('Từ điển hoặc Name đã thay đổi. Hãy Convert lại.');
    const loaded=await conversionSnapshot(expected);if(loaded.identity!==snapshot.identity)throw new Error('Từ điển hoặc Name đã thay đổi. Hãy Convert lại.');
    const tokens=await request('convert',{text,names:[...snapshot.saved,...bookNames],options:effectiveOptions}) as Token[];checkEpoch(expected);
    const current=await conversionSnapshot(expected);if(current.identity!==snapshot.identity)throw new Error('Từ điển hoặc Name đã thay đổi. Hãy Convert lại.');
    const key=await convertCacheKey({text,options:effectiveOptions,globalNames:snapshot.saved,bookNames,dictionarySignature:snapshot.dictionarySignature});checkEpoch(expected);
    const beforeWrite=await conversionSnapshot(expected);if(beforeWrite.identity!==snapshot.identity)throw new Error('Từ điển hoặc Name đã thay đổi. Hãy Convert lại.');
    await convertCache.put(key,text,tokens);checkEpoch(expected);
    const afterWrite=await conversionSnapshot(expected);if(afterWrite.identity!==snapshot.identity)throw new Error('Từ điển hoặc Name đã thay đổi. Hãy Convert lại.');
    return tokens;
  });queue=job;return job;
}
export function lookup(source:string):Promise<{meanings:string[];hanviet:string;english?:string[];names?:string[]}> {const expected=epoch;const job=queue.catch(()=>{}).then(async()=>{await ensureLoaded(expected);checkEpoch(expected);return await request('lookup',{source}) as {meanings:string[];hanviet:string;english?:string[];names?:string[]};});queue=job;return job;}
