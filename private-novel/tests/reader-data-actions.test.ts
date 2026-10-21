import 'fake-indexeddb/auto';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {hashBlob} from '../src/features/import-export/services/backup';
import {createAlbum,getAlbumRegistry,removeEmptyAlbum} from '../src/features/library/services/album-registry';
import {deleteAlbumAndBooks} from '../src/features/library/services/album-removal';
import {editCommonName,readCommonNames} from '../src/features/names-convert/services/common-names';
import {saveConvertNames} from '../src/features/names-convert/services/convert-names';
import {deleteCloudBook,listCloudBooks} from '../src/features/sync-cloud/services/cloud-client';
vi.mock('../src/features/sync-cloud/services/cloud-client',()=>({deleteCloudBook:vi.fn(),listCloudBooks:vi.fn()}));
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('location',{origin:'https://synthetic.example'});vi.mocked(listCloudBooks).mockResolvedValue([]);});
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();vi.unstubAllGlobals();});
const book=(id:string,album:string,status:'ready'|'staging'='ready')=>({id,album,status,title:id,author:'A',createdAt:1,updatedAt:1,charCount:1,chapterCount:1});
it('deletes album books and associated data, preserving another album',async()=>{
 await createAlbum('A');await db.books.bulkPut([book('one','A'),book('other','B')]);await db.names.put({id:'n',bookId:'one',key:'中',value:'Trung'});
 await deleteAlbumAndBooks('A',false);expect(await db.books.get('one')).toBeUndefined();expect(await db.names.count()).toBe(0);expect(await db.books.get('other')).toBeDefined();expect((await getAlbumRegistry()).albums.map(a=>a.name)).toEqual(['B']);
});
it('remote deletion failure keeps local data and album',async()=>{
 await createAlbum('A');await db.books.put(book('one','A'));vi.mocked(deleteCloudBook).mockRejectedValueOnce(new Error('offline'));
 await expect(deleteAlbumAndBooks('A',true)).rejects.toThrow('offline');expect(await db.books.get('one')).toBeDefined();expect((await getAlbumRegistry()).albums).toHaveLength(1);
});
it('stale cloud album metadata never deletes a locally moved book',async()=>{
 await createAlbum('A');await db.books.put(book('one','B'));vi.mocked(listCloudBooks).mockResolvedValue([{...book('one','A')} as never]);
 await deleteAlbumAndBooks('A',true);expect(deleteCloudBook).not.toHaveBeenCalled();expect(await db.books.get('one')).toBeDefined();
});
it('cannot discard an album containing an unfinished import',async()=>{
 const album=await createAlbum('A');await db.books.put(book('stage','A','staging'));await expect(removeEmptyAlbum(album.id)).rejects.toThrow('truyện mới');expect((await getAlbumRegistry()).albums).toHaveLength(1);
});
it('edits actual shared Names, preserves comments, removes duplicates and overrides',async()=>{
 const blob=new Blob(['# comment\n中=Old\n文=Văn\n中=Duplicate']);await db.dictionaries.put({kind:'names',name:'Names.txt',blob,sha256:await hashBlob(blob),updatedAt:1});await saveConvertNames('中=Override');
 await editCommonName('中','Trung');expect(await (await db.dictionaries.get('names'))!.blob.text()).toBe('# comment\n中=Trung\n文=Văn');expect(await readCommonNames()).toEqual([{key:'中',value:'Trung'},{key:'文',value:'Văn'}]);
 await editCommonName('中',null);expect(await readCommonNames()).toEqual([{key:'文',value:'Văn'}]);
});
it('invalid shared name and failed write preserve dictionary and overrides',async()=>{
 await saveConvertNames('中=Override');await expect(editCommonName('中\n文','bad')).rejects.toThrow();vi.spyOn(db.dictionaries,'put').mockRejectedValueOnce(new Error('quota'));
 await expect(editCommonName('中','Trung')).rejects.toThrow('quota');expect(await readCommonNames()).toEqual([{key:'中',value:'Override'}]);expect(await db.dictionaries.count()).toBe(0);
});
