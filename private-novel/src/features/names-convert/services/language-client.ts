import {db} from '../../../core/db';
import type {Token,ConvertOptions} from './language';
import type {DictionaryStats} from './dictionary-reader';
import {readConvertNames} from './convert-names';
import {convertCache,convertCacheKey,effectiveConvertOptions} from './convert-cache';
import {chooseBackendMessage,convertBackend,convertAndLookupOnServer,convertOnServer,lookupOnServer} from './convert-server-client';
import {readLocalVietphrase} from './local-vietphrase';
let epoch=0;let worker:Worker|undefined;let signature='';let sequence=0;let queue:Promise<unknown>=Promise.resolve();
let onStatus:(message:string)=>void=()=>{};let stats:DictionaryStats[]=[];
const pending=new Map<number,(error:Error)=>void>();
export function setLanguageStatus(fn:(message:string)=>void){onStatus=fn;}
export function resetLanguage(){epoch++;for(const cancel of [...pending.values()])cancel(new Error('Từ điển đã thay đổi. Hãy Convert lại.'));worker?.terminate();worker=undefined;signature='';stats=[];onStatus('');}
async function request(type:string,data:Record<string,unknown>):Promise<unknown> {
  if(convertBackend()!=='local')throw new Error('Đích Convert đã thay đổi.');
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
async function localDictionarySnapshot(includeOverrides=true){
  const [files,overrides]=await Promise.all([db.dictionaries.toArray(),includeOverrides?readLocalVietphrase():undefined]);
  const identities:unknown[] = files.map(f=>[f.kind,f.sha256,f.updatedAt,f.blob.size]);
  // Keep persisted cache hits for unmodified dictionaries, including the empty engine.
  if(overrides?.revision)identities.push({localVietphrase:overrides.revision});
  return {files,overrides:overrides?.entries??[],dictionarySignature:JSON.stringify(identities)};
}
export async function localDictionarySignature(){
  return (await localDictionarySnapshot()).dictionarySignature;
}
async function ensureLoaded(expected:number,includeOverrides=true){
  checkEpoch(expected);
  const {files,overrides,dictionarySignature}=await localDictionarySnapshot(includeOverrides);
  checkEpoch(expected);
  if(signature!==dictionarySignature||!worker){
    try{
      stats=await request('load',{files,overrides}) as DictionaryStats[];
      checkEpoch(expected);
      signature=dictionarySignature;
    }catch(e){if(expected===epoch)resetLanguage();throw e;}
  }
  return dictionarySignature;
}
export function loadDictionaries():Promise<DictionaryStats[]> {const expected=epoch;const job=queue.catch(()=>{}).then(async()=>{await ensureLoaded(expected);checkEpoch(expected);return stats;});queue=job;return job;}
async function conversionSnapshot(expected:number,includeOverrides:boolean){
  checkEpoch(expected);const [dictionarySignature,saved]=await Promise.all([localDictionarySnapshot(includeOverrides).then(row=>row.dictionarySignature),readConvertNames()]);checkEpoch(expected);
  return {saved,dictionarySignature,identity:JSON.stringify([dictionarySignature,saved])};
}
async function serverConversion<T>(names:{key:string;value:string}[],run:(scoped:{key:string;value:string}[])=>Promise<T>,signal?:AbortSignal){
  const expected=epoch;
  const bookNames=names.map(({key,value})=>({key,value}));
  const saved=await readConvertNames();
  signal?.throwIfAborted();
  checkEpoch(expected);
  if(convertBackend()!=='server')throw new Error('Đích Convert đã thay đổi. Hãy thử lại.');
  const result=await run([...saved,...bookNames]);
  checkEpoch(expected);
  if(convertBackend()!=='server'||JSON.stringify(saved)!==JSON.stringify(await readConvertNames()))
    throw new Error('Đích Convert hoặc Name đã thay đổi. Hãy thử lại.');
  return result;
}
export async function convert(text:string,names:{key:string;value:string}[],options?:ConvertOptions,signal?:AbortSignal):Promise<Token[]> {
  const backend=convertBackend();
  if(backend==='local')return convertLocal(text,names,options);
  if(backend==='unset')throw new Error(chooseBackendMessage);
  return serverConversion(names,scoped=>convertOnServer(text,scoped,effectiveConvertOptions(options),signal),signal);
}
export async function convertAndLookup(source:string,names:{key:string;value:string}[],signal:AbortSignal){
  const options={standardizePunctuation:true,capitalize:false};
  const backend=convertBackend();
  if(backend==='unset')throw new Error(chooseBackendMessage);
  if(backend==='server')
    return serverConversion(names,scoped=>convertAndLookupOnServer(source,scoped,effectiveConvertOptions(options),signal),signal);
  const expected=epoch;
  const initial=await localDictionarySignature();
  checkEpoch(expected);
  if(convertBackend()!=='local')throw new Error('Đích Convert đã thay đổi.');
  const result=await Promise.all([lookup(source),convertLocal(source,names,options)]);
  const current=await localDictionarySignature();
  checkEpoch(expected);
  if(initial!==current||convertBackend()!=='local')throw new Error('Từ điển đã thay đổi. Hãy thử lại.');
  return result;
}
export async function convertLocal(text:string,names:{key:string;value:string}[],options?:ConvertOptions,includeOverrides=true):Promise<Token[]> {
  if(convertBackend()!=='local')throw new Error('Đích Convert đã thay đổi.');
  const expected=epoch,bookNames=names.map(n=>({key:n.key,value:n.value})),effectiveOptions=effectiveConvertOptions(options);
  const initial=await conversionSnapshot(expected,includeOverrides);
  const initialKey=await convertCacheKey({text,options:effectiveOptions,globalNames:initial.saved,bookNames,dictionarySignature:initial.dictionarySignature});checkEpoch(expected);
  const cached=await convertCache.get(initialKey,text);checkEpoch(expected);
  if(cached){const current=await conversionSnapshot(expected,includeOverrides);if(current.identity===initial.identity)return cached;}
  // A hit returns before the startup warm-load queue. A miss retains the
  // serial worker protocol, including reset/cancellation checks.
  const job=queue.catch(()=>{}).then(async()=>{
    const snapshot=await conversionSnapshot(expected,includeOverrides);const workerSignature=await ensureLoaded(expected,includeOverrides);checkEpoch(expected);
    if(workerSignature!==snapshot.dictionarySignature)throw new Error('Từ điển hoặc Name đã thay đổi. Hãy Convert lại.');
    const loaded=await conversionSnapshot(expected,includeOverrides);if(loaded.identity!==snapshot.identity)throw new Error('Từ điển hoặc Name đã thay đổi. Hãy Convert lại.');
    const tokens=await request('convert',{text,names:[...snapshot.saved,...bookNames],options:effectiveOptions}) as Token[];checkEpoch(expected);
    const current=await conversionSnapshot(expected,includeOverrides);if(current.identity!==snapshot.identity)throw new Error('Từ điển hoặc Name đã thay đổi. Hãy Convert lại.');
    const key=await convertCacheKey({text,options:effectiveOptions,globalNames:snapshot.saved,bookNames,dictionarySignature:snapshot.dictionarySignature});checkEpoch(expected);
    const beforeWrite=await conversionSnapshot(expected,includeOverrides);if(beforeWrite.identity!==snapshot.identity)throw new Error('Từ điển hoặc Name đã thay đổi. Hãy Convert lại.');
    await convertCache.put(key,text,tokens);checkEpoch(expected);
    const afterWrite=await conversionSnapshot(expected,includeOverrides);if(afterWrite.identity!==snapshot.identity)throw new Error('Từ điển hoặc Name đã thay đổi. Hãy Convert lại.');
    return tokens;
  });queue=job;return job;
}
export function lookup(source:string):Promise<{meanings:string[];hanviet:string;english?:string[];names?:string[]}> {
  const backend=convertBackend();
  if(backend==='unset')return Promise.reject(new Error(chooseBackendMessage));
  if(backend==='server')return lookupOnServer(source);
  const expected=epoch;
  const job=queue.catch(()=>{}).then(async()=>{
    const initial=await ensureLoaded(expected);
    const result=await request('lookup',{source}) as {meanings:string[];hanviet:string;english?:string[];names?:string[]};
    const current=await localDictionarySignature();
    checkEpoch(expected);
    if(initial!==current)throw new Error('Từ điển đã thay đổi. Hãy thử lại.');
    return result;
  });
  queue=job;
  return job;
}
