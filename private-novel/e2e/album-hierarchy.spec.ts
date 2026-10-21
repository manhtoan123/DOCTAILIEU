import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'isolated hierarchy fixture'}}));
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

test('author contains series, series contains books, book retains chapters and progress',async({page})=>{
  const snapshot=()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:await db.books.toArray(),chapters:await db.chapters.toArray(),progress:await db.progress.toArray()};});
  const before=await snapshot();
  await expect(page.getByRole('button',{name:'Mở Album Tác giả/Series',exact:true})).toHaveCount(0);
  await expect(page.locator('.album-card-item')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Mở Album Tác giả',exact:true})).toContainText('2 truyện · 1 Album con');
  await page.getByRole('button',{name:'Mở Album Tác giả',exact:true}).click();
  await expect(page.locator('.album-card-item')).toHaveCount(1);
  const series=page.getByRole('button',{name:'Mở Album Tác giả/Series',exact:true});
  await expect(series.locator('.title-primary')).toHaveText('Series');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card')).toContainText('Truyện lẻ');
  await expect(page.getByRole('button',{name:'Xóa Album và truyện',exact:true})).toHaveCount(0);
  const search=page.getByRole('textbox',{name:'Tìm truyện trong Tác giả',exact:true});
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
  await page.getByRole('button',{name:'← Album cha',exact:true}).click();
  await expect(page.locator('.album-title-group h1 .title-primary')).toHaveText('Tác giả');
  await page.getByRole('button',{name:'← Phòng tối',exact:true}).click();
  await page.getByRole('button',{name:'Mở Album Tác giả khác',exact:true}).click();
  await expect(page.getByText('Chọn Album con / Series để xem truyện.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mở Album Tác giả khác/Series',exact:true}).click();
  await expect(page.locator('.book-card')).toContainText('Truyện ở nhánh khác');
  await page.getByRole('button',{name:'Về Album Tác giả khác',exact:true}).click();
  await page.getByRole('button',{name:'← Phòng tối',exact:true}).click();
  await page.getByRole('button',{name:'Mở Album Tác giả',exact:true}).click();
  await page.getByRole('button',{name:'Mở Album Tác giả/Series',exact:true}).click();
  await page.getByRole('button',{name:'Thông tin Truyện thuộc Series',exact:true}).click();
  await expect(page.locator('.story-chapter-list li')).toHaveCount(2);
  await page.getByRole('button',{name:'Đọc tiếp',exact:true}).click();
  await expect(page).toHaveURL(/\/read\/series-book\/series-two$/);
});

test('creating a series inherits the current author path and import targets that exact child Album',async({page})=>{
  await page.getByRole('button',{name:'Mở Album Tác giả',exact:true}).click();
  await page.getByRole('button',{name:'Tạo Album con / Series',exact:true}).click();
  await page.getByRole('textbox',{name:'Tên Album con mới',exact:true}).fill('Series mới');
  await page.getByRole('button',{name:'Tạo',exact:true}).click();
  await expect(page.locator('.album-title-group h1 .title-primary')).toHaveText('Series mới');
  await page.getByRole('button',{name:'＋ Thêm truyện vào Album này',exact:true}).click();
  await expect(page.getByLabel('Album (không bắt buộc)',{exact:true})).toHaveValue('Tác giả/Series mới');
  await page.getByRole('dialog').locator('footer').getByRole('button',{name:'Đóng',exact:true}).click();
  await page.getByRole('button',{name:'← Album cha',exact:true}).click();
  await expect(page.getByRole('button',{name:'Mở Album Tác giả/Series mới',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'Mở Album Tác giả/Series mới',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Mở Album Tác giả',exact:true}).click();
  await expect(page.getByRole('button',{name:'Mở Album Tác giả/Series mới',exact:true})).toBeVisible();
});
