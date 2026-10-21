import 'fake-indexeddb/auto';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {db, deleteBook} from '../src/core/db';
import {syncLocalBooks, downloadCloudBook, listCloudBooks, type CloudBook} from '../src/features/sync-cloud/services/cloud-client';
import {createCloudSnapshot, contentHash} from '../src/features/sync-cloud/services/cloud-snapshot';
const first='00000000-0000-4000-8000-000000000001',second='00000000-0000-4000-8000-000000000002';
const ack=(id:string)=>`cloud-uploaded:https://example.test:${id}`;
async function seed(id=first,title='Source') {
  await db.books.add({id,title,author:'',status:'ready',chapterCount:1,charCount:2,createdAt:1,updatedAt:1});
  await db.chapters.add({id:crypto.randomUUID(),bookId:id,order:0,title:'Chapter',text:'正文',sourceId:'',revision:1});
  await db.names.add({id:crypto.randomUUID(),bookId:id,key:'名',value:'Name'});
}
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('location',{origin:'https://example.test'});vi.stubGlobal('navigator',{storage:{estimate:async()=>({})}});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('independent cloud client regression',()=>{
  it('does not send local content when unauthenticated or cloud configuration is missing',async()=>{
    await seed();const before=await db.books.toArray();
    for(const status of [401,503]) {
      const fetch=vi.fn(async(_path:string)=>Response.json({error:'closed'},{status}));vi.stubGlobal('fetch',fetch);
      await expect(syncLocalBooks()).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][0]).toBe('/api/cloud/books');
    }
    expect(await db.settings.get(ack(first))).toBeUndefined();expect(await db.books.toArray()).toEqual(before);
  });
  it('continues after a failed first book, marking only matching successful upload ACKs',async()=>{
    await seed();await seed(second,'Second');
    const puts:string[]=[];
    vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
      if(!init?.method)return Response.json({books:[],cursor:null});
      puts.push(path);const id=path.split('/').at(-1)!;
      return Response.json({id,sha256:id===first?'0'.repeat(64):new Headers(init.headers).get('X-Content-SHA256')});
    }));
    await expect(syncLocalBooks()).rejects.toThrow('1 truyện; 1 truyện');
    expect(puts).toEqual([`/api/cloud/books/${first}`,`/api/cloud/books/${second}`]);
    expect(await db.settings.get(ack(first))).toBeUndefined();expect(await db.settings.get(ack(second))).toBeDefined();
    expect(await db.books.count()).toBe(2);expect(await db.names.count()).toBe(2);
  });
  it('does not upload staging books, dictionaries or original source blobs',async()=>{
    await seed();await seed(second);await db.books.update(second,{status:'staging'});
    await db.sources.add({id:crypto.randomUUID(),bookId:first,name:'secret-original',relativePath:'private/path',encoding:'utf-8',sha256:'a'.repeat(64),bytes:15,blob:new Blob(['ORIGINAL_SECRET'])});
    await db.dictionaries.add({kind:'vp',name:'dictionary',blob:new Blob(['DICTIONARY_SECRET']),sha256:'a'.repeat(64),updatedAt:1});
    const bodies:string[]=[];
    vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>{
      if(!init?.method)return Response.json({books:[],cursor:null});
      bodies.push(await (init.body as Blob).text());
      expect(init.redirect).toBe('error');expect(init.credentials).toBe('same-origin');expect(init.signal).toBeInstanceOf(AbortSignal);
      return Response.json({id:first,sha256:new Headers(init.headers).get('X-Content-SHA256')});
    }));
    expect(await syncLocalBooks()).toBe(1);expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain('SECRET');expect(bodies[0]).not.toContain('private/path');
    expect(JSON.parse(bodies[0]).names).toEqual([{key:'名',value:'Name'}]);
  });
  it('serializes simultaneous uploads and does not retry an acknowledged immutable snapshot',async()=>{
    await seed();let puts=0;
    vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>{
      if(!init?.method)return Response.json({books:[],cursor:null});puts++;
      return Response.json({id:first,sha256:new Headers(init.headers).get('X-Content-SHA256')});
    }));
    expect(await Promise.all([syncLocalBooks(),syncLocalBooks()])).toEqual([1,0]);expect(puts).toBe(1);
  });
  it('rejects oversized/missing/hash-mismatched downloads without data or ACK writes',async()=>{
    await seed();const bytes=await createCloudSnapshot(first),sha256=await contentHash(bytes);await deleteBook(first);
    const cloud:CloudBook={id:first,title:'Cloud',sha256,bytes:bytes.length,updatedAt:1};
    for(const [body,size]of [[bytes.slice(1),bytes.length],[bytes,bytes.length-1],[new Uint8Array(bytes.length),bytes.length]] as const){
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(body),{headers:{'Content-Type':'application/json'}})));
      await expect(downloadCloudBook({...cloud,bytes:size})).rejects.toThrow();
      expect(await db.books.count()).toBe(0);expect(await db.chapters.count()).toBe(0);expect(await db.names.count()).toBe(0);expect(await db.settings.get(ack(first))).toBeUndefined();
    }
  });
  it('does not mark unrelated local content uploaded when same-ID book arrives during download',async()=>{
    await seed();const bytes=await createCloudSnapshot(first),sha256=await contentHash(bytes);await deleteBook(first);
    vi.stubGlobal('fetch',vi.fn(async()=>{await seed(first,'Other local version');return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/json'}});}));
    expect(await downloadCloudBook({id:first,title:'Cloud',sha256,bytes:bytes.length,updatedAt:1})).toBe('existing');
    expect((await db.books.get(first))?.title).toBe('Other local version');
    expect(await db.settings.get(ack(first))).toBeUndefined();
  });
  it('rejects duplicated catalog pages instead of looping on repeated pagination',async()=>{
    const book:CloudBook={id:first,title:'Cloud',sha256:'a'.repeat(64),bytes:100,updatedAt:1};
    const fetch=vi.fn(async()=>Response.json({books:[book],cursor:first}));vi.stubGlobal('fetch',fetch);
    await expect(listCloudBooks()).rejects.toThrow('trùng');expect(fetch).toHaveBeenCalledTimes(2);
  });
});
