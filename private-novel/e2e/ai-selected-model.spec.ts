import {test,expect,type Page} from '@playwright/test';
async function seed(page:Page){
 await page.route('**/api/**',r=>r.fulfill({status:503}));await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{const database=await new Promise<IDBDatabase>((resolve,reject)=>{const open=indexedDB.open('thu-phong-v1');open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
  try{await new Promise<void>((resolve,reject)=>{const tx=database.transaction(['books','chapters','settings'],'readwrite'),settings=tx.objectStore('settings'),defaults={systemPrompt:'Dịch tiểu thuyết sang tiếng Việt.',userPromptTemplate:'{{name}}Nguồn: {{text}}',model:'gemini-3.5-flash',temperature:0};
   tx.objectStore('books').put({id:'selected-model',title:'Model tổng hợp',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:4,chapterCount:1});tx.objectStore('chapters').put({id:'selected-model-1',bookId:'selected-model',title:'Chương 1',order:0,text:'原文来了',revision:1,sourceId:''});
   settings.put({key:'reader-options',value:{preloadAi:false}});settings.put({key:'ai-book-settings:selected-model',value:{...defaults,model:'gemini-3.7-flash',fallbackModels:['gemini-2.5-flash']}});
   settings.put({key:'prompt-stock-v1',value:{version:1,defaultProfileId:'default',profiles:[{id:'default',title:'Mặc định',updatedAt:1,settings:defaults},{id:'other',title:'Prompt khác',updatedAt:2,settings:{...defaults,model:'gemini-2.5-flash',systemPrompt:'Dịch tổng hợp.'}}]}});
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });}finally{database.close();}
 });await page.goto('/read/selected-model/selected-model-1',{waitUntil:'domcontentloaded'});await expect(page.locator('.reader-book-heading h1')).toHaveText('Model tổng hợp');
}
const panel=async(page:Page)=>{await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();return page.getByRole('dialog',{name:'Dịch AI',exact:true});};
test('model picker persists through prompt switch/reload and retries only the chosen Qwen model',async({page})=>{
 await seed(page);const dialog=await panel(page);await dialog.getByLabel('Model',{exact:true}).selectOption('qwen/qwen3.8-27b');await expect(dialog.getByLabel('Model',{exact:true})).toHaveValue('qwen/qwen3.8-27b');await dialog.getByLabel('Chọn prompt',{exact:true}).selectOption('other');await expect(dialog.getByLabel('Model',{exact:true})).toHaveValue('qwen/qwen3.8-27b');await page.reload({waitUntil:'domcontentloaded'});const restored=await panel(page);await expect(restored.getByLabel('Model',{exact:true})).toHaveValue('qwen/qwen3.8-27b');await restored.getByRole('button',{name:'Ẩn Dịch AI'}).click();
 const models:string[]=[];await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();models.push(input.model);return models.length===1?r.fulfill({status:503,json:{error:'ai_upstream_error'}}):r.fulfill({json:{model:input.model,result:'Bản dịch đúng model đã chọn.',finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch đúng model đã chọn.');expect(models).toEqual(['qwen/qwen3.8-27b','qwen/qwen3.8-27b']);
});
test('long Retry-After schedules the same-model retry and Stop cancels it',async({page})=>{
 await seed(page);await page.clock.install();const models:string[]=[];await page.route('**/api/ai/translate',r=>{models.push(r.request().postDataJSON().model);return r.fulfill({status:429,headers:{'Retry-After':'60'},json:{error:'ai_rate_limited'}});});await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>models.length).toBe(1);const dialog=await panel(page);await expect(dialog.getByText(/Tự thử lại sau/)).toBeVisible();await dialog.getByRole('button',{name:'Dừng chương này',exact:true}).first().click();await page.clock.runFor(61000);expect(models).toEqual(['gemini-3.7-flash']);await expect(dialog.getByLabel('Chương này',{exact:true})).toContainText('Đã dừng');
});
