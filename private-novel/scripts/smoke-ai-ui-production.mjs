import {chromium,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const origin='https://thu-phong-private.pages.dev';
const browser=await chromium.launch({channel:'msedge'});
try{for(const viewport of [{width:1280,height:800},{width:522,height:524}]){
 const context=await browser.newContext({viewport});
 // Isolate all library/dictionary operations: no real story is read or published.
 await context.route(`${origin}/api/cloud/**`,route=>route.fulfill({json:route.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
 const page=await context.newPage();await page.goto(origin);
 await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await expect(page.locator('.prose')).toContainText('Buổi sáng, nắng ghé qua');const before=await page.locator('.prose').innerText();await expect(page.getByRole('button',{name:'Nghe truyện nhanh',exact:true})).toBeVisible();await page.screenshot({path:`test-results/reader-controls-production-${viewport.width}.png`});
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();

 await page.getByLabel('System Prompt',{exact:true}).fill('Dịch tiểu thuyết sang tiếng Việt, giữ đúng tên đã cung cấp. Chỉ trả bản dịch.');
 await page.getByRole('button',{name:'Lưu prompt',exact:true}).click();
 await page.getByText('Thử prompt',{exact:true}).click();await page.getByRole('button',{name:'▷ Chạy thử',exact:true}).click();
 await expect(page.locator('.ai-result-text')).toContainText('Lâm Nhi',{timeout:65000});
 await expect(page.locator('.ai-result-text')).toContainText('Trương Minh');
 expect(await page.locator('.prose').innerText()).toBe(before);
 const bounds=await page.locator('.reader-panel-ai').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);
 await page.getByRole('button',{name:'Ẩn Dịch AI'}).click();await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await page.getByText('Thử prompt',{exact:true}).click();await expect(page.getByRole('button',{name:'▷ Chạy thử',exact:true})).toBeEnabled();
 console.log(JSON.stringify({noConnectionRequired:true,viewport,realGemini:true,customPrompt:true,names:true,sourcePreserved:true,panelFits:true}));
 await context.close();
}}finally{await browser.close();}

