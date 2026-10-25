import {chromium,devices,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const origin='https://thu-phong-private.pages.dev',dir='.dsh-tmp/album-names';mkdirSync(dir,{recursive:true});
const bundle=readFileSync('dist/index.html','utf8').match(/src="([^"]+\.js)"/)[1],reports=[];
const browser=await chromium.launch({channel:'msedge'});
try{for(const mobile of [false,true]){
 const context=await browser.newContext({...mobile?devices['Pixel 7']:{viewport:{width:869,height:835}},serviceWorkers:'block'});
 try{
  let aiCalls=0;await context.route(origin+'/api/**',r=>{if(r.request().url().includes('/api/ai/translate'))aiCalls++;return r.fulfill({status:503});});
  const page=await context.newPage();page.setDefaultTimeout(20000);await page.goto(origin);await expect(page.locator('script[type=module]')).toHaveAttribute('src',bundle);
  await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('thu-phong-v1');request.onsuccess=()=>{const db=request.result,tx=db.transaction(['books','chapters','settings','names','dictionaries'],'readwrite');
   ['a','b','c'].forEach((id,i)=>{tx.objectStore('books').put({id,title:'Truyện giả '+id,album:i===2?'Tác giả khác':'Tác giả/Series '+id,author:'',status:'ready',chapterCount:1,charCount:4,createdAt:1,updatedAt:1});tx.objectStore('chapters').put({id:id+'-chapter',bookId:id,title:'Chương 1',text:'山门。水。',order:0,revision:1,sourceId:''});});
   tx.objectStore('names').put({id:'old-a',bookId:'a',key:'山门',value:'Cổng A'});tx.objectStore('names').put({id:'old-b',bookId:'b',key:'山门',value:'Cổng B'});tx.objectStore('names').put({id:'water',bookId:'a',key:'水',value:'Nước A'});
   tx.objectStore('dictionaries').put({kind:'vp',name:'Synthetic VP',blob:new Blob(['山门=cổng núi\n水=nước']),sha256:'a'.repeat(64),updatedAt:1});tx.objectStore('settings').put({key:'reader-options',value:{preloadAi:false,autoNext:false,mode:'original'}});
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);}));
  await page.goto(origin+'/settings/names/a');const panel=page.getByRole('region',{name:'Name riêng',exact:true});await expect(panel.getByLabel('Kho Name',{exact:true}).locator('option')).toHaveCount(2);await expect(panel).toContainText('Dùng chung cho 2 truyện');await expect(panel.getByLabel('Nội dung Name List')).toBeHidden();
  await panel.getByRole('button',{name:'Sửa Name 山门',exact:true}).click();await panel.getByLabel('Tên Việt của Name').fill('Cổng chung');await panel.getByRole('button',{name:'Lưu tên',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Đã lưu');
  await page.reload();await expect(page.getByRole('button',{name:'Sửa Name 山门',exact:true})).toContainText('Cổng chung');
  await page.goto(origin+'/read/b/b-chapter');await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng chung. Nước A.');
  const legacy=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('names'),q=tx.objectStore('names').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close();};r.onerror=()=>reject(r.error);}));expect(legacy).toEqual(expect.arrayContaining([expect.objectContaining({id:'old-a',value:'Cổng A'}),expect.objectContaining({id:'old-b',value:'Cổng B'})]));
  await page.goto(origin+'/settings/names/a');if(mobile)await page.setViewportSize({width:320,height:700});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:dir+'/production-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});expect(aiCalls).toBe(0);
  reports.push({mobile,sharedAuthorSeries:true,legacyPreserved:true,reload:true,compactSettings:true,convertSibling:true,aiCalls,cloudWrites:0,synthetic:true});
 }finally{await context.close();}
}writeFileSync(dir+'/production-report.json',JSON.stringify({bundle,reports},null,2));console.log(JSON.stringify({status:'PASS',bundle,reports}));}finally{await browser.close();}
