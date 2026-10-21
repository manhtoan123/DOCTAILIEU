import {chromium,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const origin=process.env.TTS_SMOKE_ORIGIN||'https://thu-phong-private.pages.dev';
const browser=await chromium.launch({channel:'msedge'});
const CLAUSE=' một hai ba bốn năm sáu bảy tám chín mười mười một mười hai mười ba mười bốn mười lăm.';
/** Deployed bundle only: synthetic book, mocked cloud, real TikTok audio, no real library writes. */
try{
 if(origin.startsWith('https:')){const response=await fetch(origin);expect(response.headers.get('Content-Security-Policy')).toContain("connect-src 'self' https://ottsy.weilbyte.dev");const html=await response.text();expect(html.trim()).toBe(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').trim());}
 for(const viewport of [{width:1280,height:800},{width:522,height:524}]){
  const context=await browser.newContext({viewport});
  await context.route(`${origin}/api/cloud/**`,route=>route.fulfill({json:route.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
  await context.addInitScript(()=>{const NativeAudio=window.Audio;window.__ttsAudios=[];window.Audio=function(src){const a=new NativeAudio(src);window.__ttsAudios.push(a);return a;};});
  const page=await context.newPage();const sent=[];const statuses=[];
  page.on('request',r=>{if(r.url().includes('ottsy.weilbyte.dev/api/generation'))sent.push(JSON.parse(r.postData()).text);});
  page.on('response',r=>{if(r.url().includes('ottsy.weilbyte.dev/api/generation'))statuses.push(r.status());});
  await page.goto(origin);await page.getByRole('button',{name:'＋ Thêm truyện TXT'}).click();
  await page.getByLabel('Tên truyện').fill('TTS resume synthetic only');
  await page.getByLabel('Hoặc dán nội dung').fill(`Chương 1: Thử\nAlpha${CLAUSE}\nBeta${CLAUSE}\nGamma${CLAUSE}`);
  await page.getByRole('button',{name:'Nhập truyện'}).click();
  const listen=page.getByRole('button',{name:'Nghe truyện nhanh',exact:true});
  await expect(page.locator('.prose')).toContainText('Alpha');await expect(listen).toBeEnabled();
  const bookId=new URL(page.url()).pathname.split('/')[2];
  await page.getByRole('button',{name:'Bản gốc',exact:true}).click();
  await listen.click();
  await expect.poll(()=>page.evaluate(()=>window.__ttsAudios.length),{timeout:45000}).toBeGreaterThanOrEqual(3);
  await expect(listen).toHaveAttribute('title','Tạm dừng nghe');
  await listen.click();expect(await page.evaluate(()=>window.__ttsAudios.at(-1).paused)).toBe(true);
  const cursor=await page.evaluate(id=>JSON.parse(localStorage.getItem(`tts-cursor:v1:${id}`)||'null'),bookId);
  expect(cursor).not.toBeNull();expect(cursor.offset).toBeGreaterThan(0);expect(cursor.mode).toBe('raw');
  const beforeReload=sent.length,playedFirst=sent[0];
  await page.reload();await expect(listen).toBeEnabled();await expect(listen).toHaveAttribute('data-resume','true');
  await expect(page.getByRole('button',{name:'Bản gốc',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>window.__ttsAudios.length)).toBe(0);
  await listen.click();
  await expect.poll(()=>page.evaluate(()=>window.__ttsAudios.length),{timeout:45000}).toBeGreaterThanOrEqual(1);
  await expect.poll(()=>page.evaluate(()=>{const a=window.__ttsAudios.at(-1);return !!a&&!a.paused&&a.currentTime>0.05&&a.readyState>=2;}),{timeout:45000}).toBe(true);
  const resumed=sent.slice(beforeReload).map(text=>text.trim());
  expect(resumed.length).toBeGreaterThanOrEqual(1);expect(resumed.length).toBeLessThanOrEqual(3);
  expect(resumed[0]).not.toBe(playedFirst.trim());
  expect(resumed[0].startsWith('Beta')||resumed[0].startsWith('Gamma')).toBe(true);
  await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();
  expect(await page.evaluate(()=>window.__ttsAudios.every(a=>a.paused))).toBe(true);
  expect(statuses.length).toBeGreaterThanOrEqual(3);expect(statuses.some(status=>status===200)).toBe(true);
  console.log(JSON.stringify({viewport,realAudio:true,noAutoplayAfterReload:true,resumedSentence:resumed[0].slice(0,16),skippedFirstSentence:true,cursorOffset:cursor.offset,httpStatuses:statuses}));
  await context.close();
 }
}finally{await browser.close();}
