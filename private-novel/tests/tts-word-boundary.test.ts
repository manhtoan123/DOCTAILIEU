import {it,expect} from 'vitest';
import {sentences,smallerTtsChunks,type Sentence} from '../src/features/tts/services/tts';
const sample='Lý Thập Ngũ cúi chào, rồi cố gắng trấn tĩnh tinh thần, nói: "Đại khái là, tiền bối một trăm tuổi thì quen biết ta, còn tiền bối hai mươi tuổi thì không quen biết ta, bởi vì một trăm tuổi ở trước hai mươi tuổi, tương đương với việc tiền bối ngài đã trải qua một trăm tuổi trước, rồi mới có hai mươi tuổi.';
function exact(text:string,list:Sentence[],cap:number,offset=0){expect(list.map(s=>s.text).join('')).toBe(text);for(const s of list){expect(text.slice(s.start-offset,s.end-offset)).toBe(s.text);expect(Array.from(s.text).length).toBeLessThanOrEqual(cap);}for(let i=0;i<list.length-1;i++)expect(/[\p{L}\p{M}]$/u.test(list[i].text)&&/^[\p{L}\p{M}]/u.test(list[i+1].text)).toBe(false);}
it('keeps the reported mươi intact and prefers clause pauses without altering any text',()=>{
 expect(Array.from(sample).slice(0,200).join('')).toMatch(/hai m$/);const list=sentences(sample);exact(sample,list,200);expect(list.some(s=>s.text.includes('trước hai mươi tuổi'))).toBe(true);expect(list[0].text.trimEnd()).toMatch(/ta,$/);
});
it('unpunctuated Vietnamese and decomposed accents stay on whole-word boundaries',()=>{
 for(const text of [('Từ '.repeat(65)+'hai mươi tuổi ').repeat(20),('Người đọc tiếng Việt '.normalize('NFD')).repeat(150)]){const list=sentences(text);exact(text,list,200);expect(list.every(s=>!/^\p{M}/u.test(s.text))).toBe(true);}
});
it('100-codepoint recovery also keeps words and exact nonzero cursor offsets',()=>{
 const text=('Từ '.repeat(31)+'hai mươi tuổi ').repeat(3),list=smallerTtsChunks({text,start:27,end:27+text.length});exact(text,list,100,27);
});
it('unbroken oversized tokens still make bounded progress with intact surrogate pairs',()=>{
 const text='字😀'.repeat(1600),list=sentences(text);expect(list.map(s=>s.text).join('')).toBe(text);for(const s of list){expect(Array.from(s.text).length).toBeLessThanOrEqual(200);expect(text.slice(s.start,s.end)).toBe(s.text);expect(s.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);}
});
it('groups short dialogue sentences when flex is enabled and preserves exact offsets',()=>{
 const dialogue='Được.\nNàng đi đâu?\nTa đi dạo quanh đây.\nCó mệt không?\nKhông sao cả.\nVậy chúng ta cùng đi nhé.';
 const raw=sentences(dialogue,false);
 expect(raw).toHaveLength(6);
 const grouped=sentences(dialogue,true);
 expect(grouped.length).toBeLessThan(raw.length);
 for(const s of grouped){
   expect(dialogue.slice(s.start,s.end)).toBe(s.text);
   expect(Array.from(s.text).length).toBeLessThanOrEqual(160);
 }
 expect(grouped[0].text).toContain('Được.');
 expect(grouped[0].text).toContain('Nàng đi đâu?');
});

