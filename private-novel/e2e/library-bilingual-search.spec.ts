import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic library fixture'}}));
  await page.goto('/');
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    await db.dictionaries.put({kind:'vp',name:'VP.txt',blob:new Blob(['正义人=người chính nghĩa\n初见=lần đầu gặp\n山门=sơn môn']),sha256:'library-titles',updatedAt:1});
    await db.books.bulkAdd([
      {id:'bilingual',title:'原书名',displayTitle:'Tên truyện Việt',author:'',album:'正义人',status:'ready',chapterCount:2,charCount:20,createdAt:1,updatedAt:1},
      {id:'second',title:'Khác',author:'',album:'正义人',status:'ready',chapterCount:1,charCount:10,createdAt:1,updatedAt:1},
      {id:'outside',title:'Ngoài Album',author:'',status:'ready',chapterCount:1,charCount:10,createdAt:1,updatedAt:1},
    ]);
    await db.chapters.bulkAdd([
      {id:'legacy',bookId:'bilingual',order:0,title:'初见',text:'Nội dung thử.',revision:1,sourceId:''},
      {id:'persisted',bookId:'bilingual',order:1,title:'山门',displayTitle:'Sơn môn',text:'Chỉ có từ khóa bí mật trong nội dung.',revision:1,sourceId:''},
      {id:'different',bookId:'second',order:0,title:'Khác',text:'Nội dung thử.',revision:1,sourceId:''},
      {id:'outside-chapter',bookId:'outside',order:0,title:'初见',text:'Nội dung thử.',revision:1,sourceId:''},
    ]);
  });
  await page.getByRole('link',{name:'Mở Phòng tối',exact:true}).click();
});

test('Album and book show Vietnamese above muted original; list view survives reload without overflow',async({page})=>{
  const album=page.locator('.album-preview-title[href="/phong-toi?album=%E6%AD%A3%E4%B9%89%E4%BA%BA"]');
  await expect(album.locator('.title-primary')).toHaveText('Người chính nghĩa');
  await expect(album.locator('.title-original')).toHaveText('正义人');
  await album.click();
  await expect(page.locator('.album-title-group h1 .title-primary')).toHaveText('Người chính nghĩa');
  const card=page.locator('.book-card').filter({hasText:'Tên truyện Việt'});
  await expect(card.locator('h3 .title-primary')).toHaveText('Tên truyện Việt');
  await expect(card.locator('h3 .title-original')).toHaveText('原书名');
  const bounds=await card.locator('h3').evaluate(element=>{
    const primary=element.querySelector('.title-primary')!.getBoundingClientRect();
    const original=element.querySelector('.title-original')!.getBoundingClientRect();
    return {below:original.top>=primary.bottom,smaller:parseFloat(getComputedStyle(element.querySelector('.title-original')!).fontSize)<parseFloat(getComputedStyle(element).fontSize)};
  });
  expect(bounds).toEqual({below:true,smaller:true});
  await page.getByRole('button',{name:'Danh sách',exact:true}).click();
  await expect(page.locator('.book-grid')).toHaveClass(/list-shelf/);
  for(const width of [320,390,869,1280]){
    await page.setViewportSize({width,height:835});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(card.getByRole('link',{name:'Mở sách →',exact:true})).toBeVisible();
    if(width===390||width===869)await page.screenshot({path:test.info().outputPath(`library-list-${width}.png`),fullPage:true});
  }
  await page.reload();
  await expect(page.getByRole('button',{name:'Danh sách',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Lưới',exact:true}).click();
  await expect(page.locator('.book-grid')).toHaveClass(/cover-shelf/);
  await page.setViewportSize({width:390,height:835});
  await page.screenshot({path:test.info().outputPath('library-grid-390.png'),fullPage:true});
});

test('searches raw and Vietnamese chapter names within Album and opens the matched chapter',async({page})=>{
  await page.locator('.album-preview-title[href="/phong-toi?album=%E6%AD%A3%E4%B9%89%E4%BA%BA"]').click();
  const search=page.getByLabel('Tìm truyện trong 正义人',{exact:true});
  for(const query of ['初见','lan dau gap','山门','SON MON','原书名','ten truyen viet']){
    await search.fill(query);
    await expect(page.locator('.book-card')).toHaveCount(1);
    await expect(page.locator('.book-detail h3 .title-primary')).toHaveText('Tên truyện Việt');
    await expect(page.getByText('Đang tìm tên chương…',{exact:true})).toHaveCount(0);
  }
  await search.fill('bí mật');
  await expect(page.getByText('Không có truyện hoặc tên chương khớp từ khóa tìm kiếm.',{exact:true})).toBeVisible();
  await expect(page.getByText('Album chưa có truyện',{exact:true})).toHaveCount(0);
  await search.fill('son mon');
  await expect(page.getByRole('link',{name:'Chương: Sơn môn',exact:true})).toBeVisible();
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.chapters.update('persisted',{displayTitle:'Cổng mới'});});
  await expect(page.getByText('Không có truyện hoặc tên chương khớp từ khóa tìm kiếm.',{exact:true})).toBeVisible();
  await search.fill('cong moi');
  await page.getByRole('link',{name:'Chương: Cổng mới',exact:true}).click();
  await expect(page).toHaveURL(/\/read\/bilingual\/persisted$/);
});

test('compact view shows just book titles and chapter counts, persists and opens details',async({page})=>{
 await page.locator('.album-preview-title[href="/phong-toi?album=%E6%AD%A3%E4%B9%89%E4%BA%BA"]').click();
 await page.getByRole('button',{name:'Thu gọn',exact:true}).click();
 const shelf=page.locator('.compact-shelf'),row=shelf.locator('.book-card').filter({hasText:'Tên truyện Việt'});
 await expect(row).toHaveText('Tên truyện Việt2 chương');await expect(shelf.locator('.cover,.book-detail,.book-menu')).toHaveCount(0);
 for(const width of [320,390,869]){await page.setViewportSize({width,height:835});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(row.getByRole('link',{name:'Tên truyện Việt',exact:true})).toBeVisible();if(width===390)await page.screenshot({path:test.info().outputPath('library-compact-mobile.png'),fullPage:true});}
 await page.screenshot({path:test.info().outputPath('library-compact.png'),fullPage:true});
 await page.reload();await expect(page.getByRole('button',{name:'Thu gọn',exact:true})).toHaveAttribute('aria-pressed','true');
 await row.getByRole('link',{name:'Tên truyện Việt',exact:true}).click();await expect(page).toHaveURL(/\/book\/bilingual$/);
});
