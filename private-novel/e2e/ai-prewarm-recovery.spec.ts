import {test,expect,type Page} from '@playwright/test';
async function seed(page:Page){
 await page.route('**/api/library**',r=>r.fulfill({json:{books:[],deleted:[],public:true}}));
 await page.route('**/api/dictionaries',r=>r.fulfill({json:{dictionaries:[]}}));
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.evaluate(async()=>{
  const {db}=await import('/src/core/db.ts');const {AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');await db.settings.put({key:'ai-book-settings:recover-book',value:{...AI_DEFAULTS,model:'gemini-3.8-flash',fallbackModels:[]}});await db.books.put({id:'recover-book',title:'测试小说',author:'',status:'ready',chapterCount:2,charCount:40,createdAt:1,updatedAt:1});
  await db.chapters.bulkPut([1,2].map(n=>({id:`recover-${n}`,bookId:'recover-book',order:n-1,title:`第${n}章`,text:`第${n}章\n林儿说：这是第${n}段。`,revision:1,sourceId:''})));
 });await page.goto('/read/recover-book/recover-1');await expect(page.locator('.prose')).toBeVisible();
}
const done=(result:string,model:string)=>({result,model,finishReason:'STOP',inputTokens:10,outputTokens:10});
test('AI button indicates pending and ready prewarm and resets immediately on navigation',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/api/ai/translate',async r=>{const req=r.request().postDataJSON();if(req.text.includes('第2章'))await gate;return r.fulfill({json:done('AI đã đủ.',req.model)}).catch(()=>{});});
 await seed(page);const button=page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true});await expect(button).toHaveAttribute('data-prewarm','idle');
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(button).toHaveAttribute('data-prewarm','loading');await expect(button).toHaveAttribute('title',/đang chuẩn bị AI/);await expect(button).toHaveCSS('background-color','rgb(146, 64, 14)');
 release();await expect(button).toHaveAttribute('data-prewarm','ready');await expect(button).toHaveAttribute('title',/đã sẵn sàng/);await expect(button).toHaveCSS('background-color','rgb(22, 101, 52)');await page.screenshot({path:`test-results/prewarm-ready-${page.viewportSize()!.width}.png`});
 await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/recover-2$/);await expect(button).toHaveAttribute('data-prewarm','idle');await expect(button).toHaveAttribute('title',/Không còn chương sau/);
});
test('current and promoted prewarm timeouts automatically split and display only complete translations',async({page})=>{
 await seed(page);await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.chapters.update('recover-1',{text:'甲'.repeat(800)});await db.chapters.update('recover-2',{text:'乙'.repeat(800)});});await page.reload();
 const calls:{model:string;length:number}[]=[];let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/api/ai/translate',async r=>{
  const input=r.request().postDataJSON();calls.push({model:input.model,length:input.text.length});
  if(input.text.length===800)return r.fulfill({status:504,json:{error:'ai_timeout'}});
  if(input.text.startsWith('乙'))await gate;
  return r.fulfill({json:done(input.text.startsWith('甲')?'CHILD CURRENT':'CHILD NEXT',input.model)}).catch(()=>{});
 });
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('CHILD CURRENT\nCHILD CURRENT');
 await expect.poll(()=>calls.filter(c=>c.length===800).length).toBe(7);
 expect(calls.filter(c=>c.length===800).map(c=>c.model)).toEqual(['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash','gemma-4-26b-a4b-it','gemini-2.5-flash','gemini-3-flash-preview','gemini-3-flash-preview']);
 await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','loading');
 await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/recover-2$/);await expect(page.locator('.prose')).not.toContainText('CHILD NEXT');release();
 await expect(page.locator('.prose')).toContainText('CHILD NEXT\nCHILD NEXT');expect(calls.filter(c=>c.length===800)).toHaveLength(7);expect(calls.filter(c=>c.length===400)).toHaveLength(4);expect(calls.filter(c=>c.length===400).every(c=>c.model==='gemini-3-flash-preview')).toBe(true);
});
test('failed prewarm falls back in background and foreground promotes the same pending job',async({page})=>{
 let nextCalls=0,currentCalls=0;const nextModels:string[]=[];let release!:()=>void;const gate=new Promise<void>(r=>release=r);await page.route('**/api/ai/translate',async r=>{
  const req=r.request().postDataJSON();if(req.text.includes('第1章')){currentCalls++;return r.fulfill({json:done('AI chương một.',req.model)});}
  nextCalls++;nextModels.push(req.model);if(nextCalls<=2)return r.fulfill({status:502,contentType:'text/html',body:'<html>synthetic gateway</html>'});
  await gate;return r.fulfill({json:done('AI chương hai đã phục hồi.',req.model)}).catch(()=>{});
 });
 await seed(page);await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await expect(page.locator('.prose')).toContainText('AI chương một.');await expect.poll(()=>nextCalls).toBe(3);expect(nextModels).toEqual(['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash']);await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','loading');
 await expect(page.locator('.prose')).toContainText('AI chương một.');
 await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/recover-2$/);
 await expect(page.locator('.prose')).not.toContainText('AI chương hai đã phục hồi.');release();
 await expect(page.locator('.prose')).toContainText('AI chương hai đã phục hồi.',{timeout:20000});
 expect(nextCalls).toBe(3);expect(currentCalls).toBe(1);
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get('recover-2'))?.text;})).toContain('林儿说');
});
test('permanent malformed next result does not retry or disturb current translation',async({page})=>{
 let nextCalls=0;await page.route('**/api/ai/translate',r=>{
  const req=r.request().postDataJSON();if(req.text.includes('第1章'))return r.fulfill({json:done('AI chương một nguyên vẹn.',req.model)});
  nextCalls++;return r.fulfill({status:502,headers:{'X-AI-Failure-Reason':'upstream_parts'},json:{error:'ai_invalid_response'}});
 });
 await seed(page);await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await expect(page.locator('.prose')).toContainText('AI chương một nguyên vẹn.');await expect.poll(()=>nextCalls).toBe(1);
 await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','error');await expect(page.locator('.ai-trigger')).toHaveAttribute('title',/tải trước gặp lỗi/);await expect(page.locator('.ai-trigger')).toHaveCSS('background-color','rgb(153, 27, 27)');
 await page.waitForTimeout(8000);expect(nextCalls).toBe(1);
 await expect(page.locator('.prose')).toContainText('AI chương một nguyên vẹn.');
});
