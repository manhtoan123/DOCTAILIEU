import {test,expect,type Page} from '@playwright/test';

async function fixture(page:Page,count=2){
  await page.goto('/');
  await page.evaluate(async count=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    await db.dictionaries.put({kind:'vp',name:'Name UI synthetic',blob:new Blob(['山门=cổng núi\n水=nước']),sha256:'name-ui-vp',updatedAt:1});
    for(const id of ['name-a','name-b']){
      await db.books.add({id,title:id==='name-a'?'Name UI A':'Name UI B',author:'',status:'ready',chapterCount:1,charCount:6,createdAt:1,updatedAt:1});
      await db.chapters.add({id:`${id}-chapter`,bookId:id,title:'Chương 1',order:0,text:'山门。水。',revision:1,sourceId:''});
    }
    await db.names.add({id:'b-gate',bookId:'name-b',key:'山门',value:'Cổng B'});
    const names=[{id:'a-gate',bookId:'name-a',key:'山门',value:'Cổng A'},{id:'a-water',bookId:'name-a',key:'水',value:'Nước A'}];
    for(let i=2;i<count;i++)names.push({id:`a-extra-${i}`,bookId:'name-a',key:`名字${i}`,value:`Tên ${i}`});
    await db.names.bulkPut(names);
  },count);
  await openBook(page,'Name UI A');await page.getByRole('button',{name:'Convert',exact:true}).click();
  await expect(page.locator('.prose')).toContainText('Cổng A. Nước A.');
  return openNames(page);
}
async function openBook(page:Page,title:string){if(new URL(page.url()).pathname!=='/')await page.goto('/');await page.locator('.book-card').filter({has:page.getByRole('button',{name:title,exact:true})}).getByRole('link',{name:'Mở sách →',exact:true}).click();}
async function openNames(page:Page){
  await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();
  await page.getByRole('button',{name:'✎ Name',exact:true}).click();
  const panel=page.getByRole('dialog',{name:'Name riêng của truyện',exact:true});
  await expect(panel.getByLabel('Tìm Name',{exact:true})).toBeVisible();return panel;
}
async function namesOnDisk(page:Page){return page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return(await db.names.toArray()).sort((a:{id:string},b:{id:string})=>a.id.localeCompare(b.id));});}

