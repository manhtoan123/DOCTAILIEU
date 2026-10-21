import {it,expect} from 'vitest';
import {StreamingSplitter,type Part} from '../src/features/import-export/services/splitter';
function split(text:string,chunk=7){const parts:Part[]=[];const s=new StreamingSplitter('Intro',p=>parts.push(p),undefined,0);for(let i=0;i<text.length;i+=chunk)s.feed(text.slice(i,i+chunk));s.feed('',true);expect(parts.map(p=>p.text).join('')).toBe(text);return parts;}
it('keeps translator notices and subsection counters with real SSS chapters',()=>{
 const source='1.由B站原来这是爱啊独家个人汉化，小说已经完结，\n2.本小说完全由个人提取，汉化，打格式，编辑。\n7.切勿传播，切勿传播。\nSSS 级自杀猎人 @新诺亚   第 1 集. 前所未有的嫉妒心.\n===============\n故事。\n第 2 话。但，会死。(1)\n=============\n1.\n技能。\n4.\n继续。\n第 3 话。但，会死。(2)\n结束。';
 const parts=split(source);expect(parts.map(p=>p.title)).toEqual(['Intro','第 1 集. 前所未有的嫉妒心.','第 2 话。但，会死。(1)','第 3 话。但，会死。(2)']);expect(parts[2].text).toContain('\n1.\n技能。\n4.\n');expect(split(source,1)).toEqual(split(source,source.length));
});
it('recognizes paired markdown wrappers and retains every marker in the text',()=>{
 const source='来源说明\n###第一章 醒来就见女魔头###\n故事一。\n###第二章 天音宗掌教红雨叶###\n故事二。';
 expect(split(source).map(p=>p.title)).toEqual(['Intro','第一章 醒来就见女魔头','第二章 天音宗掌教红雨叶']);
});
it('merges whitespace variants only when the earlier heading has no body',()=>{
 const source='第二章 李火旺\n\n  第二章  李火旺\n内容。\n第二章   李火旺\n另一卷的内容。';
 const parts=split(source);expect(parts).toHaveLength(2);expect(parts[0].text).toContain('  第二章  李火旺');expect(parts[1].text).toContain('另一卷');
});
it('retains genuine numbered chapters and respects an explicit custom pattern',()=>{
 const source='0.序\n序文。\n1.秒速一分钟（Ⅰ）\n故事。\n2.秒速一分钟（Ⅱ）\n结束。';expect(split(source).map(p=>p.title)).toEqual(['0.序','1.秒速一分钟（Ⅰ）','2.秒速一分钟（Ⅱ）']);
 const parts:Part[]=[];const s=new StreamingSplitter('Test',p=>parts.push(p),/^\d+\./u,0);s.feed('第1章\n1.\nBody\n2.\nNext',true);expect(parts.map(p=>p.title)).toEqual(['Test','1.','2.']);
});
it('keeps fullwidth attribute gains in a chapter body',()=>{
 const source='第一章 修炼\n故事。\n【修为＋1】\n【气血＋ 1】\n【力量－1】\n继续。\n第二章 出发\n结束。';
 expect(split(source).map(p=>p.title)).toEqual(['第一章 修炼','第二章 出发']);
});
it('an established episode style keeps numbered skill tables and amounts in the body',()=>{
 const source='第 1 集. 开始\n正文。\n第 2 话. 技能\n1. 想成为你这样的人(S+): 被动\n2. 回归者的发条钟(EX): 被动\n3. 无\n4. 无 +\n5 万 3 千金币。\n5 ? 3 ? ?? .\n3 话. 继续\n故事。';
 expect(split(source).map(p=>p.title)).toEqual(['第 1 集. 开始','第 2 话. 技能','3 话. 继续']);
});
it('merges repeated episode markers with source-credit differences without dropping their text',()=>{
 const source='第 398 话。<世界(3)>\n正文。\n398 话。< 世界(3)B站汉化 > 完结399话\n标记。\n399 话 最后(1)\n最后。';
 expect(split(source).map(p=>p.title)).toEqual(['第 398 话。<世界(3)>','399 话 最后(1)']);
});
it('recognizes unspaced episode markers without mistaking an amount or a prose word for an episode',()=>{
 const source='1话. 开始\n1.\n技能。\n2话 <继续>\n正文。\n3话费已经支付。\n3话: 结束\n故事结束。';
 expect(split(source).map(p=>p.title)).toEqual(['1话. 开始','2话 <继续>','3话: 结束']);expect(split(source,1)).toEqual(split(source,source.length));
});
it('splits a numbered episode glued after prose only after its episode style is established',()=>{
 const source='第 194 话. <继续>\n故事。 195 话。< 虽然不是故意的。(3) > 3.\n内容。\n“坠入初恋了。” 196 话. < 镜中 >\n结束。';
 const parts=split(source);expect(parts).toHaveLength(3);expect(parts[0].text).toContain('故事。 ');expect(parts[1].title).toContain('195 话');expect(parts[2].title).toContain('196 话');expect(split(source,1)).toEqual(split(source,source.length));
 expect(split('他笑了。 195 话。< 标题 >\n文字。')).toHaveLength(1);
});
it('does not treat finger-joint prose or an IF scenario sentence as a chapter',()=>{
 const source='第1话. 起点\n第一节和第二节手指骨轻轻地，留下节奏感，抚摸了我的额头。\nIF 场景中，大型公会崩溃了。\n第2话. 终点\n内容。';
 expect(split(source).map(p=>p.title)).toEqual(['第1话. 起点','第2话. 终点']);
});
it('retains a damaged heading only when it is the next episode number',()=>{
 const source='第331话. 开始\n5 ?.\n正文。\n332 ?.\n继续。\n第333话. 结束\n最后。';
 expect(split(source).map(p=>p.title)).toEqual(['第331话. 开始','332 ?.','第333话. 结束']);
 expect(split('正文说明。\n332 ?.\n正文。').map(p=>p.title)).toEqual(['Intro']);
});
