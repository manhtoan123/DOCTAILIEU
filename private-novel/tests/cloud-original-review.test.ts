import 'fake-indexeddb/auto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Dexie from 'dexie';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db,deleteBook} from '../src/core/db';
import {syncBookOriginals} from '../src/features/sync-cloud/services/cloud-original-client';
import * as backup from '../src/features/import-export/services/backup';
import {syncLocalBooks,deleteCloudBook,downloadCloudBook} from '../src/features/sync-cloud/services/cloud-client';
import {createCloudSnapshotWithMetadata,contentHash} from '../src/features/sync-cloud/services/cloud-snapshot';
import {routeCloudOriginals} from '../server/cloud-originals';
import type {CloudLibraryEnv} from '../server/cloud-library';

const book='00000000-0000-4000-8000-000000000001',source='00000000-0000-4000-8000-000000000002';
const bytes=new Uint8Array([65,66,67]),sha=createHash('sha256').update(bytes).digest('hex');
const descriptor={version:1,sourceId:source,name:'selected.txt',relativePath:'selected.txt',encoding:'utf-8',sha256:sha,bytes:bytes.length};
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('location',{origin:'https://review.test'});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('same-sized local Blob replacement before upload ACK cannot mark changed bytes synchronized',async()=>{
  await db.books.put({id:book,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:3});
  await db.sources.put({id:source,bookId:book,name:descriptor.name,relativePath:descriptor.relativePath,encoding:descriptor.encoding,sha256:sha,bytes:bytes.length,blob:new Blob([bytes])});
  vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>{
    if(!init?.method)return Response.json({originals:[]});
    if(init.method==='POST')return Response.json({descriptor,state:'pending'});
    await db.sources.update(source,{blob:new Blob([new Uint8Array([88,89,90])])});
    return Response.json({sourceId:source,sha256:sha,state:'ready'});
  }));
  await expect(syncBookOriginals(book)).rejects.toThrow();
  expect(await db.settings.get(`cloud-original-uploaded:https://review.test:${book}:${source}:${sha}`)).toBeUndefined();
});

it('quota singleton cannot be decreased without a reviewed reservation release protocol',()=>{
  const sql=new DatabaseSync(':memory:');
  try{
    for(const migration of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql'])sql.exec(readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));
    sql.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) VALUES(?,'Synthetic',?,3,'pending',?,1)").run(book,sha,`books/v1/${book}/${sha}.json`);
    expect(()=>sql.exec('UPDATE cloud_storage_budget SET used_bytes=0 WHERE id=1')).toThrow();
    expect(sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:3});
  }finally{sql.close();}
});

it('native abort during fresh ACK hash unlocks another connection and prevents a late digest ACK',async()=>{
  await db.books.put({id:book,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:3});
  const row={id:source,bookId:book,name:descriptor.name,relativePath:descriptor.relativePath,encoding:descriptor.encoding,sha256:sha,bytes:bytes.length,blob:new Blob([bytes])};
  await db.sources.put(row);
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({originals:[{descriptor,state:'ready',updatedAt:1}]})));
  let enter!:()=>void,release!:(value:string)=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve;});const digest=new Promise<string>(resolve=>{release=resolve;});
  vi.spyOn(backup,'hashBlob').mockResolvedValueOnce(sha).mockImplementationOnce(()=>{enter();return digest;});
  const originalWait=Dexie.waitFor;let owner:NonNullable<typeof Dexie.currentTransaction>|undefined;
  vi.spyOn(Dexie,'waitFor').mockImplementation((operation,timeout)=>{owner=Dexie.currentTransaction!;return originalWait(operation,timeout);});
  const running=syncBookOriginals(book),rejected=expect(running).rejects.toThrow(/hủy|abort/i);
  await entered;
  const other=new Dexie(db.name);await other.open();
  try{
    let externalFinished=false;
    const external=other.table('sources').put({...row,blob:new Blob([new Uint8Array([88,89,90])])}).then(()=>{externalFinished=true;});
    await new Promise(resolve=>setTimeout(resolve,20));expect(externalFinished).toBe(false);
    owner!.idbtrans.abort();await rejected;await external;
    expect(await db.settings.get(`cloud-original-uploaded:https://review.test:${book}:${source}:${sha}`)).toBeUndefined();
    release(sha);await new Promise(resolve=>setTimeout(resolve,20));
    expect(await db.settings.get(`cloud-original-uploaded:https://review.test:${book}:${source}:${sha}`)).toBeUndefined();
    expect(new Uint8Array(await (await db.sources.get(source))!.blob.arrayBuffer())).toEqual(new Uint8Array([88,89,90]));
  }finally{release(sha);other.close();}
});

