import {expect,it,vi} from 'vitest';
import {AI_DEFAULTS,AiReadingSession,type AiReadingSource} from '../src/features/ai/services/ai-reading';
import {AiTranslateClientError,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';

const first='gemini-3.8-flash',fallback='gemini-3.7-flash';
const source=(id:string):AiReadingSource=>({bookId:'synthetic-warm-fallback',id,revision:1,text:'甲'.repeat(2000)});
const answer=(model:string):AiTranslateClientResponse=>({result:'Bản dịch tổng hợp hoàn chỉnh.',model,finishReason:'STOP',inputTokens:2,outputTokens:3,parallel:2});

it('warm multi-part work starting one request can fall back before acceptance, then pins accepted parts',async()=>{
 const calls:string[]=[],settings={...AI_DEFAULTS,model:first,fallbackModels:[fallback],splitParts:false};let warmup=true;
 const session=new AiReadingSession(async input=>{calls.push(input.model!);if(!warmup&&input.model===first)throw new AiTranslateClientError('ai_timeout','Synthetic timeout',504,'timeout');return answer(input.model!);});
 try{
  await session.request(source('current'),settings,[],undefined,undefined,undefined,{immediate:true});warmup=false;
  const next={...source('next'),text:'甲'.repeat(8000)};
  expect((await session.request(next,settings,[],undefined,undefined,undefined,{immediate:true,isPrewarm:true})).model).toBe(fallback);
  expect(calls.slice(0,3)).toEqual([first,first,fallback]);expect(calls.slice(2).every(model=>model===fallback)).toBe(true);expect(calls.length).toBeGreaterThan(3);
 }finally{session.clear();}
});

it('warm multi-part parallel work still starts two same-model parts and forbids speculative mixed fallbacks',async()=>{
 let warmup=true;const calls:string[]=[],gates:(()=>void)[]=[],settings={...AI_DEFAULTS,model:first,fallbackModels:[fallback],splitParts:true};
 const session=new AiReadingSession(async input=>{if(warmup)return answer(first);calls.push(input.model!);await new Promise<void>(resolve=>gates.push(resolve));throw new AiTranslateClientError('ai_upstream_error','Synthetic model unavailable',404,'upstream_status');});
 try{
  await session.request(source('current'),settings,[],undefined,undefined,undefined,{immediate:true});warmup=false;
  const work=session.request({...source('next'),text:'甲'.repeat(8000)},settings,[],undefined,undefined,undefined,{immediate:true,isPrewarm:true}).catch(error=>error);
  await vi.waitFor(()=>expect(calls).toEqual([first,first]));gates.splice(0).forEach(resolve=>resolve());
  expect(await work).toBeInstanceOf(AiTranslateClientError);expect(calls).toEqual([first,first]);
 }finally{gates.splice(0).forEach(resolve=>resolve());session.clear();}
});

it.each([false,true])('cold prewarm can fall back with observeMetrics=%s',async observe=>{
 const calls:string[]=[],session=new AiReadingSession(async input=>{calls.push(input.model!);if(input.model===first)throw new AiTranslateClientError('ai_timeout','Synthetic timeout',504,'timeout');return answer(input.model!);},undefined,undefined,observe);
 try{
  expect((await session.request(source('next'),{...AI_DEFAULTS,model:first,fallbackModels:[fallback]},[],undefined,undefined,undefined,{immediate:true,isPrewarm:true})).model).toBe(fallback);
  expect(calls).toEqual([first,fallback]);
 }finally{session.clear();}
});

it.each([false,true])('one EPUB group retains configured fallback after a warm chapter, metrics=%s',async observe=>{
 const calls:string[]=[],settings={...AI_DEFAULTS,model:first,fallbackModels:[fallback],splitParts:true};
 const layout={path:'synthetic.xhtml',body:'<body><p>甲</p></body>',styles:[],nodes:['甲'.repeat(1000)]};
 let warmup=true;
 const session=new EpubAiSession(undefined,async input=>{calls.push(input.model!);if(!warmup&&input.model===first)throw new AiTranslateClientError('ai_timeout','Synthetic timeout',504,'timeout');return {...answer(input.model!),result:JSON.stringify(Object.fromEntries(Object.keys(JSON.parse(input.text)).map(key=>[key,'Bản dịch tổng hợp.'])))};},observe);
 try{
  await session.request({...source('current'),text:layout.nodes.join('\n')},settings,[],layout,undefined,undefined,{immediate:true});warmup=false;
  expect((await session.request({...source('next'),text:layout.nodes.join('\n')},settings,[],layout,undefined,undefined,{immediate:true,isPrewarm:true})).model).toBe(fallback);
  expect(calls).toEqual([first,first,fallback]);
 }finally{session.clear();}
});

it.each([[false,false],[false,true],[true,false],[true,true]])('warm capacity must not pin a whole short prewarm before acceptance: metrics=%s parallel=%s',async(observe,splitParts)=>{
 const calls:{model:string;text:string}[]=[],settings={...AI_DEFAULTS,model:first,fallbackModels:[fallback],splitParts};
 let warmup=true;
 const session=new AiReadingSession(async input=>{calls.push({model:input.model!,text:input.text});if(!warmup&&input.model===first)throw new AiTranslateClientError('ai_timeout','Synthetic timeout',504,'timeout');return answer(input.model!);},undefined,undefined,observe);
 try{
  await session.request(source('current'),settings,[],undefined,undefined,undefined,{immediate:true});warmup=false;
  expect((await session.request(source('next'),settings,[],undefined,undefined,undefined,{immediate:true,isPrewarm:true})).model).toBe(fallback);
  expect(calls.map(row=>row.model)).toEqual([first,first,fallback]);
  expect(calls.every(row=>row.text===source('next').text)).toBe(true);
 }finally{session.clear();}
});
