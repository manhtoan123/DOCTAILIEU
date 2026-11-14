import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {uid,type Book,type Chapter} from '../src/core/domain';
import {CONVERT_NAMES_KEY} from '../src/features/names-convert/services/convert-names';
import {createCloudSnapshot,restoreCloudSnapshot,contentHash,MAX_CLOUD_BYTES,type CloudSnapshot} from '../src/features/sync-cloud/services/cloud-snapshot';
import {decodeCloudSnapshot} from '../src/features/sync-cloud/services/cloud-snapshot-codec';

function snapshot():CloudSnapshot{
  const book:Book={id:uid(),title:'中文 😀',author:'Synthetic author',createdAt:1,updatedAt:2,status:'ready',chapterCount:2,charCount:8};
  const chapters:Chapter[]=['中文😀','末章\n終'].map((text,order)=>({id:uid(),bookId:book.id,order,title:`第${order+1}章`,text,revision:1,sourceId:''}));
  book.charCount=chapters.reduce((sum,c)=>sum+c.text.length,0);
  return {format:'thu-phong-cloud',version:1,book,chapters,names:[{key:'中文',value:'Trung Văn 😀'}]};
}
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
async function restore(value:CloudSnapshot){const bytes=encode(value);return restoreCloudSnapshot(bytes,value.book.id,await contentHash(bytes));}
async function capture(){return {books:await db.books.toArray(),chapters:await db.chapters.toArray(),names:await db.names.toArray(),settings:await db.settings.toArray()};}
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('navigator',{storage:{estimate:async()=>undefined}});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('independent cloud compact snapshot review',()=>{
  it('roundtrips Unicode chapter text and flattened Names while omitting sources/dictionaries/progress',async()=>{
    const data=snapshot();await db.books.add({...data.book,chapterCount:20,charCount:999});
    await db.chapters.bulkAdd(data.chapters.map((c,index)=>({...c,order:index*4,sourceId:'private-original'})));
    await db.settings.put({key:CONVERT_NAMES_KEY,value:[{key:'中文',value:'global shadowed'},{key:'山',value:'Sơn'}]});
    await db.names.add({id:uid(),bookId:data.book.id,key:'中文',value:''});
    await db.sources.add({id:'private-original',bookId:data.book.id,name:'original.txt',relativePath:'original.txt',encoding:'utf-8',sha256:'private',bytes:6,blob:new Blob(['SECRET'])});
    await db.dictionaries.add({kind:'vp',name:'dictionary',blob:new Blob(['DICTSECRET']),sha256:'dictionary',updatedAt:1});
    await db.progress.add({bookId:data.book.id,chapterId:data.chapters[0].id,paragraph:3,offset:1,revision:1,updatedAt:10});
    const bytes=await createCloudSnapshot(data.book.id),serialized=new TextDecoder().decode(bytes),saved=JSON.parse(serialized) as CloudSnapshot;
    expect(Object.keys(saved).sort()).toEqual(['book','chapters','format','names','version']);
    expect(serialized).not.toMatch(/SECRET|private-original|DICTSECRET/);
    expect(saved.chapters.map(c=>c.order)).toEqual([0,1]);expect(saved.book.chapterCount).toBe(2);expect(saved.book.charCount).toBe(data.book.charCount);
    expect(saved.names).toEqual(expect.arrayContaining([{key:'中文',value:''},{key:'山',value:'Sơn'}]));
    expect((await db.chapters.get(data.chapters[1].id))?.order).toBe(4);expect((await db.books.get(data.book.id))?.charCount).toBe(999);
    expect(await createCloudSnapshot(data.book.id)).toEqual(bytes);
    await db.delete();await db.open();const globalNames=[{key:'山',value:'local remains'}];await db.settings.add({key:CONVERT_NAMES_KEY,value:globalNames});
    expect(await restoreCloudSnapshot(bytes,data.book.id,await contentHash(bytes))).toBe('added');
    expect((await db.chapters.toArray()).map(c=>c.text)).toEqual(expect.arrayContaining(data.chapters.map(c=>c.text)));
    expect((await db.names.toArray()).every(n=>n.bookId===data.book.id)).toBe(true);
    expect(await db.names.where('[bookId+key]').equals([data.book.id,'中文']).first()).toMatchObject({value:''});
    expect((await db.settings.get(CONVERT_NAMES_KEY))?.value).toEqual(globalNames);
    for(const table of [db.sources,db.progress,db.dictionaries])expect(await table.count()).toBe(0);
  });
  it('keeps serialization identical after name insertion order changes, making retry hashes stable',async()=>{
    const data=snapshot();await db.books.add(data.book);await db.chapters.bulkAdd([...data.chapters].reverse());
    const names=[{key:'山',value:'Sơn'},{key:'河',value:'Hà'}];await db.settings.put({key:CONVERT_NAMES_KEY,value:names});
    const before=await createCloudSnapshot(data.book.id);
    await db.settings.put({key:CONVERT_NAMES_KEY,value:[...names].reverse()});
    const after=await createCloudSnapshot(data.book.id);expect(after).toEqual(before);expect(await contentHash(after)).toBe(await contentHash(before));
  });
  it('never overwrites existing books, chapters, Names or settings, even with differing remote text',async()=>{
    const remote=snapshot();const local={...remote.book,title:'Keep local'};await db.books.add(local);
    await db.chapters.add({...remote.chapters[0],text:'Do not replace'});
    await db.names.add({id:uid(),bookId:local.id,key:'中文',value:'local'});await db.settings.put({key:'sentinel',value:{keep:true}});
    const before=await capture();expect(await restore(remote)).toBe('existing');expect(await capture()).toEqual(before);
  });
  it('rejects foreign chapter ID collision before mutation and retains unrelated data',async()=>{
    const remote=snapshot(),existing=snapshot();await db.books.add(existing.book);
    await db.chapters.add({...existing.chapters[0],id:remote.chapters[1].id});await db.settings.add({key:'sentinel',value:42});
    const before=await capture();await expect(restore(remote)).rejects.toThrow('trùng ID');expect(await capture()).toEqual(before);
  });
  it('rolls back book and chapters when the final Name insertion fails',async()=>{
    const remote=snapshot(),existing=snapshot();await restore(existing);const before=await capture();
    vi.spyOn(db.names,'bulkAdd').mockRejectedValue(new Error('quota during Names'));
    await expect(restore(remote)).rejects.toThrow('quota during Names');expect(await capture()).toEqual(before);
  });
  it('concurrent same-book restores add exactly once without duplicated Names',async()=>{
    const remote=snapshot();expect((await Promise.all([restore(remote),restore(remote)])).sort()).toEqual(['added','existing']);
    expect(await db.books.count()).toBe(1);expect(await db.chapters.count()).toBe(2);expect(await db.names.count()).toBe(1);
  });
  it('rejects checksum corruption, invalid UTF8/JSON and request-book mismatch before mutation',async()=>{
    const remote=snapshot(),bytes=encode(remote);
    await expect(restoreCloudSnapshot(bytes,remote.book.id,'a'.repeat(64))).rejects.toThrow('checksum');
    for(const bad of [new Uint8Array([0xff]),new TextEncoder().encode('{')])await expect(restoreCloudSnapshot(bad,remote.book.id,await contentHash(bad))).rejects.toThrow();
    await expect(restoreCloudSnapshot(bytes,uid(),await contentHash(bytes))).rejects.toThrow('ID bản cloud');
    expect(await capture()).toEqual({books:[],chapters:[],names:[],settings:[]});
  });
  it.each(['foreign book','duplicate ID','order hole','wrong count','wrong chars','source included','duplicate Name','invalid version'])('rejects invalid shape: %s atomically',async scenario=>{
    const remote=snapshot();
    if(scenario==='foreign book')remote.chapters[0].bookId=uid();
    if(scenario==='duplicate ID')remote.chapters[1].id=remote.chapters[0].id;
    if(scenario==='order hole')remote.chapters[1].order=2;
    if(scenario==='wrong count')remote.book.chapterCount++;
    if(scenario==='wrong chars')remote.book.charCount++;
    if(scenario==='source included')remote.chapters[0].sourceId=uid();
    if(scenario==='duplicate Name')remote.names.push({...remote.names[0]});
    if(scenario==='invalid version')(remote as unknown as {version:number}).version=999;
    await expect(restore(remote)).rejects.toThrow();expect(await db.books.count()).toBe(0);expect(await db.chapters.count()).toBe(0);expect(await db.names.count()).toBe(0);
  });
  it('rejects oversize bytes and local quota before creating records',async()=>{
    const data=snapshot();await expect(restoreCloudSnapshot(new Uint8Array(MAX_CLOUD_BYTES+1),data.book.id,'a'.repeat(64))).rejects.toThrow('kích thước');
    vi.stubGlobal('navigator',{storage:{estimate:async()=>({usage:899,quota:1000})}});
    await expect(restore(data)).rejects.toThrow('Không đủ dung lượng');expect(await db.books.count()).toBe(0);
  });
  it('refuses staging books and compresses an oversized ready snapshot without modifying local data',async()=>{
    const data=snapshot();await db.books.add({...data.book,status:'staging'});await expect(createCloudSnapshot(data.book.id)).rejects.toThrow('chưa sẵn sàng');
    await db.books.update(data.book.id,{status:'ready'});
    const text='中'.repeat(128000);await db.chapters.bulkAdd(Array.from({length:176},(_,order)=>({id:uid(),bookId:data.book.id,order,title:'large',text,revision:1,sourceId:''})));
    const before=await db.books.get(data.book.id),wire=await createCloudSnapshot(data.book.id),decoded=await decodeCloudSnapshot(wire),value=decoded.value as CloudSnapshot;
    expect(JSON.parse(new TextDecoder().decode(wire)).format).toBe('thu-phong-cloud-compressed');expect(decoded.decodedBytes).toBeGreaterThan(MAX_CLOUD_BYTES);expect(wire.length).toBeLessThan(MAX_CLOUD_BYTES);expect(value.chapters).toHaveLength(176);expect(value.chapters.every((c,i)=>c.order===i&&c.text===text&&c.sourceId==='')).toBe(true);expect(await db.chapters.count()).toBe(176);expect(await db.books.get(data.book.id)).toEqual(before);
  },30000);
});