it('cloud DELETE can dispatch while a bulk original upload is pending',async()=>{
  await db.books.put({id:book,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:3});
  await db.chapters.put({id:'00000000-0000-4000-8000-000000000003',bookId:book,sourceId:source,order:0,title:'Chapter',text:'ABC',revision:1});
  await db.sources.put({id:source,bookId:book,name:descriptor.name,relativePath:descriptor.relativePath,encoding:descriptor.encoding,sha256:sha,bytes:bytes.length,blob:new Blob([bytes])});
  let entered!:()=>void,release!:()=>void,deleteRequests=0;
  const started=new Promise<void>(resolve=>{entered=resolve;});const delayed=new Promise<void>(resolve=>{release=resolve;});
  vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
    if(init?.method==='DELETE'){deleteRequests++;return Response.json({id:book,deleted:true});}
    if(path==='/api/cloud/books')return Response.json({books:[],cursor:null});
    if(path==='/api/cloud/books?features=1')return Response.json({books:[],cursor:null,features:{originalsV1:true}});
    if(path===`/api/cloud/books/${book}`)return Response.json({id:book,sha256:new Headers(init?.headers).get('X-Content-SHA256')});
    if(path.endsWith('/originals'))return Response.json({originals:[]});
    if(init?.method==='POST')return Response.json({descriptor,state:'pending'});
    if(init?.method==='PUT'){entered();await delayed;return Response.json({sourceId:source,sha256:sha,state:'ready'});}
    throw new Error('Unexpected request');
  }));
  const syncing=syncLocalBooks().catch(()=>{});await started;
  const deleting=deleteCloudBook(book);
  try{await new Promise(resolve=>setTimeout(resolve,30));expect(deleteRequests).toBe(1);}
  finally{release();await syncing;await deleting;}
});

it('conditional existing-object receipt cannot bypass an already observed oversize body',async()=>{
  const sql=new DatabaseSync(':memory:');
  try{
    for(const migration of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql'])sql.exec(readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));
    sql.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) VALUES(?,'Synthetic',?,1,'ready',?,1)").run(book,sha,`books/v1/${book}/${sha}.json`);
    const key=`originals/v1/${book}/${source}/${sha}.bin`;
    sql.prepare("INSERT INTO cloud_originals VALUES(?,?,?,?,?,?,'pending',1)").run(book,source,JSON.stringify(descriptor),sha,3,key);
    const database={prepare(query:string){let args:any[]=[];return{bind(...input:any[]){args=input;return this;},async first(){return sql.prepare(query).get(...args)??null;},async run(){return sql.prepare(query).run(...args);}};}};
    let heads=0;
    const bucket={head:async()=>++heads===1?null:{key,size:3,checksums:{sha256:Uint8Array.from(Buffer.from(sha,'hex')).buffer}},put:async()=>null,delete:async()=>{}};
    const env={DB:database,LIBRARY_BUCKET:bucket} as unknown as CloudLibraryEnv;
    const body=new ReadableStream<Uint8Array>({start(controller){setTimeout(()=>{controller.enqueue(new Uint8Array([65,66,67,68]));controller.close();},10);}});
    const response=await routeCloudOriginals(new Request(`https://review.test/api/cloud/books/${book}/originals/${source}/data`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body,duplex:'half'} as RequestInit),env,p=>{void p.catch(()=>{});});
    expect(response.status).toBe(422);
    expect(sql.prepare('SELECT state FROM cloud_originals').get()).toEqual({state:'pending'});
  }finally{sql.close();}
});

async function localReader(){
  await db.books.put({id:book,title:'Synthetic',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:3});
  await db.chapters.put({id:'00000000-0000-4000-8000-000000000003',bookId:book,sourceId:source,order:0,title:'Chapter',text:'ABC',revision:1});
  await db.sources.put({id:source,bookId:book,name:descriptor.name,relativePath:descriptor.relativePath,encoding:descriptor.encoding,sha256:sha,bytes:bytes.length,blob:new Blob([bytes])});
}

