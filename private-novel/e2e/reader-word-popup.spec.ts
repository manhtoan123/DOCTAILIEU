import {test,expect,type Page} from '@playwright/test';
async function isolate(page:Page){await page.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));await page.route('**/api/state**',r=>r.fulfill({status:503,json:{error:'isolated'}}));await page.route('**/api/prompts**',r=>r.fulfill({json:{revision:0,rows:[]}}));}
async function open(page:Page){
 await isolate(page);
 await page.goto('/');await page.evaluate(async()=>{localStorage.setItem('convert-backend','local');const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.dictionaries.bulkPut([{kind:'vp',name:'Vietphrase.txt',blob:new Blob(['山门=sơn môn/cổng núi']),sha256:'fixture-vp',updatedAt:1},{kind:'hanviet',name:'HanViet.txt',blob:new Blob(['山=sơn\n门=môn']),sha256:'fixture-hv',updatedAt:1}]);await db.books.add({id:'popup-book',title:'Popup fixture',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:6});await db.chapters.add({id:'popup-chapter',bookId:'popup-book',order:0,title:'Chương 1',text:'山门。山门。',revision:1,sourceId:''});});
 await page.goto('/read/popup-book/popup-chapter');await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Sơn môn.');
 await page.locator('.word-token').filter({hasText:/sơn môn/i}).first().click();const popup=page.getByRole('dialog',{name:'Chỉnh Name',exact:true});await expect(popup.getByLabel('Hán-Việt',{exact:true})).toHaveValue('sơn môn');return popup;
}
test('Convert opens compact STV editor; temporary edit changes only chosen occurrence',async({page})=>{
 const popup=await open(page);await expect(page.getByRole('button',{name:'Convert',exact:true})).toHaveCount(1);await expect(page.getByRole('button',{name:/Sửa từ:/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/^Name \(/})).toHaveCount(0);await expect(page.locator('.unity-trigger')).toHaveCount(0);
 await popup.getByLabel('Chữ Trung',{exact:true}).fill('山门山门');await expect(popup.getByLabel('Nghĩa Vietphrase',{exact:true})).toHaveValue('sơn môn sơn môn');await popup.getByLabel('Chữ Trung',{exact:true}).fill('山门');
 await expect(popup).toHaveCSS('width','256px');await expect(popup).toHaveCSS('background-color','rgb(23, 162, 184)');
 await expect(popup.locator('.stv-word-row > label').first()).toHaveCSS('background-color','rgb(0, 128, 0)');
 await expect(popup.getByRole('button',{name:'Áp dụng Hán-Việt',exact:true})).toHaveCSS('background-color','rgb(255, 255, 255)');
 await expect(popup.getByLabel('Hán-Việt viết hoa',{exact:true})).toHaveValue('Sơn Môn');await expect(popup.getByLabel('Chữ Trung',{exact:true})).toHaveValue('山门');
 await popup.getByLabel('Cụm từ tùy chọn',{exact:true}).fill('Cổng Tạm');await page.screenshot({path:`docs/screenshots/word-popup-${test.info().project.name}.png`});
 await popup.getByRole('button',{name:'Áp dụng cụm từ tùy chọn',exact:true}).click();await expect(popup).toHaveCount(0);await expect(page.locator('.prose')).toContainText('Cổng Tạm. Sơn môn.');
 expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.names.count();})).toBe(0);
});
test('blank Hán Việt hides a Name in Convert and preserves the original after reload',async({page})=>{
 const popup=await open(page);
 await popup.getByRole('button',{name:'Thêm Name',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'Thêm name/Chỉnh name',exact:true});
 await modal.getByLabel('Tên Việt để lưu').fill('');
 await modal.getByRole('button',{name:'Thêm Hán Việt',exact:true}).click();
 await expect(modal).toHaveCount(0);
 await expect(page.locator('.prose')).not.toContainText(/sơn môn/i);
 await expect(page.locator('.prose')).toContainText('..');
 await page.reload();
 await page.getByRole('button',{name:'Convert',exact:true}).click();
 await expect(page.locator('.prose')).toContainText('..');
 await page.getByRole('button',{name:'Bản gốc',exact:true}).click();
 await expect(page.locator('.prose')).toContainText('山门。山门。');
});
test('Add Name offers STV capitalization variants and persists the chosen spelling',async({page})=>{
 const popup=await open(page);await popup.getByRole('button',{name:'Thêm Name',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'Thêm name/Chỉnh name',exact:true});
 for(const [label,result] of [['Hoa chữ đầu','Trương tam phong'],['Hoa 2 chữ đầu','Trương Tam phong'],['Thường chữ cuối','Trương Tam phong'],['Hoa toàn bộ','Trương Tam Phong']]){
   await modal.getByLabel('Tên Việt để lưu',{exact:true}).fill('TRƯƠNG TAM PHONG');
   await modal.getByRole('button',{name:label,exact:true}).click();
   await expect(modal.getByLabel('Tên Việt để lưu',{exact:true})).toHaveValue(result);
 }
 expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.names.count();})).toBe(0);
 await modal.getByRole('button',{name:'Thêm Hán Việt',exact:true}).click();
 await expect(page.locator('.prose')).toContainText('Trương Tam Phong');
 await page.reload();await page.goto('/read/popup-book/popup-chapter');await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Trương Tam Phong');
});
test('disk saves fixed book Name; failed write keeps editor and draft',async({page})=>{
 let popup=await open(page);await popup.getByLabel('Cụm từ tùy chọn',{exact:true}).fill('Cổng Đã Lưu');await popup.getByRole('button',{name:'Lưu cụm từ tùy chọn',exact:true}).click();await expect(popup).toHaveCount(0);await expect(page.locator('.prose')).toContainText('Cổng Đã Lưu. Cổng Đã Lưu.');
 await page.reload();await page.goto('/read/popup-book/popup-chapter');await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng Đã Lưu');await page.locator('.word-token').filter({hasText:'Cổng Đã Lưu'}).first().click();popup=page.getByRole('dialog',{name:'Chỉnh Name',exact:true});await expect(popup.getByLabel('Hán-Việt',{exact:true})).toHaveValue('sơn môn');
 await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);db.names.put=()=>{throw new Error('synthetic storage failure');};});await popup.getByLabel('Cụm từ tùy chọn',{exact:true}).fill('Nháp Giữ Lại');await popup.getByRole('button',{name:'Lưu cụm từ tùy chọn',exact:true}).click();await expect(popup.getByRole('alert')).toContainText('synthetic storage failure');await expect(popup.getByLabel('Cụm từ tùy chọn',{exact:true})).toHaveValue('Nháp Giữ Lại');
});
test('retokenizing a saved Name drops only incompatible temporary ranges',async({page})=>{
 await isolate(page);await page.goto('/');await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.dictionaries.bulkPut([{kind:'vp',name:'Vietphrase.txt',blob:new Blob(['山=mountain\n门=gate\n水=water']),sha256:'fixture-retokenize',updatedAt:1}]);await db.books.add({id:'retokenize-book',title:'Retokenize fixture',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:9});await db.chapters.add({id:'retokenize-chapter',bookId:'retokenize-book',order:0,title:'Chương 1',text:'山门。山门。水。',revision:1,sourceId:''});});
 await page.goto('/read/retokenize-book/retokenize-chapter');await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Mountain gate. Mountain gate. Water.');
 await page.locator('.word-token').filter({hasText:'Mountain'}).first().click();let popup=page.getByRole('dialog',{name:'Chỉnh Name',exact:true});await popup.getByLabel('Cụm từ tùy chọn',{exact:true}).fill('Temporary Mountain');await popup.getByRole('button',{name:'Áp dụng cụm từ tùy chọn',exact:true}).click();
 await page.locator('.word-token').filter({hasText:'Water'}).click();popup=page.getByRole('dialog',{name:'Chỉnh Name',exact:true});await popup.getByLabel('Cụm từ tùy chọn',{exact:true}).fill('Temporary Water');await popup.getByRole('button',{name:'Áp dụng cụm từ tùy chọn',exact:true}).click();
 await page.getByRole('button',{name:'Mountain',exact:true}).click();popup=page.getByRole('dialog',{name:'Chỉnh Name',exact:true});await popup.getByRole('button',{name:'Mở rộng sang phải',exact:true}).click();await expect(popup.getByLabel('Chữ Trung',{exact:true})).toHaveValue('山门');await popup.getByLabel('Cụm từ tùy chọn',{exact:true}).fill('New Gate');await popup.getByRole('button',{name:'Lưu cụm từ tùy chọn',exact:true}).click();
 await expect(page.locator('.prose')).toContainText('New Gate. New Gate. Temporary Water.');
 await page.locator('.word-token').filter({hasText:'Temporary Water'}).click();popup=page.getByRole('dialog',{name:'Chỉnh Name',exact:true});await popup.getByLabel('Cụm từ tùy chọn',{exact:true}).fill('Updated Water');await popup.getByRole('button',{name:'Áp dụng cụm từ tùy chọn',exact:true}).click();await expect(page.locator('.prose')).toContainText('New Gate. New Gate. Updated Water.');
});

