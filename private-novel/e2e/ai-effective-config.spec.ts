import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
// Built-preview fallback: isolated fixture bridge uses real schema/services, never ships in dist.
test.beforeEach(async({page})=>{if(process.env.AI_CONFIG_BUILT_PREVIEW==='1'){const body=readFileSync('.dsh-tmp/ai-settings-review/fixture-bridge.js','utf8');await page.route('**/src/**',r=>r.fulfill({contentType:'application/javascript',body}));}});
const execution={version:1,model:'gemini-3.8-flash',temperature:null,thinking:'provider-default',maxOutputTokens:8192,promptId:'a'.repeat(64)};
async function setup(page:Page){
 await page.route('**/api/**',r=>r.fulfill({json:{revision:0,rows:[],payload:null,books:[],ids:[],keys:[],dictionaries:[]}}));await page.goto('/');
 await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts'),{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts'),{getPromptStock,savePromptProfile}=await import('/src/features/ai/prompt/prompt-stock.ts');await db.settings.put({key:'reader-options',value:{preloadAi:false,autoNext:false,mode:'original'}});await getPromptStock();await savePromptProfile({title:'Đối chiếu',settings:{...AI_DEFAULTS,systemPrompt:'Dịch sát nghĩa theo bản thử B.'}});});
}
async function trials(page:Page){await page.goto('/settings/prompts');await expect(page.getByLabel('Tên prompt',{exact:true})).toBeVisible();await page.getByText('Thử và so sánh prompt',{exact:true}).click();await page.getByLabel('Prompt B',{exact:true}).selectOption({label:'Đối chiếu'});}
test('manual settings A/B keeps source, Names, model and saved settings unchanged; fits mobile',async({page},info)=>{
 await setup(page);const calls:any[]=[];await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls.push(input);return r.fulfill({headers:{'X-AI-Execution':JSON.stringify(execution),'X-AI-Thought-Tokens':'12','X-AI-Total-Tokens':'42'},json:{result:`Bản dịch thử ${calls.length}.`,model:input.model,finishReason:'STOP',inputTokens:10,outputTokens:20}});});
 await trials(page);expect(calls).toHaveLength(0);
 const before=await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return {common:await db.settings.get('ai-translate-settings'),progress:await db.progress.toArray(),caches:await db.settings.where('key').startsWith('ai-reading-cache:').toArray()};});
 await page.getByRole('button',{name:'Chạy so sánh A/B',exact:true}).click();await expect(page.getByRole('article',{name:'Kết quả B',exact:true})).toContainText('Bản dịch thử 2.');
 expect(calls).toHaveLength(2);expect(calls[0].text).toBe(calls[1].text);expect(calls[0].names).toEqual(calls[1].names);expect(calls[0].model).toBe(calls[1].model);expect(calls[0].systemPrompt).not.toBe(calls[1].systemPrompt);expect(calls[0]).not.toHaveProperty('fallbackModels');
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return {common:await db.settings.get('ai-translate-settings'),progress:await db.progress.toArray(),caches:await db.settings.where('key').startsWith('ai-reading-cache:').toArray()};})).toEqual(before);
 await page.getByRole('article',{name:'Kết quả A',exact:true}).getByText('Cấu hình lượt thử',{exact:true}).click();await expect(page.getByRole('article',{name:'Kết quả A',exact:true})).toContainText('Model không dùng tham số này');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('prompt-comparison.png'),fullPage:true});
});
test('changing trial source cancels a pending pair and suppresses late results',async({page})=>{
 await setup(page);let entered=false,release!:()=>void;const gate=new Promise<void>(r=>release=r);let calls=0;
 await page.route('**/api/ai/translate',async r=>{calls++;entered=true;const input=r.request().postDataJSON();await gate;await r.fulfill({json:{result:'Kết quả cũ phải bị bỏ.',model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:1}}).catch(()=>{});});
 await trials(page);await page.getByRole('button',{name:'Chạy so sánh A/B',exact:true}).click();await expect.poll(()=>entered).toBe(true);await page.getByLabel('Nguồn thử prompt',{exact:true}).fill('Nguồn thử mới.');release();await expect(page.getByRole('button',{name:'Chạy so sánh A/B',exact:true})).toBeEnabled();await expect(page.getByRole('article',{name:'Kết quả A',exact:true})).toHaveCount(0);expect(calls).toBe(1);
});
test('Reader records actual config through reload and never invents provenance for old cache',async({page})=>{
 await setup(page);await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.books.put({id:'config-ui',title:'Truyện thử cấu hình',author:'',status:'ready',chapterCount:1,charCount:5,createdAt:1,updatedAt:1});await db.chapters.put({id:'config-chapter',bookId:'config-ui',title:'Chương thử',order:0,text:'你好。',revision:1,sourceId:''});});
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();return r.fulfill({headers:{'X-AI-Execution':JSON.stringify(execution)},json:{result:'Bản dịch cấu hình.',model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:2}});});
 await page.goto('/read/config-ui/config-chapter');await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch cấu hình.');await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await page.getByText('Cấu hình thực dùng',{exact:true}).click();await expect(page.locator('.ai-execution-details')).toContainText('#aaaaaaaaaaaa');
 await page.reload();await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await page.getByText('Cấu hình thực dùng',{exact:true}).click();await expect(page.locator('.ai-execution-details')).toContainText('#aaaaaaaaaaaa');
 await page.goto('/');await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');const rows=await db.settings.where('key').startsWith('ai-reading-cache:').toArray();for(const row of rows){const value=row.value as any;if(value.response){delete value.response.execution;await db.settings.put({...row,value});}}});
 await page.goto('/read/config-ui/config-chapter');await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await page.getByText('Cấu hình thực dùng',{exact:true}).click();await expect(page.locator('.ai-execution-details')).toContainText('Chưa lưu cấu hình thực dùng');
});
