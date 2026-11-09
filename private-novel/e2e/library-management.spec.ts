import {test,expect,type Page} from '@playwright/test';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',remote='33333333-3333-4333-8333-333333333333';
const catalog=()=>[{id:a,title:'Fixture A',album:'Author/Series'},{id:b,title:'Fixture B',album:'Author/Series'},{id:remote,title:'Remote fixture',album:'Author/Other'}].map(row=>({...row,author:'Synthetic',updatedAt:2,sha256:'a'.repeat(64),bytes:10}));
async function setup(page:Page,theme='sepia'){
 page.on('pageerror',e=>console.log('MANAGEMENT_PAGE_ERROR',e.name,e.message,e.stack));
 const state={rows:catalog(),failDelete:true,deletes:[] as string[],beforeAck:undefined as undefined|(()=>Promise<void>)};
 // Every API request is fulfilled locally; no request can reach a real account or cloud.
 await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url()),headers={'X-Library-Access':'public'};
  if(url.pathname==='/api/cloud/books'&&request.method()==='GET')return route.fulfill({headers,json:{books:state.rows,cursor:null}});
  if(url.pathname==='/api/cloud/deletions')return route.fulfill({headers,json:{ids:[],cursor:null}});
  if(url.pathname.startsWith('/api/cloud/books/')&&request.method()==='DELETE'){
   const id=url.pathname.split('/').at(-1)!;state.deletes.push(id);if(state.failDelete)return route.fulfill({status:503,headers,json:{error:'synthetic_failed_ack'}});
   await state.beforeAck?.();state.rows=state.rows.filter(row=>row.id!==id);return route.fulfill({headers,json:{id,deleted:true}});
  }
  return route.fulfill({status:503,json:{error:'isolated synthetic fixture'}});
 });
 await page.goto('/');await expect(page.getByRole('button',{name:'Thêm truyện',exact:true})).toBeVisible();
 await page.evaluate(async({a,b,theme})=>{
  const native=await new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('thu-phong-v1');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  await new Promise<void>((resolve,reject)=>{const tx=native.transaction(['books','sources','chapters','progress','settings'],'readwrite');
   for(const [id,title]of [[a,'Fixture A'],[b,'Fixture B']])tx.objectStore('books').put({id,title,album:'Author/Series',author:'Synthetic',updatedAt:2,createdAt:1,status:'ready',chapterCount:1,charCount:10});
   tx.objectStore('chapters').put({id:'fixture-chapter',bookId:a,order:0,title:'Chapter 1',text:'Synthetic body.',sourceId:'fixture-source',revision:1});
   tx.objectStore('sources').put({id:'fixture-source',bookId:a,name:'immutable.txt',relativePath:'Author/Series/immutable.txt',encoding:'UTF-8',sha256:'immutable-fixture',bytes:3,blob:new Blob([new Uint8Array([1,2,255])])});
   tx.objectStore('progress').put({bookId:a,chapterId:'fixture-chapter',paragraph:2,offset:1,revision:1,updatedAt:10});
   tx.objectStore('settings').put({key:'reader',value:{theme}});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });native.close();
 },{a,b,theme});await page.goto('/phong-toi');return state;
}
async function snapshot(page:Page){return page.evaluate(async()=>{const native=await new Promise<IDBDatabase>(resolve=>{const req=indexedDB.open('thu-phong-v1');req.onsuccess=()=>resolve(req.result);});const rows=(name:string)=>new Promise<any[]>(resolve=>{const req=native.transaction(name).objectStore(name).getAll();req.onsuccess=()=>resolve(req.result);});const result={books:await rows('books'),chapters:await rows('chapters'),progress:await rows('progress'),sources:await Promise.all((await rows('sources')).map(async({blob,...source})=>({...source,raw:[...new Uint8Array(await blob.arrayBuffer())]})))};native.close();return result;});}

