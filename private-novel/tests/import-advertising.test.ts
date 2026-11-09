import {describe,it,expect} from 'vitest';
import {cleanImportedTitle,cleanImportedText,isAdvertisingLine,ImportAdvertisingFilter} from '../src/features/import-export/services/import-advertising';
import {StreamingSplitter} from '../src/features/import-export/services/splitter';
describe('conservative import advertisements',()=>{
 it('removes exact source labels without deleting the title',()=>{
  expect(cleanImportedTitle('[Sxsy. Org] [尚香书院] A journey [sxsy.org]')).toBe('A journey');
  expect(cleanImportedTitle('Journey to 尚香书院')).toBe('Journey to 尚香书院');
 });
 it('removes banner wrappers while preserving ordinary separators, prose and Unicode',()=>{
  const input='-----\r\n本文件来自尚香书院。\r\n发布页：sxsy.org\r\n-----\r\nChapter 1\r\nA 🌱 story.\r\n-----\r\nNext scene.\r\n';
  expect(cleanImportedText(input)).toBe('Chapter 1\r\nA 🌱 story.\r\n-----\r\nNext scene.\r\n');
 });
 it('does not delete prose, arbitrary URLs, generic source statements or artwork',()=>{
  for(const line of ['He said sxsy.org was offline.','本文件来自档案馆。','发布页：example.com','Visit https://example.com','签到之后，他回家。','*****'])expect(cleanImportedText(line)).toBe(line);
  expect(isAdvertisingLine('发布页：https://sxsy.org/')).toBe(true);
 });
 it('is idempotent and preserves untouched CRLF and trailing spaces exactly',()=>{
  const text='  A😀  \r\n\r\nB\r\n';expect(cleanImportedText(text)).toBe(text);
  const cleaned=cleanImportedText('[sxsy.org] Chapter 1\n发布页：sxsy.org\nText');expect(cleanImportedText(cleaned)).toBe(cleaned);
 });
 it('does not reinterpret long prose as an advertisement',()=>{
  const text='本文件来自尚香书院。'+ '正文'.repeat(10000);expect(cleanImportedText(text)).toBe(text);
 });
 it('keeps physical line context regardless of decoding and chapter boundaries',()=>{
  const input='-----\r\n本文件来自尚香书院。\r\n发布页：sxsy.org\r\n-----\r\n12345678sxsy.orgabcdefgh\n'+'a'.repeat(5000)+'sxsy.org\r\n';
  for(const chunkSize of [1,7,8,13,4096,262144]){
   const parts:string[]=[],split=new StreamingSplitter('Title',part=>parts.push(part.text),undefined,8,false),filter=new ImportAdvertisingFilter(text=>split.feed(text));
   for(let i=0;i<input.length;i+=chunkSize)filter.feed(input.slice(i,i+chunkSize));filter.feed('',true);split.feed('',true);
   expect(parts.join('')).toBe('12345678sxsy.orgabcdefgh\n'+'a'.repeat(5000)+'sxsy.org\n');
  }
 });
});
