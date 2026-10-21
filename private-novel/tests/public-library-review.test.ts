import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {D1Database,R2Bucket} from '@cloudflare/workers-types';
import {handleCloudLibrary,type CloudLibraryEnv} from '../server/cloud-library';
import {handleCloudDictionaries,CLOUD_DICTIONARY_MANIFEST_KEY} from '../server/cloud-dictionaries';
import {db} from '../src/core/db';
import {installDefaultDictionaries} from '../src/features/sync-cloud/services/cloud-dictionaries';
import {deleteCloudBook,listCloudBooks,listDeletedCloudBooks,syncLocalBooks} from '../src/features/sync-cloud/services/cloud-client';
import {CLOUD_DEVICE_TOKEN_KEY} from '../src/features/sync-cloud/services/cloud-device';
import type {DictKind} from '../src/core/domain';

// Independently authored synthetic fixtures. Production SQL executes in SQLite;
// production client code executes against fake IndexedDB and handler transport.
const origin='https://review.test',id='00000000-0000-4000-8000-000000000001';
const digest=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const encode=(value:string)=>new TextEncoder().encode(value);
const opened:DatabaseSync[]=[];
beforeEach(async()=>{
  await db.delete();await db.open();
  vi.stubGlobal('location',{origin});
  vi.stubGlobal('navigator',{storage:{estimate:async()=>({})}});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();for(const sql of opened.splice(0))sql.close();});
async function seedBook(){
  await db.books.add({id,title:'Review synthetic',author:'',status:'ready',chapterCount:1,charCount:2,createdAt:1,updatedAt:1});
  await db.chapters.add({id:'00000000-0000-4000-8000-000000000002',bookId:id,order:0,title:'Chapter',text:'正文',sourceId:'',revision:1});
}
function fixture(){
  const sql=new DatabaseSync(':memory:');opened.push(sql);
  for(const name of ['0001_auth.sql','0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql'])sql.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  const database={prepare(query:string){let args:SQLInputValue[]=[];return {
    bind(...values:SQLInputValue[]){args=values;return this;},
    async first(){return sql.prepare(query).get(...args)??null;},
    async all(){return {results:sql.prepare(query).all(...args),success:true};},
    async run(){return {success:true,meta:sql.prepare(query).run(...args)};},
  };}};
  const objects=new Map<string,Uint8Array<ArrayBuffer>>();
  const hooks:{get?:(key:string)=>Promise<void>;put?:()=>Promise<void>;delete?:()=>Promise<void>}={};
  const meta=(key:string)=>{const bytes=objects.get(key);return bytes?{key,size:bytes.length,customMetadata:{sha256:digest(bytes)},checksums:{sha256:Uint8Array.from(Buffer.from(digest(bytes),'hex')).buffer}}:null;};
  const bucket={
    get:vi.fn(async(key:string)=>{await hooks.get?.(key);const info=meta(key);return info?{...info,body:new Response(objects.get(key)!).body}:null;}),
    head:vi.fn(async(key:string)=>meta(key)),
    put:vi.fn(async(key:string,bytes:Uint8Array)=>{await hooks.put?.();if(objects.has(key))return null;objects.set(key,bytes.slice());return meta(key);}),
    delete:vi.fn(async(key:string)=>{await hooks.delete?.();objects.delete(key);}),
  };
  const env:CloudLibraryEnv={DB:database as unknown as D1Database,AUTH_PASSWORD_HASH:'',PUBLIC_LIBRARY:'1',LIBRARY_BUCKET:bucket as unknown as R2Bucket};
  const transport=vi.fn(async(path:string,init:RequestInit={})=>{
    const headers=new Headers(init.headers);if(init.method&&init.method!=='GET')headers.set('Origin',origin);
    const request=new Request(origin+path,{...init,headers});
    return path.startsWith('/api/cloud/dictionaries')?handleCloudDictionaries(request,env):handleCloudLibrary(request,env);
  });
  vi.stubGlobal('fetch',transport);
  function dictionaries(specs:{kind:DictKind;text:string}[]){
    const entries=specs.map(({kind,text})=>{const bytes=encode(text),sha256=digest(bytes),objectKey=`dictionaries/v1/${kind}/${sha256}.txt`;objects.set(objectKey,bytes);return {kind,name:`${kind}.txt`,bytes:bytes.length,sha256,objectKey};});
    objects.set(CLOUD_DICTIONARY_MANIFEST_KEY,encode(JSON.stringify({version:1,dictionaries:entries})));return entries;
  }
  return {sql,objects,hooks,bucket,env,transport,dictionaries};
}

