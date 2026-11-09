import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {getAlbumRegistry,renameAlbum,moveBookToAlbum,removeAlbum} from '../src/features/library/services/album-registry';
import {readNameScope,saveScopedBookNames,deleteScopedBookName} from '../src/features/names-convert/services/scoped-names';
import {prepareBackup,stageBackup,restoreBackup} from '../src/features/import-export/services/backup';
import {albumNameKey,albumNameSetting} from '../src/features/names-convert/services/album-name-schema';
import {sharedRecordId,type SharedRecord} from '../src/features/sync-cloud/services/shared-state-schema';
import {syncSharedState,resolveSharedState,readSharedReplica,SHARED_STATE_KEY} from '../src/features/sync-cloud/services/shared-state-sync';
import {restoreCloudSnapshot,contentHash} from '../src/features/sync-cloud/services/cloud-snapshot';

beforeEach(async()=>{
 await db.delete();await db.open();
 await db.books.bulkAdd([
  {id:'a',title:'A',author:'',album:'AuthorA',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:4},
  {id:'b',title:'B',author:'',album:'AuthorB',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:4},
 ]);
 await db.chapters.bulkAdd([
  {id:'a-chapter',bookId:'a',order:0,title:'Chapter',text:'text',revision:1,sourceId:''},
  {id:'b-chapter',bookId:'b',order:0,title:'Chapter',text:'text',revision:1,sourceId:''},
 ]);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function seedAuthorPool(count:number){
 await db.settings.bulkAdd(Array.from({length:count},(_,i)=>{const key=albumNameKey('AuthorA','旧'+i);return {key:albumNameSetting(key),value:{kind:'album-name',key,value:'Current '+i}};}));
}
async function seedPrivateDisagreement(){
 await db.books.update('b',{album:'AuthorA'});
 await db.books.add({id:'c',title:'C',author:'',album:'AuthorA',status:'ready',createdAt:1,updatedAt:1,chapterCount:0,charCount:0});
 await db.names.bulkAdd([{id:'b-disagree',bookId:'b',key:'冲',value:'B meaning'},{id:'c-disagree',bookId:'c',key:'冲',value:'C meaning'}]);
}
async function receiveSyntheticGlobalName(){
 const origin='https://integrity-review.invalid';vi.stubGlobal('location',{origin});
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}});
 const record:SharedRecord={kind:'album-name',key:albumNameKey('AuthorA','新'),value:'Remote new'},remote={id:await sharedRecordId(record),revision:1,record};let delivered=false;
 vi.stubGlobal('fetch',vi.fn(async(input:string,init?:RequestInit)=>{
  if(init?.method==='PUT')throw Error('Synthetic review forbids publication');
  const url=new URL(input,origin);
  if(url.searchParams.has('head'))return Response.json({rows:[],cursor:0,more:false});
  if(url.searchParams.has('book'))return Response.json({error:'Synthetic later scope unavailable'},{status:503});
  delivered=true;return Response.json({rows:[remote],cursor:1,more:false});
 }));
 await syncSharedState();expect(delivered).toBe(true);
}

it('keeps conservative rename collision policy when the former author namespace has tombstones',async()=>{
 const album=(await getAlbumRegistry()).albums.find(a=>a.name==='AuthorA')!;
 await saveScopedBookNames('a','甲=Name A');
 await renameAlbum(album.id,'Renamed');
 await expect(renameAlbum(album.id,'AuthorA')).rejects.toThrow('Album đích đã có kho Name');
 expect((await db.books.get('a'))?.album).toBe('Renamed');
 expect((await readNameScope('a')).rows).toEqual(expect.arrayContaining([expect.objectContaining({key:'甲',value:'Name A'})]));
});

it('backup never attaches Names from a concurrently selected author to old author metadata',async()=>{
 await saveScopedBookNames('a','甲=Name A');
 await saveScopedBookNames('b','乙=Name B');
 const get=db.books.get.bind(db.books);let first=true,move:Promise<unknown>|undefined;
 vi.spyOn(db.books,'get').mockImplementation((async(...args:Parameters<typeof get>)=>{
  const captured=await get(...args);
  if(first){first=false;move=Dexie.ignoreTransaction(()=>db.books.update('a',{album:'AuthorB'}));}
  return captured;
 }) as typeof db.books.get);
 const backup=await prepareBackup('a');await move;
 const part=await backup.part(0);
 vi.restoreAllMocks();
 const packet=JSON.parse(await part.blob.text()),body=JSON.parse(packet.body);
 expect(body.book.album).toBe('AuthorA');
 const [id]=await stageBackup([new File([part.blob],part.name)],()=>{});
 const restored=await restoreBackup(id);
 // Scope changes must reject the export or yield one consistent author snapshot.
 expect((await readNameScope(restored)).rows).not.toEqual(expect.arrayContaining([expect.objectContaining({key:'乙',value:'Name B'})]));
});

