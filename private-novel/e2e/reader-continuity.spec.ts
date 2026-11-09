import {test,expect,type Page} from '@playwright/test';

async function setup(page:Page){
  await page.addInitScript(()=>{
    const state=window as any,NativeWorker=window.Worker;state.holdConvert=false;state.heldConvert=[];
    class DelayedWorker extends EventTarget{
      native:Worker;requests=new Map<number,{type:string;text?:string}>();
      constructor(url:URL,options:WorkerOptions){super();this.native=new NativeWorker(url,options);
        this.native.addEventListener('message',event=>{
          const request=this.requests.get(event.data.id);
          const deliver=()=>{const fail=state.failBodyOnce&&request?.type==='convert'&&request.text?.includes('\n')&&event.data.type!=='progress';if(fail)state.failBodyOnce=false;this.dispatchEvent(new MessageEvent('message',{data:fail?{id:event.data.id,type:'error',message:'Synthetic reconvert failure'}:event.data}));};
          if(state.holdConvert&&request?.type==='convert'&&event.data.type!=='progress')state.heldConvert.push(deliver);else deliver();
        });this.native.addEventListener('error',()=>this.dispatchEvent(new Event('error')));
      }
      postMessage(message:any){this.requests.set(message.id,message);this.native.postMessage(message);}
      terminate(){this.native.terminate();}
    }
    state.Worker=function(url:URL,options:WorkerOptions){return String(url).includes('language.worker')?new DelayedWorker(url,options):new NativeWorker(url,options);};
    state.releaseConvert=(fail=false)=>{state.holdConvert=false;state.failBodyOnce=fail;while(state.heldConvert.length)state.heldConvert.shift()();};
  });
  await page.goto('/');await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    await db.books.add({id:'continuity',title:'山门',author:'',status:'ready',chapterCount:2,charCount:2000,createdAt:1,updatedAt:1});
    await db.names.add({id:'continuity-name',bookId:'continuity',key:'山门',value:'Cổng Cũ'});
    await db.chapters.bulkAdd([{id:'continuity-a',bookId:'continuity',order:0,title:'Chương A',text:Array(200).fill('山门。').join('\n'),revision:1,sourceId:''},{id:'continuity-b',bookId:'continuity',order:1,title:'Chương B',text:'第二章 BETA。',revision:1,sourceId:''}]);
  });
  await expect(page.locator('.book-detail h3')).toHaveText('Cổng Cũ');await page.getByRole('link',{name:'Mở sách →',exact:true}).click();
  await expect(page.locator('.prose [data-paragraph]')).toHaveCount(200);
  await expect(page.locator('.reader-book-heading h1')).toHaveText('Cổng Cũ');
  // Wait for the initial progress hydration timer before observing reflow.
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,0));return(await db.progress.get('continuity'))?.revision;})).toBe(1);
}
async function changeName(page:Page,value:string){await page.evaluate(async value=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.names.update('continuity-name',{value});},value);}
async function block(page:Page){await page.evaluate(()=>{const s=window as any;s.holdConvert=true;s.blankSeen=false;s.readerObserver=new MutationObserver(()=>{if(!document.querySelector('.prose [data-paragraph]'))s.blankSeen=true;});s.readerObserver.observe(document.querySelector('.prose'),{childList:true,subtree:true});});}
async function pending(page:Page){await expect.poll(()=>page.evaluate(()=>(window as any).heldConvert.length)).toBeGreaterThan(0);}

test('Name reconvert keeps paragraphs and latest visible source anchor while user scrolls',async({page})=>{
  await setup(page);await block(page);await changeName(page,'Cổng Mới với một cái tên rất dài để thay đổi chiều cao dòng văn bản');await pending(page);
  await expect(page.locator('.prose')).toContainText('Cổng Cũ');await expect(page.locator('.reader-book-heading h1')).toHaveText('Cổng Cũ');
  await expect(page.locator('.word-token').first()).toHaveAttribute('aria-disabled','true');
  await page.locator('[data-paragraph="130"]').evaluate(el=>el.scrollIntoView({block:'start'}));
  const anchor=await page.locator('.prose').evaluate(el=>{const row=[...el.querySelectorAll<HTMLElement>('[data-paragraph]')].find(p=>p.getBoundingClientRect().bottom>0&&p.getBoundingClientRect().top<innerHeight)!;return {paragraph:row.dataset.paragraph,top:row.getBoundingClientRect().top};});
  await page.evaluate(()=>(window as any).releaseConvert());
  await expect(page.locator('.prose')).toContainText('Cổng Mới');
  expect(await page.evaluate(()=>(window as any).blankSeen)).toBe(false);
  const after=await page.locator(`[data-paragraph="${anchor.paragraph}"]`).evaluate(el=>el.getBoundingClientRect().top);expect(Math.abs(after-anchor.top)).toBeLessThan(32);
});

