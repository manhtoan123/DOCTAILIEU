import {afterEach,expect,it,vi} from 'vitest';
import {AI_DEFAULTS,AiReadingSession,aiReadingKey,type AiReadingCache} from '../src/features/ai/services/ai-reading';
import {AiTranslateClientError,type AiTranslateClientRequest} from '../src/features/ai/services/ai-translate';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {splitAiText} from '../src/features/ai/services/ai-parts';
import {estimatedAiOutputTokens} from '../src/features/ai/services/ai-output-plan';

const settings={...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[]};
const source={bookId:'whole-review',id:'whole-review-chapter',revision:1,text:'甲'.repeat(1800)+'乙'.repeat(1800)};
const answer=(result:string,model=settings.model)=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:1});
const baseCache=():AiReadingCache=>({read:async()=>undefined,write:async()=>true});
const layout={path:'whole.xhtml',nodes:['甲'.repeat(1800),'乙'.repeat(1800)],body:'<p>synthetic</p>',styles:[]};
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

it.each([6000,32000,32001])('review: fresh TXT %i characters fits output budget and retains every source span',async size=>{
 const input={...source,text:'甲'.repeat(size)},send=vi.fn(async(req:AiTranslateClientRequest)=>answer('Bản dịch đủ.',req.model)),session=new AiReadingSession(send);
 try{await session.request(input,settings,[]);expect(send.mock.calls.length).toBeGreaterThan(1);const sent=send.mock.calls.map(([req])=>req.text);expect(sent.join('')).toBe(input.text);expect(sent.every(text=>text.length<=32000&&estimatedAiOutputTokens(text)<=6144)).toBe(true);}finally{session.clear();}
});

it('review: hybrid still uses two stages, each half is sent whole when within the API limit',async()=>{
 const input={...source,text:'甲'.repeat(5000)+'乙'.repeat(5000)},calls:AiTranslateClientRequest[]=[],selected={...settings,hybrid:{version:1 as const,liteModel:'gemini-3.1-flash-lite' as const,rules:''}},session=new AiReadingSession(async req=>{calls.push(req);return answer(req.continuation?'Bản dịch sau.':'Bản dịch đầu.',req.model);});
 try{expect((await session.request(input,selected,[])).result).toBe('Bản dịch đầu.\nBản dịch sau.');expect(calls).toHaveLength(2);expect(calls.map(req=>req.text.length)).toEqual([5000,5000]);expect(calls[1].continuation).toMatchObject({sample:'Bản dịch đầu.',firstHalfSource:'甲'.repeat(5000)});}finally{session.clear();}
});

it('review: a legacy split that is impossible under overlapping Names cannot block a valid fresh whole request',async()=>{
 const input={...source,text:'甲'.repeat(6000)},names=[{key:'甲甲甲',value:'Tên hợp lệ'}],send=vi.fn(async(req:AiTranslateClientRequest)=>answer('Dịch nguyên chương.',req.model)),session=new AiReadingSession(send,{...baseCache(),readParts:async()=>[]});
 try{expect((await session.request(input,settings,names)).result).toBe('Dịch nguyên chương.');expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0].text).toBe(input.text);}finally{session.clear();}
});

it('review: child-only legacy TXT checkpoints retain their spans and pinned model instead of being reinterpreted as whole',async()=>{
 const input={...source,text:'甲'.repeat(900)+'乙'.repeat(900)+'丙'.repeat(1800)+'丁'.repeat(1800)+'戊'.repeat(1800)},parts=splitAiText(input.text),plan=JSON.stringify(['txt-parts-2',parts.map(part=>[part.start,part.end])]),writes:string[]=[],selected={...settings,model:'gemini-3.8-flash',fallbackModels:[settings.model]};
 const cache:AiReadingCache={...baseCache(),readParts:async(_source,_settings,_names,target)=>target===plan?[{id:'0/0',response:answer('Đầu cũ.')}]:[],writePart:async(_source,_settings,_names,target)=>{writes.push(target);return true;}};
 const send=vi.fn(async(req:AiTranslateClientRequest)=>answer(req.text.startsWith('乙')?'Giữa mới.':'Cuối mới.',req.model)),session=new AiReadingSession(send,cache);
 try{expect((await session.request(input,selected,[])).result).toBe('Đầu cũ.\nGiữa mới.\nCuối mới.\nCuối mới.\nCuối mới.');expect(send.mock.calls.map(([req])=>req.text)).toEqual(['乙'.repeat(900),'丙'.repeat(1800),'丁'.repeat(1800),'戊'.repeat(1800)]);expect(send.mock.calls.every(([req])=>req.model===settings.model)).toBe(true);expect(writes.every(target=>target===plan)).toBe(true);}finally{session.clear();}
});

it.each(['txt','epub'] as const)('review: a stalled new-plan cache probe cannot discard a fast valid legacy %s checkpoint',async kind=>{
 vi.useFakeTimers();const chapter=kind==='txt'?{...source,text:'a'.repeat(4500)+'b'.repeat(1500)}:source;const cache:AiReadingCache={...baseCache(),readParts:async(_source,_settings,_names,plan)=>{if(JSON.parse(plan)[0].includes('whole'))return new Promise(()=>{});return kind==='txt'?[{id:'0',response:answer('Đầu cũ.')},{id:'1',response:answer('Giữa cũ.')},{id:'2',response:answer('Kề cuối cũ.')}]:[{id:'0',response:answer('{"0":"Đầu cũ."}')}];}};
 const calls:AiTranslateClientRequest[]=[],send=async(req:AiTranslateClientRequest)=>{calls.push(req);return answer(kind==='txt'?'Sau mới.':JSON.stringify(Object.fromEntries(Object.keys(JSON.parse(req.text)).map(id=>[id,'Sau mới.']))),req.model);};
 const session=kind==='txt'?new AiReadingSession(send,cache):new EpubAiSession(cache,send);
 try{const pending=session instanceof AiReadingSession?session.request(chapter,settings,[]):session.request(source,settings,[],layout);await vi.advanceTimersByTimeAsync(2000);const result=await pending;expect(calls).toHaveLength(1);if(kind==='txt'){expect(calls[0].text).toBe('b'.repeat(1500));expect(result.result).toBe('Đầu cũ.\nGiữa cũ.\nKề cuối cũ.\nSau mới.');}else{expect(Object.keys(JSON.parse(calls[0].text))).toEqual(['1']);expect(result.result).toBe('Đầu cũ.\nSau mới.');}}finally{session.clear();}
});

