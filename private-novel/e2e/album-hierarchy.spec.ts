import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

test.beforeEach(async({page,context})=>{
  if(process.env.NATIVE_LINK_FIXTURE)await context.route('**/src/core/db.ts',route=>route.fulfill({contentType:'application/javascript',body:readFileSync(process.env.NATIVE_LINK_FIXTURE!,'utf8')}));
  await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'isolated hierarchy fixture'}}));
  await page.goto('/');
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    await db.books.bulkAdd([
      {id:'author-direct',title:'Truyện lẻ',author:'Tác giả',album:'Tác giả',status:'ready',chapterCount:1,charCount:3,createdAt:1,updatedAt:1},
      {id:'series-book',title:'Truyện thuộc Series',author:'Tác giả',album:'Tác giả/Series',status:'ready',chapterCount:2,charCount:6,createdAt:1,updatedAt:1},
      {id:'virtual-book',title:'Truyện ở nhánh khác',author:'Tác giả khác',album:'Tác giả khác/Series',status:'ready',chapterCount:1,charCount:3,createdAt:1,updatedAt:1},
    ]);
    await db.chapters.bulkAdd([
      {id:'direct-chapter',bookId:'author-direct',order:0,title:'Chương lẻ',text:'Thử.',revision:1,sourceId:''},
      {id:'series-one',bookId:'series-book',order:0,title:'Chương một trong Series',text:'Thử một.',revision:1,sourceId:''},
      {id:'series-two',bookId:'series-book',order:1,title:'Chương hai trong Series',text:'Thử hai.',revision:1,sourceId:''},
      {id:'other-chapter',bookId:'virtual-book',order:0,title:'Chương ở nhánh khác',text:'Thử.',revision:1,sourceId:''},
    ]);
    await db.progress.put({bookId:'series-book',chapterId:'series-two',paragraph:0,offset:0,revision:1,updatedAt:1});
  });
  await page.getByRole('link',{name:'Mở Phòng tối',exact:true}).click();
});

test('native links open Albums and reading progress in new tabs without changing the original tab',async({page,context,isMobile},info)=>{
 const author=page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3"]');
 await expect(author).toHaveAttribute('href','/phong-toi?album='+encodeURIComponent('Tác giả'));
 const original=page.url();
 expect(await author.evaluate(el=>el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2})))).toBe(true);
 const albumTab=isMobile?await context.newPage():await (async()=>{const popup=context.waitForEvent('page',{timeout:10000});await author.click({button:'middle'});return popup;})();
 if(isMobile)await albumTab.goto((await author.getAttribute('href'))!);
 await expect(albumTab.getByRole('heading',{name:/Tác giả/}).first()).toBeVisible();expect(page.url()).toBe(original);
 await albumTab.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3%2FSeries"]').click();await albumTab.reload();
 for(const theme of ['light','sepia','dark']){
  await albumTab.evaluate(async theme=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);const row=await db.settings.get('reader');await db.settings.put({key:'reader',value:{...(row?.value as object??{}),theme}});},theme);
  await albumTab.reload();await expect(albumTab.locator('html')).toHaveAttribute('data-ui-theme',theme);
  await albumTab.getByRole('link',{name:'Mở sách →',exact:true}).focus();
  expect(await albumTab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await albumTab.screenshot({path:info.outputPath(`library-links-${theme}.png`),fullPage:true});
 }
 const read=albumTab.getByRole('link',{name:'Mở sách →',exact:true});
 const bookTab=await context.newPage();await bookTab.goto((await read.getAttribute('href'))!);
 await expect(bookTab.locator('.reader')).toContainText('Chương hai trong Series');
 await bookTab.close();await albumTab.close();
});

test('chapter links support new tabs, resume, previous/next and the reader TOC',async({page,context,isMobile},info)=>{
 await page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3"]').click();
 await page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3%2FSeries"]').click();
 await page.getByRole('link',{name:'Thông tin Truyện thuộc Series',exact:true}).click();
 const chapter=page.getByRole('link',{name:'Chương hai trong Series',exact:true});
 await expect(chapter).toHaveAttribute('href','/read/series-book/series-two');
 for(const theme of ['light','sepia','dark']){
  await page.evaluate(async theme=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);const row=await db.settings.get('reader');await db.settings.put({key:'reader',value:{...(row?.value as object??{}),theme}});},theme);
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-ui-theme',theme);
  await chapter.focus();await page.screenshot({path:info.outputPath(`chapter-links-${theme}.png`),fullPage:true});
 }
 const original=page.url();
 const before=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.progress.get('series-book');});
 expect(await chapter.evaluate(el=>el.dispatchEvent(new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true})))).toBe(true);
 expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.progress.get('series-book');})).toEqual(before);
 const tab=isMobile?await context.newPage():await (async()=>{const next=context.waitForEvent('page',{timeout:10000});await chapter.click({modifiers:['Control']});return next;})();
 if(isMobile)await tab.goto((await chapter.getAttribute('href'))!);
 await expect(tab.locator('.prose')).toContainText('Thử hai.');expect(page.url()).toBe(original);
 const top=tab.getByRole('navigation',{name:'Điều hướng chương đầu trang'});
 await expect(top.getByRole('button',{name:'Chương sau →',exact:true})).toBeDisabled();
 await expect(top.getByRole('link',{name:'← Chương trước',exact:true})).toHaveAttribute('href','/read/series-book/series-one');
 await top.getByRole('link',{name:'← Chương trước',exact:true}).click();await expect(tab.locator('.prose')).toContainText('Thử một.');
 await top.getByRole('link',{name:'Chương sau →',exact:true}).click();await expect(tab.locator('.prose')).toContainText('Thử hai.');
 for(const theme of ['light','sepia','dark']){
  await tab.evaluate(async theme=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);const row=await db.settings.get('reader');await db.settings.put({key:'reader',value:{...(row?.value as object??{}),theme}});},theme);
  await tab.reload();await expect(tab.locator('.prose')).toContainText('Thử hai.');
  await top.getByRole('button',{name:'☷ Mục lục',exact:true}).click();
  const modal=tab.getByRole('dialog',{name:'Mục lục',exact:true});
  await expect(modal.getByRole('link',{name:'Chương một trong Series',exact:true})).toBeVisible();
  await tab.screenshot({path:info.outputPath(`toc-links-${theme}.png`),fullPage:true});
  await modal.getByRole('button',{name:'Đóng',exact:true}).click();
 }
 await top.getByRole('button',{name:'☷ Mục lục',exact:true}).click();
 const toc=tab.getByRole('dialog',{name:'Mục lục',exact:true});
 await expect(toc.getByRole('link',{name:'Chương một trong Series',exact:true})).toHaveAttribute('href','/read/series-book/series-one');
 await toc.getByRole('link',{name:'Chương một trong Series',exact:true}).click();await expect(toc).toBeHidden();await expect(tab.locator('.prose')).toContainText('Thử một.');
 await tab.close();
});

