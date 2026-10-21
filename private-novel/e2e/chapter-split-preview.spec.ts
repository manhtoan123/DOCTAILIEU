import {test,expect,type Page} from '@playwright/test';

const text='第1章\n第1章 起点\n你好🙂。\n第1章 起点\n重复正文\n末尾。第2章 终点\n完成';
async function open(page:Page){
  await page.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
  await page.goto('/');await page.getByRole('button',{name:'＋ Thêm truyện TXT / EPUB',exact:true}).click();
}
async function saved(page:Page){return page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:await db.books.toArray(),chapters:await db.chapters.toArray(),sources:await Promise.all((await db.sources.toArray()).map(async s=>({name:s.name,text:await s.blob.text()})))};});}
const preview=(page:Page)=>page.getByRole('region',{name:'Xem trước chia chương'});

test('preview equals imported chapters, merges stubs, preserves repeated markers and source bytes',async({page})=>{
  await open(page);await page.getByLabel('Chọn file TXT hoặc EPUB',{exact:true}).setInputFiles({name:'my_book.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
  await expect(preview(page)).toContainText('2 chương');
  await preview(page).locator('summary').click();
  await expect(preview(page).locator('tbody tr')).toHaveCount(2);
  await expect(preview(page).locator('tbody tr').first()).toContainText('第1章 起点');
  expect((await saved(page)).books).toHaveLength(0);
  await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const data=await saved(page);expect(data.books[0].chapterCount).toBe(2);expect(data.chapters.sort((a,b)=>a.order-b.order).map(c=>c.text).join('')).toBe(text);expect(data.sources[0].text).toBe(text);
});

test('limits, safe whole chapters, invalid options, regex errors and stale preview changes',async({page})=>{
  await open(page);const source='Chương 1: Dài\n'+'文🙂'.repeat(50000);
  await page.getByLabel('Chọn file TXT hoặc EPUB',{exact:true}).setInputFiles({name:'long.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
  await expect(preview(page)).toContainText('2 chương');
  await page.getByLabel('Giới hạn số chữ 1 chương',{exact:true}).selectOption('4000');await expect(preview(page)).toContainText('38 chương');
  await page.getByLabel('Giới hạn số chữ 1 chương',{exact:true}).selectOption('-1');
  await page.getByLabel('Số ký tự tối đa cho mỗi chương',{exact:true}).fill('1');await expect(page.getByRole('button',{name:'Nhập truyện',exact:true})).toBeDisabled();
  await page.getByLabel('Số ký tự tối đa cho mỗi chương',{exact:true}).fill('128001');await expect(preview(page).getByRole('alert')).toContainText('128.000');
  await page.getByLabel('Số ký tự tối đa cho mỗi chương',{exact:true}).fill('8000');await expect(preview(page)).toContainText('19 chương');
  await page.getByText('Regex nhận diện tùy chỉnh',{exact:true}).click();
  await page.getByPlaceholder('Ví dụ: ^第[0-9一二三十百]+章').fill('[');await expect(preview(page).getByRole('alert')).toBeVisible();
  await page.getByPlaceholder('Ví dụ: ^第[0-9一二三十百]+章').fill('^ONLY$');
  await page.getByLabel('Chọn file TXT hoặc EPUB',{exact:true}).setInputFiles({name:'replacement.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
  await expect(preview(page)).toContainText('1 chương');
  await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const data=await saved(page);expect(data.books[0].chapterCount).toBe(1);expect(data.chapters[0].text).toBe(text);
});

test('batch counts all files and carries its chosen limit into every imported book',async({page})=>{
  await open(page);const source='Chương 1: Dài\n'+'x'.repeat(5000);
  await page.getByLabel('Chọn file TXT hoặc EPUB',{exact:true}).setInputFiles(['A','B'].map(name=>({name:name+'.txt',mimeType:'text/plain',buffer:Buffer.from(source)})));
  await expect(preview(page)).toContainText('2 chương');await page.getByLabel('Giới hạn số chữ 1 chương',{exact:true}).selectOption('4000');await expect(preview(page)).toContainText('4 chương');
  await page.getByRole('button',{name:'Nhập nhiều truyện',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const data=await saved(page);expect(data.books.map(b=>b.chapterCount)).toEqual([2,2]);expect(data.chapters.every(c=>c.text.length<=4000)).toBe(true);
});

test('folder preview and import use the same chapter controls and full-parent Album',async({page})=>{
  await open(page);await page.getByRole('button',{name:'Nhập folder truyện',exact:true}).click();
  const source='Chương 1: Dài\n'+'文🙂'.repeat(2000);
  await page.getByLabel('Chọn folder truyện',{exact:true}).evaluate((element:HTMLInputElement,text)=>{const dt=new DataTransfer();const file=new File([text],'A.txt');Object.defineProperty(file,'webkitRelativePath',{value:'Kho/Album/A.txt'});dt.items.add(file);element.files=dt.files;element.dispatchEvent(new Event('change',{bubbles:true}));},source);
  await expect(preview(page)).toContainText('1 chương');await page.getByLabel('Giới hạn số chữ 1 chương',{exact:true}).selectOption('4000');await expect(preview(page)).toContainText('2 chương');
  await page.getByRole('button',{name:'Nhập folder',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const data=await saved(page);expect(data.books[0]).toMatchObject({chapterCount:2,album:'Kho/Album'});expect(data.chapters.sort((a,b)=>a.order-b.order).map(c=>c.text).join('')).toBe(source);
});

test('preview counts beyond displayed rows, BOM encoding and errors agree with import',async({page})=>{
  await open(page);const source=Array.from({length:305},(_,i)=>`第${i+1}章 标题\n正文🙂\n`).join('');
  await page.getByLabel('Chọn file TXT hoặc EPUB',{exact:true}).setInputFiles({name:'utf16.txt',mimeType:'text/plain',buffer:Buffer.concat([Buffer.from([255,254]),Buffer.from(source,'utf16le')])});
  await expect(preview(page)).toContainText('305 chương');await preview(page).locator('summary').click();await expect(preview(page).locator('tbody tr')).toHaveCount(300);await expect(preview(page)).toContainText('tổng số đã đếm đầy đủ');
  await page.getByLabel('Chọn file TXT hoặc EPUB',{exact:true}).setInputFiles({name:'blank.txt',mimeType:'text/plain',buffer:Buffer.from(' \n\t')});await expect(preview(page).getByRole('alert')).toContainText('rỗng');await expect(page.getByRole('button',{name:'Nhập truyện',exact:true})).toBeDisabled();
  await page.getByLabel('Chọn file TXT hoặc EPUB',{exact:true}).setInputFiles({name:'wrong.txt',mimeType:'text/plain',buffer:Buffer.from([255,255,255])});await expect(preview(page).getByRole('alert')).toBeVisible();
  expect((await saved(page)).books).toHaveLength(0);
});