test('STV Name dialog refreshes source suggestions and deletes only the book Name',async({page})=>{
 const popup=await open(page);await popup.getByRole('button',{name:'Thêm Name',exact:true}).click();let modal=page.getByRole('dialog',{name:'Thêm name/Chỉnh name',exact:true});
 await expect(modal.getByLabel('Vietphrase gợi ý')).toHaveValue('sơn môn');await modal.getByLabel('Vietphrase gợi ý').selectOption('cổng núi');await modal.getByRole('button',{name:'Dùng Vietphrase',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng núi. Cổng núi.');
 await page.locator('.word-token').filter({hasText:/cổng núi/i}).first().click();await page.getByRole('button',{name:'Thêm Name',exact:true}).click();modal=page.getByRole('dialog',{name:'Thêm name/Chỉnh name',exact:true});await expect(modal.getByLabel('Name trong kho')).toHaveValue('cổng núi');await modal.getByLabel('Tên Anh để lưu').fill('Mountain Gate');await page.screenshot({path:`docs/screenshots/name-stv-${test.info().project.name}.png`});await modal.getByRole('button',{name:'Thêm Name Anh',exact:true}).click();await expect(page.locator('.prose')).toContainText('Mountain Gate. Mountain Gate.');
 await page.locator('.word-token').filter({hasText:'Mountain Gate'}).first().click();await page.getByRole('button',{name:'Thêm Name',exact:true}).click();modal=page.getByRole('dialog',{name:'Thêm name/Chỉnh name',exact:true});await modal.getByLabel('Chữ Trung để lưu').fill('山');await expect(modal.getByLabel('Tên Việt để lưu')).toHaveValue('sơn');await expect(modal.getByLabel('Tên Anh để lưu')).toHaveValue('');await expect(modal.getByRole('button',{name:'Xóa name',exact:true})).toBeDisabled();await modal.getByLabel('Chữ Trung để lưu').fill('山门');await expect(modal.getByLabel('Tên Việt để lưu')).toHaveValue('sơn môn');await expect(modal.getByRole('button',{name:'Xóa name',exact:true})).toBeEnabled();await modal.getByRole('button',{name:'Xóa name',exact:true}).click();await expect(page.locator('.prose')).toContainText('Sơn môn. Sơn môn.');
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');const {nameTombKey}=await import('/src/features/sync-cloud/services/shared-name-intents.ts');return {names:await db.names.count(),intent:(await db.settings.get(nameTombKey('popup-book','山门')))?.value};})).toEqual({names:0,intent:{kind:'name',bookId:'popup-book',key:'山门',value:null}});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