describe('independent public library integration review',()=>{
  it('applies the additive migration to an already populated legacy database without changing rows',()=>{
    const sql=new DatabaseSync(':memory:');opened.push(sql);
    for(const name of ['0001_auth.sql','0002_cloud_library.sql'])sql.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
    sql.prepare('INSERT INTO sessions VALUES (?,?)').run(digest('synthetic'),123);
    sql.prepare("INSERT INTO cloud_books (id, title, sha256, bytes, state, object_key, updated_at) VALUES (?,?,?,?,'ready',?,?)").run(id,'Original',digest('content'),7,`books/v1/${id}/${digest('content')}.json`,123);
    const books=sql.prepare('SELECT * FROM cloud_books').all(),sessions=sql.prepare('SELECT * FROM sessions').all();
    const migration=readFileSync(new URL('../migrations/0003_cloud_book_deletions.sql',import.meta.url),'utf8');sql.exec(migration);sql.exec(migration);
    expect(sql.prepare('SELECT * FROM cloud_books').all()).toEqual(books);expect(sql.prepare('SELECT * FROM sessions').all()).toEqual(sessions);
    expect(sql.prepare('SELECT * FROM cloud_book_deletions').all()).toEqual([]);
  });
  it('supports anonymous upload/list/delete, suppresses reupload and retains local content',async()=>{
    const s=fixture();await seedBook();
    expect(await syncLocalBooks()).toBe(1);expect((await listCloudBooks()).map(b=>b.id)).toEqual([id]);
    for(const [,init]of s.transport.mock.calls)expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    await deleteCloudBook(id);expect(await listCloudBooks()).toEqual([]);expect(await listDeletedCloudBooks()).toEqual([id]);
    expect(await db.books.get(id)).toBeDefined();expect(await db.chapters.count()).toBe(1);
    expect(await db.settings.get(`cloud-uploaded:${origin}:${id}`)).toBeUndefined();
    expect(await syncLocalBooks()).toBe(0);expect(s.bucket.put).toHaveBeenCalledOnce();
    expect(s.sql.prepare('SELECT SUM(bytes) AS total FROM cloud_books').get()?.total).toBeGreaterThan(0);
  });
  it('rejects foreign/missing Origin before any mutation and preserves private-mode compatibility',async()=>{
    const s=fixture();
    for(const value of ['', 'null','https://evil.test',`${origin}/`]){
      expect((await handleCloudLibrary(new Request(`${origin}/api/cloud/books/${id}`,{method:'DELETE',headers:{Origin:value}}),s.env)).status).toBe(403);
    }
    expect(s.sql.prepare('SELECT * FROM cloud_book_deletions').all()).toEqual([]);
    s.env.PUBLIC_LIBRARY='0';s.env.CLOUD_ACCESS_TOKEN_HASH=digest('1'.repeat(64));
    expect((await handleCloudLibrary(new Request(`${origin}/api/cloud/books`),s.env)).status).toBe(401);
    s.env.PUBLIC_LIBRARY='true';expect((await handleCloudLibrary(new Request(`${origin}/api/cloud/books`),s.env)).status).toBe(503);
  });
  it('keeps tombstone durable when R2 cleanup fails and an old client retries without local marker',async()=>{
    const s=fixture();await seedBook();await syncLocalBooks();
    s.hooks.delete=async()=>{throw new Error('synthetic unavailable');};await deleteCloudBook(id);
    expect(s.objects.size).toBe(1);await db.settings.clear();
    expect(await syncLocalBooks()).toBe(0);
    expect(await db.settings.get(`cloud-deleted:${origin}:${id}`)).toBeDefined();
    const attempts=s.transport.mock.calls.filter(([,init])=>init?.method==='PUT').length;
    expect(await syncLocalBooks()).toBe(0);expect(s.transport.mock.calls.filter(([,init])=>init?.method==='PUT')).toHaveLength(attempts);
    expect(await listCloudBooks()).toEqual([]);expect(await db.books.count()).toBe(1);expect(s.bucket.put).toHaveBeenCalledOnce();
    delete s.hooks.delete;await deleteCloudBook(id);expect(s.objects.size).toBe(0);
  });
  it('cannot resurrect an upload while deletion commits before R2 put',async()=>{
    const s=fixture();await seedBook();
    s.hooks.put=async()=>{delete s.hooks.put;const request=new Request(`${origin}/api/cloud/books/${id}`,{method:'DELETE',headers:{Origin:origin}});expect((await handleCloudLibrary(request,s.env)).status).toBe(200);};
    expect(await syncLocalBooks()).toBe(0);expect(await db.settings.get(`cloud-deleted:${origin}:${id}`)).toBeDefined();
    expect(await listCloudBooks()).toEqual([]);expect(s.objects.size).toBe(0);expect(await db.books.count()).toBe(1);
    expect(await db.settings.get(`cloud-uploaded:${origin}:${id}`)).toBeUndefined();
  });
  it('surfaces failure to persist a 410 marker without losing local content, and safely retries',async()=>{
    const s=fixture();await seedBook();
    s.sql.prepare('INSERT INTO cloud_book_deletions VALUES (?,?)').run(id,1);
    const fail=(key:unknown)=>{if(key===`cloud-deleted:${origin}:${id}`)throw new Error('synthetic quota');};db.settings.hook('creating',fail);
    try{await expect(syncLocalBooks()).rejects.toThrow('synthetic quota');}finally{db.settings.hook('creating').unsubscribe(fail);}
    expect(await db.books.count()).toBe(1);expect(await db.chapters.count()).toBe(1);expect(await db.settings.get(`cloud-deleted:${origin}:${id}`)).toBeUndefined();
    expect(await syncLocalBooks()).toBe(0);expect(await db.settings.get(`cloud-deleted:${origin}:${id}`)).toBeDefined();expect(s.bucket.put).not.toHaveBeenCalled();
  });
  it('does not commit partial deletion markers when a later page is malformed',async()=>{
    fixture();let calls=0;
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json(++calls===1?{ids:[id],cursor:id}:{ids:['invalid'],cursor:null})));
    await expect(listDeletedCloudBooks()).rejects.toThrow();expect(await db.settings.count()).toBe(0);
  });
  it('rolls all deletion markers back on quota failure',async()=>{
    fixture();const second='00000000-0000-4000-8000-000000000003';
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ids:[id,second],cursor:null})));
    const fail=(key:unknown)=>{if(key===`cloud-deleted:${origin}:${second}`)throw new Error('synthetic quota');};
    db.settings.hook('creating',fail);
    try{await expect(listDeletedCloudBooks()).rejects.toThrow('synthetic quota');}finally{db.settings.hook('creating').unsubscribe(fail);}
    expect(await db.settings.count()).toBe(0);
  });
});

