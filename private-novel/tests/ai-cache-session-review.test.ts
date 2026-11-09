import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,AiReadingSession,aiReadingKey,type AiReadingCache,type AiReadingSource} from '../src/features/ai/services/ai-reading';
import {readAiReadingCache,writeAiReadingCache} from '../src/features/ai/services/ai-reading-cache';
import type {AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
const source:AiReadingSource={bookId:'session-review',id:'session-chapter',revision:1,text:'林儿来了。'};
const names=[{key:'林儿',value:'Lâm Nhi'}];
const result:AiTranslateClientResponse={result:'Lâm Nhi đã đến.',model:AI_DEFAULTS.model,finishReason:'STOP',inputTokens:2,outputTokens:3};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
const port=():AiReadingCache=>({read:vi.fn(async()=>undefined),write:vi.fn(async()=>true)});
beforeEach(async()=>{await db.delete();await db.open();});
afterEach(()=>vi.restoreAllMocks());

it('session review: persistent hit deduplicates and performs no network or second write',async()=>{
  const read=deferred<AiTranslateClientResponse|undefined>(),cache=port();cache.read=vi.fn(()=>read.promise);
  const translate=vi.fn(async()=>result),session=new AiReadingSession(translate,cache);
  const first=session.request(source,AI_DEFAULTS,names),second=session.request(source,AI_DEFAULTS,names);
  expect(first).toBe(second);read.resolve(result);expect(await first).toEqual(result);
  expect(cache.read).toHaveBeenCalledTimes(1);expect(cache.write).not.toHaveBeenCalled();expect(translate).not.toHaveBeenCalled();
});

it.each(['read','write'] as const)('session review: rejected optional %s preserves one successful translation',async failure=>{
  const cache=port();cache[failure]=vi.fn(async()=>{throw new Error('Synthetic storage unavailable');});
  const translate=vi.fn(async()=>result),session=new AiReadingSession(translate,cache);
  expect(await session.request(source,AI_DEFAULTS,names)).toEqual(result);expect(translate).toHaveBeenCalledTimes(1);
  expect(session.get(aiReadingKey(source,AI_DEFAULTS,names))).toEqual(result);
});

it('session review: cancellation while reading never sends a network request or updates RAM',async()=>{
  const read=deferred<AiTranslateClientResponse|undefined>(),cache=port();cache.read=vi.fn(()=>read.promise);
  const translate=vi.fn(async()=>result),session=new AiReadingSession(translate,cache);
  const pending=session.request(source,AI_DEFAULTS,names);session.clear();read.resolve(undefined);
  await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(translate).not.toHaveBeenCalled();
  expect(session.get(aiReadingKey(source,AI_DEFAULTS,names))).toBeUndefined();
});

it('session review: cancellation during write discards old result and preserves a replacement same-key job',async()=>{
  const write=deferred<boolean>(),entered=deferred<boolean>(),cache=port();
  cache.write=vi.fn(async()=>{entered.resolve(true);return write.promise;});
  const translate=vi.fn(async()=>result),session=new AiReadingSession(translate,cache);
  const old=session.request(source,AI_DEFAULTS,names);await entered.promise;session.clear();
  const replacement=session.request(source,AI_DEFAULTS,names);write.resolve(true);
  await expect(old).rejects.toMatchObject({name:'AbortError'});expect(await replacement).toEqual(result);
  expect(session.get(aiReadingKey(source,AI_DEFAULTS,names))).toEqual(result);expect(translate).toHaveBeenCalledTimes(2);
});

it('session review: snapshots source, settings and individual Names before asynchronous lookup',async()=>{
  const read=deferred<AiTranslateClientResponse|undefined>(),cache=port();cache.read=vi.fn(()=>read.promise);
  const translate=vi.fn(async()=>result),session=new AiReadingSession(translate,cache);
  const input={...source},settings={...AI_DEFAULTS},mutableNames=names.map(n=>({...n}));
  const pending=session.request(input,settings,mutableNames);
  input.text='changed';settings.model='gemini-3.8-flash';mutableNames[0].value='changed';read.resolve(undefined);await pending;
  expect(translate).toHaveBeenCalledWith({text:source.text,...AI_DEFAULTS,names:{林儿:'Lâm Nhi'}},expect.any(AbortSignal),expect.any(Function),expect.any(Function),false,undefined,expect.objectContaining({schemaVersion:2,trace:expect.objectContaining({partPath:'0',purpose:'foreground'})}));
  expect(cache.write).toHaveBeenCalledWith(source,AI_DEFAULTS,names,{...result,division:{version:1,parts:1,reasons:[]}},expect.any(AbortSignal));
});

it('session review: real database survives close/new session and changed matched Name misses',async()=>{
  await db.books.put({id:source.bookId,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',charCount:source.text.length,chapterCount:1});
  await db.chapters.put({...source,order:0,title:'Synthetic',sourceId:'synthetic'});
  const cache={read:readAiReadingCache,write:writeAiReadingCache};
  const translate=vi.fn(async()=>result);
  await new AiReadingSession(translate,cache).request(source,AI_DEFAULTS,names);db.close();
  await new AiReadingSession(translate,cache).request(source,AI_DEFAULTS,names);expect(translate).toHaveBeenCalledTimes(1);
  await new AiReadingSession(translate,cache).request(source,AI_DEFAULTS,[{key:'林儿',value:'Different'}]);expect(translate).toHaveBeenCalledTimes(2);
  expect((await db.chapters.get(source.id))?.text).toBe(source.text);expect(await db.progress.count()).toBe(0);
});

it('session review: a synchronous optional write exception still allows successful translation',async()=>{
  const cache=port();cache.write=()=>{throw new Error('Synthetic synchronous failure');};
  expect(await new AiReadingSession(vi.fn(async()=>result),cache).request(source,AI_DEFAULTS,names)).toEqual(result);
});

it('session review: wrong network response model never pollutes RAM outside permitted chain',async()=>{
  const session=new AiReadingSession(vi.fn(async()=>({...result,model:'gemini-3.8-flash'})),port());
  await expect(session.request(source,{...AI_DEFAULTS,fallbackModels:[]},names)).rejects.toThrow();
  expect(session.get(aiReadingKey(source,{...AI_DEFAULTS,fallbackModels:[]},names))).toBeUndefined();
});
