import {chromium, expect} from '@playwright/test';
const origin = 'https://thu-phong-private.pages.dev';
const browser = await chromium.launch({channel: 'msedge'});
try {
  for (const viewport of [{width:1280,height:800}, {width:510,height:530}]) {
    const context = await browser.newContext({viewport});
    // Synthetic local book only: isolate every cloud path; no production library writes.
    await context.route(origin + '/api/cloud/**', r => r.fulfill({json: r.request().url().includes('dictionaries') ? {version:1,dictionaries:[]} : {books:[]}}));
    let calls = 0;
    await context.route(origin + '/api/ai/translate', r => {
      calls++;
      if (calls <= 3) return r.fulfill({status:502,contentType:'text/html',body:'<html>private synthetic gateway</html>'});
      const req = r.request().postDataJSON();
      return r.fulfill({json:{result:'Lâm Nhi mở cửa sổ.',model:req.model,finishReason:'STOP',inputTokens:3,outputTokens:4}});
    });
    const page = await context.newPage();
    await page.goto(origin);
    await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
    await page.getByLabel('Tên truyện',{exact:true}).fill('R1 synthetic local');
    await page.getByLabel('Hoặc dán nội dung',{exact:true}).fill('第1章 窗边\n林儿推开窗。');
    await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();
    await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
    await expect(page.getByText('Máy chủ trung gian chưa trả được bản dịch. Thử lại sau.').first()).toBeVisible({timeout:20000});
    expect(calls).toBe(3);
    await expect(page.locator('body')).not.toContainText('private synthetic gateway');
    await page.getByRole('button',{name:'Thử lại AI',exact:true}).click();
    await expect(page.locator('.prose')).toContainText('Lâm Nhi mở cửa sổ.');
    expect(calls).toBe(4);
    await page.getByRole('button',{name:'Bản gốc',exact:true}).click();
    await expect(page.locator('.prose')).toContainText('林儿推开窗');
    console.log(JSON.stringify({viewport,deployedFrontend:true,aiMocked:true,cloudIsolated:true,gatewayClassified:true,explicitRetry:true,sourcePreserved:true,calls}));
    await context.close();
  }
} finally {await browser.close();}
