import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,AiReadingSession,aiReadingKey,type ReadingAiSettings} from '../src/features/ai/services/ai-reading';
import {aiTranslate,AiTranslateClientError,type AiTranslateClientRequest} from '../src/features/ai/services/ai-translate';
import {readAiReadingCache,writeAiReadingCache,readAiParts,writeAiPart,AI_PART_CACHE_PREFIX} from '../src/features/ai/services/ai-reading-cache';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {aiUserPromptPreview,DEFAULT_SECOND_HALF_PROMPT,LEGACY_SECOND_HALF_PROMPT} from '../src/features/ai/services/ai-hybrid-prompt';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {EPUB_AI_CHAPTER_LIMITS} from '../src/features/ai/services/ai-job';
import {hybridSampleHash} from '../src/features/ai/services/ai-hybrid';

const settings:ReadingAiSettings={...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[],hybrid:{version:1,liteModel:'gemini-3.5-flash-lite',rules:'Gọi anh; literal {{text}}.'}};
const source={bookId:'hybrid-review',id:'hybrid-review-chapter',revision:1,text:'甲'.repeat(1800)+'乙'.repeat(1800)};
const answer=(result:string,model:string)=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:1});
const cache={read:readAiReadingCache,write:writeAiReadingCache,readParts:readAiParts,writePart:writeAiPart};
const layout={path:'chapter.xhtml',nodes:[source.text],body:'<body><p><i>text</i><img src="cover.png"></p></body>',styles:[]};
beforeEach(async()=>{await db.delete();await db.open();await db.books.put({id:source.bookId,title:'Synthetic',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:source.text.length,chapterCount:1});await db.chapters.put({...source,order:0,title:'Chapter',sourceId:''});});
afterEach(()=>{vi.restoreAllMocks();resetAiKeyState();});

it.each(['txt','epub'])('hybrid review: short %s still sends saved addressing rules with priority model',async format=>{
 const requests:AiTranslateClientRequest[]=[],send=async(req:AiTranslateClientRequest)=>{requests.push(req);return answer(format==='epub'?req.text:'Short',req.model!);};
 const short={...source,text:'短章'};
 if(format==='txt'){const session=new AiReadingSession(send);try{await session.request(short,settings,[]);}finally{session.clear();}}
 else{const session=new EpubAiSession(undefined,send);try{await session.request(short,settings,[],{...layout,nodes:[short.text]});}finally{session.clear();}}
 expect(requests).toHaveLength(1);expect(requests[0].model).toBe('gemini-2.5-flash');expect(requests[0].continuation).toBeUndefined();expect(requests[0].addressingRules).toBe(settings.hybrid!.rules);
});

it('hybrid review: reload preserves first-half child and its pinned model, then supplies full recovered sample',async()=>{
 let fail=true;const calls:AiTranslateClientRequest[]=[],send=async(req:AiTranslateClientRequest)=>{
  calls.push(req);if(req.continuation){expect(req.continuation.sample).toBe('A\nB');return answer('C',req.model!);}
  if(req.text.length===1800)throw new AiTranslateClientError('ai_incomplete_result','Synthetic truncation',502,'output_limit');
  if(calls.filter(r=>!r.continuation&&r.text.length===900).length===1)return answer('A',req.model!);
  if(fail)throw new AiTranslateClientError('ai_auth_error','Synthetic stop',403);
  return answer('B',req.model!);
 };
 const first=new AiReadingSession(send,cache);await expect(first.request(source,settings,[])).rejects.toThrow();first.clear();const before=calls.length;fail=false;
 const resumed=new AiReadingSession(send,cache);try{const result=await resumed.request(source,settings,[]);expect(result.result).toBe('A\nB\nC');expect(result.halves?.models).toEqual(['gemini-2.5-flash','gemini-3.5-flash-lite']);expect(calls.slice(before).map(r=>r.text.length)).toEqual([900,1800]);}finally{resumed.clear();}
});

