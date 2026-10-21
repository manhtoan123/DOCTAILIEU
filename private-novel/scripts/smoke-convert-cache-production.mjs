// Synthetic dictionary/story in a fresh browser profile; no real files selected.
import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const context=await browser.newContext();await context.addInitScript(()=>{
    const NativeWorker=window.Worker;window.cacheProbe={blocked:false,converts:0};
    window.Worker=class extends NativeWorker{postMessage(message,options){
      if(message.type==='load'&&sessionStorage.getItem('block-load')==='yes'){window.cacheProbe.blocked=true;return;}
      if(message.type==='convert'&&message.text==='你好山门。')window.cacheProbe.converts++;
      super.postMessage(message,options||{});
    }};
  });
  const page=await context.newPage();await page.goto('https://thu-phong-private.pages.dev/');
  await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('dictionary');
  await page.getByLabel('Chọn file TXT (có thể chọn nhiều)').setInputFiles({name:'Vietphrase.txt',mimeType:'text/plain',buffer:Buffer.from('你好=xin chào\n山门=sơn môn')});
  await page.getByRole('button',{name:'Lưu 1 file vào trình duyệt',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã lưu 1 file'})).toBeVisible();
  await page.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('button',{name:/Tủ sách/}).click();await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
  await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles({name:'Synthetic cache.txt',mimeType:'text/plain',buffer:Buffer.from('你好山门。')});
  await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.locator('.prose')).toContainText('Xin chào sơn môn.');
  await page.evaluate(()=>sessionStorage.setItem('block-load','yes'));await page.reload();const start=Date.now();await page.getByRole('button',{name:'Mở sách →',exact:true}).click();await expect(page.locator('.prose')).toContainText('Xin chào sơn môn.');
  const probe=await page.evaluate(()=>window.cacheProbe);if(!probe.blocked||probe.converts!==0)throw new Error('Cache did not bypass blocked dictionary load');
  console.log(JSON.stringify({productionCacheSmoke:'PASS',cachedOpenMs:Date.now()-start,dictionaryLoadBlocked:probe.blocked,workerChapterConverts:probe.converts,syntheticOnly:true}));
}finally{await browser.close();}
