import 'fake-indexeddb/auto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {hasCopiedSource} from '../src/features/ai/services/ai-source-copy';
import {AI_DEFAULTS,AiReadingSession,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {aiTranslate,AiTranslateClientError,type AiTranslateClientRequest} from '../src/features/ai/services/ai-translate';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {readAiReadingCache,writeAiReadingCache,readAiParts,writeAiPart,AI_READING_CACHE_PREFIX,AI_PART_CACHE_PREFIX} from '../src/features/ai/services/ai-reading-cache';

const settings={...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[]};
const source={bookId:'copy-review-book',id:'copy-review-chapter',revision:1,text:'甲'.repeat(400)+'乙'.repeat(400)};
const answer=(result:string,model=settings.model)=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:1});
const cache={read:readAiReadingCache,write:writeAiReadingCache,readParts:readAiParts,writePart:writeAiPart};
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
beforeEach(async()=>{await db.delete();await db.open();await db.books.put({id:source.bookId,title:'Synthetic source-copy review',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:source.text.length,chapterCount:1});await db.chapters.put({...source,order:0,title:'Synthetic chapter',sourceId:''});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('review: decoded JSON values are inspected while JSON identifiers never count as copied prose',()=>{
 const han='甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥天地';
 const escaped=JSON.stringify({'0':han}).replace(/[\u3400-\u9fff]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
 expect(hasCopiedSource(JSON.stringify({'0':han}),escaped)).toBe(true);
 expect(hasCopiedSource(han,JSON.stringify({[han]:'Dịch đầy đủ.'}))).toBe(false);
 expect(hasCopiedSource(han,JSON.stringify({'0':han.slice(0,16),'1':han.slice(0,16)}))).toBe(false);
 expect(hasCopiedSource(han,han.slice(0,16)+'\n'+han.slice(0,16))).toBe(false);
});

it('review: explicit Han Name labels and STV captions remain legitimate output without hiding other copied blocks',()=>{
 const label='甲'.repeat(24),other='乙'.repeat(24),name=`[i]https://example.test/portrait.png[/]${label}`;
 expect(hasCopiedSource(label+other,label+' đã nói.',[name])).toBe(false);
 expect(hasCopiedSource(label+other,label+' đã nói '+other,[name])).toBe(true);
 expect(hasCopiedSource('甲'.repeat(24),'乙'.repeat(24))).toBe(false);
});

it('review: thresholds count Han code points and do not bridge separated short runs',()=>{
 const han=String.fromCodePoint(0x20000),sourceText=han.repeat(24);
 expect(hasCopiedSource(sourceText,han.repeat(24))).toBe(true);expect(hasCopiedSource(sourceText,han.repeat(23))).toBe(false);
 expect(hasCopiedSource(sourceText,Array(4).fill(han.repeat(7)).join(' '))).toBe(false);
});

it.each(['甲','甲乙','甲乙丙丁戊'])('review: mixed translated prose rejects even a short source remnant (%s) outside explicit Names',remnant=>{
 const input='甲乙丙丁戊';expect(hasCopiedSource(input,'Bản dịch còn '+remnant)).toBe(true);
 expect(hasCopiedSource(input,'Bản dịch gọi '+remnant,[remnant])).toBe(false);
 expect(hasCopiedSource(input,'Bản dịch còn '+remnant,[`[i]https://example.test/name.png[/]${remnant}`])).toBe(false);
});

it('review: mixed guard uses decoded values, paragraph boundaries and source Han membership',()=>{
 expect(hasCopiedSource('{"0":"甲"}','{"0":"A Ninh\\u7532"}')).toBe(true);
 expect(hasCopiedSource('甲乙丙丁戊','Bản dịch có 己')).toBe(false);
 expect(hasCopiedSource('甲'.repeat(24),'甲'.repeat(16)+'\nBản dịch đã xong.')).toBe(false);
 expect(hasCopiedSource('甲',JSON.stringify({'甲':'Bản dịch đã xong.'}))).toBe(false);
 const supplementary=String.fromCodePoint(0x20000);expect(hasCopiedSource(supplementary,'Tên '+supplementary)).toBe(true);
});

it('review: client rejects escaped JSON source copies using the permanent quality code',async()=>{
 const han='甲'.repeat(24),escaped='{"0":"'+'\\u7532'.repeat(24)+'"}';
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(answer(escaped))));
 await expect(aiTranslate({text:JSON.stringify({'0':han}),model:settings.model})).rejects.toMatchObject({code:'ai_untranslated_result',reason:'untranslated_source'});
});

it('review: a legacy bad complete cache is a miss without deleting or overwriting the stored record',async()=>{
 const key=AI_READING_CACHE_PREFIX+await digest(aiReadingKey(source,settings,[]));
 const row={key,value:{version:1,bookId:source.bookId,chapterId:source.id,digest:key.slice(AI_READING_CACHE_PREFIX.length),accessedAt:1,response:answer(source.text)}};
 await db.settings.put(row);expect(await readAiReadingCache(source,settings,[])).toBeUndefined();expect(await db.settings.get(key)).toEqual(row);
 expect(await writeAiReadingCache(source,settings,[],answer(source.text))).toBe(false);expect(await db.settings.get(key)).toEqual(row);
});

it('review: only the bad legacy child is missed; valid sibling and pinned model are reused unchanged',async()=>{
 const plan=JSON.stringify(['txt-parts-2',[[0,800]]]);expect(await writeAiPart(source,settings,[],plan,'0/0',answer('Nửa đầu hợp lệ.'))).toBe(true);
 const hash=await digest(JSON.stringify([aiReadingKey(source,settings,[]),plan])),key=AI_PART_CACHE_PREFIX+hash+':0/1';
 const bad={key,value:{version:'parts-1',bookId:source.bookId,chapterId:source.id,digest:hash,partId:'0/1',accessedAt:1,response:answer('乙'.repeat(400))}};
 await db.settings.put(bad);expect((await readAiParts(source,settings,[],plan)).map(row=>row.id)).toEqual(['0/0']);expect(await db.settings.get(key)).toEqual(bad);
 const send=vi.fn(async(input:AiTranslateClientRequest)=>answer('Nửa sau hợp lệ.',input.model)),session=new AiReadingSession(send,cache);
 try{expect((await session.request(source,settings,[])).result).toBe('Nửa đầu hợp lệ.\nNửa sau hợp lệ.');expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0]).toMatchObject({text:'乙'.repeat(400),model:settings.model});expect((await db.chapters.get(source.id))?.text).toBe(source.text);}finally{session.clear();}
});