test('author contains series, series contains books, book retains chapters and progress',async({page})=>{
  const snapshot=()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:await db.books.toArray(),chapters:await db.chapters.toArray(),progress:await db.progress.toArray()};});
  const before=await snapshot();
  await expect(page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3%2FSeries"]')).toHaveCount(0);
  await expect(page.locator('.album-preview-card')).toHaveCount(2);
  await expect(page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3"]')).toContainText('2 truyện · 1 Album con');
  await page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3"]').click();
  await expect(page.locator('.album-preview-card')).toHaveCount(1);
  const series=page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3%2FSeries"]');
  await expect(series.locator('.title-primary')).toHaveText('Series');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card')).toContainText('Truyện lẻ');
  await expect(page.getByRole('button',{name:'Xóa Album và truyện',exact:true})).toHaveCount(0);
  const search=page.getByRole('searchbox',{name:'Tìm truyện trong Tác giả',exact:true});
  await search.fill('chuong hai');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card')).toContainText('Truyện thuộc Series');
  await search.fill('');
  await series.click();
  await expect(page.locator('.album-title-group h1 .title-primary')).toHaveText('Series');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card')).toContainText('Truyện thuộc Series');
  await expect(page.getByRole('navigation',{name:'Đường dẫn Album'})).toContainText('Tác giả');
  expect(await snapshot()).toEqual(before);
  for(const width of [320,393,869]){
    await page.setViewportSize({width,height:835});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(width!==320)await page.screenshot({path:test.info().outputPath(`series-${width}.png`),fullPage:true});
  }
  await page.getByRole('link',{name:'Về Album Tác giả',exact:true}).click();
  await expect(page.locator('.album-title-group h1 .title-primary')).toHaveText('Tác giả');
  await page.getByRole('navigation',{name:'Đường dẫn Album'}).getByRole('link',{name:'Phòng tối',exact:true}).click();
  await page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3%20kh%C3%A1c"]').click();
  await expect(page.locator('.book-card')).toHaveCount(0);
  await page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3%20kh%C3%A1c%2FSeries"]').click();
  await expect(page.locator('.book-card')).toContainText('Truyện ở nhánh khác');
  await page.getByRole('link',{name:'Về Album Tác giả khác',exact:true}).click();
  await page.getByRole('navigation',{name:'Đường dẫn Album'}).getByRole('link',{name:'Phòng tối',exact:true}).click();
  await page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3"]').click();
  await page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3%2FSeries"]').click();
  await page.getByRole('link',{name:'Thông tin Truyện thuộc Series',exact:true}).click();
  await expect(page.locator('.story-chapter-list li')).toHaveCount(2);
  await page.getByRole('link',{name:'Đọc tiếp',exact:true}).click();
  await expect(page).toHaveURL(/\/read\/series-book\/series-two$/);
});

test('creating a series inherits the current author path and import targets that exact child Album',async({page})=>{
  await page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3"]').click();
  await page.getByRole('button',{name:'Tạo Album con / Series',exact:true}).click();
  await page.getByRole('textbox',{name:'Tên Album con mới',exact:true}).fill('Series mới');
  await page.getByRole('button',{name:'Tạo',exact:true}).click();
  await expect(page.locator('.album-title-group h1 .title-primary')).toHaveText('Series mới');
  await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();
  await expect(page.getByLabel('Album (không bắt buộc)',{exact:true})).toHaveValue('Tác giả/Series mới');
  await page.getByRole('dialog').locator('footer').getByRole('button',{name:'Đóng',exact:true}).click();
  await page.getByRole('link',{name:'Về Album Tác giả',exact:true}).click();
  await expect(page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3%2FSeries%20m%E1%BB%9Bi"]')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/album=/);
  await expect(page.locator('.album-title-group h1 .title-primary')).toHaveText('Tác giả');
  await expect(page.locator('.album-preview-title[href="/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3%2FSeries%20m%E1%BB%9Bi"]')).toBeVisible();
});
