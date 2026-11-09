import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,aiReadingKey,legacyAiReadingKey,type AiReadingSource,type ReadingAiSettings} from '../src/features/ai/services/ai-reading';
import {AI_READING_CACHE_PREFIX,readAiReadingCache,writeAiReadingCache} from '../src/features/ai/services/ai-reading-cache';
import {describeAiExecution,readAiExecution,readExecutionHeader} from '../src/features/ai/services/ai-execution';
import {aiTranslate,type AiTranslateClientRequest} from '../src/features/ai/services/ai-translate';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {runPromptComparison,type PromptTrialInput} from '../src/features/ai/services/ai-prompt-trial';

const source:AiReadingSource={bookId:'effective-review-book',id:'effective-review-chapter',revision:1,text:'甲走进房间。'};
const settings:ReadingAiSettings={...AI_DEFAULTS,model:'gemini-3.8-flash',temperature:.3,fallbackModels:[]};
const completed={result:'Giáp bước vào phòng.',model:settings.model,finishReason:'STOP',inputTokens:10,outputTokens:5};
const upstream={candidates:[{content:{parts:[{text:completed.result}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:5,thoughtsTokenCount:7,totalTokenCount:22}};
const hash=async(key:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),n=>n.toString(16).padStart(2,'0')).join('');
beforeEach(async()=>{resetAiKeyState();await db.delete();await db.open();await db.books.put({id:source.bookId,title:'Synthetic review',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:source.text.length,chapterCount:1});await db.chapters.put({...source,order:0,title:'Synthetic',sourceId:'synthetic'});});
afterEach(()=>{vi.restoreAllMocks();resetAiKeyState();});

describe('independent effective request/cache identity',()=>{
 it('ignores temperature only when every reachable model ignores it',()=>{
  const key=(value:typeof settings)=>aiReadingKey(source,value,[]);
  expect(key({...settings,temperature:.1})).toBe(key({...settings,temperature:.9}));
  expect(key({...settings,fallbackModels:['gemini-3.7-flash'],temperature:.1})).toBe(key({...settings,fallbackModels:['gemini-3.7-flash'],temperature:.9}));
  for(const fallbackModels of [undefined,['gemini-3.5-flash'],['gemma-4-26b-a4b-it']])expect(aiReadingKey(source,{...settings,fallbackModels,temperature:.1},[])).not.toBe(aiReadingKey(source,{...settings,fallbackModels,temperature:.9},[]));
 });
 it('reads legacy identity without creating or rewriting a canonical record or fabricating execution',async()=>{
  const digest=await hash(legacyAiReadingKey(source,settings,[])),key=AI_READING_CACHE_PREFIX+digest;
  const row={key,value:{version:1,bookId:source.bookId,chapterId:source.id,digest,accessedAt:1,response:completed}};
  await db.settings.put(row);
  expect(await readAiReadingCache(source,settings,[])).toMatchObject(completed);
  expect((await readAiReadingCache(source,settings,[]))?.execution).toBeUndefined();
  expect(await db.settings.where('key').startsWith(AI_READING_CACHE_PREFIX).count()).toBe(1);
  expect(await db.settings.get(key)).toEqual(row);
 });
 it('preserves bounded execution facts and usage in persisted cache',async()=>{
  const execution=await describeAiExecution(settings.model,.3,'system','{{text}}');
  expect(await writeAiReadingCache(source,settings,[],{...completed,execution,thinkingTokens:7,totalTokens:22})).toBe(true);
  expect(await readAiReadingCache(source,settings,[])).toMatchObject({execution,thinkingTokens:7,totalTokens:22});
 });
});

describe('independent fresh manual A/B boundary',()=>{
 const trial=():PromptTrialInput=>({text:source.text,names:[{key:'甲',value:'Giáp'}],model:settings.model,temperature:.6,variants:[{label:'A',settings:{...AI_DEFAULTS,systemPrompt:'system A'}},{label:'B',settings:{...AI_DEFAULTS,systemPrompt:'system B'}}]});
 it('freezes both variants/text/Names/model before the first await and calls sequentially without persistence',async()=>{
  const input=trial(),calls:any[]=[],published:any[]=[];let release!:(value:typeof completed)=>void;
  const before={settings:await db.settings.toArray(),chapters:await db.chapters.toArray(),books:await db.books.toArray()};
  const translate=vi.fn((request:any)=>{calls.push(structuredClone(request));return calls.length===1?new Promise<typeof completed>(resolve=>release=resolve):Promise.resolve(completed);});
  const run=runPromptComparison(input,new AbortController().signal,result=>published.push(result),translate);
  expect(translate).toHaveBeenCalledOnce();expect(published).toHaveLength(0);
  input.text='changed';input.model='gemini-3.5-flash';input.names[0].value='Changed';input.variants[1].settings.systemPrompt='Changed';
  release(completed);await run;
  expect(calls).toHaveLength(2);expect(calls[0]).toMatchObject({text:source.text,model:settings.model,temperature:.6,names:{甲:'Giáp'},systemPrompt:'system A'});
  expect(calls[1]).toMatchObject({text:source.text,model:settings.model,temperature:.6,names:{甲:'Giáp'},systemPrompt:'system B'});expect(published.map(r=>r.index)).toEqual([0,1]);
  expect({settings:await db.settings.toArray(),chapters:await db.chapters.toArray(),books:await db.books.toArray()}).toEqual(before);
 });
 it('does not publish or start B after abort even when pending upstream ignores its signal',async()=>{
  let release!:(value:typeof completed)=>void;const translate=vi.fn(()=>new Promise<typeof completed>(resolve=>release=resolve)),publish=vi.fn(),controller=new AbortController();
  const run=runPromptComparison(trial(),controller.signal,publish,translate).catch(error=>error);controller.abort();release(completed);
  expect(await run).toMatchObject({name:'AbortError'});expect(translate).toHaveBeenCalledOnce();expect(publish).not.toHaveBeenCalled();
 });
 it('runs another fresh pair after a completed comparison',async()=>{
  const translate=vi.fn(async()=>completed),publish=vi.fn();for(let i=0;i<2;i++)await runPromptComparison(trial(),new AbortController().signal,publish,translate);
  expect(translate).toHaveBeenCalledTimes(4);expect(publish).toHaveBeenCalledTimes(4);
 });
 it('records an A error and requests B once on the same chosen model without fallback',async()=>{
  const publish=vi.fn(),translate=vi.fn().mockRejectedValueOnce(new Error('Synthetic failure')).mockResolvedValueOnce(completed);
  await runPromptComparison(trial(),new AbortController().signal,publish,translate);
  expect(translate).toHaveBeenCalledTimes(2);expect(translate.mock.calls.map(call=>call[0].model)).toEqual([settings.model,settings.model]);
  expect(publish.mock.calls[0][0]).toMatchObject({index:0,error:'Synthetic failure'});expect(publish.mock.calls[1][0]).toMatchObject({index:1,response:completed});
 });
 it('ignores valid saved fallback chains when the chosen trial model appears in them',async()=>{
  const input=trial();input.variants[0].settings={...AI_DEFAULTS,model:'gemini-3.5-flash',fallbackModels:[settings.model]};
  const translate=vi.fn(async(_request:AiTranslateClientRequest)=>completed);await runPromptComparison(input,new AbortController().signal,()=>{},translate);
  expect(translate).toHaveBeenCalledTimes(2);expect(translate.mock.calls.every(call=>!('fallbackModels' in call[0]))).toBe(true);
 });
});

describe('independent handler/client metadata boundary',()=>{
 it('accepts a legacy JSON response with no execution metadata as unknown',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json(completed));
  const result=await aiTranslate({text:source.text,model:settings.model});
  expect(result).toMatchObject(completed);expect(result.execution).toBeUndefined();expect(result.thinkingTokens).toBeUndefined();
 });
 it('fingerprints prompt templates without leaking source, Names, or prompt text',async()=>{
  const execution=await describeAiExecution(settings.model,.7,'private system','private {{text}}','private rules');
  expect(execution.temperature).toBeNull();expect(JSON.stringify(execution)).not.toContain('private');
  expect(readAiExecution({...execution,promptId:'credential',source:'source'})).toBeUndefined();
  expect(readExecutionHeader(new Headers({'X-AI-Execution':'x'.repeat(513)}))).toBeUndefined();
  expect(readAiExecution({...execution,temperature:Infinity})).toBeUndefined();
 });
 it('roundtrips real handler response through negotiated client stream with bounded metadata and no credential material',async()=>{
  const requests:Record<string,unknown>[]=[];
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
   if(input==='/api/ai/translate')return handleAiTranslate(new Request('https://review.example/api/ai/translate',init),{GEMINI_API_KEY:'synthetic-effective-review-key'});
   requests.push(JSON.parse(String(init?.body)));
   return new Response('data: '+JSON.stringify(upstream)+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
  });
  const response=await aiTranslate({text:source.text,model:settings.model,temperature:.9,systemPrompt:'private system',userPromptTemplate:'{{name}}{{text}}',names:{甲:'Giáp'}});
  expect(response).toMatchObject({...completed,execution:{version:1,model:settings.model,temperature:null,thinking:'provider-default',maxOutputTokens:8192},thinkingTokens:7,totalTokens:22});
  expect(JSON.stringify(response)).not.toContain('synthetic-effective-review-key');expect(JSON.stringify(response.execution)).not.toContain('private system');
  expect((requests[0].generationConfig as Record<string,unknown>).temperature).toBeUndefined();
 });
 it('reports the actual upstream model for legacy aliases while accepting legacy response model echo',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json(upstream));
  const request=new Request('https://review.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:source.text,model:'gemini-3.6-flash',temperature:.7})});
  const response=await handleAiTranslate(request,{GEMINI_API_KEY:'synthetic-effective-review-key'});
  expect(await response.json()).toMatchObject({model:'gemini-3.6-flash'});
  expect(readExecutionHeader(response.headers)).toMatchObject({model:'gemini-3.5-flash',temperature:.7});
 });
 it('omits invalid optional upstream usage rather than exposing arbitrary strings',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({...upstream,usageMetadata:{...upstream.usageMetadata,thoughtsTokenCount:'sensitive-upstream-string',totalTokenCount:1000001}}));
  const request=new Request('https://review.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:source.text,model:settings.model})});
  const response=await handleAiTranslate(request,{GEMINI_API_KEY:'synthetic-effective-review-key'});
  expect(response.status).toBe(200);expect(response.headers.get('X-AI-Thought-Tokens')).toBeNull();expect(response.headers.get('X-AI-Total-Tokens')).toBeNull();
 });
});
