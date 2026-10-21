import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const origin='https://thu-phong-private.pages.dev';
const asset=(await readFile(new URL('../dist/index.html',import.meta.url),'utf8')).match(/src="([^"]+\.js)"/)[1];
if(!(await (await fetch(origin)).text()).includes(asset))throw new Error('Canonical bundle not updated');
const browser=await chromium.launch({channel:'msedge'});
try{for(const viewport of [{width:1280,height:800},{width:412,height:915}]){
 const context=await browser.newContext({viewport});const calls=[];
 await context.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
 await context.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls.push(input.text.length);return input.text.length===800?r.fulfill({status:504,json:{error:'ai_timeout'}}):r.fulfill({json:{result:'Bản phục hồi.',model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 const page=await context.newPage();await page.goto(origin);await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles({name:'Synthetic_timeout.txt',mimeType:'text/plain',buffer:Buffer.from('甲'.repeat(800))});await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản phục hồi.\nBản phục hồi.');expect(calls).toEqual([800,400,400]);console.log(JSON.stringify({viewport,bundle:asset,timeoutRecovery:true,calls}));await context.close();
}}finally{await browser.close();}
