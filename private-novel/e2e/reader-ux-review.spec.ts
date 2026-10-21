import {test,expect,type Page} from '@playwright/test';

// Independent review fixtures: real IndexedDB, Reader and language Worker.
// Only Audio/network and deliberately pending storage reads are controlled.
async function seed(page:Page){
  await page.goto('/');
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    const text=Array.from({length:80},(_,i)=>`Đoạn ${i}. Nội dung tổng hợp để kiểm tra tiến độ và âm thanh.`).join('\n');
    await db.books.put({id:'review-a',title:'Review Reader A',author:'',status:'ready',chapterCount:1,charCount:text.length,createdAt:1,updatedAt:1});
    await db.chapters.put({id:'review-chapter',bookId:'review-a',title:'Chương kiểm tra',order:0,text,revision:1,sourceId:'review-source'});
    await db.sources.put({id:'review-source',bookId:'review-a',name:'Synthetic.txt',relativePath:'Synthetic.txt',encoding:'utf-8',sha256:'synthetic-review',bytes:new Blob([text]).size,blob:new Blob([text])});
    await db.names.bulkPut([{id:'review-name',bookId:'review-a',key:'山门',value:'Cổng A'},{id:'review-other-name',bookId:'review-b',key:'山门',value:'Cổng B'}]);
    await db.progress.put({bookId:'review-a',chapterId:'review-chapter',paragraph:20,offset:0,revision:1,updatedAt:1});
  });
  await page.getByRole('button',{name:'Mở sách →',exact:true}).click();
  await expect(page.locator('.prose')).toContainText('Đoạn 79.');
  await expect.poll(()=>page.locator('[data-paragraph="20"]').evaluate(element=>Math.abs(element.getBoundingClientRect().top))).toBeLessThan(150);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(600);
}
async function openNames(page:Page){
  await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();
  await page.getByRole('button',{name:'✎ Name',exact:true}).click();
  return page.getByRole('dialog',{name:'Name riêng của truyện',exact:true});
}

for(const rawOtherChapter of [false,true])test(`external chapter revision stops old speech and cannot auto-continue stale sentences (raw other chapter: ${rawOtherChapter})`,async({page})=>{
  const spoken:string[]=[];
  await page.addInitScript(()=>{
    const state=window as any;state.__audioPauses=0;
    state.Audio=class {onended?:()=>void;onerror?:()=>void;playbackRate=1;constructor(){state.__reviewAudio=this;state.__reviewAudioCount=(state.__reviewAudioCount||0)+1;}removeAttribute(){}load(){}play(){return Promise.resolve();}pause(){state.__audioPauses++;}};
    state.__finishReviewAudio=()=>state.__reviewAudio?.onended?.();
  });
  await page.route('https://ottsy.weilbyte.dev/api/generation',async route=>{spoken.push(route.request().postDataJSON().text);await route.fulfill({json:{success:true,data:'//PkxAAAAAAA',error:null}});});
  await seed(page);
  if(rawOtherChapter){
    await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.chapters.put({id:'review-raw-chapter',bookId:'review-a',title:'Chương raw mới',order:1,text:'Âm thanh raw cũ. Câu thứ hai.',revision:1,sourceId:''});await db.books.update('review-a',{chapterCount:2});});
    await page.getByRole('button',{name:'Bản gốc',exact:true}).click();
    await page.getByRole('navigation',{name:'Điều hướng chương đầu trang'}).getByRole('button',{name:'Chương sau →',exact:true}).click();
    await expect(page.locator('.prose')).toContainText('Âm thanh raw cũ.');
  }
  await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();
  await expect.poll(()=>spoken.length).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('button',{name:'Nghe truyện nhanh',exact:true})).toHaveAttribute('title','Tạm dừng nghe');
  await page.evaluate(async raw=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.chapters.update(raw?'review-raw-chapter':'review-chapter',{text:'Nội dung phiên bản mới.',revision:2});},rawOtherChapter);
  await expect(page.locator('.prose')).toContainText('Nội dung phiên bản mới.');
  await expect(page.getByRole('button',{name:'Nghe truyện nhanh',exact:true})).toBeEnabled();
  await page.evaluate(()=>(window as any).__finishReviewAudio());
  await expect.poll(()=>page.evaluate(()=>(window as any).__audioPauses)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>(window as any).__reviewAudioCount)).toBe(1);expect(spoken.some(text=>text.includes('Nội dung phiên bản mới'))).toBe(false);
});

