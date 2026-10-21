import 'fake-indexeddb/auto';
import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {AI_DEFAULTS,AiReadingSession,readReadingAiSettings,type ReadingAiSettings} from '../src/features/ai/services/ai-reading';
import {AiTranslateClientError,aiTranslate,type AiTranslateClientRequest} from '../src/features/ai/services/ai-translate';
import {readAiReadingCache,writeAiReadingCache,readAiParts,writeAiPart} from '../src/features/ai/services/ai-reading-cache';
import {hybridStageCache,hybridSampleHash} from '../src/features/ai/services/ai-hybrid';
import {aiUserPromptPreview} from '../src/features/ai/services/ai-hybrid-prompt';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {db} from '../src/core/db';
import {EPUB_AI_CHAPTER_LIMITS} from '../src/features/ai/services/ai-job';
const settings:ReadingAiSettings={...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[],hybrid:{version:1,liteModel:'gemini-3.1-flash-lite',rules:'Người kể gọi anh; {{text}} là chữ nguyên văn.'}};
const source={bookId:'hybrid-book',id:'hybrid-chapter',revision:1,text:'林儿'+'甲'.repeat(1798)+'乙'.repeat(1800)};
const names=[{key:'林儿',value:'Lâm Nhi'}];
const answer=(result:string,model:string)=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:2});
const cache={read:readAiReadingCache,write:writeAiReadingCache,readParts:readAiParts,writePart:writeAiPart};
beforeEach(async()=>{await db.delete();await db.open();await db.books.put({id:source.bookId,title:'Synthetic',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:source.text.length,chapterCount:1});await db.chapters.put({...source,order:0,title:'Chapter',sourceId:''});});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();resetAiKeyState();});
it('keeps default off and restores only validated user hybrid settings',()=>{
 expect(readReadingAiSettings(AI_DEFAULTS).hybrid).toBeUndefined();expect(readReadingAiSettings(settings).hybrid).toEqual(settings.hybrid);
 expect(readReadingAiSettings({...settings,hybrid:{...settings.hybrid,liteModel:'unknown'},continuation:{version:1,sample:'x',rules:''}})).not.toHaveProperty('continuation');
 expect(readReadingAiSettings({...settings,hybrid:{...settings.hybrid,liteModel:'unknown'}}).hybrid).toBeUndefined();
});
it('waits for the whole first half; forwards full sample, Name union, rules and actual models',async()=>{
 const calls:AiTranslateClientRequest[]=[],progress:string[]=[];let release!:()=>void;const held=new Promise<void>(r=>release=r),sample='Bản đầu {{text}} '+ 'mẫu '.repeat(2100);
 const session=new AiReadingSession(async req=>{calls.push(req);if(!req.continuation){await held;return answer(sample,req.model!);}expect(req.continuation.sample).toBe(sample);expect(req.names).toEqual({'林儿':'Lâm Nhi'});return answer('Bản sau',req.model!);},cache);
 const pending=session.request(source,settings,names,undefined,undefined,p=>progress.push(p.text));await vi.waitFor(()=>expect(calls).toHaveLength(1));release();const result=await pending;
 expect(calls.map(c=>c.text).join('')).toBe(source.text);expect(calls[0].addressingRules).toBe(settings.hybrid!.rules);
 expect(calls[0].userPromptTemplate).toBe(settings.userPromptTemplate);expect(result.model).toBe('hybrid');expect(result.halves?.models).toEqual(['gemini-2.5-flash','gemini-3.1-flash-lite']);expect(result.halves?.sampleHash).toBe(await hybridSampleHash(sample));expect(progress).toContain(sample+'\n');
 expect(await readAiReadingCache(source,settings,names)).toEqual(result);expect((await db.chapters.get(source.id))?.text).toBe(source.text);session.clear();
});
it('does not call Lite when first half fails; short chapter makes one priority request',async()=>{
 const calls:string[]=[];const session=new AiReadingSession(async req=>{calls.push(req.model!);throw new AiTranslateClientError('ai_auth_error','invalid',403);});
 await expect(session.request(source,settings,[])).rejects.toThrow();expect(calls).toEqual(['gemini-2.5-flash']);session.clear();
 const short=new AiReadingSession(async req=>{expect(req.continuation).toBeUndefined();return answer('Short',req.model!);});expect((await short.request({...source,text:'短章'},settings,[])).model).toBe('gemini-2.5-flash');short.clear();
});
it('reload reuses completed first half and sends only the missing second half',async()=>{
 let firstCalls=0,secondCalls=0,fail=true;const send=async(req:AiTranslateClientRequest)=>{if(!req.continuation){firstCalls++;return answer('First full sample',req.model!);}secondCalls++;if(fail)throw new AiTranslateClientError('ai_auth_error','invalid',403);return answer('Second',req.model!);};
 const first=new AiReadingSession(send,cache);await expect(first.request(source,settings,[])).rejects.toThrow();first.clear();expect(await readAiReadingCache(source,settings,[])).toBeUndefined();
 fail=false;const resumed=new AiReadingSession(send,cache);expect((await resumed.request(source,settings,[])).result).toBe('First full sample\nSecond');expect(firstCalls).toBe(1);expect(secondCalls).toBe(2);resumed.clear();
});
it('separates a second-half checkpoint by hash of the entire sample',async()=>{
 const memory=new Map(),a=hybridStageCache(source,settings,names,'stage2-hash-A',memory,cache,['gemini-3.1-flash-lite']),b=hybridStageCache(source,settings,names,'stage2-hash-B',memory,cache,['gemini-3.1-flash-lite']);
 await a.write(source,settings,names,answer('Old second','gemini-3.1-flash-lite'));expect(await b.read(source,settings,names)).toBeUndefined();expect(await a.read(source,settings,names)).toMatchObject({result:'Old second'});
 const c=hybridStageCache(source,settings,names,'stage2-hash-A',new Map(),cache,['gemini-2.5-flash']);expect(await c.read(source,settings,names)).toBeUndefined();
});
it('late provider result after cancellation cannot open Lite or publish final cache',async()=>{
 let release!:(value:ReturnType<typeof answer>)=>void;const calls:string[]=[];const session=new AiReadingSession(req=>{calls.push(req.model!);return new Promise(r=>release=r);},cache);
 const run=session.request(source,settings,[]).catch(e=>e);await vi.waitFor(()=>expect(calls).toHaveLength(1));session.clear();release(answer('Late','gemini-2.5-flash'));expect((await run).name).toBe('AbortError');expect(calls).toHaveLength(1);expect(await readAiReadingCache(source,settings,[])).toBeUndefined();
});
it('EPUB joins the same original node without inserted separators and preserves layout',async()=>{
 const text='甲'.repeat(1800)+'乙'.repeat(1800),layout={path:'chapter.xhtml',nodes:[text],body:'<body><p><i>text</i><img src="cover.png"></p></body>',styles:[]};const frozen=JSON.stringify(layout),calls:AiTranslateClientRequest[]=[];
 const epub=new EpubAiSession(undefined,async req=>{calls.push(req);const row=JSON.parse(req.text),translated=Object.fromEntries(Object.keys(row).map(k=>[k,req.continuation?'B':'A']));if(req.continuation)expect(req.continuation.sample).toBe('A');return answer(JSON.stringify(translated),req.model!);});
 const result=await epub.request({...source,text},settings,[],layout);expect(result.nodes).toEqual(['AB']);expect(result.halves?.models).toEqual(['gemini-2.5-flash','gemini-3.1-flash-lite']);expect(calls).toHaveLength(2);expect(JSON.stringify(layout)).toBe(frozen);epub.clear();
});
it('server and preview preserve literal placeholders inside rules/sample; call exact Lite endpoint',async()=>{
 const continuation={version:1 as const,sample:'MẪU {{text}} [SOURCE TEXT]','rules':'anh {{name}}'},body={text:'TARGET ONLY',model:'gemini-3.5-flash-lite',continuation,userPromptTemplate:'{{name}} {{text}}',names:{林儿:'Lâm Nhi'},systemPrompt:'System'};
 let googleBody='';const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{expect(String(url)).toContain('/models/gemini-3.5-flash-lite:generateContent');googleBody=String(init!.body);return Response.json({candidates:[{content:{parts:[{text:'Result'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:2,candidatesTokenCount:3}});});
 const r=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{GEMINI_API_KEY:'synthetic-only'});expect(r.status).toBe(200);expect(spy).toHaveBeenCalledOnce();expect(JSON.parse(googleBody).contents[0].parts[0].text).toBe(aiUserPromptPreview(body));expect(aiUserPromptPreview(body).match(/TARGET ONLY/g)).toHaveLength(1);
});
it.each([{sample:'x'.repeat(96001),rules:'',version:1},{sample:'ok',rules:'x'.repeat(2001),version:1},{sample:'',rules:'',version:1}])('rejects malformed continuation before Google %#',async continuation=>{
 const spy=vi.spyOn(globalThis,'fetch');const r=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'t',model:'gemini-3.1-flash-lite',continuation})}),{GEMINI_API_KEY:'synthetic-only'});expect([400,413]).toContain(r.status);expect(spy).not.toHaveBeenCalled();
});
it('client rejects oversized sample bytes and wrong literal Lite response before accepting it',async()=>{
 const spy=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json(answer('wrong','gemini-3.5-flash')));
 await expect(aiTranslate({text:'target',model:'gemini-3.5-flash-lite',continuation:{version:1,sample:'汉'.repeat(90000),rules:''}})).rejects.toMatchObject({code:'prompt_too_large'});expect(spy).not.toHaveBeenCalled();
 await expect(aiTranslate({text:'target',model:'gemini-3.5-flash-lite',continuation:{version:1,sample:'Sample',rules:''}})).rejects.toMatchObject({code:'ai_invalid_response'});
});
it('shares one network send budget across both halves',async()=>{
 const old=EPUB_AI_CHAPTER_LIMITS.sends;EPUB_AI_CHAPTER_LIMITS.sends=1;const calls:AiTranslateClientRequest[]=[];
 const session=new AiReadingSession(async req=>{calls.push(req);return answer('Complete first fragment',req.model!);});
 try{await expect(session.request({...source,text:'甲'.repeat(7200)},settings,[])).rejects.toMatchObject({code:'ai_recovery_exhausted',reason:'send_limit'});expect(calls).toHaveLength(1);expect(calls.every(r=>!r.continuation)).toBe(true);}finally{session.clear();EPUB_AI_CHAPTER_LIMITS.sends=old;}
});
it('source revision edit prevents durable hybrid publication and leaves the edit intact',async()=>{
 const session=new AiReadingSession(async req=>{if(req.continuation)await db.chapters.update(source.id,{revision:2,text:'Edited source'});return answer(req.continuation?'Second':'First',req.model!);},cache);
 await session.request(source,settings,[]);expect(await readAiReadingCache(source,settings,[])).toBeUndefined();expect((await db.chapters.get(source.id))?.text).toBe('Edited source');session.clear();
});
