import {chromium,devices,expect} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const origin=process.env.SMOKE_ORIGIN||'https://thu-phong-private.pages.dev',dir='.dsh-tmp/reader-division-production';mkdirSync(dir,{recursive:true});
const bundle=readFileSync('dist/index.html','utf8').match(/src="([^"]+\.js)"/)[1],browser=await chromium.launch({channel:'msedge'}),reports=[];
try{for(const mobile of [false,true]){
 const context=await browser.newContext({...mobile?devices['Pixel 7']:{viewport:{width:869,height:835}},serviceWorkers:'block'});
 try{
  let aiCalls=0;
  // All application API routes are mocked: this context cannot modify cloud/user data.
  await context.route(origin+'/api/**',r=>r.fulfill({status:503}));
  await context.route(origin+'/api/ai/translate',r=>{aiCalls++;return aiCalls===1?r.fulfill({status:502,headers:{'x-ai-failure-reason':'output_limit'},json:{error:'ai_incomplete_result'}}):r.fulfill({json:{result:'Nội dung kiểm tra đã dịch đủ ♾',model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
  const page=await context.newPage();await page.goto(origin);await expect(page.locator('script[type=module]')).toHaveAttribute('src',bundle);
  await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction(['books','chapters','settings'],'readwrite');
   tx.objectStore('books').put({id:'division-smoke',title:'Truyện kiểm tra tổng hợp',author:'',status:'ready',chapterCount:130,charCount:104000,createdAt:1,updatedAt:1});
   for(let i=1;i<=130;i++)tx.objectStore('chapters').put({id:'division-smoke-'+i,bookId:'division-smoke',text:'甲'.repeat(800),revision:1,title:`Chương ${i}: Vị trí đang đọc`,order:i,sourceId:''});
   tx.objectStore('settings').put({key:'reader-options',value:{preloadAi:false,autoNext:false}});
   tx.objectStore('settings').put({key:'ai-book-settings:division-smoke',value:{splitParts:false}});
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);}));
  await page.goto(origin+'/read/division-smoke/division-smoke-123');await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung kiểm tra đã dịch đủ');await page.locator('.ai-trigger').click();await expect(page.getByRole('dialog',{name:'Dịch AI',exact:true}).locator('.ai-model-row').filter({hasText:'Chương này'})).toContainText('2/2 phần hoàn tất');await page.getByRole('button',{name:'Ẩn Dịch AI',exact:true}).click();
  await page.reload();await expect(page.locator('script[type=module]')).toHaveAttribute('src',bundle);await page.locator('.ai-trigger').click();const panel=page.getByRole('dialog',{name:'Dịch AI',exact:true}),row=panel.locator('.ai-model-row').filter({hasText:'Chương này'});
  await expect(row).toContainText('2/2 phần hoàn tất');await expect(row).toContainText('AI trả bản dịch bị cắt');await expect(panel.locator('.ai-compact-footer')).toHaveCount(0);expect(aiCalls).toBe(3);
  await page.screenshot({path:`${dir}/panel-${mobile?'mobile':'desktop'}.png`});await panel.getByRole('button',{name:'Ẩn Dịch AI',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Điều hướng chương đầu trang'}),bounds=await nav.getByRole('button',{name:'Chương sau →'}).boundingBox();expect(bounds.height).toBeGreaterThanOrEqual(48);expect(bounds.width).toBeGreaterThan(page.viewportSize().width/4);
  await nav.getByRole('button',{name:'☷ Mục lục',exact:true}).click();const toc=page.getByRole('dialog',{name:'Mục lục',exact:true}),current=toc.locator('[aria-current="page"]');await expect(current).toContainText('Chương 123');await expect(current).toBeInViewport();await expect(toc.locator('.toc button').first()).toContainText('Chương 121');await expect(toc.locator('.toc-reading')).toContainText('Chương 123');
  await page.screenshot({path:`${dir}/toc-${mobile?'mobile':'desktop'}.png`});
  reports.push({mobile,parts:2,reason:'output_limit',cacheReload:true,ramFacts:true,aiCalls,sourceSynthetic:true,cloudWrites:0,tocCurrent:123,navigationTapTarget:bounds});
 }finally{await context.close();}
}writeFileSync(dir+'/report.json',JSON.stringify({bundle,reports},null,2));console.log(JSON.stringify({status:'PASS',bundle,reports}));}finally{await browser.close();}
