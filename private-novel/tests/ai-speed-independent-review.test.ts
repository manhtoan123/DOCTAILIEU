import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {aiRecoveryCut} from '../src/features/ai/services/ai-complete';
import {splitAiText,runAiParts,type AiPartsProgress} from '../src/features/ai/services/ai-parts';
import {AI_DEFAULTS,AiReadingSession,aiReadingKey,type AiReadingCache} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {AiTranslateClientError,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import {AI_PART_CACHE_PREFIX,readAiParts,writeAiPart} from '../src/features/ai/services/ai-reading-cache';
import {AI_CHAPTER_LIMITS,EPUB_AI_CHAPTER_LIMITS} from '../src/features/ai/services/ai-job';
import {getAiRunMetrics} from '../src/features/ai/services/ai-metrics';

const model='gemini-2.5-flash',settings={...AI_DEFAULTS,model,fallbackModels:[]};
const response=(result:string,parallel?:2):AiTranslateClientResponse=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:2,...(parallel?{parallel}: {})});
const translatedNode=(value:string)=>({甲:'A',乙:'B',丙:'C'} as Record<string,string>)[value[0]]?.repeat(value.length)??value;
const translatedEpub=(text:string)=>JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(text) as Record<string,string>).map(([id,value])=>[id,translatedNode(value)])));
const source={bookId:'speed-review-book',id:'speed-review-chapter',revision:1,text:'甲'.repeat(24)+'a'.repeat(1476)+'乙'.repeat(24)+'b'.repeat(1476)+'丙'.repeat(24)+'c'.repeat(2976)};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
const rows=()=>db.settings.where('key').startsWith('ai-reading-cache:').toArray();
beforeEach(async()=>{
 await db.delete();await db.open();
 await db.books.put({id:source.bookId,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',charCount:source.text.length,chapterCount:1});
 await db.chapters.put({...source,order:0,title:'Synthetic',sourceId:'synthetic'});
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

describe('independent AI speed integrity regressions',()=>{
 it.each([false,true])('never cuts either overlapping protected Name (reverse=%s)',reverse=>{
  const text='文'.repeat(1794)+'ABCDEFHIJK'+'尾'.repeat(1796),names=['ABCDEF','DEFHIJK'];if(reverse)names.reverse();
  const parts=splitAiText(text,names);expect(parts.map(p=>p.text).join('')).toBe(text);
  const boundaries=[...parts.slice(0,-1).map(p=>p.end),aiRecoveryCut(text,names)];
  for(const key of names){const at=text.indexOf(key);for(const end of boundaries)expect(end<=at||end>=at+key.length,`${key} split at ${end}`).toBe(true);}
 });
 it('stops safely when every bounded cut crosses a chain of overlapping Names',()=>{
  expect(()=>splitAiText('a'.repeat(4000),['aaa'])).toThrow();
  const text='x'.repeat(1795)+'ABCDE😀GHI'+'y'.repeat(1795),parts=splitAiText(text,['ABCDE😀','😀GHI']);
  expect(parts.map(part=>part.text).join('')).toBe(text);for(const part of parts){expect(part.text.length).toBeLessThanOrEqual(1800);expect(part.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);}
 });
 it('reopens nested TXT child checkpoints without resending either saved sibling or a parent',async()=>{
  const saved=new Map<string,AiTranslateClientResponse>(),write=vi.fn(async()=>true);
  const cache:AiReadingCache={read:async()=>undefined,write,readParts:async()=>[...saved].map(([id,response])=>({id,response})),writePart:async(_s,_settings,_names,_plan,id,result)=>{saved.set(id,result);return true;}};
  const firstTranslate=vi.fn(async input=>{
   if(input.text.length===6000||input.text.startsWith('甲')&&input.text.length===3000)throw new AiTranslateClientError('ai_incomplete_result','Synthetic truncation',502,'output_limit');
   if(input.text.startsWith('丙'))throw new AiTranslateClientError('ai_auth_error','Synthetic permanent failure',401);
   return response(input.text.startsWith('甲')?'A':'B');
  });
  const first=new AiReadingSession(firstTranslate,cache);await expect(first.request(source,settings,[])).rejects.toMatchObject({status:401});
  expect([...saved.keys()]).toEqual(['0/0/0','0/0/1']);expect(first.get(aiReadingKey(source,settings,[]))).toBeUndefined();expect(write).not.toHaveBeenCalled();
  first.clear();const resumedTranslate=vi.fn(async input=>{expect(input.model).toBe(model);expect(input.text).toBe(source.text.slice(3000));return response('C');});
  const resumed=new AiReadingSession(resumedTranslate,cache);expect((await resumed.request(source,settings,[])).result).toBe('A\nB\nC');expect(resumedTranslate).toHaveBeenCalledOnce();expect(write).toHaveBeenCalledOnce();
 });
 it('EPUB singleton resume joins children into the exact original node and preserves layout',async()=>{
  const text='甲'.repeat(800)+'乙'.repeat(800),src={...source,text},layout={path:'one.xhtml',body:'<body><em>text</em><img src="synthetic.png"/></body>',styles:[{path:'one.css',text:'em{color:red}'}],nodes:[text]},before=JSON.stringify(layout);
  const saved=new Map<string,AiTranslateClientResponse>(),write=vi.fn<AiReadingCache['write']>(async()=>true),cache:AiReadingCache={read:async()=>undefined,write,readParts:async()=>[...saved].map(([id,response])=>({id,response})),writePart:async(_s,_settings,_names,_plan,id,result)=>{saved.set(id,result);return true;}};
  const translate=vi.fn(async input=>{const data=JSON.parse(input.text),key=Object.keys(data)[0];if(key==='0')throw new AiTranslateClientError('ai_timeout','Synthetic timeout',408);if(key==='0/1')throw new AiTranslateClientError('ai_auth_error','Synthetic permanent failure',401);return response(translatedEpub(input.text));});
  const first=new EpubAiSession(cache,translate);await expect(first.request(src,settings,[],layout)).rejects.toMatchObject({status:401});expect([...saved.keys()]).toEqual(['0/0']);expect(write).not.toHaveBeenCalled();first.clear();
  const resumedTranslate=vi.fn(async input=>{expect(JSON.parse(input.text)).toEqual({'0/1':'乙'.repeat(800)});return response(translatedEpub(input.text));});
  const translated='A'.repeat(800)+'B'.repeat(800),result=await new EpubAiSession(cache,resumedTranslate).request(src,settings,[],layout);expect(result.nodes).toEqual([translated]);expect(JSON.parse(write.mock.calls[0][3].result)).toEqual({'0':translated});expect(resumedTranslate).toHaveBeenCalledOnce();expect(JSON.stringify(layout)).toBe(before);
 });
 it('shared quota pause blocks new parts, retries the blocker first, and stays at one worker after a fresh width hint',async()=>{
  vi.useFakeTimers();const parts=splitAiText('甲'.repeat(5400)),held=deferred<AiTranslateClientResponse>(),states:AiPartsProgress[]=[],calls:string[]=[];let attempts=0;
  const run=runAiParts(parts,new AbortController().signal,new Map(),async part=>{calls.push(part.id);if(part.id==='0'&&++attempts===1)throw new AiTranslateClientError('ai_rate_limited','Synthetic quota',429,'quota',undefined,undefined,1000);if(part.id==='1')return held.promise;return response(part.id,2);},state=>states.push(state),undefined,undefined,2);
  await vi.advanceTimersByTimeAsync(0);expect(calls).toEqual(['0','1']);expect(states.at(-1)?.parallel).toBe(1);held.resolve(response('1',2));await vi.advanceTimersByTimeAsync(999);expect(calls).toEqual(['0','1']);
  await vi.advanceTimersByTimeAsync(1);expect((await run).result).toBe('0\n1\n2');expect(calls).toEqual(['0','1','0','2']);expect(states.at(-1)?.parallel).toBe(1);
 });
 it('propagates a recoverable client 429 into chapter-wide reduced concurrency before retry succeeds',async()=>{
  vi.useFakeTimers();let seed=true,first=true,quota=false,active=0,maxAfterQuota=0;
  const translate=vi.fn(async input=>{
   if(seed)return response('seed',2);
   if(input.text.startsWith('甲')&&first){first=false;quota=true;throw new AiTranslateClientError('ai_rate_limited','Synthetic quota',429,'quota',undefined,undefined,1000);}
   active++;if(quota)maxAfterQuota=Math.max(maxAfterQuota,active);await new Promise(resolve=>setTimeout(resolve,20));active--;return response(input.text[0],2);
  });
  const session=new AiReadingSession(translate);await session.request({...source,id:'seed',text:'seed'},settings,[]);seed=false;
  const states:AiPartsProgress[]=[],run=session.request({...source,id:'quota',text:'甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800)+'丁'.repeat(1800)},{...settings,splitParts:true},[],undefined,undefined,state=>states.push(state));
  await vi.advanceTimersByTimeAsync(3000);expect((await run).result).toBe('甲\n乙\n丙\n丁');expect(maxAfterQuota).toBe(1);expect(states.some(state=>state.waitUntil!==undefined&&state.parallel===1)).toBe(true);
 });
 it('propagates a recoverable EPUB 429 to the outer chapter scheduler',async()=>{
  vi.useFakeTimers();let seed=true,first=true,quota=false,active=0,maxAfterQuota=0;
  const translate=vi.fn(async input=>{
   if(seed)return response(input.text,2);
   const row=JSON.parse(input.text);if(Object.hasOwn(row,'0')&&first){first=false;quota=true;throw new AiTranslateClientError('ai_rate_limited','Synthetic quota',429,'quota',undefined,undefined,1000);}
   active++;if(quota)maxAfterQuota=Math.max(maxAfterQuota,active);await new Promise(resolve=>setTimeout(resolve,20));active--;return response(translatedEpub(input.text),2);
  });
  const session=new EpubAiSession(undefined,translate),base={path:'synthetic.xhtml',body:'<body/>',styles:[],nodes:['seed']};await session.request({...source,id:'epub-seed',text:'seed'},settings,[],base);seed=false;
  const nodes=['甲'.repeat(31900),'乙'.repeat(31900),'丙'.repeat(31900)],states:AiPartsProgress[]=[],run=session.request({...source,id:'epub-quota',text:nodes.join('\n')},settings,[],{...base,nodes},undefined,state=>states.push(state));
  await vi.advanceTimersByTimeAsync(3000);expect((await run).nodes).toEqual(nodes.map(translatedNode));expect(maxAfterQuota).toBe(1);expect(states.some(state=>state.waitUntil!==undefined&&state.parallel===1)).toBe(true);
 });
 it.each(['txt','epub'] as const)('serializes retries when both initial %s workers receive a short 429',async kind=>{
  vi.useFakeTimers();let seed=true,quota=false,active=0,maxAfterQuota=0;const attempts=new Map<string,number>();
  const translate=vi.fn(async input=>{
   if(seed)return response(kind==='epub'?input.text:'seed',2);
   const text=kind==='epub'?String(Object.values(JSON.parse(input.text))[0]):input.text,id=text[0],attempt=attempts.get(id)??0;attempts.set(id,attempt+1);
   active++;if(quota)maxAfterQuota=Math.max(maxAfterQuota,active);
   try{await new Promise(resolve=>setTimeout(resolve,20));if((id==='甲'||id==='乙')&&!attempt){quota=true;throw new AiTranslateClientError('ai_rate_limited','Synthetic simultaneous quota',429,'quota',undefined,undefined,1000);}return response(kind==='epub'?translatedEpub(input.text):id,2);}finally{active--;}
  });
  const width=kind==='txt'?1800:31900,nodes=(kind==='txt'?['甲','乙','丙','丁']:['甲','乙','丙']).map(label=>label.repeat(width)),base={path:'synthetic.xhtml',body:'<body/>',styles:[],nodes:['seed']},states:AiPartsProgress[]=[];
  const session=kind==='txt'?new AiReadingSession(translate):new EpubAiSession(undefined,translate);
  if(session instanceof AiReadingSession)await session.request({...source,id:'two-seed',text:'seed'},settings,[]);else await session.request({...source,id:'two-seed',text:'seed'},settings,[],base);seed=false;
  const src={...source,id:'two-quota',text:nodes.join(kind==='txt'?'':'\n')},run=session instanceof AiReadingSession?session.request(src,{...settings,splitParts:true},[],undefined,undefined,state=>states.push(state)):session.request(src,settings,[],{...base,nodes},undefined,state=>states.push(state));
  await vi.advanceTimersByTimeAsync(3000);expect((await run).result).toBe(kind==='epub'?nodes.map(translatedNode).join('\n'):'甲\n乙\n丙\n丁');expect(attempts.get('甲')).toBe(2);expect(attempts.get('乙')).toBe(2);expect(maxAfterQuota).toBe(1);expect(states.at(-1)?.parallel).toBe(1);
 });
 it('does not send queued writes or publish a full response after cancellation during the first disk write',async()=>{
  const writing=deferred<void>(),release=deferred<boolean>(),writePart=vi.fn(async()=>{writing.resolve();return release.promise;}),write=vi.fn(async()=>true),states:AiPartsProgress[]=[];
  const session=new AiReadingSession(async input=>response(input.text[0],2),{read:async()=>undefined,write,writePart});
  const selected={...settings,splitParts:true},src={...source,text:'甲'.repeat(7200)},key=aiReadingKey(src,selected,[]),run=session.request(src,selected,[],undefined,undefined,state=>states.push(state)),rejected=expect(run).rejects.toMatchObject({name:'AbortError'});
  await writing.promise;await vi.waitFor(()=>expect(states.at(-1)?.done).toBe(4));session.cancel(key);release.resolve(false);await rejected;await Promise.resolve();expect(writePart).toHaveBeenCalledOnce();expect(write).not.toHaveBeenCalled();expect(session.get(key)).toBeUndefined();
 });
 it('rolls a nested child write and its LRU eviction back together on a native success-time abort',async()=>{
  const plan='review-nested-plan';expect(await writeAiPart(source,settings,[],plan,'0/0/0',response('A'))).toBe(true);
  const sample=(await rows())[0],value=sample.value as Record<string,unknown>,base=sample.key.slice(0,sample.key.lastIndexOf(':')+1);
  await db.settings.bulkPut(Array.from({length:100},(_,i)=>({key:base+i,value:{...value,partId:String(i),accessedAt:i}})));await db.settings.delete(sample.key);
  const before=await rows(),stop=new AbortController(),put=IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof put>){const request=put.apply(this,args);if(this.name==='settings'&&String((args[0] as {key?:string}).key).startsWith(AI_PART_CACHE_PREFIX))request.addEventListener('success',()=>stop.abort(),{once:true});return request;});
  expect(await writeAiPart(source,settings,[],plan,'0/1/1',response('B'),stop.signal)).toBe(false);expect(await rows()).toEqual(before);
 });
 it('preserves unknown child records at an exact key rather than overwriting their format',async()=>{
  const plan='review-child-schema';expect(await writeAiPart(source,settings,[],plan,'0/1',response('A'))).toBe(true);const row=(await rows())[0],unknown={version:'future-child',preserve:'synthetic'};await db.settings.put({...row,value:unknown});
  expect(await readAiParts(source,settings,[],plan)).toEqual([]);expect(await writeAiPart(source,settings,[],plan,'0/1',response('B'))).toBe(false);expect((await db.settings.get(row.key))?.value).toEqual(unknown);
 });
 it.each(['txt','epub'] as const)('shares actual %s sends across automatic session retries, and gives manual retry a separate work ID',async kind=>{
  vi.useFakeTimers();let fail=true;const send=vi.fn(async input=>{if(fail)throw new AiTranslateClientError('ai_auth_error','Synthetic permanent failure',401);return response(kind==='epub'?input.text:'FRESH');});
  const src={...source,id:'budget-'+kind,text:'SECRET_SOURCE_SENTINEL'},layout={path:'synthetic.xhtml',body:'<body/>',styles:[],nodes:[src.text]},session=kind==='txt'?new AiReadingSession(send):new EpubAiSession(undefined,send);
  const request=(automatic:boolean)=>session instanceof AiReadingSession?session.request(src,settings,[],undefined,undefined,undefined,{automatic}):session.request(src,settings,[],layout,undefined,undefined,{automatic});
  const limit=kind==='txt'?AI_CHAPTER_LIMITS.sends:EPUB_AI_CHAPTER_LIMITS.sends;
  for(let index=0;index<limit;index++)await expect(request(index>0)).rejects.toMatchObject({status:401});
  const workId=getAiRunMetrics().at(-1)!.workId;expect(workId).toMatch(/^[a-f0-9-]{36}$/);await expect(request(true)).rejects.toMatchObject({code:'ai_recovery_exhausted',reason:'send_limit'});expect(send).toHaveBeenCalledTimes(limit);
  const exhausted=getAiRunMetrics().find(row=>row.workId===workId);expect(exhausted).toMatchObject({requests:limit,attempts:limit+1,status:'error'});expect(JSON.stringify(exhausted)).not.toContain('SECRET_SOURCE_SENTINEL');
  fail=false;expect((await request(false)).finishReason).toBe('STOP');expect(send).toHaveBeenCalledTimes(limit+1);expect(getAiRunMetrics().at(-1)).toMatchObject({requests:1,attempts:1,status:'complete'});expect(getAiRunMetrics().at(-1)!.workId).not.toBe(workId);
 });
 it('automatic resume after cancel retains the original deadline, deduplicates, and rejects both late responses',async()=>{
  vi.useFakeTimers();vi.setSystemTime(0);const old=deferred<AiTranslateClientResponse>(),current=deferred<AiTranslateClientResponse>(),write=vi.fn(async()=>true);
  const send=vi.fn<()=>Promise<AiTranslateClientResponse>>(async():Promise<AiTranslateClientResponse>=>send.mock.calls.length===1?old.promise:send.mock.calls.length===2?current.promise:response('FRESH')),session=new AiReadingSession(send,{read:async()=>undefined,write}),src={...source,id:'cancel-budget',text:'synthetic'},key=aiReadingKey(src,settings,[]);
  const first=session.request(src,settings,[]),firstRejected=expect(first).rejects.toMatchObject({name:'AbortError'});await vi.advanceTimersByTimeAsync(200000);expect(send).toHaveBeenCalledOnce();session.cancel(key);await firstRejected;const workId=getAiRunMetrics().at(-1)!.workId;
  const resumed=session.request(src,settings,[],undefined,undefined,undefined,{automatic:true}),resumedRejected=expect(resumed).rejects.toMatchObject({code:'ai_recovery_exhausted',reason:'chapter_deadline'});expect(session.request(src,settings,[])).toBe(resumed);
  await vi.advanceTimersByTimeAsync(0);expect(send).toHaveBeenCalledTimes(2);old.resolve(response('STALE OLD'));await vi.advanceTimersByTimeAsync(0);expect(session.get(key)).toBeUndefined();expect(write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(40001);await resumedRejected;current.resolve(response('STALE RESUME'));await vi.advanceTimersByTimeAsync(0);expect(write).not.toHaveBeenCalled();expect(getAiRunMetrics().find(row=>row.workId===workId)).toMatchObject({attempts:2,requests:2,status:'error',durationMs:240000});
  expect((await session.request(src,settings,[])).result).toBe('FRESH');expect(write).toHaveBeenCalledOnce();expect(session.get(key)?.result).toBe('FRESH');expect(getAiRunMetrics().at(-1)!.workId).not.toBe(workId);
 });
});
