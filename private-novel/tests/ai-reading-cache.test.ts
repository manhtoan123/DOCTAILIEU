import 'fake-indexeddb/auto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {db,deleteBook} from '../src/core/db';
import {AI_DEFAULTS,type AiReadingSource} from '../src/features/ai/services/ai-reading';
import {AI_READING_CACHE_PREFIX,AI_READING_CACHE_MAX_BYTES,readAiReadingCache,writeAiReadingCache,clearBookAiReadingCache} from '../src/features/ai/services/ai-reading-cache';

const source:AiReadingSource={bookId:'book',id:'chapter',revision:1,text:'林儿来到这里。'};
const result={result:'Lâm Nhi đến đây.',model:AI_DEFAULTS.model,finishReason:'STOP',inputTokens:10,outputTokens:20};
const names=[{key:'林儿',value:'Lâm Nhi'}];
async function seed(s=source){
  await db.books.put({id:s.bookId,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',charCount:s.text.length,chapterCount:1});
  await db.chapters.put({...s,order:0,title:'Chapter',sourceId:'original'});
}
const cachedRows=()=>db.settings.where('key').startsWith(AI_READING_CACHE_PREFIX).toArray();
beforeEach(async()=>{await db.delete();await db.open();await seed();});
afterEach(()=>vi.restoreAllMocks());
describe('persistent AI completed cache',()=>{
  it('reopens exact completed response and preserves RAW, progress and unrelated settings',async()=>{
    await db.progress.put({bookId:'book',chapterId:'chapter',revision:1,paragraph:4,offset:3,updatedAt:8});await db.settings.put({key:'reader',value:{fontSize:19}});
    const chapters=await db.chapters.toArray(),books=await db.books.toArray(),progress=await db.progress.toArray();
    expect(await writeAiReadingCache(source,AI_DEFAULTS,names,result)).toBe(true);db.close();await db.open();
    expect(await readAiReadingCache(source,AI_DEFAULTS,names)).toEqual(result);
    expect(await db.chapters.toArray()).toEqual(chapters);expect(await db.books.toArray()).toEqual(books);expect(await db.progress.toArray()).toEqual(progress);expect((await db.settings.get('reader'))?.value).toEqual({fontSize:19});
    const row=(await cachedRows())[0];expect(row.key).toMatch(/^ai-reading-cache:v1:[a-f0-9]{64}$/);expect(JSON.stringify(row)).not.toContain(source.text);
  });
  it('keys exact source/model/both prompts/temperature/matched Names and ignores unmatched Names',async()=>{
    await writeAiReadingCache(source,AI_DEFAULTS,names,result);
    for(const settings of [{...AI_DEFAULTS,model:'gemini-3.8-flash'},{...AI_DEFAULTS,systemPrompt:'another'},{...AI_DEFAULTS,userPromptTemplate:'{{text}} other'},{...AI_DEFAULTS,temperature:0.5}])expect(await readAiReadingCache(source,settings,names)).toBeUndefined();
    expect(await readAiReadingCache(source,AI_DEFAULTS,[{key:'林儿',value:'New'}])).toBeUndefined();
    expect(await readAiReadingCache(source,AI_DEFAULTS,[...names,{key:'不存在',value:'Absent'}])).toEqual(result);
    for(const changed of [{...source,id:'other'},{...source,bookId:'other'},{...source,revision:2},{...source,text:source.text+' '}] )expect(await readAiReadingCache(changed,AI_DEFAULTS,names)).toBeUndefined();
  });
  it.each(['staging','deleted','chapter-deleted','revision','text','foreign-book'])('source guard rejects hit and publication after %s',async mode=>{
    await writeAiReadingCache(source,AI_DEFAULTS,names,result);
    if(mode==='staging')await db.books.update('book',{status:'staging'});
    if(mode==='deleted')await deleteBook('book');
    if(mode==='chapter-deleted')await db.chapters.delete('chapter');
    if(mode==='revision')await db.chapters.update('chapter',{revision:2});
    if(mode==='text')await db.chapters.update('chapter',{text:'changed'});
    if(mode==='foreign-book')await db.chapters.update('chapter',{bookId:'foreign'});
    const before=await cachedRows();expect(await readAiReadingCache(source,AI_DEFAULTS,names)).toBeUndefined();expect(await writeAiReadingCache(source,AI_DEFAULTS,names,result)).toBe(false);expect(await cachedRows()).toEqual(before);
  });
  it.each([null,{}, {...result,finishReason:'MAX_TOKENS'},{...result,result:' '},{...result,inputTokens:-1},{...result,outputTokens:NaN},{...result,result:'你'.repeat(400000)}])('does not cache incomplete/malformed/oversize response',async value=>{
    expect(await writeAiReadingCache(source,AI_DEFAULTS,names,value as typeof result)).toBe(false);expect(await cachedRows()).toHaveLength(0);
  });
  it('skips corrupt and unknown format at exact key without resetting or replacing them',async()=>{
    await writeAiReadingCache(source,AI_DEFAULTS,names,result);const row=(await cachedRows())[0];
    for(const value of [null,{version:2}, {...row.value as object,response:{...result,finishReason:'MAX_TOKENS'}},{...row.value as object,accessedAt:-1}]){
      await db.settings.put({...row,value});expect(await readAiReadingCache(source,AI_DEFAULTS,names)).toBeUndefined();expect(await writeAiReadingCache(source,AI_DEFAULTS,names,result)).toBe(false);expect((await db.settings.get(row.key))?.value).toEqual(value);
    }
  });
  it('LRU limits 100 entries, refreshes hit, and retains unrelated and unknown settings',async()=>{
    await db.settings.put({key:'reader',value:'keep'});let now=100;vi.spyOn(Date,'now').mockImplementation(()=>now++);
    for(let i=0;i<100;i++)expect(await writeAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:`p${i}`},names,result)).toBe(true);
    expect(await readAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'p0'},names)).toEqual(result);
    await writeAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'p100'},names,result);expect(await cachedRows()).toHaveLength(100);
    expect(await readAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'p0'},names)).toEqual(result);expect(await readAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'p1'},names)).toBeUndefined();expect((await db.settings.get('reader'))?.value).toBe('keep');
  });
  it('bounds aggregate serialized bytes, with valid large responses evicted atomically',async()=>{
    let now=100;vi.spyOn(Date,'now').mockImplementation(()=>now++);const large={...result,result:'x'.repeat(950000)};
    await writeAiReadingCache(source,AI_DEFAULTS,names,large);const sample=(await cachedRows())[0];await db.settings.delete(sample.key);
    await db.settings.bulkPut(Array.from({length:35},(_,i)=>{const digest=i.toString(16).padStart(64,'0');return {key:AI_READING_CACHE_PREFIX+digest,value:{...sample.value as object,digest,accessedAt:i}};}));
    expect(await writeAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'large36'},names,large)).toBe(true);
    const rows=await cachedRows();expect(rows.length).toBe(35);expect(await db.settings.get(AI_READING_CACHE_PREFIX+'0'.repeat(64))).toBeUndefined();expect(rows.reduce((sum,row)=>sum+new TextEncoder().encode(JSON.stringify(row)).length,0)).toBeLessThanOrEqual(AI_READING_CACHE_MAX_BYTES);
    expect(await readAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'large0'},names)).toBeUndefined();expect(await readAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'large36'},names)).toEqual(large);
  });
  it('unknown records consume budget and remain unchanged instead of a bulk reset',async()=>{
    const unknown=Array.from({length:100},(_,i)=>({key:AI_READING_CACHE_PREFIX+`unknown${i}`,value:{version:2,preserve:i}}));await db.settings.bulkPut(unknown);
    expect(await writeAiReadingCache(source,AI_DEFAULTS,names,result)).toBe(false);expect(await cachedRows()).toHaveLength(100);await clearBookAiReadingCache('book');expect(await cachedRows()).toHaveLength(100);
  });
  it('optional storage failure and native abort roll back evictions and never change source',async()=>{
    for(let i=0;i<100;i++)await writeAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:`p${i}`},names,result);
    const before=await cachedRows(),chapters=await db.chapters.toArray(),put=IDBObjectStore.prototype.put;
    const spy=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof put>){if(this.name==='settings')throw new DOMException('Quota','QuotaExceededError');return put.apply(this,args);});
    expect(await writeAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'overflow'},names,result)).toBe(false);expect(await cachedRows()).toEqual(before);
    spy.mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof put>){if(this.name==='settings')this.transaction.abort();return put.apply(this,args);});
    expect(await writeAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'overflow'},names,result)).toBe(false);expect(await cachedRows()).toEqual(before);expect(await db.chapters.toArray()).toEqual(chapters);
  });
  it('abort before or during native write prevents late persistence/hit and rolls touch back',async()=>{
    const early=new AbortController();early.abort();expect(await writeAiReadingCache(source,AI_DEFAULTS,names,result,early.signal)).toBe(false);
    await writeAiReadingCache(source,AI_DEFAULTS,names,result);expect(await readAiReadingCache(source,AI_DEFAULTS,names,early.signal)).toBeUndefined();
    const before=await cachedRows(),controller=new AbortController(),put=IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof put>){const req=put.apply(this,args);if(this.name==='settings')controller.abort();return req;});
    expect(await readAiReadingCache(source,AI_DEFAULTS,names,controller.signal)).toBeUndefined();expect(await cachedRows()).toEqual(before);
  });
  it('checks live source after pending hash completes and cancellation prevents late publication',async()=>{
    const original=crypto.subtle.digest.bind(crypto.subtle);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    vi.spyOn(crypto.subtle,'digest').mockImplementation(async(...args)=>{await gate;return original(...args);});
    const pending=writeAiReadingCache(source,AI_DEFAULTS,names,result);await deleteBook('book');release();expect(await pending).toBe(false);expect(await cachedRows()).toHaveLength(0);
  });
  it('abort after native put rolls publication back before optional failure settles',async()=>{
    const controller=new AbortController(),put=IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof put>){const req=put.apply(this,args);if(this.name==='settings')controller.abort();return req;});
    expect(await writeAiReadingCache(source,AI_DEFAULTS,names,result,controller.signal)).toBe(false);expect(await cachedRows()).toHaveLength(0);
  });
  it('abort while hashing prevents a late cache hit or write',async()=>{
    await writeAiReadingCache(source,AI_DEFAULTS,names,result);const before=await cachedRows();
    const original=crypto.subtle.digest.bind(crypto.subtle);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    vi.spyOn(crypto.subtle,'digest').mockImplementation(async(...args)=>{await gate;return original(...args);});
    const controller=new AbortController(),hit=readAiReadingCache(source,AI_DEFAULTS,names,controller.signal),write=writeAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'new'},names,result,controller.signal);
    controller.abort();release();expect(await hit).toBeUndefined();expect(await write).toBe(false);expect(await cachedRows()).toEqual(before);
  });
  it('serializes concurrent distinct publications, selective clear preserves other books',async()=>{
    const other={...source,bookId:'other',id:'other-chapter'};await seed(other);
    const writes=await Promise.all(Array.from({length:15},(_,i)=>writeAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:`parallel${i}`},names,result)));expect(writes.every(Boolean)).toBe(true);
    await writeAiReadingCache(other,AI_DEFAULTS,names,result);expect(await cachedRows()).toHaveLength(16);
    await clearBookAiReadingCache('book');expect(await cachedRows()).toHaveLength(1);expect(await readAiReadingCache(other,AI_DEFAULTS,names)).toEqual(result);
  });
});
