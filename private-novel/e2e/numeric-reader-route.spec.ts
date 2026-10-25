import {test,expect,type Page,type BrowserContext} from '@playwright/test';
const book='a0000000-0000-4000-8000-000000000001',other='a0000000-0000-4000-8000-000000000002';
const ids=['b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002'],otherChapter='b0000000-0000-4000-8000-000000000003';
async function routes(context:BrowserContext){
 await context.route('**/api/**',r=>r.fulfill({status:503}));
 await context.route('**/api/reader-route?**',r=>{const url=new URL(r.request().url()),query=url.searchParams;const id=query.get('book')??(query.get('code')==='31823'?book:query.get('code')==='31824'?other:'');return id===book||id===other?r.fulfill({json:{bookId:id,code:id===book?31823:31824}}):r.fulfill({status:404});});
}
async function seed(page:Page,duplicate=false){
 await page.goto('/');await page.evaluate(async({book,other,ids,otherChapter,duplicate})=>{
  const {db}=await import('/src/core/db.ts');await db.books.bulkPut([book,other].map(id=>({id,title:id===book?'Truyện số':'Truyện khác',author:'',status:'ready',chapterCount:2,charCount:40,createdAt:1,updatedAt:1})));
  await db.chapters.bulkPut(ids.map((id,i)=>({id,bookId:book,title:`Chương ${duplicate?1429:1429+i}: Kiểm tra`,order:1425+i,text:`Nội dung chương ${1429+i}.`,revision:1,sourceId:''})).concat([{id:otherChapter,bookId:other,title:'Chương 1: Khác',order:0,text:'Nội dung truyện khác.',revision:1,sourceId:''}]));
  await db.settings.put({key:'reader-options',value:{preloadAi:false,autoNext:false,mode:'original'}});
  await db.progress.put({bookId:book,chapterId:ids[1],revision:1,paragraph:0,offset:0,updatedAt:1});
 },{book,other,ids,otherChapter,duplicate});
}
test('legacy to numeric, TOC position instead of heading, explicit chapter overrides bookmark and next/back/reload preserve source',async({page})=>{
 await routes(page.context());await seed(page);const before=await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return db.chapters.toArray();});
 await page.goto(`/read/${book}/${ids[0]}`);await expect(page).toHaveURL(/\/r\/31823\/1$/);await expect(page.locator('.prose')).toContainText('Nội dung chương 1429.');
 await page.getByRole('button',{name:'Chương sau →',exact:true}).first().click();await expect(page).toHaveURL(/\/r\/31823\/2$/);
 await page.reload();await expect(page).toHaveURL(/\/r\/31823\/2$/);await expect(page.locator('.prose')).toContainText('Nội dung chương 1430.');
 await page.goBack();await expect(page).toHaveURL(/\/r\/31823\/1$/);await expect(page.locator('.prose')).toContainText('Nội dung chương 1429.');
 await page.goForward();await expect(page).toHaveURL(/\/r\/31823\/2$/);
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return db.chapters.toArray();})).toEqual(before);
});
test('numeric link works on another device without local alias, and duplicate headings use positions and unknown positions do not resume a different chapter',async({page,browser})=>{
 await routes(page.context());await seed(page);await page.goto('/r/31823/1');await expect(page.locator('.prose')).toContainText('Nội dung chương 1429.');
 const context=await browser.newContext({viewport:page.viewportSize()!});try{await routes(context);const fresh=await context.newPage();await seed(fresh);await fresh.goto('/r/31823/1');await expect(fresh.locator('.prose')).toContainText('Nội dung chương 1429.');}finally{await context.close();}
 await page.goto('/r/31823/9999');await expect(page.getByText('Không tìm thấy vị trí chương trong mục lục.',{exact:true})).toBeVisible();await expect(page.locator('.prose')).toHaveCount(0);
 await page.goto('/');await page.evaluate(async id=>{const {db}=await import('/src/core/db.ts');await db.chapters.update(id,{title:'Chương 1429: Trùng'});},ids[1]);await page.goto('/r/31823/1');await expect(page.locator('.prose')).toContainText('Nội dung chương 1429.');
 await page.goto(`/read/${book}/${ids[0]}`);await expect(page.locator('.prose')).toContainText('Nội dung chương 1429.');await expect(page).toHaveURL(/\/r\/31823\/1$/);
});
test('late allocation and stale Reader emission cannot change a different destination',async({page})=>{
 await routes(page.context());await seed(page);let release!:()=>void;const gate=new Promise<void>(r=>release=r);let entered=false;
 await page.route('**/api/reader-route?book='+book,async r=>{entered=true;await gate;await r.fulfill({json:{bookId:book,code:31823}}).catch(()=>{});});
 await page.goto(`/read/${book}/${ids[0]}`);await expect(page.locator('.prose')).toContainText('Nội dung chương 1429.');await expect.poll(()=>entered).toBe(true);
 await page.evaluate(async({other,otherChapter,old})=>{
  const {db}=await import('/src/core/db.ts');const table=db.books as any,original=table.get.bind(table);let release!:()=>void;const gate=new Promise<void>(r=>release=r);
  table.get=(id:any,...args:any[])=>id===other?gate.then(()=>original(id,...args)):original(id,...args);(window as any).__releaseNumericBook=()=>{table.get=original;release();};
  history.pushState(null,'',`/read/${other}/${otherChapter}`);window.dispatchEvent(new PopStateEvent('popstate'));
  await db.chapters.update(old,{title:'Chương 1431: Đổi khi chờ'});
 },{other,otherChapter,old:ids[0]});
 release();await page.evaluate(()=>(window as any).__releaseNumericBook());await expect(page).toHaveURL(/\/r\/31824\/1$/);await expect(page.locator('.prose')).toContainText('Nội dung truyện khác.');await expect(page.locator('.prose')).not.toContainText('Nội dung chương 1429.');
});