it('review: cancel during source-copy recovery rejects late output and retains its good child only',async()=>{
 let release!:(value:ReturnType<typeof answer>)=>void;const calls:string[]=[],write=vi.fn(async()=>true);
 const session=new AiReadingSession(async input=>{calls.push(input.text);if(input.text.length===800)return answer(input.text,input.model);if(input.text.startsWith('甲'))return answer('Nửa đầu hợp lệ.',input.model);return new Promise<ReturnType<typeof answer>>(resolve=>release=resolve);},{read:async()=>undefined,write});
 const key=aiReadingKey(source,settings,[]),pending=session.request(source,settings,[]).catch(e=>e);await vi.waitFor(()=>expect(calls).toHaveLength(3));session.cancel(key);expect(await pending).toMatchObject({name:'AbortError'});release(answer('Phản hồi muộn.'));await Promise.resolve();expect(write).not.toHaveBeenCalled();expect(session.get(key)).toBeUndefined();session.clear();
});

it('review: an unsplittable copied chunk neither retries identically nor becomes a complete cache',async()=>{
 const input={...source,text:'甲'.repeat(96)},write=vi.fn(async()=>true),send=vi.fn(async(req:AiTranslateClientRequest)=>answer(req.text,req.model)),session=new AiReadingSession(send,{read:async()=>undefined,write});
 try{await expect(session.request(input,settings,[])).rejects.toMatchObject({code:'ai_untranslated_result'});expect(send).toHaveBeenCalledOnce();expect(write).not.toHaveBeenCalled();expect(session.get(aiReadingKey(input,settings,[]))).toBeUndefined();}finally{session.clear();}
});

it('review: EPUB copied output recovers through complete ID groups and preserves source layout',async()=>{
 const nodes=['甲'.repeat(400),'乙'.repeat(400)],layout={path:'copy.xhtml',nodes,body:'<p>synthetic</p>',styles:[]},before=JSON.stringify(layout),calls:string[][]=[];
 const session=new EpubAiSession(undefined,async input=>{const row=JSON.parse(input.text);calls.push(Object.keys(row));if(Object.keys(row).length===2)return answer(input.text,input.model);return answer(JSON.stringify(Object.fromEntries(Object.keys(row).map(id=>[id,'Bản dịch '+id]))),input.model);});
 try{expect((await session.request(source,settings,[],layout)).nodes).toEqual(['Bản dịch 0','Bản dịch 1']);expect(calls).toEqual([['0','1'],['0'],['1']]);expect(JSON.stringify(layout)).toBe(before);}finally{session.clear();}
});

it('review: EPUB validates source coverage again after concatenating pieces of the same original node',async()=>{
 const text='甲'.repeat(3600),input={...source,text};await db.chapters.update(source.id,{text});const write=vi.fn(async()=>true);
 const session=new EpubAiSession({read:async()=>undefined,write},async input=>{if(Object.values(JSON.parse(input.text)).some(value=>String(value).length>1800))throw new AiTranslateClientError('ai_incomplete_result','Synthetic truncation',502,'output_limit');return answer(JSON.stringify(Object.fromEntries(Object.keys(JSON.parse(input.text)).map(id=>[id,'甲'.repeat(16)]))),input.model);});
 try{await expect(session.request(input,settings,[],{path:'copy.xhtml',nodes:[text],body:'<p>synthetic</p>',styles:[]})).rejects.toMatchObject({code:'ai_untranslated_result'});expect(write).not.toHaveBeenCalled();expect(session.get(aiReadingKey(input,settings,[]))).toBeUndefined();}finally{session.clear();}
});
