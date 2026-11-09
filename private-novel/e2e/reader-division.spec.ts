import {test,expect,type Page} from '@playwright/test';
async function seed(page:Page){
 await page.route('**/api/**',r=>r.fulfill({json:{revision:0,rows:[],payload:null,books:[],ids:[],keys:[],dictionaries:[]}}));
 await page.goto('/');
 await page.evaluate(async()=>{
  const {db}=await import('/src/core/db.ts'),{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');
  await db.settings.put({key:'reader-options',value:{preloadAi:false,autoNext:false,mode:'original'}});
  await db.settings.put({key:'ai-book-settings:division-ui',value:{...AI_DEFAULTS,splitParts:false}});
  await db.books.put({id:'division-ui',title:'Truyện kiểm tra giao diện',author:'',status:'ready',chapterCount:130,charCount:104000,createdAt:1,updatedAt:1});
  await db.chapters.bulkPut(Array.from({length:130},(_,i)=>({id:`division-${i+1}`,bookId:'division-ui',title:`Chương ${i+1}: Vị trí đang đọc`,order:i+1,sourceId:'',text:'甲'.repeat(800),revision:1})));
 });
 await page.goto('/read/division-ui/division-123');
}
test('reports recovery parts and reason after reload, separates next chapter, and removes the footer link',async({page},testInfo)=>{
 await seed(page);let calls=0;
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls++;return calls===1?r.fulfill({status:502,headers:{'x-ai-failure-reason':'output_limit'},json:{error:'ai_incomplete_result'}}):r.fulfill({json:{result:'Đoạn dịch đầy đủ ♾',model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Đoạn dịch đầy đủ');await expect.poll(()=>calls).toBe(3);
 await page.locator('.ai-trigger').click();const panel=page.getByRole('dialog',{name:'Dịch AI',exact:true});
 const current=panel.locator('.ai-model-row').filter({hasText:'Chương này'});
 await expect(current).toContainText('2/2 phần hoàn tất');await expect(current).toContainText('AI trả bản dịch bị cắt');await expect(current).toContainText('Đã xong');
 await expect(panel.getByRole('button',{name:'Cài đặt dịch AI',exact:false})).toHaveCount(0);
 await page.evaluate(async()=>{
  const {db}=await import('/src/core/db.ts'),{readReaderAiPreferences}=await import('/src/features/ai/types/ai-reader-settings.ts'),{recommendedFallbackModels}=await import('/src/features/ai/services/ai-fallback.ts'),{writeAiReadingCache}=await import('/src/features/ai/services/ai-reading-cache.ts');
  const chapter=await db.chapters.get('division-124'),base=(await readReaderAiPreferences('division-ui')).settings,settings={...base,fallbackModels:recommendedFallbackModels(base.model)};
  const ok=await writeAiReadingCache({bookId:'division-ui',id:chapter!.id,revision:1,text:chapter!.text},settings,[],{result:'Chương sau đã dịch.',model:settings.model,finishReason:'STOP',inputTokens:1,outputTokens:1,division:{version:1,parts:4,reasons:['timeout']}});if(!ok)throw Error('synthetic cache setup failed');
 });
 await page.reload();await expect(page.locator('.prose')).toContainText('Đoạn dịch đầy đủ');await page.locator('.ai-trigger').click();
 await expect(current).toContainText('2/2 phần hoàn tất');await expect(current).toContainText('AI trả bản dịch bị cắt');await expect(current).toContainText('Đã xong');
 const next=panel.locator('.ai-model-row').filter({hasText:'Chương sau'});await expect(next).toContainText('4/4 phần hoàn tất');await expect(next).toContainText('Yêu cầu dịch quá thời gian');expect(calls).toBe(3);await expect(next).toContainText('Đã xong');await expect(panel.getByRole('switch',{name:'Dịch sẵn chương kế tiếp'})).not.toBeChecked();await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','ready');
 await page.screenshot({path:`.dsh-tmp/reader-division-panel-${testInfo.project.name}.png`});
});
test('table of contents opens at the current chapter and chapter navigation has larger tap areas',async({page},testInfo)=>{
 await seed(page);
 const next=page.getByRole('navigation',{name:'Điều hướng chương đầu trang'}).getByRole('link',{name:'Chương sau →'});const bounds=await next.boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(48);expect(bounds!.width).toBeGreaterThan(page.viewportSize()!.width/4);
 await page.getByRole('button',{name:'☷ Mục lục',exact:true}).first().click();const toc=page.getByRole('dialog',{name:'Mục lục',exact:true});
 await expect(toc.locator('.toc-reading')).toContainText('Chương 123');const current=toc.locator('[aria-current="page"]');await expect(current).toContainText('Chương 123');await expect(current).toContainText('Đang đọc');await expect(current).toBeInViewport();
 await expect(toc.locator('.toc button').first()).toContainText('Chương 121');
 await page.screenshot({path:`.dsh-tmp/reader-division-toc-${testInfo.project.name}.png`});
 await toc.getByLabel('Tìm chương').fill('Chương 2:');await expect(toc.locator('.toc button')).toHaveCount(1);await expect(toc.locator('.toc-reading')).toContainText('Chương 123');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'☷ Mục lục',exact:true}).first().click();await expect(current).toBeInViewport();await expect(toc.getByLabel('Tìm chương')).toHaveValue('');
});


test('single-part facts stay known through RAM reuse and reload without translating again',async({page})=>{
 await seed(page);let calls=0;
 await page.route('**/api/ai/translate',r=>{calls++;return r.fulfill({json:{result:'Bản dịch một phần hoàn tất.',model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch một phần hoàn tất.');
 const panel=page.getByRole('dialog',{name:'Dịch AI',exact:true}),current=panel.locator('.ai-model-row').filter({hasText:'Chương này'});
 await page.locator('.ai-trigger').click();await expect(current).toContainText('1/1 phần hoàn tất');await panel.getByRole('button',{name:'Ẩn Dịch AI',exact:true}).click();await expect(page.locator('.ai-trigger')).toBeFocused();await page.locator('.ai-trigger').click();await expect(current).toContainText('1/1 phần hoàn tất');expect(calls).toBe(1);await panel.getByRole('button',{name:'Ẩn Dịch AI',exact:true}).click();
 await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch một phần hoàn tất.');await page.locator('.ai-trigger').click();await expect(current).toContainText('1/1 phần hoàn tất');
 await page.reload();await expect(page.locator('.prose')).toContainText('Bản dịch một phần hoàn tất.');await page.locator('.ai-trigger').click();await expect(current).toContainText('1/1 phần hoàn tất');expect(calls).toBe(1);
});
