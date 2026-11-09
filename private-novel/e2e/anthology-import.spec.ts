import {test,expect,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';

const text='Lời giới thiệu\r\n第1章 山河1\r\nNội dung A1.\r\n第1章 山河2\r\nNội dung A2.\r\n第2章 江海1\r\nNội dung B1.\r\n第2章 江海2\r\nNội dung B2.';
async function begin(page:Page,bytes:Buffer){
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'isolated anthology fixture'}}));
  await page.goto('/phong-toi');
  await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();
  await page.getByLabel(/^(Chọn|Đổi) file$/).setInputFiles({name:'Tuyển tập.txt',mimeType:'text/plain',buffer:bytes});
  await page.getByRole('button',{name:'Tách tuyển tập thành nhiều truyện',exact:true}).click();
  await expect(page.getByText('2 truyện dự kiến',{exact:true})).toBeVisible();
}
test('edits proposed boundaries without library writes, then imports stories with their chapters and exact source parts',async({page})=>{
  const bytes=Buffer.from(text);await begin(page,bytes);
  const markers=page.getByRole('region',{name:'Mốc bắt đầu truyện'}).getByRole('checkbox');
  await markers.nth(1).check();await expect(page.getByText('3 truyện dự kiến',{exact:true})).toBeVisible();
  await markers.nth(1).uncheck();await expect(page.getByText('2 truyện dự kiến',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:/^Tên truyện 1/}).fill('Sơn hà');
  await page.getByRole('textbox',{name:/^Tên truyện 2/}).fill('Giang hải');
  expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return db.books.count();})).toBe(0);
  await page.getByRole('button',{name:'Tiếp tục xem trước chương',exact:true}).click();
  await expect(page.getByRole('region',{name:'Xem trước nhiều truyện'}).locator('li')).toHaveCount(2);
  await page.getByLabel('Album (không bắt buộc)',{exact:true}).fill('Tác giả thử/Series thử');
  await page.getByRole('button',{name:'Nhập nhiều truyện',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved=await page.evaluate(async()=>{
    const {db}=await import('/src/core/db.ts');const books=await db.books.toArray(),sources=(await db.sources.toArray()).sort((left,right)=>left.name.localeCompare(right.name));
    const chunks=await Promise.all(sources.map(async source=>new Uint8Array(await source.blob.arrayBuffer()))),joined=new Uint8Array(chunks.reduce((sum,chunk)=>sum+chunk.length,0));let offset=0;
    for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',joined))).map(value=>value.toString(16).padStart(2,'0')).join('');
    return {titles:books.map(book=>book.title).sort(),ready:books.every(book=>book.status==='ready'),albums:books.map(book=>book.album),counts:await Promise.all(books.map(book=>db.chapters.where('bookId').equals(book.id).count())),sha256:digest,paths:sources.map(source=>source.relativePath)};
  });
  expect(saved.titles).toEqual(['Giang hải','Sơn hà']);expect(saved.ready).toBe(true);expect(saved.albums).toEqual(['Tác giả thử/Series thử','Tác giả thử/Series thử']);
  expect(saved.counts.every(count=>count>=2)).toBe(true);expect(saved.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));expect(saved.paths.every(path=>path.startsWith('Tuyển tập.txt/'))).toBe(true);
  await page.goto('/phong-toi');await page.getByRole('link',{name:'Mở Album Tác giả thử',exact:true}).click();await page.getByRole('link',{name:'Mở Album Tác giả thử/Series thử',exact:true}).click();
  await expect(page.locator('.book-card')).toHaveCount(2);
});
test('BOM detection locks UTF16BE for later parts without a BOM',async({page})=>{
  const data=Buffer.from(text,'utf16le');data.swap16();const bytes=Buffer.concat([Buffer.from([254,255]),data]);
  await begin(page,bytes);await page.getByRole('button',{name:'Tiếp tục xem trước chương',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Encoding các truyện',exact:true})).toHaveValue('utf-16be');await expect(page.getByRole('combobox',{name:'Encoding các truyện',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Nhập nhiều truyện',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const result=await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');const sources=(await db.sources.toArray()).sort((left,right)=>left.name.localeCompare(right.name));return {encodings:sources.map(source=>source.encoding),parts:await Promise.all(sources.map(async source=>Array.from(new Uint8Array(await source.blob.arrayBuffer()))))};});
  expect(result.encodings).toEqual(['utf-16be','utf-16be']);expect(Buffer.concat(result.parts.map(part=>Buffer.from(part)))).toEqual(bytes);
});

test('large chapter lists use story headers and continue to the existing chapter preview',async({page})=>{
  const chapters=Array.from({length:1001},(_,index)=>`第${index+1}章 Chương\nNội dung.`).join('\n');
  await begin(page,Buffer.from(`文件1: Sơn hà.txt\n${chapters}\n文件2: Giang hải.txt\n${chapters}`));
  await expect(page.getByRole('region',{name:'Mốc bắt đầu truyện'}).getByRole('checkbox')).toHaveCount(2);
  await expect(page.getByRole('textbox',{name:/^Tên truyện 1/})).toHaveValue('Sơn hà');
  await expect(page.getByRole('textbox',{name:/^Tên truyện 2/})).toHaveValue('Giang hải');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return db.books.count();})).toBe(0);
  await page.getByRole('button',{name:'Tiếp tục xem trước chương',exact:true}).click();
  await expect(page.getByRole('region',{name:'Xem trước nhiều truyện'}).locator('li')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Nhập nhiều truyện',exact:true})).toBeEnabled();
});