it('hybrid review: EPUB reload keeps full readable sample and original node mapping',async()=>{
 let fail=true,firstCalls=0,secondCalls=0;const send=async(req:AiTranslateClientRequest)=>{
  const row=JSON.parse(req.text);if(!req.continuation){firstCalls++;return answer(JSON.stringify(Object.fromEntries(Object.keys(row).map(k=>[k,'A {{text}}']))),req.model!);}
  secondCalls++;expect(req.continuation.sample).toBe('A {{text}}');if(fail)throw new AiTranslateClientError('ai_auth_error','Synthetic stop',403);
  return answer(JSON.stringify(Object.fromEntries(Object.keys(row).map(k=>[k,'B']))),req.model!);
 };
 const first=new EpubAiSession(cache,send);await expect(first.request(source,settings,[],layout)).rejects.toThrow();first.clear();fail=false;
 const resumed=new EpubAiSession(cache,send);try{const result=await resumed.request(source,settings,[],layout);expect(result.nodes).toEqual(['A {{text}}B']);expect(firstCalls).toBe(1);expect(secondCalls).toBe(2);expect((await readAiReadingCache(source,settings,[]))?.halves).toEqual(result.halves);}finally{resumed.clear();}
});

it('hybrid review: cancelled second-half response cannot overwrite a replacement same-key job',async()=>{
 let calls=0,release!:(r:ReturnType<typeof answer>)=>void;const send=async(req:AiTranslateClientRequest)=>{calls++;if(!req.continuation)return answer('First',req.model!);if(calls===2)return new Promise<ReturnType<typeof answer>>(r=>release=r);return answer('Replacement',req.model!);};
 const session=new AiReadingSession(send,cache),old=session.request(source,settings,[]).catch(e=>e);await vi.waitFor(()=>expect(calls).toBe(2));session.cancel(aiReadingKey(source,settings,[]));
 const replacement=session.request(source,settings,[]);release(answer('Stale','gemini-3.5-flash-lite'));try{expect((await old).name).toBe('AbortError');expect((await replacement).result).toBe('First\nReplacement');expect((await readAiReadingCache(source,settings,[]))?.result).toBe('First\nReplacement');}finally{session.clear();}
});

it('hybrid review: second stage consumes the original chapter send budget',async()=>{
 const old=EPUB_AI_CHAPTER_LIMITS.sends;EPUB_AI_CHAPTER_LIMITS.sends=1;const calls:AiTranslateClientRequest[]=[],session=new AiReadingSession(async req=>{calls.push(req);return answer('First',req.model!);},cache);
 try{await expect(session.request(source,settings,[])).rejects.toMatchObject({code:'ai_recovery_exhausted',reason:'send_limit'});expect(calls).toHaveLength(1);expect(await readAiReadingCache(source,settings,[])).toBeUndefined();}finally{session.clear();EPUB_AI_CHAPTER_LIMITS.sends=old;}
});

it('hybrid review: deletion before stage two commits prevents original-source checkpoint and final publication',async()=>{
 const session=new AiReadingSession(async req=>{if(req.continuation)await db.chapters.delete(source.id);return answer(req.continuation?'Second':'First',req.model!);},cache);
 try{await session.request(source,settings,[]);expect(await readAiReadingCache(source,settings,[])).toBeUndefined();expect(await db.chapters.get(source.id)).toBeUndefined();const rows=await db.settings.toArray();expect(rows.filter(r=>JSON.stringify(r.value).includes('Second'))).toHaveLength(0);}finally{session.clear();}
});

