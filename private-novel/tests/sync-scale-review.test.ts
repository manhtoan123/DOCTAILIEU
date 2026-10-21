import 'fake-indexeddb/auto';
import {createHash} from 'node:crypto';
import Dexie from 'dexie';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {syncBookOriginals} from '../src/features/sync-cloud/services/cloud-original-client';
import {originalRevisionKey,pendingOriginalBooks} from '../src/features/sync-cloud/services/original-sync-index';
import * as backup from '../src/features/import-export/services/backup';

const bookId='00000000-0000-4000-8000-000000000811';
const sourceId='00000000-0000-4000-8000-000000000812';
const origin='https://sync-review.test';
const bytes=new Uint8Array([65,66,67]);
const sha256=createHash('sha256').update(bytes).digest('hex');
const book={id:bookId,title:'Synthetic',author:'',status:'ready' as const,chapterCount:1,charCount:3,createdAt:1,updatedAt:1};
const source={id:sourceId,bookId,name:'synthetic.txt',relativePath:'Synthetic/synthetic.txt',encoding:'utf-8',sha256,bytes:bytes.length,blob:new Blob([bytes])};
const descriptor={version:1,sourceId,name:source.name,relativePath:source.relativePath,encoding:source.encoding,sha256,bytes:bytes.length};
const receiptKey=originalRevisionKey(origin,sourceId);
const bookIds=new Set([bookId]);
async function seed(){await db.books.put(book);await db.sources.put(source);}
function ready(){return Response.json({originals:[{descriptor,state:'ready',updatedAt:1}]});}
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('location',{origin});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('regenerates revision for update, modify and bulkPut while preserving caller objects',async()=>{
  await seed();expect(source).not.toHaveProperty('syncRevision');
  let previous=(await db.sources.get(sourceId))!.syncRevision;
  expect(previous).toMatch(/^[a-f0-9-]{36}$/);
  await db.sources.update(sourceId,{blob:new Blob([bytes])});
  let current=(await db.sources.get(sourceId))!.syncRevision;expect(current).not.toBe(previous);previous=current;
  await db.sources.where('bookId').equals(bookId).modify({displayName:'Synthetic'});
  current=(await db.sources.get(sourceId))!.syncRevision;expect(current).not.toBe(previous);
  const caller={...(await db.sources.get(sourceId))!};previous=caller.syncRevision;
  await db.sources.bulkPut([caller]);
  expect(caller.syncRevision).toBe(previous);expect((await db.sources.get(sourceId))!.syncRevision).not.toBe(previous);
});

it('rolls back revised source and receipt together on transaction abort',async()=>{
  await seed();const before=(await db.sources.get(sourceId))!;
  await db.settings.put({key:receiptKey,value:{bookId,revision:before.syncRevision}});
  await expect(db.transaction('rw',[db.sources,db.settings],async()=>{
    await db.sources.update(sourceId,{blob:new Blob([new Uint8Array([88,89,90])])});
    await db.settings.delete(receiptKey);throw new Error('synthetic rollback');
  })).rejects.toThrow('synthetic rollback');
  expect((await db.sources.get(sourceId))!.syncRevision).toBe(before.syncRevision);
  expect(await pendingOriginalBooks(bookIds,origin)).toEqual(new Set());
  expect(await backup.hashBlob((await db.sources.get(sourceId))!.blob)).toBe(sha256);
});

it('does not trust a preexisting original SHA receipt and skips a freshly verified revision',async()=>{
  await seed();await db.settings.put({key:`cloud-original-uploaded:${origin}:${bookId}:${sourceId}:${sha256}`,value:{descriptor,uploadedAt:1}});
  expect(await pendingOriginalBooks(bookIds,origin)).toEqual(bookIds);
  const fetch=vi.fn(async()=>ready());vi.stubGlobal('fetch',fetch);
  expect(await syncBookOriginals(bookId,()=>{},true)).toBe(1);
  expect((await db.settings.get(receiptKey))?.value).toEqual({bookId,revision:(await db.sources.get(sourceId))!.syncRevision});
  const hash=vi.spyOn(backup,'hashBlob');
  expect(await syncBookOriginals(bookId,()=>{},true)).toBe(0);
  expect(fetch).toHaveBeenCalledTimes(1);expect(hash).not.toHaveBeenCalled();
});

