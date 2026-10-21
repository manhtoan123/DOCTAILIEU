import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
const mp3=readFileSync(new URL('../tests/fixtures/tts-continuous.mp3',import.meta.url)).toString('base64');
async function setup(page:Page){
 await page.route('http://127.0.0.1:5173/api/**',r=>r.fulfill({status:503}));
 await page.addInitScript(()=>{
  const w=window as any,NativeAudio=window.Audio;w.__audios=[];w.__states=[];w.__ended=0;w.__handlers={};w.__urls=[];
  w.Audio=function(){const a=new NativeAudio();w.__audios.push(a);return a;};
  const create=URL.createObjectURL.bind(URL);URL.createObjectURL=value=>{const url=create(value);w.__urls.push(url);return url;};
  if(navigator.mediaSession){const original=navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);navigator.mediaSession.setActionHandler=(name,handler)=>{w.__handlers[name]=handler;original(name,handler);};}
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{const {TikTokPlayer,tiktokVoices}=await import('/src/features/tts/services/tts.ts'),w=window as any;w.__voice=tiktokVoices[0];w.__player=new TikTokPlayer((state,s,message)=>w.__states.push({state,offset:s?.start,message}),()=>w.__ended++,undefined,true);});
}
const start=(page:Page,text='One.Two.Three.Four.Five.Six.')=>page.evaluate(text=>{const w=window as any;w.__player.start(text,w.__voice,{rate:5,pitch:1,flex:0});},text);
const state=(page:Page)=>page.evaluate(()=>(window as any).__states.at(-1));
const audio=(page:Page)=>page.evaluate(()=>{const w=window as any,a=w.__audios[0] as HTMLAudioElement;return {src:a.getAttribute('src'),paused:a.paused,time:a.currentTime,duration:Number.isFinite(a.duration)?a.duration:'infinite',buffered:a.buffered.length?a.buffered.end(a.buffered.length-1):0,position:w.__player.position(),resources:w.__player.resources(),count:w.__audios.length,urls:w.__urls.length,error:a.error?.message};});

test('real MP3 MSE keeps one source across chunks, media pause/resume and Stop; no silent requests',async({page})=>{
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.fulfill({json:{success:true,data:mp3}}));await setup(page);await start(page);
 await expect.poll(async()=>(await state(page))?.state).toBe('playing');const before=await audio(page);expect(before).toMatchObject({count:1,urls:1,duration:'infinite'});
 await expect.poll(async()=>(await audio(page)).position.offset).toBeGreaterThan(4);expect((await audio(page)).src).toBe(before.src);expect((await audio(page)).resources.requests).toBeLessThanOrEqual(3);
 await page.evaluate(()=>(window as any).__handlers.pause());await expect.poll(async()=>(await state(page)).state).toBe('paused');const position=(await audio(page)).position;
 await page.waitForTimeout(200);expect((await audio(page)).position.audioTime).toBeCloseTo(position.audioTime,1);
 await page.evaluate(()=>(window as any).__handlers.play());await expect.poll(async()=>(await state(page)).state).toBe('playing');expect((await audio(page)).src).toBe(before.src);
 await page.evaluate(()=>(window as any).__handlers.stop());expect(await audio(page)).toMatchObject({src:null,paused:true,count:1,urls:1});expect(requests.some(url=>url.includes('tts-media-keepalive'))).toBe(false);
});

test('network failure drains warm audio then resumes failed offset on same source',async({page})=>{
 let offline=true;await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.request().postDataJSON().text==='Four.'&&offline?r.abort('internetdisconnected'):r.fulfill({json:{success:true,data:mp3}}));await setup(page);await start(page);
 await expect.poll(async()=>(await state(page))?.state).toBe('playing');const src=(await audio(page)).src;
 await expect.poll(async()=>(await state(page))?.state,{timeout:20000}).toBe('error');expect((await audio(page)).position).toEqual({offset:14,audioTime:0});
 offline=false;await page.evaluate(()=>(window as any).__player.resume());await expect.poll(async()=>(await state(page)).state).toBe('playing');expect((await audio(page)).src).toBe(src);expect((await audio(page)).position.offset).toBeGreaterThanOrEqual(14);await page.evaluate(()=>(window as any).__player.stop());
});

test('automatic next chapter keeps native source; final end and unmount-style stop release it',async({page})=>{
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.fulfill({json:{success:true,data:mp3}}));await setup(page);await start(page,'One.Two.');await page.evaluate(()=>(window as any).__player.prepareNext('Next.Last.'));
 const src=await expect.poll(async()=>(await state(page))?.state).toBe('playing').then(async()=>(await audio(page)).src);
 await expect.poll(()=>page.evaluate(()=>(window as any).__ended),{timeout:15000}).toBe(1);await page.evaluate(()=>{const w=window as any;w.__player.stop(true);w.__player.start('Next.Last.',w.__voice,{rate:5,pitch:1,flex:0});});
 await expect.poll(async()=>(await state(page)).state).toBe('playing');expect((await audio(page)).src).toBe(src);expect((await audio(page)).urls).toBe(1);
 await expect.poll(()=>page.evaluate(()=>(window as any).__ended),{timeout:15000}).toBe(2);expect(await audio(page)).toMatchObject({src:null,paused:true});
 await start(page);await expect.poll(async()=>(await state(page)).state).toBe('playing');await page.evaluate(()=>(window as any).__player.stop());expect((await audio(page)).src).toBeNull();
});

test('restored cursor uses chunk-relative time and reload never autoplays',async({page})=>{
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.fulfill({json:{success:true,data:mp3}}));await setup(page);
 await page.evaluate(()=>{const w=window as any;w.__player.start('One.Two.Three.',w.__voice,{rate:1,pitch:1,flex:0},{offset:4,audioTime:2});});
 await expect.poll(async()=>(await state(page))?.state).toBe('playing');expect((await audio(page)).position).toMatchObject({offset:4});expect((await audio(page)).position.audioTime).toBeGreaterThanOrEqual(2);
 await page.reload({waitUntil:'domcontentloaded'});expect(await page.evaluate(()=>(window as any).__audios.length)).toBe(0);
});

test('native buffer removes consumed MP3 data while the same source keeps playing',async({page})=>{
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.fulfill({json:{success:true,data:mp3}}));await setup(page);await start(page,Array.from({length:16},(_,i)=>`Sentence ${i}.`).join(''));
 await expect.poll(async()=>(await state(page))?.state).toBe('playing');const src=(await audio(page)).src;
 await expect.poll(()=>page.evaluate(()=>{const a=(window as any).__audios[0] as HTMLAudioElement;return a.buffered.length?a.buffered.start(0):0;}),{timeout:18000}).toBeGreaterThan(1);
 expect((await audio(page)).src).toBe(src);expect((await audio(page)).resources.requests).toBeLessThanOrEqual(3);expect((await audio(page)).error).toBeUndefined();await page.evaluate(()=>(window as any).__player.stop());
});

