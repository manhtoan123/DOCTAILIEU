import {test,expect,type Page} from '@playwright/test';

async function seed(page:Page,savedChapter=1){
  await page.goto('/');
  await page.evaluate(async(savedChapter)=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    const chapters=[1,2,3].map(number=>({id:`review-${number}`,bookId:'review-book',order:number-1,title:`Chương ${number}: Review`,text:Array.from({length:30},(_,index)=>`Chương ${number} đoạn ${index}. ${'Văn bản tổng hợp để kiểm tra vị trí đọc. '.repeat(12)}`).join('\n\n'),revision:1,sourceId:''}));
    await db.transaction('rw',[db.books,db.chapters,db.progress],async()=>{
      await db.books.add({id:'review-book',title:'Truyện review',author:'Fixture',status:'ready',chapterCount:3,charCount:chapters.reduce((sum,c)=>sum+c.text.length,0),createdAt:1,updatedAt:1});
      await db.chapters.bulkAdd(chapters);
      await db.progress.put({bookId:'review-book',chapterId:`review-${savedChapter}`,paragraph:12,offset:0,revision:1,updatedAt:7});
    });
    const original=Element.prototype.scrollIntoView;
    (window as any).__reviewScrolls=[];
    Element.prototype.scrollIntoView=function(options){
      if(this.hasAttribute('data-paragraph'))(window as any).__reviewScrolls.push({paragraph:Number(this.getAttribute('data-paragraph')),text:this.textContent});
      return original.call(this,options);
    };
  },savedChapter);
  await page.getByRole('button',{name:'Thông tin Truyện review',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Truyện review',exact:true})).toBeVisible();
}

for(const action of ['Đọc tiếp','Đọc từ đầu','Chương 1: Review']){
  test(`review same saved chapter: ${action} restores the intended paragraph`,async({page})=>{
    await seed(page);
    await page.getByRole('button',{name:action,exact:true}).click();
    await expect(page.locator('.prose')).toContainText('Chương 1 đoạn 12.');
    await expect.poll(()=>page.evaluate(()=>(window as any).__reviewScrolls)).toEqual([
      // paragraphRanges indexes blank lines too, so text block 6 has paragraph index 12.
      {paragraph:action==='Đọc tiếp'?12:0,text:expect.stringContaining(`Chương 1 đoạn ${action==='Đọc tiếp'?6:0}.`)}
    ]);
  });
}

test('review explicit non-first saved chapter starts at zero',async({page})=>{
  await seed(page,2);
  await page.getByRole('button',{name:'Chương 2: Review',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__reviewScrolls)).toEqual([
    {paragraph:0,text:expect.stringContaining('Chương 2 đoạn 0.')}
  ]);
});

test('review cancelled paragraph lookup cannot scroll or save the previous chapter',async({page})=>{
  await seed(page);
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    const original=db.progress.get.bind(db.progress);let block=true;
    db.progress.get=async(...args:any[])=>{
      const row=await original(...args);
      if(block&&document.querySelector('.prose [data-paragraph]')){
        block=false;(window as any).__reviewLookupBlocked=true;
        await new Promise<void>(resolve=>{(window as any).__reviewRelease=resolve;});
      }
      return row;
    };
  });
  await page.getByRole('button',{name:'Đọc tiếp',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__reviewLookupBlocked)).toBe(true);
  await page.getByRole('button',{name:'Chương sau →',exact:true}).first().click();
  await expect(page.locator('.prose')).toContainText('Chương 2 đoạn 0.');
  await expect.poll(()=>page.evaluate(()=>(window as any).__reviewScrolls.length)).toBe(1);
  await page.evaluate(()=>(window as any).__reviewRelease());
  // Wait beyond both the restore delay and progress debounce to catch stale callbacks.
  await page.waitForTimeout(800);
  expect(await page.evaluate(()=>(window as any).__reviewScrolls)).toEqual([
    {paragraph:0,text:expect.stringContaining('Chương 2 đoạn 0.')}
  ]);
  await page.getByRole('button',{name:'← Thông tin truyện',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return (await db.progress.get('review-book'))?.chapterId;})).toBe('review-2');
});

test('review missing saved chapter resumes first chapter and empty story disables reading',async({page})=>{
  await seed(page);
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.progress.update('review-book',{chapterId:'missing'});});
  await expect(page.locator('.story-progress')).toContainText('không còn khả dụng');
  await page.getByRole('button',{name:'Đọc tiếp',exact:true}).click();
  await expect(page.locator('.prose')).toContainText('Chương 1 đoạn 0.');
  await page.getByRole('button',{name:'← Thông tin truyện',exact:true}).click();
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.chapters.where('bookId').equals('review-book').delete();});
  await expect(page.getByRole('button',{name:'Đọc tiếp',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Đọc từ đầu',exact:true})).toBeDisabled();
});

test('review leaving before paragraph lookup finishes preserves saved progress',async({page})=>{
  await seed(page);
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    const original=db.progress.get.bind(db.progress);let block=true;
    db.progress.get=async(...args:any[])=>{
      const row=await original(...args);
      if(block&&document.querySelector('.prose [data-paragraph]')){
        block=false;(window as any).__reviewLookupBlocked=true;
        await new Promise<void>(resolve=>{(window as any).__reviewRelease=resolve;});
      }
      return row;
    };
  });
  await page.getByRole('button',{name:'Đọc tiếp',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__reviewLookupBlocked)).toBe(true);
  await page.getByRole('button',{name:'← Thông tin truyện',exact:true}).click();
  await expect(page.getByRole('region',{name:'Thông tin truyện',exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).__reviewRelease());
  await page.waitForTimeout(800);
  const saved=await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.progress.get('review-book');});
  expect(saved).toMatchObject({chapterId:'review-1',paragraph:12,updatedAt:7});
  expect(await page.evaluate(()=>(window as any).__reviewScrolls)).toEqual([]);
});

test('review cancelled initial lookup cannot override a later explicit chapter mount',async({page})=>{
  await seed(page);
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    const original=db.progress.get.bind(db.progress);const releases:(()=>void)[]=[];
    (window as any).__reviewBlockInitial=true;
    (window as any).__reviewReleaseAll=()=>releases.forEach(resolve=>resolve());
    db.progress.get=async(...args:any[])=>{
      const row=await original(...args);
      if((window as any).__reviewBlockInitial&&document.querySelector('.reader')){
        (window as any).__reviewInitialBlocked=true;
        await new Promise<void>(resolve=>releases.push(resolve));
      }
      return row;
    };
  });
  await page.getByRole('button',{name:'Đọc tiếp',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__reviewInitialBlocked)).toBe(true);
  await expect(page.locator('.prose [data-paragraph]')).toHaveCount(0);
  await page.getByRole('button',{name:'← Thông tin truyện',exact:true}).click();
  await expect(page.getByRole('region',{name:'Thông tin truyện',exact:true})).toBeVisible();
  await page.evaluate(()=>{(window as any).__reviewBlockInitial=false;});
  await page.getByRole('button',{name:'Chương 3: Review',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__reviewScrolls.length)).toBe(1);
  await page.evaluate(()=>(window as any).__reviewReleaseAll());
  await page.waitForTimeout(800);
  await expect(page.locator('.prose')).toContainText('Chương 3 đoạn 0.');
  expect(await page.evaluate(()=>(window as any).__reviewScrolls)).toEqual([
    {paragraph:0,text:expect.stringContaining('Chương 3 đoạn 0.')}
  ]);
});
