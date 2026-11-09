import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
const mp3=readFileSync(new URL('../tests/fixtures/tts-continuous.mp3',import.meta.url)).toString('base64');
const book='latency-book',chapter='latency-one',first='Giáp bước vào phòng.',second='Ất ngồi cạnh cửa sổ.';
const listen=(page:Page)=>page.getByRole('button',{name:'Nghe truyện nhanh',exact:true});
async function seed(page:Page,text:string,parallel:boolean){
 await page.route('**/api/**',r=>r.fulfill({status:503}));
 await page.route('**/api/tts',async r=>{const body=r.request().postDataJSON();await page.evaluate(text=>{((window as any).__latencySpoken??=[]).push(text);},body.text);await r.fulfill({json:{success:true,data:mp3}});});
 await page.addInitScript(()=>{
  const all:any[]=[];(window as any).__latencyAudio=all;(window as any).__latencyPlays=0;
  window.Audio=class {src='';loop=false;paused=true;currentTime=0;duration=1;playbackRate=1;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;onloadedmetadata:(()=>void)|null=null;constructor(){all.push(this);}play(){this.paused=false;if(!this.loop)(window as any).__latencyPlays++;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}load(){queueMicrotask(()=>this.onloadedmetadata?.());}} as unknown as typeof Audio;
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async({book,chapter,text,parallel})=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['books','chapters','settings'],'readwrite');tx.objectStore('books').put({id:book,title:'Synthetic latency',author:'',status:'ready',chapterCount:1,charCount:text.length,createdAt:1,updatedAt:1});tx.objectStore('chapters').put({id:chapter,bookId:book,order:0,title:'Chương thử',text,revision:1,sourceId:''});tx.objectStore('settings').put({key:'reader-options',value:{mode:'original',preloadAi:false,autoNext:false}});tx.objectStore('settings').put({key:`ai-book-settings:${book}`,value:{model:'gemini-2.5-flash',temperature:0,fallbackModels:[],splitParts:parallel}});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
 },{book,chapter,text,parallel});
 await page.goto(`/read/${book}/${chapter}`,{waitUntil:'domcontentloaded'});await expect(listen(page)).toBeEnabled();
}
async function state(page:Page){return page.evaluate(async({chapter})=>{
 const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);});
 const tx=db.transaction(['settings','chapters']);const all=await new Promise<any[]>(resolve=>{const r=tx.objectStore('settings').getAll();r.onsuccess=()=>resolve(r.result);});const raw=await new Promise<any>(resolve=>{const r=tx.objectStore('chapters').get(chapter);r.onsuccess=()=>resolve(r.result);});db.close();return {full:all.filter(r=>r.key.startsWith('ai-reading-cache:v1:')).length,parts:all.filter(r=>r.key.startsWith('ai-reading-cache:parts:v1:')).length,raw:raw.text};
 },{chapter});}
