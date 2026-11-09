import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,AiReadingSession,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {splitAiText,runAiParts,type AiPartsProgress} from '../src/features/ai/services/ai-parts';
import {AiTranslateClientError,type AiTranslateClientRequest,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import {readAiReadingCache,writeAiReadingCache,readAiParts,writeAiPart} from '../src/features/ai/services/ai-reading-cache';
import {AiRunMetrics,getAiRunMetrics} from '../src/features/ai/services/ai-metrics';
import {AiChapterJob,createAiChapterBudget,AI_CHAPTER_LIMITS,EPUB_AI_CHAPTER_LIMITS} from '../src/features/ai/services/ai-job';
const model='gemini-2.5-flash',settings={...AI_DEFAULTS,model,fallbackModels:[]};
const raw='甲'.repeat(900)+'乙'.repeat(900),source={bookId:'speed-book',id:'speed-chapter',revision:1,text:raw};
const txtRaw='甲'.repeat(24)+'a'.repeat(2976)+'乙'.repeat(24)+'b'.repeat(2976),txtSource={...source,text:txtRaw};
const persisted={read:readAiReadingCache,write:writeAiReadingCache,readParts:readAiParts,writePart:writeAiPart};
const result=(text:string,parallel?:2):AiTranslateClientResponse=>({result:text,model,finishReason:'STOP',inputTokens:1,outputTokens:2,...(parallel?{parallel}:{})});
const cut=()=>new AiTranslateClientError('ai_incomplete_result','synthetic truncation',502,'output_limit');
function gate<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {resolve,promise};}
beforeEach(async()=>{await db.delete();await db.open();await db.books.put({id:source.bookId,title:'Synthetic speed',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:raw.length,chapterCount:1});await db.chapters.put({...source,title:'Synthetic chapter',order:0,sourceId:''});});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

