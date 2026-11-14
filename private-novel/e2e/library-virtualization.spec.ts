import {test,expect} from '@playwright/test';

async function seedBooks(page:import('@playwright/test').Page,prefix:string,count:number){
  await page.evaluate(async({prefix,count})=>{
    const database=await new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open('thu-phong-v1');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    const books=Array.from({length:count},(_,index)=>({
      id:`${prefix}-${String(index).padStart(4,'0')}`,
      title:`${prefix==='virtual-book'?'Virtual profile book':'Large fixture story'} ${index}`,
      author:`Author ${index%20}`,
      createdAt:index+1,
      updatedAt:index+1,
      status:'ready',
      chapterCount:12,
      charCount:12000,
    }));
    try{
      await new Promise<void>((resolve,reject)=>{
        const transaction=database.transaction('books','readwrite');
        const store=transaction.objectStore('books');
        for(const book of books)store.put(book);
        transaction.oncomplete=()=>resolve();
        transaction.onerror=()=>reject(transaction.error);
      });
    }finally{database.close();}
  },{prefix,count});
}

test('large shelves virtualize measured rows and preserve keyboard, scroll, and view behavior',async({page},testInfo)=>{
  await page.setViewportSize(testInfo.project.name==='android-layout'?{width:393,height:852}:{width:1365,height:820});
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'synthetic library virtualization fixture'}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Thêm truyện',exact:true}).waitFor();
  await seedBooks(page,'virtual-book',1000);
  await page.reload();

  const grid=page.locator('.virtualized-book-grid');
  await expect(grid).toHaveAttribute('role','list');
  await expect.poll(async()=>page.locator('.book-card').count()).toBeGreaterThan(0);
  let rendered=await page.locator('.book-card').count();
  expect(rendered).toBeLessThan(1000);
  await expect(page.locator('[data-virtual-book-index="0"]')).toHaveAttribute('aria-posinset','1');
  await expect(page.locator('[data-virtual-book-index="0"]')).toHaveAttribute('aria-setsize','1000');

  const keyboard=await page.evaluate(()=>{
    const rows=Array.from(document.querySelectorAll<HTMLElement>('[data-virtual-row-index]'));
    const last=rows.at(-1)!;
    const next=Number(last.dataset.virtualRowIndex)+1;
    const tabbables=last.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])');
    tabbables.item(tabbables.length-1).focus();
    return {last:Number(last.dataset.virtualRowIndex),next};
  });
  await page.keyboard.press('Tab');
  await expect.poll(()=>page.evaluate(()=>document.activeElement?.closest<HTMLElement>('[data-virtual-row-index]')?.dataset.virtualRowIndex)).toBe(String(keyboard.next));

  const focusedIndex=await page.evaluate(()=>document.activeElement?.closest<HTMLElement>('[data-virtual-book-index]')?.dataset.virtualBookIndex);
  await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  const lastCard=page.locator('[data-virtual-book-index="999"]');
  await expect(lastCard).toBeAttached();
  await expect.poll(()=>page.evaluate(()=>document.activeElement?.closest<HTMLElement>('[data-virtual-book-index]')?.dataset.virtualBookIndex)).toBe(focusedIndex);

  const scrollBeforeDetails=await page.evaluate(()=>window.scrollY);
  const lastTitle=(await lastCard.locator('h3').innerText()).trim();
  await lastCard.locator('a[aria-label^="Thông tin"]').click();
  await expect(page.getByRole('heading',{name:lastTitle,exact:true})).toBeVisible();
  await page.getByRole('link',{name:'← Tủ sách',exact:true}).click();
  await expect(page.locator('.virtualized-book-grid')).toBeVisible();
  await expect(page.locator('[data-virtual-book-index="999"]')).toBeAttached();
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(scrollBeforeDetails-100);

  for(const [label,selector] of [['Danh sách','.list-shelf'],['Thu gọn','.compact-shelf']] as const){
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(page.locator(`.virtualized-book-grid${selector}`)).toBeVisible();
    await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
    await expect(page.locator('[data-virtual-book-index="999"]')).toBeAttached();
    rendered=await page.locator('.book-card').count();
    expect(rendered).toBeLessThan(1000);
  }
});

test('5,000-book fixture keeps a bounded DOM and can reach the final story',async({page})=>{
  await page.setViewportSize({width:1365,height:820});
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'synthetic 5,000-book fixture'}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Thêm truyện',exact:true}).waitFor();
  await seedBooks(page,'large-book',5000);
  await page.reload();
  await expect(page.locator('.virtualized-book-grid')).toHaveAttribute('role','list');
  await expect.poll(async()=>page.locator('.book-card').count()).toBeGreaterThan(0);
  expect(await page.locator('.book-card').count()).toBeLessThan(100);
  await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  const finalStory=page.locator('[data-virtual-book-index="4999"]');
  await expect(finalStory).toBeAttached();
  await expect(finalStory).toHaveAttribute('aria-posinset','5000');
  await expect(finalStory).toHaveAttribute('aria-setsize','5000');
});
