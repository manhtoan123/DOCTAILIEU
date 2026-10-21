import {test,expect,type Page} from '@playwright/test';
async function open(page:Page){await page.goto('/');await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('dictionary');return page.getByRole('region',{name:'Convert đoạn chữ Trung'});}
async function seed(page:Page){await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.dictionaries.bulkPut([
 {kind:'vp',name:'Vietphrase.txt',blob:new Blob(['来到=đi tới/đến\n山门=sơn môn/cổng núi']),sha256:'synthetic-vp',updatedAt:1},
 {kind:'names',name:'Names.txt',blob:new Blob(['李明=Lý Minh']),sha256:'synthetic-name',updatedAt:1}
]);});}
test('fixed word edit survives reload and Name List changes invalidate another tab',async({page,context})=>{
 const panel=await open(page);await seed(page);await panel.getByLabel('Văn bản Trung',{exact:true}).fill('李明来到山门。');await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();
 await expect(panel.getByLabel('Kết quả Convert')).toContainText('Lý Minh đi tới sơn môn.');await panel.getByRole('button',{name:'Tra 山门',exact:true}).click();
 await panel.getByLabel('Tên Việt tạm',{exact:true}).fill('Đại Môn');await panel.getByRole('button',{name:'Thêm Name',exact:true}).click();
 await expect(panel.getByLabel('Kết quả Convert')).toContainText('Đại Môn');await expect(panel.getByLabel('Name List',{exact:true})).toHaveValue('山门=Đại Môn');
 await page.reload();await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('dictionary');
 await expect(panel.getByLabel('Name List',{exact:true})).toHaveValue('山门=Đại Môn');await panel.getByLabel('Văn bản Trung',{exact:true}).fill('李明来到山门。');await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();await expect(panel.getByLabel('Kết quả Convert')).toContainText('Đại Môn');
 const other=await context.newPage(),otherPanel=await open(other);await expect(otherPanel.getByLabel('Name List',{exact:true})).toHaveValue('山门=Đại Môn');
 await otherPanel.getByLabel('Name List',{exact:true}).fill('山门=Cổng Mới\n李明=Lý Đã Lưu');await otherPanel.getByRole('button',{name:'Lưu Name List',exact:true}).click();
 await expect(otherPanel.getByRole('status')).toContainText('Đã lưu Name List');await expect(panel.getByLabel('Kết quả Convert')).toBeEmpty();await expect(panel.getByLabel('Văn bản Trung',{exact:true})).toHaveValue('李明来到山门。');
 await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();await expect(panel.getByLabel('Kết quả Convert')).toContainText('Lý Đã Lưu đi tới Cổng Mới.');await other.close();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('failed persistent write retains draft and stored meaning',async({page})=>{
 const panel=await open(page);await panel.getByLabel('Name List',{exact:true}).fill('李明=Tên Cũ');await panel.getByRole('button',{name:'Lưu Name List',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Đã lưu Name List');
 await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);db.settings.put=()=>Promise.reject(new Error('synthetic write failure'));});
 await panel.getByLabel('Name List',{exact:true}).fill('李明=Tên Mới');await panel.getByRole('button',{name:'Lưu Name List',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Không lưu được');await expect(panel.getByLabel('Name List',{exact:true})).toHaveValue('李明=Tên Mới');
 expect(await page.evaluate(async()=>{const path='/src/features/names-convert/services/convert-names.ts';const {readConvertNames}=await import(/* @vite-ignore */path);return readConvertNames();})).toEqual([{key:'李明',value:'Tên Cũ'}]);
});
