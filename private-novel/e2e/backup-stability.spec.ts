import {test,expect,type Page} from '@playwright/test';

async function openIsolated(page:Page){
  await page.route('**/api/**',route=>route.fulfill({status:503}));
  await page.goto('/',{waitUntil:'domcontentloaded'});
}
async function seedAndExport(page:Page){
  return page.evaluate(async()=>{
    const {db}=await import('/src/core/db.ts');
    const {prepareBackup,hashBlob}=await import('/src/features/import-export/services/backup.ts');
    const {saveConvertNames}=await import('/src/features/names-convert/services/convert-names.ts');
    await db.books.add({id:'backup-check',title:'Backup synthetic',displayTitle:'Truyện kiểm tra',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:3});
    await db.chapters.add({id:'backup-chapter',bookId:'backup-check',order:0,title:'第一章',displayTitle:'Chương một',text:'甲🙂',revision:1,sourceId:'backup-source'});
    const blob=new Blob(['Original synthetic TXT 🙂']);
    await db.sources.add({id:'backup-source',bookId:'backup-check',name:'原文.txt',displayName:'Bản gốc.txt',relativePath:'原文.txt',encoding:'utf-8',sha256:await hashBlob(blob),bytes:blob.size,blob});
    const dictionary=new Blob(['甲=Giáp']);
    await db.dictionaries.put({kind:'vp',name:'Synthetic VP.txt',sha256:await hashBlob(dictionary),blob:dictionary,updatedAt:1});
    await db.names.add({id:'name',bookId:'backup-check',key:'乙',value:'Ất'});
    await saveConvertNames('甲=Giáp riêng');
    await db.progress.put({bookId:'backup-check',chapterId:'backup-chapter',paragraph:0,offset:1,revision:1,updatedAt:1});
    const part=await(await prepareBackup('backup-check',{mode:'portable'})).part(0);
    return part.blob.text();
  });
}

test('portable backup restores bytes, names, Vietnamese titles and reading position in a separate browser profile',async({page,browser,baseURL})=>{
  await openIsolated(page);const packet=await seedAndExport(page);
  const clean=await browser.newContext({baseURL});
  try{
    const destination=await clean.newPage();await openIsolated(destination);
    const result=await destination.evaluate(async packet=>{
      const {db}=await import('/src/core/db.ts');const {stageBackup,restoreBackup,hashBlob}=await import('/src/features/import-export/services/backup.ts');
      const {readConvertNames}=await import('/src/features/names-convert/services/convert-names.ts');
      const [backup]=await stageBackup([new File([packet],'synthetic.tpbackup.json')],()=>{});const id=await restoreBackup(backup);
      const book=await db.books.get(id),chapter=await db.chapters.where('bookId').equals(id).first(),source=await db.sources.where('bookId').equals(id).first(),progress=await db.progress.get(id);
      return {title:book?.displayTitle,chapter:chapter?.displayTitle,file:source?.displayName,bytes:await source!.blob.text(),hashValid:await hashBlob(source!.blob)===source!.sha256,names:await readConvertNames(),bookName:(await db.names.where('bookId').equals(id).first())?.value,dictionary:await(await db.dictionaries.get('vp'))!.blob.text(),mapped:progress?.chapterId===chapter?.id,offset:progress?.offset,staging:await db.books.where('status').equals('staging').count()};
    },packet);
    expect(result).toEqual({title:'Truyện kiểm tra',chapter:'Chương một',file:'Bản gốc.txt',bytes:'Original synthetic TXT 🙂',hashValid:true,names:[{key:'甲',value:'Giáp riêng'}],bookName:'Ất',dictionary:'甲=Giáp',mapped:true,offset:1,staging:0});
    await destination.reload({waitUntil:'domcontentloaded'});await expect(destination.getByRole('button',{name:'Truyện kiểm tra',exact:true})).toBeVisible();
  }finally{await clean.close();}
});

test('a rechecksummed corrupt source cannot replace the original book in native IndexedDB',async({page})=>{
  await openIsolated(page);const packet=await seedAndExport(page);
  const result=await page.evaluate(async packet=>{
    const {db}=await import('/src/core/db.ts');const {stageBackup,restoreBackup,hashBlob}=await import('/src/features/import-export/services/backup.ts');
    const p=JSON.parse(packet),body=JSON.parse(p.body);body.sources[0].dataBase64=btoa('corrupted');p.body=JSON.stringify(body);p.checksum=await hashBlob(new Blob([p.body]));
    const [id]=await stageBackup([new File([JSON.stringify(p)],'corrupt.json')],()=>{});
    let failed=false;try{await restoreBackup(id,{onConflict:'replace'});}catch{failed=true;}
    return {failed,ready:(await db.books.get('backup-check'))?.status,original:await(await db.sources.get('backup-source'))!.blob.text(),staging:await db.books.where('status').equals('staging').count()};
  },packet);
  expect(result).toEqual({failed:true,ready:'ready',original:'Original synthetic TXT 🙂',staging:0});
});
