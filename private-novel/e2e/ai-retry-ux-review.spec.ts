import {test,expect,type Page} from '@playwright/test';

const book='retry-ux-review-book',first='retry-ux-review-1',second='retry-ux-review-2';
const text1='甲'.repeat(1800)+'乙'.repeat(1800),text2='丙'.repeat(1800)+'丁'.repeat(1800);
const answer=(result:string,model:string)=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:1});
async function seed(page:Page,preload=true){
 await page.route('**/api/**',r=>r.fulfill({status:503}));await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async({book,first,second,text1,text2,preload})=>{
  const {db}=await import('/src/core/db.ts'),{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');
  await db.settings.put({key:'reader-options',value:{preloadAi:preload}});
  await db.settings.put({key:`ai-book-settings:${book}`,value:{...AI_DEFAULTS,model:'gemini-2.5-flash',hybrid:{version:1,liteModel:'gemini-3.1-flash-lite',rules:''}}});
  await db.books.put({id:book,title:'Retry UX independent review',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:text1.length+text2.length,chapterCount:2});
  await db.chapters.bulkPut([{id:first,bookId:book,order:0,title:'Synthetic chapter one',text:text1,revision:1,sourceId:''},{id:second,bookId:book,order:1,title:'Synthetic chapter two',text:text2,revision:1,sourceId:''}]);
 },{book,first,second,text1,text2,preload});
 await page.goto(`/read/${book}/${first}`,{waitUntil:'domcontentloaded'});await expect(page.locator('.reader-book-heading h1')).toHaveText('Retry UX independent review');
}
const openPanel=(page:Page)=>page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();

test('review: save and continue the next half keeps completed foreground and next first half',async({page})=>{
 await seed(page);const calls:any[]=[];let failNext=true;
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls.push(input);if(input.text.startsWith('丁')&&failNext)return r.fulfill({status:403,json:{error:'ai_auth_error'}});return r.fulfill({json:answer(input.text.startsWith('甲')?'CURRENT_FIRST':input.text.startsWith('乙')?'CURRENT_SECOND':input.text.startsWith('丙')?'NEXT_FIRST':'NEXT_SECOND',input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','error');expect(calls).toHaveLength(4);
 await openPanel(page);const panel=page.locator('.reader-panel-ai');await expect(panel.getByText('Chương sau',{exact:true})).toBeVisible();
 await panel.getByLabel('Model nửa sau',{exact:true}).selectOption('gemini-3.5-flash-lite');failNext=false;
 await panel.getByRole('button',{name:'Lưu và tiếp tục',exact:true}).click();await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','ready');
 expect(calls).toHaveLength(5);expect(calls.at(-1)).toMatchObject({model:'gemini-3.5-flash-lite'});expect(calls.at(-1).text.startsWith('丁')).toBe(true);
 await expect(page.locator('.prose')).toContainText('CURRENT_FIRST');await expect(page.locator('.prose')).toContainText('CURRENT_SECOND');await expect(page.locator('.prose')).not.toContainText('NEXT_SECOND');
 expect(calls.filter(c=>c.text.startsWith('甲')||c.text.startsWith('乙'))).toHaveLength(2);expect(calls.filter(c=>c.text.startsWith('丙'))).toHaveLength(1);
});

test('review: a save continuation finishing after chapter navigation cannot retry its replacement',async({page})=>{
 await seed(page,false);const calls:any[]=[];
 await page.route('**/api/ai/translate',r=>{calls.push(r.request().postDataJSON());return r.fulfill({status:403,json:{error:'ai_auth_error'}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>calls.length).toBe(1);await openPanel(page);
 await page.evaluate(async book=>{const {db}=await import('/src/core/db.ts');const table=db.settings as any,original=table.put.bind(table);table.put=(row:any,...rest:any[])=>row.key===`ai-book-settings:${book}`?new Promise((resolve,reject)=>{(window as any).__reviewSaveHeld=true;(window as any).__reviewReleaseSave=()=>{table.put=original;original(row,...rest).then(resolve,reject);};}):original(row,...rest);},book);
 await page.getByRole('button',{name:'Lưu và tiếp tục',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__reviewSaveHeld)).toBe(true);
 // The chapter navigation handler can also be invoked while the side panel stays mounted.
 await page.locator('.chapter-navigation-top').getByRole('link',{name:'Chương sau →',exact:true}).dispatchEvent('click');
 await expect(page).toHaveURL(new RegExp(`${second}$`));await expect.poll(()=>calls.filter(c=>c.text.startsWith('丙')).length).toBe(1);
 await page.evaluate(()=>(window as any).__reviewReleaseSave());await page.waitForTimeout(300);
 expect(calls.filter(c=>c.text.startsWith('丙'))).toHaveLength(1);expect(calls).toHaveLength(2);await expect(page.locator('.reader-panel-ai')).toBeVisible();
});

test('review: stop before next source lookup completes prevents every next client send',async({page})=>{
 await seed(page);const calls:any[]=[];
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls.push(input);return r.fulfill({json:answer(input.continuation?'CURRENT_SECOND':'CURRENT_FIRST',input.model)});});
 await page.evaluate(async second=>{const {db}=await import('/src/core/db.ts');const table=db.chapters as any,original=table.get.bind(table);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);table.get=(key:any,...rest:any[])=>{if(key!==second)return original(key,...rest);(window as any).__reviewLookupHeld=true;return gate.then(()=>original(key,...rest));};(window as any).__reviewReleaseLookup=()=>{table.get=original;release();};},second);
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__reviewLookupHeld)).toBe(true);await openPanel(page);
 const panel=page.locator('.reader-panel-ai');await expect(panel.getByText('Chương sau',{exact:true})).toBeVisible();await panel.getByRole('button',{name:'Dừng dịch',exact:true}).click();
 await page.evaluate(()=>(window as any).__reviewReleaseLookup());await page.waitForTimeout(300);
 expect(calls).toHaveLength(2);expect(calls.every(c=>c.text.startsWith('甲')||c.text.startsWith('乙'))).toBe(true);await expect(panel).toContainText('Đã dừng dịch sẵn.');await expect(page.locator('.prose')).toContainText('CURRENT_SECOND');
});
