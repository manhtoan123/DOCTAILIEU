import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const origin=process.env.CHAPTER_SMOKE_ORIGIN||'https://thu-phong-private.pages.dev';
const localHtml=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const asset=localHtml.match(/src="([^"]+\.js)"/)[1];
const remoteHtml=await (await fetch(origin)).text();
if(!remoteHtml.includes(asset))throw new Error('Canonical site has not served the built bundle yet.');
const browser=await chromium.launch({channel:'msedge'});
try{
  for(const viewport of [{width:1280,height:800},{width:412,height:915}]){
    const context=await browser.newContext({viewport});
    await context.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
    const source='第1章\n第1章 起点\n'+'文🙂'.repeat(2000)+'\n第1章 起点\n重复标记保留。第2章 终点\n完成';
    await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles({name:'Synthetic_chapter.txt',mimeType:'text/plain',buffer:Buffer.from(source)});
    const preview=page.getByRole('region',{name:'Xem trước chia chương'});
    await expect(preview).toContainText('2 chương');
    await page.getByLabel('Giới hạn số chữ 1 chương',{exact:true}).selectOption('4000');
    await expect(preview).toContainText('3 chương');
    await preview.locator('summary').click();await expect(preview.locator('tbody tr')).toHaveCount(3);
    await page.screenshot({path:`test-results/chapter-production-${viewport.width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
    const data=await page.evaluate(async()=>{
      const store=await new Promise((resolve,reject)=>{const request=indexedDB.open('thu-phong-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      async function rows(name){return new Promise((resolve,reject)=>{const req=store.transaction(name).objectStore(name).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
      try{return {books:await rows('books'),chapters:await rows('chapters'),sources:await Promise.all((await rows('sources')).map(async s=>await s.blob.text()))};}finally{store.close();}
    });
    expect(data.books).toHaveLength(1);expect(data.books[0].chapterCount).toBe(3);
    expect(data.chapters.every(c=>c.text.length<=4000)).toBe(true);
    expect(data.chapters.sort((a,b)=>a.order-b.order).map(c=>c.text).join('')).toBe(source);
    expect(data.sources).toEqual([source]);
    await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('.prose')).toContainText('第1章');
    await page.reload();await expect(page.locator('.reader-book-heading h1')).toHaveText('Synthetic chapter');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({origin,asset,viewport,previewCount:3,importCount:3,sourcePreserved:true,reload:true,cloudIsolated:true}));
    await context.close();
  }
}finally{await browser.close();}
