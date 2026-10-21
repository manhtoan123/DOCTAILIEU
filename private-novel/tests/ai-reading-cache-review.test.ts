import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db,deleteBook} from '../src/core/db';
import {AI_DEFAULTS,aiReadingKey,type AiReadingSource} from '../src/features/ai/services/ai-reading';
import {AI_READING_CACHE_PREFIX,readAiReadingCache,writeAiReadingCache,clearBookAiReadingCache} from '../src/features/ai/services/ai-reading-cache';

const source:AiReadingSource={bookId:'review-book',id:'review-chapter',revision:1,text:'甲'.repeat(32000)+'尾'};
const translated={result:'Synthetic translation',model:AI_DEFAULTS.model,finishReason:'STOP',inputTokens:1,outputTokens:2};
const rows=()=>db.settings.where('key').startsWith(AI_READING_CACHE_PREFIX).toArray();
beforeEach(async()=>{
  await db.delete();await db.open();
  await db.books.put({id:source.bookId,title:'Review synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',charCount:source.text.length,chapterCount:1});
  await db.chapters.put({...source,order:0,title:'Review',sourceId:'synthetic'});
});
afterEach(()=>vi.restoreAllMocks());

it('review: rejects a response model outside the permitted chain before publication',async()=>{
  expect(await writeAiReadingCache(source,{...AI_DEFAULTS,fallbackModels:[]},[],{...translated,model:'gemini-3.8-flash'})).toBe(false);
  expect(await rows()).toHaveLength(0);
});

it('review: rejects an otherwise valid cached row whose response model is outside its permitted chain',async()=>{
  await writeAiReadingCache(source,{...AI_DEFAULTS,fallbackModels:[]},[],translated);
  const row=(await rows())[0];
  await db.settings.put({...row,value:{...row.value as object,response:{...translated,model:'gemini-3.8-flash'}}});
  expect(await readAiReadingCache(source,{...AI_DEFAULTS,fallbackModels:[]},[])).toBeUndefined();
});

it('review: hashes the exact full request, including source beyond the request cap',async()=>{
  expect(await writeAiReadingCache(source,AI_DEFAULTS,[],translated)).toBe(true);
  const expected=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(aiReadingKey(source,AI_DEFAULTS,[])))),b=>b.toString(16).padStart(2,'0')).join('');
  expect((await rows())[0].key).toBe(AI_READING_CACHE_PREFIX+expected);
  const changed={...source,text:source.text.slice(0,-1)+'別'};
  await db.chapters.update(source.id,{text:changed.text});
  expect(await readAiReadingCache(changed,AI_DEFAULTS,[])).toBeUndefined();
});

it('review: 110 concurrent writes serialize capacity checks to at most 100 rows',async()=>{
  const saved=await Promise.all(Array.from({length:110},(_,i)=>writeAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:`review ${i}`},[],translated)));
  expect(saved.every(Boolean)).toBe(true);expect(await rows()).toHaveLength(100);
});

it('review: mutable caller objects cannot switch the published identity while hashing',async()=>{
  const digest=crypto.subtle.digest.bind(crypto.subtle);let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  vi.spyOn(crypto.subtle,'digest').mockImplementation(async(...args)=>{await gate;return digest(...args);});
  const mutable={...source},settings={...AI_DEFAULTS},result={...translated};
  const pending=writeAiReadingCache(mutable,settings,[],result);
  mutable.text='changed';settings.systemPrompt='changed';settings.model='gemini-3.8-flash';result.result='changed';release();
  expect(await pending).toBe(true);
  expect(await readAiReadingCache(source,AI_DEFAULTS,[])).toEqual(translated);
});

it('review: an unknown structured-clone circular row fails storage closed and survives clear',async()=>{
  const circular:{version:number;self?:unknown}={version:2};circular.self=circular;
  const key=AI_READING_CACHE_PREFIX+'unknown';await db.settings.put({key,value:circular});
  expect(await writeAiReadingCache(source,AI_DEFAULTS,[],translated)).toBe(false);
  await clearBookAiReadingCache(source.bookId);
  expect((await db.settings.get(key))?.value).toEqual(circular);
});

it('review: a closed database open failure is only a cache miss/publication failure',async()=>{
  db.close();vi.spyOn(db,'open').mockRejectedValue(new Error('Synthetic unavailable'));
  expect(await readAiReadingCache(source,AI_DEFAULTS,[])).toBeUndefined();
  expect(await writeAiReadingCache(source,AI_DEFAULTS,[],translated)).toBe(false);
});

it('review: delete followed by concurrent late publication never restores book or cache hit',async()=>{
  await writeAiReadingCache(source,AI_DEFAULTS,[],translated);
  await Promise.all([deleteBook(source.bookId),writeAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'late'},[],translated)]);
  expect(await db.books.get(source.bookId)).toBeUndefined();
  expect(await readAiReadingCache(source,AI_DEFAULTS,[])).toBeUndefined();
  expect(await readAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'late'},[])).toBeUndefined();
});
