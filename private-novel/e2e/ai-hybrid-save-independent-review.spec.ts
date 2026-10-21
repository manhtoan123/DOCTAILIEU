import {test,expect,type Page} from '@playwright/test';

const book='hybrid-save-review-book',chapter='hybrid-save-review-chapter',text='甲'.repeat(1800)+'乙'.repeat(1800);
const updated='{{name}} NEW_SECOND_PROMPT\n{{firstHalfSource}}\n{{firstHalfTranslation}}\n{{text}}';
const answer=(result:string,model:string)=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:2});
async function seed(page:Page,sourceText=text){
 await page.route('**/api/**',r=>r.fulfill({status:503}));await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async({book,chapter,text})=>{const {db}=await import('/src/core/db.ts'),{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');await db.settings.put({key:'reader-options',value:{preloadAi:false}});await db.settings.put({key:`ai-book-settings:${book}`,value:{...AI_DEFAULTS,model:'gemini-2.5-flash',hybrid:{version:1,liteModel:'gemini-3.5-flash-lite',rules:''}}});await db.books.put({id:book,title:'Independent save review',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:text.length,chapterCount:1});await db.chapters.put({id:chapter,bookId:book,title:'Chapter',order:0,text,revision:1,sourceId:''});},{book,chapter,text:sourceText});
 await page.goto(`/read/${book}/${chapter}`,{waitUntil:'domcontentloaded'});await expect(page.locator('.reader-book-heading h1')).toHaveText('Independent save review');
}
async function saveSecondPrompt(page:Page){
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await page.getByLabel('Prompt nửa sau',{exact:true}).fill(updated);await page.getByRole('button',{name:'Lưu prompt',exact:true}).click();
 await expect.poll(()=>page.evaluate(async book=>{const {db}=await import('/src/core/db.ts');return ((await db.settings.get(`ai-book-settings:${book}`))?.value as any)?.hybrid?.secondHalfPrompt;},book)).toBe(updated);
 await page.getByRole('button',{name:'Ẩn Dịch AI',exact:true}).click();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}

test('independent save: failed stage keeps its visible prefix and sends nothing until explicit retry',async({page})=>{
 await seed(page);const calls:any[]=[];let fail=true;
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls.push(input);if(!input.continuation)return r.fulfill({json:answer('FIRST_VISIBLE',input.model)});return fail?r.fulfill({status:403,json:{error:'ai_auth_error'}}):r.fulfill({json:answer('SECOND_NEW',input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.getByRole('button',{name:'Tiếp tục phần còn thiếu',exact:true})).toBeVisible();await expect(page.locator('.prose')).toContainText('FIRST_VISIBLE');expect(calls).toHaveLength(2);
 await saveSecondPrompt(page);await expect(page.locator('.prose')).toContainText('FIRST_VISIBLE');expect(calls).toHaveLength(2);
 fail=false;await page.getByRole('button',{name:'Tiếp tục phần còn thiếu',exact:true}).click();await expect(page.locator('.prose')).toContainText('SECOND_NEW');expect(calls.filter(c=>!c.continuation)).toHaveLength(1);expect(calls.filter(c=>c.continuation)).toHaveLength(2);expect(calls.at(-1).continuation.promptTemplate).toBe(updated);
});

test('independent save: in-flight promise keeps its prefix and rebound progress through Save',async({page})=>{
 await seed(page,'甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800)+'丁'.repeat(1800));const calls:any[]=[];let releasePrefix!:()=>void,releaseFinal!:()=>void;const prefixGate=new Promise<void>(resolve=>releasePrefix=resolve),finalGate=new Promise<void>(resolve=>releaseFinal=resolve);
 await page.route('**/api/ai/translate',async r=>{const input=r.request().postDataJSON();calls.push(input);const marker=String(input.text)[0];if(input.continuation)await(marker==='丙'?prefixGate:finalGate);const result=marker==='甲'?'FIRST_A':marker==='乙'?'FIRST_B':marker==='丙'?'PARTIAL_SECOND':'FINAL_SECOND';await r.fulfill({json:answer(result,input.model)}).catch(()=>{});});
 try{await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>calls.length).toBe(3);await expect(page.locator('.prose')).toContainText('FIRST_A');await expect(page.locator('.prose')).toContainText('FIRST_B');await saveSecondPrompt(page);await expect(page.locator('.prose')).toContainText('FIRST_A');expect(calls).toHaveLength(3);expect(calls[2].continuation.promptTemplate).not.toContain('NEW_SECOND_PROMPT');releasePrefix();await expect.poll(()=>calls.length).toBe(4);await expect(page.locator('.prose')).toContainText('PARTIAL_SECOND');await expect(page.locator('.prose')).not.toContainText('FINAL_SECOND');releaseFinal();await expect(page.locator('.prose')).toContainText('FINAL_SECOND');expect(calls).toHaveLength(4);}finally{releasePrefix();releaseFinal();}
});
