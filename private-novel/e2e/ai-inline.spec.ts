import {test,expect,type Page} from '@playwright/test';
async function seed(page:Page){
 await page.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));await page.route('**/api/state**',r=>r.fulfill({status:503,json:{error:'isolated'}}));await page.route('**/api/prompts**',r=>r.fulfill({json:{revision:0,rows:[]}}));
 await page.route('**/api/library**',r=>r.fulfill({json:{books:[],deleted:[],public:true}}));
 await page.route('**/api/dictionaries',r=>r.fulfill({json:{dictionaries:[]}}));
 await page.goto('/');
 await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');const {AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');await db.settings.put({key:'ai-book-settings:ai-book',value:{...AI_DEFAULTS,fallbackModels:[]}});await db.books.put({id:'ai-book',title:'中文小说',author:'',status:'ready',chapterCount:3,charCount:33,createdAt:1,updatedAt:1});await db.chapters.bulkPut([1,2,3].map(n=>({id:`ai-${n}`,bookId:'ai-book',order:n-1,title:`第${n}章`,text:`第${n}章\n林儿说：这是第${n}段。`,revision:1,sourceId:''})));await db.names.put({id:'name-1',bookId:'ai-book',key:'林儿',value:'Lâm Nhi',updatedAt:1});});
 await page.goto('/read/ai-book/ai-1');await expect(page.locator('.prose')).toBeVisible();
}
const response=(result:string)=>({result,model:'gemini-3.5-flash',finishReason:'STOP',inputTokens:10,outputTokens:10});

test('stalled AI switches model after deadline without manual retry',async({page})=>{
 let calls=0;await page.route('**/api/ai/translate',r=>{
  calls++;if(calls===1)return;return r.fulfill({json:{...response('Bản dịch sau timeout.'),model:r.request().postDataJSON().model}});
 });
 await seed(page);await page.clock.install();
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await expect.poll(()=>calls).toBe(1);await page.clock.fastForward(70_001);
 await expect(page.locator('.prose')).toContainText('Bản dịch sau timeout.');
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get('ai-1'))?.text;})).toContain('林儿说');
});

