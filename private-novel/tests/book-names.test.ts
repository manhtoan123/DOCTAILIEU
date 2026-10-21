import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {saveBookNames} from '../src/features/names-convert/services/book-names';
beforeEach(async()=>{await db.delete();await db.open();await db.books.bulkAdd(['a','b'].map(id=>({id,title:id,author:'',status:'ready' as const,createdAt:1,updatedAt:1,chapterCount:0,charCount:0})));await db.names.bulkAdd([{id:'a1',bookId:'a',key:'李',value:'Lý'},{id:'a2',bookId:'a',key:'王',value:'Vương'},{id:'b1',bookId:'b',key:'李',value:'Tên B'}]);});
afterEach(()=>vi.restoreAllMocks());
it('merges only this book, preserves omitted keys and existing identity; last duplicate wins',async()=>{
  expect(await saveBookNames('a','李=Lí\n李=Lý mới\n张=Trương')).toBe(3);
  expect((await db.names.get('a1'))!.value).toBe('Lý mới');expect((await db.names.get('a2'))!.value).toBe('Vương');expect((await db.names.get('b1'))!.value).toBe('Tên B');expect(await db.names.count()).toBe(4);
});
it('empty or invalid-only drafts do not delete saved names',async()=>{
  await saveBookNames('a','');await saveBookNames('a','Không có dấu bằng\n=trống');expect(await db.names.count()).toBe(3);
});
it('rolls back earlier updates if a subsequent write fails',async()=>{
  const put=db.names.put.bind(db.names);let calls=0;vi.spyOn(db.names,'put').mockImplementation((...args:Parameters<typeof put>)=>{if(++calls===2)throw new Error('simulated failure');return put(...args);});
  await expect(saveBookNames('a','李=Changed\n张=New')).rejects.toThrow('simulated failure');expect((await db.names.get('a1'))!.value).toBe('Lý');expect(await db.names.count()).toBe(3);
});
it('rejects oversized entries before writing',async()=>{
  await expect(saveBookNames('a','李=Changed\n'+ '文'.repeat(257)+'=bad')).rejects.toThrow('quá dài');expect((await db.names.get('a1'))!.value).toBe('Lý');
});
it('rejects a deleted or staging book without orphan names',async()=>{
  await db.books.delete('a');await expect(saveBookNames('a','张=New')).rejects.toThrow('không còn');await db.books.update('b',{status:'staging'});await expect(saveBookNames('b','张=New')).rejects.toThrow('không còn');expect(await db.names.count()).toBe(3);
});
