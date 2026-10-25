import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {ensureBookNumber,bookIdForNumber} from '../src/features/reader/services/numeric-reader-route';
import {chapterRouteNumber,chapterIdForNumber} from '../src/features/reader/services/chapter-route-number';
import {parseReaderRoute,readerRoutePath} from '../src/features/reader/services/reader-route';
const book='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',origin='https://numeric.test';
beforeEach(async()=>{vi.stubGlobal('location',{origin});vi.stubGlobal('navigator',{onLine:true});await db.delete();await db.open();});
afterEach(async()=>{vi.unstubAllGlobals();await db.delete();});
it('coalesces allocation, persists reciprocal cache and works offline without source writes',async()=>{
 await db.books.put({id:book,title:'Source',author:'',status:'ready',chapterCount:1,charCount:1,createdAt:1,updatedAt:1});const before=await db.books.toArray();
 const fetch=vi.fn(async()=>Response.json({bookId:book,code:31823}));vi.stubGlobal('fetch',fetch);
 expect(await Promise.all([ensureBookNumber(book),ensureBookNumber(book)])).toEqual([31823,31823]);expect(fetch).toHaveBeenCalledTimes(1);
 vi.stubGlobal('navigator',{onLine:false});expect(await bookIdForNumber(31823)).toBe(book);expect(await ensureBookNumber(book)).toBe(31823);expect(fetch).toHaveBeenCalledTimes(1);expect(await db.books.toArray()).toEqual(before);
});
it('rejects mismatched server identity and incomplete/conflicting cache pairs',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({bookId:other,code:31823})));expect(await ensureBookNumber(book)).toBeUndefined();expect(await db.settings.count()).toBe(0);
 await db.settings.bulkPut([{key:`reader-route:${origin}:book:${book}`,value:{bookId:book,code:31823}},{key:`reader-route:${origin}:code:31823`,value:{bookId:other,code:31823}}]);
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({bookId:book,code:31823})));expect(await ensureBookNumber(book)).toBeUndefined();await expect(bookIdForNumber(31823)).rejects.toThrow(/khớp/);
 expect((await db.settings.get(`reader-route:${origin}:code:31823`))?.value).toEqual({bookId:other,code:31823});
});
it('leaves unavailable allocation optional but fails numeric deep-link resolution explicitly',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:404})));expect(await ensureBookNumber(book)).toBeUndefined();await expect(bookIdForNumber(31823)).rejects.toThrow(/404/);expect(await db.settings.count()).toBe(0);
});
it('uses one-based visible TOC position, ignoring heading numbers and fractional order values',()=>{
 const chapters=[{id:'b',title:'Chương 1430',order:1426},{id:'a',title:'Chương 1429',order:1425},{id:'c',title:'Chương 1429',order:1425.5}];
 expect(chapterRouteNumber(chapters,'a')).toBe(1);expect(chapterRouteNumber(chapters,'b')).toBe(3);
 expect(chapterIdForNumber(chapters,2)).toBe('c');expect(chapters[0].id).toBe('b');
 expect(chapterIdForNumber(chapters,0)).toBeUndefined();expect(chapterIdForNumber(chapters,1.5)).toBeUndefined();expect(chapterIdForNumber(chapters,4)).toBeUndefined();
 expect(chapterRouteNumber(chapters,'missing')).toBeUndefined();
});
it('parses numeric paths separately from UUID paths while preserving serialization',()=>{
 expect(parseReaderRoute('/r/31823/1429')).toEqual({kind:'numeric-read',bookCode:31823,chapterNumber:1429});
 expect(readerRoutePath({kind:'read',bookId:book,chapterId:other,bookCode:31823,chapterNumber:1429})).toBe('/r/31823/1429');
 expect(readerRoutePath({kind:'read',bookId:book,chapterId:other,bookCode:31823})).toMatch(/^\/r\/[A-Za-z0-9_-]{22}\//);
 for(const path of ['/r/031823/1429','/r/31823/01429','/r/31823/-1','/r/31823/0','/r/31823/1429/extra'])expect(parseReaderRoute(path)).toEqual({kind:'library'});
});
