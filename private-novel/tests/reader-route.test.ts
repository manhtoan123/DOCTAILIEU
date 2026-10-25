import {expect,it} from 'vitest';
import {parseReaderRoute,readerRoutePath,type ReaderRoute} from '../src/features/reader/services/reader-route';
it.each<ReaderRoute>([{kind:'library'},{kind:'library',room:'dark'},{kind:'book',bookId:'truyện 1'},{kind:'read',bookId:'book',chapterId:'chương 2'},{kind:'read',bookId:'book'},{kind:'settings',group:'about'},{kind:'settings',group:'names'},{kind:'settings',group:'names',bookId:'truyện 1'},{kind:'settings',group:'ai'}])('round-trips a durable route %j',route=>{
  expect(parseReaderRoute(readerRoutePath(route))).toEqual(route);
});
it.each(['/read/%E0%A4%A/c','/book/%2F','/read/b/%00','/read/b/c/extra','/unknown','/read/','/book/%5C','/settings/names/%2F','/settings/names/%00','/settings/names/book/extra','/settings/prompts/book'])('malformed route %s safely returns the library',path=>{
  expect(parseReaderRoute(path)).toEqual({kind:'library'});
});
it('normalizes settings and keeps chapter identity independent of saved progress',()=>{
  expect(parseReaderRoute('/settings')).toEqual({kind:'settings',group:'dictionary'});
  expect(parseReaderRoute('/settings/unknown')).toEqual({kind:'settings',group:'dictionary'});
  expect(parseReaderRoute('/read/b/c')).toEqual({kind:'read',bookId:'b',chapterId:'c'});
});

it('keeps reader prompt context and aliases the legacy prompt route',()=>{expect(parseReaderRoute('/settings/ai/book')).toEqual({kind:'settings',group:'ai',bookId:'book'});expect(readerRoutePath({kind:'settings',group:'ai',bookId:'book'})).toBe('/settings/ai/book');expect(parseReaderRoute('/settings/prompts')).toEqual({kind:'settings',group:'ai'});});

it.each([
  ['00000000-0000-0000-0000-000000000000','AAAAAAAAAAAAAAAAAAAAAA'],
  ['ffffffff-ffff-ffff-ffff-ffffffffffff','_____________________w'],
])('encodes every UUID bit without truncation: %s',(id,short)=>{
  const route:ReaderRoute={kind:'read',bookId:id,chapterId:id};
  expect(readerRoutePath(route)).toBe(`/r/${short}/${short}`);
  expect(parseReaderRoute(readerRoutePath(route))).toEqual(route);
  expect(parseReaderRoute(`/read/${id}/${id}`)).toEqual(route);
  expect(parseReaderRoute(readerRoutePath({kind:'read',bookId:id}))).toEqual({kind:'read',bookId:id});
});
it('round-trips neighboring IDs, including differences in the final byte',()=>{
  const ids=Array.from({length:256},(_,n)=>`12345678-9abc-def0-1234-56789abcde${n.toString(16).padStart(2,'0')}`);
  const paths=ids.map(chapterId=>readerRoutePath({kind:'read',bookId:ids[0],chapterId}));
  expect(new Set(paths).size).toBe(256);
  paths.forEach((path,n)=>expect(parseReaderRoute(path)).toEqual({kind:'read',bookId:ids[0],chapterId:ids[n]}));
  expect(paths[0].length).toBe(48);
});
it.each(['/r/short','/r/AAAAAAAAAAAAAAAAAAAAAB','/r/AAAAAAAAAAAAAAAAAAAAAA/short','/r/AAAAAAAAAAAAAAAAAAAAAA/AAAAAAAAAAAAAAAAAAAAAB','/r/AAAAAAAAAAAAAAAAAAAAAA/AAAAAAAAAAAAAAAAAAAAAA/extra','/r/AAAAAAAAAAAAAAAAAAAAA%2F'])('rejects malformed or non-canonical short route %s',path=>{
  expect(parseReaderRoute(path)).toEqual({kind:'library'});
});
it('keeps arbitrary legacy IDs and case-sensitive IDs unchanged',()=>{
  expect(readerRoutePath({kind:'read',bookId:'sample',chapterId:'chapter'})).toBe('/read/sample/chapter');
  const bookId='ABCDEFAB-0000-0000-0000-000000000000';
  expect(readerRoutePath({kind:'read',bookId})).toBe(`/read/${bookId}`);
});
