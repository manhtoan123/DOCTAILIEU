import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const token='a'.repeat(64);
test('one-time device link strips fragment, sends Bearer and opens cloud story in one click',async({page,context})=>{
  const id='11111111-1111-4111-8111-111111111111';
  const snapshot={format:'thu-phong-cloud',version:1,book:{id,title:'Cloud paired fixture',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:3},chapters:[{id:'22222222-2222-4222-8222-222222222222',bookId:id,order:0,title:'Chapter fixture',text:'山门。',revision:1,sourceId:''}],names:[{key:'山门',value:'Cổng Riêng'}]};
  const body=Buffer.from(JSON.stringify(snapshot));const sha256=createHash('sha256').update(body).digest('hex');let requests=0;
  await context.route('**/api/cloud/**',async route=>{if(route.request().url().includes('/dictionaries')){await route.fulfill({json:{version:1,dictionaries:[]}});return;}if(route.request().url().includes('/deletions')){await route.fulfill({json:{ids:[],cursor:null}});return;}if(!route.request().headers()['authorization']){await route.fulfill({status:401,json:{error:'unauthorized'}});return;}requests++;expect(route.request().headers()['authorization']).toBe(`Bearer ${token}`);expect(route.request().url()).not.toContain(token);if(route.request().url().endsWith('/books'))await route.fulfill({json:{books:[{id,title:snapshot.book.title,sha256,bytes:body.length,updatedAt:1}],cursor:null}});else await route.fulfill({body,contentType:'application/json'});});
  await page.goto(`/#cloud-connect=${token}`);await expect.poll(()=>new URL(page.url()).hash).toBe('');
  await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('cloud');const panel=page.getByRole('region',{name:'Kho truyện cloud',exact:true});
  await expect(panel).toContainText('Thiết bị đã kết nối');await expect(panel).not.toContainText(token);await expect(panel.getByRole('button',{name:'Đọc truyện',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Đọc truyện',exact:true}).click();await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng Riêng');
  await page.reload();await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng Riêng');await page.goto('/settings/cloud');await expect(panel).toContainText('Thiết bị đã kết nối');expect(requests).toBeGreaterThan(0);
  await panel.getByRole('button',{name:'Ngắt kết nối thiết bị',exact:true}).click();await expect(panel).toContainText('Truyện local vẫn được giữ');
  expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:await db.books.count(),token:!!await db.settings.get('cloud-device-token'),acks:await db.settings.where('key').startsWith('cloud-uploaded:').count()};})).toEqual({books:1,token:false,acks:0});
});
test('invalid device link is removed and never stored or included in an error',async({page})=>{
  const bad='not-a-valid-secret';await page.goto(`/#cloud-connect=${bad}`);await expect.poll(()=>new URL(page.url()).hash).toBe('');await expect(page.getByRole('status').filter({hasText:'Liên kết kết nối thiết bị không hợp lệ'})).toBeVisible();await expect(page.locator('body')).not.toContainText(bad);
  expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.settings.get('cloud-device-token');})).toBeUndefined();
});
test('connection link also works when pasted into an already open page',async({page,context})=>{
  await context.route('**/api/cloud/**',async route=>{const auth=route.request().headers()['authorization'];if(!auth){await route.fulfill({status:401,json:{error:'unauthorized'}});return;}expect(auth).toBe(`Bearer ${token}`);await route.fulfill({json:route.request().url().includes('/dictionaries')?{version:1,dictionaries:[]}:route.request().url().includes('/deletions')?{ids:[],cursor:null}:{books:[],cursor:null}});});
  await page.goto('/');await page.evaluate(value=>{location.hash=`cloud-connect=${value}`;},token);await expect.poll(()=>new URL(page.url()).hash).toBe('');
  await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('cloud');await expect(page.getByRole('region',{name:'Kho truyện cloud',exact:true})).toContainText('Thiết bị đã kết nối');
});
