import {it,expect} from 'vitest';
import {LanguageEngine} from '../src/features/names-convert/services/language';
const options={reference:true};
const out=(e:LanguageEngine,s:string,n:{key:string;value:string}[]=[],extra={})=>e.convert(s,n,{...options,...extra}).map(t=>t.targetText).join('');
it('protects names starting inside a longer VP and globally longer overlapping names',()=>{
 const e=new LanguageEngine();e.add('vp','我是李明=wrong whole');e.add('vp','我是=tôi là');e.add('names','李明=Lý Minh');expect(out(e,'我是李明')).toBe('Tôi là Lý Minh');
 e.add('names','甲乙=Short');e.add('names','乙丙丁=Long');e.add('hanviet','甲=giáp');expect(out(e,'甲乙丙丁')).toBe('Giáp Long');
});
it('normalizes both dictionary keys and input before matching; preserves raw offsets',()=>{
 const e=new LanguageEngine();e.add('vp','你好！=xin chào!');e.add('vp','下一行=dòng sau');
 const source='你好 ！\r\n下一行。🙂';const tokens=e.convert(source,[],options);
 expect(tokens.map(t=>t.targetText).join('')).toBe('Xin chào!\nDòng sau. 🙂');
 expect(tokens.map(t=>source.slice(t.sourceStart,t.sourceEnd)).join('')).toBe(source);
 expect(tokens.every(t=>t.source===source.slice(t.sourceStart,t.sourceEnd))).toBe(true);
});
it('uses greedy whole-text rule capture and exact dictionary lookup instead of invented HV fallback',()=>{
 const e=new LanguageEngine();e.add('rules','那些{0}=những {0} đó');e.add('vp','人=người');e.add('vp','来到=đi tới');
 expect(out(e,'那些人来到')).toBe('Những người đi tới đó');
 e.add('rules','不比{0}强=không mạnh bằng {0}');e.add('vp','他=hắn');expect(out(e,'不比他强')).toBe('Không mạnh bằng hắn');
 const s='那些人来到';expect(e.convert(s,[],options).map(t=>t.source).join('')).toBe(s);
});
it('protects Names in rule prefix/suffix as well as capture',()=>{
 const e=new LanguageEngine();e.add('rules','不比{0}强=wrong {0}');e.add('names','比=Tỷ');e.add('vp','不=không');e.add('vp','他强=hắn mạnh');expect(out(e,'不比他强')).toBe('Không Tỷ hắn mạnh');
});
it('uses VP then Chapter then Number then pronouns at equal key length, longest phrase first',()=>{
 const e=new LanguageEngine();e.add('pronouns','他=wrong pronoun');e.add('vp','他=hắn');e.add('chapter','第十章=chương 10');e.add('number','第十章=wrong');e.add('vp','第=thứ');expect(out(e,'第十章他')).toBe('Chương 10 hắn');
});
it('matches multiple-meaning parentheses and keeps protected names single meaning',()=>{
 const e=new LanguageEngine();e.add('names','李明=Lý Minh/Minh');e.add('vp','来到=đi tới/đến');expect(out(e,'李明来到',[],{multipleMeanings:true})).toBe('Lý Minh (đi tới/đến)');
});
it('blacklist and unknown Han are hidden but retained in editable source ranges',()=>{
 const e=new LanguageEngine();e.add('blacklist','广告');e.add('vp','你好=xin chào');const source='广告你好龘';const tokens=e.convert(source,[],options);expect(tokens.map(t=>t.targetText).join('')).toBe('Xin chào');expect(tokens.map(t=>t.source).join('')).toBe(source);
});
it('preserves quote spacing, adjacent closing marks, original English and supplementary Unicode',()=>{
 const e=new LanguageEngine();e.add('vp','他说=hắn nói');e.add('vp','你好=xin chào');expect(out(e,'他说："你好！" hello world🙂')).toBe('Hắn nói: "Xin chào!" hello world🙂');
});
it('omits only identity-mapped 的 after Latin names or closing punctuation',()=>{
 const e=new LanguageEngine();e.add('names','Saber的=Saber的');e.add('vp','”的=」的');e.add('vp','老人的=老人的');
 expect(out(e,'Saber的')).toBe('Saber');
 expect(out(e,'」的')).toBe('」');
 expect(out(e,'老人的')).toBe('老人的');
});
