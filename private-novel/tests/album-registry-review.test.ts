import 'fake-indexeddb/auto';
import Dexie,{liveQuery} from 'dexie';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {ALBUM_REGISTRY_KEY,getAlbumRegistry,readStoredAlbumRegistry,createAlbum,renameAlbum,removeAlbum,moveBookToAlbum} from '../src/features/library/services/album-registry';
import type {Book} from '../src/core/domain';
import {saveScopedBookNames,deleteScopedBookName} from '../src/features/names-convert/services/scoped-names';

const book=(id:string,album?:string):Book=>({id,title:id,author:'Original',status:'ready',chapterCount:1,charCount:8,createdAt:1,updatedAt:2,...album===undefined?{}:{album}});
beforeEach(async()=>{await db.delete();await db.open();});
afterEach(()=>vi.restoreAllMocks());

it('readonly registry liveQuery observes empty Album writes without a book mutation',async()=>{
  await getAlbumRegistry();let sub:{unsubscribe:()=>void}|undefined;
  let finishInitial:()=>void=()=>{},fail:(e:unknown)=>void=()=>{};
  const initial=new Promise<void>(resolve=>{finishInitial=resolve;});
  const changed=new Promise<void>((resolve,reject)=>{fail=reject;sub=liveQuery(()=>readStoredAlbumRegistry()).subscribe({next:registry=>{if(registry?.albums.length===0)finishInitial();if(registry?.albums[0]?.name==='Empty observed')resolve();},error:reject});});
  const timeout=setTimeout(()=>fail(new Error('empty Album update not observed')),2000);
  try{await initial;await createAlbum('Empty observed');await changed;expect(await db.books.count()).toBe(0);}
  finally{clearTimeout(timeout);sub?.unsubscribe();}
});

it('deleted ID cannot rename/remove/move to a later Album with same label',async()=>{
  const old=await createAlbum('Root/A');await db.books.put(book('a','Root/A'));await removeAlbum(old.id);
  const replacement=await createAlbum('Root/A');expect(replacement.id).not.toBe(old.id);
  await moveBookToAlbum('a',replacement.id);const before=await db.books.toArray();
  await expect(renameAlbum(old.id,'Other')).rejects.toThrow();await expect(removeAlbum(old.id)).rejects.toThrow();await expect(moveBookToAlbum('a',old.id)).rejects.toThrow();
  expect(await db.books.toArray()).toEqual(before);expect((await getAlbumRegistry()).albums).toEqual([replacement]);
});

it('a stale original label does not merge descendants or equal leaves during rename',async()=>{
  await db.books.bulkPut([book('a','Root/A/Leaf'),book('b','Root/B/Leaf'),book('c','Root/A/Leaf/Child')]);
  const registry=await getAlbumRegistry(),a=registry.albums.find(a=>a.name==='Root/A/Leaf')!;
  await renameAlbum(a.id,'Renamed');await renameAlbum(a.id,'Again');
  expect((await db.books.get('a'))!.album).toBe('Again');expect((await db.books.get('b'))!.album).toBe('Root/B/Leaf');expect((await db.books.get('c'))!.album).toBe('Root/A/Leaf/Child');
  expect((await getAlbumRegistry()).albums.find(p=>p.id===a.id)!.name).toBe('Again');
});

it.each(['Group','Root/Group'])('native book write abort for %s rolls back earlier members, registry and Album Name pool',async album=>{
  await db.books.bulkPut([book('a',album),book('b',album)]);const registry=await getAlbumRegistry(),before=await db.books.toArray();
  await saveScopedBookNames('a','甲=Live\n乙=Deleted');await deleteScopedBookName('a','乙');
  const settingsBefore=await db.settings.toArray(),mutated=new Set<string>();
  function abortAfterSecondMember(id:string|undefined){if(!id)throw Error('Expected explicit Book ID');mutated.add(id);if(mutated.size===2)Dexie.currentTransaction!.abort();}
  const put=db.books.put.bind(db.books),update=db.books.update.bind(db.books);
  const putSpy=vi.spyOn(db.books,'put').mockImplementation((...args:Parameters<typeof db.books.put>)=>{
    const result=put(...args);abortAfterSecondMember(args[0].id);return result;
  });
  const updateSpy=vi.spyOn(db.books,'update').mockImplementation((...args:Parameters<typeof db.books.update>)=>{
    const result=update(...args);abortAfterSecondMember(typeof args[0]==='string'?args[0]:args[0].id);return result;
  });
  await expect(renameAlbum(registry.albums[0].id,'New')).rejects.toThrow();
  expect([...mutated]).toEqual(['a','b']);expect(album==='Group'?updateSpy:putSpy).toHaveBeenCalled();
  expect(await db.books.toArray()).toEqual(before);
  expect((await db.settings.get(ALBUM_REGISTRY_KEY))!.value).toEqual(registry);
  expect(await db.settings.toArray()).toEqual(settingsBefore);
});

it('registry transaction reads latest metadata committed by another native connection',async()=>{
  await db.books.put(book('a','Group'));const album=(await getAlbumRegistry()).albums[0];
  const other=new Dexie(db.name);await other.open();
  try{
    const external=other.transaction('rw',[other.table('settings'),other.table('books')],async()=>{
      await other.table('books').update('a',{title:'External edit',author:'External author',updatedAt:123});
    });
    await Promise.all([external,renameAlbum(album.id,'Renamed')]);
    expect(await db.books.get('a')).toEqual({...book('a','Renamed'),title:'External edit',author:'External author',updatedAt:123});
  }finally{other.close();}
});

it('member moving before removal is not cleared by removal of previous group',async()=>{
  const a=await createAlbum('A'),b=await createAlbum('B');await db.books.put(book('member','A'));
  await Promise.all([moveBookToAlbum('member',b.id),removeAlbum(a.id)]);
  expect((await db.books.get('member'))!.album).toBe('B');expect((await getAlbumRegistry()).albums).toEqual([b]);
});

it('missing legacy discovery beyond cap aborts without registry or book partial changes',async()=>{
  const albums=Array.from({length:1000},(_,i)=>({id:`id${i}`,name:`Group${i}`,updatedAt:1}));
  const registry={version:1,albums};await db.settings.put({key:ALBUM_REGISTRY_KEY,value:registry});await db.books.put(book('new','Unregistered'));
  await expect(getAlbumRegistry()).rejects.toThrow();expect((await db.settings.get(ALBUM_REGISTRY_KEY))!.value).toEqual(registry);expect(await db.books.get('new')).toEqual(book('new','Unregistered'));
});