it('same-size put after a successful sync cannot retain a valid receipt',async()=>{
  await seed();vi.stubGlobal('fetch',vi.fn(async()=>ready()));await syncBookOriginals(bookId,()=>{},true);
  const before=(await db.sources.get(sourceId))!;
  await db.sources.put({...before,blob:new Blob([new Uint8Array([88,89,90])])});
  const current=(await db.sources.get(sourceId))!;
  expect(current.syncRevision).not.toBe(before.syncRevision);expect(await pendingOriginalBooks(bookIds,origin)).toEqual(bookIds);
  await expect(syncBookOriginals(bookId,()=>{},true)).rejects.toThrow(/checksum/);
  expect((await db.settings.get(receiptKey))?.value).toEqual({bookId,revision:before.syncRevision});
  expect(await pendingOriginalBooks(bookIds,origin)).toEqual(bookIds);
});

it('detects independent connection writes without a revision instead of trusting an earlier receipt',async()=>{
  await seed();vi.stubGlobal('fetch',vi.fn(async()=>ready()));await syncBookOriginals(bookId,()=>{},true);
  const other=new Dexie(db.name);await other.open();
  try{await other.table('sources').put({...source,blob:new Blob([new Uint8Array([88,89,90])])});}
  finally{other.close();}
  expect(await pendingOriginalBooks(bookIds,origin)).toEqual(bookIds);
  await expect(syncBookOriginals(bookId,()=>{},true)).rejects.toThrow(/checksum/);
  expect((await db.sources.get(sourceId))!.syncRevision).toBeUndefined();
});

it('upgrades v3 lazily without changing book, progress, provenance or bytes',async()=>{
  db.close();await Dexie.delete(db.name);const old=new Dexie(db.name);
  old.version(1).stores({books:'id,status,updatedAt',chapters:'id,bookId,[bookId+order]',sources:'id,bookId,sha256',progress:'bookId',names:'id,bookId,[bookId+key]',dictionaries:'kind',settings:'key',restorePackets:'id,backupId,index'});
  old.version(2).stores({importJobs:'jobId,bookId,phase,updatedAt'});
  old.version(3).stores({restoreJobs:'jobId,backupId,bookId,status,updatedAt'});
  await old.open();const progress={bookId,chapterId:'chapter',paragraph:2,offset:1,revision:1,updatedAt:1};
  await old.table('books').put(book);await old.table('sources').put(source);await old.table('progress').put(progress);old.close();
  await db.open();expect(db.verno).toBe(4);
  const migrated=(await db.sources.get(sourceId))!;expect(migrated.syncRevision).toBeUndefined();
  expect(await db.books.get(bookId)).toEqual(book);expect(await db.progress.get(bookId)).toEqual(progress);
  expect(await backup.hashBlob(migrated.blob)).toBe(sha256);expect(migrated.relativePath).toBe(source.relativePath);
  expect(await pendingOriginalBooks(bookIds,origin)).toEqual(bookIds);
  vi.stubGlobal('fetch',vi.fn(async()=>ready()));expect(await syncBookOriginals(bookId,()=>{},true)).toBe(1);
  const verified=(await db.sources.get(sourceId))!;expect(verified.syncRevision).toBeDefined();
  expect((await db.settings.get(receiptKey))?.value).toEqual({bookId,revision:verified.syncRevision});
  expect(await db.books.get(bookId)).toEqual(book);expect(await db.progress.get(bookId)).toEqual(progress);
  expect(await backup.hashBlob(verified.blob)).toBe(sha256);expect(await pendingOriginalBooks(bookIds,origin)).toEqual(new Set());
});
