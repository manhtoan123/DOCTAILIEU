import {db} from '../../../core/db';
import {queueAiSettings} from '../../ai/services/ai-reading';
export type TtsMode='raw'|'convert'|'ai';
export interface TtsCursor {version:1;bookId:string;chapterId:string;revision:number;mode:TtsMode;sourceHash:string;semanticHash:string;renderedHash:string;voiceId:string;rate:number;offset:number;audioTime:number;grouping?:'natural'|'sentence';updatedAt:number}
export const ttsCursorKey=(bookId:string)=>`tts-cursor:v1:${bookId}`;
export async function ttsHash(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');}
export function readTtsCursor(bookId:string):TtsCursor|undefined{
  try{const raw=localStorage.getItem(ttsCursorKey(bookId));if(!raw)return;if(raw.length>4096){mirrorTtsCursor(bookId,null);return;}const c=JSON.parse(raw) as TtsCursor;
    if(c.version!==1||c.grouping!==undefined&&!['natural','sentence'].includes(c.grouping)||c.bookId!==bookId||typeof c.chapterId!=='string'||c.chapterId.length>200||!['raw','convert','ai'].includes(c.mode)||!Number.isSafeInteger(c.revision)||c.revision<0||![c.sourceHash,c.semanticHash,c.renderedHash].every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s))||!['tiktok-female-1','tiktok-male-1'].includes(c.voiceId)||!Number.isFinite(c.rate)||c.rate<0.5||c.rate>5||!Number.isSafeInteger(c.offset)||c.offset<0||!Number.isFinite(c.audioTime)||c.audioTime<0||c.audioTime>86400||!Number.isFinite(c.updatedAt)){mirrorTtsCursor(bookId,null);return;}
    return c;
  }catch{mirrorTtsCursor(bookId,null);return;}
}
/** Synchronous, metadata-only checkpoint survives pagehide. Storage denial is nonfatal. */
export function mirrorTtsCursor(bookId:string,cursor:TtsCursor|null){try{if(cursor)localStorage.setItem(ttsCursorKey(bookId),JSON.stringify(cursor));else localStorage.removeItem(ttsCursorKey(bookId));}catch{} }
export function writeTtsCursor(cursor:TtsCursor){mirrorTtsCursor(cursor.bookId,cursor);void queueAiSettings('tts-cursor-shared:'+cursor.bookId,()=>db.transaction('rw',[db.books,db.settings],async()=>{if((await db.books.get(cursor.bookId))?.hiddenChapterIds?.includes(cursor.chapterId)){if(readTtsCursor(cursor.bookId)?.chapterId===cursor.chapterId)mirrorTtsCursor(cursor.bookId,null);return;}await db.settings.put({key:'tts-cursor-shared:'+cursor.bookId,value:cursor});})).catch(()=>{});}
export function clearTtsCursor(bookId:string){mirrorTtsCursor(bookId,null);void queueAiSettings('tts-cursor-shared:'+bookId,()=>db.settings.put({key:'tts-cursor-shared:'+bookId,value:null})).catch(()=>{});}
export function matchingTtsCursor(c:TtsCursor|undefined,identity:Pick<TtsCursor,'bookId'|'chapterId'|'revision'|'mode'|'sourceHash'|'semanticHash'|'renderedHash'>){return !!c&&(['bookId','chapterId','revision','mode','sourceHash','semanticHash','renderedHash'] as const).every(key=>c[key]===identity[key]);}
