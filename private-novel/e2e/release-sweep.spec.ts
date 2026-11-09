import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

// Test-only in-memory service bundle; the UI uses its real
// production bundle and the same native IndexedDB. Every cloud endpoint is blocked.
let bridge='';
test.beforeAll(async()=>{
 const result=await build({stdin:{contents:"export {db} from './src/core/db';export {prepareBackup,stageBackup,restoreBackup,hashBlob} from './src/features/import-export/services/backup';export {saveScopedBookNames,readNameScope} from './src/features/names-convert/services/scoped-names';",resolveDir:process.cwd(),sourcefile:'release-sweep-fixture.ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',define:{'process.env.NODE_ENV':'\"test\"'}});
 bridge=result.outputFiles[0].text;
});
test.beforeEach(async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({status:503}));
 await page.route('**/src/release-sweep-fixture.ts',route=>route.fulfill({contentType:'text/javascript',body:bridge}));
 await page.goto('/',{waitUntil:'domcontentloaded'});
});

test('native IndexedDB restore rolls back bytes, dictionary and book activation together',async({page})=>{
 const result=await page.evaluate(async()=>{
  const path='/src/release-sweep-fixture.ts';const {db,prepareBackup,stageBackup,restoreBackup,hashBlob}=await import(/* @vite-ignore */path);
  const original=new Blob(['Original TXT bytes']);
  await db.books.add({id:'native-book',title:'Native restore fixture',author:'',status:'ready',chapterCount:1,charCount:1,createdAt:1,updatedAt:1});
  await db.sources.add({id:'native-source',bookId:'native-book',name:'source.txt',relativePath:'source.txt',encoding:'utf-8',sha256:await hashBlob(original),bytes:original.size,blob:original});
  await db.chapters.add({id:'native-chapter',bookId:'native-book',sourceId:'native-source',order:0,title:'One',text:'文',revision:1});
  const dictionary=new Blob(['文=văn\n']);await db.dictionaries.put({kind:'vp',name:'Fixture.txt',sha256:await hashBlob(dictionary),blob:dictionary,updatedAt:1});
  const part=await(await prepareBackup('native-book',{mode:'portable'})).part(0),packet=JSON.parse(await part.blob.text()),body=JSON.parse(packet.body);
  await db.dictionaries.delete('vp');body.book.chapterCount=2;const badBody=JSON.stringify(body);
  const [id]=await stageBackup([new File([JSON.stringify({...packet,body:badBody,checksum:await hashBlob(new Blob([badBody]))})],'bad.json')],()=>{});
  let failed=false;try{await restoreBackup(id,{onConflict:'replace'});}catch{failed=true;}
  const failure={failed,oldReady:(await db.books.get('native-book'))?.status==='ready',bytes:await(await db.sources.get('native-source')).blob.text(),dictionaryAbsent:!await db.dictionaries.get('vp'),staging:await db.books.where('status').equals('staging').count()};
  await db.restorePackets.where('backupId').equals(id).delete();await stageBackup([new File([part.blob],part.name)],()=>{});const restored=await restoreBackup(id,{onConflict:'replace'});
  return {failure,success:{oldGone:!await db.books.get('native-book'),ready:(await db.books.get(restored))?.status==='ready',dictionary:await(await db.dictionaries.get('vp')).blob.text(),books:await db.books.count()}};
 });
 expect(result).toEqual({failure:{failed:true,oldReady:true,bytes:'Original TXT bytes',dictionaryAbsent:true,staging:0},success:{oldGone:true,ready:true,dictionary:'文=văn\n',books:1}});
});

test('native restore keeps the current author meaning for every existing series',async({page})=>{
 const result=await page.evaluate(async()=>{
  const path='/src/release-sweep-fixture.ts';const {db,prepareBackup,stageBackup,restoreBackup,saveScopedBookNames,readNameScope}=await import(/* @vite-ignore */path);
  for(const [id,album]of [['one','Author/Series 1'],['two','Author/Series 2']]){
   await db.books.put({id,title:id,album,author:'',status:'ready',chapterCount:1,charCount:1,createdAt:1,updatedAt:1});
   await db.chapters.put({id:id+'-chapter',bookId:id,sourceId:'',order:0,title:'One',text:'文',revision:1});
  }
  await saveScopedBookNames('one','甲=Backup meaning');const part=await(await prepareBackup('one')).part(0);await db.settings.clear();
  await db.names.put({id:'legacy-current',bookId:'one',key:'甲',value:'Current meaning'});
  const [id]=await stageBackup([new File([part.blob],part.name)],()=>{});await restoreBackup(id);
  return {one:(await readNameScope('one')).rows.map((r:any)=>[r.key,r.value]),two:(await readNameScope('two')).rows.map((r:any)=>[r.key,r.value]),source:(await db.chapters.get('one-chapter')).text};
 });
 expect(result).toEqual({one:[['甲','Current meaning']],two:[['甲','Current meaning']],source:'文'});
});

