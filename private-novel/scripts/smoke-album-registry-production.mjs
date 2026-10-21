import {chromium,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const origin='https://thu-phong-private.pages.dev';
if((await fetch(origin).then(r=>r.text())).trim()!==readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').trim())throw new Error('Canonical build differs from dist');
const browser=await chromium.launch({channel:'msedge'});
try{for(const viewport of [{width:1280,height:800},{width:510,height:530}]){
 const context=await browser.newContext({viewport});await context.route(origin+'/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
 const page=await context.newPage();await page.goto(origin);await page.getByText('Quản lý Album',{exact:true}).click();
 await expect(page.getByLabel('Tên Album',{exact:true})).toBeEnabled();await page.getByLabel('Tên Album',{exact:true}).fill('Album tổng hợp');await page.getByRole('button',{name:'Tạo Album',exact:true}).click();
 await expect(page.getByLabel('Album cần sửa')).not.toHaveValue('');await page.reload();await page.getByText('Quản lý Album',{exact:true}).click();
 await expect(page.getByLabel('Album cần sửa').locator('option')).toContainText(['Tạo Album','Album tổng hợp']);
 await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();await page.getByLabel('Tên truyện',{exact:true}).fill('Album synthetic');await page.getByLabel('Hoặc dán nội dung',{exact:true}).fill('第1章\n林儿你好。');await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();
 await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();await page.getByText('Quản lý Album',{exact:true}).click();
 await page.getByLabel('Album cần sửa').selectOption({label:'Album tổng hợp'});const id=await page.getByLabel('Album cần sửa').inputValue();
 await page.getByLabel('Truyện cần chuyển Album').selectOption({label:'Album synthetic'});await page.getByLabel('Album đích').selectOption(id);await page.getByRole('button',{name:'Chuyển truyện',exact:true}).click();await expect(page.locator('.book-card')).toContainText('Album: Album tổng hợp');
 await page.getByLabel('Tên Album',{exact:true}).fill('Album đổi tên');await page.getByRole('button',{name:'Đổi tên',exact:true}).click();await expect(page.locator('.book-card')).toContainText('Album: Album đổi tên');
 await page.getByRole('button',{name:'Gỡ Album',exact:true}).click();await expect(page.locator('.book-card')).toHaveCount(1);await expect(page.locator('.book-card')).not.toContainText('Album:');
 await page.getByRole('button',{name:'Mở sách →',exact:true}).click();await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('.prose')).toContainText('林儿你好。');
 console.log(JSON.stringify({viewport,emptyReload:true,moveRenameRemove:true,bookPreserved:true,rawPreserved:true,cloudMocked:true}));await context.close();
}}finally{await browser.close();}
