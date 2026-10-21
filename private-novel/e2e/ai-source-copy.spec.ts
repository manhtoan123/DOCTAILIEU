import {test,expect,type Page} from '@playwright/test';
const book='copy-guard-book',chapter='copy-guard-chapter';
async function seed(page:Page,text:string){
  await page.route('**/api/**',r=>r.fulfill({status:503}));await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.evaluate(async({book,chapter,text})=>{const{db}=await import('/src/core/db.ts'),{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');await db.settings.put({key:'reader-options',value:{preloadAi:false}});await db.settings.put({key:`ai-book-settings:${book}`,value:{...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[]}});await db.books.put({id:book,title:'Kiểm tra bản dịch',author:'',status:'ready',chapterCount:1,charCount:text.length,createdAt:1,updatedAt:1});await db.chapters.put({id:chapter,bookId:book,title:'Chương thử',text,revision:1,order:0,sourceId:''});},{book,chapter,text});
  await page.goto(`/read/${book}/${chapter}`,{waitUntil:'domcontentloaded'});await expect(page.locator('.reader-book-heading h1')).toHaveText('Kiểm tra bản dịch');
}
async function state(page:Page){return page.evaluate(async({book,chapter})=>{const{db}=await import('/src/core/db.ts');return{source:(await db.chapters.get(chapter))?.text,progress:await db.progress.get(book),completeCache:await db.settings.where('key').startsWith('ai-reading-cache:v1:').count()};},{book,chapter});}
const answer=(result:string,model:string)=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:1});

test('copied source splits once, preserves RAW and advances AI progress only after both valid children',async({page})=>{
  const source='甲'.repeat(400)+'乙'.repeat(400);await seed(page,source);const calls:string[]=[];let release!:()=>void;
  await page.route('**/api/ai/translate',async route=>{const input=route.request().postDataJSON();calls.push(input.text);if(input.text.length===800)return route.fulfill({json:answer(input.text,input.model)});if(input.text.startsWith('乙'))await new Promise<void>(resolve=>release=resolve);return route.fulfill({json:answer(input.text.startsWith('甲')?'Nửa đầu hợp lệ.':'Nửa sau hợp lệ.',input.model)});});
  await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>calls.length).toBe(3);expect(calls.map(v=>v.length)).toEqual([800,400,400]);const pending=await state(page);expect(pending.source).toBe(source);expect(pending.progress?.mode).not.toBe('ai');expect(pending.completeCache).toBe(0);
  release();await expect(page.locator('.prose')).toContainText('Nửa đầu hợp lệ.');await expect(page.locator('.prose')).toContainText('Nửa sau hợp lệ.');await expect.poll(async()=>(await state(page)).progress?.mode).toBe('ai');expect((await state(page)).source).toBe(source);expect(calls).toHaveLength(3);
});

test('an unsplittable mixed Han result stays an error and creates no complete cache or AI progress',async({page})=>{
  const source='甲'.repeat(300);await seed(page,source);let calls=0;
  await page.route('**/api/ai/translate',route=>{calls++;const input=route.request().postDataJSON();return route.fulfill({json:answer('Bản tiếng Việt còn '+input.text[0],input.model)});});
  await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.reader-convert-status')).toContainText('AI còn để nguyên một đoạn tiếng Trung');const result=await state(page);expect(result.source).toBe(source);expect(result.progress?.mode).not.toBe('ai');expect(result.completeCache).toBe(0);expect(calls).toBe(1);
});
