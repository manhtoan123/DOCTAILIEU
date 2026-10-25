import {chromium,devices,expect} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';

const origin=process.env.SMOKE_ORIGIN||'https://thu-phong-private.pages.dev';
const dir='.dsh-tmp/ai-auto-recovery';mkdirSync(dir,{recursive:true});
const expected=readFileSync('dist/index.html','utf8').trim();
expect((await(await fetch(origin)).text()).trim()).toBe(expected);
const browser=await chromium.launch({channel:'msedge'}),reports=[];
try{
 for(const mobile of [false,true])for(const stop of [false,true]){
  const context=await browser.newContext({...mobile?devices['Pixel 7']:{viewport:{width:869,height:835}},serviceWorkers:'block'});
  try{
   let calls=0,healthy=false;
   await context.route(origin+'/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic smoke'}}));
   await context.route(origin+'/api/ai/translate',r=>{
    calls++;return healthy?r.fulfill({json:{result:'Bản dịch đã tự phục hồi hoàn tất.',model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}})
     :r.fulfill({status:429,headers:{'Retry-After':'300'},json:{error:'ai_rate_limited'}});
   });
   const page=await context.newPage();page.setDefaultTimeout(20000);await page.goto(origin);
   await page.evaluate(async()=>{await new Promise((resolve,reject)=>{
    const request=indexedDB.open('thu-phong-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{
     const db=request.result,tx=db.transaction(['books','chapters','settings'],'readwrite');
     tx.objectStore('books').put({id:'auto-recovery-smoke',title:'Synthetic AI recovery',author:'',status:'ready',chapterCount:1,charCount:8,createdAt:1,updatedAt:1});
     tx.objectStore('chapters').put({id:'auto-recovery-chapter',bookId:'auto-recovery-smoke',title:'Chương thử',text:'你好，这是合成测试。',revision:1,order:0,sourceId:''});
     tx.objectStore('settings').put({key:'reader-options',value:{preloadAi:false,autoNext:false}});
     tx.objectStore('settings').put({key:'ai-book-settings:auto-recovery-smoke',value:{systemPrompt:'Dịch sang tiếng Việt.',userPromptTemplate:'{{text}}',temperature:0,splitParts:false}});
     tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
   });});
   await page.goto(origin+'/read/auto-recovery-smoke/auto-recovery-chapter');
   await expect(page.locator('script[type=module]')).toHaveAttribute('src',expected.match(/src="([^"]+\.js)"/)[1]);await page.clock.install();
   await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
   await expect(page.locator('.reader-convert-status').filter({hasText:'Tự thử lại sau'}).first()).toBeVisible();
   const before=calls;healthy=true;
   if(stop){
    await page.getByRole('button',{name:'Dừng dịch',exact:true}).first().click();await page.clock.fastForward(900000);expect(calls).toBe(before);
    await expect(page.locator('.reader-convert-status').filter({hasText:'Đã dừng dịch'}).first()).toBeVisible();
   }else{
    await page.clock.fastForward(299000);expect(calls).toBe(before);
    await context.setOffline(true);await page.clock.fastForward(2000);expect(calls).toBe(before);
    await context.setOffline(false);await page.clock.fastForward(500);
    await expect(page.locator('.prose')).toContainText('Bản dịch đã tự phục hồi hoàn tất.');expect(calls).toBe(before+1);
   }
   const raw=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('chapters'),get=tx.objectStore('chapters').get('auto-recovery-chapter');get.onsuccess=()=>resolve(get.result.text);tx.oncomplete=()=>db.close();};}));
   expect(raw).toBe('你好，这是合成测试。');await page.screenshot({path:`${dir}/production-${mobile?'mobile':'desktop'}-${stop?'stop':'recovered'}.png`});
   reports.push({mobile,stop,calls,before,rawPreserved:true,realAiRequests:0,cloudWrites:0,offlineHeld:!stop});
  }finally{await context.close();}
 }
 const report={status:'PASS',syntheticOnly:true,bundle:expected.match(/src="([^"]+\.js)"/)[1],reports};
 writeFileSync(dir+'/production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
