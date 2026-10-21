import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

let runtime:Miniflare;
const raw='第1章 起点\r\n你好。😀\r\n第2章 后来\r\n正文结束。\r\n';
test.beforeEach(async()=>{
  const compiled=await build({stdin:{contents:`import {handleCloudLibrary} from './server/cloud-library';export default {fetch(request,env,ctx){return handleCloudLibrary(request,env,p=>ctx.waitUntil(p));}}`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
  runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-01-01',bindings:{PUBLIC_LIBRARY:'1'},d1Databases:['DB'],r2Buckets:['LIBRARY_BUCKET']}));
  const db=await runtime.getD1Database('DB');
  for(const name of ['0002_cloud_library.sql','0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql','0005_cloud_originals.sql']){
    const sql=readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();
    await db.batch(sql.split(/;\s*(?=(?:CREATE|INSERT|ALTER|DROP|UPDATE)\s)/i).map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
  }
});
test.afterEach(async()=>{await runtime?.dispose();});
async function bridge(page:Page){
  await page.route('**/api/cloud/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname.includes('/dictionaries'))return route.fulfill({json:{version:1,dictionaries:[]}});
    const headers=await request.allHeaders();headers.origin=url.origin;
    const body=request.postDataBuffer();
    const response=await runtime.dispatchFetch(request.url(),{method:request.method(),headers,...(body?{body}: {})});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
}
test('batch TXT automatically stores native R2 originals; fresh device reads chapters and downloads exact source',async({page,browser})=>{
  await bridge(page);await page.goto('/');
  await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
  await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles(['A','B'].map(name=>({name:`${name}.txt`,mimeType:'text/plain',buffer:Buffer.from(raw)})));
  await page.getByRole('button',{name:'Nhập nhiều truyện',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const db=await runtime.getD1Database('DB');
  await expect.poll(async()=>await db.prepare("SELECT COUNT(*) AS count FROM cloud_originals WHERE state='ready'").first('count')).toBe(2);
  const originals=(await db.prepare('SELECT * FROM cloud_originals').all()).results;
  const sha=createHash('sha256').update(Buffer.from(raw)).digest('hex');
  for(const original of originals){
    const object=await(await runtime.getR2Bucket('LIBRARY_BUCKET')).get(String(original.object_key));
    expect(Buffer.from(await object!.arrayBuffer())).toEqual(Buffer.from(raw));expect(original.sha256).toBe(sha);
  }
  const fresh=await browser.newContext({viewport:{width:510,height:530},acceptDownloads:true});
  try{
    const other=await fresh.newPage();await bridge(other);await other.goto('http://127.0.0.1:5173/');
    await expect(other.locator('.book-card')).toHaveCount(2);
    await other.getByRole('button',{name:/^Thông tin /}).first().click();
    await expect(other.getByRole('region',{name:'Thông tin truyện'})).toBeVisible();
    await other.getByText('File gốc',{exact:true}).click();
    await expect(other.getByRole('button',{name:/Tải .*\.txt/})).toHaveCount(1);
    const downloaded=other.waitForEvent('download');await other.getByRole('button',{name:/Tải .*\.txt/}).click();
    const download=await downloaded;expect(download.suggestedFilename()).toMatch(/^[AB]\.txt$/);
    const stream=await download.createReadStream(),parts:Buffer[]=[];
    for await(const part of stream!)parts.push(Buffer.from(part));expect(Buffer.concat(parts)).toEqual(Buffer.from(raw));
    await other.getByRole('button',{name:'Đọc từ đầu',exact:true}).click();
    await other.getByRole('button',{name:'Bản gốc',exact:true}).click();
    await expect(other.locator('article.prose')).toContainText('你好。');
    expect(await other.evaluate(async()=>{const{db}=await import('/src/core/db.ts');return db.sources.count();})).toBe(0);
  }finally{await fresh.close();}
});