test('HTML gateway failure preserves source and automatically recovers after all models were busy',async({page})=>{
 let calls=0,ready=false;await page.route('**/api/ai/translate',r=>{calls++;return !ready
  ?r.fulfill({status:502,contentType:'text/html',body:'<html>synthetic private gateway body</html>'})
  :r.fulfill({json:response('Bản dịch đã phục hồi.')});});
 await seed(page);await page.clock.install();await page.getByRole('button',{name:'Bản gốc',exact:true}).click();
 await expect(page.locator('.prose')).toContainText('林儿说');
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await expect(page.getByText('Máy chủ trung gian chưa trả được bản dịch. Thử lại sau.').first()).toBeVisible({timeout:20000});
 expect(calls).toBe(4);
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get('ai-1'))?.text;})).toContain('林儿说');
 await expect(page.locator('body')).not.toContainText('synthetic private gateway body');
 ready=true;await page.clock.fastForward(16_001);
 await expect(page.locator('.prose')).toContainText('Bản dịch đã phục hồi.');
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get('ai-1'))?.text;})).toContain('林儿说');
});
test('inline AI preloads one chapter, promotes pending job once, keyboard and reload preserve chapter/source',async({page})=>{
 const calls:string[]=[];await page.route('**/api/ai/translate',async route=>{const text=route.request().postDataJSON().text;calls.push(text);await new Promise(r=>setTimeout(r,text.includes('第2章')?600:50));await route.fulfill({json:response(text.includes('第1章')?'Bản AI một.':text.includes('第2章')?'Bản AI hai.':'Bản AI ba.')}).catch(()=>{});});
 await seed(page);await expect(page.getByRole('button',{name:'Chỉ đọc',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản AI một.');
 await expect.poll(()=>calls.length).toBe(2);await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/\/ai-2$/);await expect(page.locator('.prose')).toContainText('Bản AI hai.');
 await expect.poll(()=>calls.length).toBe(3);expect(calls.filter(s=>s.includes('第2章'))).toHaveLength(1);
 await page.reload();await expect(page).toHaveURL(/\/ai-2$/);await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('.prose')).toContainText('这是第2段');
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get('ai-2'))?.text;})).toBe('第2章\n林儿说：这是第2段。');
});
test('configuration is per book, model selection and failed preload do not replace current AI',async({page})=>{
 const calls:any[]=[];await page.route('**/api/ai/translate',r=>{const req=r.request().postDataJSON();calls.push(req);return req.text.includes('第1章')?r.fulfill({json:{...response('AI hiện tại.'),model:req.model}}):r.fulfill({status:429,headers:{'Retry-After':'120'},json:{error:'ai_rate_limited'}});});
 await seed(page);await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await page.getByRole('button',{name:'Cài đặt dịch AI'}).click();await page.getByRole('button',{name:'Nâng cao',exact:true}).click();await page.getByLabel('System Prompt',{exact:true}).fill('Dịch gọn theo Name.');await page.getByLabel('Model',{exact:true}).selectOption('gemini-3.8-flash');await page.getByRole('button',{name:'Lưu prompt',exact:true}).click();await page.goBack();
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('AI hiện tại.');await expect(page.getByText(/Chưa tải trước:/)).toBeVisible();expect(calls[0].model).toBe('gemini-3.8-flash');expect(calls[0].names['林儿']).toBe('Lâm Nhi');await page.waitForTimeout(400);expect(calls.length).toBe(7);
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.settings.get('ai-book-settings:ai-book'))?.value;})).toMatchObject({systemPrompt:'Dịch gọn theo Name.',model:'gemini-3.8-flash'});
});
test('AI narration automatically turns chapter and speaks AI, not Chinese; stop cancels continuation',async({page})=>{
 await page.addInitScript(()=>{(window as any).__audios=[];(window as any).Audio=class{onended?:()=>void;playbackRate=1;constructor(){(window as any).__audios.push(this);}removeAttribute(){}load(){}play(){return Promise.resolve();}pause(){}};});
 const spoken:string[]=[];await page.route('https://ottsy.weilbyte.dev/api/generation',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA',error:null}});});
 await page.route('**/api/ai/translate',r=>{const text=r.request().postDataJSON().text;return r.fulfill({json:response(text.includes('第1章')?'Một.':text.includes('第2章')?'Hai.':'Ba.')});});
 await seed(page);await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Một.');await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();await expect.poll(()=>spoken.includes('Một.')).toBe(true);
 await page.evaluate(()=>{const a=(window as any).__audios; a[a.length-1].onended?.();});await expect(page).toHaveURL(/\/ai-2$/);await expect.poll(()=>spoken.includes('Hai.')).toBe(true);expect(spoken.some(s=>/\p{Script=Han}/u.test(s))).toBe(false);
 await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();await page.waitForTimeout(100);await expect(page.getByRole('button',{name:'Nghe truyện nhanh',exact:true})).toHaveAttribute('aria-pressed','false');
});
test('AI completion becomes the canonical bookmark; scrolling cannot replace it',async({page})=>{
 await page.route('**/api/ai/translate',r=>r.fulfill({json:response(Array.from({length:70},(_,i)=>`AI đoạn ${i}.`).join('\n'))}));
 await seed(page);await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.chapters.update('ai-1',{text:Array.from({length:70},(_,i)=>`中文 đoạn ${i}`).join('\n')});await db.progress.put({bookId:'ai-book',chapterId:'ai-1',revision:1,paragraph:25,offset:0,updatedAt:1});});
 await page.reload();const p=page.locator('.prose [data-paragraph="25"]');await expect.poll(async()=>{const box=await p.boundingBox();return !!box&&Math.abs(box.y)<150;}).toBe(true);
 let before:number|undefined;
 await page.getByRole('button',{name:'Dịch AI',exact:true}).dispatchEvent('click');await expect(page.locator('.prose')).toContainText('AI đoạn 69.');before=await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.progress.get('ai-book'))?.paragraph;});await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(850);
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.progress.get('ai-book'))?.paragraph;})).toBe(before);
 await page.getByRole('button',{name:'Convert',exact:true}).dispatchEvent('click');expect(await page.evaluate(async()=>{const{db}=await import('/src/core/db.ts');return (await db.progress.get('ai-book'))?.mode;})).toBe('ai');await expect(page.locator('.prose')).toBeVisible();
});
test('Name changes stop AI narration; late cancelled responses cannot replace raw text',async({page})=>{
 await page.addInitScript(()=>{(window as any).Audio=class{playbackRate=1;removeAttribute(){}load(){}play(){return Promise.resolve();}pause(){}};});
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.fulfill({json:{success:true,data:'//PkxAAAAAAA',error:null}}));
 await page.route('**/api/ai/translate',async r=>{const req=r.request().postDataJSON();await new Promise(resolve=>setTimeout(resolve,req.names['林儿']==='Tên Mới'?700:30));await r.fulfill({json:response(req.names['林儿']==='Tên Mới'?'Tên Mới nói.':'Lâm Nhi nói.')}).catch(()=>{});});
 await seed(page);await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lâm Nhi nói.');await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();await expect(page.getByRole('button',{name:'Nghe truyện nhanh',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.names.update('name-1',{value:'Tên Mới'});});await expect(page.getByRole('button',{name:'Nghe truyện nhanh',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await page.waitForTimeout(900);await expect(page.locator('.prose')).toContainText('林儿说');await expect(page.locator('.prose')).not.toContainText('Tên Mới nói.');
});
test('saving prompt then closing immediately still updates reader configuration',async({page})=>{
 const calls:any[]=[];await page.route('**/api/ai/translate',r=>{calls.push(r.request().postDataJSON());return r.fulfill({json:response('Dịch mới.')});});
 await seed(page);await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');const put=db.settings.put.bind(db.settings);db.settings.put=async(...args:any[])=>{if(args[0].key==='ai-book-settings:ai-book')await new Promise(resolve=>setTimeout(resolve,500));return put(...args);};});
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await page.getByRole('button',{name:'Cài đặt dịch AI'}).click();await page.getByRole('button',{name:'Nâng cao',exact:true}).click();await page.getByLabel('System Prompt',{exact:true}).fill('Prompt lưu muộn.');await page.getByRole('button',{name:'Lưu prompt',exact:true}).click();await page.goBack();await page.waitForTimeout(800);await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Dịch mới.');expect(calls[0].systemPrompt).toBe('Prompt lưu muộn.');
});




test('reader settings failure is recoverable without sending an AI request first',async({page})=>{
 let calls=0;await page.route('**/api/ai/translate',r=>{calls++;return r.fulfill({json:response('Đã tải prompt.')});});await seed(page);await page.getByRole('link',{name:'← Tủ sách',exact:true}).click();
 await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');const get=db.settings.get.bind(db.settings);(window as any).__aiSettingsFail=true;db.settings.get=async(key:any)=>{if(key==='ai-book-settings:ai-book'&&(window as any).__aiSettingsFail)throw new Error('synthetic hydration failure');return get(key);};});
 await page.getByRole('link',{name:'Mở sách →',exact:true}).click();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.getByText(/Không đọc được prompt: synthetic hydration failure/).first()).toBeVisible();expect(calls).toBe(0);await page.evaluate(()=>(window as any).__aiSettingsFail=false);await page.getByRole('button',{name:'Thử lại AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Đã tải prompt.');
});


