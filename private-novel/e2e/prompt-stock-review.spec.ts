import {test,expect} from '@playwright/test';

test('pending prompt save across Reader remount never dispatches the old hydrated snapshot',async({page})=>{
  const prompts:string[]=[];
  await page.route('**/api/cloud/**',route=>route.fulfill({json:route.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
  await page.route('**/api/ai/translate',route=>{
    prompts.push(route.request().postDataJSON().systemPrompt);
    return route.fulfill({json:{result:'Bản dịch mới sau lưu.',model:route.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}});
  });
  await page.goto('/');
  await page.evaluate(async()=>{
    const {db}=await import('/src/core/db.ts');const {AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');
    await db.books.put({id:'review-a',title:'Review synthetic',author:'',status:'ready',chapterCount:1,charCount:6,createdAt:1,updatedAt:1});
    await db.chapters.put({id:'review-c',bookId:'review-a',order:0,title:'第1章',text:'林儿你好。',revision:1,sourceId:''});
    await db.settings.put({key:'ai-book-settings:review-a',value:{...AI_DEFAULTS,systemPrompt:'OLD SNAPSHOT'}});
    history.pushState(null,'','/read/review-a/review-c');dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByRole('button',{name:'Tùy chỉnh prompt và model'}).click();
  await page.getByRole('button',{name:'Cài đặt dịch AI'}).click();await page.getByRole('button',{name:'Nâng cao',exact:true}).click();await expect(page.getByLabel('System Prompt kho',{exact:true})).toHaveValue('OLD SNAPSHOT');
  await page.evaluate(async()=>{
    const {db}=await import('/src/core/db.ts');const put=db.settings.put.bind(db.settings);
    db.settings.put=async(...args:any[])=>{if(args[0].key==='ai-book-settings:review-a')await (db.constructor as any).waitFor(new Promise(resolve=>setTimeout(resolve,1000)));return put(...args);};
  });
  await page.getByLabel('System Prompt kho',{exact:true}).fill('NEW QUEUED SNAPSHOT');
  await page.getByRole('button',{name:'Lưu prompt',exact:true}).click();
  await page.evaluate(()=>{history.pushState(null,'','/');dispatchEvent(new PopStateEvent('popstate'));});
  await expect(page.locator('.prose')).toHaveCount(0);
  await page.evaluate(()=>{history.pushState(null,'','/read/review-a/review-c');dispatchEvent(new PopStateEvent('popstate'));});
  await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
  await expect(page.locator('.prose')).toContainText('Bản dịch mới sau lưu.');
  await page.waitForTimeout(400);
  expect(prompts.length).toBeGreaterThan(0);
  expect(prompts.every(prompt=>prompt==='NEW QUEUED SNAPSHOT')).toBe(true);
  expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get('review-c'))!.text;})).toBe('林儿你好。');
});
