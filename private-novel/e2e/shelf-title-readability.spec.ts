import {test,expect} from '@playwright/test';

test('long shelf titles stay readable and selectable at narrow and wide widths',async({page})=>{
  await page.goto('/');
  const titles=['Một tên truyện rất dài để kiểm tra cách xuống dòng và chọn đúng tác phẩm '.repeat(3),'TênKhôngCóKhoảngTrắng'.repeat(12)];
  await page.evaluate(async titles=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    for(let i=0;i<titles.length;i++)await db.books.add({id:`readable-${i}`,title:titles[i],author:'',status:'ready',chapterCount:0,charCount:0,createdAt:1,updatedAt:1});
  },titles);
  await expect(page.locator('.book-card')).toHaveCount(2);
  for(const width of [320,390,522,1280]){
    await page.setViewportSize({width,height:800});
    for(let i=0;i<titles.length;i++){
      const title=page.locator('.book-detail h3 > button').filter({hasText:titles[i].trim()});
      await expect(title).toHaveText(titles[i]);
      await expect(title).toHaveCSS('font-size',width<=700?'18px':'20px');
      await expect(title).toHaveCSS('text-align','left');
      expect(await title.evaluate(element=>{
        const bounds=element.getBoundingClientRect();
        return bounds.height>=44&&element.scrollHeight<=element.clientHeight+1&&element.scrollWidth<=element.clientWidth+1;
      })).toBe(true);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  const title=page.locator('.book-detail h3 > button').filter({hasText:titles[0].trim()});
  await title.focus();await page.keyboard.press('Enter');
  await expect(page.locator('.story-summary h1')).toHaveText(titles[0]);
  expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return(await db.books.get('readable-0'))?.title;})).toBe(titles[0]);
});
