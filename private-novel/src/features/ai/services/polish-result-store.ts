import {db} from '../../../core/db';
import {polishOriginalEnd,type PolishPair,type AppliedPolish} from './convert-polish';
import {combinePolishTerms,type PolishTerm} from './polish-output';
/** Adopt only the exact old Convert hash. Do not scan/guess among old Names,
 * overwrite a newer run, delete old cache, or touch chapters/original files. */
export async function adoptLegacyPolish(key:string,legacyKey:string,base:string,pairs:PolishPair[],signal:AbortSignal){
 signal.throwIfAborted();
 await db.transaction('rw',db.settings,async transaction=>{
  const abort=()=>transaction.abort(),detach=()=>signal.removeEventListener('abort',abort);
  transaction.on('complete',detach);transaction.on('abort',detach);signal.addEventListener('abort',abort,{once:true});signal.throwIfAborted();
  if(await db.settings.get(key))return;
  const legacy=(await db.settings.get(legacyKey))?.value as AppliedPolish|undefined;
  if(!legacy?.applied||![2,3].includes(legacy.version??0)||typeof legacy.text!=='string'||!legacy.text.trim())return;
  let value:AppliedPolish={...legacy,version:4};
  if(legacy.partial){const end=legacy.sourceEnd;if(!Number.isSafeInteger(end)||end!<1||end!>=base.length||!legacy.text.endsWith(base.slice(end)))return;value={...value,baseConvert:base,originalEnd:polishOriginalEnd(pairs,end!),prefix:legacy.text.slice(0,legacy.text.length-base.slice(end).length)};}
  signal.throwIfAborted();await db.settings.put({key,value});signal.throwIfAborted();
 });
 signal.throwIfAborted();
}
/** Cancellation covers the native transaction commit boundary as well as queued writes. */
async function persistPolishResult(key:string,signal:AbortSignal,value:()=>unknown|Promise<unknown>){
 signal.throwIfAborted();
 await db.transaction('rw',db.settings,async transaction=>{
  const abort=()=>transaction.abort(),detach=()=>signal.removeEventListener('abort',abort);
  transaction.on('complete',detach);transaction.on('abort',detach);
  signal.addEventListener('abort',abort,{once:true});signal.throwIfAborted();
  const next=await value();signal.throwIfAborted();await db.settings.put({key,value:next});signal.throwIfAborted();
 });
 signal.throwIfAborted();
}
export function writePolishResult(key:string,value:unknown,signal:AbortSignal){
 return persistPolishResult(key,signal,()=>value);
}

/** A completed parallel part can yield terms before its prose can be applied. */
export function writePolishTerms(key:string,terms:PolishTerm[],model:string,signal:AbortSignal){
 return persistPolishResult(key,signal,async()=>{
  const saved=(await db.settings.get(key))?.value as (AppliedPolish&{terms?:PolishTerm[]})|undefined;
  return {...(saved??{version:4,applied:false,text:'',model}),terms:combinePolishTerms([saved?.terms,terms])};
 });
}

/** Disposable derived results only: never prompts/options, AI cache or book content. */
export async function clearPolishChapter(chapterId:string):Promise<number>{
 if(!chapterId)throw Error('Chưa xác định chương cần hủy cache.');
 const prefix=`convert-polish:v1:${chapterId}:`;
 return db.transaction('rw',db.settings,async()=>{
  const rows=await db.settings.where('key').startsWith(prefix).toArray();
  const keys=rows.filter(row=>{
   const value=row.value as {version?:unknown;text?:unknown}|null;
   return /^\d+:[a-f0-9]{64}$/.test(row.key.slice(prefix.length))&&value&&[1,2,3,4].includes(value.version as number)&&typeof value.text==='string';
  }).map(row=>row.key);
  await db.settings.bulkDelete(keys);return keys.length;
 });
}
