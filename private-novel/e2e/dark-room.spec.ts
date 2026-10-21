import {test,expect} from '@playwright/test';

test('Albums live in Phòng tối, room navigation survives reload and delete is only inside the Album',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'isolated room fixture'}}));
  await page.goto('/');
  await page.evaluate(async()=>{
    const {db}=await import('/src/core/db.ts');
    await db.books.bulkAdd([
      {id:'normal',title:'Truyện ở Thư phòng',author:'',status:'ready',chapterCount:1,charCount:3,createdAt:1,updatedAt:1},
      {id:'hidden',title:'Truyện ở Phòng tối',album:'Tác giả/Series',author:'',status:'ready',chapterCount:1,charCount:3,createdAt:1,updatedAt:1},
    ]);
    await db.chapters.bulkAdd([
      {id:'normal-chapter',bookId:'normal',order:0,title:'Chương một',text:'Thử.',revision:1,sourceId:''},
      {id:'hidden-chapter',bookId:'hidden',order:0,title:'Chương hai',text:'Thử.',revision:1,sourceId:''},
    ]);
    await db.progress.put({bookId:'hidden',chapterId:'hidden-chapter',paragraph:0,offset:1,revision:1,updatedAt:1});
  });
  const snapshot=()=>page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return {books:await db.books.toArray(),chapters:await db.chapters.toArray(),progress:await db.progress.toArray()};});
  const before=await snapshot();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card')).toContainText('Truyện ở Thư phòng');
  await expect(page.getByRole('region',{name:'Danh sách Album'})).toHaveCount(0);
  await expect(page.getByText(/Truyện chưa vào Album/)).toHaveCount(0);
  await expect(page.locator('p.notice[role="status"]').filter({hasText:'Kho cloud tạm thời không khả dụng'})).toBeVisible();
  for(const width of [320,393,869]){
    await page.setViewportSize({width,height:300});
    await page.evaluate(()=>window.scrollTo(0,0));
    const link=page.getByRole('link',{name:'Mở Phòng tối',exact:true}),bounds=await link.boundingBox();
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);expect(bounds!.y).toBeGreaterThan(300);
    const beforeScroll=await link.evaluate(element=>element.getBoundingClientRect().top+scrollY);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await expect(link).toBeInViewport();
    expect(await link.evaluate(element=>element.getBoundingClientRect().top+scrollY)).toBeCloseTo(beforeScroll,0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:869,height:835});
  await expect(page.getByRole('link',{name:'Mở Phòng tối',exact:true})).toHaveText('THU PHONG là trang web cung cấp dịch vụ dịch tự động truyện chữ Trung.');
  await page.getByRole('link',{name:'Mở Phòng tối',exact:true}).click();
  await expect(page).toHaveURL(/\/phong-toi$/);
  await expect(page.getByRole('heading',{name:'PHÒNG TỐI',exact:true})).toBeVisible();
  await expect(page.locator('.book-card')).toHaveCount(0);
  await expect(page.locator('.album-delete')).toHaveCount(0);
  await page.reload();
  await page.getByRole('textbox',{name:'Tìm truyện',exact:true}).fill('chuong hai');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card')).toContainText('Truyện ở Phòng tối');
  await page.getByRole('textbox',{name:'Tìm truyện',exact:true}).fill('');
  await page.getByRole('button',{name:'Mở Album Tác giả',exact:true}).click();
  await page.getByRole('button',{name:'Mở Album Tác giả/Series',exact:true}).click();
  const remove=page.getByRole('button',{name:'Xóa Album và truyện',exact:true});
  await expect(remove).toBeVisible();await expect(remove).toHaveClass(/btn-danger/);
  const color=await remove.evaluate(element=>getComputedStyle(element).backgroundColor.match(/\d+/g)!.map(Number));
  expect(color[0]).toBeGreaterThan(color[1]+50);
  await expect(page.locator('.book-card')).toContainText('Truyện ở Phòng tối');
  await page.getByRole('button',{name:/Tủ sách/}).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.book-card')).toContainText('Truyện ở Thư phòng');
  await page.goBack();await expect(page.getByRole('heading',{name:'PHÒNG TỐI',exact:true})).toBeVisible();
  expect(await snapshot()).toEqual(before);
});