it('restore does not silently replace a live legacy meaning in another book of the same author',async()=>{
 await saveScopedBookNames('a','甲=Backup meaning');
 const part=await(await prepareBackup('a')).part(0);
 await db.settings.clear();
 await db.books.update('b',{album:'AuthorA'});
 await db.names.add({id:'legacy-current',bookId:'a',key:'甲',value:'Current meaning'});
 expect((await readNameScope('a')).rows).toEqual(expect.arrayContaining([expect.objectContaining({key:'甲',value:'Current meaning'})]));
 const [id]=await stageBackup([new File([part.blob],part.name)],()=>{});
 await restoreBackup(id);
 expect((await readNameScope('a')).rows).toEqual(expect.arrayContaining([expect.objectContaining({key:'甲',value:'Current meaning'})]));
 expect((await readNameScope('b')).rows).toEqual(expect.arrayContaining([expect.objectContaining({key:'甲',value:'Current meaning'})]));
});

it('restore does not resolve existing legacy disagreements for all author members',async()=>{
 await saveScopedBookNames('a','甲=Backup meaning');
 const part=await(await prepareBackup('a')).part(0);
 await db.settings.clear();await db.books.update('b',{album:'AuthorA'});
 await db.names.bulkAdd([
  {id:'legacy-a',bookId:'a',key:'甲',value:'A current'},
  {id:'legacy-b',bookId:'b',key:'甲',value:'B current'},
 ]);
 const [id]=await stageBackup([new File([part.blob],part.name)],()=>{});
 await restoreBackup(id);
 expect((await readNameScope('a')).rows).toEqual(expect.arrayContaining([expect.objectContaining({key:'甲',value:'A current'})]));
 expect((await readNameScope('b')).rows).toEqual(expect.arrayContaining([expect.objectContaining({key:'甲',value:'B current'})]));
 expect((await readNameScope('a')).conflicts).toBe(1);
});

it('legacy-only backup preserves a current meaning inherited by another author member',async()=>{
 await db.names.add({id:'legacy-a',bookId:'a',key:'甲',value:'Backup meaning'});
 const part=await(await prepareBackup('a')).part(0);
 const body=JSON.parse(JSON.parse(await part.blob.text()).body);expect(body.albumNames).toBeUndefined();
 await db.names.update('legacy-a',{value:'Current meaning'});await db.books.update('b',{album:'AuthorA'});
 expect((await readNameScope('b')).rows).toEqual(expect.arrayContaining([expect.objectContaining({key:'甲',value:'Current meaning'})]));
 const [id]=await stageBackup([new File([part.blob],part.name)],()=>{});
 await restoreBackup(id);
 expect((await readNameScope('a')).rows).toEqual(expect.arrayContaining([expect.objectContaining({key:'甲',value:'Current meaning'})]));
 expect((await readNameScope('b')).rows).toEqual(expect.arrayContaining([expect.objectContaining({key:'甲',value:'Current meaning'})]));
});

it('fresh author restore retains imported tombstones and masks later legacy fallback',async()=>{
 await db.names.add({id:'legacy-source',bookId:'a',key:'甲',value:'Old legacy'});
 await deleteScopedBookName('a','甲');const part=await(await prepareBackup('a')).part(0);
 await db.delete();await db.open();
 const [id]=await stageBackup([new File([part.blob],part.name)],()=>{}),restored=await restoreBackup(id);
 const key=albumNameKey('AuthorA','甲');
 expect((await db.settings.get(albumNameSetting(key)))?.value).toEqual({kind:'album-name',key,value:null});
 await db.names.add({id:'later-legacy',bookId:restored,key:'甲',value:'Later legacy'});
 expect((await readNameScope(restored)).rows).not.toEqual(expect.arrayContaining([expect.objectContaining({key:'甲'})]));
});

it('restore refuses an author union beyond resolver capacity before activating the new book',async()=>{
 await saveScopedBookNames('a','新=Backup new');
 const part=await(await prepareBackup('a')).part(0);
 await db.settings.clear();
 await seedAuthorPool(20000);
 const before=await db.books.count();
 const [id]=await stageBackup([new File([part.blob],part.name)],()=>{});
 await expect(restoreBackup(id)).rejects.toThrow('20.000');
 expect(await db.books.count()).toBe(before);
 expect((await readNameScope('a')).rows).toHaveLength(20000);
},30000);

it('public shared sync does not commit a remote author Name that makes all local members unreadable',async()=>{
 await seedAuthorPool(20000);await receiveSyntheticGlobalName();
 expect((await readNameScope('a')).rows).toHaveLength(20000);
},30000);

it('restore validates the author member with private conflict keys rather than only the restored book',async()=>{
 await saveScopedBookNames('a','新=Backup new');const part=await(await prepareBackup('a')).part(0);await db.settings.clear();
 await seedAuthorPool(19999);await seedPrivateDisagreement();
 expect((await readNameScope('a')).rows).toHaveLength(19999);expect((await readNameScope('b')).rows).toHaveLength(20000);
 const before=await db.books.count(),[id]=await stageBackup([new File([part.blob],part.name)],()=>{});
 await expect(restoreBackup(id)).rejects.toThrow('20.000');
 expect(await db.books.count()).toBe(before);expect((await readNameScope('b')).rows).toHaveLength(20000);
},30000);

