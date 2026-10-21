import {test,expect} from '@playwright/test';
test('AI Converts the chapter heading while RAW and stored source stay unchanged',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:503}));await page.goto('/');
 await page.evaluate(async()=>{
  const {db}=await import('/src/core/db.ts'),{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');
  await db.books.put({id:'title-book',title:'Truyện kiểm tiêu đề',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:6,chapterCount:1});
  await db.chapters.put({id:'title-chapter',bookId:'title-book',order:0,title:'第042章 安静的发电站',text:'故事原文。',revision:1,sourceId:''});
  await db.dictionaries.put({kind:'vp',name:'Title fixture',blob:new Blob(['第042章 安静的发电站=Chương 042: Trạm phát điện tĩnh lặng']),sha256:'title-fixture',updatedAt:1});
  await db.settings.put({key:'ai-book-settings:title-book',value:{...AI_DEFAULTS,model:'gemini-2.5-flash'}});
 });
 await page.goto('/read/title-book/title-chapter');await expect(page.locator('.chapter-title-menu')).toHaveText('第042章 安静的发电站');
 await page.route('**/api/ai/translate',r=>r.fulfill({json:{model:'gemini-2.5-flash',result:'Nội dung đã dịch.',finishReason:'STOP',inputTokens:1,outputTokens:2}}));
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nội dung đã dịch.');await expect(page.locator('.chapter-title-menu')).toHaveText('Chương 042: Trạm phát điện tĩnh lặng');
 await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('.chapter-title-menu')).toHaveText('第042章 安静的发电站');
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');const c=await db.chapters.get('title-chapter');return {title:c?.title,text:c?.text};})).toEqual({title:'第042章 安静的发电站',text:'故事原文。'});
});
