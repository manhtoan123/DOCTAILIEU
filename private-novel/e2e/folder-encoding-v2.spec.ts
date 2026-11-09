import {test,expect} from '@playwright/test';

async function open(page:import('@playwright/test').Page){
  await page.goto('/');await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();
  await page.getByRole('button',{name:'Nhập folder truyện',exact:true}).click();
}
test('folder streams mixed BOM encodings as independent books and preserves actual source encodings',async({page})=>{
  await open(page);
  await page.getByLabel('Chọn folder truyện',{exact:true}).evaluate((element:HTMLInputElement)=>{
    const files=new DataTransfer();
    for(const [name,body]of [['u8.txt',new Uint8Array([0xef,0xbb,0xbf,0xe4,0xb8,0xad])],['le.txt',new Uint8Array([0xff,0xfe,0x2d,0x4e])],['be.txt',new Uint8Array([0xfe,0xff,0x4e,0x2d])]] as const){
      const file=new File([body],name);Object.defineProperty(file,'webkitRelativePath',{value:`Kho/Mixed/${name}`});files.items.add(file);
    }
    element.files=files.files;element.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.getByRole('button',{name:'Nhập folder',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const actual=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {books:(await db.books.toArray()).map(b=>({album:b.album,count:b.chapterCount})),chapters:(await db.chapters.toArray()).map(c=>c.text),sources:(await db.sources.toArray()).map(s=>s.encoding).sort()};});
  expect(actual.books).toEqual(Array.from({length:3},()=>({album:'Kho/Mixed',count:1})));
  expect(actual.chapters).toEqual(['中','中','中']);expect(actual.sources).toEqual(['utf-16be','utf-16le','utf-8']);
});
test('blank TXT rejects the selection and rolls back prior books from this selection only',async({page})=>{
  await open(page);
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.books.add({id:'retained-empty-regression',title:'Retained',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:0,charCount:0});});
  await page.getByLabel('Chọn folder truyện',{exact:true}).evaluate((element:HTMLInputElement)=>{
    const files=new DataTransfer();for(const [name,body]of [['1.txt','正文'],['2.txt',' \r\n\t']]){const file=new File([body],name);Object.defineProperty(file,'webkitRelativePath',{value:`Kho/Blank/${name}`});files.items.add(file);}
    element.files=files.files;element.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.getByRole('button',{name:'Nhập folder',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Nhập folder truyện'}).locator(':scope > .notice.error')).toContainText('khoảng trắng');
  const remaining=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {ids:(await db.books.toArray()).map(b=>b.id),chapters:await db.chapters.count(),sources:await db.sources.count(),jobs:await db.importJobs.count()};});
  expect(remaining).toEqual({ids:['retained-empty-regression'],chapters:0,sources:0,jobs:0});
});
