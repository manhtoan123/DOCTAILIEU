import {capcutVietnameseVoices} from '../src/shared/constants/capcut-voices';
import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
const mp3=readFileSync(new URL('../tests/fixtures/tts-continuous.mp3',import.meta.url)).toString('base64');
async function seed(page:Page){
  await page.route('**/api/**',route=>route.fulfill({status:503}));
  await page.route('**/api/ai/translate',route=>{const input=route.request().postDataJSON();return route.fulfill({json:{result:input.text,model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
  await page.addInitScript(()=>{const NativeAudio=window.Audio;(window as any).__capcutAudios=[];window.Audio=function(src?:string){const audio=new NativeAudio(src);audio.volume=0;(window as any).__capcutAudios.push(audio);return audio;} as typeof Audio;});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{const database=await new Promise<IDBDatabase>((resolve,reject)=>{const open=indexedDB.open('thu-phong-v1');open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});try{await new Promise<void>((resolve,reject)=>{const tx=database.transaction(['books','chapters'],'readwrite');tx.objectStore('books').put({id:'capcut-fixture',title:'CapCut synthetic',author:'',status:'ready',chapterCount:1,charCount:2000,createdAt:1,updatedAt:1});tx.objectStore('chapters').put({id:'capcut-one',bookId:'capcut-fixture',order:0,title:'Chương thử',text:Array.from({length:30},(_,i)=>`Câu thử số ${i}. Đây là nội dung tổng hợp để kiểm tra giọng đọc và giữ vị trí nghe.`).join('\n'),revision:1,sourceId:''});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{database.close();}});
  await page.goto('/read/capcut-fixture/capcut-one',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('button',{name:'Nghe truyện nhanh',exact:true})).toBeEnabled();
}
const listen=(page:Page)=>page.getByRole('button',{name:'Nghe truyện nhanh',exact:true});
test('same-origin CapCut contract keeps exact female voice and native audio pause/resume',async({page})=>{
  await seed(page);const calls:any[]=[];let legacy=0;
  await page.route('https://ottsy.weilbyte.dev/**',route=>{legacy++;return route.abort();});
  await page.route('**/api/tts',route=>{calls.push(route.request().postDataJSON());return route.fulfill({json:{success:true,data:mp3}});});
  await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','playing');expect(calls[0]).toMatchObject({voice:'BV074_streaming'});expect(Object.keys(calls[0]).sort()).toEqual(['text','voice']);expect(legacy).toBe(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).__capcutAudios.some((a:HTMLAudioElement)=>a.currentTime>.05&&a.readyState>=2))).toBe(true);
  await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','paused');
  const paused=await page.evaluate(()=>{const a=(window as any).__capcutAudios.find((a:HTMLAudioElement)=>!a.loop);return {src:a.src,time:a.currentTime};});
  await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','playing');expect(await page.evaluate(()=>((window as any).__capcutAudios.find((a:HTMLAudioElement)=>!a.loop) as HTMLAudioElement).src)).toBe(paused.src);
  await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();await expect(listen(page)).toHaveAttribute('data-state','idle');expect(await page.evaluate(()=>(window as any).__capcutAudios.every((a:HTMLAudioElement)=>a.paused))).toBe(true);
});
test('expired CapCut session is visible and resumes after the server session is restored',async({page})=>{
  await seed(page);let expired=true,calls=0;
  await page.route('**/api/tts',route=>{calls++;return expired?route.fulfill({status:401,json:{success:false,error:'capcut_session_expired'}}):route.fulfill({json:{success:true,data:mp3}});});
  await page.clock.install();await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','loading');await expect(page.locator('.reader-convert-status').filter({hasText:'Phiên CapCut cần kết nối lại'})).toBeVisible();expect(calls).toBe(1);
  expired=false;await page.clock.runFor(60000);await expect(listen(page)).toHaveAttribute('data-state','playing');await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();
});
test('Stop aborts a delayed CapCut request and late audio cannot restart the player',async({page})=>{
  await seed(page);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let started=0;
  await page.route('**/api/tts',async route=>{started++;await gate;await route.fulfill({json:{success:true,data:mp3}}).catch(()=>{});});
  await listen(page).click();await expect.poll(()=>started).toBeGreaterThan(0);await expect(listen(page)).toHaveAttribute('data-state','loading');
  await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();await expect(listen(page)).toHaveAttribute('data-state','idle');release();await page.waitForTimeout(200);await expect(listen(page)).toHaveAttribute('data-state','idle');expect(await page.evaluate(()=>(window as any).__capcutAudios.every((a:HTMLAudioElement)=>a.paused))).toBe(true);
});

test('new Vietnamese voice remains selected and keeps its listening cursor after reload',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Câu thử số 29.');await expect(page.getByRole('button',{name:'Dừng chương này',exact:true})).toHaveCount(0);const voices:string[]=[];
 await page.route('**/api/tts',route=>{voices.push(route.request().postDataJSON().voice);return route.fulfill({json:{success:true,data:mp3}});});
 await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();
 const choice=page.getByRole('combobox',{name:'Giọng đọc',exact:true});await expect(choice.locator('option')).toHaveCount(capcutVietnameseVoices.length);
 await choice.selectOption('capcut-BV562_streaming');await page.getByRole('button',{name:'Lưu cài đặt',exact:true}).click();
 await page.getByRole('button',{name:'Ẩn Nghe sách',exact:true}).click();await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','playing');
 await expect.poll(()=>page.evaluate(()=>(window as any).__capcutAudios.some((a:HTMLAudioElement)=>a.currentTime>.05))).toBe(true);
 await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','paused');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:capcut-fixture')||'{}').voiceId)).toBe('capcut-BV562_streaming');
 expect(voices.length).toBeGreaterThan(0);expect(voices.every(v=>v==='BV562_streaming')).toBe(true);const before=voices.length;
 await page.reload();await expect(listen(page)).toBeEnabled();expect(voices.length).toBe(before);
 await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();await expect(choice).toHaveValue('capcut-BV562_streaming');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:capcut-fixture')||'{}').voiceId)).toBe('capcut-BV562_streaming');
});

test('reload resumes the saved media time from device audio cache without retransmitting that chunk',async({page})=>{
 await seed(page);const calls:{text:string;voice:string}[]=[];
 await page.route('**/api/tts',route=>{calls.push(route.request().postDataJSON());return route.fulfill({json:{success:true,data:mp3}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Câu thử số 29.');
 await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','playing');
 await expect.poll(()=>page.evaluate(()=>(window as any).__capcutAudios.some((a:HTMLAudioElement)=>a.currentTime>.25))).toBe(true);
 await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','paused');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:capcut-fixture')||'{}').audioTime)).toBeGreaterThan(.2);
 await expect.poll(()=>page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('thu-phong-audio-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise<number>((resolve,reject)=>{const r=db.transaction('audio').objectStore('audio').count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}})).toBeGreaterThan(0);
 const first=calls[0],count=calls.filter(c=>c.text===first.text&&c.voice===first.voice).length;
 await page.reload();await expect(listen(page)).toHaveAttribute('data-resume','true');expect(await page.evaluate(()=>(window as any).__capcutAudios.every((a:HTMLAudioElement)=>a.paused))).toBe(true);
 await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','playing');await expect.poll(()=>page.evaluate(()=>(window as any).__capcutAudios.some((a:HTMLAudioElement)=>a.currentTime>.2))).toBe(true);
 expect(calls.filter(c=>c.text===first.text&&c.voice===first.voice).length).toBe(count);await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();
});