test('Back while new revision progress hydration is pending preserves saved revision',async({page})=>{
  await seed(page);
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);const state=window as any;
    const original=db.progress.get.bind(db.progress);state.__reviewProgressGet=original;state.__reviewProgressHeld=false;
    db.progress.get=async(...args:any[])=>{state.__reviewProgressHeld=true;return new Promise(resolve=>{state.__releaseReviewProgress=async()=>resolve(await original(...args));});};
    const chapter=await db.chapters.get('review-chapter');await db.chapters.update('review-chapter',{text:chapter.text+'\nDòng mới.',revision:2});
  });
  await expect.poll(()=>page.evaluate(()=>(window as any).__reviewProgressHeld)).toBe(true);
  await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();
  const saved=await page.evaluate(async()=>{const state=window as any;await state.__releaseReviewProgress();return state.__reviewProgressGet('review-a');});
  expect(saved).toMatchObject({chapterId:'review-chapter',revision:1});
  expect(saved.paragraph).toBeGreaterThan(0);
});

test('failed Name delete preserves draft, all entries, chapter and source bytes',async({page})=>{
  await seed(page);const panel=await openNames(page);await panel.locator('summary').click();
  await panel.getByLabel('Nội dung Name List').fill('山门=Chưa lưu\n水=Nháp khác');
  const before=await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    const snapshot={names:await db.names.toArray(),chapter:await db.chapters.get('review-chapter'),source:await (await db.sources.get('review-source')).blob.text()};
    db.names.delete=()=>{throw new Error('review injected deletion failure');};return snapshot;
  });
  await panel.getByRole('button',{name:'Xóa Name 山门',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('review injected deletion failure');
  await expect(panel.getByLabel('Nội dung Name List')).toHaveValue('山门=Chưa lưu\n水=Nháp khác');
  expect(await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return {names:await db.names.toArray(),chapter:await db.chapters.get('review-chapter'),source:await (await db.sources.get('review-source')).blob.text()};})).toEqual(before);
});

test('raw mode remounted paragraphs continue recording scrolled progress',async({page})=>{
  await seed(page);
  await page.getByRole('button',{name:'Bản gốc',exact:true}).click();
  await expect(page.locator('.prose .word-token')).toHaveCount(0);
  await page.locator('[data-paragraph="60"]').evaluate(element=>element.scrollIntoView({block:'start'}));
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return (await db.progress.get('review-a'))?.paragraph;})).toBeGreaterThanOrEqual(59);
  // Reload in place: the reader route carries the chapter, so reload restores the
  // reader and its saved paragraph instead of returning to the shelf.
  await page.reload();
  await expect(page.locator('.prose')).toContainText('Đoạn 79.');
  await expect.poll(()=>page.locator('[data-paragraph="60"]').evaluate(element=>Math.abs(element.getBoundingClientRect().top))).toBeLessThan(250);
});

test('long literal paragraph with emoji preserves visible characters during display reflow',async({page})=>{
  await seed(page);
  await page.getByRole('button',{name:'Bản gốc',exact:true}).click();
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.chapters.update('review-chapter',{text:'Một😀đoạn văn tổng hợp để kiểm tra ký tự. '.repeat(350),revision:2});});
  await expect(page.locator('.prose [data-paragraph]')).toHaveCount(1);
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);document.dispatchEvent(new Event('visibilitychange'));return(await db.progress.get('review-a'))?.revision;})).toBe(2);
  const anchor=await page.locator('.prose [data-paragraph]').evaluate(element=>{
    const text=element.firstChild as Text;const approximate=Math.floor(text.length/2);const marker=text.data.indexOf('😀',approximate);
    const range=document.createRange();range.setStart(text,marker);range.setEnd(text,marker+2);window.scrollBy(0,range.getBoundingClientRect().top-10);
    // Measure independently via a DOM Range covering a complete surrogate pair.
    return {offset:marker,top:range.getBoundingClientRect().top};
  });
  await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();
  await page.getByRole('button',{name:'Tăng cỡ chữ',exact:true}).click();
  await expect(page.locator('.prose')).toHaveCSS('font-size','20px');
  const after=await page.locator('.prose [data-paragraph]').evaluate((element,offset)=>{const range=document.createRange();range.setStart(element.firstChild!,offset);range.setEnd(element.firstChild!,offset+2);return range.getBoundingClientRect().top;},anchor.offset);
  expect(Math.abs(after-anchor.top)).toBeLessThan(34);
});
