import {test,expect} from '@playwright/test';
for(const mode of ['single','batch','folder'])for(const action of ['cancel','unmount'])test(`${mode} ${action} during atomic publication preserves existing data and suppresses late completion`,async({page})=>{
 await page.goto(`/e2e/import-lifecycle.html?mode=${mode}`);
 if(mode==='single'){await page.getByText('Dán nội dung truyện',{exact:true}).click();await page.getByLabel('Hoặc dán nội dung',{exact:true}).fill('第1章 起点\n你好。\n第2章 后来\n正文。');}
 if(mode==='folder')await page.getByLabel('Chọn folder truyện',{exact:true}).evaluate((element:HTMLInputElement)=>{const selection=new DataTransfer();const file=new File(['第1章 起点\n你好。\n第2章 后来\n正文。'],'A.txt');Object.defineProperty(file,'webkitRelativePath',{value:'Kho/A.txt'});selection.items.add(file);element.files=selection.files;element.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.getByRole('button',{name:mode==='single'?'Nhập truyện':mode==='batch'?'Nhập nhiều truyện':'Nhập folder',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).commitHeld)).toBe(true);
 if(action==='cancel')await page.getByRole('button',{name:'Hủy xử lý',exact:true}).click();else await page.evaluate(()=>(window as any).unmountProbe());
 await page.evaluate(()=>(window as any).releaseCommit());
 if(action==='cancel')await expect(page.getByRole('alert')).toContainText(/hủy|abort|transaction/i);else await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return [await db.books.count(),await db.chapters.count(),await db.sources.count(),await db.importJobs.count()];})).toEqual([1,0,0,0]);
 expect(await page.evaluate(()=>(window as any).probeDone)).toBe(0);
 expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return [(await db.books.get('keep'))?.title,await(await db.dictionaries.get('names')).blob.text()];})).toEqual(['Existing','测试=Thử']);
});
