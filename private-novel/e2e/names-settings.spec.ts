import {test,expect,type Page} from '@playwright/test';
async function seed(page:Page,album=false,count=2){
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'isolated Name fixture'}}));await page.goto('/');
 await page.evaluate(async({album,count})=>{const {db}=await import('/src/core/db.ts');for(const [id,title,path]of [['names-a','Name A','Tác giả/Series 1'],['names-b','Name B','Tác giả/Series 2'],['names-c','Name C','Tác giả khác']]){await db.books.put({id,title,album:album?path:undefined,author:'',status:'ready',chapterCount:1,charCount:5,createdAt:1,updatedAt:1});await db.chapters.put({id:id+'-chapter',bookId:id,order:0,title:'Chương 1',text:'山门。水。',revision:1,sourceId:''});}
 await db.dictionaries.put({kind:'vp',name:'Synthetic VP',blob:new Blob(['山门=cổng núi\n水=nước']),sha256:'names-synthetic-vp',updatedAt:1});
 const names=[{id:'a-gate',bookId:'names-a',key:'山门',value:'Cổng A'},{id:'a-water',bookId:'names-a',key:'水',value:'Nước A'},{id:'b-gate',bookId:'names-b',key:'山门',value:'Cổng B'}];for(let i=2;i<count;i++)names.push({id:'extra-'+i,bookId:'names-a',key:'名字'+i,value:'Tên '+i});await db.names.bulkPut(names);
 const {CONVERT_NAMES_KEY}=await import('/src/features/names-convert/services/convert-names.ts');await db.settings.put({key:CONVERT_NAMES_KEY,value:[{key:'李',value:'Tên chung'}]});},{album,count});
 await page.goto('/settings/names/names-a');const panel=page.getByRole('region',{name:'Name riêng',exact:true});await expect(panel.getByLabel('Tìm Name',{exact:true})).toBeVisible();return panel;
}
async function bulk(panel:ReturnType<Page['getByRole']>){const details=panel.locator('.name-manager-advanced');await details.locator('summary').click();return panel.getByLabel('Nội dung Name List');}

test('standalone draft survives selection, merge preserves other/global entries and reload restores selection',async({page})=>{
 const panel=await seed(page),field=await bulk(panel),select=panel.getByLabel('Kho Name',{exact:true});
 await field.fill('山门=Cổng mới\n张=Trương');await select.selectOption('book:names-b');await expect(panel.getByLabel('Nội dung Name List')).toHaveValue('山门=Cổng B');await select.selectOption('book:names-a');await expect(panel.getByLabel('Nội dung Name List')).toHaveValue('山门=Cổng mới\n张=Trương');
 await panel.locator('.name-manager-advanced summary').click();await panel.getByRole('button',{name:'Lưu nhiều tên',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Đã lưu');
 const actual=await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');const {CONVERT_NAMES_KEY}=await import('/src/features/names-convert/services/convert-names.ts');return {a:await db.names.where('bookId').equals('names-a').toArray(),b:await db.names.get('b-gate'),common:(await db.settings.get(CONVERT_NAMES_KEY))?.value};});
 expect(actual.a).toEqual(expect.arrayContaining([expect.objectContaining({id:'a-gate',value:'Cổng mới'}),expect.objectContaining({id:'a-water',value:'Nước A'})]));expect(actual.a).toHaveLength(3);expect(actual.b?.value).toBe('Cổng B');expect(actual.common).toEqual([{key:'李',value:'Tên chung'}]);
 await select.selectOption('book:names-b');await page.reload();await expect(page.getByLabel('Kho Name',{exact:true})).toHaveValue('book:names-b');
});

test('failed write preserves editable draft without changing saved Names',async({page})=>{
 const panel=await seed(page),field=await bulk(panel);await field.fill('山门=Nháp chưa lưu');
 await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');db.names.put=()=>{throw Error('synthetic Name failure');};});
 await panel.getByRole('button',{name:'Lưu nhiều tên',exact:true}).click();await expect(panel.getByRole('alert')).toHaveText('synthetic Name failure');await expect(field).toHaveValue('山门=Nháp chưa lưu');
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.names.get('a-gate'))?.value;})).toBe('Cổng A');
});

