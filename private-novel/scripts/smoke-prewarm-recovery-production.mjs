import {chromium,expect} from '@playwright/test';
const origin='https://thu-phong-private.pages.dev';
const browser=await chromium.launch({channel:'msedge'});
try{for(const viewport of [{width:1280,height:800},{width:510,height:530}]){
 const context=await browser.newContext({viewport});
 await context.route(origin+'/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
 let next=0,current=0;await context.route(origin+'/api/ai/translate',r=>{
  const req=r.request().postDataJSON();let result='AI chương một.';
  if(req.text.includes('第2章')){next++;if(next<=2)return r.fulfill({status:502,contentType:'text/html',body:'<html>synthetic gateway</html>'});result='AI chương hai đã tự phục hồi.';}else current++;
  return r.fulfill({json:{result,model:req.model,finishReason:'STOP',inputTokens:3,outputTokens:4}});
 });
 const page=await context.newPage();await page.goto(origin);await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
 await page.getByLabel('Tên truyện',{exact:true}).fill('Synthetic recovery only');
 await page.getByLabel('Hoặc dán nội dung',{exact:true}).fill('第1章 窗边\n林儿推开窗。\n第2章 回家\n林儿回家。');
 await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await expect(page.locator('.prose')).toContainText('AI chương một.');
 await expect.poll(()=>next,{timeout:20000}).toBe(3);await expect(page.locator('.prose')).toContainText('AI chương một.');
 await page.getByRole('button',{name:'Chương sau →',exact:true}).first().click();
 await expect(page.locator('.prose')).toContainText('AI chương hai đã tự phục hồi.');expect(next).toBe(3);expect(current).toBe(1);
 console.log(JSON.stringify({viewport,deployedFrontend:true,aiMocked:true,cloudIsolated:true,nextRecoveredBeforeNavigation:true,currentCalls:current,nextCalls:next,promotionDeduplicated:true}));await context.close();
}}finally{await browser.close();}
