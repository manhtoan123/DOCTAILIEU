import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import Dexie from 'dexie';
import {db} from '../src/core/db';
import {commitBatchImports} from '../src/features/import-export/services/batch-import';
async function preview(){const id=crypto.randomUUID();await db.books.add({id,title:'Preview',author:'',createdAt:1,updatedAt:1,status:'staging',chapterCount:1,charCount:2});await db.importJobs.add({jobId:crypto.randomUUID(),bookId:id,phase:'preview',totalFiles:1,processedFiles:1,processedBytes:2,checkpoint:1,duplicateFiles:[],updatedAt:1});return id;}
beforeEach(async()=>{await db.delete();await db.open();});afterEach(()=>vi.restoreAllMocks());
describe('independent batch commit integrity',()=>{
  it('rolls back an earlier ready transition when the next job write fails',async()=>{
    const ids=[await preview(),await preview()];const beforeBooks=await db.books.toArray(),beforeJobs=await db.importJobs.toArray();
    const update=db.importJobs.update.bind(db.importJobs);let count=0;
    vi.spyOn(db.importJobs,'update').mockImplementation((...args:Parameters<typeof update>)=>{if(++count===2)throw new Error('quota failure');return update(...args);});
    await expect(commitBatchImports(ids)).rejects.toThrow('quota failure');expect(await db.books.toArray()).toEqual(beforeBooks);expect(await db.importJobs.toArray()).toEqual(beforeJobs);
  });
  it('aborting after the first complete nested job rolls back every staging and job mutation',async()=>{
    const ids=[await preview(),await preview()],controller=new AbortController();const beforeBooks=await db.books.toArray(),beforeJobs=await db.importJobs.toArray();
    const update=db.importJobs.update.bind(db.importJobs);let count=0;
    vi.spyOn(db.importJobs,'update').mockImplementation((...args:Parameters<typeof update>)=>update(...args).then(result=>{if(++count===1)controller.abort();return result;}));
    await expect(commitBatchImports(ids,controller.signal)).rejects.toThrow('hủy');expect(await db.books.toArray()).toEqual(beforeBooks);expect(await db.importJobs.toArray()).toEqual(beforeJobs);
  });
  it('an abort delivered after transaction complete cannot turn committed books into failure',async()=>{
    const ids=[await preview(),await preview()],controller=new AbortController();const update=db.books.update.bind(db.books);let installed=false;
    vi.spyOn(db.books,'update').mockImplementation((...args:Parameters<typeof update>)=>{if(!installed){installed=true;let root=Dexie.currentTransaction!;while(root.parent)root=root.parent;root.on('complete',()=>controller.abort());}return update(...args);});
    await expect(commitBatchImports(ids,controller.signal)).resolves.toBeUndefined();expect(controller.signal.aborted).toBe(true);expect((await db.books.toArray()).every(book=>book.status==='ready')).toBe(true);
  });
});
