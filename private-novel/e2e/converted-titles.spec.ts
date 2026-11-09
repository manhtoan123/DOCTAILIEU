import {test,expect} from '@playwright/test';
test('Chinese titles stay original in raw Reader and convert locally outside that mode',async({page})=>{
  await page.route('**/api/cloud/dictionaries',route=>route.fulfill({status:404}));
  await page.goto('/');
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    await db.dictionaries.put({kind:'vp',name:'VP.txt',blob:new Blob(['山门=sơn môn\n初见=lần đầu gặp']),sha256:'title-fixture',updatedAt:1});
    await db.books.add({id:'title-book',title:'山门',author:'',status:'ready',chapterCount:1,charCount:3,createdAt:1,updatedAt:1});
    await db.chapters.add({id:'title-chapter',bookId:'title-book',order:0,title:'初见',text:'山门。',revision:1,sourceId:''});
  });
  await expect(page.locator('.book-detail h3 .title-primary')).toHaveText('Sơn môn');
  await expect(page.locator('.book-detail h3 .title-original')).toHaveText('山门');
  await page.getByRole('link',{name:'Thông tin 山门',exact:true}).click();
  await expect(page.locator('.story-summary h1')).toHaveText('Sơn môn');
  await expect(page.locator('.story-chapter-list')).toContainText('Lần đầu gặp');
  await page.getByRole('link',{name:'Đọc từ đầu',exact:true}).click();
  await expect(page.locator('.reader-book-heading')).toContainText('初见');
  await expect(page.locator('.reader-book-heading h1')).toHaveText('山门');
  await page.getByRole('button',{name:'Convert',exact:true}).click();
  await expect(page.locator('.reader-book-heading')).toContainText('Lần đầu gặp');
  await expect(page.locator('.reader-book-heading h1')).toHaveText('Sơn môn');
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.names.add({id:'title-name',bookId:'title-book',key:'山门',value:'Cổng Mới'});});
  await expect(page.locator('.reader-book-heading h1')).toHaveText('Cổng Mới');
  expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return [(await db.books.get('title-book'))?.title,(await db.chapters.get('title-chapter'))?.title];})).toEqual(['山门','初见']);
});
