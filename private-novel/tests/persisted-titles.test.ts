import {describe,it,expect,beforeEach,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {db} from '../src/core/db';
import {hasChinese,displayTitle,displaySourceName,sanitizeDownloadFilename,sanitizeSourceFilename} from '../src/features/library/services/title-resolver';

vi.mock('../src/features/names-convert/services/language-client', () => ({
  convert: vi.fn(async (text: string) => {
    const map: Record<string, string> = {
      '山门': 'Sơn môn',
      '第一章 序言': 'Chương 1 lời mở đầu',
      '第二章 启程': 'Chương 2 lên đường',
      '第一章 初见': 'Chương 1 lần đầu gặp',
    };
    if (text.includes('\n')) {
      const parts = text.split('\n');
      return parts.map((p, i) => ({
        targetText: (map[p] || p) + (i < parts.length - 1 ? '\n' : '')
      }));
    }
    return [{ targetText: map[text] || text }];
  }),
  setLanguageStatus: vi.fn(),
  resetLanguage: vi.fn(),
  loadDictionaries: vi.fn(),
  lookup: vi.fn()
}));

import {convertBatchTitles,convertSingleTitle,prepareBookTitles} from '../src/features/names-convert/services/title-converter';
import {convert} from '../src/features/names-convert/services/language-client';
import type {Token} from '../src/features/names-convert/services/language';
import {validateCloudSnapshot} from '../src/features/sync-cloud/services/cloud-snapshot';
import {validateSharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {validateAppendValue} from '../src/features/import-export/services/chapter-append-schema';
import {uid,type Book,type Chapter,type SourceFile} from '../src/core/domain';

describe('TXT persisted titles contract', () => {
  beforeEach(async () => {
    await db.books.clear();
    await db.chapters.clear();
    await db.sources.clear();
    await db.names.clear();
    await db.dictionaries.clear();
    await db.settings.clear();
  });

  describe('title-resolver helpers', () => {
    it('hasChinese accurately detects Han characters', () => {
      expect(hasChinese('山门')).toBe(true);
      expect(hasChinese('第1章 初见')).toBe(true);
      expect(hasChinese('Chương 1: Mở đầu')).toBe(false);
      expect(hasChinese('Chapter 1')).toBe(false);
      expect(hasChinese('123456')).toBe(false);
      expect(hasChinese('')).toBe(false);
      expect(hasChinese(null)).toBe(false);
    });

    it('displayTitle returns displayTitle when present, fallback to raw title', () => {
      expect(displayTitle({title: '山门', displayTitle: 'Sơn môn'})).toBe('Sơn môn');
      expect(displayTitle({title: '山门'})).toBe('山门');
      expect(displayTitle({title: '山门', displayTitle: '   '})).toBe('山门');
      expect(displayTitle(null)).toBe('');
      expect(displayTitle(undefined)).toBe('');
    });

    it('displaySourceName returns displayName when present, fallback to raw name', () => {
      expect(displaySourceName({name: 'shanmen.txt', displayName: 'son_mon.txt'})).toBe('son_mon.txt');
      expect(displaySourceName({name: 'shanmen.txt'})).toBe('shanmen.txt');
      expect(displaySourceName(null)).toBe('');
    });

    it('sanitizeDownloadFilename handles forbidden characters and ensures .txt extension', () => {
      expect(sanitizeDownloadFilename('Truyện/Hay:1*2?3<4>5|6')).toBe('Truyện_Hay_1_2_3_4_5_6.txt');
      expect(sanitizeDownloadFilename('...test.txt')).toBe('test.txt');
      expect(sanitizeDownloadFilename('')).toBe('truyen.txt');
      expect(sanitizeDownloadFilename('Sách đã có.txt')).toBe('Sách đã có.txt');
    });

    it('sanitizeSourceFilename preserves EPUB format and keeps TXT names sanitized', () => {
      expect(sanitizeSourceFilename('Large synthetic.epub', 'epub')).toBe('Large synthetic.epub');
      expect(sanitizeSourceFilename('Sơn môn', 'epub')).toBe('Sơn môn.epub');
      expect(sanitizeSourceFilename('Sơn môn', 'utf-8')).toBe('Sơn môn.txt');
      expect(sanitizeSourceFilename('Truyện/Hay:1', 'epub')).toBe('Truyện_Hay_1.epub');
      expect(sanitizeSourceFilename('', 'epub')).toBe('truyen.epub');
      expect(sanitizeSourceFilename('Sơn môn.txt', 'epub')).toBe('Sơn môn.epub');
      expect(sanitizeSourceFilename('Large synthetic.epub.txt', 'epub')).toBe('Large synthetic.epub');
      const longName = sanitizeSourceFilename('a'.repeat(300) + '.txt', 'epub');
      expect(longName).toHaveLength(255);
      expect(longName.endsWith('.epub')).toBe(true);
    });
  });

  describe('title-converter batch conversion', () => {
    it('returns raw titles immediately when no Chinese is present', async () => {
      const titles = ['Chương 1: Khởi đầu', 'Chương 2: Lên đường'];
      const result = await convertBatchTitles(titles);
      expect(result).toEqual(titles);
    });

    it('returns raw titles if no dictionaries are present', async () => {
      const titles = ['第一章 序言', '第二章 启程'];
      const result = await convertBatchTitles(titles);
      expect(result).toEqual(titles);
    });

    it('converts batch titles when dictionaries are loaded', async () => {
      await db.dictionaries.put({
        kind: 'vp',
        name: 'VP.txt',
        blob: new Blob(['序言=lời mở đầu\n启程=lên đường\n第一章=chương 1\n第二章=chương 2']),
        sha256: 'f1'.repeat(32),
        updatedAt: Date.now()
      });

      const titles = ['第一章 序言', '第二章 启程'];
      const result = await convertBatchTitles(titles);
      expect(result[0]).toContain('Chương 1');
      expect(result[1]).toContain('Chương 2');
    });

    it('converts single title helper', async () => {
      await db.dictionaries.put({
        kind: 'vp',
        name: 'VP.txt',
        blob: new Blob(['山门=sơn môn']),
        sha256: 'f2'.repeat(32),
        updatedAt: Date.now()
      });

      const result = await convertSingleTitle('山门');
      expect(result).toBe('Sơn môn');
    });
  });

  describe('prepareBookTitles on-demand backfill', () => {
    it('atomically updates book, chapters, and source with Vietnamese titles', async () => {
      await db.dictionaries.put({
        kind: 'vp',
        name: 'VP.txt',
        blob: new Blob(['山门=sơn môn\n第一章=chương 1\n初见=lần đầu gặp']),
        sha256: 'f3'.repeat(32),
        updatedAt: Date.now()
      });

      const bookId = uid();
      const sourceId = uid();
      await db.books.add({
        id: bookId,
        title: '山门',
        author: '',
        status: 'ready',
        chapterCount: 1,
        charCount: 10,
        createdAt: 1000,
        updatedAt: 1000
      });
      await db.chapters.add({
        id: uid(),
        bookId,
        order: 0,
        title: '第一章 初见',
        text: 'Nội dung',
        revision: 1,
        sourceId
      });
      await db.sources.add({
        id: sourceId,
        bookId,
        name: '山门.txt',
        relativePath: '山门.txt',
        encoding: 'utf-8',
        sha256: 'e'.repeat(64),
        bytes: 100,
        blob: new Blob(['山门'])
      });

      let reportedDone = 0;
      let reportedTotal = 0;
      const res = await prepareBookTitles(bookId, (done, total) => {
        reportedDone = done;
        reportedTotal = total;
      });

      expect(res.updated).toBe(3);
      expect(reportedDone).toBeGreaterThan(0);
      expect(reportedTotal).toBe(3);

      const updatedBook = await db.books.get(bookId);
      expect(updatedBook?.title).toBe('山门'); // Original title strictly preserved
      expect(updatedBook?.displayTitle).toBe('Sơn môn');

      const updatedChapters = await db.chapters.where('bookId').equals(bookId).toArray();
      expect(updatedChapters[0].title).toBe('第一章 初见'); // Original chapter title preserved
      expect(updatedChapters[0].displayTitle).toContain('Chương 1');

      const updatedSource = await db.sources.get(sourceId);
      expect(updatedSource?.name).toBe('山门.txt'); // Original filename preserved
      expect(updatedSource?.displayName).toBe('Sơn môn.txt');
    });

    it('preserves concurrent chapter/source edits during a gated conversion and never resurrects deleted rows', async () => {
      await db.dictionaries.put({
        kind: 'vp',
        name: 'VP.txt',
        blob: new Blob(['山门=sơn môn']),
        sha256: 'f4'.repeat(32),
        updatedAt: Date.now()
      });

      const bookId = uid();
      const chapterId = uid();
      const deletedChapterId = uid();
      const sourceId = uid();
      await db.books.add({
        id: bookId,
        title: '山门',
        author: '',
        status: 'ready',
        chapterCount: 2,
        charCount: 12,
        createdAt: 1000,
        updatedAt: 1000
      });
      await db.chapters.bulkAdd([
        {id: chapterId, bookId, order: 0, title: '第一章 初见', text: 'original', revision: 1, sourceId},
        {id: deletedChapterId, bookId, order: 1, title: '第二章 启程', text: 'deleted later', revision: 1, sourceId}
      ]);
      await db.sources.add({
        id: sourceId,
        bookId,
        name: '山门.txt',
        relativePath: '山门.txt',
        encoding: 'utf-8',
        sha256: 'e'.repeat(64),
        bytes: 6,
        blob: new Blob(['old'])
      });

      let release: ((tokens: Token[]) => void) | undefined;
      vi.mocked(convert).mockImplementationOnce(() => new Promise<Token[]>(resolve => { release = resolve; }));
      const pending = prepareBookTitles(bookId);
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));

      await db.chapters.update(chapterId, {text: 'user edited', revision: 2});
      await db.sources.update(sourceId, {blob: new Blob(['new source bytes']), bytes: 16, sha256: '1'.repeat(64)});
      await db.chapters.delete(deletedChapterId);
      release!([{sourceStart: 0, sourceEnd: 1, source: '山', targetText: 'Sơn môn', type: 'word', meanings: [], hanviet: ''}]);
      await pending;

      const chapter = await db.chapters.get(chapterId);
      expect(chapter?.text).toBe('user edited');
      expect(chapter?.revision).toBe(2);
      expect(chapter?.displayTitle).toBeTruthy();
      const source = await db.sources.get(sourceId);
      expect(await source!.blob.text()).toBe('new source bytes');
      expect(source?.displayName).toBe('Sơn môn.txt');
      expect(await db.chapters.get(deletedChapterId)).toBeUndefined();
      expect((await db.books.get(bookId))?.displayTitle).toBe('Sơn môn');
    });

    it('skips derived titles whose original titles changed while conversion was waiting', async () => {
      const bookId = uid(), chapterId = uid();
      await db.dictionaries.put({kind:'vp',name:'VP',blob:new Blob(['山=sơn']),sha256:'f'.repeat(64),updatedAt:1});
      await db.books.add({id:bookId,title:'山门',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:4});
      await db.chapters.add({id:chapterId,bookId,order:0,title:'第一章 初见',text:'text',revision:1,sourceId:''});
      let release!: (tokens: Token[]) => void;
      vi.mocked(convert).mockImplementationOnce(() => new Promise<Token[]>(resolve => { release = resolve; }));
      const pending = prepareBookTitles(bookId);
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      await db.books.update(bookId,{title:'New book title'});
      await db.chapters.update(chapterId,{title:'New chapter title',revision:2});
      release([{targetText:'Sơn môn'} as Token]);
      expect(await pending).toEqual({updated:0});
      expect((await db.books.get(bookId))?.displayTitle).toBeUndefined();
      expect((await db.chapters.get(chapterId))?.displayTitle).toBeUndefined();
    });

    it('does not write derived fields after the owning book was removed', async () => {
      const bookId=uid(),chapterId=uid();
      await db.dictionaries.put({kind:'vp',name:'VP',blob:new Blob(['山=sơn']),sha256:'f'.repeat(64),updatedAt:1});
      await db.books.add({id:bookId,title:'山门',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:4});
      await db.chapters.add({id:chapterId,bookId,order:0,title:'第一章 初见',text:'text',revision:1,sourceId:''});
      let release!:(tokens:Token[])=>void;
      vi.mocked(convert).mockImplementationOnce(()=>new Promise<Token[]>(resolve=>{release=resolve;}));
      const pending=prepareBookTitles(bookId);
      await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
      await db.books.delete(bookId);
      release([{targetText:'Sơn môn'} as Token]);
      expect(await pending).toEqual({updated:0});
      expect(await db.books.get(bookId)).toBeUndefined();
      expect((await db.chapters.get(chapterId))?.displayTitle).toBeUndefined();
    });

    it('respects AbortSignal without partial commits', async () => {
      const bookId = uid();
      await db.books.add({
        id: bookId,
        title: '山门',
        author: '',
        status: 'ready',
        chapterCount: 0,
        charCount: 0,
        createdAt: 1000,
        updatedAt: 1000
      });

      const controller = new AbortController();
      controller.abort();

      await expect(prepareBookTitles(bookId, undefined, controller.signal)).rejects.toThrow();
      const book = await db.books.get(bookId);
      expect(book?.displayTitle).toBeUndefined();
    });
  });

  describe('schema and snapshot compatibility', () => {
    it('validateCloudSnapshot accepts book and chapters with and without displayTitle', () => {
      const bookId = '12345678-1234-1234-1234-123456789abc';
      const chapterId = '12345678-1234-1234-1234-123456789def';

      const validWithDisplay = validateCloudSnapshot({
        format: 'thu-phong-cloud',
        version: 1,
        book: {
          id: bookId,
          title: '山门',
          displayTitle: 'Sơn môn',
          author: '',
          createdAt: 1,
          updatedAt: 1,
          status: 'ready',
          chapterCount: 1,
          charCount: 5
        },
        chapters: [{
          id: chapterId,
          bookId,
          order: 0,
          title: '第一章',
          displayTitle: 'Chương 1',
          text: 'hello',
          revision: 1,
          sourceId: ''
        }],
        names: []
      });

      expect(validWithDisplay.book.displayTitle).toBe('Sơn môn');
      expect(validWithDisplay.chapters[0].displayTitle).toBe('Chương 1');

      // Backward compatibility: snapshots without displayTitle
      const validWithoutDisplay = validateCloudSnapshot({
        format: 'thu-phong-cloud',
        version: 1,
        book: {
          id: bookId,
          title: '山门',
          author: '',
          createdAt: 1,
          updatedAt: 1,
          status: 'ready',
          chapterCount: 1,
          charCount: 5
        },
        chapters: [{
          id: chapterId,
          bookId,
          order: 0,
          title: '第一章',
          text: 'hello',
          revision: 1,
          sourceId: ''
        }],
        names: []
      });

      expect(validWithoutDisplay.book.displayTitle).toBeUndefined();
      expect(validWithoutDisplay.chapters[0].displayTitle).toBeUndefined();
    });

    it('shared-state-schema validates book and chapter records with displayTitle', () => {
      const bookRecord = validateSharedRecord({
        kind: 'book',
        bookId: '12345678-1234-1234-1234-123456789abc',
        key: '',
        value: {
          title: '山门',
          displayTitle: 'Sơn môn',
          author: ''
        }
      });
      expect((bookRecord.value as Record<string, unknown>).displayTitle).toBe('Sơn môn');

      const chapterRecord = validateSharedRecord({
        kind: 'chapter',
        bookId: '12345678-1234-1234-1234-123456789abc',
        key: 'ch-1',
        value: {
          baseSha256: '0'.repeat(64),
          sourceHash: '1'.repeat(64),
          sourceRevision: 1,
          chapters: [{
            id: 'ch-1',
            order: 0,
            title: '第一章',
            displayTitle: 'Chương 1',
            text: 'nội dung',
            revision: 2
          }]
        }
      });
      const patch = chapterRecord.value as {chapters: Chapter[]};
      expect(patch.chapters[0].displayTitle).toBe('Chương 1');
    });

    it('chapter-append-schema validates packets with displayTitle', () => {
      const packet = validateAppendValue('chapter-append-packet', '12345678-1234-1234-1234-123456789abc', '12345678-1234-1234-1234-123456789012:0', {
        version: 1,
        updateId: '12345678-1234-1234-1234-123456789012',
        index: 0,
        chapters: [{
          id: 'new-ch-1',
          bookId: '12345678-1234-1234-1234-123456789abc',
          order: 10,
          title: '第十一章',
          displayTitle: 'Chương 11',
          text: 'Chương mới',
          revision: 1,
          sourceId: 'src-1'
        }]
      });
      expect('chapters' in packet && packet.chapters[0].displayTitle).toBe('Chương 11');
    });
  });
});
