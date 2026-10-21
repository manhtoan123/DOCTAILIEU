import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {commitAlbumImports} from '../src/features/library/services/albums';
import {StreamingSplitter,type Part} from '../src/features/import-export/services/splitter';
import {syncLocalBooks} from '../src/features/sync-cloud/services/cloud-client';

const id='00000000-0000-4000-8000-000000000041';
const chapterId='00000000-0000-4000-8000-000000000042';
beforeEach(async()=>{await db.delete();await db.open();});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function preview(bookId:string){
  await db.books.add({id:bookId,title:'Synthetic',album:'Before',author:'',status:'staging',createdAt:1,updatedAt:1,chapterCount:1,charCount:2});
  await db.chapters.add({id:bookId===id?chapterId:'00000000-0000-4000-8000-000000000044',bookId,order:0,title:'Chapter',text:'文字',sourceId:'',revision:1});
  await db.importJobs.add({jobId:`job-${bookId}`,bookId,phase:'preview',totalFiles:1,processedFiles:1,processedBytes:6,checkpoint:1,duplicateFiles:[],updatedAt:1});
}

describe('independent Album and mandatory chapter review',()=>{
  it('does not reinterpret the remainder of one physical long line as a heading at a feed boundary',()=>{
    const source='x'.repeat(64000)+'Chapter 2\nbody\nChapter 3\nend';
    const split=(chunk:number)=>{const parts:Part[]=[];const splitter=new StreamingSplitter('Original',part=>parts.push(part));for(let offset=0;offset<source.length;offset+=chunk)splitter.feed(source.slice(offset,offset+chunk));splitter.feed('',true);return parts;};
    const full=split(source.length);const streamed=split(64001);
    expect(streamed.map(part=>part.text).join('')).toBe(source);
    expect(streamed).toEqual(full);
  });

  it('rolls back metadata, readiness and jobs after a late second-book write failure',async()=>{
    const other='00000000-0000-4000-8000-000000000043';await preview(id);await preview(other);
    const before=await Promise.all([db.books.toArray(),db.chapters.toArray(),db.importJobs.toArray()]);
    const update=db.books.update.bind(db.books);
    vi.spyOn(db.books,'update').mockImplementation((...args:Parameters<typeof update>)=>{
      if(args[0]===other&&'status' in args[1])return Promise.reject(new Error('Synthetic commit failure')) as ReturnType<typeof update>;
      return update(...args);
    });
    await expect(commitAlbumImports([id,other],'After')).rejects.toThrow('Synthetic commit failure');
    expect(await Promise.all([db.books.toArray(),db.chapters.toArray(),db.importJobs.toArray()])).toEqual(before);
  });

  it('keeps title and Album headers from the exact snapshot even when local metadata changes during hashing',async()=>{
    await preview(id);await commitAlbumImports([id],'Captured');
    vi.stubGlobal('location',{origin:'https://album-review.example.test'});
    const digest=crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle,'digest').mockImplementation(async(...args:Parameters<typeof digest>)=>{
      await db.books.update(id,{album:'Changed after snapshot',title:'Changed title'});
      return digest(...args);
    });
    let uploads=0;
    vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>{
      if(init?.method!=='PUT')return Response.json({books:[],cursor:null});
      uploads++;
      const body=JSON.parse(await (init.body as Blob).text());const headers=new Headers(init.headers);
      expect(body.book.album).toBe('Captured');expect(body.book.title).toBe('Synthetic');
      expect(decodeURIComponent(headers.get('X-Book-Album')!)).toBe(body.book.album);
      expect(decodeURIComponent(headers.get('X-Book-Title')!)).toBe(body.book.title);
      return Response.json({id,sha256:headers.get('X-Content-SHA256')});
    }));
    expect(await syncLocalBooks()).toBe(1);expect(uploads).toBe(1);
    expect((await db.books.get(id))?.album).toBe('Changed after snapshot');
  });
});
