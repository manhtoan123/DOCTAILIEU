import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,AiReadingSession,aiReadingKey,aiBookSettingsKey,type AiReadingCache} from '../src/features/ai/services/ai-reading';
import {readAiReadingCache,writeAiReadingCache} from '../src/features/ai/services/ai-reading-cache';
import {AiTranslateClientError,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import {splitAiText} from '../src/features/ai/services/ai-parts';
import {applySharedPromptStock,deletePromptProfile,getBookPromptSelection,getPromptStock,savePromptProfile,selectPromptProfile} from '../src/features/ai/prompt/prompt-stock';

const source={bookId:'fallback-review',id:'fallback-chapter',revision:1,text:'林儿来到这里。'};
const names=[{key:'林儿',value:'Lâm Nhi'}];
const settings={...AI_DEFAULTS,model:'gemini-3.8-flash',fallbackModels:['gemini-3.7-flash','gemini-2.5-flash']};
const output=(model:string,result='Lâm Nhi đến đây.'):AiTranslateClientResponse=>({model,result,finishReason:'STOP',inputTokens:1,outputTokens:2});
const busy=()=>new AiTranslateClientError('ai_upstream_error','Synthetic busy',503,'upstream_http');
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
beforeEach(async()=>{await db.delete();await db.open();await db.books.put({id:source.bookId,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',charCount:source.text.length,chapterCount:1});await db.chapters.put({...source,order:0,title:'Synthetic',sourceId:'synthetic'});});
afterEach(()=>vi.restoreAllMocks());

it('review: actual proxy model404 envelope falls back without retrying the unavailable model',async()=>{
 const models:string[]=[];
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{
  const request=JSON.parse(String(init?.body));models.push(request.model);
  if(models.length===1)return Response.json({error:'ai_invalid_model'},{status:404,headers:{'x-ai-failure-reason':'upstream_http'}});
  return Response.json(output(request.model));
 });
 expect(await new AiReadingSession().request(source,settings,names)).toEqual(output('gemini-3.7-flash'));
 expect(models).toEqual(['gemini-3.8-flash','gemini-3.7-flash']);
});

it('review: an overloaded long plan stops after the first part model chain without dispatching remaining parts',async()=>{
 const long={...source,text:'中'.repeat(64000)},send=vi.fn().mockRejectedValue(busy());
 const session=new AiReadingSession(send),chosen={...settings,fallbackModels:['gemini-3.7-flash','gemini-3.5-flash','gemini-2.5-flash']};
 await expect(session.request(long,chosen,[])).rejects.toMatchObject({status:503,retryAfterMs:expect.any(Number)});
 const first=splitAiText(long.text,[],32000)[0];expect(first.text.length).toBeLessThanOrEqual(32000);expect(first.text).toBe(long.text.slice(0,first.end));
 expect(send.mock.calls.map(c=>[c[0].model,c[0].text.length])).toEqual([['gemini-3.8-flash',first.text.length],['gemini-3.7-flash',first.text.length],['gemini-3.5-flash',first.text.length],['gemini-2.5-flash',first.text.length]]);
 expect(send.mock.calls.every(c=>c[0].text===first.text&&c[0].context===undefined)).toBe(true);
 expect(session.get(aiReadingKey(long,chosen,[]))).toBeUndefined();
});

it('review: completed fallback persists under its exact chain and reopens without network',async()=>{
 const send=vi.fn(async(input:any)=>{if(input.model===settings.model)throw busy();return output(input.model);});
 const cache={read:readAiReadingCache,write:writeAiReadingCache};
 expect((await new AiReadingSession(send,cache).request(source,settings,names)).model).toBe('gemini-3.7-flash');
 expect(send).toHaveBeenCalledTimes(2);db.close();
 const offline=vi.fn(async()=>{throw new Error('Network must not run');});
 expect(await new AiReadingSession(offline,cache).request(source,settings,names)).toEqual(output('gemini-3.7-flash'));
 expect(offline).not.toHaveBeenCalled();
 for(const changed of [{...settings,fallbackModels:[]},{...settings,fallbackModels:['gemini-2.5-flash']},{...settings,fallbackModels:[...settings.fallbackModels].reverse()},{...settings,systemPrompt:'Changed prompt'},{...settings,userPromptTemplate:'Changed {{text}}'},{...settings,temperature:0.5}])expect(await readAiReadingCache(source,changed,names)).toBeUndefined();
 expect(await readAiReadingCache(source,settings,[{key:'林儿',value:'Different'}])).toBeUndefined();
 expect(await readAiReadingCache(source,settings,[...names,{key:'不在',value:'Absent'}])).toEqual(output('gemini-3.7-flash'));
 expect((await db.chapters.get(source.id))?.text).toBe(source.text);
});

it('review: disallowed and incomplete fallback responses cannot enter persistence',async()=>{
 expect(await writeAiReadingCache(source,settings,names,output('gemini-3.5-flash'))).toBe(false);
 expect(await writeAiReadingCache(source,settings,names,{...output('gemini-3.7-flash'),finishReason:'MAX_TOKENS'})).toBe(false);
 expect(await readAiReadingCache(source,settings,names)).toBeUndefined();
});

it('review: asynchronous cache lookup cannot mutate the snapshotted fallback chain',async()=>{
 const gate=deferred<AiTranslateClientResponse|undefined>();
 const cache:AiReadingCache={read:vi.fn(()=>gate.promise),write:vi.fn(async()=>true)};
 const mutable={...settings,fallbackModels:[...settings.fallbackModels]};
 const send=vi.fn(async(input:any)=>{if(input.model===settings.model)throw busy();return output(input.model);});
 const session=new AiReadingSession(send,cache),key=aiReadingKey(source,settings,names);
 const job=session.request(source,mutable,names);mutable.fallbackModels.splice(0,2,'gemini-3.5-flash');gate.resolve(undefined);
 expect((await job).model).toBe('gemini-3.7-flash');
 expect(send.mock.calls.map(c=>c[0].model)).toEqual(['gemini-3.8-flash','gemini-3.7-flash']);
 expect(cache.write).toHaveBeenCalledWith(source,settings,names,output('gemini-3.7-flash'),expect.any(AbortSignal));
 expect(session.get(key)).toEqual(output('gemini-3.7-flash'));
});

it('review: promoting a pending fallback preserves the same promise and only one chain',async()=>{
 const pending=deferred<AiTranslateClientResponse>(),entered=deferred<void>();
 const send=vi.fn(async(input:any)=>{if(input.model===settings.model)throw busy();entered.resolve();return pending.promise;});
 const session=new AiReadingSession(send),key=aiReadingKey(source,settings,names),job=session.request(source,settings,names);
 await entered.promise;session.retain([key]);expect(session.request(source,settings,names)).toBe(job);
 expect(send).toHaveBeenCalledTimes(2);pending.resolve(output('gemini-3.7-flash'));
 expect(await job).toEqual(output('gemini-3.7-flash'));expect(await session.request(source,settings,names)).toEqual(output('gemini-3.7-flash'));
 expect(send).toHaveBeenCalledTimes(2);
});

it.each([{fallbackModels:[] as string[]},{fallbackModels:['gemini-2.5-flash']},{fallbackModels:['gemini-2.5-flash','gemini-3.7-flash']}])('review: manual fallback $fallbackModels survives shared profile refresh and deletion',async({fallbackModels})=>{
 const profile=await savePromptProfile({title:'Synthetic shared prompt',settings});
 await selectPromptProfile(source.bookId,profile.id);
 const key=aiBookSettingsKey(source.bookId),selected=(await db.settings.get(key))!.value as object;
 const manual={...settings,fallbackModels};
 await db.settings.put({key,value:{...selected,...manual}});
 expect(await getBookPromptSelection(source.bookId)).toBeUndefined();
 const stock=await getPromptStock(),next={...stock,profiles:stock.profiles.map(p=>p.id===profile.id?{...p,settings:{...settings,systemPrompt:'Remote changed prompt'},updatedAt:p.updatedAt+1}:p)};
 await db.transaction('rw',db.settings,()=>applySharedPromptStock(next));
 expect((await db.settings.get(key))!.value).toMatchObject(manual);
 await deletePromptProfile(profile.id);
 expect((await db.settings.get(key))!.value).toEqual(manual);
});
