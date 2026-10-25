import {it,expect} from 'vitest';
import {runAiParts} from '../src/features/ai/services/ai-parts';
import {validAiTextMap} from '../src/features/ai/services/ai-text-map';
import {aiNameParagraph} from '../src/features/reader/services/ai-name-paragraph';
it('uses actual assembled part boundaries despite different paragraph counts and completion order',async()=>{
 const source='甲\n乙\n丙\n丁\n戊\n己',parts=[{id:'0',text:source.slice(0,6),start:0,end:6},{id:'1',text:source.slice(6),start:6,end:source.length}];
 const responses=['Một đoạn đã gộp.','Đinh\nMậu\nKỷ'];
 const completed=new Map(parts.map((p,i)=>[p.id,{result:responses[i],model:'test',finishReason:'STOP',inputTokens:1,outputTokens:1}]));
 const result=await runAiParts(parts,new AbortController().signal,completed,async()=>{throw Error('must reuse cached parts');},()=>{});
 expect(validAiTextMap(result.textMap,result.result.length,source.length)).toBe(true);
 const start=result.result.indexOf('Đinh');expect(aiNameParagraph(source,result.result,start,result.textMap,0)?.text).toBe('丁');
 for(const ratio of [0.95,1])expect(aiNameParagraph(source,result.result,0,result.textMap,ratio)?.text).toBe('丙');
 expect(aiNameParagraph(source,result.result,start)?.text).not.toBe('丁');
 expect(result.textMap?.spans[1].translatedStart).toBe(responses[0].length+1);
 expect(aiNameParagraph(source,result.result,result.result.indexOf('Kỷ'),result.textMap,1)?.text).toBe('己');
 expect(validAiTextMap({...result.textMap,sourceLength:99},result.result.length,source.length)).toBe(false);
 const malformed={...result.textMap,spans:[{sourceStart:0,sourceEnd:99,translatedStart:0,translatedEnd:result.result.length}]};
 expect(validAiTextMap(malformed,result.result.length)).toBe(false);
 expect(aiNameParagraph(source,result.result,start,malformed as any)).toEqual(aiNameParagraph(source,result.result,start));
});

it('keeps the source paragraph with greatest overlap when clicks land near either translated edge',()=>{
 const body='林𠮷'.repeat(40),source='甲\r\n'+body+'\r\n乙',translated='Một đoạn dài đã được AI gộp lại.';
 const textMap={version:1 as const,sourceLength:source.length,spans:[{sourceStart:0,sourceEnd:source.length,translatedStart:0,translatedEnd:translated.length}]};
 for(const ratio of [0,0.5,0.95,1]){
  const selected=aiNameParagraph(source,translated,0,textMap,ratio);
  expect(selected?.start).toBe(3);expect(selected?.text).toBe(body);
  expect(source.slice(selected!.start,selected!.start+selected!.text.length)).toBe(body);
 }
});
