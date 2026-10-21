import {test,expect} from '@playwright/test';
test('RAW default avoids dictionary download; title opens book details; headphones speak AI with book-only names',async({page})=>{
 let dictionaries=0,tts:string[]=[],requests:any[]=[];
 await page.route('**/api/dictionaries/**',route=>{dictionaries++;return route.abort();});
 await page.route('**/api/ai/translate',route=>{requests.push(route.request().postDataJSON());return route.fulfill({json:{result:'Bản AI đang đọc. Câu tiếp theo.',model:'gemini-3.5-flash',finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.addInitScript(()=>{(window as any).Audio=class{playbackRate=1;removeAttribute(){}load(){}play(){return Promise.resolve();}pause(){}};});
 await page.route('https://ottsy.weilbyte.dev/api/generation',route=>{tts.push(route.request().postDataJSON().text);return route.fulfill({json:{success:true,data:'//PkxAAAAAAA',error:null}});});
 await page.goto('/');await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await expect(page.locator('.prose')).toContainText('Buổi sáng');expect(dictionaries).toBe(0);await expect(page.locator('.word-token')).toHaveCount(0);
 await page.getByRole('button',{name:'Mở thông tin và mục lục truyện'}).click();await expect(page.getByRole('region',{name:'Thông tin truyện',exact:true})).toBeVisible();await page.getByRole('button',{name:'Đọc tiếp',exact:true}).click();await page.getByRole('navigation',{name:'Điều hướng chương đầu trang'}).getByRole('button',{name:'☷ Mục lục',exact:true}).click();await expect(page.getByRole('dialog',{name:'Mục lục'})).toBeVisible();await page.getByRole('button',{name:'Đóng',exact:true}).click();
 await page.evaluate(async()=>{const {saveConvertNames}=await import('/src/features/names-convert/services/convert-names.ts');await saveConvertNames('全局=GLOBAL_SENTINEL');});
 await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản AI đang đọc');await expect.poll(()=>tts.length).toBeGreaterThan(0);expect(tts.join('')).toContain('Bản AI');expect(requests[0].names).not.toHaveProperty('全局');expect(dictionaries).toBe(0);await expect(page.locator('.spoken-text')).toContainText('Bản AI');
});
test('shared Names are editable from Reader and empty album deletes directly',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();
 await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.dictionaries.put({kind:'names',name:'Names.txt',blob:new Blob(['中=Old']),sha256:'synthetic',updatedAt:1});});
 await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'✎ Name',exact:true}).click();await page.getByRole('button',{name:'Names chung',exact:true}).click();
 await page.getByLabel('Chữ nguồn chung').fill('中');await page.getByLabel('Tên Việt chung').fill('Trung');await page.getByRole('button',{name:'Lưu Name chung'}).click();await expect(page.getByRole('button',{name:'中 = Trung',exact:true})).toBeVisible();await page.getByRole('button',{name:'Xóa Name chung 中'}).click();await expect(page.getByRole('button',{name:'中 = Trung',exact:true})).toHaveCount(0);
 await page.goto('/');await page.evaluate(async()=>{const {createAlbum}=await import('/src/features/library/services/album-registry.ts');await createAlbum('Empty synthetic');});await expect(page.getByRole('button',{name:'Xóa Album Empty synthetic và truyện'})).toBeVisible();await page.getByRole('button',{name:'Xóa Album Empty synthetic và truyện'}).click();await expect(page.getByRole('button',{name:'Xóa Album Empty synthetic và truyện'})).toHaveCount(0);
});
