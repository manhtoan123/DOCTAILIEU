import 'fake-indexeddb/auto';
import Dexie,{liveQuery} from 'dexie';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {ALBUM_REGISTRY_KEY,getAlbumRegistry,readStoredAlbumRegistry,createAlbum,renameAlbum,removeAlbum,moveBookToAlbum} from '../src/features/library/services/album-registry';
import type {Book} from '../src/core/domain';

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

it('native book write abort rolls back previously changed members and registry',async()=>{
  await db.books.bulkPut([book('a','Group'),book('b','Group')]);const registry=await getAlbumRegistry(),before=await db.books.toArray();
  const original=db.books.put.bind(db.books);let writes=0;
  vi.spyOn(db.books,'put').mockImplementation((...args:Parameters<typeof db.books.put>)=>{
    const result=original(...args);if(++writes===2)Dexie.currentTransaction!.abort();return result;
  });
  await expect(renameAlbum(registry.albums[0].id,'New')).rejects.toThrow();expect(await db.books.toArray()).toEqual(before);
  expect((await db.settings.get(ALBUM_REGISTRY_KEY))!.value).toEqual(registry);
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
