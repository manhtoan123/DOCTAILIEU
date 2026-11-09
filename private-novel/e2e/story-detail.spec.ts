import {test,expect,type Page} from '@playwright/test';

test.beforeEach(async({context})=>{await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic story detail fixture'}}));});

async function seed(page:Page,count=65){
  await page.goto('/');
  await page.evaluate(async(count)=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    const chapters=Array.from({length:count},(_,order)=>({id:`detail-${order+1}`,bookId:'detail-book',order,title:`Chương ${order+1}: Kiểm thử`,text:`Chương ${order+1}: Kiểm thử\n\nNội dung chương ${order+1}.\n\nĐoạn cuối chương ${order+1}.`,revision:1,sourceId:''}));
    await db.transaction('rw',[db.books,db.chapters,db.progress,db.names],async()=>{
      await db.books.add({id:'detail-book',title:'Truyện mục lục',author:'Tác giả mẫu',status:'ready',chapterCount:count,charCount:chapters.reduce((n,c)=>n+c.text.length,0),createdAt:1,updatedAt:1});
      await db.chapters.bulkAdd(chapters);
      await db.progress.put({bookId:'detail-book',chapterId:'detail-2',paragraph:2,offset:0,revision:1,updatedAt:7});
      await db.names.put({id:'detail-name',bookId:'detail-book',key:'李明',value:'Lý Minh'});
    });
  },count);
  await expect(page.getByRole('link',{name:'Thông tin Truyện mục lục',exact:true})).toBeVisible();
}
async function snapshot(page:Page){return page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:await db.books.toArray(),chapters:await db.chapters.toArray(),names:await db.names.toArray(),progress:await db.progress.toArray()};});}
async function detail(page:Page){await page.getByRole('link',{name:'Thông tin Truyện mục lục',exact:true}).click();return page.getByRole('region',{name:'Thông tin truyện',exact:true});}

test('chapter title opens its own story details from a direct reader URL and preserves the chapter for resume',async({page})=>{
  await seed(page,3);const before=await snapshot(page);
  await page.goto('/read/detail-book/detail-2');await expect(page.locator('.prose')).toContainText('Nội dung chương 2.');
  await page.getByRole('link',{name:'Mở thông tin và mục lục truyện',exact:true}).click();
  await expect(page).toHaveURL(/\/book\/detail-book$/);const panel=page.getByRole('region',{name:'Thông tin truyện',exact:true});
  await expect(panel.getByRole('heading',{name:'Truyện mục lục',exact:true})).toBeVisible();await expect(panel.locator('.story-chapter-list a')).toHaveCount(3);
  const after=await snapshot(page);expect(after.books).toEqual(before.books);expect(after.chapters).toEqual(before.chapters);expect(after.names).toEqual(before.names);expect(after.progress[0].chapterId).toBe('detail-2');
  await panel.getByRole('link',{name:'Đọc tiếp',exact:true}).click();await expect(page).toHaveURL(/\/read\/detail-book\/detail-2$/);await expect(page.locator('.prose')).toContainText('Nội dung chương 2.');
  await page.getByRole('navigation',{name:'Điều hướng chương đầu trang'}).getByRole('button',{name:'☷ Mục lục',exact:true}).click();await expect(page.getByRole('dialog',{name:'Mục lục',exact:true})).toBeVisible();
});

test('story detail is read-only; search, pagination and library return preserve data',async({page})=>{
  await seed(page);await page.getByLabel('Tìm truyện').fill('mục lục');const before=await snapshot(page);
  const panel=await detail(page);await expect(panel.getByRole('heading',{name:'Truyện mục lục',exact:true})).toBeVisible();
  await expect(panel).toContainText('Tác giả mẫu');await expect(panel.locator('.story-chapter-list a')).toHaveCount(60);
  await expect(panel.getByRole('link',{name:'Chương 2: Kiểm thử',exact:true})).toHaveAttribute('aria-current','true');
  await panel.getByRole('button',{name:'Trang mục lục sau',exact:true}).click();await expect(panel.locator('.story-chapter-list a')).toHaveCount(5);
  await expect(panel.getByRole('link',{name:'Chương 61: Kiểm thử',exact:true})).toBeVisible();
  await panel.getByLabel('Tìm chương').fill('Chương 65:');await expect(panel.locator('.story-chapter-list a')).toHaveCount(1);
  await panel.getByLabel('Tìm chương').fill('không có chương');await expect(panel.locator('.story-chapter-list a')).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('link',{name:'← Tủ sách',exact:true}).click();await expect(page.getByLabel('Tìm truyện')).toHaveValue('mục lục');
});