test('inline Name saves one key, reconverts, preserves other book and survives reload',async({page})=>{
  let panel=await fixture(page);const before=await namesOnDisk(page);
  await expect(panel.locator('details')).not.toHaveAttribute('open','');
  await expect(panel.getByLabel('Nội dung Name List')).toBeHidden();
  await expect(panel.getByRole('button',{name:'▶ Chạy',exact:true})).toHaveCount(0);
  await panel.getByRole('button',{name:'Sửa Name 山门',exact:true}).click();
  await expect(panel.getByLabel('Chữ nguồn của Name')).toHaveAttribute('readonly','');
  await panel.getByLabel('Tên Việt của Name').fill('Cổng Mới');await panel.getByRole('button',{name:'Lưu tên',exact:true}).click();
  await expect(panel.getByRole('status')).toContainText('Đã lưu');await expect(page.locator('.prose')).toContainText('Cổng Mới. Nước A.');
  const after=await namesOnDisk(page);
  expect(after.filter((entry:{id:string})=>entry.id!=='a-gate')).toEqual(before.filter((entry:{id:string})=>entry.id!=='a-gate'));
  expect(after.find((entry:{id:string})=>entry.id==='a-gate')).toMatchObject({key:'山门',value:'Cổng Mới'});
  await page.reload();await openBook(page,'Name UI A');await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng Mới. Nước A.');
  await page.getByRole('link',{name:'← Tủ sách',exact:true}).click();await openBook(page,'Name UI B');await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng B.');
  panel=await openNames(page);await panel.getByRole('button',{name:'Thêm tên',exact:true}).click();
  await panel.getByLabel('Chữ nguồn của Name').fill('水');await panel.getByLabel('Tên Việt của Name').fill('Nước B');await panel.getByRole('button',{name:'Lưu tên',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng B. Nước B.');
});

test('failed inline write retains field and parent draft; invalid key never commits',async({page})=>{
  const panel=await fixture(page);const before=await namesOnDisk(page);
  await panel.getByRole('button',{name:'Thêm tên',exact:true}).click();
  await panel.getByLabel('Chữ nguồn của Name').fill('坏=键');await panel.getByLabel('Tên Việt của Name').fill('Nháp giữ lại');await panel.getByRole('button',{name:'Lưu tên',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('dấu =');expect(await namesOnDisk(page)).toEqual(before);
  await panel.getByLabel('Chữ nguồn của Name').fill('张三');
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);db.names.put=()=>{throw new Error('synthetic Name write failure');};});
  await panel.getByRole('button',{name:'Lưu tên',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('synthetic Name write failure');await expect(panel.getByLabel('Tên Việt của Name')).toHaveValue('Nháp giữ lại');
  await panel.locator('summary').click();
  await expect(panel.getByLabel('Nội dung Name List')).toHaveValue(/张三=Nháp giữ lại/);expect(await namesOnDisk(page)).toEqual(before);
});

test('bulk draft survives close; inline does not commit unrelated draft; delete is explicit',async({page})=>{
  let panel=await fixture(page);await panel.locator('summary').click();await panel.getByLabel('Nội dung Name List').fill('水=Nước chưa lưu\n张三=Trương Tam');
  await panel.getByRole('button',{name:'Ẩn Name riêng của truyện',exact:true}).click();panel=await openNames(page);
  await expect(panel.getByLabel('Nội dung Name List')).toBeHidden();await panel.locator('summary').click();await expect(panel.getByLabel('Nội dung Name List')).toHaveValue('水=Nước chưa lưu\n张三=Trương Tam');
  await panel.getByRole('button',{name:'Sửa Name 山门',exact:true}).click();await panel.getByLabel('Tên Việt của Name').fill('Cổng Riêng');await panel.getByRole('button',{name:'Lưu tên',exact:true}).click();await expect(page.locator('.prose')).toContainText('Cổng Riêng. Nước A.');
  expect((await namesOnDisk(page)).filter((entry:{bookId:string;key:string})=>entry.bookId==='name-a'&&entry.key==='张三')).toHaveLength(0);
  await panel.getByLabel('Nội dung Name List').fill('张三=Trương Tam');await panel.getByRole('button',{name:'Lưu nhiều tên',exact:true}).click();
  await expect.poll(async()=> (await namesOnDisk(page)).filter((entry:{bookId:string})=>entry.bookId==='name-a').length).toBe(3);
  await expect(panel.getByRole('button',{name:'Sửa Name 水',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Xóa Name 张三',exact:true}).click();await expect(panel.getByRole('button',{name:'Sửa Name 张三',exact:true})).toHaveCount(0);
  await expect(page.locator('.prose')).toContainText('Cổng Riêng. Nước A.');
});

test('all saved Names are searchable beyond first 200 and list pages have 50 rows',async({page})=>{
  const panel=await fixture(page,251);await expect(panel.locator('.name-manager-row')).toHaveCount(50);
  await panel.getByRole('navigation',{name:'Trang Name'}).getByRole('button',{name:'Tiếp',exact:true}).click();await expect(panel.getByRole('navigation',{name:'Trang Name'})).toContainText('2 / 6');
  await panel.getByLabel('Tìm Name',{exact:true}).fill('名字250');await expect(panel.locator('.name-manager-row')).toHaveCount(1);await panel.getByRole('button',{name:'Sửa Name 名字250',exact:true}).click();
  await panel.getByLabel('Tên Việt của Name').fill('Tên cuối đã sửa');await panel.getByRole('button',{name:'Lưu tên',exact:true}).click();await expect(panel.getByRole('button',{name:'Sửa Name 名字250',exact:true})).toContainText('Tên cuối đã sửa');
  await panel.getByLabel('Tìm Name',{exact:true}).fill('Tên cuối đã sửa');await expect(panel.locator('.name-manager-row')).toHaveCount(1);
});

test('Name editor and advanced controls reflow at 320px with bounded textarea',async({page})=>{
  await page.setViewportSize({width:320,height:524});const panel=await fixture(page);
  await panel.getByRole('button',{name:'Sửa Name 山门',exact:true}).click();await panel.getByLabel('Tên Việt của Name').fill('TênKhôngCóKhoảngTrắng'.repeat(8));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await panel.getByRole('button',{name:'Lưu tên',exact:true}).scrollIntoViewIfNeeded();await expect(panel.getByRole('button',{name:'Lưu tên',exact:true})).toBeInViewport();
  await panel.locator('summary').click();await panel.getByLabel('Nội dung Name List').fill('张三=Trương Tam\n'.repeat(100));
  expect(await panel.getByLabel('Nội dung Name List').evaluate(element=>element.getBoundingClientRect().height)).toBeLessThanOrEqual(160);
  for(const name of ['Lưu nhiều tên','Xuất bản nháp']){const button=panel.getByRole('button',{name,exact:true});await button.scrollIntoViewIfNeeded();await expect(button).toBeInViewport();expect(await button.evaluate(element=>element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('delayed Name file appends current typing and completion after close is discarded',async({page})=>{
  let panel=await fixture(page);await panel.locator('summary').click();
  await page.evaluate(()=>{
    const original=File.prototype.text;const hooks=window as unknown as {releaseNameFile?:()=>Promise<void>};
    File.prototype.text=function(){const file=this;return new Promise<string>(resolve=>{hooks.releaseNameFile=()=>{File.prototype.text=original;return original.call(file).then(resolve);};});};
  });
  await panel.getByLabel('Nhập Name List').setInputFiles({name:'Names.txt',mimeType:'text/plain',buffer:Buffer.from('张三=Trương Tam')});
  await expect(panel.getByText('Đang đọc file Name… Bạn vẫn có thể sửa bản nháp.')).toBeVisible();await panel.getByLabel('Nội dung Name List').fill('水=Đang gõ');
  await page.evaluate(async()=>{await (window as unknown as {releaseNameFile:()=>Promise<void>}).releaseNameFile();});await expect(panel.getByLabel('Nội dung Name List')).toHaveValue('水=Đang gõ\n张三=Trương Tam');
  expect((await namesOnDisk(page)).filter((entry:{key:string})=>entry.key==='张三')).toHaveLength(0);
  await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=function(){const file=this;return new Promise<string>(resolve=>{(window as unknown as {releaseNameFile:()=>Promise<void>}).releaseNameFile=()=>{File.prototype.text=original;return original.call(file).then(resolve);};});};});
  await panel.getByLabel('Nhập Name List').setInputFiles({name:'Late.txt',mimeType:'text/plain',buffer:Buffer.from('李四=File tới muộn')});
  await expect(panel.getByText('Đang đọc file Name… Bạn vẫn có thể sửa bản nháp.')).toBeVisible();await panel.getByRole('button',{name:'Ẩn Name riêng của truyện',exact:true}).click();
  panel=await openNames(page);await panel.locator('summary').click();await panel.getByLabel('Nội dung Name List').fill('水=Nháp mới');
  await page.evaluate(async()=>{await (window as unknown as {releaseNameFile:()=>Promise<void>}).releaseNameFile();});
  await expect(panel.getByLabel('Nội dung Name List')).toHaveValue('水=Nháp mới');
});

test('Name file above 2 MiB is rejected without changing draft or saved Names',async({page})=>{
  const panel=await fixture(page);await panel.locator('summary').click();const before=await namesOnDisk(page);const draft=await panel.getByLabel('Nội dung Name List').inputValue();
  await panel.getByLabel('Nhập Name List').setInputFiles({name:'Too-large.txt',mimeType:'text/plain',buffer:Buffer.alloc(2*1048576+1,65)});
  await expect(panel.getByRole('alert')).toContainText('tối đa 2 MB');await expect(panel.getByLabel('Nội dung Name List')).toHaveValue(draft);expect(await namesOnDisk(page)).toEqual(before);
});

test('typing an existing Name remains a draft when panel closes and reopens',async({page})=>{
  let panel=await fixture(page);await panel.getByRole('button',{name:'Sửa Name 山门',exact:true}).click();
  await panel.getByLabel('Tên Việt của Name').fill('Tên Đang Soạn');await panel.getByRole('button',{name:'Ẩn Name riêng của truyện'}).click();
  panel=await openNames(page);await panel.getByRole('button',{name:'Sửa Name 山门',exact:true}).click();
  await expect(panel.getByLabel('Tên Việt của Name')).toHaveValue('Tên Đang Soạn');
  expect((await namesOnDisk(page)).find((name:{id:string})=>name.id==='a-gate').value).toBe('Cổng A');
});
