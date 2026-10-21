// Uses the protected local connection file. Only a new synthetic book is uploaded.
// Never emit connection credentials or enable Playwright traces here.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
const directory=join(homedir(),'.codex','private-novel');
const {token,origin}=JSON.parse(readFileSync(join(directory,'cloud-device.json'),'utf8'));
if(!/^[a-f0-9]{64}$/.test(token)||origin!=='https://thu-phong-private.pages.dev')throw new Error('Invalid local device configuration');
const id=randomUUID(),title=`Synthetic R2 smoke ${id}`;
const snapshot={format:'thu-phong-cloud',version:1,book:{id,title,author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:3},chapters:[{id:randomUUID(),bookId:id,order:0,title:'Chapter fixture',text:'山门。',revision:1,sourceId:''}],names:[{key:'山门',value:'Cổng Riêng'}]};
const body=JSON.stringify(snapshot),sha256=createHash('sha256').update(body).digest('hex');
const headers={Authorization:`Bearer ${token}`,Origin:origin,'Content-Type':'application/json','X-Book-Title':encodeURIComponent(title),'X-Content-SHA256':sha256};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const anonymous=await fetch(`${origin}/api/cloud/books`);if(anonymous.status!==401)throw new Error(`Anonymous cloud gate HTTP ${anonymous.status}`);
  const put=await fetch(`${origin}/api/cloud/books/${id}`,{method:'PUT',headers,body});if(put.status!==201)throw new Error(`Synthetic upload HTTP ${put.status}`);
  writeFileSync(join(directory,'smoke-cloud-cleanup.json'),JSON.stringify({id,sha256,title,objectKey:`books/v1/${id}/${sha256}.json`}),{mode:0o600});
  const retry=await fetch(`${origin}/api/cloud/books/${id}`,{method:'PUT',headers,body});if(retry.status!==200)throw new Error(`Idempotent retry HTTP ${retry.status}`);
  const get=await fetch(`${origin}/api/cloud/books/${id}`,{headers});if(get.status!==200||await get.text()!==body)throw new Error('Production R2 byte roundtrip failed');
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto(`${origin}/#cloud-connect=${token}`);await expect.poll(()=>new URL(page.url()).hash).toBe('');
  await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('cloud');const panel=page.getByRole('region',{name:'Kho truyện cloud',exact:true});
  const row=panel.locator('.restore-row').filter({hasText:title});await expect(row).toBeVisible();await row.getByRole('button',{name:'Đọc truyện',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng Riêng');
  await page.reload();await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('cloud');await expect(panel).toContainText('Thiết bị đã kết nối');
  await panel.getByRole('button',{name:'Ngắt kết nối thiết bị',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Truyện local vẫn được giữ');
  console.log('PASS: production anonymous401, authenticated R2 upload201/retry200/download exact, one-time device link/reload/one-click read Chinese+Name/disconnect. Synthetic cleanup metadata saved locally.');
}catch(error){console.error(String(error instanceof Error?error.message:error).replaceAll(token,'[redacted]'));process.exitCode=1;}finally{await browser.close();}
