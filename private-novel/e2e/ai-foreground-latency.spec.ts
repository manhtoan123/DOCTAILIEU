import {test,expect,type Page} from '@playwright/test';
const book='synthetic-ai-latency',first='gemini-3.8-flash',fallback='gemini-3.7-flash';
const raw=(n:number)=>`第${n}章\n`+'合成故事。'.repeat(500);
const done=(model:string,result:string)=>({result,model,finishReason:'STOP',inputTokens:1,outputTokens:1});
test.beforeEach(async({context})=>{await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic fixture'}}));});

for(const logging of [false,true])test(`warm short prewarm falls back without restarting on promotion, logging=${logging}`,async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),calls:{text:string;model:string;logged:boolean}[]=[];
 await page.route('**/api/ai/logs',route=>route.request().method()==='POST'?route.fulfill({json:{ok:true}}):route.fulfill({json:{rows:[],serverNow:Date.now(),earliest:null,limit:5000,retentionDays:30,schemaVersions:logging?[1,2]:[1]}}));
 await page.route('**/api/ai/translate',async route=>{
  const input=route.request().postDataJSON();calls.push({text:input.text,model:input.model,logged:!!route.request().headers()['x-ai-log-context']});
  if(input.text===raw(1))return route.fulfill({headers:{'X-AI-Parallel':'2'},json:done(input.model,'Chương một đã hoàn tất.')});
  if(input.model===first)return route.fulfill({status:504,json:{error:'ai_timeout'}});
  await gate;return route.fulfill({json:done(input.model,'Chương hai đã chuyển model và hoàn tất.')}).catch(()=>{});
 });
 await seed(page,true);await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await expect(page.locator('.prose')).toContainText('Chương một đã hoàn tất.');
 await expect.poll(()=>calls.filter(call=>call.text===raw(2)).map(call=>call.model)).toEqual([first,fallback]);
 expect(calls.at(-1)?.logged).toBe(logging);
 await page.getByRole('navigation',{name:'Điều hướng chương đầu trang'}).getByRole('link',{name:'Chương sau →',exact:true}).click();
 await expect(page).toHaveURL(/latency-2$/);expect(calls).toHaveLength(3);release();
 await expect(page.locator('.prose')).toContainText('Chương hai đã chuyển model và hoàn tất.');
 expect(calls.map(call=>call.model)).toEqual([first,first,fallback]);expect(calls.every(call=>call.text===raw(1)||call.text===raw(2))).toBe(true);
});
async function seed(page:Page,preload:boolean){
 await page.goto('/');await expect(page.getByRole('button',{name:'Thêm truyện',exact:true})).toBeVisible();
 await page.evaluate(async({book,first,fallback,preload,chapters})=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['books','chapters','settings'],'readwrite');
   tx.objectStore('books').put({id:book,title:'Truyện tổng hợp kiểm tra chờ dịch',author:'Tổng hợp',status:'ready',chapterCount:2,charCount:6000,createdAt:1,updatedAt:1});
   chapters.forEach((text,index)=>tx.objectStore('chapters').put({id:`latency-${index+1}`,bookId:book,order:index,title:`Chương ${index+1}`,text,revision:1,sourceId:''}));
   tx.objectStore('settings').put({key:'reader-options',value:{mode:'original',preloadAi:preload,autoNext:false}});
   tx.objectStore('settings').put({key:`ai-book-settings:${book}`,value:{model:first,temperature:0,fallbackModels:[fallback],splitParts:false}});
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });db.close();
 },{book,first,fallback,preload,chapters:[raw(1),raw(2)]});
 await page.goto(`/read/${book}/latency-1`);await expect(page.locator('.prose')).toContainText('第1章');
}

test('a failing current model falls back after one send while preserving the whole chapter',async({page})=>{
 await seed(page,false);const calls:{model:string;text:string}[]=[];
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls.push({model:input.model,text:input.text});return input.model===first?r.fulfill({status:504,json:{error:'ai_timeout'}}):r.fulfill({json:done(input.model,'Bản dịch đã phục hồi nguyên chương.')});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch đã phục hồi nguyên chương.');
 expect(calls).toEqual([{model:first,text:raw(1)},{model:fallback,text:raw(1)}]);
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await expect(page.getByLabel('Chương này',{exact:true})).toContainText('1/1 phần hoàn tất');
});

