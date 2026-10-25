import {db} from '../../../core/db';
import {dictionaryKinds} from '../../../core/domain';
import {readConvertNames} from './convert-names';
import {normalizeKey} from './reference-convert';
import {nameSourceKey,safeNameImageUrl} from './name-images';
import type {Token} from './language';
import {getCloudDeviceToken} from '../../sync-cloud/services/cloud-device';
type Meaning={meanings:string[];hanviet:string;english?:string[];names?:string[]};
export interface NameServerResult {tokens:Token[];lookup:Meaning;lookups:({source:string}&Meaning)[]}
const cache=new Map<string,NameServerResult>();
async function snapshot(){const [files,names]=await Promise.all([db.dictionaries.toArray(),readConvertNames()]);return {names,manifest:files.map(f=>({kind:f.kind==='names2'&&/^(DaiTuNhanXung|Pronouns|DaiTu)\.txt$/i.test(f.name)?'pronouns':f.kind,sha256:f.sha256})).sort((a,b)=>a.kind.localeCompare(b.kind))};}
async function json(response:Response){if(!response.ok)throw Error(response.status===429?'Convert máy chủ đang bận hoặc hết lượt hôm nay.':'Không dùng được Convert máy chủ.');if(!response.body)throw Error('Thiếu kết quả Convert.');const reader=response.body.getReader(),decoder=new TextDecoder();let body='',size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2097152)throw Error('Kết quả Convert quá lớn.');body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();return JSON.parse(body);}finally{await reader.cancel();reader.releaseLock();}}
export async function convertNameOnServer(text:string,bookNames:{key:string;value:string}[],signal?:AbortSignal,includeLookup=false):Promise<NameServerResult>{
 if(text.length>256)throw Error('Đoạn nguồn dài hơn giới hạn Convert máy chủ.');
 const abort=AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])]);
 const before=await snapshot(),identity=JSON.stringify(before),headers:Record<string,string>={},token=await getCloudDeviceToken();if(token)headers.Authorization=`Bearer ${token}`;
 const version=await json(await fetch('/api/convert/name',{headers,signal:abort,credentials:'same-origin',redirect:'error'}));
 if(typeof version.version!=='string'||!version.version||version.version.length>256||!Array.isArray(version.dictionaries)||!version.dictionaries.length||version.dictionaries.length>dictionaryKinds.length||version.dictionaries.some((d:any)=>!d||!dictionaryKinds.includes(d.kind)||typeof d.sha256!=='string'||!/^[a-f0-9]{64}$/.test(d.sha256))||new Set(version.dictionaries.map((d:any)=>d.kind)).size!==version.dictionaries.length)throw Error('Phiên bản từ điển máy chủ không hợp lệ.');
 const remote=[...version.dictionaries].sort((a,b)=>String(a.kind).localeCompare(String(b.kind)));
 if(before.manifest.length&&JSON.stringify(before.manifest)!==JSON.stringify(remote))throw Error('Từ điển bạn chọn khác bản máy chủ.');
 const normalized=normalizeKey(text),names=[...before.names,...bookNames].filter(n=>normalized.includes(normalizeKey(nameSourceKey(n.key))));
 const key=JSON.stringify([version.version,remote,identity,text,names,includeLookup]);
 const cached=cache.get(key);if(cached){abort.throwIfAborted();if(JSON.stringify(await snapshot())!==identity)throw Error('Từ điển hoặc Name đã thay đổi.');abort.throwIfAborted();cache.delete(key);cache.set(key,cached);return structuredClone(cached);}
 const result=await json(await fetch('/api/convert/name',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Convert-Version':version.version},body:JSON.stringify({text,names,includeLookup}),signal:abort,credentials:'same-origin',redirect:'error'}));
 if(result.version!==version.version||!Array.isArray(result.tokens)||!Array.isArray(result.lookups)||!result.lookup||typeof result.lookup.hanviet!=='string'||!Array.isArray(result.lookup.meanings))throw Error('Kết quả Convert không hợp lệ.');
 const strings=(value:unknown)=>Array.isArray(value)&&value.every(item=>typeof item==='string');
 const meaning=(value:any)=>value&&typeof value.hanviet==='string'&&strings(value.meanings)&&(value.english===undefined||strings(value.english))&&(value.names===undefined||strings(value.names));
 if(!meaning(result.lookup))throw Error('Nghĩa tra cứu không hợp lệ.');
 let end=0,totalOutput=0;const splitPair=(at:number)=>at>0&&at<text.length&&/[\uD800-\uDBFF]/.test(text[at-1])&&/[\uDC00-\uDFFF]/.test(text[at]);
 for(const t of result.tokens){if(!Number.isInteger(t.sourceStart)||!Number.isInteger(t.sourceEnd)||t.sourceStart<end||t.sourceEnd<t.sourceStart||t.sourceEnd>text.length||text.slice(end,t.sourceStart).trim()||splitPair(t.sourceStart)||splitPair(t.sourceEnd)||t.source!==text.slice(t.sourceStart,t.sourceEnd)||typeof t.targetText!=='string'||typeof t.type!=='string'||!meaning(t)||t.nameImage&&(typeof t.nameImage.label!=='string'||!safeNameImageUrl(t.nameImage.url)))throw Error('Vị trí cụm từ không khớp nguồn.');end=t.sourceEnd;totalOutput+=t.targetText.length;if(totalOutput>262144)throw Error('Kết quả Convert quá lớn.');}
 if(text.slice(end).trim())throw Error('Kết quả Convert thiếu nguồn.');
 const words=result.tokens.filter((t:Token)=>t.source.trim());
 if(result.lookups.length!==words.length||result.lookups.some((item:any,index:number)=>!meaning(item)||item.source!==words[index].source))throw Error('Nghĩa cụm từ không khớp nguồn.');
 abort.throwIfAborted();if(JSON.stringify(await snapshot())!==identity)throw Error('Từ điển hoặc Name đã thay đổi.');abort.throwIfAborted();
 const value:NameServerResult={tokens:result.tokens,lookup:result.lookup,lookups:result.lookups};cache.set(key,structuredClone(value));while(cache.size>8)cache.delete(cache.keys().next().value!);return value;
}
