import {test,expect} from '@playwright/test';

test('shelf removes redundant chrome and portal actions stay inside viewport and clickable',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    for(let index=0;index<3;index++)await db.books.add({id:`minimal-${index}`,title:`Synthetic story ${index}`,author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:10});
  });
  await expect(page.locator('.book-card')).toHaveCount(3);
  await expect(page.locator('.topbar,.local-note,.app-footer,.sidebar-bottom')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Tủ sách',exact:true})).toHaveCount(1);
  for(const index of [0,2]){
    const card=page.locator('.book-card').nth(index);await card.getByRole('button',{name:/Tùy chọn/}).click();
    const button=page.getByRole('dialog').getByRole('button',{name:'Sửa thông tin',exact:true});await button.scrollIntoViewIfNeeded();
    const contained=await button.evaluate(element=>{
      const bounds=element.getBoundingClientRect();
      const point=document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
      return bounds.top>=0&&bounds.bottom<=innerHeight&&bounds.left>=0&&bounds.right<=innerWidth&&(point===element||element.contains(point));
    });
    expect(contained).toBe(true);
    await button.click();await expect(page.getByRole('dialog',{name:'Thông tin truyện',exact:true})).toBeVisible();
    await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).click();

  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