test('whole-result recovery is immediate without advancing the page clock',async({page})=>{
 await seed(page,false);await page.clock.install({time:new Date('2026-10-28T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-28T00:00:01Z'));
 const start=await page.evaluate(()=>Date.now()),calls:string[]=[],flags:string[]=[];
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls.push(input.text);flags.push(r.request().headers()['x-ai-immediate']);return calls.length<3?r.fulfill({status:502,headers:{'X-AI-Failure-Reason':'output_limit'},json:{error:'ai_incomplete_result'}}):r.fulfill({json:done(input.model,'Đã phục hồi ngay.')});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Đã phục hồi ngay.');expect(calls).toEqual([raw(1),raw(1),raw(1)]);expect(flags).toEqual(['1','1','1']);expect(await page.evaluate(()=>Date.now())).toBe(start);
});

test('exhausted output failures keep a bounded burst and never schedule a countdown',async({page})=>{
 await seed(page,false);await page.clock.install({time:new Date('2026-10-28T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-28T00:00:01Z'));let calls=0;
 await page.route('**/api/ai/translate',r=>{calls++;return r.fulfill({status:502,headers:{'X-AI-Failure-Reason':'output_limit'},json:{error:'ai_incomplete_result'}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>calls).toBe(21);await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await expect(page.getByLabel('Chương này',{exact:true})).toContainText('Chưa hoàn tất');
 await expect(page.getByText(/Chờ thử lại ·|Tự thử lại sau|Tự tiếp tục sau/)).toHaveCount(0);const before=calls;await page.clock.runFor(900000);expect(calls).toBe(before);
});

test('Reader reaches Gemini 2.5 before Gemma when earlier models time out',async({page})=>{
 await seed(page,false);const models:string[]=[];
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();models.push(input.model);return input.model==='gemini-2.5-flash'?r.fulfill({json:done(input.model,'Bản dịch Gemini 2.5 hoàn tất.')}):r.fulfill({status:504,json:{error:'ai_timeout'}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch Gemini 2.5 hoàn tất.');
 expect(models).toEqual(['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash','gemini-2.5-flash']);
});

test('current Reader uses actual 3.5 Lite after 2.5 fails',async({page})=>{
 await seed(page,false);const models:string[]=[];
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();models.push(input.model);return input.model==='gemini-3.5-flash-lite'?r.fulfill({json:done(input.model,'Bản Lite hoàn tất.')}):r.fulfill({status:504,json:{error:'ai_timeout'}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản Lite hoàn tất.');
 expect(models).toEqual(['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash','gemini-2.5-flash','gemini-3.5-flash-lite']);
});

for(const heldModel of ['gemini-2.5-flash','gemma-4-26b-a4b-it'])test(`prewarm skips Lite and promotion continues held ${heldModel} before admitting Lite`,async({page})=>{
 await seed(page,true);let release!:()=>void;const gate=new Promise<void>(r=>release=r),models:string[]=[];let currentCalls=0;
 await page.route('**/api/ai/translate',async r=>{const input=r.request().postDataJSON();if(input.text===raw(1)){currentCalls++;return r.fulfill({json:done(input.model,'Chương một hoàn tất.')});}
  models.push(input.model);if(input.model===heldModel)await gate;
  return input.model==='gemini-3.5-flash-lite'?r.fulfill({json:done(input.model,'Chương hai Lite hoàn tất.')}):r.fulfill({status:504,json:{error:'ai_timeout'}});
 });
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Chương một hoàn tất.');await expect.poll(()=>models.at(-1)).toBe(heldModel);expect(models).not.toContain('gemini-3.5-flash-lite');const before=[...models];
 await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/latency-2$/);expect(models).toEqual(before);release();await expect(page.locator('.prose')).toContainText('Chương hai Lite hoàn tất.');expect(models).toEqual([...before,'gemini-3.5-flash-lite']);expect(currentCalls).toBe(1);
});

test('opening pending prewarm replays its model and follows fallback without starting over',async({page})=>{
 await seed(page,true);let fail!:()=>void,finish!:()=>void;const failed=new Promise<void>(r=>fail=r),finished=new Promise<void>(r=>finish=r),calls:{model:string;text:string}[]=[];
 await page.route('**/api/ai/translate',async r=>{
  const input=r.request().postDataJSON();calls.push({model:input.model,text:input.text});
  if(input.text===raw(1))return r.fulfill({json:done(input.model,'Chương một hoàn tất.')});
  if(input.model===first){await failed;return r.fulfill({status:504,json:{error:'ai_timeout'}}).catch(()=>{});}
  await finished;return r.fulfill({json:done(input.model,'Chương hai hoàn tất sau chuyển model.')}).catch(()=>{});
 });
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Chương một hoàn tất.');
 await expect.poll(()=>calls.length).toBe(2);await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/latency-2$/);
 await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();const current=page.getByLabel('Chương này',{exact:true});
 await expect(current).toContainText('Gemini 3.8 Flash');expect(calls).toHaveLength(2);
 fail();await expect.poll(()=>calls.length).toBe(3);await expect(current).toContainText('Gemini 3.7 Flash');
 finish();await expect(page.locator('.prose')).toContainText('Chương hai hoàn tất sau chuyển model.');
 expect(calls).toEqual([{model:first,text:raw(1)},{model:first,text:raw(2)},{model:fallback,text:raw(2)}]);
});
