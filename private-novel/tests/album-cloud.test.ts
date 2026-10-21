import 'fake-indexeddb/auto';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DatabaseSync, type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {D1Database, R2Bucket} from '@cloudflare/workers-types';
import {handleCloudLibrary, type CloudLibraryEnv} from '../server/cloud-library';
import {db} from '../src/core/db';
import {validateCloudSnapshot, createCloudSnapshot, contentHash, restoreCloudSnapshot} from '../src/features/sync-cloud/services/cloud-snapshot';
import {downloadCloudBook, listCloudBooks, syncLocalBooks} from '../src/features/sync-cloud/services/cloud-client';

const origin='https://album.example.test';
const id='00000000-0000-4000-8000-000000000001';
const chapterId='00000000-0000-4000-8000-000000000002';
const digest=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const migration=(name:string)=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const databases:DatabaseSync[]=[];
function snapshot(album?:unknown){return {format:'thu-phong-cloud',version:1,book:{id,title:'Synthetic',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:2,...(album===undefined?{}:{album})},chapters:[{id:chapterId,bookId:id,order:0,title:'Chapter',text:'正文',sourceId:'',revision:1}],names:[]};}
beforeEach(async()=>{
  await db.delete();await db.open();
  vi.stubGlobal('location',{origin});vi.stubGlobal('navigator',{storage:{estimate:async()=>({})}});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();for(const sql of databases.splice(0))sql.close();});
