import {chromium,devices,expect} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';

const origin=process.env.SMOKE_ORIGIN||'https://thu-phong-private.pages.dev';
const dir='.dsh-tmp/reading-bookmark';mkdirSync(dir,{recursive:true});
const bundle=readFileSync('dist/index.html','utf8').match(/src="([^"]+\.js)"/)[1];
const browser=await chromium.launch({channel:'msedge'}),reports=[];
const paragraphs=Array.from({length:60},(_,i)=>`Đoạn ${i}. `+'Nội dung tổng hợp để kiểm tra vị trí đọc hiện tại. '.repeat(8));
try{for(const mobile of [false,true]){
 const context=await browser.newContext({...mobile?devices['Pixel 7']:{viewport:{width:869,height:835}},serviceWorkers:'block'});
 let release;const gate=new Promise(resolve=>release=resolve);let calls=0,audioCalls=0;
 try{
  await context.route(origin+'/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic smoke'}}));
  await context.route('https://ottsy.weilbyte.dev/api/generation',r=>{audioCalls++;return r.fulfill({status:503});});
  await context.route(origin+'/api/ai/translate',async r=>{const input=r.request().postDataJSON(),next=input.text.startsWith('乙');calls++;if(next)await gate;return r.fulfill({json:{result:next?'Bản dịch chương sau đã sẵn sàng.':paragraphs.join('\n'),model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:1}}).catch(()=>{});});
  const page=await context.newPage();await page.goto(origin);await expect(page.locator('script[type=module]')).toHaveAttribute('src',bundle);
  await page.evaluate(()=>new Promise((resolve,reject)=>{
   const r=indexedDB.open('thu-phong-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{
    const db=r.result,tx=db.transaction(['books','chapters','progress','settings'],'readwrite');
    tx.objectStore('books').put({id:'bookmark-smoke',title:'Synthetic reading bookmark',author:'',status:'ready',chapterCount:2,charCount:360,createdAt:1,updatedAt:1});
    for(const [i,id] of ['bookmark-a','bookmark-b'].entries())tx.objectStore('chapters').put({id,bookId:'bookmark-smoke',title:'Chương '+(i+1),text:(i?'乙':'甲').repeat(180),revision:1,order:i,sourceId:''});
    // A historical completion bookmark must yield when the user opens chapter A.
    tx.objectStore('progress').put({bookId:'bookmark-smoke',chapterId:'bookmark-b',paragraph:0,offset:0,revision:1,mode:'ai',updatedAt:Date.now()+60000});
    tx.objectStore('settings').put({key:'reader-options',value:{preloadAi:true,autoNext:false}});
    tx.objectStore('settings').put({key:'ai-book-settings:bookmark-smoke',value:{systemPrompt:'Dịch tiếng Việt.',userPromptTemplate:'{{name}}{{text}}',temperature:0,splitParts:false}});
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
   };
  }));
  const progress=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('progress'),get=tx.objectStore('progress').get('bookmark-smoke');get.onsuccess=()=>resolve(get.result);tx.oncomplete=()=>db.close();};}));
  await page.goto(origin+'/read/bookmark-smoke/bookmark-a');await expect(page.locator('script[type=module]')).toHaveAttribute('src',bundle);
  await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Đoạn 59.');
  await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','loading');
  await page.mouse.wheel(0,100);
  await page.locator('[data-paragraph="20"]').evaluate(e=>e.scrollIntoView({block:'start'}));
  await expect.poll(async()=> (await progress())?.paragraph).toBeGreaterThanOrEqual(20);
  release();await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','ready');
  expect(await progress()).toMatchObject({chapterId:'bookmark-a',mode:'ai',reading:true});expect((await progress()).paragraph).toBeGreaterThanOrEqual(20);
  const saved=await progress();await page.screenshot({path:`${dir}/production-${mobile?'mobile':'desktop'}.png`});
  await page.goto(origin+'/book/bookmark-smoke');await expect(page.locator('.story-progress')).toContainText('Chương 1');
  await page.getByRole('button',{name:'Đọc tiếp',exact:true}).click();await expect(page).toHaveURL(/\/bookmark-a$/);
  const restored=async()=>{const box=await page.locator(`[data-paragraph="${saved.paragraph}"]`).boundingBox();return !!box&&box.y>=-5&&box.y<300;};
  await expect.poll(restored).toBe(true);await page.reload();await expect(page.locator('script[type=module]')).toHaveAttribute('src',bundle);await expect.poll(restored).toBe(true);
  expect(calls).toBe(2);expect(audioCalls).toBe(0);reports.push({mobile,prewarmKeptCurrentChapter:true,paragraph:saved.paragraph,readNextRestored:true,nativeReloadRestored:true,aiCalls:calls,realAi:false,cloudWrites:0,autoplay:false});
 }finally{release();await context.close();}
}const report={status:'PASS',bundle,syntheticOnly:true,reports};writeFileSync(dir+'/production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await browser.close();}
