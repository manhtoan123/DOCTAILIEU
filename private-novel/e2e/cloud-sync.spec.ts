import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
test('auto uploads all confirmed books, persists acknowledgments and adds cloud text/Names on another device',async({page,context,browser})=>{
  const objects=new Map<string,{bytes:Buffer;title:string;sha256:string}>();let puts=0;
  const route=async(route:import('@playwright/test').Route)=>{
    if(route.request().url().includes('/dictionaries')){await route.fulfill({json:{version:1,dictionaries:[]}});return;}
    if(route.request().url().includes('/deletions')){await route.fulfill({json:{ids:[],cursor:null}});return;}
    const request=route.request(),id=new URL(request.url()).pathname.split('/').at(-1)!;
    if(request.method()==='PUT'){const bytes=request.postDataBuffer()!;const sha256=createHash('sha256').update(bytes).digest('hex');expect(request.headers()['x-content-sha256']).toBe(sha256);objects.set(id,{bytes,sha256,title:decodeURIComponent(request.headers()['x-book-title'])});puts++;await route.fulfill({json:{id,sha256},status:201});}
    else if(id==='books')await route.fulfill({json:{books:[...objects].map(([id,obj])=>({id,title:obj.title,sha256:obj.sha256,bytes:obj.bytes.length,updatedAt:1})),cursor:null}});
    else{const object=objects.get(id)!;await route.fulfill({body:object.bytes,contentType:'application/json'});}
  };
  await context.route('**/api/cloud/**',route);await page.goto('/');
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);const id='00000000-0000-4000-8000-000000000001';
    await db.transaction('rw',[db.books,db.chapters,db.names],async()=>{await db.books.add({id,title:'Cloud 中文',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:3});await db.chapters.add({id:crypto.randomUUID(),bookId:id,order:0,title:'第一章',text:'山门。',revision:1,sourceId:''});await db.names.add({id:crypto.randomUUID(),bookId:id,key:'山门',value:'Cổng Riêng'});const second='00000000-0000-4000-8000-000000000002';await db.books.add({id:second,title:'Second Cloud',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:2});await db.chapters.add({id:crypto.randomUUID(),bookId:second,order:0,title:'Chương 1',text:'水。',revision:1,sourceId:''});});
  });
  await expect.poll(()=>puts).toBe(2);await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.settings.where('key').startsWith('cloud-uploaded:').count();})).toBe(2);
  await page.reload();await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('cloud');const sync=page.getByRole('button',{name:'Đồng bộ tất cả truyện',exact:true});await sync.click();await expect(sync).toBeEnabled();expect(puts).toBe(2);
  const other=await browser.newContext();await other.route('**/api/cloud/**',route);const second=await other.newPage();await second.goto('/');await second.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await second.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('cloud');await second.getByRole('button',{name:'Lấy danh sách cloud',exact:true}).click();await second.getByRole('button',{name:'Tải về thiết bị',exact:true}).first().click();await expect(second.getByRole('status')).toContainText('Đã tải Cloud 中文');
  await second.getByRole('button',{name:'Tủ sách',exact:false}).click();await second.locator('.book-card').filter({has:second.getByRole('heading',{name:'Cloud 中文',exact:true})}).getByRole('link',{name:'Mở sách →',exact:true}).click();await second.getByRole('button',{name:'Convert',exact:true}).click();await expect(second.locator('.prose')).toContainText('Cổng Riêng');
  expect(await second.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {sources:await db.sources.count(),text:(await db.chapters.toArray())[0].text,names:(await db.names.toArray())[0].value};})).toEqual({sources:0,text:'山门。',names:'Cổng Riêng'});await other.close();
});
test('unconfigured cloud never uploads or deletes a local book',async({page,context})=>{
  let puts=0;await context.route('**/api/cloud/**',async route=>{if(route.request().method()==='PUT')puts++;await route.fulfill({status:503,json:{error:'cloud_not_configured'}});});
  await page.goto('/');await page.getByRole('button',{name:'Đọc truyện mẫu →',exact:true}).click();await page.getByRole('link',{name:'← Tủ sách',exact:true}).click();await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('cloud');await expect(page.getByRole('status')).toContainText('Kho cloud chưa được cấu hình');expect(puts).toBe(0);
  expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.books.where('status').equals('ready').count();})).toBe(1);
});

test('temporary cloud failures show once and retry recovers without changing local content',async({page,context})=>{
  let healthy=false,limited=false,failedProbes=0,puts=0;
  await context.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(!path.startsWith('/api/cloud/')){await route.fulfill({status:503,json:{error:'isolated_fixture'}});return;}
    if(!healthy){failedProbes++;await route.fulfill({status:503,json:{error:limited?'cloud_read_limit':'cloud_unavailable'}});return;}
    if(request.method()==='PUT'){
      puts++;await route.fulfill({status:201,json:{id:path.split('/').at(-1),sha256:request.headers()['x-content-sha256']}});return;
    }
    await route.fulfill({json:path.endsWith('/deletions')?{ids:[],cursor:null}:{books:[],cursor:null}});
  });
  await page.goto('/phong-toi');
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    const id='00000000-0000-4000-8000-000000000001';
    await db.books.add({id,title:'Retry fixture',author:'',album:'Tác giả/Series',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:3});
    await db.chapters.add({id:'00000000-0000-4000-8000-000000000002',bookId:id,order:0,title:'Chương một',text:'Thử.',revision:1,sourceId:''});
    await db.progress.put({bookId:id,chapterId:'00000000-0000-4000-8000-000000000002',paragraph:0,offset:1,revision:1,updatedAt:1});
  });
  const snapshot=()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:await db.books.toArray(),chapters:await db.chapters.toArray(),progress:await db.progress.toArray()};});
  const before=await snapshot();
  await expect.poll(()=>failedProbes).toBeGreaterThanOrEqual(2);
  const error=page.getByRole('status').filter({hasText:'Kho cloud tạm thời không khả dụng'});
  await expect(error).toHaveCount(1);await expect(page.getByText('Kho cloud chưa được cấu hình',{exact:false})).toHaveCount(0);
  expect(puts).toBe(0);
  limited=true;await page.getByRole('button',{name:'Thử lại kho',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Kho cloud đã hết hạn mức đọc D1 hôm nay'})).toHaveCount(1);
  expect(await snapshot()).toEqual(before);expect(puts).toBe(0);
  healthy=true;await page.getByRole('button',{name:'Thử lại kho',exact:true}).click();
  await expect(error).toHaveCount(0);await expect(page.getByRole('button',{name:'Thử lại kho',exact:true})).toHaveCount(0);
  expect(puts).toBe(1);expect(await snapshot()).toEqual(before);
  await page.reload();await expect(page.getByRole('region',{name:'Danh sách Album'})).toBeVisible();
  expect(await snapshot()).toEqual(before);expect(puts).toBe(1);
});
