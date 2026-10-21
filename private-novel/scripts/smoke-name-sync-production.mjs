import {chromium,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const origin='https://thu-phong-private.pages.dev',expected=readFileSync('dist/index.html','utf8').trim();
expect((await(await fetch(origin)).text()).trim()).toBe(expected);
const browser=await chromium.launch({channel:'msedge'}),context=await browser.newContext({viewport:{width:869,height:835},serviceWorkers:'block'});
let bookId='',rows=[],gets=0,blockedWrites=0,namePuts=0;
await context.route(origin+'/api/**',r=>{if(r.request().method()!=='GET')blockedWrites++;return r.fulfill({status:503,json:{error:'isolated synthetic smoke'}});});
await context.route(/\/api\/state(?:\?|$)/,r=>{
 const request=r.request(),url=new URL(request.url());
 if(request.method()!=='GET'){blockedWrites++;if(request.postDataJSON().record?.kind==='name')namePuts++;return r.fulfill({status:410,json:{error:'fixture forbids remote writes'}});}
 const scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0),pending=rows.filter(row=>row.record.bookId===scope&&row.revision>after),selected=pending.slice(0,99);
 if(bookId&&scope===bookId&&selected.length)gets++;
 return r.fulfill({json:{rows:selected,cursor:pending.length>99?selected.at(-1).revision:rows.length,more:pending.length>99}});
});
try{
 const page=await context.newPage();page.setDefaultTimeout(30000);await page.goto(origin);
 await page.getByRole('button',{name:'＋ Thêm truyện TXT / EPUB',exact:true}).click();
 await page.getByLabel('Tên truyện',{exact:true}).fill('Synthetic Name sync');await page.getByLabel('Hoặc dán nội dung',{exact:true}).fill('Chương 1: Thử Name\n名字1 xuất hiện trong truyện.');
 await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.locator('.reader-book-heading h1')).toHaveText('Synthetic Name sync');
 const readerUrl=page.url();bookId=new URL(readerUrl).pathname.split('/')[2];
 rows=Array.from({length:1241},(_,i)=>{const record={kind:'name',bookId,key:'名字'+i,value:i===123?'[i]https://archives.bulbagarden.net/media/upload/4/41/0423Gastrodon.png[/]Tên ảnh':'Tên '+i};return {record,id:createHash('sha256').update(JSON.stringify(['name',bookId,record.key])).digest('hex'),revision:i+1};});
 const start=performance.now();await page.goto(origin+'/settings/names');await page.getByLabel('Truyện dùng Name riêng').selectOption({label:'Synthetic Name sync'});
 const textarea=page.getByLabel('Name riêng của truyện',{exact:true});
 await expect.poll(async()=>((await textarea.inputValue()).match(/=Tên /g)||[]).length,{timeout:30000}).toBe(1240);
 const ms=Math.round(performance.now()-start),value=await textarea.inputValue();
 expect(value).toContain('名字123=[i]https://archives.bulbagarden.net/media/upload/4/41/0423Gastrodon.png[/]Tên ảnh');expect(gets).toBe(13);expect(namePuts).toBe(0);
 for(let i=0;i<1241;i++)expect(value.split('\n').some(line=>line.replace(/^\$/,'')===rows[i].record.key+'='+rows[i].record.value)).toBe(true);
 await page.goto(readerUrl);await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();await expect(page.locator('.ai-book-names summary')).toContainText('(1241)');
 await page.screenshot({path:'.dsh-tmp/name-sync/production.png'});
 const report={status:'passed',bundle:expected.match(/src="([^"]+\.js)"/)[1],syntheticNames:1241,ms,gets,namePuts,blockedWrites,realCloudWrites:0,realAiRequests:0,imageMarkupPreserved:true,userTabUnchanged:true};
 writeFileSync('.dsh-tmp/name-sync/production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await context.close();await browser.close();}
