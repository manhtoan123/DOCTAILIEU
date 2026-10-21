import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const origin='https://thu-phong-private.pages.dev',dir='.dsh-tmp/chapter-audit';
expect((await(await fetch(origin)).text()).trim()).toBe(readFileSync('dist/index.html','utf8').trim());
const browser=await chromium.launch({channel:'msedge'}),context=await browser.newContext({viewport:{width:869,height:835},serviceWorkers:'block'});
try{
 await context.route(origin+'/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic chapter smoke'}}));
 await context.route(origin+'/api/ai/translate',r=>r.fulfill({json:{result:'Nội dung đã dịch.',model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:2}}));
 const page=await context.newPage();
 async function imported(title,source){await page.goto(origin);await page.getByRole('button',{name:'＋ Thêm truyện TXT / EPUB',exact:true}).click();await page.getByLabel('Chọn file TXT hoặc EPUB',{exact:true}).setInputFiles({name:title+'.txt',mimeType:'text/plain',buffer:Buffer.from(source)});await page.getByLabel('Tên truyện',{exact:true}).fill(title);await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.locator('.prose')).toBeVisible();}
 const source='1.本小说完全由个人汉化。\n2.切勿传播。\nTest @Translator   第1集. 起点\n故事。\n第2话. 技能\n1. 技能甲\n2. 技能乙\n3. 无 +\n故事。 3话。< 终点 >\n结束。';
 await imported('Kiểm tra chương tổng hợp',source);
 const rows=await page.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('thu-phong-v1');q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,r=d.transaction('chapters').objectStore('chapters').getAll();r.onerror=()=>{d.close();reject(r.error);};r.onsuccess=()=>{d.close();resolve(r.result);};};}));
 const ordered=rows.sort((a,b)=>a.order-b.order);expect(ordered).toHaveLength(4);expect(ordered.map(c=>c.text).join('')).toBe(source);expect(ordered[2].text).toContain('1. 技能甲\n2. 技能乙');
 await imported('Kiểm tra tiêu đề AI','第042章 安静的发电站\n故事原文。');const rawTitle=await page.locator('.chapter-title-menu').innerText();expect(rawTitle).toBe('第042章 安静的发电站');
 const dictionary='第042章 安静的发电站=Chương 042: Trạm phát điện tĩnh lặng',sha=createHash('sha256').update(dictionary).digest('hex');
 await page.evaluate(({dictionary,sha})=>new Promise((resolve,reject)=>{const q=indexedDB.open('thu-phong-v1');q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,tx=d.transaction('dictionaries','readwrite');tx.objectStore('dictionaries').put({kind:'vp',name:'Synthetic title dictionary',blob:new Blob([dictionary]),sha256:sha,updatedAt:1});tx.oncomplete=()=>{d.close();resolve();};tx.onerror=()=>{d.close();reject(tx.error);};};}),{dictionary,sha});
 await page.reload();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung đã dịch.');await expect(page.locator('.chapter-title-menu')).toHaveText('Chương 042: Trạm phát điện tĩnh lặng');await page.screenshot({path:dir+'/production-title.png'});await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('.chapter-title-menu')).toHaveText(rawTitle);
 const report={status:'passed',syntheticOnly:true,cloudWrites:false,realAi:false,rawPreserved:true,sourceLossless:true,chapterCount:ordered.length,titles:ordered.map(c=>c.title),aiConvertedHeading:true,bundle:readFileSync('dist/index.html','utf8').match(/src="([^"]+\.js)"/)[1]};writeFileSync(dir+'/production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await context.close();await browser.close();}
