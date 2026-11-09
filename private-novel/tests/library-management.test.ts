import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import type {Book} from '../src/core/domain';
import {previewLibraryDeletion,executeLibraryDeletion,renameManagedBook,renameManagedAlbum} from '../src/features/library/services/library-management';
import {getAlbumRegistry,createAlbum,readStoredAlbumRegistry} from '../src/features/library/services/album-registry';
const cloud=vi.hoisted(()=>({rows:[] as any[],list:vi.fn(),remove:vi.fn(),download:vi.fn()}));
vi.mock('../src/features/sync-cloud/services/cloud-client',()=>({listCloudBooks:cloud.list,deleteCloudBook:cloud.remove,downloadCloudBook:cloud.download}));
function book(id:string,album='Author/Series'):Book{return {id,title:id,album,author:'Fixture',status:'ready',chapterCount:1,charCount:10,createdAt:1,updatedAt:2};}
beforeEach(async()=>{
 await db.delete();await db.open();vi.stubGlobal('location',{origin:'https://management.test'});cloud.rows=[];
 cloud.list.mockReset().mockImplementation(async()=>cloud.rows.map(r=>({...r})));
 cloud.remove.mockReset().mockImplementation(async(id:string)=>{cloud.rows=cloud.rows.filter(r=>r.id!==id);});
 cloud.download.mockReset().mockImplementation(async(row:any)=>{if(await db.books.get(row.id))return 'existing';const restored=book(row.id,row.album);await db.books.put(restored);await db.settings.put({key:'shared-download-baseline:'+row.id,value:{book:{title:restored.title,author:restored.author,album:restored.album},names:{}}});return 'added';});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('freezes exact subtree IDs, deduplicates overlapping selections, includes remote-only books and no sibling',async()=>{
 await db.books.bulkPut([book('a'),book('b','Author/Other'),book('keep','Elsewhere')]);cloud.rows=[book('remote'),book('a')];
 const plan=await previewLibraryDeletion(['a'],['Author','Author/Series'],true);
 expect(plan.books.map(b=>b.id).sort()).toEqual(['a','b','remote']);expect(plan.books.find(b=>b.id==='a')).toMatchObject({id:'a',title:'a',album:'Author/Series',updatedAt:2,remote:book('a'),localPresent:true});
 expect(cloud.remove).not.toHaveBeenCalled();expect(await db.books.count()).toBe(3);
});
it('blocks review when the cloud catalog is unavailable, regardless of loaded flag',async()=>{
 await db.books.put(book('a'));cloud.list.mockRejectedValue(new Error('offline'));
 await expect(previewLibraryDeletion(['a'],[],false)).rejects.toThrow('offline');expect(await db.books.get('a')).toBeDefined();
});
it('failed cloud ACK keeps local data and reports partial completion precisely',async()=>{
 await db.books.bulkPut([book('a'),book('b'),book('keep')]);cloud.rows=[book('a'),book('b')];
 const plan=await previewLibraryDeletion(['a','b'],[],true);
 cloud.remove.mockImplementation(async(id:string)=>{if(id==='b')throw Error('no ACK');expect(await db.books.get(id)).toBeDefined();cloud.rows=cloud.rows.filter(r=>r.id!==id);});
 const result=await executeLibraryDeletion(plan);expect(result.completed).toEqual(['a']);expect(result.failed[0].id).toBe('b');expect(await db.books.get('a')).toBeUndefined();expect(await db.books.get('b')).toBeDefined();expect(await db.books.get('keep')).toBeDefined();
});
it('reports cloud completion when its ACK persistence fails, retaining the local book and source progress',async()=>{
 await db.books.put(book('a'));await db.sources.put({id:'source',bookId:'a',name:'x.txt',relativePath:'x.txt',encoding:'utf-8',sha256:'a'.repeat(64),bytes:4,blob:new Blob(['Keep'])});await db.progress.put({bookId:'a',chapterId:'c',paragraph:2,offset:1,revision:1,updatedAt:3});cloud.rows=[book('a')];const plan=await previewLibraryDeletion(['a'],[],true);
 cloud.remove.mockRejectedValue(Object.assign(Error('ACK storage failed'),{cloudDeleted:true,bookId:'a'}));const result=await executeLibraryDeletion(plan);expect(result.cloudDeleted).toEqual(['a']);expect(result.localDeleted).toEqual([]);expect(result.completed).toEqual([]);expect((await db.books.get('a'))?.title).toBe('a');expect(await(await db.sources.get('source'))!.blob.text()).toBe('Keep');expect((await db.progress.get('a'))?.offset).toBe(1);
});
it('changed owner or title after preview stops before the first remote mutation',async()=>{
 await db.books.bulkPut([book('a'),book('b')]);const plan=await previewLibraryDeletion(['a','b'],[],true);
 await db.books.update('b',{title:'changed'});const result=await executeLibraryDeletion(plan);
 expect(result.completed).toEqual([]);expect(result.failed).toHaveLength(1);expect(cloud.remove).not.toHaveBeenCalled();expect(await db.books.count()).toBe(2);
});
it('independent remote content/title changes are rejected even with an unchanged local row',async()=>{
 await db.books.put(book('a'));cloud.rows=[{...book('a'),sha256:'a'.repeat(64),bytes:10}];
 const plan=await previewLibraryDeletion(['a'],[],true);cloud.rows[0].sha256='b'.repeat(64);
 const result=await executeLibraryDeletion(plan);expect(result.failed).toHaveLength(1);expect(cloud.remove).not.toHaveBeenCalled();expect(await db.books.get('a')).toBeDefined();
});
it('a reviewed Album rename is rejected before deleting any reviewed book',async()=>{
 await db.books.put(book('a'));const plan=await previewLibraryDeletion([],['Author'],true);
 const registry=(await readStoredAlbumRegistry())!;registry.albums[0].name='Changed';await db.settings.put({key:'album-registry-v1',value:registry});
 const result=await executeLibraryDeletion(plan);expect(result.failed[0].message).toContain('Album đã thay đổi');expect(cloud.remove).not.toHaveBeenCalled();expect(await db.books.get('a')).toBeDefined();
});
it('move during cloud ACK preserves the changed local copy',async()=>{
 await db.books.put(book('a'));const plan=await previewLibraryDeletion(['a'],[],true);
 cloud.remove.mockImplementation(async()=>{await db.books.update('a',{album:'Moved'});});
 const result=await executeLibraryDeletion(plan);expect(result.completed).toEqual([]);expect(result.cloudDeleted).toEqual(['a']);expect(result.localDeleted).toEqual([]);expect(result.failed[0].message).toContain('giữ bản local');expect((await db.books.get('a'))?.album).toBe('Moved');
});
it('a concurrent new book never joins the frozen batch and keeps the Album',async()=>{
 await db.books.put(book('a'));const plan=await previewLibraryDeletion([],['Author'],true);
 cloud.remove.mockImplementation(async()=>{await db.books.put(book('new'));});
 const result=await executeLibraryDeletion(plan);expect(result.completed).toEqual(['a']);expect(result.failed).toHaveLength(1);expect(await db.books.get('new')).toBeDefined();expect((await readStoredAlbumRegistry())?.albums.length).toBeGreaterThan(0);
});
it('deletes remote-only and local subtree books then removes only reviewed empty registry entries',async()=>{
 await db.books.bulkPut([book('a'),book('keep','Elsewhere')]);cloud.rows=[book('remote')];await createAlbum('Author');
 const plan=await previewLibraryDeletion([],['Author'],true);const result=await executeLibraryDeletion(plan);
 expect(result.failed).toEqual([]);expect(result.completed.sort()).toEqual(['a','remote']);expect(result.removedAlbums).toEqual(['Author/Series','Author']);expect((await db.books.toArray()).map(b=>b.id)).toEqual(['keep']);
});
it('rename updates metadata only, retains exact source, chapters and progress, and rejects stale owner',async()=>{
 await db.books.put(book('a'));await db.sources.put({id:'s',bookId:'a',name:'original.txt',relativePath:'original.txt',encoding:'UTF-8',bytes:3,sha256:'immutable',blob:new Blob(['abc'])});await db.progress.put({bookId:'a',chapterId:'c',paragraph:2,offset:3,revision:1,updatedAt:10});
 const source=await db.sources.get('s'),progress=await db.progress.get('a');await renameManagedBook(book('a'),'New name');
 expect((await db.books.get('a'))?.title).toBe('New name');expect(await db.sources.get('s')).toEqual(source);expect(await db.progress.get('a')).toEqual(progress);
 await db.books.update('a',{album:'Moved'});await expect(renameManagedBook(book('a'),'Bad')).rejects.toThrow('thay đổi');
});
it('renaming author keeps complete Series paths, including cloud-only books, without flattening',async()=>{
 await db.books.put(book('a'));cloud.rows=[book('remote','Author/Remote')];await createAlbum('Author');const author=(await getAlbumRegistry()).albums.find(a=>a.name==='Author')!;
 await renameManagedAlbum(author,'Renamed');expect((await db.books.toArray()).map(b=>b.album).sort()).toEqual(['Renamed/Remote','Renamed/Series']);expect(cloud.download).toHaveBeenCalledTimes(1);
});
it('renames a nested Series prefix and descendants while keeping its parent and stable registry IDs',async()=>{
 await db.books.bulkPut([book('a','Author/Series/Nested'),book('keep','Author/Sibling')]);await createAlbum('Author/Series');
 const before=(await getAlbumRegistry()).albums;const series=before.find(a=>a.name==='Author/Series')!;await renameManagedAlbum(series,'New Series');
 expect((await db.books.get('a'))?.album).toBe('Author/New Series/Nested');expect((await db.books.get('keep'))?.album).toBe('Author/Sibling');
 const after=(await getAlbumRegistry()).albums;expect(after.find(a=>a.id===series.id)?.name).toBe('Author/New Series');expect(after.find(a=>a.id===before.find(a=>a.name==='Author/Series/Nested')!.id)?.name).toBe('Author/New Series/Nested');
});
it('remote-only rename reconciles an immutable old Album snapshot to the current catalog before renaming the subtree',async()=>{
 cloud.rows=[{...book('remote','Current/Sub'),sha256:'a'.repeat(64),bytes:3}];
 cloud.download.mockImplementation(async()=>{const restored=book('remote','Old/Sub');await db.books.put(restored);await db.sources.put({id:'old-source',bookId:'remote',name:'old.txt',relativePath:'Old/Sub/old.txt',encoding:'UTF-8',bytes:3,sha256:'source-sha',blob:new Blob(['abc'])});await db.progress.put({bookId:'remote',chapterId:'c',paragraph:3,offset:2,revision:1,updatedAt:5});await db.settings.put({key:'shared-download-baseline:remote',value:{book:{title:restored.title,author:restored.author,album:restored.album},names:{}}});return 'added';});
 await renameManagedAlbum({id:'',name:'Current',updatedAt:0},'Renamed');
 expect((await db.books.get('remote'))?.album).toBe('Renamed/Sub');expect((await db.progress.get('remote'))?.paragraph).toBe(3);expect((await db.sources.get('old-source'))?.relativePath).toBe('Old/Sub/old.txt');expect(await (await db.sources.get('old-source'))!.blob.text()).toBe('abc');
});
it('materialization refuses to overwrite a local edit that changed the restored baseline',async()=>{
 const remote={...book('remote','Current/Sub'),sha256:'a'.repeat(64),bytes:3};cloud.rows=[remote];
 cloud.download.mockImplementation(async()=>{await db.books.put({...book('remote','Old/Sub'),title:'User changed'});await db.settings.put({key:'shared-download-baseline:remote',value:{book:{title:'remote',author:'Fixture',album:'Old/Sub'},names:{}}});return 'added';});
 await expect(renameManagedBook(remote,'Rename',remote)).rejects.toThrow('đã được chỉnh sửa');expect((await db.books.get('remote'))?.title).toBe('User changed');expect((await db.books.get('remote'))?.album).toBe('Old/Sub');
});
it('retry after failed materialization must not rename an empty catalog label while local remains in the old Album',async()=>{
 await db.books.put(book('remote','Old/Sub'));cloud.rows=[{...book('remote','Current/Sub'),sha256:'a'.repeat(64),bytes:3}];
 await expect(renameManagedAlbum({id:'',name:'Current',updatedAt:0},'New')).rejects.toThrow('Bản local khác Album');
 expect((await db.books.get('remote'))?.album).toBe('Old/Sub');expect((await getAlbumRegistry()).albums.some(a=>a.name==='New')).toBe(false);expect(cloud.download).not.toHaveBeenCalled();
});
it('materialization rolls back metadata and baseline if joining the current author exceeds effective Name capacity',async()=>{
 await db.books.put(book('existing','Current/Sub'));
 // Project the large Name query rather than spending the test on fake-indexeddb's
 // 20,000-row indexing. Membership and metadata rollback still use real IDB state.
 const projected=Array.from({length:20000},(_,index)=>({id:`name-${index}`,bookId:'existing',key:`Name${index}`,value:`Value${index}`}));
 projected.push({id:'extra',bookId:'remote',key:'Extra',value:'Extra'});
 const namesWhere=db.names.where.bind(db.names);
 vi.spyOn(db.names,'where').mockImplementation(((index:string)=>index==='bookId'?{anyOf:(ids:string[])=>({toArray:async()=>projected.filter(row=>ids.includes(row.bookId))})}:namesWhere(index)) as typeof db.names.where);
 const remote={...book('remote','Current/Sub'),sha256:'a'.repeat(64),bytes:3};cloud.rows=[remote];
 cloud.download.mockImplementation(async()=>{await db.books.put(book('remote','Old/Sub'));await db.names.put({id:'extra',bookId:'remote',key:'Extra',value:'Extra'});await db.settings.put({key:'shared-download-baseline:remote',value:{book:{title:'remote',author:'Fixture',album:'Old/Sub'},names:{Extra:'Extra'}}});return 'added';});
 await expect(renameManagedBook(remote,'Rename',remote)).rejects.toThrow('20.000');expect((await db.books.get('remote'))?.album).toBe('Old/Sub');expect((await db.settings.get('shared-download-baseline:remote'))?.value).toMatchObject({book:{album:'Old/Sub'}});expect(await db.names.count()).toBe(1);
});
