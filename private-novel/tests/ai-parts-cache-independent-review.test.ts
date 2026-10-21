import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,type AiReadingSource} from '../src/features/ai/services/ai-reading';
import {AI_PART_CACHE_PREFIX,clearBookAiReadingCache,readAiParts,readAiReadingCache,writeAiPart,writeAiReadingCache} from '../src/features/ai/services/ai-reading-cache';

const source:AiReadingSource={bookId:'synthetic-parts-book',id:'synthetic-parts-chapter',revision:1,text:'林儿你好。'.repeat(600)};
const names=[{key:'林儿',value:'Lâm Nhi'}],plan=JSON.stringify(['synthetic-plan-1',[[0,1800],[1800,source.text.length]]]);
const result={result:'Bản dịch tổng hợp.',model:AI_DEFAULTS.model,finishReason:'STOP',inputTokens:1,outputTokens:2};
const rows=()=>db.settings.where('key').startsWith('ai-reading-cache:').toArray();
beforeEach(async()=>{
 await db.delete();await db.open();
 await db.books.put({id:source.bookId,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',charCount:source.text.length,chapterCount:1});
 await db.chapters.put({...source,order:0,title:'Synthetic',sourceId:'synthetic'});
});
afterEach(()=>vi.restoreAllMocks());

it('independent parts cache: reload preserves complete part without exposing completed chapter or modifying source/progress',async()=>{
 const chapters=await db.chapters.toArray(),books=await db.books.toArray();
 await db.progress.put({bookId:source.bookId,chapterId:source.id,revision:1,paragraph:4,offset:3,updatedAt:8});const progress=await db.progress.toArray();
 expect(await writeAiPart(source,AI_DEFAULTS,names,plan,'1',result)).toBe(true);db.close();await db.open();
 expect(await readAiParts(source,AI_DEFAULTS,names,plan)).toEqual([{id:'1',response:result}]);
 expect(await readAiReadingCache(source,AI_DEFAULTS,names)).toBeUndefined();
 expect(await db.chapters.toArray()).toEqual(chapters);expect(await db.books.toArray()).toEqual(books);expect(await db.progress.toArray()).toEqual(progress);
 expect(JSON.stringify(await rows())).not.toContain(source.text);
});
it('independent parts cache: plan/settings/matched Names and full source invalidate parts',async()=>{
 await writeAiPart(source,AI_DEFAULTS,names,plan,'0',result);
 expect(await readAiParts(source,AI_DEFAULTS,names,plan+'changed')).toEqual([]);
 expect(await readAiParts(source,{...AI_DEFAULTS,temperature:0.5},names,plan)).toEqual([]);
 expect(await readAiParts(source,AI_DEFAULTS,[{key:'林儿',value:'Changed'}],plan)).toEqual([]);
 expect(await readAiParts(source,AI_DEFAULTS,[...names,{key:'未匹配',value:'Absent'}],plan)).toHaveLength(1);
 const changed={...source,text:source.text.slice(0,-1)+'尾'};await db.chapters.update(source.id,{text:changed.text});
 expect(await readAiParts(changed,AI_DEFAULTS,names,plan)).toEqual([]);expect(await readAiParts(source,AI_DEFAULTS,names,plan)).toEqual([]);
});
it.each(['revision','deletion','staging','foreign-book'])('independent parts cache: %s during hashing prevents late durable publication',async mode=>{
 const digest=crypto.subtle.digest.bind(crypto.subtle);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 vi.spyOn(crypto.subtle,'digest').mockImplementation(async(...args)=>{await gate;return digest(...args);});
 const pending=writeAiPart(source,AI_DEFAULTS,names,plan,'0',result);
 if(mode==='revision')await db.chapters.update(source.id,{revision:2});
 if(mode==='deletion')await db.books.delete(source.bookId);
 if(mode==='staging')await db.books.update(source.bookId,{status:'staging'});
 if(mode==='foreign-book')await db.chapters.update(source.id,{bookId:'foreign'});
 release();expect(await pending).toBe(false);expect(await rows()).toEqual([]);
});
it('independent parts cache: cancellation at native put success rolls back publication and eviction together',async()=>{
 await writeAiPart(source,AI_DEFAULTS,names,plan,'0',result);
 const sample=(await rows())[0];await db.settings.bulkPut(Array.from({length:100},(_,i)=>({key:sample.key.replace(/:0$/,':'+i),value:{...sample.value as object,partId:String(i),accessedAt:i}})));
 const before=await rows(),stop=new AbortController(),put=IDBObjectStore.prototype.put;
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args){
  const request=put.apply(this,args);if(this.name==='settings'&&String((args[0] as {key?:string}).key).startsWith(AI_PART_CACHE_PREFIX))request.addEventListener('success',()=>stop.abort(),{once:true});return request;
 });
 expect(await writeAiPart(source,AI_DEFAULTS,names,plan,'100',result,stop.signal)).toBe(false);expect(await rows()).toEqual(before);
});
it('independent parts cache: chapter and part concurrent writes share atomic 100-record cap; unknown formats survive clear',async()=>{
 const saved=await Promise.all(Array.from({length:105},(_,i)=>i%2?writeAiPart(source,AI_DEFAULTS,names,plan,String(i),result):writeAiReadingCache(source,{...AI_DEFAULTS,systemPrompt:'Synthetic '+i},names,result)));
 expect(saved.every(Boolean)).toBe(true);expect(await rows()).toHaveLength(100);
 const unknown={key:AI_PART_CACHE_PREFIX+'future',value:{version:'future',bookId:source.bookId}};await db.settings.put(unknown);
 await clearBookAiReadingCache(source.bookId);expect(await rows()).toEqual([unknown]);
});
it('independent parts cache: incomplete, forbidden-model and malformed rows cannot become usable parts',async()=>{
 expect(await writeAiPart(source,AI_DEFAULTS,names,plan,'0',{...result,finishReason:'MAX_TOKENS'})).toBe(false);
 expect(await writeAiPart(source,AI_DEFAULTS,names,plan,'0',{...result,model:'unknown-model'})).toBe(false);
 await writeAiPart(source,AI_DEFAULTS,names,plan,'0',result);const row=(await rows())[0];await db.settings.put({...row,value:{...row.value as object,response:{...result,finishReason:'MAX_TOKENS'}}});
 expect(await readAiParts(source,AI_DEFAULTS,names,plan)).toEqual([]);
});
