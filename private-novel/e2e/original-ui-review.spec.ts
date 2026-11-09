import {test,expect,type Page,type Route} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const book='00000000-0000-4000-8000-000000000081',source='00000000-0000-4000-8000-000000000082',chapter='00000000-0000-4000-8000-000000000083';
const bytes=Buffer.from([255,254,87,0,0x2d,0x4e]),sha=createHash('sha256').update(bytes).digest('hex'),name='selected %25.txt';
const descriptor={version:1,sourceId:source,name,relativePath:'Root/%2e%2e/'+name,encoding:'utf-16le',bytes:bytes.length,sha256:sha};
type Mode='local'|'missing'|'none';
async function setup(page:Page,mode:Mode,dataHandler?:(route:Route)=>Promise<void>){
 let metadata=0,data=0;
 await page.route('**/api/cloud/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path.includes('/originals')){
   if(path.endsWith('/data')){data++;if(dataHandler)return dataHandler(route);return route.fulfill({body:bytes,headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length),'X-Content-SHA256':sha}});}
   metadata++;return route.fulfill({json:{originals:mode==='local'?[]:[{descriptor,state:'ready',updatedAt:1}]}});
  }
  if(path.includes('dictionaries'))return route.fulfill({json:{version:1,dictionaries:[]}});
  if(path.endsWith('/deletions'))return route.fulfill({json:{ids:[],cursor:null}});
  if(request.method()==='PUT')return route.fulfill({json:{id:path.split('/').at(-1),sha256:request.headers()['x-content-sha256']}});
  return route.fulfill({json:{books:[],cursor:null}});
 });
 await page.goto('/');await page.evaluate(async({book,source,chapter,descriptor,bytes,mode})=>{
  const {db}=await import('/src/core/db.ts');const text='Chương 1\n\nNội dung giữ nguyên.';
  await db.books.put({id:book,title:'Original fixture',author:'',status:'ready',chapterCount:1,charCount:text.length,createdAt:1,updatedAt:1});
  await db.chapters.put({id:chapter,bookId:book,title:'Chương 1',order:0,text,sourceId:mode==='none'?'':source,revision:1});
  await db.names.put({id:'original-name',bookId:book,key:'名',value:'Preserved'});
  await db.settings.put({key:'ai-book-settings:'+book,value:{systemPrompt:'Preserved prompt'}});
  if(mode!=='none')await db.sources.put({id:source,bookId:book,name:descriptor.name,relativePath:descriptor.relativePath,encoding:descriptor.encoding,sha256:descriptor.sha256,bytes:descriptor.bytes,blob:new Blob(mode==='local'?[new Uint8Array(bytes)]:[]),...(mode==='missing'?{dataStatus:'missing'}:{})});
  const events={created:0,revoked:0};Reflect.set(window,'originalFileEvents',events);const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=blob=>{events.created++;return create(blob);};URL.revokeObjectURL=url=>{events.revoked++;revoke(url);};
 },{book,source,chapter,descriptor,bytes:[...bytes],mode});
 await page.getByRole('link',{name:'Thông tin Original fixture',exact:true}).click();await expect(page.getByRole('heading',{name:'Original fixture',exact:true})).toBeVisible();
 return {metadata:()=>metadata,data:()=>data};
}
async function snapshot(page:Page){return page.evaluate(async({book,source,chapter})=>{const {db}=await import('/src/core/db.ts');const original=await db.sources.get(source);return {book:await db.books.get(book),chapter:await db.chapters.get(chapter),name:await db.names.get('original-name'),prompt:(await db.settings.get('ai-book-settings:'+book))?.value,source:original?{id:original.id,sha256:original.sha256,bytes:original.bytes,dataStatus:original.dataStatus,actual:[...new Uint8Array(await original.blob.arrayBuffer())]}:null};},{book,source,chapter});}
async function open(page:Page){await page.locator('summary').filter({hasText:'File gốc'}).click();await expect(page.getByRole('button',{name:`Tải ${name}`,exact:true})).toBeEnabled();}
async function download(page:Page){const event=page.waitForEvent('download');await page.getByRole('button',{name:`Tải ${name}`,exact:true}).click();const downloaded=await event;expect(downloaded.suggestedFilename()).toBe(name);expect(await readFile((await downloaded.path())!)).toEqual(bytes);}

test('review: stalled cloud metadata cannot block available local original',async({page})=>{
 await setup(page,'local');let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/originals',async route=>{await held;await route.abort();});
 try{await open(page);await download(page);}finally{release();}
});

test('review: locally corrupt bytes cannot become a browser download',async({page})=>{
 await setup(page,'local');await page.evaluate(async({source,bytes})=>{const {db}=await import('/src/core/db.ts');await db.sources.update(source,{blob:new Blob([new Uint8Array(bytes.length)])});},{source,bytes:[...bytes]});
 const before=await snapshot(page);await open(page);await page.getByRole('button',{name:`Tải ${name}`,exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Không tải được file gốc');expect(await page.evaluate(()=>Reflect.get(window,'originalFileEvents').created)).toBe(0);expect(await snapshot(page)).toEqual(before);
});

test('review: a source renamed after listing invalidates the selected download',async({page})=>{
 await setup(page,'missing');await open(page);
 await page.evaluate(async source=>{const {db}=await import('/src/core/db.ts');await db.sources.update(source,{name:'replacement.txt',relativePath:'Root/replacement.txt'});},source);
 await page.getByRole('button',{name:`Tải ${name}`,exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Không tải được file gốc');expect(await page.evaluate(()=>Reflect.get(window,'originalFileEvents').created)).toBe(0);
});

for(const action of ['close','delete','rename'] as const)test(`review: ${action} during cloud download invalidates its late result`,async({page})=>{
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});await setup(page,'missing',async route=>{await held;await route.fulfill({body:bytes,headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length),'X-Content-SHA256':sha}});});await open(page);
 const requested=page.waitForRequest(request=>request.url().endsWith('/data'));await page.getByRole('button',{name:`Tải ${name}`,exact:true}).click();await requested;
 if(action==='close')await page.locator('summary').filter({hasText:'File gốc'}).click();
 else await page.evaluate(async({action,book,source})=>{const {db,deleteBook}=await import('/src/core/db.ts');if(action==='delete')await deleteBook(book);else await db.sources.update(source,{name:'replacement.txt',relativePath:'Root/replacement.txt'});},{action,book,source});
 const unexpected=page.waitForEvent('download',{timeout:1000}).then(()=>true,()=>false);release();expect(await unexpected).toBe(false);expect(await page.evaluate(()=>Reflect.get(window,'originalFileEvents').created)).toBe(0);
});

test('review: local source rename during final book check invalidates the download',async({page})=>{
 await setup(page,'local');await open(page);
 await page.evaluate(async({book,source})=>{
  const {db}=await import('/src/core/db.ts');const get=db.books.get.bind(db.books);let changed=false;
  db.books.get=async(...args:Parameters<typeof get>)=>{const result=await get(...args);if(args[0]===book&&!changed){changed=true;await db.sources.update(source,{name:'replacement.txt',relativePath:'Root/replacement.txt'});}return result;};
 },{book,source});
 await page.getByRole('button',{name:`Tải ${name}`,exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Không tải được file gốc');expect(await page.evaluate(()=>Reflect.get(window,'originalFileEvents').created)).toBe(0);
});
