import 'fake-indexeddb/auto';
import {it,expect,beforeEach} from 'vitest';
import {db} from '../src/core/db';
import {saveDiscoveredNames} from '../src/features/ai/services/save-discovered-names';
const input={bookId:'b',chapterId:'c',revision:1,source:'林安去白云山。',album:null,baseline:[]};
beforeEach(async()=>{await db.delete();await db.open();await db.books.put({id:'b',title:'Synthetic',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:8});await db.chapters.put({id:'c',bookId:'b',order:0,sourceId:'',title:'Chương một',text:input.source,revision:1});});
it('saves only explicitly selected candidates under canonical keys while leaving the source intact',async()=>{
 expect(await saveDiscoveredNames(input,[{key:'林安',value:'Lâm An'}])).toBe(1);expect(await db.names.toArray()).toMatchObject([{bookId:'b',key:'林安',value:'Lâm An'}]);expect((await db.chapters.get('c'))?.text).toBe(input.source);
});
it('does not overwrite a same-key change made after the scan',async()=>{await db.names.put({id:'n',bookId:'b',key:'林安',value:'Tên ở tab khác'});await expect(saveDiscoveredNames(input,[{key:'林安',value:'Lâm An'}])).rejects.toThrow('đã đổi');expect((await db.names.get('n'))?.value).toBe('Tên ở tab khác');});
it('checks source revision and scope before writing any Name',async()=>{
 await db.chapters.update('c',{revision:2});await expect(saveDiscoveredNames(input,[{key:'林安',value:'Lâm An'}])).rejects.toThrow('Chương');expect(await db.names.count()).toBe(0);
 await db.chapters.update('c',{revision:1});await db.books.update('b',{album:'Tác giả'});await expect(saveDiscoveredNames(input,[{key:'林安',value:'Lâm An'}])).rejects.toThrow('Album');expect(await db.names.count()).toBe(0);
});
it('rejects a chapter hidden during the scan without writing names',async()=>{await db.books.update('b',{hiddenChapterIds:['c']});await expect(saveDiscoveredNames(input,[{key:'林安',value:'Lâm An'}])).rejects.toThrow('không còn khả dụng');expect(await db.names.count()).toBe(0);});
it('rejects unknown keys, empty selection and multiple meanings selected for the same canonical key',async()=>{for(const rows of [[],[{key:'不存在',value:'Không Có'}],[{key:'林安',value:'An'},{key:'$林安',value:'Bình'}]])await expect(saveDiscoveredNames(input,rows)).rejects.toThrow();expect(await db.names.count()).toBe(0);});