test('locate current chapter clears search, uses visible chapter position and only changes the view',async({page})=>{
  await seed(page,135);
  await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.books.update('detail-book',{hiddenChapterIds:['detail-1','detail-2']});await db.progress.update('detail-book',{chapterId:'detail-121'});});
  const before=await snapshot(page),panel=await detail(page);
  await panel.getByLabel('Tìm chương').fill('không có chương');await expect(panel.locator('.story-chapter-list')).toHaveCount(0);
  await panel.getByRole('button',{name:'Đến chương đang đọc',exact:true}).click();
  const current=panel.getByRole('link',{name:'Chương 121: Kiểm thử',exact:true});
  await expect(panel.getByLabel('Tìm chương')).toHaveValue('');await expect(current).toBeFocused();await expect(current).toHaveAttribute('aria-current','true');
  await expect(panel.getByRole('navigation',{name:'Trang danh sách chương'})).toContainText('Trang 2 / 3');expect(await snapshot(page)).toEqual(before);
  await panel.getByRole('button',{name:'Quản lý chương',exact:true}).click();await panel.getByRole('checkbox').first().check();
  await panel.getByRole('button',{name:'Đến chương đang đọc',exact:true}).click();await expect(current).toBeFocused();await expect(panel.locator('.chapter-manage-actions')).toContainText('1 đã chọn');
  await panel.getByRole('button',{name:'Đã xóa (2)',exact:true}).click();await expect(panel.getByRole('button',{name:'Đến chương đang đọc',exact:true})).toBeDisabled();
  expect(await snapshot(page)).toEqual(before);
});

test('last TOC page jumps across multiple pages without changing saved data',async({page})=>{
  await seed(page,135);const before=await snapshot(page),panel=await detail(page);
  const nav=panel.getByRole('navigation',{name:'Trang danh sách chương'}),last=nav.getByRole('button',{name:'Đến cuối',exact:true});
  await last.click();await expect(nav).toContainText('Trang 3 / 3');await expect(panel.locator('.story-chapter-list a')).toHaveCount(15);
  await expect(panel.getByRole('link',{name:'Chương 135: Kiểm thử',exact:true})).toBeVisible();await expect(last).toBeDisabled();await expect(nav.getByRole('button',{name:'Trang mục lục sau',exact:true})).toBeDisabled();
  await nav.getByRole('button',{name:'Trang mục lục trước',exact:true}).click();await expect(nav).toContainText('Trang 2 / 3');await expect(last).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await snapshot(page)).toEqual(before);
});

test('resume, first chapter and selected chapter return to story detail',async({page})=>{
  await seed(page,3);let panel=await detail(page);
  await page.screenshot({path:`docs/screenshots/story-detail-${test.info().project.name}.png`,fullPage:true});
  await panel.getByRole('link',{name:'Đọc tiếp',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung chương 2.');
  await page.getByRole('link',{name:'← Thông tin truyện',exact:true}).click();panel=page.getByRole('region',{name:'Thông tin truyện',exact:true});
  await panel.getByRole('link',{name:'Đọc từ đầu',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung chương 1.');
  await page.getByRole('link',{name:'← Thông tin truyện',exact:true}).click();
  await page.evaluate(()=>{const original=Element.prototype.scrollIntoView;(window as unknown as {detailRestored:string}).detailRestored='';Element.prototype.scrollIntoView=function(options){if(this.hasAttribute('data-paragraph'))(window as unknown as {detailRestored:string}).detailRestored=this.textContent||'';return original.call(this,options);};});
  await panel.getByRole('link',{name:'Chương 3: Kiểm thử',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung chương 3.');
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {detailRestored:string}).detailRestored)).toContain('Chương 3: Kiểm thử');
  await page.getByRole('link',{name:'← Thông tin truyện',exact:true}).click();await expect(panel).toBeVisible();
  await expect.poll(()=>page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.progress.get('detail-book'))?.chapterId;})).toBe('detail-3');
  await page.getByRole('link',{name:'← Tủ sách',exact:true}).click();await page.reload();
  await page.getByRole('link',{name:'Mở sách →',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung chương 3.');
});

test('deleted book and missing progress chapter do not open an unrelated chapter',async({page})=>{
  await seed(page,3);
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.progress.update('detail-book',{chapterId:'missing-chapter'});});
  let panel=await detail(page);await expect(panel).toContainText('Chương đã lưu không còn khả dụng');await panel.getByRole('link',{name:'Đọc tiếp',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung chương 1.');
  await page.getByRole('link',{name:'← Thông tin truyện',exact:true}).click();panel=page.getByRole('region',{name:'Thông tin truyện',exact:true});
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.books.delete('detail-book');});
  await expect(panel.getByRole('link',{name:'Đọc từ đầu',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'← Tủ sách',exact:true})).toBeVisible();
});

test('empty story disables reading and leaves saved data unchanged',async({page})=>{
  await seed(page,0);const before=await snapshot(page);const panel=await detail(page);
  await expect(panel).toContainText('Truyện chưa có chương để đọc.');
  await expect(panel.locator('.story-read-first')).toHaveAttribute('aria-disabled','true');
  await expect(panel.locator('.story-read-resume')).toHaveAttribute('aria-disabled','true');
  expect(await snapshot(page)).toEqual(before);
});
