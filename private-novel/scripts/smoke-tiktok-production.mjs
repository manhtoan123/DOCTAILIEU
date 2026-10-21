import {chromium,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const origin=process.env.TTS_SMOKE_ORIGIN||'https://thu-phong-private.pages.dev';
const browser=await chromium.launch({channel:'msedge'});
try{
 if(origin.startsWith('https:')){const response=await fetch(origin);expect(response.headers.get('Content-Security-Policy')).toContain("connect-src 'self' https://ottsy.weilbyte.dev");const html=await response.text();expect(html.trim()).toBe(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').trim());}
 for(const viewport of [{width:1280,height:800},{width:522,height:524}]){
  const context=await browser.newContext({viewport});
  // Local synthetic import only. Never upload/delete real production books.
  await context.route(`${origin}/api/cloud/**`,route=>route.fulfill({json:route.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
  await context.addInitScript(()=>{
   const NativeAudio=window.Audio;window.__ttsAudios=[];window.__ttsEvents=[];
   window.Audio=function(src){const a=new NativeAudio(src);window.__ttsAudios.push(a);const index=window.__ttsAudios.length-1;for(const event of ['playing','ended'])a.addEventListener(event,()=>window.__ttsEvents.push({event,index,time:performance.now()}));return a;};
  });
  const page=await context.newPage();const responses=[];
  page.on('response',r=>{if(r.url().includes('ottsy.weilbyte.dev/api/generation'))responses.push(r.status());});
  await page.goto(origin);await page.getByRole('button',{name:'＋ Thêm truyện TXT'}).click();
  await page.getByLabel('Tên truyện').fill('TTS synthetic only');await page.getByLabel('Hoặc dán nội dung').fill('Chương 1: Thử\n...\nXin chào.\nChương 2: Tiếp\nChúc bạn vui vẻ.');
  await page.getByRole('button',{name:'Nhập truyện'}).click();
  await expect(page.locator('.prose')).toContainText('Xin chào');
  await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();
  const voices=page.getByRole('combobox',{name:'Giọng đọc',exact:true});await voices.selectOption('tiktok-female-1');
  await expect(page.getByLabel('Đồng ý gửi câu đang đọc đến gateway TTS')).toHaveCount(0);await expect(voices.locator('option')).toHaveCount(2);expect(await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);await page.getByRole('button',{name:'Ẩn Nghe sách',exact:true}).click();await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__ttsAudios.some(a=>a.currentTime>0.05&&a.readyState>=2)),{timeout:45000}).toBe(true);
  await expect(page.locator('.prose .speaking')).toHaveCount(1,{timeout:5000}).catch(async()=>{expect(await page.locator('.prose [class*=highlight]').count()).toBeGreaterThan(0);});
  await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();expect(await page.evaluate(()=>window.__ttsAudios.at(-1).paused)).toBe(true);
  await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();
  await expect(page.locator('.prose')).toContainText('Chúc bạn vui vẻ',{timeout:60000});
  await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();await voices.selectOption('tiktok-male-1');
  await expect(page.getByLabel('Đồng ý gửi câu đang đọc đến gateway TTS')).toHaveCount(0);await expect(voices.locator('option')).toHaveCount(2);expect(await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);await page.getByRole('button',{name:'Ẩn Nghe sách',exact:true}).click();await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>{const a=window.__ttsAudios.at(-1);return a&&!a.paused&&a.currentTime>0.05&&a.readyState>=2;}),{timeout:45000}).toBe(true);
  await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();
  expect(await page.evaluate(()=>window.__ttsAudios.every(a=>a.paused))).toBe(true);
  expect(responses.length).toBeGreaterThanOrEqual(3);expect(responses.every(status=>status===200)).toBe(true);
  const gaps=await page.evaluate(()=>window.__ttsEvents.filter(e=>e.event==='ended').flatMap(e=>{const next=window.__ttsEvents.find(n=>n.event==='playing'&&n.index===e.index+1&&n.time>=e.time);return next?[Math.round(next.time-e.time)]:[];}));console.log(JSON.stringify({viewport,interSegmentGapMs:gaps,realAudio:true,decode:true,timeAdvanced:true,pauseResume:true,autoNext:true,stop:true,http:responses}));await context.close();
 }
}finally{await browser.close();}

