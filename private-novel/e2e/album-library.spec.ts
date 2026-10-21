import {test,expect} from '@playwright/test';

test('Album groups independent batch books; filter, read and reload retain chapters',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
  await page.getByLabel('Album (không bắt buộc)',{exact:true}).fill('  Bộ thử  ');
  await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles(['One','Two'].map(name=>({name:`${name}.txt`,mimeType:'text/plain',buffer:Buffer.from('第1章 开始\n你好山门。\n第2章 后来\n正文结束。')})));
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button',{name:'Nhập nhiều truyện',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.reader-book-heading h1')).toHaveText('One');
  const data=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:await db.books.toArray(),chapters:await db.chapters.toArray()};});
  expect(new Set(data.books.map(book=>book.id)).size).toBe(2);
  expect(data.books.every(book=>book.album==='Bộ thử'&&book.chapterCount===2&&book.status==='ready')).toBe(true);
  expect(data.chapters).toHaveLength(4);
  await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();await expect(page).toHaveURL(/\/$/);
  await page.reload();await expect(page.locator('.book-card')).toHaveCount(2);
  await expect(page.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('button')).toHaveCount(2);
  await page.getByLabel('Lọc Album',{exact:true}).selectOption('unassigned');await expect(page.locator('.book-card')).toHaveCount(0);
  await page.getByLabel('Lọc Album',{exact:true}).selectOption('album:Bộ thử');await expect(page.locator('.book-card')).toHaveCount(2);
  await page.getByLabel('Tìm truyện',{exact:true}).fill('Two');await expect(page.locator('.book-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Mở sách →',exact:true}).click();await expect(page.locator('.reader-book-heading h1')).toHaveText('Two');
});

test('single TXT always detects Chinese headings and blank Album remains optional',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
  await expect(page.getByLabel('Cách nhập',{exact:true})).toHaveCount(0);
  await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles({name:'Plain.txt',mimeType:'text/plain',buffer:Buffer.from('第1章 开始\n正文一。\n第2章 后来\n正文二。')});
  await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.reader-book-heading h1')).toHaveText('Plain');
  await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();await expect(page).toHaveURL(/\/$/);await page.reload();await page.getByLabel('Lọc Album',{exact:true}).selectOption('unassigned');await expect(page.locator('.book-card')).toHaveCount(1);
  expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);const book=(await db.books.toArray())[0];return {album:book.album,count:book.chapterCount};})).toEqual({album:undefined,count:2});
});

test('folder import publishes Album for its books without grouping chapters across books',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
  await page.getByRole('button',{name:'Nhập folder truyện',exact:true}).click();
  await page.getByLabel('Chọn folder truyện',{exact:true}).evaluate((element:HTMLInputElement)=>{
    const data=new DataTransfer();
    for(const path of ['Kho/First/1.txt','Kho/Second/1.txt']){
      const file=new File(['第1章 开始\n正文一。\n第2章 后来\n正文二。'],path.split('/').at(-1)!);
      Object.defineProperty(file,'webkitRelativePath',{value:path});data.items.add(file);
    }
    element.files=data.files;element.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.getByRole('button',{name:'Nhập folder',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.reader-book-heading h1')).toHaveText('1');
  const books=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.books.toArray();});
  expect(books.map(book=>({title:book.title,album:book.album,count:book.chapterCount}))).toEqual(expect.arrayContaining([{title:'1',album:'Kho/First',count:2},{title:'1',album:'Kho/Second',count:2}]));
  await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();await expect(page).toHaveURL(/\/$/);await page.reload();await page.getByLabel('Lọc Album',{exact:true}).selectOption('album:Kho/First');await expect(page.locator('.book-card')).toHaveCount(1);
});