test('Name settings groups author series and saving one row reaches only that author',async({page})=>{
 await page.evaluate(async()=>{
  const path='/src/release-sweep-fixture.ts';const {db}=await import(/* @vite-ignore */path);
  await db.books.bulkPut(['one','two','other'].map((id,i)=>({id,title:id,album:i<2?'Author/Series '+i:'Other',author:'',status:'ready',chapterCount:1,charCount:1,createdAt:1,updatedAt:1})));
 });
 await page.goto('/settings/names/one',{waitUntil:'domcontentloaded'});
 await expect(page.getByLabel('Kho Name',{exact:true}).locator('option')).toHaveCount(2);
 await expect(page.getByText('Dùng chung cho 2 truyện trong Album Author, gồm các series.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Thêm tên',exact:true}).click();await page.getByLabel('Chữ nguồn của Name',{exact:true}).fill('甲');await page.getByLabel('Tên Việt của Name',{exact:true}).fill('Giáp');await page.getByRole('button',{name:'Lưu tên',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Đã lưu Name cho Album Author');
 expect(await page.evaluate(async()=>{const path='/src/release-sweep-fixture.ts';const {readNameScope}=await import(/* @vite-ignore */path);return Promise.all(['one','two','other'].map(async id=>(await readNameScope(id)).rows.map((r:any)=>[r.key,r.value])));})).toEqual([[['甲','Giáp']],[['甲','Giáp']],[]]);
 await page.reload();await expect(page.locator('.name-manager')).toContainText('Giáp');
});

test('numeric TOC position, explicit links, next, reload and current chapter agree',async({page})=>{
 const book='a0000000-0000-4000-8000-000000000001',ids=['b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002'];
 await page.route('**/api/reader-route?**',route=>route.fulfill({json:{bookId:book,code:31823}}));
 await page.evaluate(async({book,ids})=>{const path='/src/release-sweep-fixture.ts';const {db}=await import(/* @vite-ignore */path);await db.books.put({id:book,title:'Route fixture',author:'',status:'ready',chapterCount:2,charCount:2,createdAt:1,updatedAt:1});await db.chapters.bulkPut(ids.map((id,i)=>({id,bookId:book,title:`Chương ${1429+i}`,order:1425+i,text:'Nội dung '+i,revision:1,sourceId:''})));await db.settings.put({key:'reader-options',value:{preloadAi:false,autoNext:false,mode:'original'}});await db.progress.put({bookId:book,chapterId:ids[1],revision:1,paragraph:0,offset:0,updatedAt:1});},{book,ids});
 await page.goto(`/read/${book}/${ids[0]}`,{waitUntil:'domcontentloaded'});await expect(page).toHaveURL(/\/r\/31823\/1$/);await expect(page.locator('.prose')).toContainText('Nội dung 0');
 await page.getByRole('link',{name:'Chương sau →',exact:true}).first().click();await expect(page).toHaveURL(/\/r\/31823\/2$/);await page.reload();await expect(page.locator('.prose')).toContainText('Nội dung 1');
 await page.getByRole('button',{name:'☷ Mục lục',exact:true}).first().click();await expect(page.locator('.toc [aria-current="page"]')).toContainText('Chương 1430');await expect(page.locator('.toc-reading')).toContainText('Chương 1430');
 await page.goto('/r/31823/9999',{waitUntil:'domcontentloaded'});await expect(page.getByText('Không tìm thấy vị trí chương trong mục lục.',{exact:true})).toBeVisible();await expect(page.locator('.prose')).toHaveCount(0);
});

test('prewarm cannot move the current reading bookmark to the next chapter',async({page})=>{
 await page.route('**/api/ai/translate',route=>{const input=route.request().postDataJSON();return route.fulfill({json:{result:input.text.includes('甲')?'Bản dịch đang đọc.':'Bản dịch chương sau.',model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.evaluate(async()=>{const path='/src/release-sweep-fixture.ts';const {db}=await import(/* @vite-ignore */path);await db.books.put({id:'progress-book',title:'Progress fixture',author:'',status:'ready',chapterCount:2,charCount:2,createdAt:1,updatedAt:1});await db.chapters.bulkPut(['甲','乙'].map((text,i)=>({id:'progress-'+i,bookId:'progress-book',title:'Chương '+(i+1),order:i,text,revision:1,sourceId:''})));await db.settings.put({key:'reader-options',value:{preloadAi:true,autoNext:false}});});
 await page.goto('/read/progress-book/progress-0',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch đang đọc.');await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','ready');
 await expect.poll(()=>page.evaluate(async()=>{const path='/src/release-sweep-fixture.ts';const {db}=await import(/* @vite-ignore */path);return (await db.progress.get('progress-book'))?.chapterId;})).toBe('progress-0');await page.goto('/book/progress-book',{waitUntil:'domcontentloaded'});await page.getByRole('link',{name:'Đọc tiếp',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch đang đọc.');
});
