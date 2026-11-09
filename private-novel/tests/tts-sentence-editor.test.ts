import {expect,it} from 'vitest';
import {sentences,ttsPauseText,ttsSentenceDraft} from '../src/features/tts/services/tts';

it.each(['\n','\r\n','\r'])('ends editor rows at %j even without punctuation',newline=>{
 const lines=['Chương 1452: Đại Từ Bi Tự','Trong Đại Tội Ác Tự, ánh sáng chập chờn','Oa Oa ngẩng đầu'];
 expect(ttsSentenceDraft(lines.join(newline))).toEqual(lines);
 expect(ttsSentenceDraft(lines.join(newline+newline))).toEqual(lines);
});
it('keeps punctuation sentence boundaries and skips empty lines',()=>{
 expect(ttsSentenceDraft('Một câu. Câu nữa!\n\nCâu cuối không dấu')).toEqual(['Một câu.',' Câu nữa!','Câu cuối không dấu']);
 expect(ttsSentenceDraft('\r\n\n')).toEqual([]);
});
it('retains whole words and Unicode with the existing gateway size limit',()=>{
 const text=('Người đọc 😀 tiếng Việt '.normalize('NFD')).repeat(30),rows=ttsSentenceDraft(text);
 expect(rows.join('')).toBe(text);
 for(const row of rows){expect(Array.from(row).length).toBeLessThanOrEqual(200);expect(row).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);}
});
it('separates editing rows without changing natural audio batches or line pauses',()=>{
 const source='Chương một\nNàng ngẩng đầu\n“Ta đi đây”';
 expect(ttsSentenceDraft(source)).toEqual(['Chương một','Nàng ngẩng đầu','“Ta đi đây”']);
 const audio=sentences(source,true);
 expect(audio).toEqual([{text:source,start:0,end:source.length}]);
 expect(ttsPauseText(audio[0].text)).toBe('Chương một.\nNàng ngẩng đầu.\n“Ta đi đây”');
});
