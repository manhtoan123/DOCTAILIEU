import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const origin='https://thu-phong-private.pages.dev',expected=readFileSync('dist/index.html','utf8').trim();
expect((await (await fetch(origin)).text()).trim()).toBe(expected);
const names=readFileSync('C:/Users/toann/.codex/attachments/7e8ea172-0d3e-4116-b3e5-6b23e3a18f78/Pasted text.txt','utf8');
const source='Chương 1: Kiểm tra dịch thật\n'+[
 '丰缘地区的清晨十分安静，乌波站在小河旁边，望着水面上的阳光。年轻的训练家走过木桥，把食物放在石头上，轻声告诉伙伴今天要去森林寻找新的朋友。',
 '他们沿着河岸慢慢前进，树叶被风吹得沙沙作响。训练家没有急着赶路，而是停下来观察脚印，记下河流的方向，并检查背包里的地图和药品。乌波快乐地跟在他的身后。',
 '太阳升高的时候，他们在一棵大树下休息。训练家取出水杯，把午餐分成两份。他知道真正的冒险需要耐心，也需要尊重每一个生命。吃完午餐以后，两位伙伴继续走向森林深处。'
 ].join('\n');
const browser=await chromium.launch({channel:'msedge'}),context=await browser.newContext({viewport:{width:869,height:835},serviceWorkers:'block'});
await context.route(`${origin}/api/**`,r=>r.fulfill({status:503,json:{error:'isolated synthetic AI acceptance'}}));
let sends=0,received;
await context.route(`${origin}/api/ai/translate`,async r=>{
 sends++;const input=r.request().postDataJSON();
 if(sends>1)return r.fulfill({status:403,json:{error:'ai_auth_error'}}); // One real provider request for this acceptance.
 expect(input.model).toBe('gemini-2.5-flash');expect(input.names['丰缘']).toBe('Hoenn');expect(JSON.stringify(input.names)).not.toMatch(/\[i\]|https?:/);
 await r.continue();
});
try{
 const page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('response',async response=>{if(response.url()===origin+'/api/ai/translate'){received={status:response.status(),requestId:response.headers()['x-ai-request-id'],durationMs:response.headers()['x-ai-duration-ms']};}});
 await page.goto(origin);await page.getByRole('button',{name:'＋ Thêm truyện TXT / EPUB',exact:true}).click();
 await page.getByLabel('Tên truyện',{exact:true}).fill('Kiểm tra AI thật — dữ liệu tổng hợp');await page.getByLabel('Hoặc dán nội dung',{exact:true}).fill(source);await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();
 await expect(page.locator('.reader-book-heading h1')).toHaveText('Kiểm tra AI thật — dữ liệu tổng hợp');const readerUrl=page.url();
 await page.goto(origin+'/settings/names');await page.getByLabel('Truyện dùng Name riêng').selectOption({label:'Kiểm tra AI thật — dữ liệu tổng hợp'});await page.getByLabel('Name riêng của truyện').fill(names);await page.getByRole('button',{name:'Lưu',exact:true}).click();await expect(page.getByRole('status')).toContainText('Đã lưu Name riêng.');
 await expect.poll(async()=>(await page.getByLabel('Name riêng của truyện').inputValue()).split(/\r?\n/).filter(line=>line.trim()).length).toBe(1238);
 await page.goto(readerUrl);await expect(page.locator('.prose')).toContainText('丰缘地区的清晨十分安静');const before=await page.locator('.prose [data-paragraph]').allTextContents();await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await page.getByLabel('Model',{exact:true}).selectOption('gemini-2.5-flash');await page.getByLabel('Dịch sẵn chương kế tiếp').uncheck();await page.getByRole('button',{name:'Lưu prompt',exact:true}).click();await expect(page.locator('.toast')).toContainText('Đã lưu prompt');await page.getByRole('button',{name:'Ẩn Dịch AI'}).click();
 const started=Date.now();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Hoenn',{timeout:90000});await expect(page.locator('.prose .notice')).toHaveCount(0);await expect(page.locator('.reader-convert-status')).toHaveCount(0);
 const translated=await page.locator('.prose').innerText();expect(translated.length).toBeGreaterThan(200);expect(translated).not.toMatch(/[\u3400-\u9fff]/);expect(sends).toBe(1);expect(received.status).toBe(200);
 await page.screenshot({path:'.dsh-tmp/ai-reader-stall/production-real-ai.png',fullPage:false});await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('.prose')).toContainText('丰缘地区的清晨十分安静');expect(await page.locator('.prose [data-paragraph]').allTextContents()).toEqual(before);
 const report={status:'passed',origin,bundle:expected.match(/src="([^"]+\.js)"/)[1],syntheticOnly:true,cloudWrites:false,namesSaved:1238,model:'gemini-2.5-flash',sends,durationMs:Date.now()-started,received,sourceChars:source.length,translatedChars:translated.length,originalPreserved:true,browser:browser.version()};
 writeFileSync('.dsh-tmp/ai-reader-stall/production-real-ai.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await context.close();await browser.close();}
