import {chromium,devices,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const origin='https://thu-phong-private.pages.dev',dir='.dsh-tmp/numeric-route-production';mkdirSync(dir,{recursive:true});
const bundle=readFileSync('dist/index.html','utf8').match(/src="([^"]+\.js)"/)[1];
const book='a0000000-0000-4000-8000-000000000001',ids=['a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003'];
const short=id=>Buffer.from(id.replaceAll('-',''),'hex').toString('base64url');
const path=id=>`/r/31823/${id===ids[0]?1:2}`;
const browser=await chromium.launch({channel:'msedge'}),reports=[];
try{for(const mobile of [false,true]){
 const context=await browser.newContext({...mobile?devices['Pixel 7']:{viewport:{width:869,height:835}},serviceWorkers:'block'});
 try{
  let aiCalls=0;await context.route(origin+'/api/**',r=>{if(r.request().url().includes('/api/ai/translate'))aiCalls++;return r.fulfill({status:503});});
  await context.route(origin+'/api/reader-route?**',r=>r.fulfill({json:{bookId:book,code:31823}}));
  const page=await context.newPage();await page.goto(origin);await expect(page.locator('script[type=module]')).toHaveAttribute('src',bundle);
  await page.evaluate(({book,ids})=>new Promise((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction(['books','chapters','settings','progress'],'readwrite');
   tx.objectStore('books').put({id:book,title:'Truyện kiểm tra URL',author:'',status:'ready',chapterCount:2,charCount:60,createdAt:1,updatedAt:1});
   ids.forEach((id,i)=>tx.objectStore('chapters').put({id,bookId:book,text:`Nội dung kiểm tra chương ${i+1}.`,title:`Chương ${1429+i}`,order:1425+i,revision:1,sourceId:''}));
   tx.objectStore('settings').put({key:'reader-options',value:{preloadAi:false,autoNext:false,mode:'original'}});
   tx.objectStore('progress').put({bookId:book,chapterId:ids[1],revision:1,paragraph:0,offset:0,updatedAt:1});
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);}),{book,ids});
  await page.goto(`${origin}/read/${book}/${ids[0]}`);await expect(page).toHaveURL(origin+path(ids[0]));await expect(page.locator('.prose')).toContainText('Nội dung kiểm tra chương 1.');
  await page.getByRole('button',{name:'Chương sau →',exact:true}).first().click();await expect(page).toHaveURL(origin+path(ids[1]));
  await page.reload();await expect(page).toHaveURL(origin+path(ids[1]));await expect(page.locator('.prose')).toContainText('Nội dung kiểm tra chương 2.');
  await page.goBack();await expect(page).toHaveURL(origin+path(ids[0]));await expect(page.locator('.prose')).toContainText('Nội dung kiểm tra chương 1.');
  await page.goForward();await expect(page).toHaveURL(origin+path(ids[1]));await expect(page.locator('.prose')).toContainText('Nội dung kiểm tra chương 2.');expect(aiCalls).toBe(0);
  reports.push({mobile,legacyRedirect:true,reload:true,backForward:true,numericPath:path(ids[0]),pathLength:path(ids[0]).length,aiCalls,cloudWrites:0,synthetic:true});
 }finally{await context.close();}
}writeFileSync(dir+'/report.json',JSON.stringify({bundle,reports},null,2));console.log(JSON.stringify({status:'PASS',bundle,reports}));}finally{await browser.close();}
