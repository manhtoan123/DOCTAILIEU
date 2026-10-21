import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {removeBookWithLocalData} from '../src/features/library/services/book-removal';
import {readAiReadingCache,writeAiReadingCache,AI_READING_CACHE_PREFIX} from '../src/features/ai/services/ai-reading-cache';
import {AI_DEFAULTS,type AiReadingSource} from '../src/features/ai/services/ai-reading';
import {writeTtsCursor,readTtsCursor,type TtsCursor} from '../src/features/tts/services/tts-cursor';
const source:AiReadingSource={bookId:'removal',id:'removal-1',revision:1,text:'林儿来了。'};
const result={result:'Lâm Nhi đã đến.',model:AI_DEFAULTS.model,finishReason:'STOP' as const,inputTokens:2,outputTokens:3};
const cursor:TtsCursor={version:1,bookId:'removal',chapterId:'removal-1',revision:1,mode:'convert',sourceHash:'a'.repeat(64),semanticHash:'b'.repeat(64),renderedHash:'c'.repeat(64),voiceId:'tiktok-female-1',rate:1,offset:10,audioTime:1,updatedAt:1};
function storage(){const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k),setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});return data;}
beforeEach(async()=>{await db.delete();await db.open();});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

it('removing a library book drops its chapters, its AI cache rows and its TTS cursor only',async()=>{
  storage();
  await db.books.put({id:'removal',title:'Truyện xóa',author:'',status:'ready',chapterCount:1,charCount:10,createdAt:1,updatedAt:1});
  await db.books.put({id:'keep',title:'Truyện giữ',author:'',status:'ready',chapterCount:1,charCount:10,createdAt:1,updatedAt:1});
  await db.chapters.put({id:'removal-1',bookId:'removal',order:0,title:'Chương',text:source.text,revision:1,sourceId:''});
  await db.chapters.put({id:'keep-1',bookId:'keep',order:0,title:'Chương',text:'林儿来了。',revision:1,sourceId:''});
  await db.settings.put({key:'reader',value:{theme:'light'}});
  expect(await writeAiReadingCache(source,AI_DEFAULTS,[],result)).toBe(true);
  expect(await writeAiReadingCache({...source,bookId:'keep',id:'keep-1'},AI_DEFAULTS,[],result)).toBe(true);
  writeTtsCursor(cursor);writeTtsCursor({...cursor,bookId:'keep',chapterId:'keep-1'});
  const before=await db.settings.where('key').startsWith(AI_READING_CACHE_PREFIX).count();
  expect(before).toBe(2);

  await removeBookWithLocalData('removal');

  expect(await db.books.get('removal')).toBeUndefined();
  expect(await db.chapters.get('removal-1')).toBeUndefined();
  expect(await db.books.get('keep')).toBeTruthy();
  expect(await db.chapters.get('keep-1')).toBeTruthy();
  expect(await db.settings.where('key').startsWith(AI_READING_CACHE_PREFIX).count()).toBe(1);
  expect(await readAiReadingCache({...source,bookId:'keep',id:'keep-1'},AI_DEFAULTS,[])).toEqual(result);
  expect(readTtsCursor('removal')).toBeUndefined();
  expect(readTtsCursor('keep')).toMatchObject({chapterId:'keep-1'});
  expect(await db.settings.get('reader')).toBeTruthy();
});
