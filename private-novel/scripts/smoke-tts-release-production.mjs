import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const origin='https://thu-phong-private.pages.dev';
const directory=resolve('.dsh-tmp/tts-finish/release',new Date().toISOString().replace(/[^0-9]/g,''));mkdirSync(directory,{recursive:true});
const html=readFileSync('dist/index.html','utf8');
const response=await fetch(origin);expect(response.status).toBe(200);expect((await response.text()).trim()).toBe(html.trim());expect(response.headers.get('Content-Security-Policy')).toContain("connect-src 'self' https://ottsy.weilbyte.dev");
const report={startedAt:new Date().toISOString(),origin,bundle:html.match(/src="([^"]+\.js)"/)[1],realGateway:true,realAi:false,androidHardware:false,runs:[]};
const save=()=>writeFileSync(resolve(directory,'smoke.json'),JSON.stringify(report,null,2));save();
const browser=await chromium.launch({channel:'msedge'});report.browser=browser.version();
try{
 for(const viewport of [{width:1280,height:800},{width:522,height:524}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});const run={viewport,http:[],sent:[],events:[],apiMocked:0};report.runs.push(run);save();
  await context.route(`${origin}/api/**`,r=>{run.apiMocked++;const path=new URL(r.request().url()).pathname;return r.fulfill({json:path==='/api/ai/translate'?{result:r.request().postDataJSON().text,model:'gemini-3.5-flash',finishReason:'STOP',inputTokens:1,outputTokens:1}:path==='/api/dictionaries'?{dictionaries:[]}:{books:[],deleted:[],public:true,prompts:[],items:[],revision:0,version:1}});});
  await context.addInitScript(()=>{window.__ttsRelease={audios:[],events:[]};const NativeAudio=window.Audio;window.Audio=function(src){const a=new NativeAudio(src);window.__ttsRelease.audios.push(a);for(const event of ['playing','ended'])a.addEventListener(event,()=>window.__ttsRelease.events.push({event,chapter:document.querySelector('.chapter-title-menu')?.textContent,at:performance.now(),time:a.currentTime}));return a;};});
  const page=await context.newPage();page.on('request',r=>{if(r.url()==='https://ottsy.weilbyte.dev/api/generation')run.sent.push(r.postDataJSON());});page.on('response',r=>{if(r.url()==='https://ottsy.weilbyte.dev/api/generation')run.http.push(r.status());});
  const listen=page.getByRole('button',{name:'Nghe truyện nhanh',exact:true});
  try{
   await page.goto(origin,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'＋ Thêm truyện TXT'}).click();await page.getByLabel('Tên truyện').fill('TTS release synthetic only');
   const text=readFileSync('.dsh-tmp/tts-finish/20261013115050479-41096/fixture.txt','utf8').slice(0,600);
   await page.getByLabel('Hoặc dán nội dung').fill(`Chương 1: Thử\n${text}\nChương 2: Tiếp\nChúc bạn có một buổi sáng yên bình và nhiều niềm vui trong ngày mới`);await page.getByRole('button',{name:'Nhập truyện'}).click();await expect(listen).toBeEnabled();
   const bookId=new URL(page.url()).pathname.split('/')[2];await listen.click();await expect(listen).toHaveAttribute('title','Tạm dừng nghe',{timeout:45000});
   await expect.poll(()=>page.evaluate(()=>window.__ttsRelease.events.filter(e=>e.event==='playing').length),{timeout:60000}).toBeGreaterThanOrEqual(3);await listen.click();await expect(listen).toHaveAttribute('title','Tiếp tục nghe');
   const cursor=await page.evaluate(id=>JSON.parse(localStorage.getItem(`tts-cursor:v1:${id}`)||'null'),bookId);expect(cursor.offset).toBeGreaterThan(0);expect(cursor.mode).toBe('ai');
   const requestsBefore=run.sent.length;await page.reload({waitUntil:'domcontentloaded'});await expect(listen).toHaveAttribute('data-resume','true');expect(await page.evaluate(()=>window.__ttsRelease.audios.length)).toBe(0);
   const chapterSource=`Chương 1: Thử\n${text}\n`;expect(run.sent[0].text).toBe('Chương 1: Thử\n');expect(cursor.offset).toBeGreaterThan(200);
   await listen.click();await expect(listen).toHaveAttribute('title','Tạm dừng nghe',{timeout:45000});expect(run.sent[requestsBefore].text).toBe(chapterSource.slice(cursor.offset,Math.min(cursor.offset+200,chapterSource.length)));
   await expect(page.locator('.chapter-title-menu')).toContainText('Tiếp',{timeout:90000});await expect.poll(()=>page.evaluate(()=>window.__ttsRelease.events.some(e=>e.event==='playing'&&e.chapter?.includes('Tiếp'))),{timeout:45000}).toBe(true);
   await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();expect(await page.evaluate(()=>window.__ttsRelease.audios.every(a=>a.paused))).toBe(true);expect(await page.evaluate(id=>localStorage.getItem(`tts-cursor:v1:${id}`),bookId)).toBeNull();
   await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();await page.getByRole('combobox',{name:'Giọng đọc',exact:true}).selectOption('tiktok-male-1');await page.getByRole('button',{name:'Ẩn Nghe sách',exact:true}).click();await listen.click();await expect(listen).toHaveAttribute('title','Tạm dừng nghe',{timeout:45000});
   await expect.poll(()=>page.evaluate(()=>{const a=window.__ttsRelease.audios.at(-1);return !!a&&!a.paused&&a.currentTime>.05&&a.readyState>=2;}),{timeout:15000}).toBe(true);await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();
   run.events=await page.evaluate(()=>window.__ttsRelease.events);expect(await page.evaluate(()=>window.__ttsRelease.audios.length)).toBe(1);expect(await page.evaluate(()=>window.__ttsRelease.audios.every(a=>a.paused&&!a.getAttribute('src')))).toBe(true);expect(run.http.every(s=>s===200)).toBe(true);expect(run.sent.some(s=>s.voice==='BV074_streaming')).toBe(true);expect(run.sent.some(s=>s.voice==='BV075_streaming')).toBe(true);
   run.sent=run.sent.map(s=>({voice:s.voice,codepoints:Array.from(s.text).length}));run.status='passed';run.pauseResume=true;run.reloadNoAutoplay=true;run.resumeOffset=cursor.offset;run.autoNext=true;run.singleAudio=true;run.stop=true;save();console.log(JSON.stringify(run));
  }catch(error){run.status='failed';run.error=String(error);save();throw error;}finally{await context.close();}
 }
 report.status='passed';save();console.log(JSON.stringify({status:'passed',report:resolve(directory,'smoke.json')}));
}finally{await browser.close();}