it('review: fresh EPUB within serialized JSON limit makes one call while preserving ID order and original node mapping',async()=>{
 const before=JSON.stringify(layout),calls:AiTranslateClientRequest[]=[],session=new EpubAiSession(undefined,async req=>{calls.push(req);return answer(JSON.stringify({'0':'Đầu mới.','1':'Sau mới.'}),req.model);});
 try{expect((await session.request(source,settings,[],layout)).nodes).toEqual(['Đầu mới.','Sau mới.']);expect(calls).toHaveLength(1);expect(Object.keys(JSON.parse(calls[0].text))).toEqual(['0','1']);expect(calls[0].text.length).toBeLessThanOrEqual(32000);expect(JSON.stringify(layout)).toBe(before);}finally{session.clear();}
});

it.each([4000,31940])('review: whole EPUB with %i characters and overlapping Names needs no optional legacy cut',async size=>{
 const text='甲'.repeat(size),input={...source,text},nodes=[text],names=[{key:'甲甲甲',value:'Tên hợp lệ'}],calls:AiTranslateClientRequest[]=[],session=new EpubAiSession({...baseCache(),readParts:async()=>[]},async req=>{calls.push(req);return answer('{"0":"Dịch nguyên node."}',req.model);});
 expect(JSON.stringify({'0':text}).length).toBeLessThanOrEqual(32000);
 try{expect((await session.request(input,settings,names,{...layout,nodes})).nodes).toEqual(['Dịch nguyên node.']);expect(calls).toHaveLength(1);expect(JSON.parse(calls[0].text)).toEqual({'0':text});}finally{session.clear();}
});

it('review: EPUB obeys the encoded JSON limit even when source quotes and backslashes double the payload',async()=>{
 const text='\\"'.repeat(12000),input={...source,text},calls:AiTranslateClientRequest[]=[],session=new EpubAiSession(undefined,async req=>{calls.push(req);return answer(JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(req.text) as Record<string,string>).map(([id,value])=>[id,'V'.repeat(value.length)]))),req.model);});
 try{expect((await session.request(input,settings,[],{...layout,nodes:[text]})).nodes).toEqual(['V'.repeat(text.length)]);expect(calls).toHaveLength(2);expect(calls.every(req=>req.text.length<=32000)).toBe(true);expect(calls.flatMap(req=>Object.values(JSON.parse(req.text))).join('')).toBe(text);}finally{session.clear();}
});

it('review: existing completed cache survives the new partial plan and is reused without a translation request',async()=>{
 const cached=answer('Bản dịch cũ đầy đủ.'),send=vi.fn(async()=>answer('Không được gọi.')),session=new AiReadingSession(send,{read:async()=>cached,write:vi.fn(async()=>true)});
 try{expect(await session.request(source,settings,[])).toEqual(cached);expect(send).not.toHaveBeenCalled();expect(session.get(aiReadingKey(source,settings,[]))).toEqual(cached);}finally{session.clear();}
});

it('review: cancelled whole output cannot replace a newer same-key completion',async()=>{
 const source={bookId:'whole-review',id:'cancel-short',revision:1,text:'甲'.repeat(1600)};
 let release!:(value:ReturnType<typeof answer>)=>void;const send=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>release=resolve)).mockResolvedValue(answer('Bản dịch mới.')),write=vi.fn(async()=>true),session=new AiReadingSession(send,{read:async()=>undefined,write});
 try{const key=aiReadingKey(source,settings,[]),old=session.request(source,settings,[]).catch(e=>e);await vi.waitFor(()=>expect(send).toHaveBeenCalledOnce());session.cancel(key);expect(await old).toMatchObject({name:'AbortError'});expect((await session.request(source,settings,[])).result).toBe('Bản dịch mới.');release(answer('Phản hồi cũ.'));await Promise.resolve();expect(write).toHaveBeenCalledOnce();expect(session.get(key)?.result).toBe('Bản dịch mới.');}finally{session.clear();}
});

it('review: failure recovery still splits only after a whole request fails and never changes its pinned model',async()=>{
 const source={bookId:'whole-review',id:'recover-short',revision:1,text:'甲'+'a'.repeat(2999)+'乙'+'b'.repeat(2999)};
 const calls:AiTranslateClientRequest[]=[],session=new AiReadingSession(async req=>{calls.push(req);if(req.text.length===6000)throw new AiTranslateClientError('ai_incomplete_result','Synthetic output limit',502,'output_limit');return answer(req.text.startsWith('甲')?'Nửa đầu.':'Nửa sau.',req.model);});
 try{expect((await session.request(source,settings,[])).result).toBe('Nửa đầu.\nNửa sau.');expect(calls.map(req=>req.text.length)).toEqual([6000,3000,3000]);expect(calls.every(req=>req.model===settings.model)).toBe(true);}finally{session.clear();}
});
