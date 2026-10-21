// Production bundle, two isolated browser profiles; every cloud/AI write is mocked.
import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin='https://thu-phong-private.pages.dev',id='11111111-1111-4111-8111-111111111111',chapterId='22222222-2222-4222-8222-222222222222';
const asset=(await readFile(new URL('../dist/index.html',import.meta.url),'utf8')).match(/src="([^"]+\.js)"/)[1];
if(!(await(await fetch(origin)).text()).includes(asset))throw Error('Canonical bundle not updated');
const live=await fetch(origin+'/api/state?after=0');const metadata=await live.json();if(live.status!==200||!Array.isArray(metadata.rows))throw Error('Shared endpoint unavailable');
console.log(JSON.stringify({endpointHTTP:live.status,records:metadata.rows.length,cursor:metadata.cursor}));
const text='甲乙丙丁林儿好。',snapshot={format:'thu-phong-cloud',version:1,book:{id,title:'Truyện đồng bộ tổng hợp',author:'Fixture',status:'ready',chapterCount:1,charCount:text.length,createdAt:1,updatedAt:1},chapters:[{id:chapterId,bookId:id,order:0,title:'Chương thử',text,revision:1,sourceId:''}],names:[{key:'林儿',value:'Lâm Nhi'}]};
const body=JSON.stringify(snapshot),sha256=createHash('sha256').update(body).digest('hex'),book={id,title:snapshot.book.title,author:'Fixture',sha256,bytes:Buffer.byteLength(body),updatedAt:1};
async function connect(context,store){
 await context.route('**/api/cloud/**',r=>{const path=new URL(r.request().url()).pathname;const headers={'X-Library-Access':'public'};if(path==='/api/cloud/books/'+id)return r.fulfill({body,headers:{...headers,'Content-Type':'application/json'}});return r.fulfill({json:path.includes('dictionaries')?{version:1,dictionaries:[]}:path.includes('deletions')?{ids:[],cursor:null}:{books:[book],cursor:null},headers});});
 await context.route('**/api/prompts**',r=>r.fulfill({json:{revision:0,rows:[]}}));await context.route('**/api/ai/**',r=>r.fulfill({json:{keys:[]}}));
 await context.route('**/api/state-files/**',r=>{store.fileGets++;return r.fulfill({status:404,json:{error:'synthetic_no_file'}});});
 await context.route(/\/api\/state(?:\?|$)/,r=>{const req=r.request(),url=new URL(req.url());if(req.method()==='GET'){const scope=url.searchParams.get('book')??'',after=+(url.searchParams.get('after')??0);return r.fulfill({json:{cursor:store.revision,more:false,rows:[...store.rows.values()].filter(x=>(x.record.bookId??'')===scope&&x.revision>after)}});}const input=req.postDataJSON(),old=store.rows.get(input.id);if((old?.revision??0)!==input.baseRevision)return r.fulfill({status:409,json:{row:old}});const row={id:input.id,record:input.record,revision:++store.revision};store.rows.set(row.id,row);return r.fulfill({json:{row}});});
}
async function sync(page){await page.goto(origin+'/settings/sync');const button=page.getByRole('button',{name:'Đồng bộ ngay',exact:true});await expect(button).toBeEnabled();await button.click();await expect(page.getByRole('region',{name:'Đồng bộ chỉnh sửa'}).getByRole('status')).toContainText('Các chỉnh sửa đã đồng bộ');}
async function names(page){await page.goto(origin+`/read/${id}/${chapterId}`);await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'✎ Name',exact:true}).click();return page.getByRole('dialog',{name:'Name riêng của truyện',exact:true});}
const browser=await chromium.launch({channel:'msedge'});
try{for(const viewport of [{width:1280,height:800},{width:412,height:915}]){
 const store={revision:0,rows:new Map(),fileGets:0},a=await browser.newContext({viewport}),b=await browser.newContext({viewport}),errors=[];
 await connect(a,store);await connect(b,store);const pa=await a.newPage(),pb=await b.newPage();for(const page of [pa,pb]){page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.getByRole('button',{name:'Mở sách →',exact:true}).click();await expect(page).toHaveURL(new RegExp('/read/'+id));await sync(page);}
 const panel=await names(pa);await panel.getByRole('button',{name:'Sửa Name 林儿'}).click();await panel.getByLabel('Tên Việt của Name').fill('Tên đồng bộ từ máy A');await panel.getByRole('button',{name:'Lưu tên',exact:true}).click();await sync(pa);await sync(pb);const remote=await names(pb);await expect(remote.getByRole('button',{name:'Sửa Name 林儿'})).toContainText('Tên đồng bộ từ máy A');await remote.getByRole('button',{name:'Xóa Name 林儿'}).click();await sync(pb);await sync(pa);await expect((await names(pa)).getByRole('button',{name:'Sửa Name 林儿'})).toHaveCount(0);
 await pa.goto(origin+'/settings/sync');expect(await pa.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(store.fileGets).toBe(0);expect(errors).toEqual([]);await pa.screenshot({path:`test-results/shared-state-production-${viewport.width}.png`,fullPage:true});console.log(JSON.stringify({viewport,bundle:asset,twoDeviceNames:true,deletion:true,lazy4G:true,horizontalOverflow:false,pageErrors:0}));await a.close();await b.close();
}}finally{await browser.close();}
