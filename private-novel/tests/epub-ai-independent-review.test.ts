import {describe,it,expect} from 'vitest';
import {EpubAiSession,decodeEpubTranslation} from '../src/features/import-export/services/epub-ai';
import {AI_DEFAULTS,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {AiTranslateClientError} from '../src/features/ai/services/ai-translate';

const source={bookId:'review-book',id:'review-chapter',revision:1,text:'甲\n乙'};
const layout={path:'chapter.xhtml',body:'<body><p>甲</p><p>乙</p></body>',styles:[],nodes:['甲','乙']};
const response=(result:string,model=AI_DEFAULTS.model)=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:1});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};

describe('independent EPUB structured AI publication',()=>{
 it('rejects repeated literal or escaped IDs instead of silently accepting JSON.parse overwrite',()=>{
  for(const text of ['{"0":"A","0":"B","1":"C"}','{"0":"A","1":"B","0":"C"}','{"0":"A","\\u0030":"B","1":"C"}'])expect(()=>decodeEpubTranslation(text,['0','1'])).toThrow();
  expect(decodeEpubTranslation('```json\n{"1":"B, } : \\\" quoted","0":"A"}\n```',['0','1'])).toEqual(['A','B, } : " quoted']);
 });
 it('rejects malformed durable mappings before using them and publishes only the complete replacement',async()=>{
  let calls=0,writes=0;const session=new EpubAiSession({read:async()=>response('{"0":"A","0":"B","1":"C"}'),write:async(_source,_settings,_names,result)=>{writes++;expect(JSON.parse(result.result)).toEqual({'0':'甲','1':'乙'});return true;}},async input=>{calls++;return response(input.text,input.model);});
  expect((await session.request(source,AI_DEFAULTS,[],layout)).nodes).toEqual(layout.nodes);expect(calls).toBe(1);expect(writes).toBe(1);
 });
 it('aborts durable reads and permits a new request for the same key before the abandoned read settles',async()=>{
  const oldRead=deferred<undefined>(),entered=deferred<void>();let reads=0,oldSignal:AbortSignal|undefined;const session=new EpubAiSession({read:async(_source,_settings,_names,signal)=>{if(++reads===1){oldSignal=signal;entered.resolve();return oldRead.promise;}return undefined;},write:async()=>true},async input=>response(input.text,input.model));
  const first=session.request(source,AI_DEFAULTS,[],layout);const rejected=expect(first).rejects.toMatchObject({name:'AbortError'});await entered.promise;session.clear();expect(oldSignal?.aborted).toBe(true);const second=session.request(source,AI_DEFAULTS,[],layout);expect(second).not.toBe(first);expect((await second).nodes).toEqual(layout.nodes);oldRead.resolve(undefined);await rejected;expect(session.get(aiReadingKey(source,AI_DEFAULTS,[]))?.nodes).toEqual(layout.nodes);
 });
 it('passes cancellation through durable writes and never caches a late completed write',async()=>{
  const writing=deferred<void>(),release=deferred<boolean>();let writeSignal:AbortSignal|undefined;const session=new EpubAiSession({read:async()=>undefined,write:async(_source,_settings,_names,_result,signal)=>{writeSignal=signal;writing.resolve();return release.promise;}},async input=>response(input.text,input.model));
  const pending=session.request(source,AI_DEFAULTS,[],layout),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});await writing.promise;session.clear();expect(writeSignal?.aborted).toBe(true);release.resolve(false);await rejected;expect(session.get(aiReadingKey(source,AI_DEFAULTS,[]))).toBeUndefined();
 });
 it('does not multiply authentication failures into smaller EPUB requests',async()=>{
  let calls=0,writes=0;const failure=new AiTranslateClientError('ai_unauthorized','Synthetic authentication failure',401);const session=new EpubAiSession({read:async()=>undefined,write:async()=>{writes++;return true;}},async()=>{calls++;throw failure;});
  await expect(session.request(source,AI_DEFAULTS,[],layout)).rejects.toBe(failure);expect(calls).toBe(1);expect(writes).toBe(0);
 });
});
