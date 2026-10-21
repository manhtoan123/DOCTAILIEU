import {test,expect} from '@playwright/test';

test('Vietnamese title search remains live across Name changes and never rewrites raw metadata',async({page})=>{
  await page.goto('/');await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    await db.books.add({id:'search-han',title:'山门',author:'Tác Giả',album:'Album Thử',status:'ready',chapterCount:0,charCount:0,createdAt:1,updatedAt:1});
    await db.names.add({id:'search-name',bookId:'search-han',key:'山门',value:'Cổng Cũ'});
  });
  const search=page.getByLabel('Tìm truyện',{exact:true});
  // Search can start before the first presentation has been prepared.
  await search.fill('cong cu');await expect(page.locator('.book-detail h3')).toHaveText('Cổng Cũ');
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.names.update('search-name',{value:'Cổng Mới'});});
  await expect(page.locator('.book-card')).toHaveCount(0);
  await search.fill('cong moi');await expect(page.locator('.book-detail h3')).toHaveText('Cổng Mới');
  for(const query of ['山门','tac gia','album thu']){await search.fill(query);await expect(page.locator('.book-card')).toHaveCount(1);}
  expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return(await db.books.get('search-han'))?.title;})).toBe('山门');
});
