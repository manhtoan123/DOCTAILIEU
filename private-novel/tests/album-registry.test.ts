import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import type {Book} from '../src/core/domain';
import {ALBUM_REGISTRY_KEY,getAlbumRegistry,createAlbum,renameAlbum,removeAlbum,moveBookToAlbum} from '../src/features/library/services/album-registry';

beforeEach(async()=>{await db.delete();await db.open();});
afterEach(()=>vi.restoreAllMocks());
function book(id:string,album?:string,status:Book['status']='ready'):Book{return{id,title:id,author:'A',album,status,createdAt:1,updatedAt:2,charCount:8,chapterCount:1};}
async function wholeData(){
  const result:Record<string,unknown>={};for(const table of db.tables)result[table.name]=await table.toArray();
  result.sources=await Promise.all((await db.sources.toArray()).map(async s=>({...s,blob:Array.from(new Uint8Array(await s.blob.arrayBuffer()))})));
  return result;
}
async function seed(){
  await db.books.bulkPut([book('a','Root/A/Common'),book('b','Root/B/Common'),book('staging','Root/A/Common','staging')]);
  await db.chapters.put({id:'chapter-a',bookId:'a',order:0,title:'章',text:'合成文字😀',revision:4,sourceId:'source-a'});
  await db.sources.put({id:'source-a',bookId:'a',name:'synthetic.txt',relativePath:'Root/A/synthetic.txt',encoding:'UTF-8',bytes:4,sha256:'synthetic',blob:new Blob([new Uint8Array([1,2,3,255])])});
  await db.names.put({id:'name-a',bookId:'a',key:'林儿',value:'Lâm Nhi'});
  await db.progress.put({bookId:'a',chapterId:'chapter-a',paragraph:1,offset:2,revision:4,updatedAt:7});
  await db.settings.bulkPut([{key:'ai-book-settings:a',value:{systemPrompt:'preserve'}},{key:'reader',value:{fontSize:19}}]);
}
describe('local Album registry',()=>{
  it('creates empty Album, reloads stable ID, renames same ID',async()=>{
    const a=await createAlbum('  Empty 🌸  ');expect(a.name).toBe('Empty 🌸');expect((await getAlbumRegistry()).albums).toEqual([a]);
    db.close();await db.open();expect((await getAlbumRegistry()).albums[0].id).toBe(a.id);
    const renamed=await renameAlbum(a.id,'Renamed');expect(renamed.id).toBe(a.id);expect(await db.books.count()).toBe(0);
    await removeAlbum(a.id);expect((await getAlbumRegistry()).albums).toEqual([]);
  });
  it('derives distinct fullpath labels only from ready books, idempotently, without book writes',async()=>{
    await seed();const before=await db.books.toArray(),first=await getAlbumRegistry();expect(first.albums.map(a=>a.name)).toEqual(['Root/A/Common','Root/B/Common']);
    const put=vi.spyOn(db.settings,'put');expect(await getAlbumRegistry()).toEqual(first);expect(put).not.toHaveBeenCalled();expect(await db.books.toArray()).toEqual(before);
    await db.books.put(book('only-staging','Hidden','staging'));expect((await getAlbumRegistry()).albums).toHaveLength(2);
  });
  it('discovers newly imported labels after first migration while retaining previous IDs',async()=>{
    await db.books.put(book('one','One'));const before=await getAlbumRegistry();await db.books.put(book('two','Two'));const after=await getAlbumRegistry();expect(after.albums[0]).toEqual(before.albums[0]);expect(after.albums).toHaveLength(2);
  });
  it('malformed legacy ready Album fails closed before initial registry creation',async()=>{
    await db.books.put(book('bad','x'.repeat(121)));const before=await wholeData();await expect(getAlbumRegistry()).rejects.toThrow();expect(await wholeData()).toEqual(before);expect(await db.settings.get(ALBUM_REGISTRY_KEY)).toBeUndefined();
  });
  it('failed first migration leaves legacy books unchanged and can retry',async()=>{
    await seed();const before=await wholeData();vi.spyOn(db.settings,'put').mockRejectedValueOnce(new Error('quota'));
    await expect(getAlbumRegistry()).rejects.toThrow('quota');expect(await wholeData()).toEqual(before);expect((await getAlbumRegistry()).albums).toHaveLength(2);
  });
  it('rejects duplicate create/rename without merging folders or modifying data',async()=>{
    await seed();const registry=await getAlbumRegistry(),before=await wholeData();await expect(createAlbum('Root/A/Common')).rejects.toThrow('tồn tại');
    await expect(renameAlbum(registry.albums[0].id,'Root/B/Common')).rejects.toThrow('tồn tại');expect(await wholeData()).toEqual(before);
  });
  it.each([null,{}, {version:2,albums:[]},{version:1,albums:[{id:'a',name:'A',updatedAt:NaN}]},{version:1,albums:[{id:'a',name:'A',updatedAt:1},{id:'a',name:'B',updatedAt:1}]},{version:1,albums:[{id:'a',name:'A',updatedAt:1},{id:'b',name:'A',updatedAt:1}]}])('refuses corruption/newer format %j without resets',async value=>{
    await db.settings.put({key:ALBUM_REGISTRY_KEY,value});const before=await wholeData();await expect(getAlbumRegistry()).rejects.toThrow();await expect(createAlbum('safe')).rejects.toThrow();expect(await wholeData()).toEqual(before);
  });
  it('rejects invalid names and registry cap without partial migration',async()=>{
    for(const value of ['', 'a'.repeat(121),'a\0b','\uD800'])await expect(createAlbum(value)).rejects.toThrow();
    const albums=Array.from({length:1000},(_,i)=>({id:`a${i}`,name:`A${i}`,updatedAt:1}));await db.settings.put({key:ALBUM_REGISTRY_KEY,value:{version:1,albums}});
    await expect(createAlbum('overflow')).rejects.toThrow();expect((await getAlbumRegistry()).albums).toHaveLength(1000);
  });
  it('rename, move and removal preserve all non-Album data and staging byte-for-byte',async()=>{
    await seed();const registry=await getAlbumRegistry(),a=registry.albums.find(a=>a.name==='Root/A/Common')!,b=registry.albums.find(a=>a.name==='Root/B/Common')!;
    const before=await wholeData(),staging=await db.books.get('staging');
    await renameAlbum(a.id,'Renamed');expect((await db.books.get('a'))?.album).toBe('Renamed');
    await moveBookToAlbum('a',b.id);expect((await db.books.get('a'))?.album).toBe(b.name);await removeAlbum(b.id);
    expect((await db.books.get('a'))?.album).toBeUndefined();expect((await db.books.get('b'))?.album).toBeUndefined();expect(await db.books.get('staging')).toEqual(staging);
    const after=await wholeData();
    for(const key of Object.keys(before))if(key!=='books'&&key!=='settings')expect(after[key]).toEqual(before[key]);
    const omitAlbum=(books:Book[])=>(books.map(({album:_a,...b})=>b));expect(omitAlbum(after.books as Book[])).toEqual(omitAlbum(before.books as Book[]));
    expect((after.settings as {key:string}[]).filter(s=>s.key!==ALBUM_REGISTRY_KEY)).toEqual((before.settings as {key:string}[]).filter(s=>s.key!==ALBUM_REGISTRY_KEY));
  });
  it('unassigns explicitly, rejects missing/staging books and missing destination',async()=>{
    await seed();const a=(await getAlbumRegistry()).albums[0];await moveBookToAlbum('a');expect((await db.books.get('a'))?.album).toBeUndefined();
    const before=await wholeData();await expect(moveBookToAlbum('staging',a.id)).rejects.toThrow('nhập xong');await expect(moveBookToAlbum('missing',a.id)).rejects.toThrow();await expect(moveBookToAlbum('b','deleted')).rejects.toThrow();expect(await wholeData()).toEqual(before);
  });
  it('rolls registry and all book mutations back on failed rename/remove save',async()=>{
    await seed();const a=(await getAlbumRegistry()).albums[0],before=await wholeData();const put=vi.spyOn(db.settings,'put');
    put.mockRejectedValueOnce(new Error('quota'));await expect(renameAlbum(a.id,'New')).rejects.toThrow('quota');expect(await wholeData()).toEqual(before);
    put.mockRejectedValueOnce(new Error('quota'));await expect(removeAlbum(a.id)).rejects.toThrow('quota');expect(await wholeData()).toEqual(before);
  });
  it('native abort after book writes rolls deletion back before rejection',async()=>{
    await seed();const a=(await getAlbumRegistry()).albums[0],before=await wholeData();const original=db.settings.put.bind(db.settings);
    vi.spyOn(db.settings,'put').mockImplementation((...args:Parameters<typeof db.settings.put>)=>{Dexie.currentTransaction!.abort();return original(...args);});
    await expect(removeAlbum(a.id)).rejects.toThrow();expect(await wholeData()).toEqual(before);
  });
  it('parallel creates and another connection preserve updates through native locking',async()=>{
    await getAlbumRegistry();const other=new Dexie(db.name);other.version(3).stores({settings:'key',books:'id,status,updatedAt'});await other.open();
    try{await Promise.all([createAlbum('One'),createAlbum('Two'),other.transaction('rw',[other.table('settings'),other.table('books')],async()=>{
      const table=other.table('settings'),row=await table.get(ALBUM_REGISTRY_KEY);row.value.albums.push({id:'other',name:'Other',updatedAt:1});await table.put(row);
    })]);expect((await getAlbumRegistry()).albums.map(a=>a.name).sort()).toEqual(['One','Other','Two']);}finally{other.close();}
  });
  it('duplicate concurrent creates have one winner',async()=>{
    const results=await Promise.allSettled([createAlbum('Same'),createAlbum('Same')]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await getAlbumRegistry()).albums).toHaveLength(1);
  });
});
