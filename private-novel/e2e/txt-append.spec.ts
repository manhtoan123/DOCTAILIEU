import {test,expect,type Page,type BrowserContext} from '@playwright/test';
const text=(count:number)=>Array.from({length:count},(_,i)=>`第${i+1}章 标题\n这是第${i+1}章的完整内容。\n`).join('\n');
const file=(count:number)=>({name:'full.txt',mimeType:'text/plain',buffer:Buffer.from(text(count))});
type Store={revision:number;rows:Map<string,{id:string;revision:number;record:any}>;enabled:boolean};
async function connect(context:BrowserContext,store?:Store){
 await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic fixture'}}));
 if(store)await context.route(/\/api\/state(?:\?|$)/,r=>{
  if(!store.enabled)return r.abort('internetdisconnected');const request=r.request(),url=new URL(request.url());
  if(request.method()==='GET'){const scope=url.searchParams.get('book')??'',after=+(url.searchParams.get('after')??0),rows=[...store.rows.values()].filter(row=>(row.record.bookId??'')===scope&&row.revision>after).sort((a,b)=>a.revision-b.revision);return r.fulfill({json:{cursor:store.revision,more:false,rows}});}
  const input=request.postDataJSON(),old=store.rows.get(input.id);if((old?.revision??0)!==input.baseRevision)return r.fulfill({status:409,json:{row:old}});const row={id:input.id,record:input.record,revision:++store.revision};store.rows.set(input.id,row);return r.fulfill({json:{row}});
 });
}
async function seed(page:Page){
 await page.goto('/');await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();await page.getByLabel(/^(Chọn|Đổi) file$/).setInputFiles(file(3));await page.getByLabel('Tên truyện',{exact:true}).fill('Truyện cập nhật thử');await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.locator('.reader-book-heading h1')).toHaveText('Truyện cập nhật thử');const id=new URL(page.url()).pathname.split('/')[2];await page.goto('/book/'+id);return id;
}
async function snapshot(page:Page,id:string){return page.evaluate(async id=>{const {db}=await import('/src/core/db.ts');return {chapters:await db.chapters.where('bookId').equals(id).sortBy('order'),progress:await db.progress.get(id),sources:await Promise.all((await db.sources.where('bookId').equals(id).toArray()).map(async s=>({...s,blob:undefined,bytesArray:Array.from(new Uint8Array(await s.blob.arrayBuffer()))}))),cache:await db.settings.get('ai-synthetic-keep'),staging:await db.books.where('status').equals('staging').count()};},id);}
async function openUpdate(page:Page,count:number){const panel=page.locator('details.panel').filter({has:page.locator('summary',{hasText:'Cập nhật chương từ file TXT'})});if(!await panel.evaluate(e=>(e as HTMLDetailsElement).open))await panel.locator('summary').first().click();await panel.getByLabel('File TXT đầy đủ',{exact:true}).setInputFiles(file(count));await panel.getByRole('button',{name:'Kiểm tra chương mới',exact:true}).click();return panel;}
test('new-only TXT previews all new chapters, preserves existing data and rejects reimport',async({page})=>{
 await connect(page.context());const id=await seed(page),before=await snapshot(page,id);
 const panel=page.locator('details.panel').filter({has:page.locator('summary',{hasText:'Cập nhật chương từ file TXT'})});await panel.locator('summary').first().click();
 await panel.getByLabel('Loại file cập nhật').selectOption('new-only');
 const update={name:'new.txt',mimeType:'text/plain',buffer:Buffer.from(text(5).slice(text(5).indexOf('第4章')))};
 await panel.getByLabel('File chỉ có chương mới',{exact:true}).setInputFiles(update);await panel.getByRole('button',{name:'Kiểm tra chương mới',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Thêm các chương mới',exact:true})).toBeVisible();await expect(panel).toContainText('2 chương mới');expect((await snapshot(page,id)).chapters).toEqual(before.chapters);
 await panel.getByRole('button',{name:'Thêm các chương mới',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Đã thêm 2');
 const after=await snapshot(page,id);expect(after.chapters).toHaveLength(5);expect(after.chapters.slice(0,3)).toEqual(before.chapters);expect(after.sources.find(s=>s.id===before.sources[0].id)).toEqual(before.sources[0]);expect(after.progress).toEqual(before.progress);
 await page.reload();await panel.locator('summary').first().click();await panel.getByLabel('Loại file cập nhật').selectOption('new-only');await panel.getByLabel('File chỉ có chương mới',{exact:true}).setInputFiles(update);await panel.getByRole('button',{name:'Kiểm tra chương mới',exact:true}).click();await expect(panel.getByRole('status')).toContainText('trùng');expect((await snapshot(page,id)).chapters).toEqual(after.chapters);expect((await snapshot(page,id)).staging).toBe(0);
});
test('full TXT preview adds only the suffix, keeps old bytes/progress/AI and survives reload; duplicate and discarded preview change nothing',async({page})=>{
 await connect(page.context());const id=await seed(page);await page.evaluate(async id=>{const {db}=await import('/src/core/db.ts');const old=await db.chapters.where('bookId').equals(id).sortBy('order');await db.progress.put({bookId:id,chapterId:old[1].id,revision:1,paragraph:0,offset:2,updatedAt:7});await db.settings.put({key:'ai-synthetic-keep',value:'Bản dịch cũ'});},id);const before=await snapshot(page,id);
 const panel=await openUpdate(page,5);await expect(panel.getByRole('button',{name:'Thêm các chương mới',exact:true})).toBeVisible();expect((await snapshot(page,id)).chapters).toHaveLength(3);await expect(panel).toContainText('2 chương mới');await panel.getByRole('button',{name:'Thêm các chương mới',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Đã thêm 2');
 const after=await snapshot(page,id);expect(after.chapters.slice(0,3)).toEqual(before.chapters);expect(after.chapters).toHaveLength(5);expect(after.sources).toHaveLength(2);expect(after.sources.find(s=>s.id===before.sources[0].id)).toEqual(before.sources[0]);expect(after.progress).toEqual(before.progress);expect(after.cache).toEqual(before.cache);expect(after.staging).toBe(0);
 await page.reload();await expect(page.locator('.story-chapter-list li')).toHaveCount(5);const duplicate=await openUpdate(page,5);await expect(duplicate.getByRole('status')).toContainText('chưa có chương mới');expect((await snapshot(page,id)).chapters).toEqual(after.chapters);expect((await snapshot(page,id)).staging).toBe(0);
 const discarded=await openUpdate(page,6);await expect(discarded.getByRole('button',{name:'Thêm các chương mới',exact:true})).toBeVisible();await discarded.getByRole('button',{name:'Bỏ bản xem trước',exact:true}).click();await expect.poll(async()=>(await snapshot(page,id)).staging).toBe(0);expect((await snapshot(page,id)).chapters).toEqual(after.chapters);expect((await snapshot(page,id)).sources).toEqual(after.sources);
});
test('another browser receives a complete appended suffix before its AI reading progress and retains missing-original metadata honestly',async({page,browser})=>{
 const store:Store={revision:0,rows:new Map(),enabled:false},otherContext=await browser.newContext({viewport:page.viewportSize()!});try{
  await connect(page.context(),store);await connect(otherContext,store);const id=await seed(page),base=await snapshot(page,id),other=await otherContext.newPage();await other.goto('/');
  const book=await page.evaluate(async id=>{const {db}=await import('/src/core/db.ts');return db.books.get(id);},id);
  await other.evaluate(async({id,book,base})=>{const {db}=await import('/src/core/db.ts');await db.books.put(book!);await db.chapters.bulkPut(base.chapters);for(const s of base.sources){const {bytesArray,...rest}=s;await db.sources.put({...rest,blob:new Blob([new Uint8Array(bytesArray)])});}await db.settings.put({key:`cloud-uploaded:${location.origin}:${id}`,value:{sha256:'a'.repeat(64)}});},{id,book,base});
  await page.evaluate(async id=>{const {db}=await import('/src/core/db.ts');await db.settings.put({key:`cloud-uploaded:${location.origin}:${id}`,value:{sha256:'a'.repeat(64)}});},id);
  const panel=await openUpdate(page,5);await expect(panel.getByRole('button',{name:'Thêm các chương mới',exact:true})).toBeVisible();await panel.getByRole('button',{name:'Thêm các chương mới',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Đã thêm 2');
  await page.evaluate(async id=>{const {db}=await import('/src/core/db.ts');const latest=(await db.chapters.where('bookId').equals(id).sortBy('order')).at(-1)!;await db.progress.put({bookId:id,chapterId:latest.id,revision:1,mode:'ai',paragraph:0,offset:0,updatedAt:Date.now()});},id);
  store.enabled=true;const sync=async(p:Page)=>p.evaluate(async()=>{const {syncSharedState}=await import('/src/features/sync-cloud/services/shared-state-sync.ts');await syncSharedState();await syncSharedState();});await sync(page);await sync(other);await sync(other);
  const remote=await snapshot(other,id),local=await snapshot(page,id);expect(remote.chapters).toEqual(local.chapters);expect(remote.progress).toEqual(local.progress);expect(remote.sources.find(s=>s.id!==base.sources[0].id)?.dataStatus).toBe('missing');expect(remote.sources.find(s=>s.id!==base.sources[0].id)?.bytesArray).toEqual([]);
  const records=[...store.rows.values()].sort((a,b)=>a.revision-b.revision);expect(records.findIndex(r=>r.record.kind==='chapter-append-packet')).toBeLessThan(records.findIndex(r=>r.record.kind==='chapter-append'));expect(records.findIndex(r=>r.record.kind==='chapter-append')).toBeLessThan(records.findIndex(r=>r.record.kind==='progress'));
  expect(await other.evaluate(async()=>{const {sharedSyncStatus}=await import('/src/features/sync-cloud/services/shared-state-sync.ts');return sharedSyncStatus().state;})).toBe('synced');await other.goto('/book/'+id);await expect(other.locator('.story-chapter-list li')).toHaveCount(5);
 }finally{await otherContext.close();}
});
test('append conflict describes the file and chapters clearly; keeping local does not change the book',async({page})=>{
 await connect(page.context());const id=await seed(page),before=await snapshot(page,id);
 await page.evaluate(async id=>{
  const {db}=await import('/src/core/db.ts'),{makeAppendRecords}=await import('/src/features/import-export/services/chapter-append.ts'),{sharedRecordId}=await import('/src/features/sync-cloud/services/shared-state-schema.ts'),{ttsHash}=await import('/src/features/tts/services/tts-cursor.ts');
  const old=await db.chapters.where('bookId').equals(id).sortBy('order'),source=(await db.sources.where('bookId').equals(id).first())!;
  const chapters=[3,4].map(order=>({id:crypto.randomUUID(),bookId:id,order,title:'Chương '+(order+1),text:'Nội dung mới.',revision:1,sourceId:'new-source'}));
  const {manifest}=await makeAppendRecords(id,old,chapters,{...source,id:'new-source',name:'full.txt'},'a'.repeat(64)),key=await sharedRecordId(manifest),{value:_,...descriptor}=manifest;
  await db.settings.put({key:'shared-state-replica-v1',value:{version:1,cursors:{[id]:1},base:{[key]:{descriptor,revision:1,hash:await ttsHash(JSON.stringify(manifest))}},conflicts:{[key]:{id:key,revision:1,record:manifest}}}});
 },id);
 await page.goto('/settings/sync');const conflict=page.locator('.shared-conflicts article');await expect(conflict.locator('h4')).toHaveText('Cập nhật chương mới');await conflict.locator('summary').click();await expect(conflict).toContainText('2 chương mới sau 3 chương hiện có.');await expect(conflict).toContainText('File: full.txt');await expect(conflict).toContainText('Chưa có bản cập nhật này trên máy.');await conflict.getByRole('button',{name:'Giữ nội dung trên máy',exact:true}).click();await expect(conflict).toHaveCount(0);expect((await snapshot(page,id)).chapters).toEqual(before.chapters);
});


