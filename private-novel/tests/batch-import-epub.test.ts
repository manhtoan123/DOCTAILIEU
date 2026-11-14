import 'fake-indexeddb/auto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {prepareBatchFiles} from '../src/features/import-export/services/batch-import';

const pkg = vi.hoisted(() => ({open: vi.fn(), read: vi.fn()}));
vi.mock('../src/features/import-export/services/epub-package', () => ({openEpubPackage: pkg.open, readEpubChapter: pkg.read,readEpubChapterParts:async(...args:unknown[])=>{const result=await pkg.read(...args);return Array.isArray(result)?result:[result];}}));

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.stubGlobal('navigator', {storage: {estimate: async () => ({quota: 1e9, usage: 0})}});
  vi.stubGlobal('location', {origin: 'https://synthetic.example'});
  pkg.open.mockImplementation(async (blob: Blob) => ({blob, entries: new Map(), title: 'Archive', author: 'Author', spine: [{path: 'OPS/ch.xhtml', title: 'First'}]}));
  pkg.read.mockResolvedValue({path: 'OPS/ch.xhtml', body: '<body><p>Text</p></body>', styles: [], nodes: ['Text']});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('batch EPUB selection', () => {
  it('keeps two explicitly selected byte-identical EPUBs as independent books', async () => {
    const files = [new File(['same archive bytes'], 'one.epub'), new File(['same archive bytes'], 'two.epub')];
    const result = await prepareBatchFiles(files, 'utf-8', '', true, () => {}, new AbortController().signal);
    expect(result.ids).toHaveLength(2);
    expect(await db.books.count()).toBe(2);
    expect((await db.books.bulkGet(result.ids)).map(book => book?.title)).toEqual(['one', 'two']);
  });
});
