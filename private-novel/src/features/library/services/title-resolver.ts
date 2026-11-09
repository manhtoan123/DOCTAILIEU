/**
 * Standard title resolver across all reader surfaces.
 * Reads persisted derived display titles without calling the conversion engine.
 */

export function hasChinese(text?: string | null): boolean {
  if (!text) return false;
  return /[\p{Script=Han}]/u.test(text);
}

export function displayTitle(item?: { displayTitle?: string; title?: string } | null): string {
  if (!item) return '';
  return item.displayTitle?.trim() || item.title || '';
}

export function displaySourceName(source?: { displayName?: string; name: string } | null): string {
  if (!source) return '';
  return source.displayName?.trim() || source.name || '';
}

function sanitizeBase(name: string, fallback: string): string {
  if (!name) return fallback;
  // Replace directory separators and forbidden characters in filenames
  const clean = name.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_').trim().replace(/^\.+/, ''); // Strip leading dots
  return clean || fallback;
}

export function sanitizeDownloadFilename(name: string, fallback = 'truyen.txt'): string {
  const clean = sanitizeBase(name, fallback);
  let stem=clean.replace(/\.txt$/i,'').slice(0,251);
  if (/[\uD800-\uDBFF]$/.test(stem)) stem=stem.slice(0,-1);
  return stem+'.txt';
}

/** Preserve the real format of binary document sources and TXT. */
export function sanitizeSourceFilename(name: string, encoding: string, fallback = 'truyen.txt'): string {
  const extension = ['epub','pdf','docx'].includes(encoding) ? '.'+encoding : '.txt';
  const clean = sanitizeBase(name, extension!=='.txt' ? 'truyen'+extension : fallback);
  // Older derived EPUB names may already end in .txt or .epub.txt.
  const stem = clean.replace(/(?:\.(?:txt|epub|pdf|docx))+$/i, '') || 'truyen';
  let base = stem.slice(0, 255 - extension.length);
  if (/[\uD800-\uDBFF]$/.test(base)) base = base.slice(0, -1);
  return base + extension;
}