it('public shared sync validates the worst member when another author member still fits capacity',async()=>{
 await seedAuthorPool(19999);await seedPrivateDisagreement();
 expect((await readNameScope('a')).rows).toHaveLength(19999);expect((await readNameScope('b')).rows).toHaveLength(20000);
 await receiveSyntheticGlobalName();
 expect((await readNameScope('b')).rows).toHaveLength(20000);expect((await readNameScope('a')).rows).toHaveLength(19999);
},30000);

it('public Album move rolls back membership when the author union would exceed capacity',async()=>{
 await seedAuthorPool(20000);await db.names.add({id:'b-new',bookId:'b',key:'新',value:'B meaning'});
 const target=(await getAlbumRegistry()).albums.find(album=>album.name==='AuthorA')!;
 await expect(moveBookToAlbum('b',target.id)).rejects.toThrow('20.000');
 expect((await db.books.get('b'))?.album).toBe('AuthorB');expect((await readNameScope('a')).rows).toHaveLength(20000);
},30000);

it('public Album rename cannot move private Names into a full author tree',async()=>{
 await seedAuthorPool(20000);await db.names.add({id:'b-new',bookId:'b',key:'新',value:'B meaning'});
 const source=(await getAlbumRegistry()).albums.find(album=>album.name==='AuthorB')!;
 await expect(renameAlbum(source.id,'AuthorA/Series')).rejects.toThrow('20.000');
 expect((await db.books.get('b'))?.album).toBe('AuthorB');expect((await readNameScope('a')).rows).toHaveLength(20000);
},30000);

it('public Album removal rolls back when removing one legacy meaning overflows remaining series readers',async()=>{
 await seedAuthorPool(19999);await db.books.update('b',{album:'AuthorA/Series'});
 await db.books.bulkAdd(['c','d'].map(id=>({id,title:id,author:'',album:'AuthorA/Series',status:'ready' as const,createdAt:1,updatedAt:1,chapterCount:0,charCount:0})));
 await db.names.bulkAdd([
  {id:'a-one',bookId:'a',key:'冲一',value:'A'}, {id:'b-one',bookId:'b',key:'冲一',value:'B'},
  {id:'c-two',bookId:'c',key:'冲二',value:'C'}, {id:'d-two',bookId:'d',key:'冲二',value:'D'},
 ]);
 const source=(await getAlbumRegistry()).albums.find(album=>album.name==='AuthorA')!;
 expect((await readNameScope('c')).rows).toHaveLength(20000);
 await expect(removeAlbum(source.id)).rejects.toThrow('20.000');
 expect((await db.books.get('a'))?.album).toBe('AuthorA');expect((await readNameScope('c')).rows).toHaveLength(20000);
},30000);

it('public cloud restore rolls back every new book/chapter/Name when the author union would exceed capacity',async()=>{
 await seedAuthorPool(20000);vi.stubGlobal('navigator',{storage:{estimate:async()=>undefined}});
 const bookId='00000000-0000-4000-8000-000000000001',chapterId='00000000-0000-4000-8000-000000000002';
 const bytes=new TextEncoder().encode(JSON.stringify({format:'thu-phong-cloud',version:1,book:{id:bookId,title:'Cloud synthetic',author:'',album:'AuthorA',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:4},chapters:[{id:chapterId,bookId,order:0,title:'Chapter',text:'text',revision:1,sourceId:''}],names:[{key:'新',value:'Cloud new'}]}));
 await expect(restoreCloudSnapshot(bytes,bookId,await contentHash(bytes))).rejects.toThrow('20.000');
 expect(await db.books.get(bookId)).toBeUndefined();expect(await db.chapters.get(chapterId)).toBeUndefined();expect(await db.names.where('bookId').equals(bookId).count()).toBe(0);
 expect((await readNameScope('a')).rows).toHaveLength(20000);
},30000);

it('public conflict resolution retains tombstone and unresolved row when remote choice would overflow the author',async()=>{
 await seedAuthorPool(20000);vi.stubGlobal('location',{origin:'https://integrity-review.invalid'});
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}});vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('Synthetic offline')));
 const record:SharedRecord={kind:'album-name',key:albumNameKey('AuthorA','新'),value:'Remote new'},id=await sharedRecordId(record),tomb={...record,value:null};
 await db.settings.put({key:albumNameSetting(record.key),value:tomb});
 await db.settings.put({key:SHARED_STATE_KEY,value:{version:1,cursors:{},base:{},conflicts:{[id]:{id,revision:1,record}}}});
 await expect(resolveSharedState(id,'shared')).rejects.toThrow('20.000');
 expect((await db.settings.get(albumNameSetting(record.key)))?.value).toEqual(tomb);expect((await readSharedReplica()).conflicts[id]).toBeDefined();
 expect((await readNameScope('a')).rows).toHaveLength(20000);
},30000);
