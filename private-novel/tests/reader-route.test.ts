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
