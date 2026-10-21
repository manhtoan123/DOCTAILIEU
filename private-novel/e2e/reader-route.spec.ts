import {test,expect} from '@playwright/test';
test('chapter URLs survive reload, browser back and forward without changing source',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({status:503,body:'{}'}));
  await page.goto('/');
  await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();
  await expect(page).toHaveURL(/\/read\/[^/]+\/[^/]+$/);
  const first=page.url();
  const source=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.chapters.toArray();});
  await page.getByRole('button',{name:'Chương sau →'}).first().click();
  await expect(page.locator('.prose')).toContainText('Lối mòn trong vườn');
  await expect(page).not.toHaveURL(first);const second=page.url();
  await page.reload();await expect(page.locator('.prose')).toContainText('Lối mòn trong vườn');
  await page.goBack();await expect(page).toHaveURL(first);await expect(page.locator('.prose')).toContainText('Một chỗ ngồi bên cửa sổ');
  await page.goForward();await expect(page).toHaveURL(second);await expect(page.locator('.prose')).toContainText('Lối mòn trong vườn');
  expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.chapters.toArray();})).toEqual(source);
  await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button',{name:'Thông tin Một khoảng bình yên',exact:true}).click();await expect(page).toHaveURL(/\/book\//);
  await page.reload();await expect(page.getByRole('region',{name:'Thông tin truyện',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();
  await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await expect(page).toHaveURL(/\/settings\/dictionary$/);
  await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('about');await page.reload();
  await expect(page.getByLabel('Nhóm cài đặt',{exact:true})).toHaveValue('about');
});
test('malformed deep link leaves the library usable',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({status:503,body:'{}'}));
  await page.goto('/');await page.evaluate(()=>{history.pushState(null,'','/read/%E0%A4%A/chapter');window.dispatchEvent(new PopStateEvent('popstate'));});await expect(page.getByRole('heading',{name:'Tủ sách',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await expect(page.locator('.prose')).toContainText('Một chỗ ngồi bên cửa sổ');
});
test('cloud-only chapter deep link restores the selected book through checked snapshot download',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({status:503,body:'{}'}));await page.goto('/');
  const fixture=await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    const snapshotPath='/src/features/sync-cloud/services/cloud-snapshot.ts';const {createCloudSnapshot,contentHash}=await import(/* @vite-ignore */snapshotPath);
    const id='00000000-0000-4000-8000-000000000101',chapterId='00000000-0000-4000-8000-000000000102';
    await db.books.put({id,title:'Cloud route fixture',author:'',status:'ready',chapterCount:1,charCount:29,createdAt:1,updatedAt:1});
    await db.chapters.put({id:chapterId,bookId:id,order:0,title:'Cloud chapter',text:'Cloud chapter\nNguồn cloud giữ nguyên.',revision:1,sourceId:''});
    const bytes=await createCloudSnapshot(id);const sha256=await contentHash(bytes);await db.books.delete(id);await db.chapters.where('bookId').equals(id).delete();
    return {id,chapterId,body:new TextDecoder().decode(bytes),bytes:bytes.byteLength,sha256};
  });
  await page.unroute('**/api/**');
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());const common={contentType:'application/json',headers:{'X-Library-Access':'public'}};
    if(url.pathname==='/api/cloud/dictionaries')return route.fulfill({...common,body:JSON.stringify({version:1,dictionaries:[]})});
    if(url.pathname==='/api/cloud/deletions')return route.fulfill({...common,body:JSON.stringify({ids:[],cursor:null})});
    if(url.pathname==='/api/cloud/books')return route.fulfill({...common,body:JSON.stringify({books:[{id:fixture.id,title:'Cloud route fixture',sha256:fixture.sha256,bytes:fixture.bytes,updatedAt:1}],cursor:null})});
    if(url.pathname===`/api/cloud/books/${fixture.id}`&&route.request().method()==='GET')return route.fulfill({...common,body:fixture.body});
    return route.fulfill({status:503,body:'{}'});
  });
  await page.goto(`/read/${fixture.id}/${fixture.chapterId}`);
  await expect(page.locator('.prose')).toContainText('Nguồn cloud giữ nguyên.');
  await expect(page).toHaveURL(new RegExp(`/read/${fixture.id}/${fixture.chapterId}$`));
  await page.reload();await expect(page.locator('.prose')).toContainText('Nguồn cloud giữ nguyên.');
});

test('direct chapter entry returns to original entry after internal next and browser back',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:503,body:'{}'}));await page.goto('/');await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await expect(page).toHaveURL(/\/read\/[^/]+\/[^/]+$/);const first=page.url();await page.goto(first);await expect(page.locator('.prose')).toContainText('Một chỗ ngồi bên cửa sổ');await page.keyboard.press('ArrowRight');await expect(page.locator('.prose')).toContainText('Lối mòn trong vườn');await page.goBack();await expect(page).toHaveURL(first);await expect(page.locator('.prose')).toContainText('Một chỗ ngồi bên cửa sổ');
});

