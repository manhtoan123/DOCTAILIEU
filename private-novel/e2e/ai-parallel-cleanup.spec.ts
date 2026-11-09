import {test,expect} from '@playwright/test';
test('same-model parts recover automatically, preserve source, and settings use the unified translation form',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:503}));
 await page.goto('/');
 await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');const {AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');
 await db.settings.put({key:'reader-options',value:{autoNext:false,preloadAi:false}});
 await db.settings.put({key:'ai-book-settings:parallel-ui',value:{...AI_DEFAULTS,splitParts:true,hybrid:{version:1,liteModel:'gemini-3.5-flash-lite',rules:'Gọi anh.'}}});
 await db.books.put({id:'parallel-ui',title:'Song song',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:5400});
 await db.chapters.put({id:'parallel-ch',bookId:'parallel-ui',title:'Chương 1',order:0,text:'甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800),revision:1,sourceId:''});});
 await page.goto('/read/parallel-ui/parallel-ch');
 const calls:{text:string;model:string;continuation?:unknown}[]=[];let failed=false,active=0,max=0;
 await page.route('**/api/ai/translate',async route=>{const input=route.request().postDataJSON();calls.push(input);max=Math.max(max,++active);await new Promise(r=>setTimeout(r,100));active--;
 if(input.text.startsWith('乙')&&!failed){failed=true;await route.fulfill({status:429,headers:{'Retry-After':'1'},json:{error:'ai_rate_limited'}});return;}
 await route.fulfill({headers:{'X-AI-Parallel':'2'},json:{result:'Bản dịch '+('甲乙丙'.indexOf(input.text[0])+1),model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await expect(page.locator('.prose')).toContainText('Bản dịch 3',{timeout:30000});
 expect(calls.filter(c=>c.text.startsWith('甲'))).toHaveLength(1);expect(calls.filter(c=>c.text.startsWith('乙')).length).toBeGreaterThan(1);expect(max).toBe(2);expect(new Set(calls.map(c=>c.model)).size).toBe(1);expect(calls.every(c=>!c.continuation)).toBe(true);
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get('parallel-ch'))?.text;})).toBe('甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800));
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await expect(page.getByRole('switch',{name:'Dịch chia phần song song',exact:true})).toBeChecked();await expect(page.getByText('Dịch nửa sau bằng Lite',{exact:true})).toHaveCount(0);
 await page.goto('/settings/ai');await page.getByRole('button',{name:'Cách dịch',exact:true}).click();await expect(page.getByRole('switch',{name:'Dịch chia phần song song',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Nửa sau',exact:true})).toHaveCount(0);await expect(page.getByLabel('Quy tắc xưng hô',{exact:true})).toBeVisible();
});

test('EPUB parallel keeps node mapping, emphasis and same-model requests',async({page})=>{
 const {zipSync,strToU8}=await import('fflate');
 await page.route('**/api/**',r=>r.fulfill({status:503}));await page.goto('/');
 const nodes=['甲'.repeat(1800),'乙'.repeat(1800),'丙'.repeat(1800)];
 const file=Buffer.from(zipSync({'mimetype':strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),'book.opf':strToU8('<package><metadata><title>EPUB song song</title></metadata><manifest><item id="c" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>'),'one.xhtml':strToU8(`<html xmlns="http://www.w3.org/1999/xhtml"><head><style>em{font-style:italic}</style></head><body><p><em>${nodes[0]}</em></p><p>${nodes[1]}</p><p>${nodes[2]}</p></body></html>`)}));
 await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();await page.getByLabel(/^(Chọn|Đổi) file$/).setInputFiles({name:'parallel.epub',mimeType:'application/epub+zip',buffer:file});await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.frameLocator('iframe').locator('em')).toContainText('甲');
 const calls:any[]=[];let active=0,max=0;
 await page.route('**/api/ai/translate',async r=>{const input=r.request().postDataJSON();calls.push(input);max=Math.max(max,++active);await new Promise(resolve=>setTimeout(resolve,100));active--;const row=JSON.parse(input.text);await r.fulfill({headers:{'X-AI-Parallel':'2'},json:{result:JSON.stringify(Object.fromEntries(Object.keys(row).map(key=>[key,'Phần dịch '+key]))),model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.frameLocator('iframe').locator('body')).toContainText('Phần dịch 2');await expect(page.frameLocator('iframe').locator('em')).toHaveText('Phần dịch 0');expect(calls).toHaveLength(3);expect(max).toBe(2);expect(new Set(calls.map(c=>c.model)).size).toBe(1);expect(calls.every(c=>!c.continuation)).toBe(true);
});
