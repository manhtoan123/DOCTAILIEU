import {chromium,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {platform,release} from 'node:os';
import {resolve} from 'node:path';

// Real approved TTS + native media, isolated synthetic library and mocked AI/cloud.
const origin=process.env.TTS_CHECK_ORIGIN||'http://127.0.0.1:5175';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Local origin required.');
const suite=process.env.TTS_CHECK_SUITE||'quick';
if(!['quick','long','rates','unpunctuated'].includes(suite))throw Error('Unknown suite.');
const runId=`${new Date().toISOString().replace(/[^0-9]/g,'')}-${process.pid}`;
const directory=resolve('.dsh-tmp/tts-finish',runId);mkdirSync(directory,{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex');
const report={runId,suite,startedAt:new Date().toISOString(),origin,platform:platform(),os:release(),node:process.version,sourceSha:hash(readFileSync('src/features/tts/services/tts.ts')),readerSha:hash(readFileSync('src/features/reader/components/Reader.tsx')),realGateway:true,realAi:false,androidHardware:false,runs:[]};
const save=()=>{const file=resolve(directory,'report.json');writeFileSync(`${file}.tmp`,JSON.stringify(report,null,2));renameSync(`${file}.tmp`,file);};
const stats=values=>{const a=[...values].sort((x,y)=>x-y);return {n:a.length,median:a.length?a[Math.floor(a.length/2)]:null,p95:a.length?a[Math.ceil(a.length*.95)-1]:null,max:a.at(-1)??null};};
const seeds=[
 'Trong buổi sáng yên tĩnh, người đọc đi qua khu vườn xanh mát và nhìn những giọt sương còn đọng trên lá, rồi dừng lại dưới bóng cây để nghe tiếng chim và cảm nhận cơn gió nhẹ từ phía dòng sông',
 'Khi trở về căn nhà nhỏ, mọi người cùng chuẩn bị một bữa cơm giản dị, kể lại những chuyện đã gặp trên đường và chia sẻ niềm vui của ngày mới trước khi mở cuốn sách đang đọc dở trên bàn',
 'Buổi chiều xuống chậm trên con đường ven làng, một người khách mang theo chiếc túi vải bước qua cây cầu nhỏ và hỏi thăm những người đang ngồi nghỉ dưới mái hiên về lối đi đến khu vườn'
];
function fixtures(chapterCount,paragraphCount){return Array.from({length:chapterCount},(_,c)=>({title:`Chương ${c+1}`,text:Array.from({length:paragraphCount},(_,p)=>{let body=Array.from(seeds[p%seeds.length]).slice(0,170).join('');body=body.slice(0,body.lastIndexOf(' '));return `Mục ${c+1}-${p+1}: ${body}.`;}).join('\n')}));}
function unpunctuatedFixture(){const source=seeds.join(' ').replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ');let text=Array.from((source+' ').repeat(10)).slice(0,3200).join('');text=text.slice(0,text.lastIndexOf(' '));if(/[\p{P}\r\n]/u.test(text))throw Error('Fixture must be one paragraph without punctuation.');return [{title:'Chương 1',text}];}
const configurations=suite==='long'?[{name:'female-30min',voice:'tiktok-female-1',rate:1,policy:'priority',chapters:12,paragraphs:40,minAudioSeconds:1800},{name:'male-3min',voice:'tiktok-male-1',rate:1,policy:'priority',chapters:3,paragraphs:20,minAudioSeconds:180}]:suite==='rates'?[1.5,2,5].map(rate=>({name:`female-${rate}x`,voice:'tiktok-female-1',rate,policy:'priority',chapters:3,paragraphs:4,minAudioSeconds:0})):Array.from({length:3},(_,i)=>['priority','concurrent'].map(policy=>({name:`${policy}-${i+1}`,voice:'tiktok-female-1',rate:1,policy,chapters:1,paragraphs:2,minAudioSeconds:0}))).flat();
if(suite==='unpunctuated')configurations.splice(0,configurations.length,{name:'female-long-unpunctuated',voice:'tiktok-female-1',rate:1,policy:'priority',chapters:1,paragraphs:1,minAudioSeconds:0});
const browser=await chromium.launch({channel:'msedge'});report.browser=browser.version();save();
try{
 for(const config of configurations){
  const chapters=suite==='unpunctuated'?unpunctuatedFixture():fixtures(config.chapters,config.paragraphs),started=performance.now();
  const run={...config,status:'running',http:[],failures:[],samples:[],unexpectedExternal:[]};report.runs.push(run);save();
  if(suite==='unpunctuated'){writeFileSync(resolve(directory,'fixture.txt'),chapters[0].text);run.fixture={file:'fixture.txt',sha:hash(chapters[0].text),codepoints:Array.from(chapters[0].text).length,punctuation:false,paragraphs:1};save();}
  const context=await browser.newContext();
  await context.route(`${origin}/api/**`,r=>{const path=new URL(r.request().url()).pathname;return r.fulfill({json:path==='/api/ai/translate'?{result:r.request().postDataJSON().text,model:'gemini-3.5-flash',finishReason:'STOP',inputTokens:1,outputTokens:1}:path==='/api/dictionaries'?{dictionaries:[]}:{books:[],deleted:[],public:true,prompts:[],items:[],revision:0,version:1}});});
  await context.addInitScript(()=>{
   window.__ttsCheck={events:[],instances:0,urls:new Set(),maxUrls:0,maxRequests:0,startedAt:0};const check=window.__ttsCheck;
   const NativeAudio=window.Audio,create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
   URL.createObjectURL=function(blob){const url=create(blob);if(blob.type==='audio/mpeg'){check.urls.add(url);check.maxUrls=Math.max(check.maxUrls,check.urls.size);}return url;};
   URL.revokeObjectURL=function(url){check.urls.delete(url);return revoke(url);};
   window.Audio=function(src){const a=new NativeAudio(src);check.instances++;for(const event of ['playing','ended'])a.addEventListener(event,()=>{const p=check.player,s=p?.list[p.index],resources=p?.resources();if(resources)check.maxRequests=Math.max(check.maxRequests,resources.requests);check.events.push({event,at:performance.now(),chapter:document.querySelector('.chapter-title-menu')?.textContent||'',start:s?.start,end:s?.end,duration:Number.isFinite(a.duration)?a.duration:0,rate:a.playbackRate,resources});});return a;};
  });
  const page=await context.newPage(),requests=new WeakMap();
  page.on('request',r=>{if(r.url()==='https://ottsy.weilbyte.dev/api/generation')requests.set(r,performance.now());else if(r.url().startsWith('https:'))run.unexpectedExternal.push(new URL(r.url()).hostname);});
  page.on('response',r=>{if(r.url()==='https://ottsy.weilbyte.dev/api/generation'){const body=r.request().postDataJSON();run.http.push({status:r.status(),voice:body.voice,textSha:hash(body.text),codepoints:Array.from(body.text).length,headersMs:Math.round(performance.now()-(requests.get(r.request())??performance.now()))});}});
  page.on('requestfailed',r=>{if(r.url()==='https://ottsy.weilbyte.dev/api/generation')run.failures.push({error:r.failure()?.errorText||'failed'});});
  try{
   await page.goto(origin,{waitUntil:'domcontentloaded'});
   await page.evaluate(async chapters=>{const {db}=await import('/src/core/db.ts');await db.books.put({id:'tts-check',title:'Synthetic TTS verification',author:'',status:'ready',chapterCount:chapters.length,charCount:chapters.map(c=>c.text).join('').length,createdAt:1,updatedAt:1});for(const [i,c] of chapters.entries())await db.chapters.put({id:`tts-check-${i+1}`,bookId:'tts-check',order:i,title:c.title,text:c.text,revision:1,sourceId:''});},chapters);
   await page.goto(`${origin}/read/tts-check/tts-check-1`,{waitUntil:'domcontentloaded'});
   const listen=page.getByRole('button',{name:'Nghe truyện nhanh',exact:true});await expect(listen).toBeEnabled();
   await page.evaluate(async policy=>{const {TikTokPlayer}=await import('/src/features/tts/services/tts.ts');const start=TikTokPlayer.prototype.start;TikTokPlayer.prototype.start=function(...args){window.__ttsCheck.player=this;return start.apply(this,args);};if(policy==='concurrent')TikTokPlayer.prototype.prefetch=function(generation){if(generation!==this.generation)return;this.retainWindow();for(const s of this.list.slice(this.index+1,this.index+3))void this.request(s);if(this.list.length-this.index<3&&this.nextFirst)void this.request(this.nextFirst);};},config.policy);
   // Compare startup policies only; both use the same Reader and boundary logic.
   await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();await page.getByRole('combobox',{name:'Giọng đọc',exact:true}).selectOption(config.voice);
   await page.getByRole('slider',{name:'Tốc độ đọc',exact:true}).evaluate((input,rate)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(rate));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},config.rate);
   await page.getByRole('button',{name:'Ẩn Nghe sách',exact:true}).click();
   const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');run.heapBefore=(await cdp.send('Runtime.getHeapUsage')).usedSize;
   await page.evaluate(()=>window.__ttsCheck.startedAt=performance.now());await listen.click();await expect(listen).toHaveAttribute('title','Tạm dừng nghe',{timeout:45000});
   let lastHeartbeat=0;
   for(;;){
    const status=await page.evaluate(()=>{const c=window.__ttsCheck,p=c.player,r=p?.resources();if(r)c.maxRequests=Math.max(c.maxRequests,r.requests);const ends=c.events.filter(e=>e.event==='ended');return {state:p?.state,ended:ends.length,chapters:new Set(ends.map(e=>e.chapter)).size,audioSeconds:ends.reduce((n,e)=>n+e.duration/e.rate,0)+(p?.audio?p.audio.currentTime/p.audio.playbackRate:0),resources:r};});
    expect(status.resources.requests).toBeLessThanOrEqual(3);if(status.state==='error')throw Error('TTS entered error; inspect preserved run evidence.');
    if(status.state==='ended'||config.minAudioSeconds&&status.audioSeconds>=config.minAudioSeconds){run.audioSeconds=Number(status.audioSeconds.toFixed(2));run.completedChapters=status.chapters;run.completedSegments=status.ended;if(config.minAudioSeconds)expect(run.audioSeconds).toBeGreaterThanOrEqual(config.minAudioSeconds);break;}
    const elapsed=(performance.now()-started)/1000;if(elapsed-lastHeartbeat>=60){lastHeartbeat=elapsed;run.samples.push({elapsedSeconds:Math.round(elapsed),audioSeconds:Math.round(status.audioSeconds),ended:status.ended,chapters:status.chapters,heapBytes:(await cdp.send('Runtime.getHeapUsage')).usedSize,resources:status.resources});save();console.log(JSON.stringify({progress:config.name,...run.samples.at(-1)}));}
    if(elapsed>(config.minAudioSeconds?config.minAudioSeconds*2+300:360))throw Error('Run exceeded time budget.');await page.waitForTimeout(1000);
   }
   run.events=await page.evaluate(()=>window.__ttsCheck.events);const played=run.events.filter(e=>e.event==='playing'),ends=run.events.filter(e=>e.event==='ended');expect(played.every(e=>e.rate===config.rate)).toBe(true);run.startMs=await page.evaluate(()=>Math.round(window.__ttsCheck.events.find(e=>e.event==='playing').at-window.__ttsCheck.startedAt));
   run.gaps=ends.flatMap(e=>{const next=played.find(p=>p.at>e.at);return next?[{ms:Math.round(next.at-e.at),chapterBoundary:next.chapter!==e.chapter,ready:e.resources.nextReady}]:[];});run.gapStats={all:stats(run.gaps.map(g=>g.ms)),ready:stats(run.gaps.filter(g=>g.ready).map(g=>g.ms)),notReady:stats(run.gaps.filter(g=>!g.ready).map(g=>g.ms)),chapter:stats(run.gaps.filter(g=>g.chapterBoundary).map(g=>g.ms))};
   const covered=new Map();let lastChapter=-1;
   for(const e of played){const index=chapters.findIndex(c=>c.title===e.chapter);expect(index).toBeGreaterThanOrEqual(0);expect(index).toBeGreaterThanOrEqual(lastChapter);if(index!==lastChapter)expect(index).toBe(lastChapter+1);lastChapter=index;expect(e.start).toBe(covered.get(index)||0);expect(e.end).toBeGreaterThan(e.start);expect(e.end).toBeLessThanOrEqual(chapters[index].text.length);expect(run.http.some(r=>r.status===200&&r.textSha===hash(chapters[index].text.slice(e.start,e.end)))).toBe(true);covered.set(index,e.end);}
   for(let c=0;c<lastChapter;c++)expect(covered.get(c)).toBe(chapters[c].text.length);if(!config.minAudioSeconds){expect(lastChapter).toBe(chapters.length-1);expect(covered.get(lastChapter)).toBe(chapters.at(-1).text.length);}run.orderVerified=true;
   if(await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).count())await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();
   const stopped=await page.evaluate(()=>({resources:window.__ttsCheck.player.resources(),urls:window.__ttsCheck.urls.size,instances:window.__ttsCheck.instances,maxUrls:window.__ttsCheck.maxUrls,maxRequests:window.__ttsCheck.maxRequests,cursor:localStorage.getItem('tts-cursor:v1:tts-check')}));expect(stopped.resources.requests).toBe(0);expect(stopped.resources.activeAudio).toBe(false);expect(stopped.urls).toBe(0);expect(stopped.cursor).toBeNull();expect(stopped.instances).toBe(1);expect(stopped.maxRequests).toBeLessThanOrEqual(3);expect(stopped.maxUrls).toBeLessThanOrEqual(2);run.resources=stopped;
   expect(run.unexpectedExternal).toEqual([]);expect(run.http.every(r=>r.voice===(config.voice==='tiktok-male-1'?'BV075_streaming':'BV074_streaming'))).toBe(true);expect(run.http.every(r=>r.codepoints<=200)).toBe(true);run.gatewayStatusCounts=run.http.reduce((counts,r)=>({...counts,[r.status]:(counts[r.status]||0)+1}),{});
   await cdp.send('HeapProfiler.collectGarbage');run.heapAfter=(await cdp.send('Runtime.getHeapUsage')).usedSize;run.heapDelta=run.heapAfter-run.heapBefore;expect(run.heapDelta).toBeLessThan(16*1048576);if(run.gapStats.ready.n>=100)expect(run.gapStats.ready.p95).toBeLessThanOrEqual(250);
   run.status='passed';run.elapsedSeconds=Math.round((performance.now()-started)/1000);save();console.log(JSON.stringify({complete:run.name,audioSeconds:run.audioSeconds,segments:run.completedSegments,startMs:run.startMs,gaps:run.gapStats,heapDelta:run.heapDelta,orderVerified:true}));
  }catch(error){run.status='failed';run.error=String(error);run.events=await page.evaluate(()=>window.__ttsCheck?.events||[]).catch(()=>[]);save();throw error;}finally{await context.close();}
 }
 report.status='passed';save();console.log(JSON.stringify({status:report.status,report:resolve(directory,'report.json')}));
}catch(error){report.status='failed';report.error=String(error);save();throw error;}finally{await browser.close();}
