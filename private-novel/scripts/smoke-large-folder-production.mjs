import {chromium,expect} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const origin='https://thu-phong-private.pages.dev',album=`Kho/Lô thử ${randomUUID().slice(0,8)}`;
const sourceBytes=14_103_969; // Synthetic file matching the reported source size, never its contents.
const browser=await chromium.launch({channel:'msedge',headless:true});
let fixtureIds=[];
try{
  const html=await fetch(origin).then(response=>response.text());
  if(html.trim()!==readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').trim())throw new Error('Production HTML differs from build.');
  const context=await browser.newContext({viewport:{width:522,height:651}});
  await context.route(`${origin}/api/cloud/dictionaries`,route=>route.fulfill({json:{version:1,dictionaries:[]}}));
  const page=await context.newPage();await page.goto(origin);
  await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
  await page.getByRole('button',{name:'Nhập folder truyện',exact:true}).click();
  const expected=await page.getByLabel('Chọn folder truyện',{exact:true}).evaluate((element,{size,album})=>{
    const start='第1章 开始\n',end='\n第2章 结尾\n完成';
    const fillSize=size-new TextEncoder().encode(start+end).length;
    const text=start+'文'.repeat(Math.floor(fillSize/3))+'x'.repeat(fillSize%3)+end;
    const files=new DataTransfer();
    const small=new Uint8Array([0xff,0xfe,0x2d,0x4e]); // UTF16LE BOM + 中 in a UTF8-default folder.
    for(const [path,body]of [[`${album}/1.txt`,small],[`${album}/Large.txt`,text]]){
      const file=new File([body],path.split('/').at(-1));Object.defineProperty(file,'webkitRelativePath',{value:path});files.items.add(file);
    }
    element.files=files.files;element.dispatchEvent(new Event('change',{bubbles:true}));
    return {chars:text.length,bytes:files.files[1].size};
  },{size:sourceBytes,album});
  expect(expected.bytes).toBe(sourceBytes);
  await expect(page.getByRole('region',{name:'Xem trước folder'})).toContainText('2 truyện · 2 file TXT');
  await page.getByRole('button',{name:'Chuẩn bị nhập folder',exact:true}).click();
  await expect(page.getByRole('button',{name:'Xác nhận các folder vào thư viện',exact:true})).toBeVisible({timeout:60000});
  // Capture only IDs created in this fresh profile, including staging, for cleanup on failure.
  fixtureIds=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('thu-phong-v1');open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{const db=open.result,tx=db.transaction('books','readonly'),request=tx.objectStore('books').getAll();request.onsuccess=()=>resolve(request.result.map(book=>book.id));tx.oncomplete=()=>db.close();};
  }));
  await page.getByRole('button',{name:'Xác nhận các folder vào thư viện',exact:true}).click();
  // Verify the real catalog by fixture UUID; never enumerate or print other books.
  let large;
  await expect.poll(async()=>{
    let cursor=null,found=[];
    do{
      const response=await fetch(`${origin}/api/cloud/books${cursor?`?cursor=${cursor}`:''}`,{signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error(`Catalog ${response.status}`);
      const data=await response.json();found.push(...data.books.filter(book=>fixtureIds.includes(book.id)));cursor=data.cursor;
    }while(cursor);
    large=found.find(book=>book.title==='Large');return found.length;
  },{timeout:180000,intervals:[500,1000,2000]}).toBe(2);
  const response=await fetch(`${origin}/api/cloud/books/${large.id}`,{signal:AbortSignal.timeout(120000)});
  const raw=Buffer.from(await response.arrayBuffer()),snapshot=JSON.parse(raw);
  expect(createHash('sha256').update(raw).digest('hex')).toBe(large.sha256);
  expect(snapshot.book.album).toBe(album);expect(snapshot.book.charCount).toBe(expected.chars);
  expect(snapshot.chapters.length).toBeGreaterThan(2);
  expect(snapshot.chapters.every(chapter=>chapter.text.length<=64000)).toBe(true);
  expect(snapshot.chapters.at(-1).title).toBe('第2章 结尾');
  console.log(JSON.stringify({sourceBytes:expected.bytes,cloudBytes:raw.length,chapters:snapshot.chapters.length,album:true,cloudSHA:true,synthetic:true,dictionaryAPI:'isolated',androidHardware:false}));
}finally{
  await browser.close();
  for(const id of fixtureIds){const response=await fetch(`${origin}/api/cloud/books/${id}`,{method:'DELETE',headers:{Origin:origin},signal:AbortSignal.timeout(120000)});if(response.status!==200)throw new Error('Synthetic cleanup failed.');}
  if(fixtureIds.length)console.log('Synthetic book IDs deleted through API; reservations/tombstones retained. No D source contents read/uploaded.');
}
