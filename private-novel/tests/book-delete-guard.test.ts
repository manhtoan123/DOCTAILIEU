import 'fake-indexeddb/auto';
import {beforeEach,it,expect} from 'vitest';
import {db,deleteBook} from '../src/core/db';
beforeEach(async()=>{await db.delete();await db.open();await db.books.add({id:'book',title:'Reviewed',album:'Author/Series',author:'',status:'ready',createdAt:1,updatedAt:2,chapterCount:1,charCount:4});await db.chapters.add({id:'chapter',bookId:'book',title:'One',order:0,text:'Keep',revision:1,sourceId:'source'});await db.sources.add({id:'source',bookId:'book',name:'original.txt',relativePath:'original.txt',encoding:'utf-8',sha256:'a'.repeat(64),bytes:4,blob:new Blob(['Keep'])});await db.progress.add({bookId:'book',chapterId:'chapter',paragraph:0,offset:2,revision:1,updatedAt:3});});
async function counts(){return Promise.all([db.books.count(),db.chapters.count(),db.sources.count(),db.progress.count()]);}
it('checks fresh metadata in the same deletion transaction and preserves all rows if stale',async()=>{
 await db.books.update('book',{album:'Moved',updatedAt:4});await expect(deleteBook('book',book=>{if(book?.album!=='Author/Series'||book.updatedAt!==2)throw Error('stale');})).rejects.toThrow('stale');expect(await counts()).toEqual([1,1,1,1]);expect(await(await db.sources.get('source'))!.blob.text()).toBe('Keep');expect((await db.progress.get('book'))?.offset).toBe(2);
});
it('reads protected-review state inside the destructive transaction to block an already queued purge',async()=>{
 await db.settings.put({key:'protect:book',value:true});await expect(deleteBook('book',async()=>{if(await db.settings.get('protect:book'))throw Error('protected');})).rejects.toThrow('protected');expect(await counts()).toEqual([1,1,1,1]);
});
it('allows reviewed async DB checks and deletes all owned local rows atomically',async()=>{await deleteBook('book',async book=>{expect(book?.title).toBe('Reviewed');expect(await db.settings.get('protect:book')).toBeUndefined();});expect(await counts()).toEqual([0,0,0,0]);});
it('keeps legacy nested rollback transactions compatible without adding a settings-table dependency',async()=>{await db.transaction('rw',[db.books,db.chapters,db.sources,db.progress,db.names,db.importJobs],()=>deleteBook('book'));expect(await counts()).toEqual([0,0,0,0]);});
