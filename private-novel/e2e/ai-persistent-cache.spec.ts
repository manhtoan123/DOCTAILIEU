import {test,expect,type Page} from '@playwright/test';
const book='persistent-book',chapter='persistent-chapter',raw='第1章\n林儿走到山门。';
async function seed(page:Page){
  await page.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:r.request().url().includes('deletions')?{ids:[],cursor:null}:{books:[],cursor:null}}));
  await page.goto('/');await page.evaluate(async({book,chapter,raw})=>{
    const {db}=await import('/src/core/db.ts');
    await db.books.put({id:book,title:'AI cache fixture',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:raw.length});
    await db.chapters.put({id:chapter,bookId:book,title:'第1章',order:0,text:raw,revision:1,sourceId:''});
    await db.names.put({id:'cache-name',bookId:book,key:'林儿',value:'Lâm Nhi'});
    await db.progress.put({bookId:book,chapterId:chapter,revision:1,paragraph:0,offset:0,updatedAt:1});
  },{book,chapter,raw});await page.goto(`/read/${book}/${chapter}`);
}
const result=(text:string,model:string)=>({result:text,model,finishReason:'STOP',inputTokens:10,outputTokens:10});
async function cacheCount(page:Page){return page.evaluate(async()=>{const{db}=await import('/src/core/db.ts');return db.settings.where('key').startsWith('ai-reading-cache:v1:').count();});}
test('completed AI survives shelf remount and reload without another network translation or RAW/progress writes',async({page})=>{
  let calls=0;await page.route('**/api/ai/translate',r=>{calls++;return r.fulfill({json:result('Lâm Nhi đến sơn môn.',r.request().postDataJSON().model)});});
  await seed(page);const before=await page.evaluate(async()=>{const{db}=await import('/src/core/db.ts');return {chapter:await db.chapters.get('persistent-chapter'),progress:await db.progress.get('persistent-book')};});
  await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lâm Nhi đến sơn môn.');await expect.poll(()=>cacheCount(page)).toBe(1);
  await page.getByRole('link',{name:'← Tủ sách',exact:true}).click();await page.getByRole('link',{name:'Mở sách →',exact:true}).click();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lâm Nhi đến sơn môn.');expect(calls).toBe(1);
  await page.reload();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lâm Nhi đến sơn môn.');expect(calls).toBe(1);
  const after=await page.evaluate(async()=>{const{db}=await import('/src/core/db.ts');return {chapter:await db.chapters.get('persistent-chapter'),progress:await db.progress.get('persistent-book')};});
  expect(after.chapter).toEqual(before.chapter);expect(after.progress?.paragraph).toBe(before.progress?.paragraph);
});
test('changed matched Name misses disk cache in the next session while an unused Name does not trigger translation',async({page})=>{
  let calls=0;await page.route('**/api/ai/translate',r=>{calls++;const req=r.request().postDataJSON();return r.fulfill({json:result(`${req.names['林儿']} đến sơn môn.`,req.model)});});
  await seed(page);await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lâm Nhi đến');
  await page.evaluate(async()=>{const{db}=await import('/src/core/db.ts');await db.names.update('cache-name',{value:'Tên Mới'});});await expect(page.locator('.prose')).toContainText('Lâm Nhi đến');expect(calls).toBe(1);await page.reload();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Tên Mới đến');expect(calls).toBe(2);expect(await cacheCount(page)).toBe(2);
  await page.evaluate(async()=>{const{db}=await import('/src/core/db.ts');await db.names.put({id:'unused-name',bookId:'persistent-book',key:'未出现',value:'Unused'});});
  await page.reload();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Tên Mới đến');expect(calls).toBe(2);
});
test('cancelled translation cannot publish a late disk cache entry or replace RAW',async({page})=>{
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/ai/translate',async r=>{await held;await r.fulfill({json:result('Kết quả muộn.',r.request().postDataJSON().model)}).catch(()=>{});});
  await seed(page);const requested=page.waitForRequest('**/api/ai/translate');await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await requested;
  await page.getByRole('button',{name:'Bản gốc',exact:true}).click();release();await expect(page.locator('.prose')).toContainText('林儿走到山门');
  await page.waitForTimeout(300);expect(await cacheCount(page)).toBe(0);await expect(page.locator('.prose')).not.toContainText('Kết quả muộn');
});
test('native cache storage failure still shows successful network translation',async({page})=>{
  await page.route('**/api/ai/translate',r=>r.fulfill({json:result('Vẫn đọc được bản dịch.',r.request().postDataJSON().model)}));await seed(page);
  await page.evaluate(async()=>{const{db}=await import('/src/core/db.ts');const backend=db.backendDB(),transaction=backend.transaction.bind(backend);backend.transaction=((stores:string|string[],...rest:any[])=>{if(Array.isArray(stores)&&stores.length===3&&['settings','books','chapters'].every(s=>stores.includes(s))&&rest[0]==='readwrite')throw new DOMException('Synthetic quota','QuotaExceededError');return transaction(stores,...rest);}) as typeof backend.transaction;});
  await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Vẫn đọc được bản dịch.');expect(await cacheCount(page)).toBe(0);
});
