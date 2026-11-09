import {describe,it,expect,vi} from 'vitest';
import {splitAiText,runAiParts,type AiPartsProgress} from '../src/features/ai/services/ai-parts';
import {AiReadingSession,AI_DEFAULTS,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import type {AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import {estimatedAiOutputTokens} from '../src/features/ai/services/ai-output-plan';
const model='gemini-2.5-flash',settings={...AI_DEFAULTS,model,fallbackModels:[]};
const source={bookId:'parts-book',id:'parts-chapter',revision:1,text:'甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800)};
const wholeSource={...source,text:'甲'.repeat(32000)+'乙'.repeat(32000)+'丙'.repeat(32000)};
const response=(result:string,parallel?:2):AiTranslateClientResponse=>({result,model,finishReason:'STOP',inputTokens:2,outputTokens:3,...(parallel?{parallel}: {})});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
describe('ordered AI chapter parts',()=>{
 it('splits long unpunctuated text losslessly with bounded context and intact Unicode',()=>{
  const text='甲'.repeat(1799)+'😀'+'乙'.repeat(12800),parts=splitAiText(text);
  expect(parts.map(p=>p.text).join('')).toBe(text);expect(parts.length).toBeGreaterThan(7);
  for(const p of parts){expect(p.text.length).toBeLessThanOrEqual(1800);expect(p.context?.length??0).toBeLessThanOrEqual(300);expect(p.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);expect(p.context??'').not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);expect(text.slice(p.start,p.end)).toBe(p.text);}
 });
 it('preserves a matched Name and all paragraph separators across boundaries',()=>{
  const text='甲'.repeat(1798)+'乌波伙伴'+'乙'.repeat(1000)+'。\n\n'+'丙'.repeat(3000),parts=splitAiText(text,['乌波伙伴']);
  expect(parts.map(p=>p.text).join('')).toBe(text);expect(parts.filter(p=>p.text.includes('乌波伙伴'))).toHaveLength(1);
 });
 it('waits for the server hint, runs at most two requests and previews only the contiguous prefix',async()=>{
  const parts=splitAiText(source.text),gates=parts.map(()=>deferred<AiTranslateClientResponse>()),states:AiPartsProgress[]=[];let active=0,max=0;
  const send=vi.fn(async p=>{max=Math.max(max,++active);const r=await gates[Number(p.id)].promise;active--;return r;});
  const done=runAiParts(parts,new AbortController().signal,new Map(),send,s=>states.push(s));
  expect(send).toHaveBeenCalledTimes(1);gates[0].resolve(response('Đầu',2));await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(3));
  gates[2].resolve(response('Cuối',2));await vi.waitFor(()=>expect(states.at(-1)?.done).toBe(2));expect(states.at(-1)?.text).toBe('Đầu');expect(states.at(-1)?.completedParts).toEqual([1,3]);
  gates[1].resolve(response('Giữa',2));expect((await done).result).toBe('Đầu\nGiữa\nCuối');expect(max).toBe(2);expect(states.at(-1)?.active).toEqual([]);
 });
 it('keeps single-key requests serial when no parallel hint is returned',async()=>{
  let active=0,max=0;const r=await runAiParts(splitAiText(source.text),new AbortController().signal,new Map(),async p=>{max=Math.max(max,++active);await Promise.resolve();active--;return response(p.id);},()=>{});
  expect(r.result).toBe('0\n1\n2');expect(max).toBe(1);
 });
 it('rejects a model change without saving that part or completing the chapter',async()=>{
  const completed=new Map<string,AiTranslateClientResponse>(),save=vi.fn();
  await expect(runAiParts(splitAiText(source.text),new AbortController().signal,completed,async p=>p.id==='0'?response('Đầu',2):{...response('Sai'),model:'gemini-3.5-flash'},()=>{},save)).rejects.toThrow(/Model/);
  expect(completed.size).toBe(1);expect(save).toHaveBeenCalledTimes(1);
 });
 it('retries only missing parts after a failure and never exposes an incomplete full-cache hit',async()=>{
  const chapter={...source,text:source.text+'丁'.repeat(1800)};
  let fail=true;const translate=vi.fn(async input=>{if(input.text.startsWith('乙')&&fail)throw Error('synthetic permanent error');return response(input.text[0],2);}),write=vi.fn(async()=>true),session=new AiReadingSession(translate,{read:async()=>undefined,write});
  const selected={...settings,splitParts:true},key=aiReadingKey(chapter,selected,[]);await expect(session.request(chapter,selected,[])).rejects.toThrow('synthetic');expect(session.get(key)).toBeUndefined();expect(write).not.toHaveBeenCalled();
  fail=false;expect((await session.request(chapter,selected,[])).result).toBe('甲\n乙\n丙\n丁');expect(translate.mock.calls.filter(([i])=>i.text.startsWith('甲'))).toHaveLength(1);expect(translate.mock.calls.filter(([i])=>i.text.startsWith('丙'))).toHaveLength(1);expect(write).toHaveBeenCalledOnce();
 });
 it('manual cancel preserves completed parts and rejects late responses without poisoning same-key retry',async()=>{
  const chapter={...source,text:source.text+'丁'.repeat(1800)};
  let retry=false;const held=deferred<AiTranslateClientResponse>(),states:AiPartsProgress[]=[];
  const translate=vi.fn(async input=>input.text.startsWith('甲')?response('Đầu',2):retry?response(input.text.startsWith('乙')?'Giữa':input.text.startsWith('丙')?'Cuối':'Hậu',2):held.promise);
  const selected={...settings,splitParts:true},session=new AiReadingSession(translate),key=aiReadingKey(chapter,selected,[]),old=session.request(chapter,selected,[],undefined,undefined,s=>states.push(s)).catch(e=>e);
  await vi.waitFor(()=>expect(translate).toHaveBeenCalledTimes(3));session.cancel(key);expect((await old).name).toBe('AbortError');const count=states.length;
  retry=true;const fresh=session.request(chapter,selected,[]);held.resolve(response('STALE',2));expect((await fresh).result).toBe('Đầu\nGiữa\nCuối\nHậu');expect(states).toHaveLength(count);expect(translate.mock.calls.filter(([i])=>i.text.startsWith('甲'))).toHaveLength(1);expect(session.get(key)?.result).not.toContain('STALE');
 });
 it('pins the model from any persisted part, including when the first part was evicted',async()=>{
  const chapter={...source,text:source.text+'丁'.repeat(1800)};
  const translate=vi.fn(async input=>{expect(input.model).toBe(model);return response(input.text.startsWith('甲')?'Đầu':input.text.startsWith('丙')?'Cuối':'Hậu',2);});
  const session=new AiReadingSession(translate,{read:async()=>undefined,write:async()=>true,readParts:async()=>[{id:'1',response:response('Giữa')}]});
  const r=await session.request(chapter,{...settings,model:'gemini-3.5-flash',fallbackModels:[model]},[]);expect(r.result).toBe('Đầu\nGiữa\nCuối\nHậu');expect(translate).toHaveBeenCalledTimes(3);
 });
 it('translates 128k and larger sources using small requests within each shared budget',async()=>{
  const translate=vi.fn(async input=>{expect(input.text.length).toBeLessThanOrEqual(32000);return response('V'.repeat(input.text.length),2);}),session=new AiReadingSession(translate),text='甲'.repeat(128000);
  const r=await session.request({...source,text},settings,[]);expect(r.result.replaceAll('\n','')).toBe('V'.repeat(text.length));expect(translate.mock.calls.map(([input])=>input.text).join('')).toBe(text);expect(translate.mock.calls.every(([input])=>estimatedAiOutputTokens(input.text)<=6144)).toBe(true);const count=translate.mock.calls.length;expect(count).toBeLessThanOrEqual(256);
  const larger=await session.request({...source,id:'over',text:text+'甲'},settings,[]);expect(larger.finishReason).toBe('STOP');expect(translate.mock.calls.length-count).toBeGreaterThan(0);expect(translate.mock.calls.length-count).toBeLessThanOrEqual(256);
 });
 it('invalidates in-memory parts when the source, prompt or matched Name changes',async()=>{
  const translate=vi.fn(async input=>{if(input.text.startsWith('乙'))throw Error('stop');return response(input.text[0]);}),session=new AiReadingSession(translate);
  await session.request(source,settings,[]).catch(()=>{});await session.request({...source,revision:2},settings,[]).catch(()=>{});await session.request(source,{...settings,systemPrompt:'new'},[]).catch(()=>{});await session.request(source,settings,[{key:'甲',value:'A'}]).catch(()=>{});
  expect(translate.mock.calls.filter(([i])=>i.text.startsWith('甲'))).toHaveLength(4);
 });
 it('EPUB preview and resume preserve node order, strict IDs and original layout',async()=>{
  const nodes=['甲'.repeat(31900),'乙'.repeat(31900),'丙'.repeat(31900)],layout={path:'one.xhtml',body:'<body><p><em>甲</em></p><img src="x.png"/><p>乙</p><p>丙</p></body>',styles:[{path:'style.css',text:'p{color:red}'}],nodes},before=JSON.stringify(layout),states:AiPartsProgress[]=[];let fail=true;
  const translate=vi.fn(async input=>{const row=JSON.parse(input.text),key=Object.keys(row)[0];if(key==='1'&&fail)throw Error('stop');return response(JSON.stringify({[key]:['Đầu','Giữa','Cuối'][Number(key)]}),2);});
  const session=new EpubAiSession(undefined,translate),src={...source,text:nodes.join('\n')};await expect(session.request(src,settings,[],layout,undefined,s=>states.push(s))).rejects.toThrow('stop');
  expect(states.at(-1)?.text).toBe('Đầu\n\n');expect(states.at(-1)?.done).toBe(2);expect(session.get(aiReadingKey(src,settings,[]))).toBeUndefined();fail=false;
  expect((await session.request(src,settings,[],layout)).nodes).toEqual(['Đầu','Giữa','Cuối']);expect(translate.mock.calls.filter(([i])=>Object.hasOwn(JSON.parse(i.text),'0'))).toHaveLength(1);expect(JSON.stringify(layout)).toBe(before);
 });
});
