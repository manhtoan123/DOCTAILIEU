import {test,expect,type Page} from '@playwright/test';
async function choose(page:Page,texts=['第1章 开始\n你好山门。\n第2章 后来\n正文结束。','第1章 开始\n你好山门。\n第2章 后来\n正文结束。']){
  await page.goto('/');await page.getByRole('button',{name:'＋ Thêm truyện TXT / EPUB',exact:true}).click();
  await page.getByLabel('Chọn file TXT hoặc EPUB',{exact:true}).setInputFiles(texts.map((text,index)=>({name:`Truyện ${index+1}.txt`,mimeType:'text/plain',buffer:Buffer.from(text)})));
}
test('batch native Worker creates independent books with identical content and atomic publication',async({page})=>{
  await choose(page);await expect(page.getByRole('dialog',{name:'Nhập nhiều truyện'})).toBeVisible({timeout:20000});
  await page.getByRole('button',{name:'Nhập nhiều truyện',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const staged=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {ready:await db.books.where('status').equals('ready').count(),sources:await db.sources.count(),books:await db.books.toArray()};});
  expect(staged.ready).toBe(2);expect(staged.sources).toBe(2);expect(staged.books.map(book=>book.chapterCount)).toEqual([2,2]);
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.reader-book-heading h1')).toHaveText('Truyện 1');
  await page.reload();await expect(page.locator('.reader-book-heading h1')).toHaveText('Truyện 1');await page.goto('/');await expect(page.locator('.book-card')).toHaveCount(2);
});
test('cancel batch processing removes only this batch',async({page})=>{
  await choose(page);
 await page.evaluate(()=>{
   const NativeWorker=window.Worker;
   window.Worker=class extends NativeWorker {
     constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',event=>{if(event.data.type==='done'){event.stopImmediatePropagation();(window as unknown as {heldImportDone:boolean}).heldImportDone=true;}});}
   };
 });
await page.getByRole('button',{name:'Nhập nhiều truyện',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {heldImportDone?:boolean}).heldImportDone)).toBe(true);await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.chapters.count();})).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Hủy xử lý',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Đã hủy nhập');await page.getByRole('button',{name:'Đóng',exact:true}).last().click();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return [await db.books.count(),await db.chapters.count(),await db.sources.count(),await db.importJobs.count()];})).toEqual([0,0,0,0]);
});
test('later empty file rolls back earlier successfully staged file',async({page})=>{
  await choose(page,['第1章 开始\n第一本。','']);await page.getByRole('button',{name:'Nhập nhiều truyện',exact:true}).click();await expect(page.getByRole('dialog',{name:'Nhập nhiều truyện'}).locator(':scope > p[role="alert"]')).toContainText(/rỗng|nội dung/i);
  expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return [await db.books.count(),await db.chapters.count(),await db.sources.count(),await db.importJobs.count()];})).toEqual([0,0,0,0]);
});