it('late v1 snapshot upload ACK after DELETE never restores the upload marker',async()=>{
  await localReader();let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});const delayed=new Promise<void>(resolve=>{release=resolve;});
  vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
    if(init?.method==='DELETE')return Response.json({id:book,deleted:true});
    if(path.includes('?')||path==='/api/cloud/books')return Response.json({books:[],cursor:null});
    entered();await delayed;return Response.json({id:book,sha256:new Headers(init?.headers).get('X-Content-SHA256')});
  }));
  const running=syncLocalBooks();await started;await deleteCloudBook(book);release();
  expect(await running).toBe(0);
  expect(await db.settings.get(`cloud-uploaded:https://review.test:${book}`)).toBeUndefined();
  expect((await db.settings.get(`cloud-deleted:https://review.test:${book}`))!.value).toBe(true);
  expect((await db.chapters.toArray())[0].text).toBe('ABC');
  expect(new Uint8Array(await (await db.sources.get(source))!.blob.arrayBuffer())).toEqual(bytes);
});

it('failed cloud DELETE retains local rows and existing synchronization marker',async()=>{
  await localReader();const marker={sha256:sha,uploadedAt:1};await db.settings.put({key:`cloud-uploaded:https://review.test:${book}`,value:marker});
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'PRIVATE_DETAIL'},{status:503})));
  await expect(deleteCloudBook(book)).rejects.toThrow();
  expect(await db.books.count()).toBe(1);expect((await db.chapters.toArray())[0].text).toBe('ABC');
  expect(new Uint8Array(await (await db.sources.get(source))!.blob.arrayBuffer())).toEqual(bytes);
  expect((await db.settings.get(`cloud-uploaded:https://review.test:${book}`))!.value).toEqual(marker);
  expect(await db.settings.get(`cloud-deleted:https://review.test:${book}`)).toBeUndefined();
});

it('a v1 download finishing after DELETE cannot resurrect a local book before ACK rejection',async()=>{
  await localReader();const snapshot=await createCloudSnapshotWithMetadata(book),hash=await contentHash(snapshot.bytes);await deleteBook(book);
  vi.stubGlobal('navigator',{storage:{estimate:async()=>({usage:0,quota:1_000_000_000})}});
  let entered!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});const delayed=new Promise<void>(resolve=>{release=resolve;});
  vi.stubGlobal('fetch',vi.fn(async(_path:string,init?:RequestInit)=>{
    if(init?.method==='DELETE')return Response.json({id:book,deleted:true});
    entered();await delayed;return new Response(new Uint8Array(snapshot.bytes),{headers:{'Content-Type':'application/json'}});
  }));
  const downloading=downloadCloudBook({id:book,title:'Synthetic',sha256:hash,bytes:snapshot.bytes.length,updatedAt:1});
  const rejected=expect(downloading).rejects.toThrow();await started;await deleteCloudBook(book);release();await rejected;
  expect(await db.books.get(book)).toBeUndefined();expect(await db.chapters.count()).toBe(0);expect(await db.names.count()).toBe(0);
  expect(await db.settings.get(`cloud-uploaded:https://review.test:${book}`)).toBeUndefined();
});

it('retry conflicting declared bytes preserves reserved row even when source/hash object key would collide',()=>{
  const sql=new DatabaseSync(':memory:');
  try{
    for(const migration of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql'])sql.exec(readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));
    sql.prepare("INSERT INTO cloud_books(id,title,sha256,bytes,state,object_key,updated_at) VALUES(?,'Synthetic',?,1,'ready',?,1)").run(book,sha,`books/v1/${book}/${sha}.json`);
    const key=`originals/v1/${book}/${source}/${sha}.bin`;
    sql.prepare("INSERT INTO cloud_originals VALUES(?,?,?,?,?,?,'pending',1)").run(book,source,JSON.stringify(descriptor),sha,3,key);
    expect(()=>sql.prepare('UPDATE cloud_originals SET bytes=? WHERE source_id=?').run(4,source)).toThrow('immutable_original_descriptor');
    expect(sql.prepare('SELECT used_bytes FROM cloud_storage_budget').get()).toEqual({used_bytes:4});
    expect(sql.prepare('SELECT bytes FROM cloud_originals').get()).toEqual({bytes:3});
  }finally{sql.close();}
});
