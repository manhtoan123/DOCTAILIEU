import {describe,expect,it,vi} from 'vitest';
import {AiReadingSession,AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {AiRecovery} from '../src/features/ai/services/ai-recovery';
import {AiTranslateClientError,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import type {AiPartsProgress} from '../src/features/ai/services/ai-parts';

const model='gemini-2.5-flash';
const settings={...AI_DEFAULTS,model,fallbackModels:[]};
const response=(result='Đã dịch.'):AiTranslateClientResponse=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:1});
// Isolate the chapter's real deferred-part retry from provider-level backoff.
function immediateRecovery(){const recovery=new AiRecovery();vi.spyOn(recovery,'run').mockImplementation(async(_model,_signal,send)=>send());return recovery;}

describe('independent division resume evidence',()=>{
 it('does not expose the last known part count as a whole chapter count beside a legacy root',async()=>{
  const source={bookId:'division-review',id:'mixed-legacy-roots',revision:1,text:'甲'.repeat(1800)+'乙'.repeat(1800)};
  const translate=vi.fn(async input=>{if(input.text.length===1800)throw new AiTranslateClientError('ai_incomplete_result','cut',502,'output_limit');return response('Phần mới.');});
  const states:AiPartsProgress[]=[];
  const session=new AiReadingSession(translate,{read:async()=>undefined,write:async()=>true,readParts:async(_source,_settings,_names,plan)=>plan.includes('txt-parallel-1')?[{id:'0',response:response('Phần cũ.')}]:[]},undefined,false,immediateRecovery());
  const result=await session.request(source,{...settings,splitParts:true},[],undefined,undefined,state=>states.push(state));
  expect(result.division).toBeUndefined();
  expect(states.at(-1)?.division).toBeUndefined();
  expect(translate).toHaveBeenCalledTimes(3);
 });

 it('keeps the exact count unknown when a legacy saved descendant has no division facts',async()=>{
  const source={bookId:'division-review',id:'legacy-descendant',revision:1,text:'中'.repeat(8000)};
  const rows=[{id:'0/0',response:response('Phần đã lưu từ trước.')}];
  const translate=vi.fn(async()=>response('Phần mới.')),states:AiPartsProgress[]=[];
  const session=new AiReadingSession(translate,{read:async()=>undefined,write:async()=>true,readParts:async(_source,_settings,_names,plan)=>plan.includes('txt-whole-1')?rows:[]},undefined,false,immediateRecovery());
  const result=await session.request(source,settings,[],undefined,undefined,state=>states.push(state));
  expect(result.division).toBeUndefined();
  expect(states.at(-1)?.division).toBeUndefined();
  expect(translate).toHaveBeenCalledOnce();
 });

 it('counts persisted descendant leaf parts while resuming an unfinished subtree',async()=>{
  const source={bookId:'division-review',id:'nested-resume',revision:1,text:'中'.repeat(8000)};
  const rows=[{id:'0/0/0',response:{...response('Một.'),division:{version:1 as const,parts:1,reasons:['output_limit' as const]}}},{id:'0/0/1',response:{...response('Hai.'),division:{version:1 as const,parts:1,reasons:['output_limit' as const]}}}];
  const translate=vi.fn(async()=>response('Ba.')),states:AiPartsProgress[]=[];
  const session=new AiReadingSession(translate,{read:async()=>undefined,write:async()=>true,readParts:async(_source,_settings,_names,plan)=>plan.includes('txt-whole-1')?rows:[]},undefined,false,immediateRecovery());
  const result=await session.request(source,settings,[],undefined,undefined,state=>states.push(state));
  expect(result.division).toMatchObject({parts:3,reasons:['output_limit']});
  expect(states.at(-1)?.division).toEqual(result.division);
  expect(translate).toHaveBeenCalledOnce();
 });

 it('preserves an accepted cached child aggregate when reporting its parent',async()=>{
  const source={bookId:'division-review',id:'aggregate-resume',revision:1,text:'中'.repeat(8000)};
  const rows=[{id:'0/0',response:{...response('Các phần đã lưu.'),division:{version:1 as const,parts:3,reasons:['output_limit' as const]}}}];
  const translate=vi.fn(async()=>response('Phần còn lại.')),states:AiPartsProgress[]=[];
  const session=new AiReadingSession(translate,{read:async()=>undefined,write:async()=>true,readParts:async(_source,_settings,_names,plan)=>plan.includes('txt-whole-1')?rows:[]},undefined,false,immediateRecovery());
  const result=await session.request(source,settings,[],undefined,undefined,state=>states.push(state));
  expect(result.division?.parts).toBe(4);
  expect(states.at(-1)?.division).toEqual(result.division);
  expect(translate).toHaveBeenCalledOnce();
 });

 it('does not count an existing recovery cut again after a deferred quota retry',async()=>{
  const source={bookId:'division-review',id:'deferred-retry',revision:1,text:'甲'.repeat(1800)+'乙'.repeat(1800)};
  let childCalls=0;
  const translate=vi.fn(async input=>{
   if(input.text.startsWith('甲'))return {...response('Đầu.'),parallel:2 as const};
   if(input.text.length===1800)throw new AiTranslateClientError('ai_incomplete_result','cut',502,'output_limit');
   childCalls++;
   if(childCalls===2)throw new AiTranslateClientError('ai_rate_limited','wait',429,'quota',undefined,undefined,1);
   return response(`Phần ${childCalls}.`);
  }),states:AiPartsProgress[]=[];
  const session=new AiReadingSession(translate,undefined,undefined,false,immediateRecovery());
  const result=await session.request(source,{...settings,splitParts:true},[],undefined,undefined,state=>states.push(state));
  expect(result.division?.parts).toBe(3);
  expect(states.at(-1)?.division).toEqual(result.division);
  expect(Math.max(...states.map(state=>state.division?.parts??0))).toBe(3);
  expect(translate).toHaveBeenCalledTimes(5);
 });
});