describe('AI success and speed',()=>{
 it('balances the small tail without changing source coverage, Unicode or Name spans',()=>{
  const text='甲'.repeat(3936),parts=splitAiText(text);expect(parts.map(p=>p.text.length)).toEqual([1312,1312,1312]);expect(parts.map(p=>p.text).join('')).toBe(text);
  const special='甲'.repeat(1299)+'乌波伙伴😀'+'乙'.repeat(2700),mapped=splitAiText(special,['乌波伙伴😀']);expect(mapped.map(p=>p.text).join('')).toBe(special);expect(mapped.filter(p=>p.text.includes('乌波伙伴😀'))).toHaveLength(1);expect(mapped.every(p=>p.text.length<=1800&&!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(p.text))).toBe(true);
 });
 it('reload resumes a saved TXT child, skips its failed parent and sibling, and preserves the raw chapter',async()=>{
  await db.chapters.update(source.id,{text:txtRaw});
  let fail=true;const send=vi.fn(async input=>{if(input.text.length===6000)throw cut();if(input.text[0]==='乙'&&fail)throw new AiTranslateClientError('ai_auth_error','synthetic credentials',403);return result(input.text[0]==='甲'?'TRÁI':'PHẢI');});
  await expect(new AiReadingSession(send,persisted).request(txtSource,settings,[])).rejects.toThrow('synthetic');expect(await readAiReadingCache(txtSource,settings,[])).toBeUndefined();
  const rows=await db.settings.where('key').startsWith('ai-reading-cache:parts:').toArray();expect(rows.some(r=>(r.value as {partId:string}).partId==='0/0')).toBe(true);
  db.close();await db.open();fail=false;const before=send.mock.calls.length,session=new AiReadingSession(send,persisted);
  expect((await session.request(txtSource,settings,[])).result).toBe('TRÁI\nPHẢI');expect(send.mock.calls.slice(before).map(([i])=>i.text)).toEqual([txtRaw.slice(3000)]);expect((await db.chapters.get(source.id))?.text).toBe(txtRaw);expect(session.get(aiReadingKey(txtSource,settings,[]))?.finishReason).toBe('STOP');
 });
 it('a matching Name edit invalidates child checkpoints rather than mixing translation settings',async()=>{
  await db.chapters.update(source.id,{text:txtRaw});
  const a=[{key:'甲',value:'A'}],b=[{key:'甲',value:'B'}];const old=vi.fn(async input=>{if(input.text.length===6000)throw cut();if(input.text[0]==='乙')throw new AiTranslateClientError('ai_auth_error','stop',403);return result('OLD');});
  await new AiReadingSession(old,persisted).request(txtSource,settings,a).catch(()=>{});const fresh=vi.fn(async(_input:AiTranslateClientRequest)=>result('NEW'));expect((await new AiReadingSession(fresh,persisted).request(txtSource,settings,b)).result).toBe('NEW');expect(fresh).toHaveBeenCalledOnce();expect(fresh.mock.calls[0][0].text).toBe(txtRaw);
 });
 it('pins the first validated split child and never falls back into a mixed-model chapter',async()=>{
  await db.chapters.update(source.id,{text:txtRaw});
  const first='gemini-3.5-flash',send=vi.fn(async input=>{if(input.text.length===6000)throw cut();if(input.text[0]==='乙')throw new AiTranslateClientError('ai_rate_limited','quota',429,'cooldown',undefined,undefined,40000);return {...result('SAVED'),model:input.model};});
  await expect(new AiReadingSession(send,persisted).request(txtSource,{...settings,model:first,fallbackModels:[model]},[])).rejects.toThrow('quota');expect(send.mock.calls.every(([i])=>i.model===first)).toBe(true);expect(await readAiReadingCache(txtSource,{...settings,model:first,fallbackModels:[model]},[])).toBeUndefined();
 });
 it('continues independent unstarted parts and then recovers only the transient gap',async()=>{
  const calls:string[]=[],attempts=new Map<string,number>(),states:AiPartsProgress[]=[];
  const done=await runAiParts(splitAiText('甲'.repeat(7200)),new AbortController().signal,new Map(),async part=>{calls.push(part.id);const n=attempts.get(part.id)??0;attempts.set(part.id,n+1);if(part.id==='1'&&!n)throw new AiTranslateClientError('ai_gateway_error','temporary',503);return result(part.id,2);},s=>states.push(s));
  expect(calls).toEqual(['0','1','2','3','1']);expect(done.result).toBe('0\n1\n2\n3');expect(states.some(s=>s.retrying?.includes(2))).toBe(true);expect(states.at(-1)?.recoveryPasses).toBe(1);
 });
 it('quota pauses new dispatch and reduces subsequent concurrency despite fresh hints',async()=>{
  vi.useFakeTimers();let rate=false,active=0,maxAfterQuota=0;const calls:string[]=[],states:AiPartsProgress[]=[],attempts=new Map<string,number>();
  const work=runAiParts(splitAiText('甲'.repeat(9000)),new AbortController().signal,new Map(),async part=>{calls.push(part.id);active++;if(rate)maxAfterQuota=Math.max(maxAfterQuota,active);const n=attempts.get(part.id)??0;attempts.set(part.id,n+1);await Promise.resolve();active--;if(part.id==='1'&&!n){rate=true;throw new AiTranslateClientError('ai_rate_limited','quota',429,'cooldown',undefined,undefined,1000);}return result(part.id,2);},s=>states.push(s));
  for(let i=0;i<30;i++)await Promise.resolve();expect(calls).toEqual(['0','1','2']);expect(states.at(-1)?.parallel).toBe(1);expect(states.at(-1)?.waitUntil).toBeGreaterThan(Date.now());await vi.advanceTimersByTimeAsync(1000);expect((await work).result).toBe('0\n1\n2\n3\n4');expect(maxAfterQuota).toBe(1);
 });
 it('disk persistence no longer holds an API slot, but complete publication still waits for guarded writes',async()=>{
  const held=gate<void>(),send=vi.fn(async part=>result(part.id,2)),save=vi.fn(async part=>{if(part.id==='0')await held.promise;});let finished=false;
  const done=runAiParts(splitAiText('甲'.repeat(5400)),new AbortController().signal,new Map(),send,()=>{},save).then(r=>{finished=true;return r;});await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(3));expect(finished).toBe(false);held.resolve();expect((await done).result).toBe('0\n1\n2');expect(save).toHaveBeenCalledTimes(3);
 });
 it('a validated recent capacity hint enables two initial requests on the same model',async()=>{
  const held=gate<AiTranslateClientResponse>(),send=vi.fn(async input=>input.text==='warm'?result('warm',2):held.promise),session=new AiReadingSession(send);
  await session.request({...source,id:'warm',text:'warm'},{...settings,splitParts:true},[]);const work=session.request({...source,id:'next',text:'甲'.repeat(96000)},{...settings,splitParts:true},[]);await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(3));expect(send.mock.calls.slice(1).every(([i])=>i.model===model)).toBe(true);held.resolve(result('OK',2));await work;
 });
 it('EPUB subdivides one failing piece and reload reuses its validated child with original node mapping',async()=>{
  const layout={path:'one.xhtml',body:'<body><p><em>甲</em></p><img src="x.png"/></body>',styles:[],nodes:[raw]},original=JSON.stringify(layout);let fail=true;
  const send=vi.fn(async input=>{const values=JSON.parse(input.text),id=Object.keys(values)[0],text=values[id] as string;if(text.length===1800)throw cut();if(text[0]==='乙'&&fail)throw new AiTranslateClientError('ai_auth_error','stop',403);return result(JSON.stringify({[id]:text[0]==='甲'?'TRÁI':'PHẢI'}));});
  await expect(new EpubAiSession(persisted,send).request(source,settings,[],layout)).rejects.toThrow('stop');const before=send.mock.calls.length;fail=false;db.close();await db.open();const restored=await new EpubAiSession(persisted,send).request(source,settings,[],layout);
  expect(restored.nodes).toEqual(['TRÁIPHẢI']);expect(send.mock.calls.slice(before)).toHaveLength(1);expect(Object.keys(JSON.parse(send.mock.calls.at(-1)![0].text))).toEqual(['0/1']);expect(JSON.stringify(layout)).toBe(original);expect((await db.chapters.get(source.id))?.text).toBe(raw);
 });
 it('EPUB quota exhaustion never turns into group fan-out',async()=>{
  const send=vi.fn(async()=>{throw new AiTranslateClientError('ai_rate_limited','quota',429,'cooldown',undefined,undefined,40000);});
  await expect(new EpubAiSession(undefined,send).request({...source,text:'甲\n乙'},settings,[],{path:'one.xhtml',body:'<body/>',styles:[],nodes:['甲','乙']})).rejects.toThrow('quota');expect(send).toHaveBeenCalledOnce();
 });
 it('abort cannot finish or cache a chapter after a child was retained',async()=>{
  await db.chapters.update(source.id,{text:txtRaw});
  const held=gate<AiTranslateClientResponse>();const send=vi.fn(async input=>{if(input.text.length===6000)throw cut();return input.text[0]==='甲'?result('KEPT'):held.promise;}),session=new AiReadingSession(send,persisted),key=aiReadingKey(txtSource,settings,[]);
  const work=session.request(txtSource,settings,[]),rejected=expect(work).rejects.toMatchObject({name:'AbortError'});await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(3));session.cancel(key);held.resolve(result('LATE'));await rejected;expect(session.get(key)).toBeUndefined();expect(await readAiReadingCache(txtSource,settings,[])).toBeUndefined();
 });
 it('local metrics report one chapter and actual requests without retaining source or credentials',async()=>{
  const text='RAW_SECRET_SOURCE_SENTINEL',send=vi.fn(async()=>result('Dịch'));await new AiReadingSession(send).request({...source,text},settings,[]);const metric=getAiRunMetrics().at(-1)!;expect(metric).toMatchObject({kind:'txt',status:'complete',sourceChars:text.length,requests:1,totalParts:1,completeParts:1});expect(JSON.stringify(metric)).not.toContain(text);
  for(let i=0;i<140;i++)new AiRunMetrics('txt',1).finish({code:'SECRET_KEY_SENTINEL'});expect(getAiRunMetrics()).toHaveLength(128);expect(JSON.stringify(getAiRunMetrics())).not.toContain('SECRET_KEY_SENTINEL');
 });
 it('automatic TXT retry keeps the original deadline and one metric work ID; manual continuation gets a new budget',async()=>{
  vi.useFakeTimers();let fail=true;const short={...source,text:'甲'},send=vi.fn(async()=>{if(fail)throw new AiTranslateClientError('ai_auth_error','stop',403);return result('COMPLETE');}),session=new AiReadingSession(send);
  await expect(session.request(short,settings,[])).rejects.toThrow('stop');const id=getAiRunMetrics().at(-1)!.workId;
  await expect(session.request(short,settings,[],undefined,undefined,undefined,{automatic:true})).rejects.toThrow('stop');expect(getAiRunMetrics().filter(row=>row.workId===id)).toHaveLength(1);expect(getAiRunMetrics().at(-1)).toMatchObject({attempts:2,requests:2,status:'error'});
  await vi.advanceTimersByTimeAsync(AI_CHAPTER_LIMITS.durationMs+1);await expect(session.request(short,settings,[],undefined,undefined,undefined,{automatic:true})).rejects.toMatchObject({code:'ai_recovery_exhausted',reason:'chapter_deadline'});expect(send).toHaveBeenCalledTimes(2);
  fail=false;expect((await session.request(short,settings,[])).result).toBe('COMPLETE');expect(getAiRunMetrics().at(-1)!.workId).not.toBe(id);expect(getAiRunMetrics().at(-1)?.status).toBe('complete');
 });
 it('automatic EPUB retries cannot reset the chapter-wide wallclock',async()=>{
  vi.useFakeTimers();let fail=true;const layout={path:'one.xhtml',body:'<body/>',styles:[],nodes:['甲','乙']},send=vi.fn(async input=>{if(fail)throw new AiTranslateClientError('ai_auth_error','stop',403);return result(input.text);}),session=new EpubAiSession(undefined,send);
  await expect(session.request(source,settings,[],layout)).rejects.toThrow('stop');await vi.advanceTimersByTimeAsync(EPUB_AI_CHAPTER_LIMITS.durationMs+1);
  await expect(session.request(source,settings,[],layout,undefined,undefined,{automatic:true})).rejects.toMatchObject({code:'ai_recovery_exhausted',reason:'chapter_deadline'});expect(send).toHaveBeenCalledOnce();fail=false;expect((await session.request(source,settings,[],layout)).nodes).toEqual(['甲','乙']);
 });
 it('a new automatic controller shares the original send counter',async()=>{
  const limits={durationMs:1000,sends:1},budget=createAiChapterBudget(limits),send=vi.fn(async()=>result('DONE'));
  expect(await new AiChapterJob(limits,undefined,budget).run(()=>new AiChapterJob(limits,undefined,budget).send(send))).toMatchObject({result:'DONE'});
  const retry=new AiChapterJob(limits,undefined,budget);await expect(retry.run(()=>retry.send(send))).rejects.toMatchObject({code:'ai_recovery_exhausted',reason:'send_limit'});expect(send).toHaveBeenCalledOnce();
 });
});
