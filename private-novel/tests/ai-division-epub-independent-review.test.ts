import {expect,it,vi} from 'vitest';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {AI_DEFAULTS,type AiReadingCache} from '../src/features/ai/services/ai-reading';
import {AiTranslateClientError,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';

const source={bookId:'epub-division-review',id:'single',revision:1,text:'这是完整章节。'};
const layout={path:'chapter.xhtml',body:'<body><p>这是完整章节。</p></body>',styles:[],nodes:[source.text]};
const raw:AiTranslateClientResponse={result:JSON.stringify({'0':'Đây là chương đầy đủ.'}),model:AI_DEFAULTS.model,finishReason:'STOP',inputTokens:1,outputTokens:2};

it('records fresh recovered EPUB children as two known parts in the final result and cache',async()=>{
 const longSource={...source,text:'中'.repeat(1000)},longLayout={...layout,nodes:[longSource.text]};
 const write=vi.fn<AiReadingCache['write']>(async()=>true),translate=vi.fn(async input=>{
  const sourceRow=JSON.parse(input.text),keys=Object.keys(sourceRow);
  if(keys[0]==='0')throw new AiTranslateClientError('ai_incomplete_result','cut',502,'output_limit');
  return {...raw,result:JSON.stringify(Object.fromEntries(keys.map(key=>[key,'Đã dịch.'])))};
 });
 const result=await new EpubAiSession({read:async()=>undefined,write},translate,false).request(longSource,AI_DEFAULTS,[],longLayout);
 expect(result.division).toEqual({version:1,parts:2,reasons:['output_limit']});
 expect(write.mock.calls[0][3].division).toEqual(result.division);
 expect(translate).toHaveBeenCalledTimes(3);
});

it('records a fresh whole EPUB request as exactly one part while preserving layout',async()=>{
 const before=JSON.stringify(layout),write=vi.fn<AiReadingCache['write']>(async()=>true),translate=vi.fn(async()=>raw);
 const session=new EpubAiSession({read:async()=>undefined,write},translate,false);
 const result=await session.request(source,AI_DEFAULTS,[],layout);
 expect(result.division).toEqual({version:1,parts:1,reasons:[]});
 expect(write.mock.calls[0][3].division).toEqual(result.division);
 expect(result.nodes).toEqual(['Đây là chương đầy đủ.']);
 expect(JSON.stringify(layout)).toBe(before);
 expect(translate).toHaveBeenCalledOnce();
});

it.each(['whole','part'])('does not invent a one-part fact for a legacy cached %s EPUB aggregate',async kind=>{
 const write=vi.fn<AiReadingCache['write']>(async()=>true),translate=vi.fn(async()=>raw);
 const cache:AiReadingCache={read:async()=>kind==='whole'?raw:undefined,write,readParts:async(_source,_settings,_names,plan)=>kind==='part'&&plan.includes('epub-whole-1')?[{id:'0',response:raw}]:[]};
 const result=await new EpubAiSession(cache,translate,false).request(source,AI_DEFAULTS,[],layout);
 expect(result.division).toBeUndefined();
 expect(translate).not.toHaveBeenCalled();
 expect(result.nodes).toEqual(['Đây là chương đầy đủ.']);
 if(kind==='part')expect(write.mock.calls[0][3].division).toBeUndefined();
});
