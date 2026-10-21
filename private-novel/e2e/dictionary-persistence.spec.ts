import {test,expect} from '@playwright/test';
test('saved Vietphrase survives reloads and converts without selecting the file again',async({page})=>{
 await page.goto('/');const dictionaries=async()=>{await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('dictionary');};await dictionaries();
 await page.getByLabel('Chọn file TXT (có thể chọn nhiều)').setInputFiles({name:'Vietphrase.txt',mimeType:'text/plain',buffer:Buffer.from('山门=sơn môn\n你好=xin chào')});
 await page.getByRole('button',{name:'Lưu 1 file vào trình duyệt',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã lưu 1 file'})).toBeVisible();
 const snapshot=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);const row=await db.dictionaries.get('vp');return {hash:row!.sha256,bytes:await row!.blob.text()};});
 await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.books.put({id:'dictionary-persistence',title:'Từ điển kiểm tra',author:'',status:'ready',chapterCount:1,charCount:4,createdAt:1,updatedAt:1});await db.chapters.put({id:'dictionary-chapter',bookId:'dictionary-persistence',title:'Chương thử',text:'你好山门',order:0,revision:1,sourceId:''});});
 for(let attempt=0;attempt<3;attempt++){
   await page.goto('/settings/dictionary');await page.reload();
   await expect(page.getByRole('heading',{name:'Từ điển đã lưu trên thiết bị',exact:true})).toBeVisible();
   await expect(page.locator('.dictionary-list').filter({hasText:'Vietphrase.txt'})).toContainText('Vietphrase.txt');
   await expect(page.getByRole('button',{name:'Lưu 1 file vào trình duyệt',exact:true})).toHaveCount(0);
   await page.goto('/read/dictionary-persistence/dictionary-chapter');await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Xin chào sơn môn');
   expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);const row=await db.dictionaries.get('vp');return {hash:row!.sha256,bytes:await row!.blob.text()};})).toEqual(snapshot);
 }
});
