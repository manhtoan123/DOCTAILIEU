import {test,expect,type Page} from '@playwright/test';

async function choose(page:Page,onlyLarge=false){
  await page.goto('/');await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();
  await page.getByRole('button',{name:'Nhập folder truyện',exact:true}).click();
  await page.getByLabel('Chọn folder truyện',{exact:true}).evaluate((element:HTMLInputElement,largeOnly:boolean)=>{
    const data=new DataTransfer();
    // Actual >2 MiB bytes, two Chinese headings, CRLF and astral characters.
    const body='正文山门。🙂\r\n'.repeat(50000);
    const text=`第1章 开始\r\n${body}第2章 结束\r\n${body}`;
    const paths=largeOnly?['Kho/A/A.txt']:['Kho/A/1.txt','Kho/A/A.txt','Kho/B/A.txt'];
    for(const path of paths){
      const file=new File([path.endsWith('/1.txt')?'第1章 普通\r\n小正文。':text],path.split('/').at(-1)!);
      Object.defineProperty(file,'webkitRelativePath',{value:path});data.items.add(file);
    }
    element.files=data.files;element.dispatchEvent(new Event('change',{bubbles:true}));
  },onlyLarge);
}

test('one folder selection streams large TXT as distinct books with mandatory headings, originals and Album',async({page})=>{
  await choose(page);
  const preview=page.getByRole('region',{name:'Xem trước folder'});
  await expect(preview).toContainText('3 truyện · 3 file TXT');
  await expect(preview).toContainText('Kho/A — 2 truyện');
  await expect(preview).toContainText('A — A.txt');
  await expect(preview).toContainText('Kho/B — 1 truyện');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button',{name:'Nhập folder',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:20000});
  const prepared=await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    const body='正文山门。🙂\r\n'.repeat(50000),original=`第1章 开始\r\n${body}第2章 结束\r\n${body}`;
    const bytes=new TextEncoder().encode(original);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const books=await db.books.toArray();const sources=await db.sources.toArray();const checks=[];
    for(const source of sources.filter(source=>source.bytes>2*1024*1024)){
      const chapters=await db.chapters.where('[bookId+order]').between([source.bookId,0],[source.bookId,Infinity]).toArray();
      const blobBytes=new Uint8Array(await source.blob.arrayBuffer());
      checks.push({bookId:source.bookId,path:source.relativePath,bytes:source.bytes,hashCorrect:source.sha256===hash,bytesCorrect:blobBytes.length===bytes.length&&blobBytes.every((value,index)=>value===bytes[index]),textCorrect:chapters.map(chapter=>chapter.text).join('')===original.replace(/\r\n?/g,'\n'),headings:['第1章 开始','第2章 结束'].every(title=>chapters.some(chapter=>chapter.title===title)),bounded:chapters.every(chapter=>chapter.text.length<=64000),parts:chapters.length});
    }
    return {books:books.map(book=>({id:book.id,title:book.title,status:book.status})),checks};
  });
  expect(prepared.books).toHaveLength(3);expect(prepared.books.every(book=>book.status==='ready')).toBe(true);
  expect(new Set(prepared.books.map(book=>book.id)).size).toBe(3);expect(prepared.checks).toHaveLength(2);
  expect(prepared.checks.map(check=>check.path).sort()).toEqual(['Kho/A/A.txt','Kho/B/A.txt']);
  for(const check of prepared.checks){expect(check.bytes).toBeGreaterThan(2*1024*1024);expect(check.hashCorrect&&check.bytesCorrect&&check.textCorrect&&check.headings&&check.bounded).toBe(true);expect(check.parts).toBeGreaterThan(2);}
  await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:20000});
  await expect(page.locator('.reader-book-heading h1')).toHaveText('1');
  const committed=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:await db.books.toArray(),jobs:await db.importJobs.toArray()};});
  expect(committed.books.every(book=>book.status==='ready'&&['Kho/A','Kho/B'].includes(book.album!))).toBe(true);
  expect(committed.jobs.every(job=>job.phase==='committed')).toBe(true);
  await page.reload();await page.getByLabel('Lọc Album',{exact:true}).selectOption('album:Kho/A');
  await expect(page.locator('.book-card')).toHaveCount(2);
});

test('large-only folder is selectable and cancelling its real Worker processing preserves unrelated library data',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    await db.books.add({id:'old-unrelated',title:'Old unrelated',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:0,charCount:0,album:'Old Album'});
  });
  await choose(page,true);
 await page.evaluate(()=>{
   const NativeWorker=window.Worker;
   window.Worker=class extends NativeWorker {
     constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',event=>{if(event.data.type==='done'){event.stopImmediatePropagation();(window as unknown as {heldImportDone:boolean}).heldImportDone=true;}});}
   };
 });

  await expect(page.getByRole('region',{name:'Xem trước folder'})).toContainText('1 truyện · 1 file TXT');
  await expect(page.getByRole('button',{name:'Nhập folder',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Nhập folder',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {heldImportDone?:boolean}).heldImportDone)).toBe(true);await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.chapters.count();})).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Hủy xử lý',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Đã hủy nhập');await page.getByRole('button',{name:'Đóng',exact:true}).last().click();await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:20000});
  const remaining=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:(await db.books.toArray()).map(book=>({id:book.id,status:book.status,album:book.album})),chapters:await db.chapters.count(),sources:await db.sources.count(),jobs:await db.importJobs.count()};});
  expect(remaining).toEqual({books:[{id:'old-unrelated',status:'ready',album:'Old Album'}],chapters:0,sources:0,jobs:0});
});

