import {db} from '../../../core/db';
import {convert} from './language-client';
import {hasChinese, sanitizeSourceFilename} from '../../library/services/title-resolver';
import {cleanTitle} from '../../../core/domain';

/**
 * Converts a batch of titles in one pass using the shared language worker and convertCache.
 * If no titles contain Han characters or no dictionaries are loaded, returns the raw titles immediately.
 */
export async function convertBatchTitles(titles: string[], names: {key: string; value: string}[] = []): Promise<string[]> {
  if (!titles.length) return [];
  if (!titles.some(t => hasChinese(t))) return [...titles];

  const dictCount = await db.dictionaries.count();
  if (dictCount === 0) return [...titles];

  try {
    const combined = titles.join('\n');
    const tokens = await convert(combined, names, { capitalize: true, standardizePunctuation: true });
    const fullText = tokens.map(t => t.targetText).join('');
    const lines = fullText.split('\n');
    if (lines.length === titles.length) {
      return lines.map((line, idx) => line.trim() || titles[idx]);
    }

    // Fallback if newline splitting was shifted
    const fallbackResults: string[] = [];
    for (const title of titles) {
      if (!hasChinese(title)) {
        fallbackResults.push(title);
      } else {
        try {
          const tTokens = await convert(title, names, { capitalize: true, standardizePunctuation: true });
          const val = tTokens.map(t => t.targetText).join('').trim();
          fallbackResults.push(val || title);
        } catch {
          fallbackResults.push(title);
        }
      }
    }
    return fallbackResults;
  } catch {
    return [...titles];
  }
}

export async function convertSingleTitle(title: string, names: {key: string; value: string}[] = []): Promise<string> {
  const [result] = await convertBatchTitles([title], names);
  return result || title;
}

/**
 * On-demand backfill to prepare persisted Vietnamese titles for an existing book.
 * Updates book.displayTitle, chapter.displayTitle, and source.displayName atomically.
 */
export async function prepareBookTitles(
  bookId: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<{ updated: number }> {
  if (signal?.aborted) throw new DOMException('Đã hủy chuẩn bị tên.', 'AbortError');

  const [book, chapters, sources, names, dictCount] = await Promise.all([
    db.books.get(bookId),
    db.chapters.where('bookId').equals(bookId).sortBy('order'),
    db.sources.where('bookId').equals(bookId).toArray(),
    db.names.where('bookId').equals(bookId).toArray(),
    db.dictionaries.count(),
  ]);

  if (!book || book.status !== 'ready') {
    throw new Error('Truyện không tồn tại hoặc chưa sẵn sàng.');
  }

  // If neither dictionaries nor names exist, cannot convert Chinese to Vietnamese titles
  if (dictCount === 0 && names.length === 0) {
    return { updated: 0 };
  }

  const nameList = names.map(n => ({ key: n.key, value: n.value }));
  const total = chapters.length + 1 + sources.length;
  let done = 0;

  // 1. Convert book title
  let bookDisplayTitle = book.displayTitle;
  if (!bookDisplayTitle && hasChinese(book.title)) {
    const convertedBook = await convertSingleTitle(book.title, nameList);
    if (convertedBook && convertedBook !== book.title) {
      bookDisplayTitle = convertedBook;
    }
  }
  done++;
  onProgress?.(done, total);

  // 2. Convert source names
  const updatedSources = sources.map(s => ({ ...s }));
  for (const s of updatedSources) {
    if (signal?.aborted) throw new DOMException('Đã hủy chuẩn bị tên.', 'AbortError');
    if (!s.displayName && hasChinese(s.name)) {
      const base = cleanTitle(s.name);
      const convertedBase = await convertSingleTitle(base, nameList);
      if (convertedBase && convertedBase !== base) {
        s.displayName = sanitizeSourceFilename(convertedBase, s.encoding);
      }
    }
    done++;
    onProgress?.(done, total);
  }

  // 3. Convert chapter titles in batches of 60
  const BATCH_SIZE = 60;
  const updatedChapters = chapters.map(c => ({ ...c }));
  for (let i = 0; i < updatedChapters.length; i += BATCH_SIZE) {
    if (signal?.aborted) throw new DOMException('Đã hủy chuẩn bị tên.', 'AbortError');
    const batch = updatedChapters.slice(i, i + BATCH_SIZE);
    const needConvert = batch.map(c => !c.displayTitle && hasChinese(c.title));
    if (needConvert.some(Boolean)) {
      const rawTitles = batch.map(c => c.title);
      const converted = await convertBatchTitles(rawTitles, nameList);
      for (let j = 0; j < batch.length; j++) {
        if (needConvert[j]) {
          const conv = converted[j];
          if (conv && conv !== batch[j].title) {
            batch[j].displayTitle = conv;
          }
        }
      }
    }
    done += batch.length;
    onProgress?.(done, total);
  }

  if (signal?.aborted) throw new DOMException('Đã hủy chuẩn bị tên.', 'AbortError');

  const hasBookChange = bookDisplayTitle !== book.displayTitle;
  const changedChapters = updatedChapters.filter((c, idx) => c.displayTitle !== chapters[idx].displayTitle);
  const changedSources = updatedSources.filter((s, idx) => s.displayName !== sources[idx].displayName);

  if (!hasBookChange && changedChapters.length === 0 && changedSources.length === 0) {
    return { updated: 0 };
  }

  // Commit only the derived name fields, and only while the row still matches the
  // snapshot the names were derived from. Writing full snapshot rows (bulkPut)
  // would overwrite concurrent text/revision edits, replace newer source bytes/SHA,
  // and resurrect rows deleted while conversion was waiting.
  const chapterById = new Map(chapters.map(c => [c.id, c]));
  const sourceById = new Map(sources.map(s => [s.id, s]));
  let applied = 0;
  await db.transaction('rw', [db.books, db.chapters, db.sources], async () => {
    if (signal?.aborted) throw new DOMException('Đã hủy chuẩn bị tên.', 'AbortError');
    const currentBook = await db.books.get(bookId);
    if (!currentBook || currentBook.status !== 'ready') return;
    if (hasBookChange) {
      if (currentBook.title === book.title && (currentBook.displayTitle ?? undefined) === (book.displayTitle ?? undefined)) {
        await db.books.update(bookId, { displayTitle: bookDisplayTitle, updatedAt: Date.now() });
        applied++;
      }
    }
    if (changedChapters.length > 0) {
      const currentChapters = await db.chapters.bulkGet(changedChapters.map(c => c.id));
      for (let i = 0; i < changedChapters.length; i++) {
        const next = changedChapters[i], current = currentChapters[i], before = chapterById.get(next.id);
        if (!current || !before || current.bookId !== bookId || current.title !== before.title) continue;
        // Someone else set a title first, or changed identity: keep their edit.
        if ((current.displayTitle ?? undefined) !== (before.displayTitle ?? undefined)) continue;
        await db.chapters.update(next.id, { displayTitle: next.displayTitle });
        applied++;
      }
    }
    if (changedSources.length > 0) {
      const currentSources = await db.sources.bulkGet(changedSources.map(s => s.id));
      for (let i = 0; i < changedSources.length; i++) {
        const next = changedSources[i], current = currentSources[i], before = sourceById.get(next.id);
        if (!current || !before || current.bookId !== bookId || current.name !== before.name || current.encoding !== before.encoding) continue;
        if ((current.displayName ?? undefined) !== (before.displayName ?? undefined)) continue;
        await db.sources.update(next.id, { displayName: next.displayName });
        applied++;
      }
    }
  });

  return { updated: applied };
}
