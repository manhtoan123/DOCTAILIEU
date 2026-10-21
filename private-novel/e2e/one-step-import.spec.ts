import {test,expect,type Page} from '@playwright/test';

const chinese='第1章 起点\r\n你好。😀\r\n第2章 后来\r\n正文结束。\r\n';
async function open(page:Page){
  await page.goto('/');
  await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
}
async function snapshot(page:Page){
  return page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    return {books:await db.books.toArray(),chapters:await db.chapters.toArray(),sources:await Promise.all((await db.sources.toArray()).map(async source=>({name:source.name,path:source.relativePath,bytes:Array.from(new Uint8Array(await source.blob.arrayBuffer()))}))),jobs:await db.importJobs.toArray()};
  });
}
async function folderFiles(page:Page,entries:[string,string][]){
  await page.getByLabel('Chọn folder truyện',{exact:true}).evaluate((element:HTMLInputElement,selected)=>{
    const files=new DataTransfer();for(const [path,text]of selected){const file=new File([text],path.split('/').at(-1)!);Object.defineProperty(file,'webkitRelativePath',{value:path});files.items.add(file);}
    element.files=files.files;element.dispatchEvent(new Event('change',{bubbles:true}));
  },entries);
}

test('single explicit import saves split Chinese TXT and lossless source bytes without another confirmation',async({page})=>{
  await open(page);
  await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles({name:'中文.txt',mimeType:'text/plain',buffer:Buffer.from(chinese)});
  await page.getByLabel('Tên truyện',{exact:true}).fill('Truyện Trung');
  await page.getByLabel('Album (không bắt buộc)',{exact:true}).fill('Album thử');
  expect((await snapshot(page)).books).toHaveLength(0);
  await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.reader-book-heading h1')).toHaveText('Truyện Trung');
  const data=await snapshot(page);
  expect(data.books).toHaveLength(1);expect(data.books[0]).toMatchObject({status:'ready',chapterCount:2,album:'Album thử'});
  expect(data.chapters.sort((a,b)=>a.order-b.order).map(c=>c.text).join('')).toBe(chinese.replace(/\r\n/g,'\n'));
  expect(data.sources[0].bytes).toEqual([...Buffer.from(chinese)]);
  await page.reload();await expect(page.locator('.reader-book-heading h1')).toHaveText('Truyện Trung');
  expect((await snapshot(page)).books[0]).toMatchObject({status:'ready',chapterCount:2,album:'Album thử'});
});

test('pasted text uses a single submit and keeps title and mandatory split',async({page})=>{
  await open(page);await page.getByLabel('Tên truyện',{exact:true}).fill('Dán thử');
  await page.getByLabel('Hoặc dán nội dung',{exact:true}).fill(chinese);
  await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).books[0]).toMatchObject({title:'Dán thử',status:'ready',chapterCount:2});
});