test('rapid Name changes discard older result and failed reconvert retains readable snapshot for retry',async({page})=>{
  await setup(page);await block(page);await changeName(page,'Tên Giữa');await pending(page);await changeName(page,'Tên Cuối');
  await expect(page.locator('.reader-convert-status')).toBeVisible();await page.evaluate(()=>(window as any).releaseConvert());
  await expect(page.locator('.prose')).toContainText('Tên Cuối');expect(await page.evaluate(()=>(window as any).blankSeen)).toBe(false);
  await block(page);await changeName(page,'Tên Sau Lỗi');await pending(page);await page.evaluate(()=>(window as any).releaseConvert(true));
  await expect(page.getByRole('button',{name:'Thử lại Convert'})).toBeVisible();await expect(page.locator('.prose')).toContainText('Tên Cuối');
  expect(await page.evaluate(()=>(window as any).blankSeen)).toBe(false);await page.getByRole('button',{name:'Thử lại Convert'}).click();await expect(page.locator('.prose')).toContainText('Tên Sau Lỗi');
});

test('chapter switch cannot show old snapshot under the new chapter or accept late jobs',async({page})=>{
  await setup(page);await block(page);await changeName(page,'Tên Muộn');await pending(page);
  await page.getByRole('navigation',{name:'Điều hướng chương đầu trang'}).getByRole('link',{name:'Chương sau →'}).click();
  await expect(page.locator('.prose')).not.toContainText('Cổng Cũ');await expect(page.locator('.prose')).not.toContainText('Tên Muộn');
  await page.evaluate(()=>(window as any).releaseConvert());await expect(page.locator('.prose')).toContainText('BETA');await expect(page.locator('.prose')).not.toContainText('Tên Muộn');
});

test('dictionary replacement reconverts same source without hiding readable paragraphs',async({page})=>{
  await setup(page);await block(page);
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.dictionaries.put({kind:'vp',name:'Synthetic dictionary',blob:new Blob(['第二章=chương hai']),sha256:'continuity-dict',updatedAt:2});});
  await pending(page);await expect(page.locator('.prose')).toContainText('Cổng Cũ');await page.evaluate(()=>(window as any).releaseConvert());
  await expect(page.locator('.reader-convert-status')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).blankSeen)).toBe(false);
});

test('reflow retains a visible word deep inside one long paragraph',async({page})=>{
  await setup(page);await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.chapters.update('continuity-a',{text:Array(400).fill('山门 ').join(''),revision:2});});
  await expect(page.locator('.prose [data-paragraph]')).toHaveCount(1);
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);document.dispatchEvent(new Event('visibilitychange'));return(await db.progress.get('continuity'))?.revision;})).toBe(2);
  await page.locator('.word-token').nth(200).evaluate(el=>el.scrollIntoView({block:'start'}));
  const anchor=await page.locator('.prose').evaluate(el=>{const word=[...el.querySelectorAll<HTMLElement>('.word-token')].find(word=>word.getBoundingClientRect().bottom>0&&word.getBoundingClientRect().top<innerHeight)!;const range=document.createRange();range.setStart(word.firstChild!,0);range.setEnd(word.firstChild!,1);return {source:Number(word.dataset.sourceStart),top:range.getBoundingClientRect().top};});
  await block(page);await changeName(page,'Một Cổng Núi Có Tên Dài Hơn');await pending(page);await page.evaluate(()=>(window as any).releaseConvert());
  await expect(page.locator('.prose')).toContainText('Một Cổng Núi');
  const top=await page.locator(`[data-source-start="${anchor.source}"]`).first().evaluate(el=>{const range=document.createRange();range.setStart(el.firstChild!,0);range.setEnd(el.firstChild!,1);return range.getBoundingClientRect().top;});
  expect(Math.abs(top-anchor.top)).toBeLessThan(32);expect(await page.evaluate(()=>(window as any).blankSeen)).toBe(false);
});
