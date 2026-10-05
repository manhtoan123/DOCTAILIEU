import {db} from './db';
import type {Token} from './language';
let worker:Worker|undefined;let signature='';let sequence=0;let queue:Promise<unknown>=Promise.resolve();
let onStatus:(message:string)=>void=()=>{};
export function setLanguageStatus(fn:(message:string)=>void){onStatus=fn;}
export function resetLanguage(){worker?.terminate();worker=undefined;signature='';}
async function request(type:string,data:Record<string,unknown>):Promise<unknown> {
  worker??=new Worker(new URL('./workers/language.worker.ts',import.meta.url),{type:'module'});const w=worker;const id=++sequence;
  return new Promise((resolve,reject)=>{
    let timeout:ReturnType<typeof setTimeout>;
    const clean=()=>{clearTimeout(timeout);w.removeEventListener('message',message);w.removeEventListener('error',error);};
    const error=()=>{clean();resetLanguage();reject(new Error('Worker ngôn ngữ không phản hồi. Thử lại hoặc dùng từ điển nhỏ hơn.'));};
    const tick=()=>{clearTimeout(timeout);timeout=setTimeout(error,60000);};
    const message=(e:MessageEvent)=>{if(e.data.id!==id)return;tick();if(e.data.type==='progress')onStatus(`${e.data.message} · ${e.data.percent}%`);else{clean();onStatus('');e.data.type==='error'?reject(new Error(e.data.message)):resolve(e.data.result);}};
    tick();w.addEventListener('message',message);w.addEventListener('error',error);w.postMessage({id,type,...data});
  });
}
async function ensureLoaded(){const files=await db.dictionaries.toArray();const sig=files.map(f=>`${f.kind}:${f.updatedAt}`).join('|');if(signature!==sig||!worker){await request('load',{files});signature=sig;}}
export function convert(text:string,names:{key:string;value:string}[]):Promise<Token[]> {
  const job=queue.catch(()=>{}).then(async()=>{await ensureLoaded();return await request('convert',{text,names}) as Token[];});queue=job;return job;
}
export function lookup(source:string):Promise<{meanings:string[];hanviet:string}> {const job=queue.catch(()=>{}).then(async()=>{await ensureLoaded();return await request('lookup',{source}) as {meanings:string[];hanviet:string};});queue=job;return job;}

