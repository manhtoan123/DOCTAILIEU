import {chromium,expect} from '@playwright/test';
const origin='https://thu-phong-private.pages.dev';
const browser=await chromium.launch({channel:'msedge'});
try{for(const viewport of [{width:1280,height:800},{width:510,height:530}]){
 const context=await browser.newContext({viewport});
 await context.route(origin+'/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
 const page=await context.newPage();const calls=[];page.on('request',r=>{if(r.url().endsWith('/api/ai/translate'))calls.push(r.postDataJSON().text);});
 await page.goto(origin);await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
 await page.getByLabel('Tên truyện',{exact:true}).fill('AI inline synthetic');
 await page.getByLabel('Hoặc dán nội dung',{exact:true}).fill('第1章 窗边\n林儿推开窗，看见张明。他说：“等了十分钟，我们可以出发了。”\n第2章 回家\n张明回到家。林儿笑着说：“今天真好。”');
 await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('.prose')).toContainText('林儿',{timeout:10000});
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await expect(page.getByLabel('Model',{exact:true}).locator('option')).toHaveCount(9);
 await page.getByLabel('System Prompt',{exact:true}).fill('Dịch tiểu thuyết sang tiếng Việt. 林儿=Lâm Nhi, 张明=Trương Minh. Giữ nguyên nội dung, chỉ trả bản dịch.');
 await page.getByRole('button',{name:'Lưu prompt',exact:true}).click();await page.getByRole('button',{name:'Ẩn Dịch AI'}).click();
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lâm Nhi',{timeout:65000});
 await expect.poll(()=>calls.length,{timeout:65000}).toBe(2);
 await page.keyboard.press('ArrowRight');await expect(page.locator('.prose')).toContainText('Trương Minh',{timeout:65000});const chapterUrl=page.url();
 expect(calls.length).toBe(2);await page.reload();await expect(page).toHaveURL(chapterUrl);await expect(page.locator('.prose')).toBeVisible();
 await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('.prose')).toContainText('张明回到家');
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Trương Minh',{timeout:10000});expect(calls.length).toBe(2);
 await expect(page.getByRole('button',{name:'Chỉ đọc',exact:true})).toHaveCount(0);await expect(page.locator('.reader-listen')).toHaveCount(0);
 console.log(JSON.stringify({viewport,realGemini:true,inline:true,preloadDeduplicated:true,persistentCacheAfterReload:true,deepLinkReload:true,sourcePreserved:true,modelOptions:9,cloudIsolated:true}));await context.close();
}}finally{await browser.close();}

