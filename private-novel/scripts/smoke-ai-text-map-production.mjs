import {chromium,devices,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const origin='https://thu-phong-private.pages.dev',dir='.dsh-tmp/ai-text-map';
const bundle=readFileSync('dist/index.html','utf8').match(/src="([^"]+\.js)"/)[1];
const browser=await chromium.launch({channel:'msedge'}),reports=[];
try{for(const mobile of [false,true]){
 const context=await browser.newContext({...mobile?devices['Pixel 7']:{viewport:{width:869,height:835}},serviceWorkers:'block'});
 try{
  const source='甲\n乙\n丙\n林儿打开门。\n戊\n己',first='Nội dung ba đoạn đầu đã được gộp thành một đoạn.',result=first+'\nLâm Nhi mở cửa.\nĐoạn sau.\nKết thúc.';let aiCalls=0;const excerpts=[];
  await context.route(origin+'/api/**',r=>r.fulfill({status:503}));
  await context.route(origin+'/api/ai/translate',r=>{aiCalls++;return r.fulfill({json:{result,model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
  await context.route(origin+'/api/convert/name',r=>{
   if(r.request().method()==='GET')return r.fulfill({json:{version:'synthetic',dictionaries:[{kind:'vp',sha256:'a'.repeat(64)}]}});
   const {text}=r.request().postDataJSON();excerpts.push(text);const meaning={hanviet:'',meanings:[]},token={...meaning,source:text,sourceStart:0,sourceEnd:text.length,targetText:'Lâm Nhi mở cửa.',type:'vp'};
   return r.fulfill({json:{version:'synthetic',tokens:[token],lookup:meaning,lookups:[{source:text,...meaning}]}});
  });
  const page=await context.newPage();await page.goto(origin);await expect(page.locator('script[type=module]')).toHaveAttribute('src',bundle);
  await page.evaluate(source=>new Promise((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction(['books','chapters','settings'],'readwrite');
   tx.objectStore('books').put({id:'map-smoke',title:'Synthetic mapping',author:'',status:'ready',chapterCount:1,charCount:source.length,createdAt:1,updatedAt:1});
   tx.objectStore('chapters').put({id:'map-a',bookId:'map-smoke',text:source,revision:1,title:'Chương 1',order:0,sourceId:''});
   tx.objectStore('settings').put({key:'reader-options',value:{preloadAi:false,autoNext:false}});
   tx.objectStore('settings').put({key:'ai-book-settings:map-smoke',value:{splitParts:false}});
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  };r.onerror=()=>reject(r.error);}),source);
  await page.goto(origin+'/read/map-smoke/map-a');await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lâm Nhi mở cửa.');
  // Inject only synthetic optional metadata. Real multipart generation is covered by unit/E2E.
  await page.evaluate(({source,first,result})=>new Promise((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings'),rows=store.getAll();rows.onsuccess=()=>{const row=rows.result.find(v=>v.key.startsWith('ai-reading-cache:v1:')&&v.value.bookId==='map-smoke');if(!row){tx.abort();return;}row.value.response.textMap={version:1,sourceLength:source.length,spans:[{sourceStart:0,sourceEnd:6,translatedStart:0,translatedEnd:first.length},{sourceStart:6,sourceEnd:source.length,translatedStart:first.length+1,translatedEnd:result.length}]};store.put(row);};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(Error('synthetic cache unavailable'));};r.onerror=()=>reject(r.error);}),{source,first,result});
  await page.reload();await expect(page.locator('script[type=module]')).toHaveAttribute('src',bundle);
  const paragraph=page.locator('.prose [data-paragraph]').filter({hasText:'Lâm Nhi mở cửa.'});await expect(paragraph).toBeVisible();await paragraph.dblclick();
  const picker=page.getByRole('dialog',{name:'Chọn cụm từ',exact:true});await expect(picker.locator('[data-source="林儿打开门。"]')).toBeVisible();expect(excerpts.at(-1)).toBe('林儿打开门。');expect(aiCalls).toBe(1);
  await page.screenshot({path:`${dir}/production-${mobile?'mobile':'desktop'}.png`});reports.push({mobile,correctSourceExcerpt:true,cacheReload:true,extraAiCalls:0,syntheticOnly:true,cloudWrites:0});
 }finally{await context.close();}
}writeFileSync(dir+'/production.json',JSON.stringify({bundle,reports},null,2));console.log(JSON.stringify({status:'PASS',bundle,reports}));}finally{await browser.close();}
