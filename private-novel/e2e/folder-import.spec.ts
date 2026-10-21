import {test,expect,type Page} from '@playwright/test';
async function choose(page:Page){
 await page.goto('/');await page.getByRole('button',{name:'＋ Thêm truyện TXT / EPUB',exact:true}).click();await page.getByRole('button',{name:'Nhập folder truyện',exact:true}).click();
 await page.getByLabel('Chọn folder truyện',{exact:true}).evaluate((element:HTMLInputElement)=>{
   const data=new DataTransfer();
   for(const [path,text] of [['Kho/A/10.txt','Chương mười\nNội dung 10'],['Kho/A/2.txt','Chương hai\nNội dung 2'],['Kho/B/1.txt','Chương một\nNội dung 2'],['Kho/B/cover.jpg','synthetic']]){
     const file=new File([text],path.split('/').at(-1)!);Object.defineProperty(file,'webkitRelativePath',{value:path});data.items.add(file);
   }
   element.files=data.files;element.dispatchEvent(new Event('change',{bubbles:true}));
 });
}
test('TXT files become separate books in full-parent Albums after a single import click',async({page})=>{
 await choose(page);const preview=page.getByRole('region',{name:'Xem trước folder'});await expect(preview).toContainText('2 Album · 3 truyện · 3 file TXT');await expect(page.getByText('Không nhập 1 file không phải TXT / EPUB')).toBeVisible();
 await expect(preview.locator('ol').first().locator('li')).toHaveText(['2 — 2.txt','10 — 10.txt']);
 await page.getByRole('button',{name:'Nhập folder',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.books.where('status').equals('ready').count();})).toBe(3);
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.reader-book-heading h1')).toHaveText('2');await expect(page.locator('.prose')).toContainText('Nội dung 2');
 const data=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:(await db.books.toArray()).map(book=>({title:book.title,count:book.chapterCount,status:book.status,album:book.album})),chapters:(await db.chapters.toArray()).map(chapter=>({title:chapter.title,text:chapter.text,order:chapter.order})),sources:await db.sources.count()};});
 expect(data.books).toEqual(expect.arrayContaining([{title:'2',count:1,status:'ready',album:'Kho/A'},{title:'10',count:1,status:'ready',album:'Kho/A'},{title:'1',count:1,status:'ready',album:'Kho/B'}]));expect(data.chapters).toHaveLength(3);expect(data.sources).toBe(3);
 expect(data.chapters).toEqual(expect.arrayContaining([{title:'2',text:'Chương hai\nNội dung 2',order:0},{title:'10',text:'Chương mười\nNội dung 10',order:0}]));
});
test('cancel folder processing removes staging records without creating a book',async({page})=>{
 await choose(page);
 await page.evaluate(()=>{
   const NativeWorker=window.Worker;
   window.Worker=class extends NativeWorker {
     constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',event=>{if(event.data.type==='done'){event.stopImmediatePropagation();(window as unknown as {heldImportDone:boolean}).heldImportDone=true;}});}
   };
 });
await page.getByRole('button',{name:'Nhập folder',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {heldImportDone?:boolean}).heldImportDone)).toBe(true);await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.chapters.count();})).toBeGreaterThan(0);await page.getByRole('button',{name:'Hủy xử lý',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Đã hủy nhập');await page.getByRole('button',{name:'Đóng',exact:true}).last().click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return [await db.books.count(),await db.chapters.count(),await db.sources.count(),await db.importJobs.count()];})).toEqual([0,0,0,0]);
});

