import type {Chapter} from '../../../core/domain';
export const APPEND_PREFIX='shared-append:',APPEND_PACKET_PREFIX='shared-append-packet:';
export interface AppendPacket {version:1;updateId:string;index:number;chapters:Chapter[]}
export interface AppendManifest {
 version:1;baseSha256:string;anchor:{id:string;revision:number;order:number;hash:string;count:number};
 source:{id:string;name:string;relativePath:string;encoding:string;sha256:string;bytes:number};
 parts:{key:string;hash:string;count:number;chars:number}[];count:number;chars:number;
}
function bad():never{throw Error('Dữ liệu cập nhật chương không hợp lệ; giữ nguyên truyện.');}
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))bad();return v as Record<string,unknown>;};
const str=(v:unknown,max:number,empty=false)=>{if(typeof v!=='string'||v.length>max||!empty&&!v.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))bad();return v;};
const num=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER,integer=true)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isSafeInteger(v))bad();return v;};
const hash=(v:unknown)=>{const s=str(v,64);if(!/^[a-f0-9]{64}$/.test(s))bad();return s;};
const updateId=(v:unknown)=>{const s=str(v,100);if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s))bad();return s;};
export function validateAppendValue(kind:'chapter-append'|'chapter-append-packet',bookId:string,key:string,value:unknown):AppendPacket|AppendManifest{
 const v=obj(value);if(v.version!==1)bad();
 if(kind==='chapter-append-packet'){
  const id=updateId(v.updateId),index=num(v.index,0,999);if(key!==`${id}:${index}`||!Array.isArray(v.chapters)||!v.chapters.length||v.chapters.length>128)bad();
  const chapters=v.chapters.map(c=>{const r=obj(c);if(r.epub!==undefined||r.bookId!==bookId||r.revision!==1)bad();return {id:str(r.id,200),bookId,order:num(r.order,0,Number.MAX_SAFE_INTEGER,false),title:str(r.title,1000,true),text:str(r.text,128000,true),revision:1,sourceId:str(r.sourceId,200),...(r.displayTitle===undefined?{}:{displayTitle:str(r.displayTitle,1000)})};});
  if(new Set(chapters.map(c=>c.id)).size!==chapters.length||chapters.reduce((n,c)=>n+c.text.length,0)>256000||chapters.some((c,i)=>i>0&&c.order!==chapters[i-1].order+1))bad();return {version:1,updateId:id,index,chapters};
 }
 updateId(key);const a=obj(v.anchor),s=obj(v.source);if(!Array.isArray(v.parts)||!v.parts.length||v.parts.length>1000)bad();
 const parts=v.parts.map((p,index)=>{const r=obj(p);if(r.key!==`${key}:${index}`)bad();return {key:r.key as string,hash:hash(r.hash),count:num(r.count,1,128),chars:num(r.chars,0,256000)};});
 const count=num(v.count,1,128000),chars=num(v.chars,0,40*1024*1024);if(parts.reduce((n,p)=>n+p.count,0)!==count||parts.reduce((n,p)=>n+p.chars,0)!==chars)bad();
 const encoding=str(s.encoding,30);if(!['utf-8','gb18030','utf-16le'].includes(encoding))bad();
 return {version:1,baseSha256:hash(v.baseSha256),anchor:{id:str(a.id,200),revision:num(a.revision,1),order:num(a.order,0,Number.MAX_SAFE_INTEGER,false),hash:hash(a.hash),count:num(a.count,1)},source:{id:str(s.id,200),name:str(s.name,300),relativePath:str(s.relativePath,1000),encoding,sha256:hash(s.sha256),bytes:num(s.bytes,1,40*1024*1024)},parts,count,chars};
}
