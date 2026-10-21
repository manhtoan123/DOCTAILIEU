import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){
 await page.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
 await page.goto('/');await page.evaluate(async()=>{
  const {db}=await import('/src/core/db.ts');
  await db.books.put({id:'album-book',title:'Album fixture',author:'',status:'ready',createdAt:1,updatedAt:2,chapterCount:1,charCount:6});
  await db.chapters.put({id:'album-ch',bookId:'album-book',order:0,title:'第1章',text:'林儿你好。',revision:1,sourceId:''});
  await db.settings.put({key:'ai-book-settings:album-book',value:{...(await import('/src/features/ai/services/ai-reading.ts')).AI_DEFAULTS,systemPrompt:'Preserve me.'}});
 });
}
async function manage(page:Page){await page.getByText('Quản lý Album',{exact:true}).click();await expect(page.getByLabel('Tên Album',{exact:true})).toBeEnabled();}
test('create empty album, reload, move, rename and remove preserve the complete book',async({page})=>{
 await setup(page);await page.evaluate(()=>{window.confirm=()=>{throw new Error('Unexpected confirmation');};});await manage(page);
 await page.getByLabel('Tên Album',{exact:true}).fill('Tập hợp');await page.getByRole('button',{name:'Tạo Album',exact:true}).click();
 await expect(page.getByLabel('Lọc Album').locator('option')).toContainText(['Tất cả truyện (1)','Chưa có Album (1)','Tập hợp (0)']);
 await page.reload();await manage(page);await page.getByLabel('Album cần sửa').selectOption({label:'Tập hợp'});
 const id=await page.getByLabel('Album cần sửa').inputValue();
 await page.getByLabel('Truyện cần chuyển Album').selectOption('album-book');await page.getByLabel('Album đích').selectOption(id);await page.getByRole('button',{name:'Chuyển truyện',exact:true}).click();
 await expect(page.locator('.book-card')).toContainText('Album: Tập hợp');
 await page.getByLabel('Tên Album',{exact:true}).fill('Mới');await page.getByRole('button',{name:'Đổi tên',exact:true}).click();
 await expect(page.getByLabel('Album cần sửa')).toHaveValue(id);await expect(page.locator('.book-card')).toContainText('Album: Mới');
 await page.getByRole('button',{name:'Gỡ Album',exact:true}).click();await expect(page.getByLabel('Album cần sửa').locator('option')).toHaveCount(1);
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return {book:await db.books.get('album-book'),chapter:await db.chapters.get('album-ch'),prompt:(await db.settings.get('ai-book-settings:album-book'))?.value};})).toMatchObject({book:{id:'album-book',title:'Album fixture',updatedAt:2,chapterCount:1},chapter:{id:'album-ch',text:'林儿你好。',revision:1},prompt:{systemPrompt:'Preserve me.'}});
 await expect(page.locator('.book-card')).not.toContainText('Album:');
});
test('an empty album committed through another connection refreshes the mounted panel',async({page})=>{
 await setup(page);await manage(page);
 const other=await page.context().newPage();
 await other.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
 await other.goto('/');
 await other.evaluate(async()=>{const p=await import('/src/features/library/services/album-registry.ts');await p.createAlbum('Ngoài bảng');});
 await expect(page.getByLabel('Album cần sửa').locator('option')).toContainText(['Tạo Album','Ngoài bảng']);
 await page.getByLabel('Album cần sửa').selectOption({label:'Ngoài bảng'});
 const id=await page.getByLabel('Album cần sửa').inputValue();
 await page.getByLabel('Truyện cần chuyển Album').selectOption('album-book');await page.getByLabel('Album đích').selectOption(id);
 await other.evaluate(async id=>{const p=await import('/src/features/library/services/album-registry.ts');await p.removeAlbum(id);},id);
 await expect(page.getByLabel('Album cần sửa').locator('option')).toHaveCount(1);
 await expect(page.getByLabel('Album cần sửa')).toHaveValue('');await expect(page.getByLabel('Album đích')).toHaveValue('');
 await expect(page.getByLabel('Tên Album',{exact:true})).toHaveValue('Ngoài bảng');
 await other.close();
});
