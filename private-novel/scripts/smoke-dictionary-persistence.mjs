import {chromium,expect} from '@playwright/test';
// Fresh isolated browser storage: synthetic dictionary only, no user content.
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext();const page=await context.newPage();
 await page.goto('https://thu-phong-private.pages.dev/');
 const open=async()=>{await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('dictionary');};
 await open();await page.getByLabel('Chọn file TXT (có thể chọn nhiều)').setInputFiles({name:'Vietphrase.txt',mimeType:'text/plain',buffer:Buffer.from('你好=xin chào\n山门=sơn môn')});
 await page.getByRole('button',{name:'Lưu 1 file vào trình duyệt',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Đã lưu 1 file'})).toBeVisible();
 for(let i=0;i<3;i++){
  await page.reload();await open();await expect(page.getByRole('heading',{name:'Từ điển đã lưu trên thiết bị',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Lưu 1 file vào trình duyệt',exact:true})).toHaveCount(0);
  const panel=page.getByRole('region',{name:'Convert đoạn chữ Trung'});await panel.getByLabel('Văn bản Trung',{exact:true}).fill('你好山门');await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();await expect(panel.getByLabel('Kết quả Convert')).toHaveText('Xin chào sơn môn');
 }
 console.log('Production dictionary persistence: 3 reloads and Convert passed without reselecting files.');
}finally{await browser.close();}