it('hybrid review: real prompt preview matches server rendering for legacy {name} alias',async()=>{
 const body={text:'TARGET',model:'gemini-3.5-flash-lite',systemPrompt:'System',names:{林儿:'Lâm Nhi'},userPromptTemplate:'{name}\n{{text}}',continuation:{version:1 as const,sample:'Mẫu {{text}}',rules:''}};let actual='';
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{actual=JSON.parse(String(init!.body)).contents[0].parts[0].text;return Response.json({candidates:[{content:{parts:[{text:'Result'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:1}});});
 const response=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{GEMINI_API_KEY:'synthetic-only'});expect(response.status).toBe(200);expect(aiUserPromptPreview(body)).toBe(actual);
});

it('hybrid review: legacy 3.5 Lite still aliases default outside continuation',async()=>{
 let endpoint='';vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>{endpoint=String(url);return Response.json({candidates:[{content:{parts:[{text:'Result'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:1}});});
 const response=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Target',model:'gemini-3.5-flash-lite'})}),{GEMINI_API_KEY:'synthetic-only'});expect(response.status).toBe(200);expect(endpoint).toContain('/models/gemini-3.5-flash:generateContent');expect(await response.json()).toMatchObject({model:'gemini-3.5-flash-lite'});
});

it('hybrid v2 review: changing only second prompt resumes incomplete first-half checkpoint',async()=>{
 const text='甲'.repeat(32000)+'乙'.repeat(32000)+'丙'.repeat(64000),input={...source,text};await db.chapters.update(source.id,{text});let fail=true,firstCalls=0;const calls:AiTranslateClientRequest[]=[];
 const send=async(req:AiTranslateClientRequest)=>{calls.push(req);if(req.continuation){expect(req.continuation.version).toBe(3);if(req.continuation.version===3)expect(req.continuation.promptTemplate).toContain('CUSTOM_SECOND');expect(req.continuation.sample).toBe('A\nB');return answer('C',req.model!);}firstCalls++;if(req.text.startsWith('甲'))return answer('A',req.model!);if(fail)throw new AiTranslateClientError('ai_auth_error','Synthetic stop',403);return answer('B',req.model!);};
 const first=new AiReadingSession(send,cache);await expect(first.request(input,settings,[])).rejects.toThrow();first.clear();fail=false;
 const selected={...settings,hybrid:{...settings.hybrid!,secondHalfPrompt:DEFAULT_SECOND_HALF_PROMPT+'\nCUSTOM_SECOND'}};
 const resumed=new AiReadingSession(send,cache);try{expect((await resumed.request(input,selected,[])).result).toBe('A\nB\nC\nC');expect(firstCalls).toBe(3);expect(calls.filter(r=>r.text.startsWith('甲'))).toHaveLength(1);}finally{resumed.clear();}
});

it('hybrid v2 review: EPUB second-prompt edit reuses first stage and enforces target IDs',async()=>{
 const inputLayout={...layout,nodes:['甲'.repeat(1800),'乙'.repeat(1800)]},frozen=JSON.stringify(inputLayout);let firstCalls=0,secondCalls=0;const prompts:string[]=[];
 const send=async(req:AiTranslateClientRequest)=>{const row=JSON.parse(req.text);expect(Object.keys(row)).toEqual(['0']);if(req.continuation){secondCalls++;expect(req.continuation.version).toBe(3);expect(req.continuation.sample).toBe('A');prompts.push(aiUserPromptPreview(req));return answer('{"0":"B"}',req.model!);}firstCalls++;return answer('{"0":"A"}',req.model!);};
 for(const prompt of [DEFAULT_SECOND_HALF_PROMPT,DEFAULT_SECOND_HALF_PROMPT+'\nCUSTOM_EPUB_SECOND']){const selected={...settings,hybrid:{...settings.hybrid!,secondHalfPrompt:prompt}},session=new EpubAiSession(cache,send);try{expect((await session.request(source,selected,[],inputLayout)).nodes).toEqual(['A','B']);}finally{session.clear();}}
 expect(firstCalls).toBe(1);expect(secondCalls).toBe(2);expect(prompts[1]).toContain('CUSTOM_EPUB_SECOND');expect(JSON.stringify(inputLayout)).toBe(frozen);
});

it('hybrid v2 review: rendered bound rejects full data without truncation on both client and server',async()=>{
 const body={text:'x'.repeat(32000),model:'gemini-3.5-flash-lite',continuation:{version:2 as const,sample:'s'.repeat(96000),rules:'',promptTemplate:LEGACY_SECOND_HALF_PROMPT}},spy=vi.spyOn(globalThis,'fetch');
 expect(new TextEncoder().encode(JSON.stringify(body)).byteLength).toBeLessThan(256*1024);
 await expect(aiTranslate(body)).rejects.toMatchObject({code:'prompt_too_large'});expect(spy).not.toHaveBeenCalled();
 const response=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{GEMINI_API_KEY:'synthetic-only'});expect(response.status).toBe(413);expect(spy).not.toHaveBeenCalled();
});

it('hybrid v2 review: Vietnamese aliases keep Name, sample, source and rules placeholders inert',async()=>{
 const body={text:'TARGET {{bản dịch nửa đầu}} {{name}}',model:'gemini-3.5-flash-lite',names:{甲:'A {{text nửa sau}}'},continuation:{version:2 as const,sample:'SAMPLE {{text}} {name}',rules:'RULES {{name}}',promptTemplate:'{{name}}\n{{bản dịch nửa đầu}}\n{{rules}}\n{{text nửa sau}}'}};let actual='';
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{actual=JSON.parse(String(init!.body)).contents[0].parts[0].text;return Response.json({candidates:[{content:{parts:[{text:'Result'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:1}});});
 const response=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{GEMINI_API_KEY:'synthetic-only'});expect(response.status).toBe(200);expect(actual).toBe(aiUserPromptPreview(body));expect(actual.split(body.text)).toHaveLength(2);expect(actual.split(JSON.stringify(body.continuation.sample))).toHaveLength(2);expect(actual).toContain('A {{text nửa sau}}');expect(actual).toContain('RULES {{name}}');
});

it('hybrid compat review: EPUB reads only legacy first stage and never reuses legacy second stage',async()=>{
 const inputLayout={...layout,nodes:['甲'.repeat(1800),'乙'.repeat(1800)]},plan=JSON.stringify(['epub',inputLayout.path,inputLayout.nodes,1]),sample='Old first';
 const oldKey=JSON.stringify([source.bookId,source.id,source.revision,source.text,settings,[]]);
 const seed=async(stagePlan:string,result:string,model:string)=>{const cachePlan=JSON.stringify(['hybrid-halves-1',stagePlan,'complete']),digest=await hybridSampleHash(JSON.stringify([oldKey,cachePlan])),row={key:AI_PART_CACHE_PREFIX+digest+':9999',value:{version:'parts-1',bookId:source.bookId,chapterId:source.id,digest,partId:'9999',accessedAt:1,response:answer(result,model)}};await db.settings.put(row);return row;};
 const oldFirst=await seed(JSON.stringify([plan,0]),JSON.stringify({'0':sample}),'gemini-2.5-flash');
 const oldSecond=await seed(JSON.stringify([plan,1,await hybridSampleHash(sample)]),JSON.stringify({'0':'Stale second'}),'gemini-3.5-flash-lite');
 const calls:AiTranslateClientRequest[]=[],session=new EpubAiSession(cache,async req=>{calls.push(req);expect(req.continuation?.version).toBe(3);expect(req.continuation?.sample).toBe(sample);return answer('{"0":"Fresh second"}',req.model!);});
 try{const result=await session.request(source,settings,[],inputLayout);expect(result.nodes).toEqual(['Old first','Fresh second']);expect(calls).toHaveLength(1);expect(await db.settings.get(oldFirst.key)).toEqual(oldFirst);expect(await db.settings.get(oldSecond.key)).toEqual(oldSecond);}finally{session.clear();}
});
