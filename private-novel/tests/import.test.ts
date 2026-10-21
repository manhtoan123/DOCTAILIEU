import 'fake-indexeddb/auto';
import {beforeEach,describe,expect,it} from 'vitest';
import {db,commitImport} from '../src/core/db';
import {acceptSourceHash,throwIfImportAborted,importFiles} from '../src/features/import-export/services/importer';
import {assertStorageBudget} from '../src/core/storage';

beforeEach(async()=>{await db.delete();await db.open();});

describe('import staging safeguards',()=>{
  it('enforces one TXT file per story',async()=>{
    const files=[new File(['a'],'a.txt'),new File(['b'],'b.txt')];
    await expect(importFiles(files,'','','',true,()=>{},new AbortController().signal)).rejects.toThrow('một file TXT');
  });

  it('deduplicates an existing hash and records only new hashes',()=>{
    const known=new Set(['same']);
    expect(acceptSourceHash(known,'same')).toBe(false);
    expect(acceptSourceHash(known,'new')).toBe(true);
    expect(known).toEqual(new Set(['same','new']));
  });

  it('stops an import immediately after cancellation',()=>{
    const controller=new AbortController();controller.abort();
    expect(()=>throwIfImportAborted(controller.signal)).toThrow('Đã hủy nhập');
  });

  it('rejects a batch that would cross the safe storage budget',()=>{
    expect(()=>assertStorageBudget({usage:800,quota:1000},101)).toThrow('Không đủ dung lượng');
    expect(()=>assertStorageBudget({usage:100,quota:1000},100)).not.toThrow();
    expect(()=>assertStorageBudget(undefined,10_000_000)).not.toThrow();
  });

  it('commits the book and import job together only from preview',async()=>{
    await db.books.add({id:'book',title:'Thử',author:'',status:'staging',chapterCount:1,charCount:1,createdAt:1,updatedAt:1});
    await db.importJobs.add({jobId:'job',bookId:'book',phase:'preview',totalFiles:1,processedFiles:1,processedBytes:1,checkpoint:1,duplicateFiles:[],updatedAt:1});
    await commitImport('book');
    expect((await db.books.get('book'))?.status).toBe('ready');
    expect((await db.importJobs.get('job'))?.phase).toBe('committed');
  });

  it('does not commit an incomplete checkpoint',async()=>{
    await db.books.add({id:'book',title:'Thử',author:'',status:'staging',chapterCount:1,charCount:1,createdAt:1,updatedAt:1});
    await db.importJobs.add({jobId:'job',bookId:'book',phase:'processing',totalFiles:2,processedFiles:1,processedBytes:1,checkpoint:1,duplicateFiles:[],updatedAt:1});
    await expect(commitImport('book')).rejects.toThrow('chưa hoàn tất');
    expect((await db.books.get('book'))?.status).toBe('staging');
  });
});