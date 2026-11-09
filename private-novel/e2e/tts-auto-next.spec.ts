import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
const mp3=readFileSync(new URL('../tests/fixtures/tts-continuous.mp3',import.meta.url)).toString('base64');
const listen=(page:Page)=>page.getByRole('button',{name:'Nghe truyện nhanh',exact:true});
async function setup(page:Page,options:{autoNext?:boolean;holdFinal?:boolean;names?:boolean}={}){
 await page.route('**/api/**',r=>r.fulfill({status:503}));
 await page.route('**/api/ai/translate',r=>{const body=r.request().postDataJSON();return r.fulfill({json:{result:body.text.includes('甲')?'Giáp bước vào phòng.':'Ất ngồi cạnh cửa sổ.',model:body.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.route('**/api/tts',r=>r.fulfill({json:{success:true,data:mp3}}));
 await page.addInitScript(({holdFinal})=>{
  const all:any[]=[];(window as any).__handoffAudio=all;(window as any).__handoffPlays=0;
  window.Audio=class {src='';loop=false;paused=true;currentTime=0;duration=1;playbackRate=1;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;onloadedmetadata:(()=>void)|null=null;constructor(){all.push(this);}play(){this.paused=false;if(!this.loop)(window as any).__handoffPlays++;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}load(){queueMicrotask(()=>this.onloadedmetadata?.());}} as unknown as typeof Audio;
  if(holdFinal&&!sessionStorage.getItem('handoff-final-held')){const digest=crypto.subtle.digest.bind(crypto.subtle);let count=0;crypto.subtle.digest=(algorithm,data)=>{
   const text=new TextDecoder().decode(data as ArrayBuffer);const result=digest(algorithm,data);
   // Read computes canonical + legacy hashes; hold the later complete-cache write.
   if(text.startsWith('["handoff-book","handoff-one",1,')&&++count===3){sessionStorage.setItem('handoff-final-held','true');return result.then(bytes=>new Promise<ArrayBuffer>(resolve=>{(window as any).__releaseHandoffFinal=()=>resolve(bytes);}));}
   return result;
  };}
 },{holdFinal:!!options.holdFinal});
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.evaluate(async({autoNext,names})=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['books','chapters','settings','names'],'readwrite');tx.objectStore('books').put({id:'handoff-book',title:'Synthetic handoff',author:'',status:'ready',chapterCount:2,charCount:20,createdAt:1,updatedAt:1});for(const [i,id,text] of [[0,'handoff-one','甲走进房间。'],[1,'handoff-two','乙坐在窗边。']] as const)tx.objectStore('chapters').put({id,bookId:'handoff-book',order:i,title:`Chương ${i+1}`,text,revision:1,sourceId:''});tx.objectStore('settings').put({key:'reader-options',value:{mode:'ai',preloadAi:false,...(autoNext===undefined?{}:{autoNext})}});if(names)for(const [key,value] of [['甲','Giáp'],['乙','Ất']])tx.objectStore('names').put({id:key,bookId:'handoff-book',key,value});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
 },{autoNext:options.autoNext,names:!!options.names});
 await page.goto('/read/handoff-book/handoff-one',{waitUntil:'domcontentloaded'});await expect(listen(page)).toBeEnabled();
}
async function finish(page:Page){await page.evaluate(()=>{const audio=(window as any).__handoffAudio.filter((a:any)=>!a.loop&&a.onended).at(-1);if(!audio)throw Error('No active synthetic audio');audio.onended();});}
test('next chapter with a different matched Name continues playing automatically',async({page})=>{
 await setup(page,{autoNext:true,names:true});await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Giáp bước vào phòng.');await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','playing');await expect(page.locator('.prose')).toContainText('Giáp bước vào phòng.');await finish(page);await expect(page.locator('.prose')).toContainText('Ất ngồi cạnh cửa sổ.');await expect(listen(page)).toHaveAttribute('data-state','playing');await expect.poll(()=>page.evaluate(()=>(window as any).__handoffPlays)).toBeGreaterThan(1);
});
test('a completed prefix advances after AI finalizes without appending more text',async({page})=>{
 await setup(page,{autoNext:true,holdFinal:true});await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+10000));await listen(page).click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseHandoffFinal)).toBe('function');await expect(listen(page)).toHaveAttribute('data-state','playing');await finish(page);await expect(page.locator('.prose')).toContainText('Giáp bước vào phòng.');await page.evaluate(()=>(window as any).__releaseHandoffFinal());await page.clock.resume();await expect(page.locator('.prose')).toContainText('Ất ngồi cạnh cửa sổ.');await expect(listen(page)).toHaveAttribute('data-state','playing');
});
test('legacy options with no autoNext field keep the enabled default',async({page})=>{
 await setup(page);await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','playing');await finish(page);await expect(page.locator('.prose')).toContainText('Ất ngồi cạnh cửa sổ.');await expect(listen(page)).toHaveAttribute('data-state','playing');
});
test('explicitly disabled auto-next never advances and reload never autoplays',async({page})=>{
 await setup(page,{autoNext:false,names:true});await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','playing');await finish(page);await expect(listen(page)).toHaveAttribute('data-state','ended');await expect(page.locator('.prose')).toContainText('Giáp bước vào phòng.');await page.reload();await expect(listen(page)).toBeEnabled();expect(await page.evaluate(()=>(window as any).__handoffPlays)).toBe(0);
});
test('Stop while the prefix is waiting cancels the later chapter handoff',async({page})=>{
 await setup(page,{autoNext:true,holdFinal:true});await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+10000));await listen(page).click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseHandoffFinal)).toBe('function');await expect(listen(page)).toHaveAttribute('data-state','playing');await finish(page);await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();await page.evaluate(()=>(window as any).__releaseHandoffFinal());await expect(listen(page)).toHaveAttribute('data-state','idle');await expect(page.locator('.prose')).toContainText('Giáp bước vào phòng.');expect(await page.evaluate(()=>(window as any).__handoffPlays)).toBe(1);
});
test('manual next while waiting never turns into automatic listening after a late result',async({page})=>{
 await setup(page,{autoNext:true,holdFinal:true});await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+10000));await listen(page).click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseHandoffFinal)).toBe('function');await expect(listen(page)).toHaveAttribute('data-state','playing');await finish(page);await page.getByRole('link',{name:'Chương sau →',exact:true}).first().click();await page.clock.resume();await expect(page.locator('.prose')).toContainText('Ất ngồi cạnh cửa sổ.');await page.evaluate(()=>(window as any).__releaseHandoffFinal());await expect(listen(page)).toHaveAttribute('data-state','idle');expect(await page.evaluate(()=>(window as any).__handoffPlays)).toBe(1);
});
test('a queued ended event cannot advance paused playback',async({page})=>{
 await setup(page,{autoNext:true});await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','playing');await page.evaluate(()=>{(window as any).__oldHandoffEnd=(window as any).__handoffAudio.filter((a:any)=>!a.loop&&a.onended).at(-1).onended;});await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','paused');await page.evaluate(()=>(window as any).__oldHandoffEnd());await expect(page.locator('.prose')).toContainText('Giáp bước vào phòng.');await expect(listen(page)).toHaveAttribute('data-state','paused');
});
test('listening begun before AI completion gains a durable cursor when the final identity is ready',async({page})=>{
 await setup(page,{autoNext:true,holdFinal:true});await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+10000));await listen(page).click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseHandoffFinal)).toBe('function');await expect(listen(page)).toHaveAttribute('data-state','playing');await page.evaluate(()=>(window as any).__releaseHandoffFinal());await page.clock.resume();await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await expect(page.getByLabel('Chương này',{exact:true})).toContainText('Đã xong');
 await page.getByRole('dialog',{name:'Dịch AI',exact:true}).getByRole('button',{name:'Ẩn Dịch AI',exact:true}).click();
 await page.evaluate(()=>{const audio=(window as any).__handoffAudio.filter((a:any)=>!a.loop&&a.onended).at(-1);audio.currentTime=.5;document.dispatchEvent(new Event('visibilitychange'));});await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','paused');await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:handoff-book')||'{}'))).toMatchObject({chapterId:'handoff-one',audioTime:.5});
 await page.reload({waitUntil:'domcontentloaded'});await expect(listen(page)).toHaveAttribute('data-resume','true');expect(await page.evaluate(()=>(window as any).__handoffPlays)).toBe(0);
});
