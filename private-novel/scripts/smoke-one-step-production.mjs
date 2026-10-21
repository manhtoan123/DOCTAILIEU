import {chromium,expect} from '@playwright/test';
const origin='https://thu-phong-private.pages.dev';const text='第1章 起点\n你好。\n第2章 后来\n正文。';
const browser=await chromium.launch({channel:'msedge'});
try{for(const viewport of [{width:1280,height:800},{width:522,height:524}]){
 const context=await browser.newContext({viewport});await context.route(`${origin}/api/cloud/**`,r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[]}}));
 await context.addInitScript(()=>{window.confirm=()=>{throw new Error('Unexpected manual confirmation');};});
 const page=await context.newPage();await page.goto(origin);
 async function add(){await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();}
 async function back(){await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();}
 await add();await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles({name:'Synthetic one.txt',mimeType:'text/plain',buffer:Buffer.from(text)});await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await back();await expect(page.locator('.book-card')).toHaveCount(1);
 await add();await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles(['Synthetic two','Synthetic three'].map(name=>({name:name+'.txt',mimeType:'text/plain',buffer:Buffer.from(text)})));await page.getByRole('button',{name:'Nhập nhiều truyện',exact:true}).click();await back();await expect(page.locator('.book-card')).toHaveCount(3);
 await add();await page.getByRole('button',{name:'Nhập folder truyện',exact:true}).click();await page.getByLabel('Chọn folder truyện',{exact:true}).evaluate((element,text)=>{const dt=new DataTransfer();for(const name of ['A','B']){const file=new File([text],name+'.txt');Object.defineProperty(file,'webkitRelativePath',{value:'Kho/Synthetic/'+name+'.txt'});dt.items.add(file);}element.files=dt.files;element.dispatchEvent(new Event('change',{bubbles:true}));},text);await page.getByRole('button',{name:'Nhập folder',exact:true}).click();await back();await expect(page.locator('.book-card')).toHaveCount(5);
 await page.getByLabel('Lọc Album',{exact:true}).selectOption('album:Kho/Synthetic');await expect(page.locator('.book-card')).toHaveCount(2);
 await page.locator('.book-options summary').first().click();await page.getByRole('button',{name:'Xóa',exact:true}).first().click();await expect(page.locator('.book-card')).toHaveCount(1);
 console.log(JSON.stringify({viewport,single:1,batch:2,folder:2,album:true,oneSubmit:true,noConfirm:true,delete:true,cloudIsolated:true}));await context.close();
}}finally{await browser.close();}
