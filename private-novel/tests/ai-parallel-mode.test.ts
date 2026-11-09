import {expect,it} from 'vitest';
import {AiReadingSession,AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {EpubAiSession} from '../src/features/import-export/services/epub-ai';
const source={bookId:'parallel',id:'one',revision:1,text:'甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800)};
const settings={...AI_DEFAULTS,splitParts:true,fallbackModels:[],addressingRules:'Gọi anh.'};
it('TXT parallel uses one pinned model, independent source spans and one shared addressing rule',async()=>{
 const chapter={...source,text:source.text+'丁'.repeat(1800)},calls:any[]=[];let active=0,max=0;
 const session=new AiReadingSession(async input=>{calls.push(input);max=Math.max(max,++active);await new Promise(r=>setTimeout(r,10));active--;return {result:'Bản dịch phần '+calls.length,model:input.model!,finishReason:'STOP',parallel:2,inputTokens:1,outputTokens:1};});
 try{await session.request(chapter,settings,[]);expect(calls.map(i=>i.text).join('')).toBe(chapter.text);expect(calls).toHaveLength(4);expect(max).toBe(2);expect(new Set(calls.map(i=>i.model)).size).toBe(1);expect(calls.every(i=>!i.continuation&&i.addressingRules==='Gọi anh.')).toBe(true);}finally{session.clear();}
});
it('EPUB split mode validates and reassembles node pieces without changing layout',async()=>{
 const layout={path:'c.xhtml',nodes:['甲'.repeat(1800),'乙'.repeat(1800),'丙'.repeat(1800)],body:'<p><em>source</em></p>',styles:[]},before=JSON.stringify(layout),calls:any[]=[];let active=0,max=0;
 const session=new EpubAiSession(undefined,async input=>{calls.push(input);max=Math.max(max,++active);await new Promise(r=>setTimeout(r,10));active--;return {result:JSON.stringify(Object.fromEntries(Object.keys(JSON.parse(input.text)).map(k=>[k,'Dịch '+k]))),model:input.model!,finishReason:'STOP',parallel:2,inputTokens:1,outputTokens:1};});
 try{const result=await session.request(source,settings,[],layout);expect(result.nodes).toEqual(['Dịch 0','Dịch 1','Dịch 2']);expect(calls).toHaveLength(3);expect(max).toBe(2);expect(JSON.stringify(layout)).toBe(before);expect(new Set(calls.map(i=>i.model)).size).toBe(1);}finally{session.clear();}
});

