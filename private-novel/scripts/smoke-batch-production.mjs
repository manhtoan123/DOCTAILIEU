// Synthetic text in an isolated browser only; never selects real user files.
import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const context=await browser.newContext();const page=await context.newPage();let puts=0;
  page.on('request',request=>{if(request.url().includes('/api/cloud/')&&request.method()==='PUT')puts++;});
  await page.goto('https://thu-phong-private.pages.dev/');
  await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
  await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles(['A','B'].map(name=>({name:`Synthetic ${name}.txt`,mimeType:'text/plain',buffer:Buffer.from('第1章 开始\n山门。\n第2章 后来\n正文。')})));
  await page.getByRole('button',{name:'Chuẩn bị nhập nhiều truyện',exact:true}).click();
  await page.getByRole('button',{name:'Xác nhận tất cả truyện vào thư viện',exact:true}).click({timeout:30000});
  await expect(page.locator('.reader-book-heading h1')).toHaveText('Synthetic A');
  await page.reload();await expect(page.locator('.book-card')).toHaveCount(2);
  await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('cloud');
  await expect(page.getByRole('status')).toContainText('Kho cloud chưa được cấu hình');
  if(puts!==0)throw new Error('Unconfigured cloud sent PUT content');
  console.log('PASS: production batch import/confirm/reload keeps 2 independent local books; cloud unavailable and no PUT.');
}finally{await browser.close();}
