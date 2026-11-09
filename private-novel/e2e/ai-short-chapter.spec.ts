import {test,expect,type Page} from '@playwright/test';
const book='short-whole-book',chapter='short-whole-chapter',raw='合成故事。'.repeat(900),translated='Bản dịch tổng hợp đã hoàn tất.';
test.beforeEach(async({context})=>{await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic fixture'}}));});
async function seed(page:Page,parallel:boolean){
 await page.goto('/');await expect(page.getByRole('button',{name:'Thêm truyện',exact:true})).toBeVisible();
 await page.evaluate(async({book,chapter,raw,parallel})=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const bytes=new TextEncoder().encode(raw),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['books','chapters','sources','settings'],'readwrite');
   tx.objectStore('books').put({id:book,title:'Truyện thử nguyên chương',author:'Tổng hợp',status:'ready',chapterCount:1,charCount:raw.length,createdAt:1,updatedAt:1});
   tx.objectStore('chapters').put({id:chapter,bookId:book,order:0,title:'Chương thử',text:raw,revision:1,sourceId:'short-source'});
   tx.objectStore('sources').put({id:'short-source',bookId:book,name:'synthetic.txt',encoding:'utf-8',bytes:bytes.length,sha256,blob:new Blob([bytes])});
   tx.objectStore('settings').put({key:'reader-options',value:{mode:'original',preloadAi:false,autoNext:false}});
   tx.objectStore('settings').put({key:`ai-book-settings:${book}`,value:{model:'gemini-2.5-flash',temperature:0,fallbackModels:[],splitParts:parallel}});
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });db.close();
 },{book,chapter,raw,parallel});
 await page.goto(`/read/${book}/${chapter}`);await expect(page.locator('.prose')).toContainText(raw.slice(0,30));
}
async function snapshot(page:Page,dropFull=false){return page.evaluate(async({chapter,dropFull})=>{
 const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);});
 const read=(table:string,key?:string)=>new Promise<any>(resolve=>{const s=db.transaction(table).objectStore(table),r=key?s.get(key):s.getAll();r.onsuccess=()=>resolve(r.result);});
 const rows=await read('settings'),source=await read('sources','short-source'),savedChapter=await read('chapters',chapter);
 if(dropFull)await new Promise<void>((resolve,reject)=>{const tx=db.transaction('settings','readwrite');for(const row of rows)if(row.key.startsWith('ai-reading-cache:v1:'))tx.objectStore('settings').delete(row.key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
 const result={text:savedChapter.text,source:await source.blob.text(),hash:source.sha256,full:rows.filter((r:any)=>r.key.startsWith('ai-reading-cache:v1:')).length,parts:rows.filter((r:any)=>r.key.startsWith('ai-reading-cache:parts:v1:')).length};db.close();return result;
},{chapter,dropFull});}
for(const parallel of [false,true])test(`short TXT retries the whole chapter with parallel=${parallel} and reuses root checkpoint as 1/1`,async({page})=>{
 await seed(page,parallel);const before=await snapshot(page),calls:string[]=[];
 await page.route('**/api/ai/translate',async r=>{const body=r.request().postDataJSON();calls.push(body.text);if(calls.length===1)return r.fulfill({status:502,headers:{'X-AI-Failure-Reason':'output_limit'},json:{error:'ai_incomplete_result'}});if(calls.length===2)return r.fulfill({status:504,json:{error:'ai_timeout'}});return r.fulfill({json:{result:translated,model:body.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText(translated);expect(calls).toEqual([raw,raw,raw]);
 await expect.poll(async()=>(await snapshot(page)).full).toBe(1);const after=await snapshot(page);expect({text:after.text,source:after.source,hash:after.hash}).toEqual({text:before.text,source:before.source,hash:before.hash});expect(after.parts).toBe(1);
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await expect(page.getByLabel('Chương này',{exact:true})).toContainText('1/1 phần hoàn tất');
 await snapshot(page,true);await page.reload();await expect(page.locator('.prose')).toContainText(translated);expect(calls).toHaveLength(3);
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await expect(page.getByLabel('Chương này',{exact:true})).toContainText('1/1 phần hoàn tất');
});
test('Stop cancels an in-flight short whole request without sending fragments',async({page})=>{
 await seed(page,true);await page.clock.install();const calls:string[]=[];let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/ai/translate',async r=>{calls.push(r.request().postDataJSON().text);await gate;await r.fulfill({status:502,headers:{'X-AI-Failure-Reason':'output_limit'},json:{error:'ai_incomplete_result'}}).catch(()=>{});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>calls.length).toBe(1);await page.getByRole('button',{name:'Dừng chương này',exact:true}).first().click();release();await page.clock.runFor(10000);expect(calls).toEqual([raw]);expect((await snapshot(page)).text).toBe(raw);expect((await snapshot(page)).parts).toBe(0);
});
for(const stop of [false,true])test(`streamed draft is readable before final, excluded from cache/TTS, Stop=${stop}`,async({page})=>{
 await seed(page,false);
 await page.evaluate(()=>{const original=window.fetch.bind(window);(window as any).__previewCalls=0;window.fetch=async(input,init)=>{
  if(String(input)!=='/api/ai/translate')return original(input,init);(window as any).__previewCalls++;const body=JSON.parse(init!.body as string);
  return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(JSON.stringify({type:'text',text:'Đoạn xem trước hoàn chỉnh.\nCâu còn đang viết'})+'\n'));(window as any).__finishPreview=()=>{controller.enqueue(new TextEncoder().encode(JSON.stringify({type:'result',status:200,headers:{},data:{result:'Đoạn xem trước hoàn chỉnh.\nBản cuối hoàn tất.',model:body.model,finishReason:'STOP',inputTokens:1,outputTokens:1}})+'\n'));controller.close();};}}),{headers:{'Content-Type':'application/x-ndjson'}});
 };});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Đoạn xem trước hoàn chỉnh.');await expect(page.locator('.prose')).not.toContainText('Câu còn đang viết');expect((await snapshot(page)).full).toBe(0);
 await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();await expect(page.getByRole('button',{name:/^▶ Nghe/})).toBeDisabled();await page.getByRole('dialog',{name:'Nghe sách',exact:true}).getByRole('button',{name:'Ẩn Nghe sách',exact:true}).click();
 if(stop){await page.getByRole('button',{name:'Dừng chương này',exact:true}).first().click();await expect(page.locator('.prose')).not.toContainText('Đoạn xem trước hoàn chỉnh.');expect((await snapshot(page)).full).toBe(0);}
 else{await page.evaluate(()=>(window as any).__finishPreview());await expect(page.locator('.prose')).toContainText('Bản cuối hoàn tất.');await expect.poll(async()=>(await snapshot(page)).full).toBe(1);}
 expect(await page.evaluate(()=>(window as any).__previewCalls)).toBe(1);expect((await snapshot(page)).text).toBe(raw);
});
