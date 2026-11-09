import 'fake-indexeddb/auto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {AiResultFactsStore,aiResultFacts} from '../src/features/ai/services/ai-result-facts';
import {aiLeafProgress,aiTreeFacts,hasUnknownAiParts} from '../src/features/ai/services/ai-leaf-progress';
import {aiChapterView} from '../src/features/ai/types/ai-chapter-view';
import {AI_DEFAULTS,AiReadingSession,aiReadingKey,type AiReadingCache} from '../src/features/ai/services/ai-reading';
import {AiRecovery} from '../src/features/ai/services/ai-recovery';
import {AiTranslateClientError,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import type {AiDivisionReason} from '../src/features/ai/services/ai-division';
import type {AiPartsProgress} from '../src/features/ai/services/ai-parts';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';

const settings={...AI_DEFAULTS,fallbackModels:[]};
const source={bookId:'d1d2-review',id:'one',revision:1,text:'甲'.repeat(800)};
const response=(result='Bản dịch.'):AiTranslateClientResponse=>({result,model:settings.model,finishReason:'STOP',inputTokens:1,outputTokens:1});
const leaf=(result='Một.'):AiTranslateClientResponse=>({...response(result),division:{version:1,parts:1,reasons:['output_limit']}});
const progress=(extra:Partial<AiPartsProgress>={}):AiPartsProgress=>({done:0,total:1,text:'',active:[],parallel:1,...extra});
function gate<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
function immediateRecovery(){const recovery=new AiRecovery();vi.spyOn(recovery,'run').mockImplementation(async(_model,_signal,send)=>send());return recovery;}
afterEach(()=>vi.restoreAllMocks());

describe('review: durable result facts are isolated from response and request identity',()=>{
 it('copies metadata on insertion and retrieval without mutating the original response',()=>{
  const raw={...response('AB'),division:{version:1 as const,parts:2,reasons:['output_limit' as const]},textMap:{version:1 as const,sourceLength:2,spans:[{sourceStart:0,sourceEnd:2,translatedStart:0,translatedEnd:2}]}};
  const store=new AiResultFactsStore();store.set('current',raw);const first=store.get('current')!;
  raw.division.parts=3;raw.textMap.spans[0].sourceEnd=1;first.division!.parts=4;first.textMap!.spans[0].sourceEnd=0;
  expect(store.get('current')).toMatchObject({division:{parts:2},textMap:{spans:[{sourceEnd:2}]}});
  expect(store.get('next')).toBeUndefined();store.retain(['next']);expect(store.get('current')).toBeUndefined();
 });
 it('invalid optional metadata leaves a valid translation usable and legacy facts unknown',()=>{
  const raw=response('Bản dịch ♾');expect(aiResultFacts(raw).division).toBeUndefined();
  expect(aiResultFacts({...raw,division:{version:1,parts:0,reasons:[]},textMap:{version:1,sourceLength:1,spans:[{sourceStart:1,sourceEnd:0,translatedStart:0,translatedEnd:1}]}})).toEqual({division:undefined});
 });
 it('keeps fresh single-part response identity with known facts on RAM and persistent reuse',async()=>{
  const raw=Object.freeze(response()),translate=vi.fn(async()=>raw);let persisted:AiTranslateClientResponse|undefined;
  const cache:AiReadingCache={read:async()=>persisted,write:vi.fn(async(_s,_p,_n,result)=>{persisted=result;return true;})};
  const session=new AiReadingSession(translate,cache,undefined,false),key=aiReadingKey(source,settings,[]);
  expect(await session.request(source,settings,[])).toBe(raw);expect(session.get(key)).toBe(raw);expect(await session.request(source,settings,[])).toBe(raw);
  expect(raw).not.toHaveProperty('division');expect(session.facts(key)?.division).toEqual({version:1,parts:1,reasons:[]});
  const reload=new AiReadingSession(translate,cache,undefined,false);await reload.request(source,settings,[]);
  expect(reload.facts(key)).toEqual(session.facts(key));expect(translate).toHaveBeenCalledOnce();session.clear();reload.clear();
 });
 it('never fills legacy aggregate facts by sending another request',async()=>{
  const translate=vi.fn(async()=>response()),raw=response('Bản dịch cũ ♾'),session=new AiReadingSession(translate,{read:async()=>raw,write:async()=>true},undefined,false);
  expect(await session.request(source,settings,[])).toBe(raw);expect(session.facts(aiReadingKey(source,settings,[]))?.division).toBeUndefined();expect(translate).not.toHaveBeenCalled();session.clear();
 });
 it('does not expose facts across chapter/source/prompt/Name keys or after retention',async()=>{
  const session=new AiReadingSession(async()=>response(),undefined,undefined,false),names=[{key:'甲',value:'Giáp'}],key=aiReadingKey(source,settings,names);
  await session.request(source,settings,names);expect(session.facts(key)?.division?.parts).toBe(1);
  for(const other of [aiReadingKey({...source,id:'next'},settings,names),aiReadingKey({...source,revision:2},settings,names),aiReadingKey({...source,text:source.text+'乙'},settings,names),aiReadingKey(source,{...settings,systemPrompt:'Khác'},names),aiReadingKey(source,settings,[{key:'甲',value:'Khác'}])])expect(session.facts(other)).toBeUndefined();
  session.clear();expect(session.facts(key)).toBeUndefined();
 });
 it('late cancelled publication cannot replace a same-key response or its facts',async()=>{
  const entered=gate<void>(),hold=gate<boolean>(),oldRaw=response('Cũ.'),newRaw={...response('Mới.'),division:{version:1 as const,parts:1,reasons:[]}},translate=vi.fn().mockResolvedValueOnce(oldRaw).mockResolvedValueOnce(newRaw);
  let writes=0;const session=new AiReadingSession(translate,{read:async()=>undefined,write:async()=>{if(++writes===1){entered.resolve();return hold.promise;}return true;}},undefined,false),key=aiReadingKey(source,settings,[]);
  const old=session.request(source,settings,[]),rejected=expect(old).rejects.toMatchObject({name:'AbortError'});await entered.promise;session.clear();
  expect(await session.request(source,settings,[])).toBe(newRaw);hold.resolve(true);await rejected;
  expect(session.get(key)).toBe(newRaw);expect(session.facts(key)?.division?.parts).toBe(1);session.clear();
 });
});

describe('review: source-tree leaves count independently of scheduler groups',()=>{
 it('counts nested cached children, pending sibling and repeated cuts exactly once',()=>{
  const roots=[{id:'0'},{id:'1'}],completed=new Map([['0/0/0',leaf()],['0/0/1',leaf()],['1',leaf()]]),splits=new Map<string,AiDivisionReason>([['0','output_limit'],['0/0','output_limit']]);
  expect(aiLeafProgress(roots,completed,splits)).toEqual({done:3,total:4});splits.set('0/0','output_limit');expect(aiLeafProgress(roots,completed,splits)).toEqual({done:3,total:4});
  completed.set('0/1',leaf());expect(aiLeafProgress(roots,completed,splits)).toEqual({done:4,total:4});
 });
 it('a completed aggregate overrides child checkpoints and later completion order',()=>{
  const completed=new Map([['0', {...leaf(),division:{version:1 as const,parts:3,reasons:['output_limit' as const]}}],['0/0',response('Old legacy child.')],['0/1',{...leaf(),division:{version:1 as const,parts:1,reasons:['timeout' as const]}}],['1',leaf()]]);
  expect(hasUnknownAiParts([{id:'0'},{id:'1'}],completed)).toBe(false);
  expect(aiLeafProgress([{id:'0'},{id:'1'}],completed,new Map())).toEqual({done:4,total:4});
  expect(aiTreeFacts([{id:'0'},{id:'1'}],completed,new Map(),'parallel',false)).toMatchObject({division:{parts:4,reasons:['parallel','output_limit']},leafProgress:{done:4,total:4}});
 });
 it('unknown legacy checkpoints suppress exact ratios and division facts',()=>{
  const completed=new Map([['0/0',response('Cũ.')]]),splits=new Map<string,AiDivisionReason>([['0','resumed']]);
  expect(hasUnknownAiParts([{id:'0'}],completed)).toBe(true);
  expect(aiLeafProgress([{id:'0'}],completed,splits,true)).toBeUndefined();expect(aiTreeFacts([{id:'0'}],completed,splits,'parallel',true)).toEqual({division:undefined,leafProgress:undefined});
 });
 it('publishes a finished nested leaf while its sibling request remains unresolved',async()=>{
  const entered=gate<void>(),hold=gate<AiTranslateClientResponse>(),states:AiPartsProgress[]=[],chapter={...source,text:'a'.repeat(6000)};let calls=0;
  const translate=vi.fn(async()=>{calls++;if(calls===1)throw new AiTranslateClientError('ai_incomplete_result','cut',502,'output_limit');if(calls===3){entered.resolve();return hold.promise;}return response('Đầu.');});
  const session=new AiReadingSession(translate,undefined,undefined,false,immediateRecovery()),pending=session.request(chapter,settings,[],undefined,undefined,p=>states.push(p));
  try{await entered.promise;expect(states.at(-1)?.leafProgress).toEqual({done:1,total:2});}finally{hold.resolve(response('Sau.'));await pending;session.clear();}
  expect(states.at(-1)?.leafProgress).toEqual({done:2,total:2});expect(translate).toHaveBeenCalledTimes(3);
 });
 it('publishes EPUB recovery child progress before the complete JSON subtree is assembled',async()=>{
  const entered=gate<void>(),hold=gate<void>(),states:AiPartsProgress[]=[];
  const translate=vi.fn(async(input:{text:string})=>{
   const keys=Object.keys(JSON.parse(input.text));if(keys[0]==='0')throw new AiTranslateClientError('ai_incomplete_result','cut',502,'output_limit');
   if(keys[0]==='0/1'){entered.resolve();await hold.promise;}
   return response(JSON.stringify(Object.fromEntries(keys.map(key=>[key,'Đã dịch.']))));
  });
  const session=new EpubAiSession(undefined,translate,false,immediateRecovery()),layout={path:'chapter.xhtml',body:'<body><p>甲</p></body>',styles:[],nodes:[source.text]};
  const pending=session.request(source,settings,[],layout,undefined,p=>states.push(p));
  try{await entered.promise;expect(states.at(-1)?.leafProgress).toEqual({done:1,total:2});}finally{hold.resolve();}
  const result=await pending;session.clear();expect(states.at(-1)?.leafProgress).toEqual({done:2,total:2});expect(result.nodes).toEqual(['Đã dịch.Đã dịch.']);expect(translate).toHaveBeenCalledTimes(3);
 });
});

describe('review: content and task status precedence',()=>{
 const base={complete:false,running:false,stopped:false,online:true,now:1000};
 it('complete cached content stays ready with prewarm disabled and no resumed task',()=>{
  expect(aiChapterView({...base,complete:true,off:true,facts:{division:{version:1,parts:3,reasons:['parallel']}}})).toMatchObject({content:'complete',phase:'idle',label:'Đã xong',progress:{done:3,total:3}});
 });
 it('explicit Stop wins over offline and stale retry timers while preserving partial content',()=>{
  expect(aiChapterView({...base,stopped:true,online:false,running:true,error:'Dừng',retryAt:6000,progress:progress({text:'Đã dịch.',leafProgress:{done:1,total:2}})})).toMatchObject({content:'partial',phase:'stopped',label:'Đã dừng',progress:{done:1,total:2}});
 });
 it('configuration errors never appear as scheduled recovery even with stale retry time',()=>{
  expect(aiChapterView({...base,running:true,error:'Sai key',configuration:'keys',retryAt:6000})).toMatchObject({phase:'needs_config',label:'Cần sửa cấu hình'});
 });
 it.each([[false,0,'Chờ kết nối mạng'],[true,2100,'Chờ thử lại · 2 giây'],[true,0,'Chờ điều kiện dịch']] as const)('waiting has an explicit reason online=%s retryAt=%s', (online,retryAt,label)=>{
  expect(aiChapterView({...base,running:true,error:'Gián đoạn',online,retryAt})).toMatchObject({phase:'waiting',label});
 });
 it('legacy complete content never inherits a precise runtime ratio',()=>{
  expect(aiChapterView({...base,complete:true,progress:progress({leafProgress:{done:1,total:2}})})).toMatchObject({content:'complete',label:'Đã xong',progress:undefined});
 });
});
