import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const origin='https://thu-phong-private.pages.dev';
const asset=(await readFile(new URL('../dist/index.html',import.meta.url),'utf8')).match(/src="([^"]+\.js)"/)[1];
if(!(await (await fetch(origin)).text()).includes(asset))throw new Error('Canonical bundle not updated');
const browser=await chromium.launch({channel:'msedge'});
try{for(const viewport of [{width:1280,height:800},{width:412,height:915}]){
 const context=await browser.newContext({viewport}),calls=[],errors=[];
 await context.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
 await context.route('**/api/state**',r=>r.fulfill({status:503,json:{error:'isolated'}}));await context.route('**/api/prompts**',r=>r.fulfill({json:{revision:0,rows:[]}}));await context.route('**/api/ai/keys',r=>r.fulfill({json:{keys:[]}}));
 await context.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls.push(input.model);if(input.model==='gemini-3.8-flash')return r.fulfill({status:503,json:{error:'ai_upstream_error'}});if(input.model==='gemini-3.7-flash')return r.fulfill({status:404,json:{error:'ai_invalid_model'}});if(input.model==='gemini-3.5-flash')return r.fulfill({status:429,headers:{'retry-after':'15'},json:{error:'ai_rate_limited'}});return r.fulfill({json:{result:'Bản dịch dự phòng hoàn chỉnh.',model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:2}});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await expect(page.locator('.prose')).toContainText('Buổi sáng');
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await page.getByLabel('Model',{exact:true}).selectOption('gemini-3.8-flash');await expect(page.getByLabel(/Model [BCD]/)).toHaveCount(0);await expect(page.getByText(/Tự chuyển khi model bận hoặc lỗi/)).toContainText('3.7');await page.getByRole('button',{name:'Lưu prompt',exact:true}).click();await expect(page.locator('.toast')).toContainText('lượt dịch tiếp theo');expect(calls).toHaveLength(0);
 await page.getByRole('button',{name:'Ẩn Dịch AI',exact:true}).click();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch dự phòng hoàn chỉnh.');await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','ready');expect(calls).toEqual(['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash','gemini-2.5-flash','gemini-2.5-flash']);
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await page.getByRole('button',{name:'Khôi phục mặc định',exact:true}).click();await expect(page.getByLabel('Model',{exact:true})).toHaveValue('gemini-3.5-flash');await expect(page.getByLabel(/Model [BCD]/)).toHaveCount(0);await expect(page.getByText(/Tự chuyển khi model bận hoặc lỗi/)).toContainText('3.8');expect(errors).toEqual([]);
 console.log(JSON.stringify({viewport,bundle:asset,sequentialModels:calls,currentComplete:true,prewarmComplete:true,promptSaveDeferred:true,resetClearsOldChain:true,pageErrors:errors.length}));await context.close();
}}finally{await browser.close();}
