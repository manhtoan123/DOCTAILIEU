import {expect,it} from 'vitest';
import {sentences,ttsPauseText} from '../src/features/tts/services/tts';

it('adds a full stop only at an unpunctuated real line ending',()=>{
 expect(ttsPauseText('Dòng trên không dấu\nDòng dưới')).toBe('Dòng trên không dấu.\nDòng dưới');
 expect(ttsPauseText('Một dòng không xuống dòng')).toBe('Một dòng không xuống dòng');
 expect(ttsPauseText('Một dòng\r\n\r\nDòng khác\r')).toBe('Một dòng.\r\n\r\nDòng khác.');
});
it('keeps existing pauses and puts the missing stop inside closing dialogue quotes',()=>{
 const text='Đã xong.\nSao?\nĐược!\nChờ…\nTiếp,\nNói:\n';
 expect(ttsPauseText(text)).toBe(text.trimEnd());
 expect(ttsPauseText('“Ta đi đây”  \nDòng sau')).toBe('“Ta đi đây.”\nDòng sau');
 expect(ttsPauseText('“Đã xong.”\nDòng sau')).toBe('“Đã xong.”\nDòng sau');
 expect(ttsPauseText('\n\n!!!\n...\n')).toBe('\n\n!!!\n...');
});
it('keeps source offsets and existing sentence grouping while changing only spoken text',()=>{
 const source='Dòng đầu chưa có dấu\nDòng thứ hai.\nDòng cuối';
 const chunks=sentences(source,true);
 expect(chunks).toHaveLength(1);
 expect(chunks[0].text).toBe(source);expect(chunks[0]).toMatchObject({start:0,end:source.length});
 expect(ttsPauseText(chunks[0].text)).toBe('Dòng đầu chưa có dấu.\nDòng thứ hai.\nDòng cuối');
});
it('keeps spoken requests under the gateway cap even with many short lines and Unicode',()=>{
 for(const source of ['A\n'.repeat(180)+'Cuối',('Từ '.repeat(60)+'😀\n!!!').repeat(4)]){
  const chunks=sentences(source,true);
  for(const chunk of chunks){expect(source.slice(chunk.start,chunk.end)).toBe(chunk.text);expect(Array.from(ttsPauseText(chunk.text)).length).toBeLessThanOrEqual(200);expect(chunk.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);}
 }
});
