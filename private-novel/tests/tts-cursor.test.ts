import {afterEach,it,expect,vi} from 'vitest';
import {readTtsCursor,writeTtsCursor,clearTtsCursor,ttsHash,matchingTtsCursor,type TtsCursor} from '../src/features/tts/services/tts-cursor';
afterEach(()=>vi.unstubAllGlobals());
const cursor:TtsCursor={version:1,bookId:'b',chapterId:'c',revision:1,mode:'ai',sourceHash:'a'.repeat(64),semanticHash:'b'.repeat(64),renderedHash:'c'.repeat(64),voiceId:'tiktok-female-1',rate:1,offset:42,audioTime:2,updatedAt:1};
function storage(){const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k),setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});return data;}
it('round trips metadata only and clears explicit stop without touching other storage',()=>{const rows=storage();localStorage.setItem('canonical','unchanged');writeTtsCursor(cursor);expect(readTtsCursor('b')).toEqual(cursor);clearTtsCursor('b');expect(readTtsCursor('b')).toBeUndefined();expect(rows.get('canonical')).toBe('unchanged');});
it.each(['bookId','chapterId','revision','mode','sourceHash','semanticHash','renderedHash'] as const)('rejects changed identity %s',key=>{expect(matchingTtsCursor(cursor,{...cursor,[key]:key==='revision'?2:'changed'})).toBe(false);});
it.each([{version:2},{offset:-1},{audioTime:Infinity},{voiceId:'unknown'},{rate:6},{sourceHash:'invalid'}])('rejects corrupted cursor %j',change=>{const rows=storage();localStorage.setItem('tts-cursor:v1:b',JSON.stringify({...cursor,...change}));expect(readTtsCursor('b')).toBeUndefined();expect(rows.has('tts-cursor:v1:b')).toBe(false);});
it.each(['{not json','x'.repeat(4097)])('drops an unreadable stored cursor %s',raw=>{const rows=storage();rows.set('tts-cursor:v1:b',raw);expect(readTtsCursor('b')).toBeUndefined();expect(rows.has('tts-cursor:v1:b')).toBe(false);});
it('fails safely when storage is denied',()=>{vi.stubGlobal('localStorage',{getItem:()=>{throw Error();},setItem:()=>{throw Error();},removeItem:()=>{throw Error();}});expect(readTtsCursor('b')).toBeUndefined();expect(()=>writeTtsCursor(cursor)).not.toThrow();expect(()=>clearTtsCursor('b')).not.toThrow();});
it('hashes exact text including Unicode/whitespace rather than lossy normalization',async()=>{expect(await ttsHash('A🙂')).not.toBe(await ttsHash('A🙂 '));expect(await ttsHash('A🙂')).toMatch(/^[a-f0-9]{64}$/);});

it.each(['natural','sentence'] as const)('retains optional %s chunking metadata locally and in the shared validator',async grouping=>{
 const {validateSharedRecord}=await import('../src/features/sync-cloud/services/shared-state-schema');storage();const saved={...cursor,grouping};writeTtsCursor(saved);expect(readTtsCursor('b')).toEqual(saved);
 expect(validateSharedRecord({kind:'tts-cursor',bookId:'b',key:'',value:saved}).value).toEqual(saved);
});
