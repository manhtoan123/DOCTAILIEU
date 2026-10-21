import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';

const origin='https://thu-phong-private.pages.dev';
const id=randomUUID(),album=`Album thử ${id.slice(0,8)}`,title=`Truyện thử ${id.slice(0,8)}`;
const texts=['第1章 开始\n你好。','第2章 继续\n你好。'];
const snapshot={format:'thu-phong-cloud',version:1,book:{id,title,author:'',album,createdAt:Date.now(),updatedAt:Date.now(),status:'ready',chapterCount:2,charCount:texts.reduce((sum,text)=>sum+text.length,0)},chapters:texts.map((text,order)=>({id:randomUUID(),bookId:id,order,title:`第${order+1}章`,text,revision:1,sourceId:''})),names:[{key:'你好',value:'Xin chào'}]};
const bytes=Buffer.from(JSON.stringify(snapshot)),sha256=createHash('sha256').update(bytes).digest('hex');
const request=(path,options={})=>fetch(`${origin}/api/cloud/${path}`,{...options,headers:{Origin:origin,...options.headers},signal:AbortSignal.timeout(120000)});
let uploaded=false,browser;
try{
  const html=await fetch(origin).then(response=>response.text());
  if(html.trim()!==readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').trim())throw new Error('Production HTML differs from current build.');
  const response=await request(`books/${id}`,{method:'PUT',headers:{'Content-Type':'application/json','X-Book-Title':encodeURIComponent(title),'X-Book-Album':encodeURIComponent(album),'X-Content-SHA256':sha256},body:bytes});
  if(response.status!==201)throw new Error(`Synthetic Album upload failed: ${response.status}`);
  uploaded=true;
  const downloaded=await request(`books/${id}`),raw=Buffer.from(await downloaded.arrayBuffer());
  if(downloaded.status!==200||createHash('sha256').update(raw).digest('hex')!==sha256||JSON.parse(raw).book.album!==album)throw new Error('Album snapshot verification failed.');
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:1280,height:800},{width:522,height:651}]){
    const context=await browser.newContext({viewport});
    // Isolate this Album smoke from the 53 MB dictionary cold-start test, which
    // has its own production script. Book-specific Names still convert real Chinese.
    await context.route(`${origin}/api/cloud/dictionaries`,route=>route.fulfill({json:{version:1,dictionaries:[]}}));
    const page=await context.newPage();await page.goto(origin);
    const select=page.getByLabel('Lọc Album',{exact:true});
    await expect(select.locator('option').filter({hasText:album})).toHaveCount(1,{timeout:30000});
    await select.selectOption(`album:${album}`);await expect(page.locator('.book-card')).toHaveCount(1);
    await page.getByRole('button',{name:'Mở sách →',exact:true}).click();
    await expect(page.locator('.prose')).toContainText('Xin chào',{timeout:30000});
    const persisted=await page.evaluate(async bookId=>{
      return new Promise((resolve,reject)=>{
        const open=indexedDB.open('thu-phong-v1');open.onerror=()=>reject(open.error);
        open.onsuccess=()=>{const db=open.result,tx=db.transaction(['books','chapters'],'readonly');let book,chapters;
          const get=tx.objectStore('books').get(bookId);get.onsuccess=()=>{book=get.result;};
          const list=tx.objectStore('chapters').index('bookId').getAll(bookId);list.onsuccess=()=>{chapters=list.result;};
          tx.oncomplete=()=>{db.close();resolve({album:book?.album,count:book?.chapterCount,text:chapters?.sort((a,b)=>a.order-b.order).map(c=>c.text).join('')});};tx.onerror=()=>reject(tx.error);
        };
      });
    },id);
    expect(persisted).toEqual({album,count:2,text:texts.join('')});
    await page.reload();await page.getByLabel('Lọc Album',{exact:true}).selectOption(`album:${album}`);
    await expect(page.locator('.book-card')).toHaveCount(1);await page.getByRole('button',{name:'Mở sách →',exact:true}).click();
    await expect(page.locator('.prose')).toContainText('Xin chào',{timeout:30000});
    if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error('Horizontal overflow.');
    await context.close();
  }
  console.log('Canonical build: Album upload201/catalog/filter/two Chinese chapters/Name Convert/IndexedDB/reload passed on fresh Windows desktop/mobile viewports. Dictionary API isolated; no Android hardware claim.');
}finally{
  if(browser)await browser.close();
  if(uploaded){const deleted=await request(`books/${id}`,{method:'DELETE'});if(deleted.status!==200)throw new Error('Synthetic Album cleanup failed.');console.log('Synthetic fixture deleted through API; tombstone/reservation retained.');}
}