test('one author pool covers series, updates Convert in sibling book and retains raw legacy Names',async({page})=>{
 const panel=await seed(page,true),before=await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return db.names.toArray();});
 await expect(panel.getByLabel('Kho Name',{exact:true}).locator('option')).toHaveCount(2);await expect(panel).toContainText('Dùng chung cho 2 truyện');await expect(panel.locator('.name-scope-note')).toContainText('1 chữ');
 await panel.getByRole('button',{name:'Sửa Name 山门',exact:true}).click();await panel.getByLabel('Tên Việt của Name').fill('Cổng chung');await panel.getByRole('button',{name:'Lưu tên',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Album Tác giả');await expect(panel.locator('.name-scope-note')).toHaveCount(0);
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return db.names.toArray();})).toEqual(before);
 await page.goto('/read/names-b/names-b-chapter');await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng chung. Nước A.');
 await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'✎ Name',exact:true}).click();const readerPanel=page.getByRole('dialog',{name:'Name Album: Tác giả',exact:true});await readerPanel.getByRole('button',{name:'Sửa Name 水',exact:true}).click();await readerPanel.getByLabel('Tên Việt của Name').fill('Nước chung');await readerPanel.getByRole('button',{name:'Lưu tên',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nước chung');
 await page.goto('/read/names-a/names-a-chapter');await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng chung. Nước chung.');
 await page.goto('/read/names-c/names-c-chapter');await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).not.toContainText('Cổng chung');
});

test('compact author selector, hidden bulk editor, ten-row pages and 320px layout',async({page},info)=>{
 await page.setViewportSize({width:320,height:700});const panel=await seed(page,true,75);await expect(panel.getByLabel('Nội dung Name List')).toBeHidden();await expect(panel.getByLabel('Name đã lưu').locator('li')).toHaveCount(10);await expect(panel.getByRole('navigation',{name:'Trang Name'})).toContainText('1 / 8');
 await panel.getByLabel('Tìm Name',{exact:true}).fill('Tên 74');await expect(panel.getByLabel('Name đã lưu').locator('li')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'.dsh-tmp/album-names/settings-'+info.project.name+'.png',fullPage:true});
});
test('AI uses the shared author pool, preserves current result on Name edit and picks it up in sibling request',async({page})=>{
 await seed(page,true);await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts'),{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts'),{saveScopedBookNames}=await import('/src/features/names-convert/services/scoped-names.ts');await db.settings.put({key:'reader-options',value:{preloadAi:false,autoNext:false}});for(const id of ['names-a','names-b'])await db.settings.put({key:'ai-book-settings:'+id,value:{...AI_DEFAULTS,model:'gemini-2.5-flash',splitParts:false}});await saveScopedBookNames('names-a','山门=Cổng chung\n水=Nước chung');});
 const calls:any[]=[];await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls.push(input);return r.fulfill({json:{result:'Bản dịch AI đã hoàn thành.',model:input.model,finishReason:'STOP',inputTokens:10,outputTokens:10}});});
 await page.goto('/read/names-b/names-b-chapter');await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch AI đã hoàn thành.');expect(calls).toHaveLength(1);expect(calls[0].names).toMatchObject({'山门':'Cổng chung','水':'Nước chung'});
 await page.evaluate(async()=>{const {saveScopedBookNames}=await import('/src/features/names-convert/services/scoped-names.ts');await saveScopedBookNames('names-a','水=Nghĩa mới');});await page.waitForTimeout(400);await expect(page.locator('.prose')).toContainText('Bản dịch AI đã hoàn thành.');expect(calls).toHaveLength(1);
 await page.goto('/read/names-a/names-a-chapter');await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch AI đã hoàn thành.');expect(calls).toHaveLength(2);expect(calls[1].names).toMatchObject({'山门':'Cổng chung','水':'Nghĩa mới'});
});
