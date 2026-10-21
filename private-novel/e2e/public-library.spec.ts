import {test,expect,type BrowserContext,type Route} from '@playwright/test';
import {createHash} from 'node:crypto';

test('first-time devices see shared books, install dictionaries, read Convert and add/delete',async({page,context,browser})=>{
  const hash=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
  const dictionaries=[{kind:'vp',name:'Vietphrase.txt',text:'来到=đi tới\n山门=sơn môn'},{kind:'names',name:'Names.txt',text:'李明=Lý Minh'}].map(e=>({...e,body:Buffer.from(e.text),sha256:hash(Buffer.from(e.text)),bytes:Buffer.byteLength(e.text)}));
  const id='11111111-1111-4111-8111-111111111111';
  const snapshot={format:'thu-phong-cloud',version:1,book:{id,title:'Kho mới',author:'',status:'ready',chapterCount:1,charCount:7,createdAt:1,updatedAt:1},chapters:[{id:'22222222-2222-4222-8222-222222222222',bookId:id,order:0,title:'Chương đầu',text:'李明来到山门。',revision:1,sourceId:''}],names:[]};
  const first=Buffer.from(JSON.stringify(snapshot));
  const objects=new Map<string,{body:Buffer;title:string;sha256:string}>([[id,{body:first,title:'Kho mới',sha256:hash(first)}]]),deleted=new Set<string>();
  let dictionaryDownloads=0,uploads=0;
  const route=async(route:Route)=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    expect(req.headers()['authorization']).toBeUndefined();
    if(path==='/api/cloud/dictionaries')return route.fulfill({json:{version:1,dictionaries:dictionaries.map(({kind,name,sha256,bytes})=>({kind,name,sha256,bytes}))}});
    if(path.startsWith('/api/cloud/dictionaries/')){dictionaryDownloads++;const e=dictionaries.find(e=>path.endsWith(`${e.kind}/${e.sha256}`))!;return route.fulfill({body:e.body,contentType:'application/octet-stream'});}
    if(path==='/api/cloud/deletions')return route.fulfill({json:{ids:[...deleted],cursor:null}});
    if(path==='/api/cloud/books')return route.fulfill({headers:{'X-Library-Access':'public'},json:{books:[...objects].filter(([key])=>!deleted.has(key)).map(([key,e])=>({id:key,title:e.title,sha256:e.sha256,bytes:e.body.length,updatedAt:1})),cursor:null}});
    const key=path.split('/').at(-1)!;
    if(req.method()==='DELETE'){deleted.add(key);return route.fulfill({json:{id:key,deleted:true}});}
    if(req.method()==='PUT'){
      if(deleted.has(key))return route.fulfill({status:410,json:{error:'book_deleted'}});
      uploads++;const body=req.postDataBuffer()!;objects.set(key,{body,title:decodeURIComponent(req.headers()['x-book-title']),sha256:hash(body)});return route.fulfill({status:201,json:{id:key,sha256:hash(body)}});
    }
    const e=objects.get(key);return e&&!deleted.has(key)?route.fulfill({body:e.body,contentType:'application/json'}):route.fulfill({status:404,json:{error:'not_found'}});
  };
  const setup=async(ctx:BrowserContext)=>ctx.route('**/api/cloud/**',route);
  await setup(context);await page.goto('/');
  await expect(page.getByRole('button',{name:'Thông tin Kho mới',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();
  await expect(page.getByLabel('Nhóm cài đặt',{exact:true}).locator('option')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Đồng bộ tất cả truyện',exact:true})).toHaveCount(0);
  await page.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('button',{name:/Tủ sách/}).click();
  await page.getByRole('button',{name:'Mở sách →',exact:true}).click();
  await expect(page.locator('.prose')).toContainText('Lý Minh đi tới sơn môn.');
  await expect.poll(()=>dictionaryDownloads).toBe(2);
  await page.reload();await expect(page.getByRole('button',{name:'Thông tin Kho mới',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mở sách →',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lý Minh đi tới sơn môn.');expect(dictionaryDownloads).toBe(2);
  await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();
  await page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true}).click();
  await page.getByLabel('Tên truyện',{exact:true}).fill('Truyện mới chung');await page.getByLabel('Hoặc dán nội dung').fill('Chương 1: Mới\n李明来到山门。');
  await page.getByRole('button',{name:'Nhập truyện'}).click();await expect.poll(()=>uploads).toBe(1);
  const other=await browser.newContext();await setup(other);const second=await other.newPage();await second.goto('/');
  await expect(second.getByRole('button',{name:'Thông tin Truyện mới chung',exact:true})).toBeVisible();
  await second.getByLabel('Tùy chọn Truyện mới chung',{exact:true}).click();second.once('dialog',dialog=>void dialog.accept());
  await second.locator('.book-card').filter({hasText:'Truyện mới chung'}).getByRole('button',{name:'Xóa',exact:true}).click();
  await expect(second.getByRole('button',{name:'Thông tin Truyện mới chung',exact:true})).toHaveCount(0);
  await second.reload();await expect(second.getByRole('button',{name:'Thông tin Kho mới',exact:true})).toBeVisible();await expect(second.getByRole('button',{name:'Thông tin Truyện mới chung',exact:true})).toHaveCount(0);
  await page.reload();await expect(page.locator('.book-card')).toHaveCount(2); // retained local copy; server tombstone prevents re-upload
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status').filter({hasText:'Các truyện đã có bản trên kho chung'})).toBeVisible();expect(uploads).toBe(1);
  await other.close();
});
