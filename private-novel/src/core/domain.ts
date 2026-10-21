export interface Book { id: string; title: string; author: string; displayTitle?: string; hiddenChapterIds?:string[]; album?: string; cover?:import('../features/sync-cloud/services/shared-image-schema').SharedImage; epub?:import('../features/import-export/services/epub-layout-schema').EpubBook; createdAt: number; updatedAt: number; status: 'staging'|'ready'; chapterCount: number; charCount: number }
export const isHiddenChapter=(book:Pick<Book,'hiddenChapterIds'>|undefined,id:string)=>book?.hiddenChapterIds?.includes(id)??false;
export interface Chapter { id: string; bookId: string; order: number; title: string; text: string; revision: number; sourceId: string; displayTitle?: string; epub?:import('../features/import-export/services/epub-layout-schema').EpubLayout }
export interface SourceFile { id: string; bookId: string; name: string; relativePath: string; encoding: string; sha256: string; bytes: number; blob: Blob; dataStatus?: 'missing'; displayName?: string; syncRevision?: string }
export interface Progress { bookId: string; chapterId: string; paragraph: number; offset: number; revision: number; updatedAt: number; mode?:'ai' }
export interface NameEntry { id: string; bookId: string; key: string; value: string }
export const dictionaryKinds=['vp','names','names2','hanviet','rules','chapter','number','pronouns','blacklist','english'] as const;
export type DictKind = typeof dictionaryKinds[number];
export interface DictionaryFile { kind: DictKind; name: string; blob: Blob; sha256:string; updatedAt: number }
export type ImportPhase = 'processing'|'preview'|'committed'|'failed';
export interface ImportJob { jobId:string; bookId:string; phase:ImportPhase; totalFiles:number; processedFiles:number; processedBytes:number; checkpoint:number; duplicateFiles:string[]; updatedAt:number; error?:string }
export type BackupMode = 'compact'|'portable';
export interface BackupOptions { mode?: BackupMode; includeSources?: boolean; includeDictionaries?: boolean }
export interface RestoreOptions { onConflict?: 'rename'|'replace'|'keep-both'; targetTitle?: string; restoreDictionaries?: boolean }
export interface RestoreConflict { bookExists: boolean; existingBookId?: string; existingBookTitle?: string; sameHash: boolean; missingDictionaries: { kind: DictKind; name: string; sha256: string }[]; providedDictionaries: { kind: DictKind; name: string; sha256: string }[]; availableDictionaries: { kind: DictKind; name: string; sha256: string }[]; hasSourceFiles: boolean }
export type RestoreJobStatus = 'staging'|'preview'|'committed'|'failed';
export interface RestoreJob { jobId: string; backupId: string; bookId: string; mode: BackupMode; status: RestoreJobStatus; conflicts?: RestoreConflict; updatedAt: number; error?: string }
export interface BackupSourceData { id: string; name: string; displayName?: string; relativePath: string; encoding: string; sha256: string; bytes: number; dataBase64?: string; dataStatus?: 'missing' }
export interface BackupDictionaryData { kind: DictKind; name: string; sha256: string; dataBase64?: string }
export interface BackupManifest { format: 'thu-phong'; version: number; appVersion: string; backupId: string; mode: BackupMode; createdAt: number; book: { title: string; author: string; chapterCount: number; charCount: number; originalId: string }; dictionaryRequirements: { kind: DictKind; name: string; sha256: string }[]; sources: { id: string; name: string; encoding: string; sha256: string; bytes: number }[]; hasSourceData: boolean; hasDictionaryData: boolean }
export interface ReaderSettings { libraryBackground?:import('../features/sync-cloud/services/shared-image-schema').SharedImage|null;  theme: 'light'|'sepia'|'dark'|'gray'; font: 'serif'|'sans'|'arial'|'tahoma'|'times'|'palatino'; fontSize: number; lineHeight: number; width: number; voiceId:string; ttsRate:number; ttsPitch:number; ttsFlex:number; highlightColor:string; background?:string; textColor?:string; align?:'left'|'center'|'right'|'justify'; textShadow?:boolean }
export const defaults: ReaderSettings = {theme:'sepia',font:'arial',fontSize:19,lineHeight:1.65,width:760,voiceId:'tiktok-female-1',ttsRate:1,ttsPitch:1,ttsFlex:0,highlightColor:'#ffff00',background:'',textColor:'',align:'left',textShadow:false};
export function uid() { return crypto.randomUUID(); }
export function cleanTitle(name: string) { return name.replace(/\.[^.]+$/, '').replace(/[_]/g, ' '); }
export function formatBytes(n: number) { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`; }
export function parseEntry(line: string): [string,string]|null {
  const s=line.replace(/^\uFEFF/, '').trim(); if(!s || s.startsWith('#')) return null;
  const p=s.indexOf('='); if(p<=0 || !s.slice(p+1).trim()) return null;
  return [s.slice(0,p).trim(),s.slice(p+1).trim()];
}
export function paragraphRanges(text: string) {
  const result: {start:number; text:string}[]=[];
  const re=/[^\n]*\n|[^\n]+$/g; for(const m of text.matchAll(re)) result.push({start:m.index!,text:m[0]});
  return result;
}
