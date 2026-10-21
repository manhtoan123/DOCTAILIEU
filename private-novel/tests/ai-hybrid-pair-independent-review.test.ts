import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,AiReadingSession,type ReadingAiSettings} from '../src/features/ai/services/ai-reading';
import {aiTranslate,type AiTranslateClientRequest} from '../src/features/ai/services/ai-translate';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {readAiReadingCache,writeAiReadingCache,readAiParts,writeAiPart} from '../src/features/ai/services/ai-reading-cache';
import {DEFAULT_SECOND_HALF_PROMPT,LEGACY_SECOND_HALF_PROMPT,aiUserPromptPreview} from '../src/features/ai/services/ai-hybrid-prompt';
import {runHybridStages} from '../src/features/ai/services/ai-hybrid';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';

const source={bookId:'pair-review-book',id:'pair-review-chapter',revision:1,text:'甲'.repeat(1800)+'乙'.repeat(1800)};
const settings:ReadingAiSettings={...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[],hybrid:{version:1,liteModel:'gemini-3.5-flash-lite',rules:'',secondHalfPrompt:'{{name}}\n{{firstHalfTranslation}}\n{{text}}'}};
const cache={read:readAiReadingCache,write:writeAiReadingCache,readParts:readAiParts,writePart:writeAiPart};
const answer=(result:string,model:string)=>({result,model,finishReason:'STOP' as const,inputTokens:1,outputTokens:2});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {resolve,promise};};
beforeEach(async()=>{resetAiKeyState();await db.delete();await db.open();await db.books.put({id:source.bookId,title:'Synthetic',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:source.text.length,chapterCount:1});await db.chapters.put({...source,order:0,title:'Synthetic',sourceId:''});});
afterEach(()=>{vi.restoreAllMocks();resetAiKeyState();});

it('pair reviewer: EPUB references preserve ordered source/translation pieces and expose no layout data',async()=>{
 const text='甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800)+'丁'.repeat(1800),layout={path:'secret-chapter.xhtml',nodes:[text],body:'<body><img src="private-image.png"><script>privateDOM</script></body>',styles:[{path:'private-style.css',text:'.privateCSS{}'}]},firstText:string[]=[],firstTranslation:string[]=[],calls:AiTranslateClientRequest[]=[];
 const translated=(s:string)=>'Dịch '+({甲:'A',乙:'B',丙:'C',丁:'D'} as Record<string,string>)[s[0]].repeat(s.length);
 const session=new EpubAiSession(undefined,async req=>{calls.push(req);const entries=Object.entries(JSON.parse(req.text)) as [string,string][];
  if(!req.continuation){firstText.push(...entries.map(([,s])=>s));firstTranslation.push(...entries.map(([,s])=>translated(s)));}
  else{expect(req.continuation.version).toBe(3);if(req.continuation.version===3)expect(req.continuation.firstHalfSource).toBe(firstText.join('\n'));expect(req.continuation.sample).toBe(firstTranslation.join('\n'));expect(JSON.stringify(req.continuation)).not.toMatch(/privateDOM|private-image|private-style|privateCSS|secret-chapter/);}
  return answer(JSON.stringify(Object.fromEntries(entries.map(([id,s])=>[id,translated(s)]))),req.model!);
 });
 try{const before=JSON.stringify(layout),result=await session.request({...source,text},settings,[],layout);expect(firstText.join('')).toBe(text.slice(0,3600));expect(calls.filter(r=>r.continuation)).toHaveLength(1);expect(result.nodes).toHaveLength(1);expect(result.nodes[0]).toBe(['A','B','C','D'].map(s=>'Dịch '+s.repeat(1800)).join(''));expect(JSON.stringify(layout)).toBe(before);}finally{session.clear();}
});

it('pair reviewer: second-stage source hash separates equal samples while first stage remains reusable',async()=>{
 const memory=new Map(),signal=new AbortController().signal;let firstCalls=0,secondCalls=0;
 for(const reference of ['Source A','Source B','Source B']){
  await runHybridStages(source,settings,[],'fixed-range-plan',memory,cache,signal,reference,async(index,selected,stageCache)=>{
   const hit=await stageCache.read(source,selected,[],signal);if(hit)return hit;
   const result=index?(secondCalls++,answer('Translated '+reference,selected.model)):(firstCalls++,answer('Same first sample',selected.model));
   await stageCache.write(source,selected,[],result,signal);return result;
  },()=>{});
 }
 expect(firstCalls).toBe(1);expect(secondCalls).toBe(2);
});

it('pair reviewer: cancellation during new source hashing never opens the second stage',async()=>{
 const entered=deferred<void>(),release=deferred<void>(),controller=new AbortController(),digest=crypto.subtle.digest.bind(crypto.subtle);let hashes=0,runs=0;
 vi.spyOn(crypto.subtle,'digest').mockImplementation(async(algorithm,input)=>{if(++hashes===2){entered.resolve();await release.promise;}return digest(algorithm,input);});
 const pending=runHybridStages(source,settings,[],'plan',new Map(),undefined,controller.signal,source.text.slice(0,1800),async(_index,selected)=>{runs++;return answer('First',selected.model);},()=>{}).catch(e=>e);
 await entered.promise;controller.abort();release.resolve();expect((await pending).name).toBe('AbortError');expect(runs).toBe(1);
});

it('pair reviewer: quoted source expansion is counted before upstream despite raw reference bounds passing',async()=>{
 const body={text:'Target',model:'gemini-3.5-flash-lite',continuation:{version:3 as const,firstHalfSource:'"'.repeat(70000),sample:'t'.repeat(10000),rules:'',promptTemplate:DEFAULT_SECOND_HALF_PROMPT}},spy=vi.spyOn(globalThis,'fetch');
 expect(new TextEncoder().encode(JSON.stringify(body)).byteLength).toBeLessThan(256*1024);expect(aiUserPromptPreview(body).length).toBeGreaterThan(128000);
 await expect(aiTranslate(body)).rejects.toMatchObject({code:'prompt_too_large'});
 const response=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{GEMINI_API_KEY:'synthetic-only'});expect(response.status).toBe(413);expect(spy).not.toHaveBeenCalled();
});

it('pair reviewer: oversize paired prompt preserves first-stage work across reload without sending Lite',async()=>{
 const spy=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json(answer('"'.repeat(65000),'gemini-2.5-flash')));
 for(let attempt=0;attempt<2;attempt++){const session=new AiReadingSession(aiTranslate,cache);try{await expect(session.request(source,settings,[])).rejects.toMatchObject({code:'prompt_too_large'});}finally{session.clear();}}
 expect(spy).toHaveBeenCalledTimes(1);expect(await readAiReadingCache(source,settings,[])).toBeUndefined();expect(JSON.parse(String(spy.mock.calls[0][1]?.body)).continuation).toBeUndefined();
});

it.each([1,2] as const)('pair reviewer: legacy API v%s remains operational without a first-source field',async version=>{
 const continuation=version===1?{version:1 as const,sample:'Old sample',rules:''}:{version:2 as const,sample:'Old sample',rules:'',promptTemplate:LEGACY_SECOND_HALF_PROMPT},body={text:'Target',model:'gemini-3.5-flash-lite',continuation};let actual='';
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{actual=JSON.parse(String(init!.body)).contents[0].parts[0].text;return Response.json({candidates:[{content:{parts:[{text:'Result'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:2}});});
 const response=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{GEMINI_API_KEY:'synthetic-only'});expect(response.status).toBe(200);expect(actual).toBe(aiUserPromptPreview(body));expect(actual).not.toContain('[NGUỒN NỬA ĐẦU');
});