describe('independent default dictionary transaction review',()=>{
  it('installs verified public dictionary bytes and never overwrites an existing local kind',async()=>{
    const s=fixture();const entries=s.dictionaries([{kind:'vp',text:'字=cloud'},{kind:'hanviet',text:'字=tự'}]);
    const local={kind:'vp' as const,name:'my choices',sha256:digest('字=local'),blob:new Blob(['字=local']),updatedAt:17};await db.dictionaries.add(local);
    expect(await installDefaultDictionaries()).toBe(1);
    const kept=await db.dictionaries.get('vp');expect(kept?.name).toBe('my choices');expect(await kept?.blob.text()).toBe('字=local');expect(kept?.updatedAt).toBe(17);
    expect(await (await db.dictionaries.get('hanviet'))?.blob.text()).toBe('字=tự');
    expect(s.bucket.get.mock.calls.some(([key])=>key===entries[0].objectKey)).toBe(false);
    expect(await installDefaultDictionaries()).toBe(0);
  });
  it('preserves a user dictionary added during the remote download before commit',async()=>{
    const s=fixture();const [entry]=s.dictionaries([{kind:'vp',text:'字=cloud'}]);
    s.hooks.get=async key=>{if(key!==entry.objectKey)return;delete s.hooks.get;await db.dictionaries.add({kind:'vp',name:'concurrent local',sha256:digest('字=local'),blob:new Blob(['字=local']),updatedAt:19});};
    expect(await installDefaultDictionaries()).toBe(0);expect(await (await db.dictionaries.get('vp'))?.blob.text()).toBe('字=local');
  });
  it('saves none of the missing kinds if a later dictionary has no valid entries',async()=>{
    const s=fixture();s.dictionaries([{kind:'vp',text:'字=word'},{kind:'hanviet',text:'no valid entry'}]);
    await expect(installDefaultDictionaries()).rejects.toThrow('không có từ điển hợp lệ');expect(await db.dictionaries.count()).toBe(0);
  });
  it('saves none of the missing kinds if the transaction hits quota on a later add',async()=>{
    const s=fixture();s.dictionaries([{kind:'vp',text:'字=word'},{kind:'hanviet',text:'字=tự'}]);
    const fail=(key:unknown)=>{if(key==='hanviet')throw new Error('synthetic quota');};db.dictionaries.hook('creating',fail);
    try{await expect(installDefaultDictionaries()).rejects.toThrow('synthetic quota');}finally{db.dictionaries.hook('creating').unsubscribe(fail);}
    expect(await db.dictionaries.count()).toBe(0);
    expect(await installDefaultDictionaries()).toBe(2);
  });
  it('rejects changed credentials during download without persisting dictionaries',async()=>{
    const s=fixture();const [entry]=s.dictionaries([{kind:'vp',text:'字=word'}]);
    s.hooks.get=async key=>{if(key===entry.objectKey)await db.settings.put({key:CLOUD_DEVICE_TOKEN_KEY,value:'1'.repeat(64)});};
    await expect(installDefaultDictionaries()).rejects.toThrow('Kết nối kho đã thay đổi');expect(await db.dictionaries.count()).toBe(0);
  });
  it('independently hashes downloaded bytes even when a manifest and transport claim a valid hash',async()=>{
    fixture();const text='字=word',sha256=digest(text);let call=0;
    vi.stubGlobal('fetch',vi.fn(async()=>++call===1?Response.json({version:1,dictionaries:[{kind:'vp',name:'vp',sha256,bytes:encode(text).length}]}):new Response(encode('字=evil'))));
    await expect(installDefaultDictionaries()).rejects.toThrow('checksum');expect(await db.dictionaries.count()).toBe(0);
  });
  it('bounds actual downloaded bytes and rejects oversized input before persisting',async()=>{
    fixture();let call=0;const text='字=word';
    vi.stubGlobal('fetch',vi.fn(async()=>++call===1?Response.json({version:1,dictionaries:[{kind:'vp',name:'vp',sha256:digest(text),bytes:encode(text).length}]}):new Response(encode(text+'extra'))));
    await expect(installDefaultDictionaries()).rejects.toThrow('vượt kích thước');expect(await db.dictionaries.count()).toBe(0);
  });
  it('coalesces simultaneous installs and returns the same atomic result',async()=>{
    const s=fixture();s.dictionaries([{kind:'vp',text:'字=word'}]);
    const first=installDefaultDictionaries(),second=installDefaultDictionaries();expect(first).toBe(second);
    expect(await first).toBe(1);expect(await second).toBe(1);expect(await db.dictionaries.count()).toBe(1);
    expect(s.transport).toHaveBeenCalledTimes(2);
  });
});
