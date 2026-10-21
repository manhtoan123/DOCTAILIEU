import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey,type ReadingAiSettings} from '../src/features/ai/services/ai-reading';
import {aiTranslate,type AiTranslateClientRequest} from '../src/features/ai/services/ai-translate';
import {DEFAULT_SECOND_HALF_PROMPT,secondHalfTemplateValid,aiUserPromptPreview,readAiHybrid} from '../src/features/ai/services/ai-hybrid-prompt';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {readAiReadingCache,writeAiReadingCache,readAiParts,writeAiPart,AI_PART_CACHE_PREFIX} from '../src/features/ai/services/ai-reading-cache';
import {hybridSampleHash} from '../src/features/ai/services/ai-hybrid';
import {db} from '../src/core/db';
const template='{{name}}\n{{bản dịch nửa đầu}}\n[SOURCE TEXT]:\n{{text nửa sau}}',sample='Mẫu {{text}} {{text nửa sau}} {name}',target='ONLY_TARGET_TEXT';
const settings:ReadingAiSettings={...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[],hybrid:{version:1,liteModel:'gemini-3.1-flash-lite',rules:'anh',secondHalfPrompt:template}};
const source={bookId:'prompt-half-book',id:'prompt-half-chapter',revision:1,text:'甲'.repeat(1800)+'乙'.repeat(1800)};
const cache={read:readAiReadingCache,write:writeAiReadingCache,readParts:readAiParts,writePart:writeAiPart};
const answer=(result:string,model:string)=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:2});
beforeEach(async()=>{await db.delete();await db.open();await db.books.put({id:source.bookId,title:'Synthetic',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:source.text.length,chapterCount:1});await db.chapters.put({...source,order:0,title:'Chapter',sourceId:''});});
afterEach(()=>{vi.restoreAllMocks();resetAiKeyState();});
it('accepts canonical and Vietnamese aliases, counts mixed aliases together',()=>{
 expect(secondHalfTemplateValid(template)).toBe(true);expect(secondHalfTemplateValid(DEFAULT_SECOND_HALF_PROMPT)).toBe(true);
 expect(secondHalfTemplateValid(template+'{{text}}')).toBe(false);expect(secondHalfTemplateValid(template+'{{firstHalfTranslation}}')).toBe(false);expect(secondHalfTemplateValid(template+'{name}')).toBe(false);
 expect(secondHalfTemplateValid(template.replace('{{name}}','{name}'))).toBe(true);expect(secondHalfTemplateValid(template.replace('{{name}}',''))).toBe(false);
});
it('renders complete sample once, source once, Name once without recursively replacing data',()=>{
 const input={text:target,names:{甲:'A {{text}}'},continuation:{version:2 as const,sample,rules:'old rules',promptTemplate:template}};
 const prompt=aiUserPromptPreview(input);expect(prompt.match(/ONLY_TARGET_TEXT/g)).toHaveLength(1);expect(prompt.split(JSON.stringify(sample)).length-1).toBe(1);expect(prompt).toContain('A {{text}}');expect(prompt).toContain('{{text nửa sau}}');expect(prompt).not.toContain('old rules');
 expect(aiUserPromptPreview({...input,continuation:{...input.continuation,promptTemplate:template+'\n{{rules}}'}})).toContain('old rules');
});
it('server v2 uses second template exactly and preview matches provider prompt',async()=>{
 const body={text:target,model:'gemini-3.1-flash-lite',userPromptTemplate:'FIRST_PROMPT {{text}}',continuation:{version:2,sample,rules:'',promptTemplate:template},names:{甲:'A'}};let sent='';
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{sent=JSON.parse(String(init!.body)).contents[0].parts[0].text;return Response.json({candidates:[{content:{parts:[{text:'Translated'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1,candidatesTokenCount:2}});});
 const r=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{GEMINI_API_KEY:'synthetic-only'});expect(r.status).toBe(200);expect(sent).toBe(aiUserPromptPreview(body as Parameters<typeof aiUserPromptPreview>[0]));expect(sent).not.toContain('FIRST_PROMPT');
});
it.each([template+'{{text}}',template.replace('{{bản dịch nửa đầu}}',''),template+'x'.repeat(8000)])('rejects invalid v2 template before Google %#',async promptTemplate=>{
 const fetch=vi.spyOn(globalThis,'fetch');const req={text:'target',model:'gemini-3.1-flash-lite',continuation:{version:2 as const,sample:'Sample',rules:'',promptTemplate}};
 await expect(aiTranslate(req)).rejects.toMatchObject({code:'invalid_prompt'});expect(fetch).not.toHaveBeenCalled();
 const r=await handleAiTranslate(new Request('https://test/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)}),{GEMINI_API_KEY:'synthetic-only'});expect(r.status).toBe(400);expect(fetch).not.toHaveBeenCalled();
});
it('restores prompt text with old rules intact and invalidates final identity on prompt change',()=>{
 expect(readAiHybrid(settings.hybrid)).toEqual(settings.hybrid);
 const changed={...settings,hybrid:{...settings.hybrid!,secondHalfPrompt:template+' altered'}};
 expect(aiReadingKey(source,settings,[])).not.toBe(aiReadingKey(source,changed,[]));
});
it('editing only second prompt or Lite retains the durable first half and regenerates only second',async()=>{
 const calls:AiTranslateClientRequest[]=[];const send=async(req:AiTranslateClientRequest)=>{calls.push(req);return answer(req.continuation?'Second '+req.continuation.version:'First full sample',req.model!);};
 for(const selected of [settings,{...settings,hybrid:{...settings.hybrid!,secondHalfPrompt:template+' changed'}},{...settings,hybrid:{...settings.hybrid!,liteModel:'gemini-3.5-flash-lite' as const}}]){const session=new AiReadingSession(send,cache);const result=await session.request(source,selected,[]);expect(result.result).toBe('First full sample\nSecond 3');session.clear();}
 expect(calls.filter(c=>!c.continuation)).toHaveLength(1);expect(calls.filter(c=>c.continuation)).toHaveLength(3);expect(calls[2].continuation?.version).toBe(3);
});
it.each(['complete','child'])('upgrading a real v1 %s cache retains first-half work with exact source guard',async kind=>{
 const oldSettings={...settings,hybrid:{version:1,liteModel:'gemini-3.1-flash-lite',rules:'anh'}};
 const oldKey=JSON.stringify([source.bookId,source.id,source.revision,source.text,oldSettings,[]]),stage=JSON.stringify([JSON.stringify(['txt',1800]),0]);
 const plan=JSON.stringify(['hybrid-halves-1',stage,kind==='complete'?'complete':JSON.stringify(['txt-parts-2',[[0,1800]]])]);
 const digest=await hybridSampleHash(JSON.stringify([oldKey,plan])),partId=kind==='complete'?'9999':'0/0';
 await db.settings.put({key:AI_PART_CACHE_PREFIX+digest+':'+partId,value:{version:'parts-1',bookId:source.bookId,chapterId:source.id,digest,partId,accessedAt:1,response:answer('Old first work','gemini-2.5-flash')}});
 const calls:AiTranslateClientRequest[]=[];const session=new AiReadingSession(async req=>{calls.push(req);return answer(req.continuation?'Second':'Missing first child',req.model!);},cache);
 const upgraded={...settings,hybrid:{...settings.hybrid!,liteModel:'gemini-3.5-flash-lite' as const}};
 const result=await session.request(source,upgraded,[]);expect(result.result).toContain('Old first work');expect(calls.filter(r=>!r.continuation)).toHaveLength(kind==='complete'?0:1);if(kind==='child')expect(calls[0].text).toBe('甲'.repeat(900));session.clear();
 await db.chapters.update(source.id,{revision:2,text:'Edited'});expect(await readAiParts(source,oldSettings as ReadingAiSettings,[],plan,undefined,true)).toEqual([]);
});
