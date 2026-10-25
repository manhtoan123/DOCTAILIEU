import {test,expect,type Page} from '@playwright/test';
const book='stall-book',chapter='stall-chapter',raw='甲'.repeat(800);
async function seed(page:Page){
 await page.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('/prompts')?{revision:0,rows:[]}:r.request().url().includes('/state')?{revision:0,payload:null}:r.request().url().includes('dictionaries')?{dictionaries:[]}:{books:[],ids:[],cursor:null,keys:[]}}));
 await page.goto('/');await page.evaluate(async({book,chapter,raw})=>{
  const {db}=await import('/src/core/db.ts');const {AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');
  await db.settings.put({key:'reader-options',value:{autoNext:true,preloadAi:false}});
  await db.settings.put({key:`ai-book-settings:${book}`,value:{...AI_DEFAULTS,model:'gemini-2.5-flash'}});
  await db.books.put({id:book,title:'Kiểm tra AI bị kẹt',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:raw.length});
  await db.chapters.put({id:chapter,bookId:book,title:'Chương thử',order:0,text:raw,revision:1,sourceId:''});
 },{book,chapter,raw});await page.goto(`/read/${book}/${chapter}`);await expect(page.locator('.prose')).toContainText(raw);
}
const complete=(model:string)=>({result:'Bản dịch hoàn chỉnh đã hiện.',model,finishReason:'STOP',inputTokens:1,outputTokens:1});

test('a stalled cache read/write does not hide a complete translation or persist late data',async({page})=>{
 await seed(page);let calls=0;await page.route('**/api/ai/translate',r=>{calls++;return r.fulfill({json:complete(r.request().postDataJSON().model)});});
 await page.evaluate(()=>{const digest=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=(algorithm,data)=>{
  const text=new TextDecoder().decode(data as ArrayBuffer);if(text.startsWith('["stall-book",'))return new Promise(()=>{});
  return digest(algorithm,data);
 };});
 await page.clock.install();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await page.clock.fastForward(2100);await expect.poll(()=>calls).toBe(1);await page.clock.fastForward(1100);
 await expect(page.locator('.prose')).toContainText('Bản dịch hoàn chỉnh đã hiện.');await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);
 expect(await page.evaluate(async({chapter})=>{const {db}=await import('/src/core/db.ts');return {raw:(await db.chapters.get(chapter))?.text,cache:(await db.settings.toArray()).filter(r=>r.key.startsWith('ai-reading-cache:v1:')).length};},{chapter})).toEqual({raw,cache:0});
});

test('whole-chapter deadline cools down then automatically completes without manual retry',async({page})=>{
 await seed(page);let calls=0,healthy=false;await page.route('**/api/ai/translate',async r=>{calls++;if(healthy)return r.fulfill({json:complete(r.request().postDataJSON().model)});await new Promise(()=>{});});
 await page.clock.install();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>calls).toBe(1);
 await page.clock.fastForward(240001);await expect(page.locator('.reader-convert-status')).toContainText('Tự thử lại sau');
 const before=calls;healthy=true;await page.clock.fastForward(59999);expect(calls).toBe(before);
 await page.clock.fastForward(1001);await expect(page.locator('.prose')).toContainText('Bản dịch hoàn chỉnh đã hiện.');
 await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);
});

test('switching to the original cancels a stalled cache without a late AI replacement',async({page})=>{
 await seed(page);let calls=0;await page.route('**/api/ai/translate',r=>{calls++;return r.fulfill({json:complete(r.request().postDataJSON().model)});});
 await page.evaluate(()=>{const digest=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=(algorithm,data)=>new TextDecoder().decode(data as ArrayBuffer).startsWith('["stall-book",')?new Promise(()=>{}):digest(algorithm,data);});
 await page.clock.install();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await page.clock.fastForward(240001);
 await expect(page.locator('.prose')).toContainText(raw);expect(calls).toBe(0);await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);
});

test('an EPUB recovery waits for the entire server cooldown even across expired rounds',async({page})=>{
 await seed(page);await page.evaluate(async({chapter,raw})=>{const {db}=await import('/src/core/db.ts');await db.chapters.update(chapter,{epub:{path:'one.xhtml',body:'<body><p>'+raw+'</p></body>',styles:[],nodes:[raw]}});},{chapter,raw});await page.reload();
 let calls=0;await page.route('**/api/ai/translate',r=>{calls++;return r.fulfill({status:429,headers:{'retry-after':'7200'},json:{error:'ai_rate_limited'}});});
 await page.clock.install();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.reader-convert-status')).toContainText('API đang bận');await expect(page.locator('.reader-convert-status')).toContainText('Tự thử lại sau');const before=calls;expect(before).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Thử lại AI',exact:true}).click();await expect(page.locator('.reader-convert-status')).toContainText('API đang bận');expect(calls).toBe(before);
 await page.clock.fastForward(600001);expect(calls).toBe(before);await expect(page.locator('.reader-convert-status')).toContainText('Tự thử lại sau');
 expect(await page.evaluate(async chapter=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get(chapter))?.text;},chapter)).toBe(raw);
});
