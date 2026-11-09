import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {AI_DEFAULTS,AiReadingSession,type ReadingAiSettings} from '../src/features/ai/services/ai-reading';
import {aiTranslate,type AiTranslateClientRequest} from '../src/features/ai/services/ai-translate';
import {DEFAULT_SECOND_HALF_PROMPT,LEGACY_SECOND_HALF_PROMPT,AI_HYBRID_SOURCE_CHARS,aiUserPromptPreview,secondHalfTemplateValid,validContinuation} from '../src/features/ai/services/ai-hybrid-prompt';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {hybridSampleHash,hybridResult} from '../src/features/ai/services/ai-hybrid';
import {readAiReadingCache,writeAiReadingCache,readAiParts,writeAiPart,AI_READING_CACHE_PREFIX,AI_PART_CACHE_PREFIX} from '../src/features/ai/services/ai-reading-cache';
const source={bookId:'pair-book',id:'pair-chapter',revision:1,text:'甲'.repeat(3000)+'乙'.repeat(3000)};
const template='{{name}}\n{{firstHalfTranslation}}\n[TARGET]\n{{text}}';
const settings:ReadingAiSettings={...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[],hybrid:{version:1,liteModel:'gemini-3.5-flash-lite',rules:'',secondHalfPrompt:template}};
const cache={read:readAiReadingCache,write:writeAiReadingCache,readParts:readAiParts,writePart:writeAiPart};
const answer=(result:string,model='gemini-3.5-flash-lite')=>({result,model,finishReason:'STOP' as const,inputTokens:1,outputTokens:2});
const continuation={version:3 as const,firstHalfSource:'ORIGINAL {{text}}\n原文',sample:'TRANSLATED {{name}}\nBản dịch',rules:'',promptTemplate:DEFAULT_SECOND_HALF_PROMPT};
beforeEach(async()=>{resetAiKeyState();await db.delete();await db.open();await db.books.put({id:source.bookId,title:'Synthetic',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:source.text.length,chapterCount:1});await db.chapters.put({...source,bookId:source.bookId,order:0,title:'Synthetic',sourceId:''});});
afterEach(async()=>{vi.restoreAllMocks();await db.delete();});
it.each(['firstHalfSource','text nửa đầu','nguồn nửa đầu','text nửa trước',undefined])('v3 sends a complete quoted pair exactly once for source alias %s',async alias=>{
 const promptTemplate=alias?`{{name}}\n{{${alias}}}\n{{firstHalfTranslation}}\n{{text}}`:template;
 const body={text:'ONLY_TARGET {{firstHalfSource}}',names:{甲:'Name {{text}}'},model:'gemini-3.5-flash-lite',continuation:{...continuation,promptTemplate}};let actual='';
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{actual=JSON.parse(String(init!.body)).contents[0].parts[0].text;return Response.json({candidates:[{content:{parts:[{text:'Done'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:2}});});
 const response=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{GEMINI_API_KEY:'synthetic-only'});
 expect(response.status).toBe(200);expect(actual).toBe(aiUserPromptPreview(body));expect(actual.split(JSON.stringify(continuation.firstHalfSource))).toHaveLength(2);expect(actual.split(JSON.stringify(continuation.sample))).toHaveLength(2);expect(actual.split(body.text)).toHaveLength(2);expect(actual).toContain('Name {{text}}');
});
it('counts source aliases together and keeps a genuine legacy v2 template valid',()=>{
 expect(secondHalfTemplateValid(template)).toBe(true);expect(secondHalfTemplateValid(DEFAULT_SECOND_HALF_PROMPT)).toBe(true);
 expect(secondHalfTemplateValid(template+'{{firstHalfSource}}{{text nửa đầu}}')).toBe(false);
 expect(validContinuation({version:2,sample:'Sample',rules:'',promptTemplate:LEGACY_SECOND_HALF_PROMPT})).toBe(true);
 expect(validContinuation({...continuation,version:2})).toBe(false);
});
it.each([undefined,null,7,'',' \n', 'x'.repeat(AI_HYBRID_SOURCE_CHARS+1)])('invalid v3 original source fails before upstream %#',async firstHalfSource=>{
 const body={text:'Target',model:'gemini-3.5-flash-lite',continuation:{...continuation,firstHalfSource}},spy=vi.spyOn(globalThis,'fetch');
 await expect(aiTranslate(body as AiTranslateClientRequest)).rejects.toMatchObject({code:'invalid_prompt'});
 const response=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{GEMINI_API_KEY:'synthetic-only'});expect(response.status).toBe(400);expect(spy).not.toHaveBeenCalled();
});
it.each([
 {firstHalfSource:'s'.repeat(70000),sample:'t'.repeat(60000)},
 {firstHalfSource:'汉'.repeat(80000),sample:'t'.repeat(30000)}
])('combined reference bounds reject without truncating the pair %#',async pair=>{
 const body={text:'Target',model:'gemini-3.5-flash-lite',continuation:{...continuation,...pair}},spy=vi.spyOn(globalThis,'fetch');
 await expect(aiTranslate(body)).rejects.toMatchObject({code:'prompt_too_large'});
 const response=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{GEMINI_API_KEY:'synthetic-only'});expect(response.status).toBe(413);expect(spy).not.toHaveBeenCalled();
});
it('v3 misses a complete v2 result, reuses its first-stage checkpoint and retains the old rows',async()=>{
 const legacySettings={...settings,hybrid:{...settings.hybrid!,secondHalfPrompt:template}},oldKey=JSON.stringify([source.bookId,source.id,source.revision,source.text,legacySettings,[]]);
 const first=answer('Old first','gemini-2.5-flash'),sampleHash=await hybridSampleHash(first.result),wholeDigest=await hybridSampleHash(oldKey);
 const whole={key:AI_READING_CACHE_PREFIX+wholeDigest,value:{version:1,bookId:source.bookId,chapterId:source.id,digest:wholeDigest,accessedAt:1,response:hybridResult(first,answer('Stale second'),sampleHash)}};
 const {hybrid,...normal}=settings,firstKey=JSON.stringify([source.bookId,source.id,source.revision,source.text,{...normal,addressingRules:hybrid!.rules},{}]);
 const stage=JSON.stringify([JSON.stringify(['txt',3000]),0]),plan=JSON.stringify(['hybrid-halves-1',stage,'complete']),digest=await hybridSampleHash(JSON.stringify([firstKey,plan]));
 const firstRow={key:AI_PART_CACHE_PREFIX+digest+':9999',value:{version:'parts-1',bookId:source.bookId,chapterId:source.id,digest,partId:'9999',accessedAt:1,response:first}};
 await db.settings.bulkPut([whole,firstRow]);const calls:AiTranslateClientRequest[]=[];
 const send=async(req:AiTranslateClientRequest)=>{calls.push(req);expect(req.continuation?.version).toBe(3);if(req.continuation?.version===3){expect(req.continuation.firstHalfSource).toBe(source.text.slice(0,3000));expect(req.continuation.sample).toBe(first.result);}return answer('Fresh second',req.model!);};
 const session=new AiReadingSession(send,cache);try{const result=await session.request(source,settings,[]);expect(result.result).toBe('Old first\nFresh second');expect(calls).toHaveLength(1);}finally{session.clear();}
 expect(await db.settings.get(whole.key)).toEqual(whole);expect(((await db.settings.get(firstRow.key))?.value as {response:unknown}|undefined)?.response).toEqual(first);
 const reloaded=new AiReadingSession(send,cache);try{expect((await reloaded.request(source,settings,[])).result).toBe('Old first\nFresh second');expect(calls).toHaveLength(1);}finally{reloaded.clear();}
});
