import {test,expect,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';

const text='Chương 1\nNội dung kiểm tra.',sha=createHash('sha256').update(text).digest('hex');
const bookId=(index:number)=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const sourceId=(index:number)=>`00000000-0000-4001-8000-${String(index).padStart(12,'0')}`;
async function setup(page:Page,count:number){
  const originals:string[]=[];
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/originals')){
      const id=url.pathname.split('/').at(-2)!,index=Number(id.slice(-12));originals.push(id);
      return route.fulfill({json:{originals:[{descriptor:{version:1,sourceId:sourceId(index),name:`${index}.txt`,relativePath:`${index}.txt`,encoding:'utf-8',sha256:sha,bytes:Buffer.byteLength(text)},state:'ready',updatedAt:1}]}});
    }
    if(url.pathname==='/api/cloud/books')return route.fulfill({json:url.search?{features:{originalsV1:true}}:{books:[],cursor:null}});
    if(url.pathname==='/api/cloud/deletions')return route.fulfill({json:{ids:[],cursor:null}});
    return route.fulfill({status:503,json:{error:'isolated synthetic fixture'}});
  });
  await page.addInitScript(()=>{
    Reflect.set(window,'sourceBlobReads',0);
    const original=Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer=function(){Reflect.set(window,'sourceBlobReads',Reflect.get(window,'sourceBlobReads')+1);return original.call(this);};
  });
  await page.goto('/');
  await page.evaluate(async({count,text,sha})=>{
    const {db}=await import('/src/core/db.ts');
    const bookId=(index:number)=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
    const sourceId=(index:number)=>`00000000-0000-4001-8000-${String(index).padStart(12,'0')}`;
    await db.transaction('rw',[db.books,db.sources,db.settings],async()=>{
      await db.books.bulkAdd(Array.from({length:count},(_,index)=>({id:bookId(index),title:`Truyện ${index}`,album:'Tác giả thử nghiệm',author:'',status:'ready',chapterCount:1,charCount:text.length,createdAt:1,updatedAt:1})));
      await db.sources.bulkAdd(Array.from({length:count},(_,index)=>({id:sourceId(index),bookId:bookId(index),name:`${index}.txt`,relativePath:`${index}.txt`,encoding:'utf-8',sha256:sha,bytes:new Blob([text]).size,blob:new Blob([text])})));
      const sources=await db.sources.toArray();
      await db.settings.bulkPut(sources.flatMap(source=>[{key:`cloud-uploaded:${location.origin}:${source.bookId}`,value:{sha256:sha}},{key:`cloud-original-uploaded:${location.origin}:revision:${source.id}`,value:{bookId:source.bookId,revision:source.syncRevision}}]));
    });
  },{count,text,sha});
  return originals;
}
async function settle(page:Page){
  return page.evaluate(async()=>{const {syncLocalBooks}=await import('/src/features/sync-cloud/services/cloud-client.ts');const start=performance.now();await syncLocalBooks();return {ms:performance.now()-start,blobReads:Reflect.get(window,'sourceBlobReads')};});
}
test('1000 books reload without original requests or Blob reads; a changed source automatically verifies once',async({page},testInfo)=>{
  const originals=await setup(page,1000);await page.goto('/phong-toi');
  await expect(page.getByRole('link',{name:'Mở Album Tác giả thử nghiệm',exact:true})).toBeVisible();
  const measurement=await settle(page);expect(originals).toEqual([]);expect(measurement.blobReads).toBe(0);
  console.info(JSON.stringify({project:testInfo.project.name,books:1000,...measurement}));
  await testInfo.attach('1000-book-sync',{body:JSON.stringify(measurement),contentType:'application/json'});
  await expect(page.getByText(/^Đồng bộ \d+\/1000/)).toHaveCount(0);
  await page.evaluate(async source=>{const {db}=await import('/src/core/db.ts');await db.sources.update(source,{displayName:'Tên mới'});},sourceId(7));
  await expect.poll(()=>originals).toEqual([bookId(7)]);
  await expect.poll(()=>page.evaluate(async source=>{const {db}=await import('/src/core/db.ts');return (await db.settings.get(`cloud-original-uploaded:${location.origin}:revision:${source}`))?.value.revision===(await db.sources.get(source))?.syncRevision;},sourceId(7))).toBe(true);
  await page.reload();const after=await settle(page);expect(after.blobReads).toBe(0);expect(originals).toEqual([bookId(7)]);
});
test('a source changed during sync gets a trailing pass; interrupted transfer retries on online',async({page})=>{
  const originals=await setup(page,2);await settle(page);
  let release!:()=>void,entered=false,fail=true;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route(`**/api/cloud/books/${bookId(0)}/originals`,async route=>{
    if(!fail)return route.fallback();entered=true;await gate;return route.fulfill({status:503,json:{error:'offline'}});
  });
  await page.evaluate(async source=>{const {db}=await import('/src/core/db.ts');await db.sources.update(source,{displayName:'Đổi lần đầu'});},sourceId(0));
  await expect.poll(()=>entered).toBe(true);
  await page.evaluate(async source=>{const {db}=await import('/src/core/db.ts');await db.sources.update(source,{displayName:'Đổi trong lúc đang đồng bộ'});},sourceId(1));
  release();await expect.poll(()=>originals.includes(bookId(1))).toBe(true);
  fail=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect.poll(()=>originals.includes(bookId(0))).toBe(true);
  await expect.poll(()=>page.evaluate(async()=>{const {pendingOriginalBooks}=await import('/src/features/sync-cloud/services/original-sync-index.ts');const {db}=await import('/src/core/db.ts');return (await pendingOriginalBooks(new Set(await db.books.toCollection().primaryKeys()),location.origin)).size;})).toBe(0);
});
