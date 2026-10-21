import {chromium,expect} from '@playwright/test';
import {writeFileSync,mkdirSync,existsSync} from 'node:fs';

// Synthetic, local-only evidence: real approved TTS gateway, native MP3 playback.
// AI and all cloud endpoints are intercepted; no library content is uploaded.
const origin=process.env.TTS_CHECK_ORIGIN||'http://127.0.0.1:5175';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('This check requires an isolated local origin.');
const browser=await chromium.launch({channel:'msedge'});
const currentOnly=process.env.TTS_CHECK_CURRENT_ONLY==='1';
const report={origin,realGateway:true,nativeAudio:true,realAi:false,androidHardware:false,runs:[]};
const texts=[
 'Buổi sáng, người đọc mở sách và bắt đầu một câu chuyện mới.Ánh nắng chiếu qua cửa sổ, căn phòng trở nên yên tĩnh hơn.Những trang sách đưa chúng ta đến một khu vườn xanh mát.Mỗi bước chân trên con đường nhỏ đều mang theo niềm vui.',
 'Chương tiếp theo kể về một chuyến đi bên dòng sông nhỏ.Mọi người ngồi dưới bóng cây và trò chuyện thật nhẹ nhàng.Gió thổi qua những chiếc lá, tạo thành âm thanh quen thuộc.Khi chiều xuống, họ trở về nhà với nhiều kỷ niệm đẹp.',
 'Câu chuyện cuối cùng bắt đầu bằng một buổi tối bình yên.Trên bàn có một cuốn sách và một tách trà còn ấm.Người đọc khép lại trang cuối rồi nhìn ra ngoài cửa sổ.Ngày mai sẽ có thêm những câu chuyện mới để khám phá.'
];
const summarize=events=>{
 const played=events.filter(e=>e.event==='playing');const gaps=events.filter(e=>e.event==='ended').flatMap(e=>{const next=played.find(p=>p.at>e.at);return next?[{chapter:e.chapter,nextChapter:next.chapter,ms:Math.round(next.at-e.at)}]:[];});
 return {segments:played.length,gaps,startMs:played.length?Math.round(played[0].at-events[0].at):null};
};
try{
 for(const mode of !currentOnly&&existsSync(new URL('../.dsh-tmp/tts-complete/tts.before.ts',import.meta.url))?['baseline','current']:['current']){
  const context=await browser.newContext();
  await context.route(`${origin}/api/**`,r=>{
   const path=new URL(r.request().url()).pathname;
   return r.fulfill({json:path==='/api/ai/translate'?{result:r.request().postDataJSON().text,model:'gemini-3.5-flash',finishReason:'STOP',inputTokens:1,outputTokens:1}:path==='/api/dictionaries'?{dictionaries:[]}:{books:[],deleted:[],public:true,prompts:[],items:[],revision:0,version:1}});
  });
  await context.addInitScript(()=>{
   const NativeAudio=window.Audio;window.__ttsEvents=[];window.__ttsInstances=[];
   window.Audio=function(src){const audio=new NativeAudio(src);window.__ttsInstances.push(audio);for(const event of ['playing','ended'])audio.addEventListener(event,()=>window.__ttsEvents.push({event,at:performance.now(),chapter:document.querySelector('.chapter-title-menu')?.textContent||window.__ttsChapter||''}));return audio;};
  });
  const page=await context.newPage();const http=[];
  page.on('response',r=>{if(r.url().includes('ottsy.weilbyte.dev/api/generation'))http.push(r.status());});
  await page.goto(origin);
  await page.locator('body').click({position:{x:5,y:5}});
  if(mode==='baseline'){
   await page.evaluate(async chapters=>{
    const {TikTokPlayer,tiktokVoices}=await import('/.dsh-tmp/tts-complete/tts.before.ts');
    window.__ttsChapter='baseline';window.__ttsEvents.push({event:'start',at:performance.now(),chapter:'baseline'});
    let index=0;const start=()=>{window.__ttsChapter='Chương '+(index+1);window.__checkPlayer.start(chapters[index],tiktokVoices[0],{rate:1,pitch:1,flex:0});};
    window.__checkPlayer=new TikTokPlayer(state=>window.__checkState=state,()=>{if(++index<chapters.length)start();});start();
   },texts);
   await page.waitForFunction(()=>window.__checkState==='ended'||window.__checkState==='error',null,{timeout:180000});
   expect(await page.evaluate(()=>window.__checkState)).toBe('ended');
  }else{
   await page.evaluate(async chapters=>{
    const {db}=await import('/src/core/db.ts');await db.books.put({id:'tts-real-check',title:'TTS synthetic check',author:'',status:'ready',chapterCount:3,charCount:chapters.join('').length,createdAt:1,updatedAt:1});
    for(const [i,text] of chapters.entries())await db.chapters.put({id:`tts-real-${i+1}`,bookId:'tts-real-check',order:i,title:`Chương ${i+1}`,text,revision:1,sourceId:''});
   },texts);
   await page.goto(`${origin}/read/tts-real-check/tts-real-1`);
   const listen=page.getByRole('button',{name:'Nghe truyện nhanh',exact:true});await expect(listen).toBeEnabled();
   await page.evaluate(()=>window.__ttsEvents.push({event:'start',at:performance.now(),chapter:'Chương 1'}));await listen.click();
   await expect(listen).toHaveAttribute('title','Tạm dừng nghe',{timeout:45000});
   await expect(page.locator('.prose')).toContainText(texts[2].slice(0,35),{timeout:180000});
   await page.waitForFunction(()=>window.__ttsEvents.filter(e=>e.event==='ended').length===12,null,{timeout:120000});
   await expect(listen).toHaveAttribute('aria-pressed','false');
   expect(await page.evaluate(()=>window.__ttsInstances.length)).toBe(1);
   expect(await page.evaluate(()=>localStorage.getItem('tts-cursor:v1:tts-real-check'))).toBeNull();
   // Second supported voice, with actual pause/resume and Stop.
   await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();
   await page.getByRole('combobox',{name:'Giọng đọc',exact:true}).selectOption('tiktok-male-1');await page.getByRole('button',{name:'Ẩn Nghe sách',exact:true}).click();
   await listen.click();await expect(listen).toHaveAttribute('title','Tạm dừng nghe',{timeout:45000});await listen.click();await expect(listen).toHaveAttribute('title','Tiếp tục nghe');await listen.click();await expect(listen).toHaveAttribute('title','Tạm dừng nghe');
   await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();expect(await page.evaluate(()=>window.__ttsInstances.every(a=>a.paused))).toBe(true);
  }
  const events=await page.evaluate(()=>window.__ttsEvents);expect(http.every(status=>status===200)).toBe(true);
  const run={mode,...summarize(mode==='current'?events.slice(0,25):events),http,instances:await page.evaluate(()=>window.__ttsInstances.length),events};report.runs.push(run);
  mkdirSync('.dsh-tmp/tts-complete',{recursive:true});writeFileSync(`.dsh-tmp/tts-complete/real-audio${currentOnly?'-final':''}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({mode,segments:run.segments,startMs:run.startMs,gaps:run.gaps,http,instances:run.instances}));await context.close();
 }
}finally{await browser.close();}
