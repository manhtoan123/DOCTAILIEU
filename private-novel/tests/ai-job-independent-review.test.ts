import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {AI_READING_CACHE_PREFIX,readAiReadingCache,writeAiReadingCache} from '../src/features/ai/services/ai-reading-cache';
import {EPUB_AI_CHAPTER_LIMITS} from '../src/features/ai/services/ai-job';
import type {AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
const source={bookId:'review-budget-book',id:'review-budget-chapter',revision:1,text:'甲乙'},settings={...AI_DEFAULTS,fallbackModels:[]};
const result:AiTranslateClientResponse={model:settings.model,result:'Complete',finishReason:'STOP',inputTokens:1,outputTokens:1};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
beforeEach(async()=>{await db.delete();await db.open();await db.books.add({id:source.bookId,title:'Keep original',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:2});await db.chapters.add({...source,order:0,title:'One',sourceId:'keep-source'});await db.settings.put({key:'unrelated',value:'keep'});});
afterEach(()=>{vi.restoreAllMocks();});
async function intact(){expect((await db.chapters.get(source.id))?.text).toBe(source.text);expect((await db.books.get(source.bookId))?.title).toBe('Keep original');expect((await db.settings.get('unrelated'))?.value).toBe('keep');}
it('reviewer: valid 257-node whole-group EPUB exhausts an injected shared actual-send budget with a visible permanent error',async()=>{
 const nodes=Array.from({length:257},()=> '甲'.repeat(497)),large={...source,text:nodes.join('\n')};expect(large.text.length).toBeLessThanOrEqual(128000);let active=0,maxActive=0;
 const translate=vi.fn(async input=>{active++;maxActive=Math.max(maxActive,active);const row=JSON.parse(input.text);await Promise.resolve();active--;return {...result,result:JSON.stringify(Object.fromEntries(Object.keys(row).map(key=>[key,'Full '+key])))};});
 const limit=EPUB_AI_CHAPTER_LIMITS.sends;EPUB_AI_CHAPTER_LIMITS.sends=2;const cache={read:async()=>undefined,write:vi.fn(async()=>true)},session=new EpubAiSession(cache,translate);let error:unknown;try{error=await session.request(large,settings,[],{path:'chapter.xhtml',body:'<body>'+nodes.map(node=>'<p>'+node+'</p>').join('')+'</body>',styles:[],nodes}).catch(e=>e);}finally{EPUB_AI_CHAPTER_LIMITS.sends=limit;}
 expect(error).toMatchObject({code:'ai_recovery_exhausted',reason:'send_limit'});expect((error as {name:string}).name).not.toBe('AbortError');expect((error as {retryAfterMs?:number}).retryAfterMs).toBeUndefined();expect(translate).toHaveBeenCalledTimes(2);expect(maxActive).toBe(1);expect(cache.write).not.toHaveBeenCalled();expect(session.get(aiReadingKey(large,settings,[]))).toBeUndefined();await intact();
});
it('reviewer: native cache late hash observes its child abort and cannot write after publishing a complete memory result',async()=>{
 const gate=deferred<void>(),entered=deferred<void>(),digest=crypto.subtle.digest.bind(crypto.subtle);vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{entered.resolve();await gate.promise;return digest(...args);});
 let cacheSignal:AbortSignal|undefined,write!:Promise<boolean>;const session=new AiReadingSession(async()=>result,{read:async()=>undefined,write:(s,p,n,r,signal)=>{cacheSignal=signal;return write=writeAiReadingCache(s,p,n,r,signal);}});
 const pending=session.request(source,settings,[]);await entered.promise;expect(await pending).toEqual(result);expect(cacheSignal?.aborted).toBe(true);expect(session.get(aiReadingKey(source,settings,[]))).toEqual(result);gate.resolve();expect(await write).toBe(false);expect(await db.settings.where('key').startsWith(AI_READING_CACHE_PREFIX).count()).toBe(0);await intact();
},10000);
it('reviewer: external cancellation during native cache hash settles immediately and cannot overwrite a fresh same-key request',async()=>{
 const gate=deferred<void>(),entered=deferred<void>(),digest=crypto.subtle.digest.bind(crypto.subtle);vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{entered.resolve();await gate.promise;return digest(...args);});
 let oldWrite!:Promise<boolean>,oldSignal:AbortSignal|undefined,writes=0;const fresh={...result,result:'Fresh complete'},translate=vi.fn().mockResolvedValueOnce(result).mockResolvedValue(fresh),session=new AiReadingSession(translate,{read:async()=>undefined,write:(s,p,n,r,signal)=>{const pending=writeAiReadingCache(s,p,n,r,signal);if(++writes===1){oldSignal=signal;oldWrite=pending;}return pending;}});
 const first=session.request(source,settings,[]),rejected=expect(first).rejects.toMatchObject({name:'AbortError'});await entered.promise;session.clear();await rejected;expect(oldSignal?.aborted).toBe(true);expect(await session.request(source,settings,[])).toEqual(fresh);gate.resolve();expect(await oldWrite).toBe(false);expect(session.get(aiReadingKey(source,settings,[]))).toEqual(fresh);expect(await readAiReadingCache(source,settings,[])).toEqual({...fresh,division:{version:1,parts:1,reasons:[]}});await intact();
},10000);
it('reviewer: optional cache timeout aborts an actual queued native write transaction behind another settings writer',async()=>{
 const release=deferred<void>(),locked=deferred<void>();let lock!:Promise<void>,cacheSignal:AbortSignal|undefined,write!:Promise<boolean>;
 const session=new AiReadingSession(async()=>{lock=db.transaction('rw',db.settings,async()=>{locked.resolve();await Dexie.waitFor(release.promise);});await locked.promise;return result;},{read:readAiReadingCache,write:(s,p,n,r,signal)=>{cacheSignal=signal;return write=writeAiReadingCache(s,p,n,r,signal);}});
 try{expect(await session.request(source,settings,[])).toEqual(result);expect(cacheSignal?.aborted).toBe(true);expect(await write).toBe(false);expect(session.get(aiReadingKey(source,settings,[]))).toEqual(result);}finally{release.resolve();await lock;}
 expect(await db.settings.where('key').startsWith(AI_READING_CACHE_PREFIX).count()).toBe(0);await intact();
},10000);