test('unrecognized story headers expose the regex control and recover without importing',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'isolated anthology fixture'}}));
  await page.goto('/phong-toi');await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();
  const chapters=Array.from({length:1001},(_,index)=>`第${index+1}章 Chương\nNội dung.`).join('\n');
  await page.getByLabel(/^(Chọn|Đổi) file$/).setInputFiles({name:'Tuyển tập.txt',mimeType:'text/plain',buffer:Buffer.from(`BOOK A\n${chapters}\nBOOK B\n${chapters}`)});
  await page.getByRole('button',{name:'Tách tuyển tập thành nhiều truyện',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('chưa nhận diện đủ tên truyện');
  await expect(page.getByRole('button',{name:'Tiếp tục xem trước chương',exact:true})).toBeDisabled();
  await page.getByRole('textbox',{name:'Mẫu nhận diện mốc',exact:true}).fill('^BOOK ');
  await expect(page.getByText('2 truyện dự kiến',{exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Tiếp tục xem trước chương',exact:true})).toBeEnabled();
  expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return db.books.count();})).toBe(0);
});
test('invalid body encoding is rejected before deriving a batch and keeps existing books',async({page})=>{
  const bytes=Buffer.concat([Buffer.from(text+'\n'+'x'.repeat(3000)),Buffer.from([255])]);
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'isolated anthology fixture'}}));await page.goto('/phong-toi');
  await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.books.add({id:'existing',title:'Giữ nguyên',author:'',status:'ready',chapterCount:1,charCount:1,createdAt:1,updatedAt:1});});
  await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();await page.getByLabel(/^(Chọn|Đổi) file$/).setInputFiles({name:'Tuyển tập.txt',mimeType:'text/plain',buffer:bytes});await page.getByRole('button',{name:'Tách tuyển tập thành nhiều truyện',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:/encoding|hợp lệ/})).toBeVisible();await expect(page.getByRole('button',{name:'Tiếp tục xem trước chương',exact:true})).toBeDisabled();
  expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return {ids:await db.books.toCollection().primaryKeys(),sources:await db.sources.count(),chapters:await db.chapters.count(),jobs:await db.importJobs.count()};})).toEqual({ids:['existing'],sources:0,chapters:0,jobs:0});
});