function setup(){
  const sql=new DatabaseSync(':memory:');databases.push(sql);
  for(const name of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql'])sql.exec(migration(name));
  const state:{beforePut?:()=>Promise<void>;failPut?:boolean}={};
  const database={prepare(query:string){let bindings:SQLInputValue[]=[];return {
    bind(...values:SQLInputValue[]){bindings=values;return this;},
    async first(){return sql.prepare(query).get(...bindings)??null;},
    async all(){return {results:sql.prepare(query).all(...bindings)};},
    async run(){return sql.prepare(query).run(...bindings);},
  };}};
  const objects=new Map<string,{bytes:Uint8Array<ArrayBuffer>;sha256:string}>();
  function metadata(key:string){const object=objects.get(key);return object?{key,size:object.bytes.length,customMetadata:{sha256:object.sha256},checksums:{sha256:Uint8Array.from(Buffer.from(object.sha256,'hex')).buffer}}:null;}
  const bucket={
    put:vi.fn(async(key:string,bytes:Uint8Array,options:{sha256:string;onlyIf:{etagDoesNotMatch:string}})=>{
      await state.beforePut?.();if(state.failPut)throw new Error('Synthetic failure');
      expect(options.onlyIf.etagDoesNotMatch).toBe('*');if(objects.has(key))return null;
      objects.set(key,{bytes:bytes.slice(),sha256:options.sha256});return metadata(key);
    }),
    head:async(key:string)=>metadata(key),
    get:async(key:string)=>{const info=metadata(key);return info?{...info,body:new Response(objects.get(key)!.bytes).body}:null;},
    delete:async(key:string)=>{objects.delete(key);},
  };
  const env:CloudLibraryEnv={DB:database as unknown as D1Database,LIBRARY_BUCKET:bucket as unknown as R2Bucket,AUTH_PASSWORD_HASH:'',PUBLIC_LIBRARY:'1'};
  const run=(request:Request)=>handleCloudLibrary(request,env);
  const request=(path='/api/cloud/books',init:RequestInit={})=>new Request(origin+path,init);
  const put=(album?:string,body=JSON.stringify(snapshot()),bookId=id)=>run(request(`/api/cloud/books/${bookId}`,{method:'PUT',body,headers:{Origin:origin,'Content-Type':'application/json','X-Content-SHA256':digest(body),'X-Book-Title':'Synthetic',...(album===undefined?{}:{'X-Book-Album':album})}}));
  const catalog=async()=>await (await run(request())).json();
  const remove=()=>run(request(`/api/cloud/books/${id}`,{method:'DELETE',headers:{Origin:origin}}));
  return {sql,objects,state,bucket,put,catalog,remove,run,request};
}

describe('optional album in version-1 snapshots',()=>{
  it('keeps an old snapshot valid and omits absent or blank album',()=>{
    expect(validateCloudSnapshot(snapshot())).toEqual(snapshot());
    expect(validateCloudSnapshot(snapshot('   ')).book).not.toHaveProperty('album');
  });
  it('trims album and measures the 120 limit in UTF16 units',()=>{
    expect(validateCloudSnapshot(snapshot('  Tuyển tập 中文  ')).book.album).toBe('Tuyển tập 中文');
    expect(validateCloudSnapshot(snapshot('😀'.repeat(60))).book.album).toHaveLength(120);
    expect(()=>validateCloudSnapshot(snapshot('😀'.repeat(61)))).toThrow('120');
    for(const album of [null,1,{},[],true,'x'.repeat(121),'line\nnext','\u0000','\ud800'])expect(()=>validateCloudSnapshot(snapshot(album))).toThrow('Album');
  });
  it('captures and restores album without merging or modifying chapters',async()=>{
    const value=validateCloudSnapshot(snapshot('  Tuyển tập  '));
    await db.books.add(value.book);await db.chapters.bulkAdd(value.chapters);
    const bytes=await createCloudSnapshot(id);await db.delete();await db.open();
    expect(await restoreCloudSnapshot(bytes,id,await contentHash(bytes))).toBe('added');
    expect((await db.books.get(id))?.album).toBe('Tuyển tập');
    expect(await db.chapters.toArray()).toEqual(value.chapters);
    expect(await restoreCloudSnapshot(bytes,id,await contentHash(bytes))).toBe('existing');
  });
  it('rejects malformed album before restore writes and preserves local records',async()=>{
    const value=validateCloudSnapshot(snapshot('Keep'));await db.books.add(value.book);await db.chapters.bulkAdd(value.chapters);
    const before=await db.books.toArray();const bytes=new TextEncoder().encode(JSON.stringify(snapshot(5)));
    await expect(restoreCloudSnapshot(bytes,id,await contentHash(bytes))).rejects.toThrow('Album');
    expect(await db.books.toArray()).toEqual(before);expect(await db.chapters.toArray()).toEqual(value.chapters);
  });
});

describe('additive album catalog and immutable cloud uploads',()=>{
  it('migrates existing catalog rows with empty album and preserves quota, tombstones and auth',()=>{
    const sql=new DatabaseSync(':memory:');databases.push(sql);
    for(const name of ['0001_auth.sql','0002_cloud_library.sql','0003_cloud_book_deletions.sql'])sql.exec(migration(name));
    sql.prepare("INSERT INTO cloud_books VALUES (?, 'Old', ?, 123, 'ready', 'old-key', 9)").run(id,'a'.repeat(64));
    sql.prepare('INSERT INTO sessions VALUES (?, 99)').run('b'.repeat(64));
    sql.prepare('INSERT INTO cloud_book_deletions VALUES (?, 77)').run(chapterId);
    const before=sql.prepare('SELECT * FROM cloud_books').get();sql.exec(migration('0004_cloud_book_albums.sql'));
    expect(sql.prepare('SELECT * FROM cloud_books').get()).toEqual({...before,album:''});
    expect(sql.prepare('SELECT SUM(bytes) AS total FROM cloud_books').get()?.total).toBe(123);
    expect(sql.prepare('SELECT expires_at FROM sessions').get()?.expires_at).toBe(99);
    expect(sql.prepare('SELECT deleted_at FROM cloud_book_deletions').get()?.deleted_at).toBe(77);
  });
  it('accepts old requests without album and exposes only nonempty album',async()=>{
    const s=setup();expect((await s.put()).status).toBe(201);
    expect((await s.catalog()).books[0]).not.toHaveProperty('album');
    expect((await s.put(encodeURIComponent('  中文 tập  '),JSON.stringify(snapshot('中文 tập')),chapterId)).status).toBe(201);
    expect((await s.catalog()).books[1].album).toBe('中文 tập');
  });
  it('rejects malformed or oversized encoded headers before reservation or R2 writes',async()=>{
    const s=setup();
    for(const album of ['%','%FF','%ED%A0%80','%00','%0A',encodeURIComponent('a'.repeat(121)),'x'.repeat(1081),encodeURIComponent('😀'.repeat(61))]){
      const response=await s.put(album);expect(response.status).toBe(400);expect(await response.json()).toEqual({error:'invalid_album'});
    }
    expect(s.sql.prepare('SELECT COUNT(*) AS count FROM cloud_books').get()?.count).toBe(0);expect(s.bucket.put).not.toHaveBeenCalled();
    expect((await s.put(encodeURIComponent('界'.repeat(120)))).status).toBe(201);
  });
  it('preserves first-reserved album on identical retries, pending recovery and conflicting changes',async()=>{
    const s=setup();s.state.failPut=true;
    expect((await s.put('First')).status).toBe(503);s.state.failPut=false;
    expect((await s.put('Changed')).status).toBe(201);
    expect((await s.put('Changed')).status).toBe(200);
    expect((await s.put('Changed',JSON.stringify(snapshot('Changed')))).status).toBe(409);
    expect((await s.catalog()).books[0].album).toBe('First');expect(s.objects.size).toBe(1);
  });
  it('retains album reservation while tombstone blocks an upload paused before R2 write',async()=>{
    const s=setup();let release!:()=>void;let entered!:()=>void;
    const paused=new Promise<void>(resolve=>{entered=resolve;});
    s.state.beforePut=async()=>{entered();await new Promise<void>(resolve=>{release=resolve;});};
    const pending=s.put('Collection');await paused;expect((await s.remove()).status).toBe(200);release();
    expect((await pending).status).toBe(410);expect((await s.catalog()).books).toEqual([]);expect(s.objects.size).toBe(0);
    expect(s.sql.prepare('SELECT album, bytes FROM cloud_books').get()).toEqual({album:'Collection',bytes:Buffer.byteLength(JSON.stringify(snapshot()))});
    expect((await s.put('Changed')).status).toBe(410);
  });
});

describe('album cloud client',()=>{
  it('sends snapshot album and lists/restores it on a fresh device',async()=>{
    const s=setup();const value=validateCloudSnapshot(snapshot('  Album 中文  '));
    await db.books.add(value.book);await db.chapters.bulkAdd(value.chapters);
    const headers:Headers[]=[];
    vi.stubGlobal('fetch',vi.fn(async(path:string,init:RequestInit)=>{
      const sent=new Headers(init.headers);headers.push(sent);if(init.method==='PUT')sent.set('Origin',origin);
      return s.run(s.request(path,{...init,headers:sent}));
    }));
    expect(await syncLocalBooks()).toBe(1);expect(headers[1].get('X-Book-Album')).toBe(encodeURIComponent('Album 中文'));
    await db.delete();await db.open();const catalog=await listCloudBooks();expect(catalog[0].album).toBe('Album 中文');
    expect(await downloadCloudBook(catalog[0])).toBe('added');expect((await db.books.get(id))?.album).toBe('Album 中文');
    expect(await db.chapters.toArray()).toEqual(value.chapters);
  });
  it('rejects malformed catalog album and accepts old catalog rows',async()=>{
    const base={id,title:'Synthetic',sha256:'a'.repeat(64),bytes:10,updatedAt:1};
    for(const album of [null,42,{},'a'.repeat(121),'bad\nline','\ud800']){
      vi.stubGlobal('fetch',vi.fn(async()=>Response.json({books:[{...base,album}],cursor:null})));
      await expect(listCloudBooks()).rejects.toThrow('Album');
    }
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({books:[base],cursor:null})));
    expect((await listCloudBooks())[0].album).toBeUndefined();
  });
});
