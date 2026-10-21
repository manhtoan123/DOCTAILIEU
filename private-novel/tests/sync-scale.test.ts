import 'fake-indexeddb/auto';
import {createHash} from 'node:crypto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {syncLocalBooks} from '../src/features/sync-cloud/services/cloud-client';
import {syncBookOriginals} from '../src/features/sync-cloud/services/cloud-original-client';
import {originalRevisionKey,pendingOriginalBooks} from '../src/features/sync-cloud/services/original-sync-index';

const origin='https://scale.test',content='Chương 1\nNội dung.',sha=createHash('sha256').update(content).digest('hex');
const bookId=(index:number)=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const sourceId=(index:number)=>`00000000-0000-4001-8000-${String(index).padStart(12,'0')}`;
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('location',{origin});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function seed(count:number){
  await db.books.bulkAdd(Array.from({length:count},(_,index)=>({id:bookId(index),title:`Truyện ${index}`,author:'',status:'ready' as const,chapterCount:1,charCount:content.length,createdAt:1,updatedAt:1})));
  await db.sources.bulkAdd(Array.from({length:count},(_,index)=>({id:sourceId(index),bookId:bookId(index),name:`${index}.txt`,relativePath:`${index}.txt`,encoding:'utf-8',sha256:sha,bytes:new Blob([content]).size,blob:new Blob([content])})));
  const sources=await db.sources.toArray();
  await db.settings.bulkPut(sources.flatMap(source=>[{key:`cloud-uploaded:${origin}:${source.bookId}`,value:{sha256:sha}},{key:originalRevisionKey(origin,source.id),value:{bookId:source.bookId,revision:source.syncRevision}}]));
}
function remote(){
  const fetch=vi.fn(async(path:string)=>{
    if(path.endsWith('?features=1'))return Response.json({features:{originalsV1:true}});
    if(path.endsWith('/originals')){
      const id=path.split('/').at(-2)!,sources=await db.sources.where('bookId').equals(id).toArray();
      return Response.json({originals:sources.map(source=>({descriptor:{version:1,sourceId:source.id,name:source.name,relativePath:source.relativePath,encoding:source.encoding,sha256:source.sha256,bytes:source.bytes},state:'ready',updatedAt:1}))});
    }
    return Response.json({books:[],cursor:null});
  });vi.stubGlobal('fetch',fetch);return fetch;
}
it('1000 acknowledged books use only two probes, no source body reads or hashes, including reopening the DB',async()=>{
  await seed(1000);db.close();await db.open();const fetch=remote(),status=vi.fn();
  const body=vi.spyOn(Blob.prototype,'arrayBuffer').mockRejectedValue(new Error('Unchanged bytes must not be read'));
  const reads=vi.spyOn(db.sources.core,'getMany'),gets=vi.spyOn(db.sources.core,'get');
  expect(await syncLocalBooks(status)).toBe(0);
  expect(fetch.mock.calls.map(call=>call[0])).toEqual(['/api/cloud/books','/api/cloud/books?features=1']);
  expect(reads).not.toHaveBeenCalled();expect(gets).not.toHaveBeenCalled();expect(body).not.toHaveBeenCalled();expect(status).not.toHaveBeenCalled();
});
it('only the changed source is checked, acknowledged again, and skipped on the next pass',async()=>{
  await seed(1000);await db.sources.update(sourceId(7),{displayName:'Tên Việt'});const fetch=remote(),status=vi.fn();
  expect(await pendingOriginalBooks(new Set([bookId(7),bookId(8)]),origin)).toEqual(new Set([bookId(7)]));
  expect(await syncLocalBooks(status)).toBe(0);
  expect(fetch.mock.calls.filter(call=>call[0].endsWith('/originals')).map(call=>call[0])).toEqual([`/api/cloud/books/${bookId(7)}/originals`]);
  expect(status).not.toHaveBeenCalled();fetch.mockClear();await syncLocalBooks(status);expect(fetch).toHaveBeenCalledTimes(2);
});
it('same-size Blob replacement invalidates cached revision even when put carries the old stamp',async()=>{
  await seed(1);const source=(await db.sources.get(sourceId(0)))!;
  await db.sources.put({...source,blob:new Blob([new Uint8Array(source.bytes)])});remote();
  await expect(syncLocalBooks()).rejects.toThrow('checksum');
  expect(await pendingOriginalBooks(new Set([bookId(0)]),origin)).toEqual(new Set([bookId(0)]));
});
it('failed request keeps pending; retry verifies and clears pending without uploading ready remote bytes',async()=>{
  await seed(1);await db.settings.delete(originalRevisionKey(origin,sourceId(0)));
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'offline'},{status:503})));
  await expect(syncBookOriginals(bookId(0),undefined,true)).rejects.toThrow();
  expect(await pendingOriginalBooks(new Set([bookId(0)]),origin)).toEqual(new Set([bookId(0)]));
  const fetch=remote();expect(await syncBookOriginals(bookId(0),undefined,true)).toBe(1);expect(fetch).toHaveBeenCalledTimes(1);
  expect(await pendingOriginalBooks(new Set([bookId(0)]),origin)).toEqual(new Set());
});
it('missing and staging sources are not uploaded; rolled-back replacement retains the valid receipt',async()=>{
  await seed(3);await db.books.update(bookId(1),{status:'staging'});await db.settings.delete(originalRevisionKey(origin,sourceId(1)));
  await db.sources.update(sourceId(2),{dataStatus:'missing',blob:new Blob([])});
  await expect(db.transaction('rw',db.sources,async()=>{await db.sources.update(sourceId(0),{blob:new Blob(['bad'])});throw Error('rollback');})).rejects.toThrow('rollback');
  const fetch=remote();expect(await syncLocalBooks()).toBe(0);expect(fetch).toHaveBeenCalledTimes(2);
});
