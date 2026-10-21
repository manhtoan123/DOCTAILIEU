import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const origin='https://thu-phong-private.pages.dev';
const asset=(await readFile(new URL('../dist/index.html',import.meta.url),'utf8')).match(/src="([^"]+\.js)"/)[1];
if(!(await (await fetch(origin)).text()).includes(asset))throw new Error('Canonical bundle not updated');
const browser=await chromium.launch({channel:'msedge'});
try{for(const viewport of [{width:1280,height:800},{width:412,height:915}]){
 const context=await browser.newContext({viewport});let downloads=0,spoken=[];const errors=[];
 await context.route(`${origin}/api/**`,r=>r.fulfill({status:503,json:{error:'isolated synthetic reader acceptance'}}));
 await context.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
 await context.route('**/api/dictionaries/**',r=>{downloads++;return r.abort();});
 await context.route('**/api/ai/translate',r=>r.fulfill({json:{result:'Bản AI tổng hợp đang đọc. Câu tiếp theo.',model:'gemini-3.5-flash',finishReason:'STOP',inputTokens:1,outputTokens:1}}));
 await context.route('https://ottsy.weilbyte.dev/api/generation',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA',error:null}});});
 await context.addInitScript(()=>{window.Audio=class{playbackRate=1;removeAttribute(){}load(){}play(){return Promise.resolve();}pause(){}};});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await expect(page.locator('.prose')).toContainText('Buổi sáng');expect(downloads).toBe(0);
 await page.getByRole('button',{name:'Mở thông tin và mục lục truyện'}).click();await expect(page.getByRole('region',{name:'Thông tin truyện',exact:true})).toBeVisible();await page.getByRole('button',{name:'Đọc tiếp',exact:true}).click();await page.getByRole('navigation',{name:'Điều hướng chương đầu trang'}).getByRole('button',{name:'☷ Mục lục',exact:true}).click();await expect(page.getByRole('dialog',{name:'Mục lục'})).toBeVisible();await page.getByRole('button',{name:'Đóng',exact:true}).click();
 await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản AI tổng hợp');await expect.poll(()=>spoken.length).toBeGreaterThan(0);expect(spoken.join('')).toContain('Bản AI tổng hợp');await expect(page.locator('.spoken-text')).toBeVisible();expect(downloads).toBe(0);expect(errors).toEqual([]);
 await page.screenshot({path:`test-results/reader-requested-production-${viewport.width}.png`,fullPage:true});console.log(JSON.stringify({viewport,RAW:true,TOC:true,AI_TTS:true,dictionaryDownloads:downloads,pageErrors:errors.length,bundle:asset}));await context.close();
}}finally{await browser.close();}
