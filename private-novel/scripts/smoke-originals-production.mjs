// Only fresh synthetic UUIDs are written/read/deleted. No real library contents.
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
const origin='https://thu-phong-private.pages.dev';
const id=randomUUID(),sourceId=randomUUID(),raw=Buffer.from('\ufeff第1章 测试\r\n山门。😀\r\n'),sha=createHash('sha256').update(raw).digest('hex');
const text='第1章 测试\n山门。😀\n';
const snapshot={format:'thu-phong-cloud',version:1,book:{id,title:'Original synthetic smoke',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:1,charCount:text.length},chapters:[{id:randomUUID(),bookId:id,order:0,title:'第1章 测试',text,revision:1,sourceId:''}],names:[]};
const json=JSON.stringify(snapshot),snapshotSha=createHash('sha256').update(json).digest('hex');
const descriptor={version:1,sourceId,name:'synthetic%25.txt',relativePath:'Synthetic/synthetic%25.txt',encoding:'utf-8',sha256:sha,bytes:raw.length};
const headers={Origin:origin};let created=false,browser;
async function checked(path,init,status){const response=await fetch(origin+'/api/cloud/'+path,{...init,headers:{...headers,...init?.headers}});if(response.status!==status)throw new Error(`${init?.method??'GET'} synthetic endpoint HTTP ${response.status}, expected${status}`);return response;}
try{
  if((await fetch(origin).then(r=>r.text())).trim()!==readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').trim())throw new Error('Canonical build differs from dist');
  const capabilities=await(await checked('books?features=1',undefined,200)).json();if(capabilities.features?.originalsV1!==true)throw new Error('Originals feature is unavailable');
  await checked(`books/${id}`,{method:'PUT',headers:{'Content-Type':'application/json','X-Book-Title':encodeURIComponent(snapshot.book.title),'X-Content-SHA256':snapshotSha},body:json},201);created=true;
  await checked(`books/${id}/originals/${sourceId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(descriptor)},201);
  await checked(`books/${id}/originals/${sourceId}/data`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:raw},201);
  await checked(`books/${id}/originals/${sourceId}/data`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:raw},200);
  const binary=await checked(`books/${id}/originals/${sourceId}/data`,undefined,200);if(!Buffer.from(await binary.arrayBuffer()).equals(raw)||binary.headers.get('X-Content-SHA256')!==sha)throw new Error('Production original roundtrip differs');
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:1280,height:800},{width:510,height:530}]){
    const context=await browser.newContext({viewport,acceptDownloads:true});
    await context.route(origin+'/api/cloud/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path.startsWith(`/api/cloud/books/${id}`))return route.continue();
      if(path.includes('dictionaries'))return route.fulfill({json:{version:1,dictionaries:[]}});
      if(path.includes('deletions'))return route.fulfill({json:{ids:[],cursor:null}});
      return route.fulfill({headers:{'X-Library-Access':'public'},json:{books:[{id,title:snapshot.book.title,sha256:snapshotSha,bytes:Buffer.byteLength(json),updatedAt:1}],cursor:null,features:{originalsV1:true}}});
    });
    const page=await context.newPage();await page.goto(origin);await expect(page.locator('.book-card')).toHaveCount(1);
    await page.getByRole('button',{name:/^Thông tin /}).click();await page.getByText('File gốc',{exact:true}).click();
    const button=page.getByRole('button',{name:'Tải synthetic%25.txt',exact:true});await expect(button).toBeEnabled();
    const event=page.waitForEvent('download');await button.click();const download=await event;if(download.suggestedFilename()!==descriptor.name)throw new Error('Filename differs');
    const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);if(!Buffer.concat(chunks).equals(raw))throw new Error('Fresh browser original download differs');
    await page.getByRole('button',{name:'Đọc từ đầu',exact:true}).click();await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('article.prose')).toContainText('山门。');
    await page.reload();await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('article.prose')).toContainText('山门。');await context.close();
  }
  console.log('PASS: canonical build, native production original reserve/put/retry/byte+SHA roundtrip, fresh device UI/download/read/reload at1280/510; only synthetic fixture used.');
}finally{
  await browser?.close();
  if(created){await checked(`books/${id}`,{method:'DELETE'},200);await checked(`books/${id}/originals/${sourceId}/data`,undefined,410);console.log('PASS: synthetic book tombstoned; original GET410. Reservation retained by policy.');}
}