test('root and Album management: rename preserves originals; review cancellation and failed ACK preserve selection; ACK deletes only selected book',async({page})=>{
 const state=await setup(page);await page.getByRole('button',{name:'Quản lý',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Quản lý truyện'});await expect(dialog.getByLabel('Chọn Remote fixture',{exact:true})).toBeVisible();
 await dialog.getByLabel('Chọn Fixture A',{exact:true}).check();await dialog.getByRole('button',{name:'Xóa đã chọn',exact:true}).click();
 await expect(dialog.getByRole('region',{name:'Xác nhận xóa truyện'})).toContainText('Fixture A');expect(state.deletes).toEqual([]);await dialog.getByRole('button',{name:'Hủy',exact:true}).click();
 await dialog.getByLabel('Chọn Fixture A',{exact:true}).uncheck();const before=await snapshot(page);
 await dialog.getByRole('listitem').filter({hasText:'Fixture A'}).getByRole('button',{name:'Sửa',exact:true}).click();await dialog.getByLabel('Tên truyện',{exact:true}).fill('Renamed fixture');await dialog.getByRole('button',{name:'Lưu',exact:true}).click();await expect(dialog.getByLabel('Chọn Renamed fixture',{exact:true})).toBeVisible();
 const renamed=await snapshot(page);expect(renamed.sources).toEqual(before.sources);expect(renamed.progress).toEqual(before.progress);expect(renamed.chapters).toEqual(before.chapters);
 await dialog.getByRole('button',{name:'Xong',exact:true}).click();await page.goto('/phong-toi?album=Author%2FSeries');await page.getByRole('button',{name:'Quản lý',exact:true}).click();dialog=page.getByRole('dialog',{name:'Quản lý truyện'});
 await expect(dialog.getByLabel('Chọn Remote fixture',{exact:true})).toHaveCount(0);await dialog.getByLabel('Chọn Renamed fixture',{exact:true}).check();await dialog.getByRole('button',{name:'Xóa đã chọn',exact:true}).click();
 const review=dialog.getByRole('region',{name:'Xác nhận xóa truyện'});await expect(review).toContainText('Renamed fixture');await expect(review).not.toContainText('Fixture B');await dialog.getByRole('button',{name:'Hủy',exact:true}).click();expect(await snapshot(page)).toEqual(renamed);
 await dialog.getByRole('button',{name:'Xóa đã chọn',exact:true}).click();await dialog.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();await expect(dialog).toContainText('Đã xóa 0/1 truyện');expect((await snapshot(page)).books.map(row=>row.id).sort()).toEqual([a,b]);
 state.failDelete=false;const renamedChoice=dialog.getByLabel('Chọn Renamed fixture',{exact:true});await expect(renamedChoice).not.toBeChecked();await renamedChoice.check();await dialog.getByRole('button',{name:'Xóa đã chọn',exact:true}).click();await dialog.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();await expect(dialog).toContainText('Đã xóa 1 truyện');await expect.poll(async()=>(await snapshot(page)).books.map(row=>row.id)).toEqual([b]);expect(state.deletes).toEqual([a,a]);expect(state.rows.map(row=>row.id).sort()).toEqual([b,remote]);
});

test('ACK followed by a local owner change preserves that local copy through background purge and reload',async({page})=>{
 const state=await setup(page);state.failDelete=false;
 state.beforeAck=async()=>{await page.evaluate(async id=>{const native=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open('thu-phong-v1');request.onsuccess=()=>resolve(request.result);});await new Promise<void>(resolve=>{const tx=native.transaction('books','readwrite'),store=tx.objectStore('books'),request=store.get(id);request.onsuccess=()=>store.put({...request.result,album:'Moved during ACK'});tx.oncomplete=()=>resolve();});native.close();},a);};
 await page.getByRole('button',{name:'Quản lý',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Quản lý truyện'});await dialog.getByLabel('Chọn Fixture A',{exact:true}).check();await dialog.getByRole('button',{name:'Xóa đã chọn',exact:true}).click();await dialog.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();
 await expect(dialog).toContainText('kho đã xác nhận 1');await expect(dialog).toContainText('giữ bản local');expect((await snapshot(page)).books.find(row=>row.id===a)?.album).toBe('Moved during ACK');
 await page.reload();await expect(page.getByRole('button',{name:'Quản lý',exact:true})).toBeVisible();expect((await snapshot(page)).books.find(row=>row.id===a)?.album).toBe('Moved during ACK');
});

test('verified ACK with failed local receipt storage reports cloud deletion while retaining local source and progress',async({page})=>{
 const state=await setup(page);state.failDelete=false;const before=await snapshot(page);
 state.beforeAck=async()=>{await page.evaluate(()=>{const nativePut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value:any,...args:any[]){if(this.name==='settings'&&typeof value?.key==='string'&&value.key.startsWith('cloud-deleted:'))throw new DOMException('Synthetic receipt quota','QuotaExceededError');return (nativePut as any).apply(this,[value,...args]);};});};
 await page.getByRole('button',{name:'Quản lý',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Quản lý truyện'});await dialog.getByLabel('Chọn Fixture A',{exact:true}).check();await dialog.getByRole('button',{name:'Xóa đã chọn',exact:true}).click();await dialog.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();
 await expect(dialog).toContainText('kho đã xác nhận 1');await expect(dialog).toContainText('chưa lưu được trạng thái thiết bị');expect(await snapshot(page)).toEqual(before);expect(state.deletes).toEqual([a]);await page.reload();expect(await snapshot(page)).toEqual(before);
});
for(const theme of ['light','sepia','dark'])test(`management selection, disabled/focus/preview fits in ${theme}`,async({page},testInfo)=>{
 await setup(page,theme);await page.getByRole('button',{name:'Quản lý',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Quản lý truyện'});
 await expect(page.locator('html')).toHaveAttribute('data-ui-theme',theme);await expect(dialog.getByRole('button',{name:'Xóa đã chọn',exact:true})).toBeDisabled();
 const checkbox=dialog.getByLabel('Chọn Fixture A',{exact:true});await checkbox.check();await checkbox.focus();await expect(checkbox).toBeFocused();await expect(checkbox).toBeChecked();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath(`management-${theme}-selected.png`)});
 await dialog.getByRole('button',{name:'Xóa đã chọn',exact:true}).click();await expect(dialog.getByRole('button',{name:'Xác nhận xóa',exact:true})).toBeEnabled();await page.screenshot({path:testInfo.outputPath(`management-${theme}-preview.png`)});await dialog.getByRole('button',{name:'Hủy',exact:true}).click();expect((await snapshot(page)).books).toHaveLength(2);
});
