import {BOOK_METADATA_MAX_CHARS} from '../../../shared/constants/book-metadata';
import {ttsVoiceIds} from '../../../shared/constants/capcut-voices';
import {validateSharedImage} from './shared-image-schema';
import {validateEpubLayout} from '../../import-export/services/epub-layout-schema';
import {validatePromptSettings} from '../../ai/prompt/prompt-schema';
import {validateAppendValue} from '../../import-export/services/chapter-append-schema';
import {validateChapterState} from './chapter-state-schema';
import {parseAlbumNameKey} from '../../names-convert/services/album-name-schema';

export const SHARED_STATE_MAX_ROW_BYTES=900*1024;
export const SHARED_STATE_MAX_BYTES=64*1024*1024;
export const SHARED_STATE_MAX_ROWS=60000;
export const sharedKinds=['name','album-name','convert-name','common-name','book','ai-settings','reader','reader-options','progress','tts-cursor','albums','chapter','dictionary','chapter-append-packet','chapter-append','chapter-state'] as const;
export type SharedKind=typeof sharedKinds[number];
export interface SharedRecord {kind:SharedKind;bookId?:string;key:string;value:unknown}
function invalid():never{throw new Error('Dữ liệu đồng bộ không hợp lệ; bản trên máy được giữ.');}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>;}
function string(value:unknown,max:number,empty=false):string{if(typeof value!=='string'||value.length>max||!empty&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))invalid();return value;}
function number(value:unknown,min:number,max=Number.MAX_SAFE_INTEGER,integer=true):number{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||integer&&!Number.isSafeInteger(value))invalid();return value;}
function enumValue(value:unknown,values:readonly string[]):string{if(typeof value!=='string'||!values.includes(value))invalid();return value;}
function hash(value:unknown):string{const result=string(value,64);if(!/^[a-f0-9]{64}$/.test(result))invalid();return result;}
function nameValue(value:unknown):string{const result=string(value,4096);if(/[\r\n]/.test(result))invalid();return result;}
function album(value:unknown):string|undefined{if(value===undefined)return;const result=string(value,120);if(/[\r\n]/.test(result))invalid();return result;}
export function validateSharedRecord(value:unknown):SharedRecord{return validateRecord(value,false);}
/** Replica base descriptors carry no payload; this is not a publishable tombstone. */
export function validateSharedDescriptor(value:Pick<SharedRecord,'kind'|'bookId'|'key'>){const {kind,bookId,key}=validateRecord({...value,value:null},true);return {kind,...(bookId?{bookId}:{}),key};}
function validateRecord(value:unknown,descriptorOnly:boolean):SharedRecord{
 const input=object(value),kind=enumValue(input.kind,sharedKinds) as SharedKind;
 const bookId=input.bookId===undefined?undefined:string(input.bookId,200),key=string(input.key,kind==='album-name'?800:300,true);
 const bookKinds=['name','book','progress','tts-cursor','chapter','chapter-append-packet','chapter-append','chapter-state'];
 if(bookKinds.includes(kind)&&!bookId||!bookKinds.includes(kind)&&kind!=='ai-settings'&&bookId)invalid();
 if(!['name','album-name','convert-name','common-name','chapter','dictionary','chapter-append-packet','chapter-append'].includes(kind)&&key!=='')invalid();
 if(kind==='album-name')parseAlbumNameKey(key);
 if(['name','convert-name','common-name'].includes(kind)&&(!key.trim()||key.length>256||/[\r\n=]/.test(key)))invalid();
 if(kind==='chapter'&&!key.trim())invalid();
 if(kind==='dictionary')enumValue(key,['vp','names','names2','hanviet','rules','chapter','number','pronouns','blacklist','english']);
 const record:SharedRecord={kind,...(bookId?{bookId}:{}),key,value:null};
 if(kind==='convert-name'&&key!==key.trim())invalid();
 if(input.value===null){if(!descriptorOnly&&(kind==='chapter-append'||kind==='chapter-append-packet'||kind==='chapter-state'))invalid();return record;}
 if(kind==='convert-name'&&(typeof input.value!=='string'||input.value.length>2048||input.value!==input.value.trim()))invalid();
 if(kind==='chapter-state')record.value=validateChapterState(input.value);
 else if(kind==='chapter-append'||kind==='chapter-append-packet')record.value=validateAppendValue(kind,bookId!,key,input.value);
 else if(['name','album-name','convert-name','common-name'].includes(kind))record.value=nameValue(input.value);
 else if(kind==='book'){const v=object(input.value);record.value={title:string(v.title,BOOK_METADATA_MAX_CHARS),author:string(v.author,BOOK_METADATA_MAX_CHARS,true),...(v.displayTitle===undefined?{}:{displayTitle:string(v.displayTitle,BOOK_METADATA_MAX_CHARS)}),...(v.cover===undefined?{}:{cover:validateSharedImage(v.cover)}),...(v.album===undefined?{}:{album:album(v.album)})};}
 else if(kind==='ai-settings'){
  const v=object(input.value),settings=validatePromptSettings(v);
  record.value={...settings,...(v.chosenProfileId===undefined?{}:{chosenProfileId:string(v.chosenProfileId,300),chosenProfileSettings:validatePromptSettings(v.chosenProfileSettings)})};
 }else if(kind==='reader'){
  const v=object(input.value);record.value={...(v.libraryBackground===undefined?{}:{libraryBackground:v.libraryBackground===null?null:validateSharedImage(v.libraryBackground)}),theme:enumValue(v.theme,['light','sepia','dark','gray']),font:enumValue(v.font,['serif','sans','arial','tahoma','times','palatino']),fontSize:number(v.fontSize,8,100),lineHeight:number(v.lineHeight,0.5,5,false),width:number(v.width,200,3000),voiceId:enumValue(v.voiceId,ttsVoiceIds),ttsRate:number(v.ttsRate,0.5,5,false),ttsPitch:number(v.ttsPitch,0.5,2,false),ttsFlex:number(v.ttsFlex,0,1,false),highlightColor:string(v.highlightColor,100),background:string(v.background??'',100,true),textColor:string(v.textColor??'',100,true),align:enumValue(v.align??'left',['left','center','right','justify']),textShadow:v.textShadow===true};
 }else if(kind==='reader-options'){
  const v=object(input.value);if(typeof v.preloadAi!=='boolean'||typeof v.autoNext!=='boolean')invalid();record.value={preloadAi:v.preloadAi,autoNext:v.autoNext};
 }else if(kind==='progress'){
  const v=object(input.value);if(v.reading!==undefined&&v.reading!==true||v.mode!==undefined&&(v.mode!=='ai'||v.offset!==0||(!v.reading&&v.paragraph!==0)))invalid();record.value={bookId,chapterId:string(v.chapterId,200),paragraph:number(v.paragraph,0,v.mode==='ai'?512000:Number.MAX_SAFE_INTEGER),offset:number(v.offset,0),revision:number(v.revision,1),updatedAt:number(v.updatedAt,0),...(v.mode==='ai'?{mode:'ai'}:{}),...(v.reading===true?{reading:true}:{})};
 }else if(kind==='tts-cursor'){
  const v=object(input.value);if(v.version!==1)invalid();record.value={version:1,bookId,chapterId:string(v.chapterId,200),mode:enumValue(v.mode,['raw','convert','ai']),revision:number(v.revision,1),sourceHash:hash(v.sourceHash),semanticHash:hash(v.semanticHash),renderedHash:hash(v.renderedHash),voiceId:enumValue(v.voiceId,ttsVoiceIds),rate:number(v.rate,0.5,5,false),offset:number(v.offset,0),audioTime:number(v.audioTime,0,86400,false),...(v.grouping===undefined?{}:{grouping:enumValue(v.grouping,['natural','sentence'])}),updatedAt:number(v.updatedAt,0)};
 }else if(kind==='albums'){
  const v=object(input.value);if(v.version!==1||!Array.isArray(v.albums)||v.albums.length>1000)invalid();const albums=v.albums.map(a=>{const row=object(a);return {id:string(row.id,200),name:album(string(row.name,120))!,updatedAt:number(row.updatedAt,0)};});if(new Set(albums.map(a=>a.id)).size!==albums.length||new Set(albums.map(a=>a.name)).size!==albums.length)invalid();record.value={version:1,albums};
 }else if(kind==='chapter'){
  const v=object(input.value);if(!key.trim()||!Array.isArray(v.chapters)||!v.chapters.length||v.chapters.length>128)invalid();
  const chapters=v.chapters.map(c=>{const row=object(c),epub=row.epub===undefined?undefined:validateEpubLayout(row.epub);if(epub&&row.text!==epub.nodes.join('\n'))invalid();return {id:string(row.id,200),bookId,order:number(row.order,0,Number.MAX_SAFE_INTEGER,false),title:string(row.title,1000,true),text:string(row.text,128000,true),revision:number(row.revision,1),sourceId:'',...(row.displayTitle===undefined?{}:{displayTitle:string(row.displayTitle,1000)}),...(epub?{epub}:{})};});
  const sourceRevision=number(v.sourceRevision,1);
  if(chapters[0].id!==key||chapters[0].revision<=sourceRevision||new Set(chapters.map(c=>c.id)).size!==chapters.length||chapters.reduce((s,c)=>s+c.text.length,0)>524288)invalid();record.value={baseSha256:hash(v.baseSha256),sourceHash:hash(v.sourceHash),sourceRevision,...(v.editRevision===undefined?{}:{editRevision:number(v.editRevision,1)}),...(v.legacy===true?{legacy:true}:{}),chapters};
 }else if(kind==='dictionary'){
  enumValue(key,['vp','names','names2','hanviet','rules','chapter','number','pronouns','blacklist','english']);const v=object(input.value);
  const bytes=number(v.bytes,1,80*1024*1024),parts=number(v.parts,1,80);if(parts!==Math.ceil(bytes/1048576))invalid();record.value={name:string(v.name,300),sha256:hash(v.sha256),bytes,parts};
 }
 if(new TextEncoder().encode(JSON.stringify(record)).length>SHARED_STATE_MAX_ROW_BYTES)invalid();return record;
}
export async function sharedRecordId(record:Pick<SharedRecord,'kind'|'bookId'|'key'>):Promise<string>{
 const bytes=new TextEncoder().encode(JSON.stringify([record.kind,record.bookId??'',record.key]));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
}
