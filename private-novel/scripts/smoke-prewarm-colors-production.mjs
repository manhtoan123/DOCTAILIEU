import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const origin='https://thu-phong-private.pages.dev';
const asset=(await readFile(new URL('../dist/index.html',import.meta.url),'utf8')).match(/src="([^"]+\.js)"/)[1];
if(!(await (await fetch(origin)).text()).includes(asset))throw new Error('Canonical bundle not updated');
const browser=await chromium.launch({channel:'msedge'});
try{for(const viewport of [{width:1280,height:800},{width:412,height:915}])for(const status of ['ready','error']){
 const context=await browser.newContext({viewport});let release;const gate=new Promise(r=>release=r);
 await context.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
 await context.route('**/api/ai/translate',async r=>{const input=r.request().postDataJSON();if(input.text.includes('乙')){await gate;if(status==='error')return r.fulfill({status:502,headers:{'X-AI-Failure-Reason':'upstream_parts'},json:{error:'ai_invalid_response'}});}return r.fulfill({json:{result:'Bản tổng hợp.',model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:1}}).catch(()=>{});});
 const page=await context.newPage();await page.goto(origin);await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles({name:'Synthetic_prewarm.txt',mimeType:'text/plain',buffer:Buffer.from('第1章 开始\n甲。\n第2章 后来\n乙。')});await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const button=page.locator('.ai-trigger');await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(button).toHaveAttribute('data-prewarm','loading');await expect(button).toHaveCSS('background-color','rgb(146, 64, 14)');release();await expect(button).toHaveAttribute('data-prewarm',status);await expect(button).toHaveCSS('background-color',status==='ready'?'rgb(22, 101, 52)':'rgb(153, 27, 27)');await page.screenshot({path:`test-results/prewarm-production-${viewport.width}-${status}.png`});console.log(JSON.stringify({viewport,status,bundle:asset,loading:true,color:true}));await context.close();
}}finally{await browser.close();}
