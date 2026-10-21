import 'fake-indexeddb/auto';
import {beforeEach,describe,it,expect} from 'vitest';
import {db} from '../src/core/db';
import {normalizeAlbum,commitAlbumImports,commitMappedAlbumImports} from '../src/features/library/services/albums';

beforeEach(async()=>{await db.delete();await db.open();});
async function preview(id:string){
  await db.books.add({id,title:id,author:'',createdAt:1,updatedAt:1,status:'staging',chapterCount:1,charCount:4});
  await db.chapters.add({id:`chapter-${id}`,bookId:id,order:0,title:'Chapter',text:'text',revision:1,sourceId:''});
  await db.importJobs.add({jobId:`job-${id}`,bookId:id,phase:'preview',totalFiles:1,processedFiles:1,processedBytes:4,checkpoint:1,duplicateFiles:[],updatedAt:1});
}
describe('optional Album at import publication',()=>{
  it('publishes different folder Albums together without touching unrelated ready books',async()=>{
    await preview('old');await commitAlbumImports(['old'],'Retained');
    await preview('one');await preview('two');const old=await db.books.get('old'),chapters=await db.chapters.toArray();
    await commitMappedAlbumImports([{id:'one',album:'Root/A/Common'},{id:'two',album:'Root/B/Common'}]);
    expect((await db.books.get('one'))?.album).toBe('Root/A/Common');
    expect((await db.books.get('two'))?.album).toBe('Root/B/Common');
    expect((await db.books.bulkGet(['one','two'])).every(book=>book?.status==='ready')).toBe(true);
    expect(await db.books.get('old')).toEqual(old);expect(await db.chapters.toArray()).toEqual(chapters);
    expect((await db.importJobs.toArray()).every(job=>job.phase==='committed')).toBe(true);
  });
  it('rolls mapped Album and readiness back if a later job cannot commit',async()=>{
    await preview('one');await preview('two');await db.importJobs.update('job-two',{phase:'processing'});
    const before=await db.books.toArray(),jobs=await db.importJobs.toArray();
    await expect(commitMappedAlbumImports([{id:'one',album:'Root/A'},{id:'two',album:'Root/B'}])).rejects.toThrow('chưa hoàn tất');
    expect(await db.books.toArray()).toEqual(before);expect(await db.importJobs.toArray()).toEqual(jobs);
  });
  it('prevalidates every mapped Album and ID before publication',async()=>{
    await preview('one');const before=await db.books.get('one');
    for(const assignments of [[],[{id:'one',album:'Root'},{id:'one',album:'Other'}],[{id:'one',album:''}],[{id:'one',album:'a'.repeat(121)}]])
      await expect(commitMappedAlbumImports(assignments)).rejects.toThrow();
    expect(await db.books.get('one')).toEqual(before);
  });
  it('trims optional labels and rejects invalid catalog metadata',()=>{
    expect(normalizeAlbum('  集合 🌸  ')).toBe('集合 🌸');expect(normalizeAlbum('  ')).toBeUndefined();
    expect(normalizeAlbum('a'.repeat(120))).toHaveLength(120);
    for(const value of ['a'.repeat(121),'a\0b','a\nb','\uD800'])expect(()=>normalizeAlbum(value)).toThrow();
  });
  it('publishes two independent books with Album while preserving chapter identities and content',async()=>{
    await preview('one');await preview('two');const chapters=await db.chapters.toArray();
    await commitAlbumImports(['one','two'],'  Collection  ');
    expect((await db.books.toArray()).map(book=>({id:book.id,album:book.album,status:book.status}))).toEqual([{id:'one',album:'Collection',status:'ready'},{id:'two',album:'Collection',status:'ready'}]);
    expect(await db.chapters.toArray()).toEqual(chapters);
    expect((await db.importJobs.toArray()).every(job=>job.phase==='committed')).toBe(true);
  });
  it('rolls Album and readiness back together when a later import is incomplete',async()=>{
    await preview('one');await preview('two');await db.importJobs.update('job-two',{phase:'processing'});
    await expect(commitAlbumImports(['one','two'],'Collection')).rejects.toThrow('chưa hoàn tất');
    expect((await db.books.toArray()).every(book=>book.status==='staging'&&book.album===undefined)).toBe(true);
    expect((await db.importJobs.get('job-one'))?.phase).toBe('preview');
  });
  it('commits without Album and rejects empty/duplicate IDs and already ready books',async()=>{
    await preview('one');await commitAlbumImports(['one'],' ');expect((await db.books.get('one'))?.album).toBeUndefined();
    await expect(commitAlbumImports(['one'],'Changed')).rejects.toThrow('xem trước');
    await expect(commitAlbumImports([],'')).rejects.toThrow('không hợp lệ');
    await expect(commitAlbumImports(['one','one'],'')).rejects.toThrow('không hợp lệ');
    expect((await db.books.get('one'))?.album).toBeUndefined();
  });
});
