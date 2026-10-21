import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {hashBlob} from '../src/features/import-export/services/backup';
import {syncLocalBooks} from '../src/features/sync-cloud/services/cloud-client';
const book='00000000-0000-4000-8000-000000000001',source='00000000-0000-4000-8000-000000000002';
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('location',{origin:'https://example.test'});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function seed(){
 const blob=new Blob([new Uint8Array([255,254,76,103,63,81])]);const sha256=await hashBlob(blob);
 await db.books.put({id:book,title:'Original fixture',author:'',status:'ready',createdAt:1,updatedAt:2,chapterCount:1,charCount:2});
 await db.chapters.put({id:'00000000-0000-4000-8000-000000000003',bookId:book,order:0,title:'第1章',text:'林儿',revision:1,sourceId:source});
 await db.sources.put({id:source,bookId:book,name:'story%2e.txt',relativePath:'Kho/story%2e.txt',encoding:'utf-16le',sha256,bytes:blob.size,blob});
 return {blob,sha256};
}
it('automatically publishes original after text and retries source without republishing the text snapshot',async()=>{
 const fixture=await seed();let original:any,ready=false,quota=true;const calls:string[]=[];const binaries:Uint8Array[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{
  calls.push(`${init?.method??'GET'} ${path}`);
  if(path==='/api/cloud/books')return Response.json({books:[],cursor:null});
  if(path==='/api/cloud/books?features=1')return Response.json({books:[],cursor:null,features:{originalsV1:true}});
  if(path===`/api/cloud/books/${book}`)return Response.json({id:book,sha256:new Headers(init?.headers).get('X-Content-SHA256')});
  if(path.endsWith('/originals'))return Response.json({originals:original?[{descriptor:original,state:ready?'ready':'pending',updatedAt:1}]:[]});
  if(init?.method==='POST'){
   original=JSON.parse(String(init.body));if(quota)return Response.json({error:'quota'},{status:507});return Response.json({descriptor:original,state:ready?'ready':'pending'});
  }
  if(init?.method==='PUT'){binaries.push(new Uint8Array(await (init.body as Blob).arrayBuffer()));ready=true;return Response.json({sourceId:source,sha256:fixture.sha256,state:'ready'});}
  throw new Error('Unexpected synthetic request');
 }));
 await expect(syncLocalBooks()).rejects.toThrow('giới hạn');
 expect(await db.settings.get(`cloud-uploaded:https://example.test:${book}`)).toBeDefined();
 expect(binaries).toHaveLength(0);quota=false;
 expect(await syncLocalBooks()).toBe(0);expect(binaries).toHaveLength(1);expect(binaries[0]).toEqual(new Uint8Array(await fixture.blob.arrayBuffer()));
 expect(original).toMatchObject({name:'story%2e.txt',relativePath:'Kho/story%2e.txt',encoding:'utf-16le',sha256:fixture.sha256});
 expect(await syncLocalBooks()).toBe(0);expect(binaries).toHaveLength(1);
 expect(calls.filter(call=>call===`PUT /api/cloud/books/${book}`)).toHaveLength(1);
 expect((await db.chapters.get('00000000-0000-4000-8000-000000000003'))?.text).toBe('林儿');expect(await db.books.count()).toBe(1);
});
it('an old catalog without the feature never sends source bytes or calls original endpoints',async()=>{
 const fixture=await seed();const paths:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,init?:RequestInit)=>{paths.push(path);return path.startsWith('/api/cloud/books?')||path==='/api/cloud/books'?Response.json({books:[],cursor:null}):Response.json({id:book,sha256:new Headers(init?.headers).get('X-Content-SHA256')});}));
 expect(await syncLocalBooks()).toBe(1);expect(paths.some(path=>path.includes('/originals'))).toBe(false);
 expect(await hashBlob((await db.sources.get(source))!.blob)).toBe(fixture.sha256);
});