async function stream(page:Page,recover=false){await page.evaluate(({recover,first,second})=>{
 const original=fetch.bind(window),encoder=new TextEncoder(),calls:any[]=[];(window as any).__latencyCalls=calls;
 window.fetch=async(input,init)=>{
  if(input!=='/api/ai/translate')return original(input,init);
  const body=JSON.parse(String(init?.body)),index=calls.length,row={text:body.text,done:false,aborted:false,startedWithActive:calls.some(call=>!call.done)};calls.push(row);
  return new Response(new ReadableStream<Uint8Array>({start(c){
   const emit=(data:unknown)=>c.enqueue(encoder.encode(JSON.stringify(data)+'\n'));
   emit({type:'progress',lease:{requestId:`00000000-0000-0000-0000-${String(index).padStart(12,'0')}`,leaseIdHash:String(index+1).repeat(32),keySlot:index%2+1,keysAvailable:2}});
   const finish=(late=false)=>{if(row.done)return;row.done=true;emit({type:'result',status:recover&&index===0?502:200,headers:{'X-AI-Parallel':'2',...(recover&&index===0?{'X-AI-Failure-Reason':'output_limit'}:{})},data:recover&&index===0?{error:'ai_incomplete_result'}:{result:late?'KẾT QUẢ CŨ':body.text.startsWith('甲')?first:body.text.startsWith('乙')?second:'Bính đi ngang cửa.',model:body.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});c.close();};
   init?.signal?.addEventListener('abort',()=>{row.aborted=true;},{once:true});
   if((recover&&index===0)||body.text.startsWith('甲')||body.text.startsWith('丙'))setTimeout(()=>finish(),60);
   else (window as any).__latencyRelease=(late=false)=>finish(late);
  },cancel(){row.aborted=true;row.done=true;}}),{headers:{'Content-Type':'application/x-ndjson'}});
 };
 },{recover,first,second});}

test('after model pinning a streamed lease starts another part and later output cannot skip a prefix gap',async({page})=>{
 const raw='甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800);await seed(page,raw,true);await stream(page);
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__latencyCalls.length)).toBe(3);
 expect(await page.evaluate(()=>(window as any).__latencyCalls[2].startedWithActive)).toBe(true);
 await expect(page.locator('.prose')).toContainText(first);await expect(page.locator('.prose')).not.toContainText(second);await expect(page.locator('.prose')).not.toContainText('Bính đi ngang cửa.');
 expect(await state(page)).toMatchObject({full:0,raw});
 await page.evaluate(()=>(window as any).__latencyRelease());await expect(page.locator('.prose')).toContainText(second);await expect.poll(async()=>(await state(page)).full).toBe(1);
});
test('recovery child is readable and listenable while its sibling is pending, then audio continues once',async({page})=>{
 const raw='甲'.repeat(800)+'乙'.repeat(800);await seed(page,raw,true);await stream(page,true);
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText(first);
 await expect.poll(()=>page.evaluate(()=>(window as any).__latencyCalls.length)).toBe(3);expect(await state(page)).toMatchObject({full:0,raw});
 await listen(page).click();await expect(listen(page)).toHaveAttribute('data-state','playing');
 await page.evaluate(()=>{const a=(window as any).__latencyAudio.filter((a:any)=>!a.loop&&a.onended).at(-1);a.onended();});
 await page.evaluate(()=>(window as any).__latencyRelease());await expect(page.locator('.prose')).toContainText(second);
 await expect.poll(()=>page.evaluate(()=>(window as any).__latencyPlays)).toBe(2);await expect.poll(async()=>(await state(page)).full).toBe(1);
 expect(await page.evaluate(()=>(window as any).__latencySpoken)).toEqual([first,second]);
});
test('Stop cancels the child stream; reload reuses the checkpoint without repeating the root',async({page})=>{
 const raw='甲'.repeat(800)+'乙'.repeat(800);await seed(page,raw,true);await stream(page,true);
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText(first);await expect.poll(async()=>(await state(page)).parts).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Dừng chương này',exact:true}).first().click();await page.evaluate(()=>(window as any).__latencyRelease(true));
 await expect(page.locator('.prose')).not.toContainText('KẾT QUẢ CŨ');expect((await state(page)).full).toBe(0);
 const calls:string[]=[];await page.route('**/api/ai/translate',r=>{const body=r.request().postDataJSON();calls.push(body.text);return r.fulfill({json:{result:second,model:body.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText(second);await expect(page.locator('.prose')).toContainText(first);
 expect(calls).toEqual(['乙'.repeat(800)]);expect((await state(page)).raw).toBe(raw);expect(await page.evaluate(()=>(window as any).__latencyPlays)).toBe(0);
});
test('parallel OFF plans large output before sending and preserves source without overlapping requests',async({page})=>{
 const raw='甲'.repeat(12000);await seed(page,raw,false);const calls:string[]=[];let active=0,max=0;
 await page.route('**/api/ai/translate',async r=>{const body=r.request().postDataJSON();calls.push(body.text);max=Math.max(max,++active);await new Promise(resolve=>setTimeout(resolve,30));active--;await r.fulfill({json:{result:'Bản dịch hoàn chỉnh.',model:body.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(async()=>(await state(page)).full).toBe(1);
 expect(calls.length).toBeGreaterThan(1);expect(calls.join('')).toBe(raw);expect(Math.max(...calls.map(text=>512+text.length*3))).toBeLessThanOrEqual(6144);expect(max).toBe(1);expect((await state(page)).raw).toBe(raw);
});
