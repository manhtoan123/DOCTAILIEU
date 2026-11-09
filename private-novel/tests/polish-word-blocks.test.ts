import {it,expect} from 'vitest';
import type {Token} from '../src/features/names-convert/services/language';
import {untouchedPolishRanges,polishWordBlocks,polishedEpubWords} from '../src/features/reader/services/polish-word-blocks';
const token=(source:string,targetText:string,start:number):Token=>({source,targetText,sourceStart:start,sourceEnd:start+source.length,type:'word',meanings:[],hanviet:''});
it('keeps only untouched suffix words editable after the polished prefix changes length and line count',()=>{
 const tokens=[token('甲','old\n',0),token('乙','tail',1)],base='old\ntail',text='A much longer\npolished prefix\ntail';
 const ranges=untouchedPolishRanges(base,text,{partial:true,sourceEnd:4});
 const rows=polishWordBlocks(text,tokens,ranges),pieces=rows.flat();
 expect(pieces.map(p=>p.text).join('')).toBe(text);expect(pieces.filter(p=>p.token).map(p=>[p.text,p.sourceStart,p.sourceEnd])).toEqual([['tail',1,2]]);
});
it('does not attach an entire source name to a clipped translated token',()=>{
 const text='polished klm';const tokens=[token('甲乙','abcdefghijklm',0)];
 const pieces=polishWordBlocks(text,tokens,untouchedPolishRanges('abcdefghijklm',text,{partial:true,sourceEnd:10})).flat();
 expect(pieces.map(p=>p.text).join('')).toBe(text);expect(pieces.every(p=>!p.token)).toBe(true);
});
it('clips literal source spans exactly and rejects absent or mismatched proof',()=>{
 const ranges=untouchedPolishRanges('abcd','Xcd',{partial:true,sourceEnd:2});
 expect(polishWordBlocks('Xcd',[token('abcd','abcd',5)],ranges).flat().filter(p=>p.token)).toMatchObject([{text:'cd',sourceStart:7,sourceEnd:9,token:{source:'cd',sourceStart:7,sourceEnd:9}}]);
 expect(untouchedPolishRanges('abcd','Xno',{partial:true,sourceEnd:2})).toEqual([]);
 expect(untouchedPolishRanges('abcd','abcd',{sourceEnd:0})).toEqual([]);
});
it('restores skipped TXT words at exact shifted offsets and leaves polished text plain',()=>{
 const base='đầu giữ giữa còn cuối',text='Đã viết lại giữ hay hơn còn kết',
   tokens=[token('甲','đầu ',0),token('乙','giữ',1),token('丙',' giữa ',2),token('丁','còn',3),token('戊',' cuối',4)];
 const fallback=['giữ','còn'].map(word=>({sourceStart:base.indexOf(word),sourceEnd:base.indexOf(word)+word.length,targetStart:text.indexOf(word),targetEnd:text.indexOf(word)+word.length}));
 const ranges=untouchedPolishRanges(base,text,{baseConvert:base,fallback});
 const pieces=polishWordBlocks(text,tokens,ranges).flat();
 expect(pieces.map(p=>p.text).join('')).toBe(text);
 expect(pieces.filter(p=>p.token).map(p=>[p.text,p.token?.source])).toEqual([['giữ','乙'],['còn','丁']]);
 expect(untouchedPolishRanges('Đầu giữ giữa còn cuối',text,{baseConvert:base,fallback})).toEqual([]);
 expect(untouchedPolishRanges(base,text,{fallback})).toEqual([]);
 expect(untouchedPolishRanges(base,text,{baseConvert:base,fallback:[fallback[1],fallback[0]]})).toEqual([]);
 expect(untouchedPolishRanges(base,text.replace('giữ','sai'),{baseConvert:base,fallback})).toEqual([]);
});
it('discards invalid fallback metadata while keeping a proven legacy suffix',()=>{
 const base='abc cuối',text='xyz cuối',suffix={sourceStart:3,sourceEnd:8,targetStart:3,targetEnd:8};
 expect(untouchedPolishRanges(base,text,{partial:true,sourceEnd:3,baseConvert:base,fallback:[suffix]})).toEqual([suffix]);
});
it('keeps only EPUB words fully inside a proven range in the same rendered node',()=>{
 const nodes=['đầu','giữ cụm','cuối'],rendered=['Đầu dài hơn','giữ cụm','Cuối mới'];
 const base=nodes.join('\n'),text=rendered.join('\n');
 const start=base.indexOf(nodes[1]),target=text.indexOf(rendered[1]);
 const words=[{node:0,start:0,end:3,sourceStart:0,sourceEnd:1},{node:1,start:0,end:3,sourceStart:2,sourceEnd:3},{node:1,start:4,end:7,sourceStart:3,sourceEnd:4}];
 const ranges=untouchedPolishRanges(base,text,{baseConvert:base,fallback:[{sourceStart:start,sourceEnd:start+6,targetStart:target,targetEnd:target+6}]});
 expect(polishedEpubWords(words,nodes,rendered,ranges)).toEqual([words[1]]);
 expect(polishedEpubWords(words,nodes,['Đầu dài hơn','', 'giữ cụm'],ranges)).toEqual([]);
});
