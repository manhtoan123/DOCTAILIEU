import {afterEach,expect,it,vi} from 'vitest';
import {AI_DEFAULTS,AiReadingSession,aiReadingKey} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
import {AiTranslateClientError,type AiTranslateClientRequest,type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import {splitAiText} from '../src/features/ai/services/ai-parts';
const settings={...AI_DEFAULTS,fallbackModels:[]},source={bookId:'whole-book',id:'whole-chapter',revision:1,text:'甲'.repeat(1800)+'乙'.repeat(1800)};
const result=(text='Bản dịch đủ.',model=settings.model):AiTranslateClientResponse=>({result:text,model,finishReason:'STOP',inputTokens:1,outputTokens:1});
afterEach(()=>vi.restoreAllMocks());
it('sends one full TXT chapter when hybrid is off and keeps complete cache identity',async()=>{
 const send=vi.fn(async(_input:AiTranslateClientRequest)=>result()),session=new AiReadingSession(send),states:any[]=[];await session.request(source,settings,[],undefined,undefined,p=>states.push(p));
 expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0].text).toBe(source.text);expect(states.at(-1)).toMatchObject({total:1,done:1});expect(session.get(aiReadingKey(source,settings,[]))?.result).toBe('Bản dịch đủ.');session.clear();
});
it('splits only at the 32k API limit for a large fresh TXT chapter, without losing characters',async()=>{
 const input={...source,text:'字'.repeat(128000)},send=vi.fn(async input=>result('V'.repeat(input.text.length))),session=new AiReadingSession(send);
 const translated=await session.request(input,settings,[]);expect(send).toHaveBeenCalledTimes(4);expect(send.mock.calls.map(([i])=>i.text).join('')).toBe(input.text);expect(send.mock.calls.every(([i])=>i.text.length<=32000)).toBe(true);expect(translated.result.replaceAll('\n','')).toHaveLength(128000);session.clear();
});
it('whole TXT truncation recovers using saved same-model children, never caches incomplete output',async()=>{
 let fail=true;const saved=new Map<string,AiTranslateClientResponse>(),write=vi.fn(async()=>true),send=vi.fn(async input=>{if(input.text===source.text)throw new AiTranslateClientError('ai_incomplete_result','cut',502,'output_limit');if(input.text.startsWith('乙')&&fail)throw Error('hold');return result(input.text.startsWith('甲')?'Đầu':'Cuối');});
 const session=new AiReadingSession(send,{read:async()=>undefined,write,writePart:async(_s,_t,_n,_p,id,row)=>{saved.set(id,row);return true;}});
 await expect(session.request(source,settings,[])).rejects.toThrow('hold');expect(write).not.toHaveBeenCalled();expect(saved.has('0/0')).toBe(true);fail=false;expect((await session.request(source,settings,[])).result).toBe('Đầu\nCuối');expect(send.mock.calls.filter(([i])=>i.text.startsWith('甲')&&i.text.length<3600)).toHaveLength(1);expect(write).toHaveBeenCalledOnce();session.clear();
});
it('resumes saved legacy TXT spans and pin across retry without misreading them as a whole result',async()=>{
 const oldParts=splitAiText(source.text),oldPlan=JSON.stringify(['txt-parts-2',oldParts.map(p=>[p.start,p.end])]);let fail=true;
 const send=vi.fn(async input=>{expect(input.text).toBe('乙'.repeat(1800));if(fail)throw Error('hold');return result('Cuối');});
 const session=new AiReadingSession(send,{read:async()=>undefined,write:async()=>true,readParts:async(_s,_t,_n,plan)=>plan===oldPlan?[{id:'0',response:result('Đầu')}]:[]});
 await expect(session.request(source,settings,[])).rejects.toThrow('hold');fail=false;expect((await session.request(source,settings,[])).result).toBe('Đầu\nCuối');expect(send).toHaveBeenCalledTimes(2);session.clear();
});
it('sends a complete EPUB chapter in one JSON request and preserves text-node IDs and markup',async()=>{
 const nodes=['甲'.repeat(1800),'乙'.repeat(1800)],layout={path:'one.xhtml',nodes,body:'<p><em>甲</em></p><img src="x.png"><p>乙</p>',styles:[]},before=JSON.stringify(layout),send=vi.fn(async input=>{const row=JSON.parse(input.text);expect(Object.keys(row)).toEqual(['0','1']);return result(JSON.stringify({'0':'Đầu','1':'Cuối'}));}),session=new EpubAiSession(undefined,send);
 expect((await session.request({...source,text:nodes.join('\n')},settings,[],layout)).nodes).toEqual(['Đầu','Cuối']);expect(send).toHaveBeenCalledOnce();expect(JSON.stringify(layout)).toBe(before);session.clear();
});
it('retains legacy EPUB groups instead of treating a saved one-node response as the full chapter',async()=>{
 const nodes=['甲'.repeat(1800),'乙'.repeat(1800)],layout={path:'one.xhtml',nodes,body:'<p/>',styles:[]};
 const send=vi.fn(async input=>{expect(Object.keys(JSON.parse(input.text))).toEqual(['1']);return result(JSON.stringify({'1':'Cuối'}));}),session=new EpubAiSession({read:async()=>undefined,write:async()=>true,readParts:async(_s,_t,_n,plan)=>JSON.parse(plan)[0]==='epub-parts-2'?[{id:'0',response:result(JSON.stringify({'0':'Đầu'}))}]:[]},send);
 expect((await session.request({...source,text:nodes.join('\n')},settings,[],layout)).nodes).toEqual(['Đầu','Cuối']);expect(send).toHaveBeenCalledOnce();session.clear();
});
