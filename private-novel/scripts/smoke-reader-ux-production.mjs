import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
const origin='https://thu-phong-private.pages.dev',id=randomUUID(),album=`UX thử ${id.slice(0,8)}`,title=`Reader UX ${id.slice(0,8)}`;
const text=Array(40).fill('你好。山门。').join('\n');
const snapshot={format:'thu-phong-cloud',version:1,book:{id,title,author:'',album,createdAt:Date.now(),updatedAt:Date.now(),status:'ready',chapterCount:1,charCount:text.length},chapters:[{id:randomUUID(),bookId:id,order:0,title:'Chương thử UI',text,revision:1,sourceId:''}],names:[{key:'你好',value:'Xin chào'},{key:'山门',value:'Cổng núi'}]};
const bytes=Buffer.from(JSON.stringify(snapshot)),sha=createHash('sha256').update(bytes).digest('hex');
const request=(path,options={})=>fetch(`${origin}/api/cloud/${path}`,{...options,headers:{Origin:origin,...options.headers},signal:AbortSignal.timeout(120000)});
let uploaded=false,browser;
try{
  const html=await fetch(origin).then(r=>r.text());if(html.trim()!==readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').trim())throw new Error('Canonical HTML does not match current build');
  const put=await request(`books/${id}`,{method:'PUT',headers:{'Content-Type':'application/json','X-Book-Title':encodeURIComponent(title),'X-Book-Album':encodeURIComponent(album),'X-Content-SHA256':sha},body:bytes});if(put.status!==201)throw new Error(`Synthetic upload ${put.status}`);uploaded=true;
  browser=await chromium.launch({channel:'msedge'});
  for(const viewport of [{width:1280,height:800},{width:522,height:524}]){
    const context=await browser.newContext({viewport});
    // UI/Names smoke only; default 53MB dictionaries have a separate smoke.
    await context.route(`${origin}/api/cloud/dictionaries`,route=>route.fulfill({json:{version:1,dictionaries:[]}}));
    const page=await context.newPage();await page.goto(origin);await expect(page.getByLabel('Lọc Album').locator('option').filter({hasText:album})).toHaveCount(1,{timeout:30000});await page.getByLabel('Lọc Album').selectOption(`album:${album}`);
    await expect(page.locator('.book-detail h3 button')).toHaveCSS('font-size',viewport.width<=700?'18px':'20px');
    await page.getByRole('button',{name:'Mở sách →',exact:true}).click();await expect(page.locator('.prose')).toContainText('Xin chào',{timeout:30000});await expect(page.locator('.prose')).toHaveCSS('font-size','19px');await expect(page.locator('.prose')).toHaveCSS('max-width','760px');
    await page.evaluate(()=>{window.__uxBlank=false;window.__uxObserver=new MutationObserver(()=>{if(!document.querySelector('.prose [data-paragraph]'))window.__uxBlank=true;});window.__uxObserver.observe(document.querySelector('.prose'),{subtree:true,childList:true});});
    await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await expect(page.locator('.reader-display-advanced')).not.toHaveAttribute('open','');await page.getByRole('button',{name:'✎ Name',exact:true}).click();
    const panel=page.getByRole('dialog',{name:'Name riêng của truyện'});await expect(panel.getByLabel('Tìm Name',{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'Sửa Name 你好',exact:true})).toBeVisible();await expect(panel.getByLabel('Nội dung Name List')).toBeHidden();await expect(panel.getByRole('button',{name:'▶ Chạy',exact:true})).toHaveCount(0);
    const panelHeight=await panel.evaluate(el=>el.getBoundingClientRect().height);
    await panel.getByRole('button',{name:'Sửa Name 你好',exact:true}).click();await panel.getByLabel('Tên Việt của Name').fill('Xin chào mới');await panel.getByRole('button',{name:'Lưu tên',exact:true}).click();await expect(page.locator('.prose')).toContainText('Xin chào mới');expect(await page.evaluate(()=>window.__uxBlank)).toBe(false);
    await expect(panel.getByRole('button',{name:'Lưu tên',exact:true})).toBeEnabled();mkdirSync('test-results',{recursive:true});await page.screenshot({path:`test-results/reader-ux-name-production-${viewport.width}.png`});
    await panel.getByRole('button',{name:'Ẩn Name riêng của truyện'}).click();await page.reload();await page.getByLabel('Lọc Album').selectOption(`album:${album}`);await page.getByRole('button',{name:'Mở sách →',exact:true}).click();await expect(page.locator('.prose')).toContainText('Xin chào mới');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);mkdirSync('test-results',{recursive:true});await page.screenshot({path:`test-results/reader-ux-production-${viewport.width}.png`});
    console.log(JSON.stringify({viewport,titleFont:viewport.width<=700?18:20,readerFont:19,panelHeight,convertChinese:true,noBlank:true,nameReload:true}));await context.close();
  }
}finally{
  if(browser)await browser.close();if(uploaded){const response=await request(`books/${id}`,{method:'DELETE'});if(response.status!==200)throw new Error('Synthetic cleanup failed');console.log('Synthetic UX fixture deleted; tombstone/reservation retained. No real library modified.');}
}
