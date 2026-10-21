import {test,expect,type Page} from '@playwright/test';
async function openSample(page:Page){await page.goto('/');await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await expect(page.locator('.prose')).toContainText('Buổi sáng, nắng ghé qua');}
test('controls have distinct purposes, configuration never sends AI, shortcuts stay reachable',async({page})=>{
 let requests=0;await page.route('**/api/ai/translate',r=>{requests++;return r.fulfill({json:{result:'Bản AI.',model:'gemini-3.5-flash',finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await openSample(page);await expect(page.locator('.reader-listen')).toHaveCount(0);await expect(page.getByRole('button',{name:'Chỉ đọc',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('.word-token')).toHaveCount(0);await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.word-token').first()).toBeVisible();
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await expect(page.getByLabel('Model',{exact:true}).locator('option')).toHaveCount(9);expect(requests).toBe(0);await page.getByRole('button',{name:'Ẩn Dịch AI'}).click();
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 for(const name of ['Nghe truyện nhanh','Tùy chỉnh prompt và model','Cài đặt đọc truyện']){const box=await page.getByRole('button',{name,exact:true}).boundingBox();expect(box!.width).toBeGreaterThanOrEqual(48);expect(box!.height).toBeGreaterThanOrEqual(48);expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);}
});
test('single headphones control starts pauses resumes and source switch stops speech',async({page})=>{
 await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:'Bản AI.',model:'gemini-3.5-flash',finishReason:'STOP',inputTokens:1,outputTokens:1}}));
 await page.addInitScript(()=>{(window as any).Audio=class{playbackRate=1;removeAttribute(){}load(){}play(){return Promise.resolve();}pause(){}};});
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.fulfill({json:{success:true,data:'//PkxAAAAAAA',error:null}}));await openSample(page);
 const b=page.getByRole('button',{name:'Nghe truyện nhanh',exact:true});await b.click();await expect(b).toHaveAttribute('title','Tạm dừng nghe');await b.click();await expect(b).toHaveAttribute('title','Tiếp tục nghe');await b.click();await expect(b).toHaveAttribute('title','Tạm dừng nghe');await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(b).toHaveAttribute('aria-pressed','false');
});
test('single headphones cancels pending audio without late highlight',async({page})=>{
 await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:'Bản AI.',model:'gemini-3.5-flash',finishReason:'STOP',inputTokens:1,outputTokens:1}}));
 let release!:()=>void;const pending=new Promise<void>(r=>release=r);let requests=0;await page.route('https://ottsy.weilbyte.dev/api/generation',async r=>{requests++;await pending;await r.fulfill({json:{success:true,data:'//PkxAAAAAAA',error:null}}).catch(()=>{});});
 await openSample(page);const b=page.getByRole('button',{name:'Nghe truyện nhanh',exact:true});try{await b.click();await expect(b).toHaveAttribute('title','Dừng tải');await expect.poll(()=>requests).toBe(1);await b.click();await expect(b).toHaveAttribute('aria-pressed','false');}finally{release();}await expect(page.locator('.prose .speaking')).toHaveCount(0);
});
