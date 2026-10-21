import {chromium,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';

const origin='https://thu-phong-private.pages.dev',id=randomUUID(),chapterId=randomUUID();
const title=`Synthetic shared smoke ${id}`;
const snapshot={format:'thu-phong-cloud',version:1,book:{id,title,author:'Synthetic fixture',status:'ready',chapterCount:1,charCount:3,createdAt:1,updatedAt:1},chapters:[{id:chapterId,bookId:id,order:0,title:'Synthetic chapter',text:'山门。',revision:1,sourceId:''}],names:[{key:'山门',value:'Cổng Riêng'}]};
const body=Buffer.from(JSON.stringify(snapshot)),sha256=createHash('sha256').update(body).digest('hex');
const html=await fetch(origin).then(r=>r.text());
if(html.trim()!==readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').trim())throw new Error('Canonical HTML does not match build');
const catalog=await fetch(`${origin}/api/cloud/books`);
if(catalog.status!==200||catalog.headers.get('X-Library-Access')!=='public')throw new Error('Anonymous public catalog unavailable');
const manifest=await fetch(`${origin}/api/cloud/dictionaries`).then(r=>{if(!r.ok)throw new Error('Dictionary manifest unavailable');return r.json();});
if(manifest.version!==1||manifest.dictionaries.length!==7)throw new Error('Seed manifest incomplete');
const vp=manifest.dictionaries.find(e=>e.kind==='vp');
for(let attempt=0;attempt<3;attempt++){
  const response=await fetch(`${origin}/api/cloud/dictionaries/vp/${vp.sha256}`);
  const digest=createHash('sha256');let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;digest.update(chunk);}
  if(response.status!==200||bytes!==vp.bytes||digest.digest('hex')!==vp.sha256)throw new Error('Production dictionary stream is incomplete');
}
console.log('Three production Vietphrase transfers have exact bytes and SHA-256.');
const put=await fetch(`${origin}/api/cloud/books/${id}`,{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json','X-Book-Title':encodeURIComponent(title),'X-Content-SHA256':sha256},body});
if(put.status!==201)throw new Error(`Synthetic upload failed ${put.status}`);
const denied=await fetch(`${origin}/api/cloud/books/${randomUUID()}`,{method:'DELETE',headers:{Origin:'https://external.invalid'}});
if(denied.status!==403)throw new Error('Foreign-Origin deletion not denied');
const browser=await chromium.launch({channel:'msedge',headless:true});
let cleaned=false;
const metrics=[];
try{
  for(const viewport of [{width:1280,height:800},{width:522,height:516}]){
    const context=await browser.newContext({viewport});const page=await context.newPage();let downloads=0;
    page.on('request',req=>{if(/\/api\/cloud\/dictionaries\/[^/]+\/[a-f0-9]{64}$/.test(req.url()))downloads++;});
    const started=performance.now();await page.goto(origin);
    const card=page.locator('.book-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
    await expect(card).toBeVisible({timeout:120000});
    await card.getByRole('button',{name:'Mở sách →',exact:true}).click();
    await expect(page.locator('.prose')).toContainText('Cổng Riêng',{timeout:150000});
    const coldMs=Math.round(performance.now()-started);
    const count=await page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('thu-phong-v1');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const connection=open.result,request=connection.transaction('dictionaries').objectStore('dictionaries').count();request.onerror=()=>reject(request.error);request.onsuccess=()=>{resolve(request.result);connection.close();};};}));
    if(count!==7)throw new Error('Default dictionary install incomplete');
    if(downloads!==7)throw new Error(`Expected seven cold dictionary downloads, got ${downloads}`);
    await page.reload();await expect(card).toBeVisible({timeout:30000});
    await card.getByRole('button',{name:'Mở sách →',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng Riêng',{timeout:30000});
    if(downloads!==7)throw new Error('Reload redownloaded stored dictionaries');
    mkdirSync('test-results',{recursive:true});await page.screenshot({path:`test-results/public-real-reader-${viewport.width}.png`});
    metrics.push({viewport:viewport.width,coldMs,downloads,seedBytes:manifest.dictionaries.reduce((n,e)=>n+e.bytes,0)});
    console.log(JSON.stringify({viewport:viewport.width,coldMs,downloads,reloadDownloaded:0}));
    await context.close();
  }
  const del=await fetch(`${origin}/api/cloud/books/${id}`,{method:'DELETE',headers:{Origin:origin}});
  if(del.status!==200)throw new Error('Synthetic delete failed');cleaned=true;
  const retry=await fetch(`${origin}/api/cloud/books/${id}`,{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json','X-Book-Title':encodeURIComponent(title),'X-Content-SHA256':sha256},body});
  if(retry.status!==410)throw new Error('Deleted synthetic fixture resurrected');
  if((await fetch(`${origin}/api/cloud/books/${id}`)).status!==404)throw new Error('Deleted fixture still downloadable');
  writeFileSync('test-results/public-real-metrics.json',JSON.stringify({metrics,publicCatalog:200,upload:201,delete:200,retry:410,foreignOrigin:403},null,2));
  console.log(JSON.stringify({metrics,publicCatalog:200,upload:201,delete:200,retry:410,foreignOrigin:403,fixtureDeleted:true}));
}finally{
  await browser.close();
  if(!cleaned)await fetch(`${origin}/api/cloud/books/${id}`,{method:'DELETE',headers:{Origin:origin}});
}