test('batch single submit creates two distinct ready books even with equal content',async({page})=>{
  await open(page);await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles(['A','B'].map(name=>({name:`${name}.txt`,mimeType:'text/plain',buffer:Buffer.from(chinese)})));
  await page.getByLabel('Album (không bắt buộc)',{exact:true}).fill('Chung');
  expect((await snapshot(page)).books).toHaveLength(0);
  await page.getByRole('button',{name:'Nhập nhiều truyện',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const data=await snapshot(page);expect(data.books).toHaveLength(2);
  expect(data.books.map(b=>({title:b.title,status:b.status,count:b.chapterCount,album:b.album}))).toEqual(expect.arrayContaining([{title:'A',status:'ready',count:2,album:'Chung'},{title:'B',status:'ready',count:2,album:'Chung'}]));
  expect(data.sources).toHaveLength(2);expect(data.sources.every(s=>JSON.stringify(s.bytes)===JSON.stringify([...Buffer.from(chinese)]))).toBe(true);
});

test('folder single submit assigns parent Album and splits every TXT',async({page})=>{
  await open(page);await page.getByRole('button',{name:'Nhập folder truyện',exact:true}).click();
  await folderFiles(page,[['Kho/Album/A.txt',chinese],['Kho/Album/B.txt',chinese]]);
  expect((await snapshot(page)).books).toHaveLength(0);
  await page.getByRole('button',{name:'Nhập folder',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const data=await snapshot(page);expect(data.books).toHaveLength(2);
  expect(data.books.every(b=>b.status==='ready'&&b.album==='Kho/Album'&&b.chapterCount===2)).toBe(true);
  expect(data.sources.map(s=>s.path).sort()).toEqual(['Kho/Album/A.txt','Kho/Album/B.txt']);
});

test('batch failure retains selected inputs for retry and rolls back its earlier staged file',async({page})=>{
  await open(page);await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles([{name:'A.txt',mimeType:'text/plain',buffer:Buffer.from(chinese)},{name:'B.txt',mimeType:'text/plain',buffer:Buffer.from(' \n\t')}]);
  await page.getByLabel('Album (không bắt buộc)',{exact:true}).fill('Giữ nháp');
  await page.getByRole('button',{name:'Nhập nhiều truyện',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert').first()).toContainText('khoảng trắng');
  await expect(page.getByLabel('Album (không bắt buộc)',{exact:true})).toHaveValue('Giữ nháp');
  await expect(page.getByRole('region',{name:'Xem trước nhiều truyện'})).toContainText('B.txt');
  await expect(page.getByRole('button',{name:'Nhập nhiều truyện',exact:true})).toBeEnabled();
  const data=await snapshot(page);expect([data.books.length,data.chapters.length,data.sources.length,data.jobs.length]).toEqual([0,0,0,0]);
});

for(const mode of ['single','batch','folder'] as const){
  test(`${mode} cancellation drains a delayed worker and keeps existing book and dictionary`,async({page})=>{
    await open(page);
    await page.evaluate(async()=>{
      const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
      await db.books.add({id:'existing',title:'Giữ',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:0,charCount:0});
      await db.dictionaries.put({kind:'names',name:'synthetic',blob:new Blob(['测试=Thử']),sha256:'synthetic',updatedAt:1});
      const NativeWorker=window.Worker;
      // Delay start only; all processing and storage still use the native Worker.
      window.Worker=class extends NativeWorker {
        timer?:ReturnType<typeof setTimeout>;
        postMessage(message:unknown,transfer?:Transferable[]){
          if((message as {type?:string}).type==='start')this.timer=setTimeout(()=>super.postMessage(message,transfer||[]),1200);
          else super.postMessage(message,transfer||[]);
        }
        terminate(){clearTimeout(this.timer);super.terminate();}
      };
    });
    if(mode==='folder'){
      await page.getByRole('button',{name:'Nhập folder truyện',exact:true}).click();
      await folderFiles(page,[['Kho/A.txt',chinese],['Kho/B.txt',chinese]]);
    }else await page.getByLabel('Chọn file TXT',{exact:true}).setInputFiles((mode==='single'?['A']:['A','B']).map(name=>({name:`${name}.txt`,mimeType:'text/plain',buffer:Buffer.from(chinese)})));
    const name=mode==='single'?'Nhập truyện':mode==='batch'?'Nhập nhiều truyện':'Nhập folder';
    await page.getByRole('button',{name,exact:true}).click();
    await expect.poll(async()=> (await snapshot(page)).books.filter(b=>b.status==='staging').length).toBe(1);
    await page.getByRole('button',{name:'Hủy xử lý',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Đã hủy nhập');
    await expect(page.getByRole('button',{name,exact:true})).toBeEnabled();
    const data=await snapshot(page);expect(data.books.map(b=>b.id)).toEqual(['existing']);
    expect([data.chapters.length,data.sources.length,data.jobs.length]).toEqual([0,0,0]);
    expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return (await db.dictionaries.get('names'))?.blob.text();})).toBe('测试=Thử');
  });
}
