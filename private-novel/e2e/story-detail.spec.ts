import {test,expect,type Page} from '@playwright/test';

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
  await expect(page.getByRole('button',{name:'Thông tin Truyện mục lục',exact:true})).toBeVisible();
}
async function snapshot(page:Page){return page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:await db.books.toArray(),chapters:await db.chapters.toArray(),names:await db.names.toArray(),progress:await db.progress.toArray()};});}
async function detail(page:Page){await page.getByRole('button',{name:'Thông tin Truyện mục lục',exact:true}).click();return page.getByRole('region',{name:'Thông tin truyện',exact:true});}

test('chapter title opens its own story details from a direct reader URL and preserves the chapter for resume',async({page})=>{
  await seed(page,3);const before=await snapshot(page);
  await page.goto('/read/detail-book/detail-2');await expect(page.locator('.prose')).toContainText('Nội dung chương 2.');
  await page.getByRole('button',{name:'Mở thông tin và mục lục truyện',exact:true}).click();
  await expect(page).toHaveURL(/\/book\/detail-book$/);const panel=page.getByRole('region',{name:'Thông tin truyện',exact:true});
  await expect(panel.getByRole('heading',{name:'Truyện mục lục',exact:true})).toBeVisible();await expect(panel.locator('.story-chapter-list button')).toHaveCount(3);
  const after=await snapshot(page);expect(after.books).toEqual(before.books);expect(after.chapters).toEqual(before.chapters);expect(after.names).toEqual(before.names);expect(after.progress[0].chapterId).toBe('detail-2');
  await panel.getByRole('button',{name:'Đọc tiếp',exact:true}).click();await expect(page).toHaveURL(/\/read\/detail-book\/detail-2$/);await expect(page.locator('.prose')).toContainText('Nội dung chương 2.');
  await page.getByRole('navigation',{name:'Điều hướng chương đầu trang'}).getByRole('button',{name:'☷ Mục lục',exact:true}).click();await expect(page.getByRole('dialog',{name:'Mục lục',exact:true})).toBeVisible();
});

test('story detail is read-only; search, pagination and library return preserve data',async({page})=>{
  await seed(page);await page.getByLabel('Tìm truyện').fill('mục lục');const before=await snapshot(page);
  const panel=await detail(page);await expect(panel.getByRole('heading',{name:'Truyện mục lục',exact:true})).toBeVisible();
  await expect(panel).toContainText('Tác giả mẫu');await expect(panel.locator('.story-chapter-list button')).toHaveCount(60);
  await expect(panel.getByRole('button',{name:'Chương 2: Kiểm thử',exact:true})).toHaveAttribute('aria-current','true');
  await panel.getByRole('button',{name:'Trang mục lục sau',exact:true}).click();await expect(panel.locator('.story-chapter-list button')).toHaveCount(5);
  await expect(panel.getByRole('button',{name:'Chương 61: Kiểm thử',exact:true})).toBeVisible();
  await panel.getByLabel('Tìm chương').fill('Chương 65:');await expect(panel.locator('.story-chapter-list button')).toHaveCount(1);
  await panel.getByLabel('Tìm chương').fill('không có chương');await expect(panel.locator('.story-chapter-list button')).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();await expect(page.getByLabel('Tìm truyện')).toHaveValue('mục lục');
});

test('resume, first chapter and selected chapter return to story detail',async({page})=>{
  await seed(page,3);let panel=await detail(page);
  await page.screenshot({path:`docs/screenshots/story-detail-${test.info().project.name}.png`,fullPage:true});
  await panel.getByRole('button',{name:'Đọc tiếp',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung chương 2.');
  await page.getByRole('button',{name:'← Thông tin truyện',exact:true}).click();panel=page.getByRole('region',{name:'Thông tin truyện',exact:true});
  await panel.getByRole('button',{name:'Đọc từ đầu',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung chương 1.');
  await page.getByRole('button',{name:'← Thông tin truyện',exact:true}).click();
  await page.evaluate(()=>{const original=Element.prototype.scrollIntoView;(window as unknown as {detailRestored:string}).detailRestored='';Element.prototype.scrollIntoView=function(options){if(this.hasAttribute('data-paragraph'))(window as unknown as {detailRestored:string}).detailRestored=this.textContent||'';return original.call(this,options);};});
  await panel.getByRole('button',{name:'Chương 3: Kiểm thử',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung chương 3.');
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {detailRestored:string}).detailRestored)).toContain('Chương 3: Kiểm thử');
  await page.getByRole('button',{name:'← Thông tin truyện',exact:true}).click();await expect(panel).toBeVisible();
  await expect.poll(()=>page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.progress.get('detail-book'))?.chapterId;})).toBe('detail-3');
  await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();await page.reload();
  await page.getByRole('button',{name:'Mở sách →',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung chương 3.');
});

test('deleted book and missing progress chapter do not open an unrelated chapter',async({page})=>{
  await seed(page,3);
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.progress.update('detail-book',{chapterId:'missing-chapter'});});
  let panel=await detail(page);await expect(panel).toContainText('Chương đã lưu không còn khả dụng');await panel.getByRole('button',{name:'Đọc tiếp',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung chương 1.');
  await page.getByRole('button',{name:'← Thông tin truyện',exact:true}).click();panel=page.getByRole('region',{name:'Thông tin truyện',exact:true});
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.books.delete('detail-book');});
  await expect(panel.getByRole('button',{name:'Đọc từ đầu',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'← Tủ sách',exact:true})).toBeVisible();
});

test('empty story disables reading and leaves saved data unchanged',async({page})=>{
  await seed(page,0);const before=await snapshot(page);const panel=await detail(page);
  await expect(panel).toContainText('Truyện chưa có chương để đọc.');
  await expect(panel.getByRole('button',{name:'Đọc từ đầu',exact:true})).toBeDisabled();
  await expect(panel.getByRole('button',{name:'Đọc tiếp',exact:true})).toBeDisabled();
  expect(await snapshot(page)).toEqual(before);
});
