import {test,expect,type Page,type Locator} from '@playwright/test';
import {defaults} from '../src/core/domain';

const text='Chương 1: Bình minh\n\nVăn bản tổng hợp kiểm tra giao diện.\n';
test.beforeEach(async({context})=>{await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic theme fixture'}}));});
async function seed(page:Page,theme='sepia'){
 await page.goto('/');await expect(page.getByRole('button',{name:'Thêm truyện',exact:true})).toBeVisible();
 await page.evaluate(async({settings,text})=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);});const bytes=new TextEncoder().encode(text),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['settings','books','chapters','sources','progress'],'readwrite');tx.objectStore('settings').put({key:'reader',value:settings});tx.objectStore('settings').put({key:'reader-options',value:{mode:'original',preloadAi:false,autoNext:false}});tx.objectStore('books').put({id:'theme-book',title:'Truyện thử màu',displayTitle:'Truyện thử màu',author:'Tác giả tổng hợp',status:'ready',chapterCount:1,charCount:text.length,createdAt:1,updatedAt:1});tx.objectStore('chapters').put({id:'theme-chapter',bookId:'theme-book',order:0,title:'Chương 1: Bình minh',displayTitle:'Chương 1: Bình minh',text,sourceId:'theme-source',revision:1});tx.objectStore('sources').put({id:'theme-source',bookId:'theme-book',name:'theme.txt',relativePath:'theme.txt',encoding:'utf-8',sha256:sha,bytes:bytes.length,blob:new Blob([bytes])});tx.objectStore('progress').put({bookId:'theme-book',chapterId:'theme-chapter',paragraph:0,offset:0,revision:1,reading:true,updatedAt:7});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();},{settings:{...defaults,theme,font:'times',fontSize:25,ttsRate:1.3,background:'#123456',textColor:'#ffffff',futureReaderOption:'keep'},text});
 await page.goto('/settings/appearance');await expect(page.getByRole('group',{name:'Màu giao diện',exact:true})).toBeVisible();
}
async function snapshot(page:Page){return page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);});const read=(name:string)=>new Promise<any[]>(resolve=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);});const data={reader:(await read('settings')).find(s=>s.key==='reader')?.value,books:await read('books'),chapters:await read('chapters'),progress:await read('progress'),sources:await Promise.all((await read('sources')).map(async({blob,...s})=>({...s,raw:Array.from(new Uint8Array(await blob.arrayBuffer()))})))};db.close();return data;});}
async function readable(locator:Locator){const ratio=await locator.evaluate(node=>{const style=getComputedStyle(node),rgb=(color:string)=>color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(n=>{const v=n/255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}),luma=(color:string)=>{const [r,g,b]=rgb(color);return .2126*r+.7152*g+.0722*b;};let bg=style.backgroundColor,parent=node.parentElement;while(bg==='rgba(0, 0, 0, 0)'&&parent){bg=getComputedStyle(parent).backgroundColor;parent=parent.parentElement;}const foreground=luma(style.color),background=luma(bg);return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);});expect(ratio).toBeGreaterThanOrEqual(4.5);}

test('three app themes persist and preserve reader options, source bytes and reading data',async({page})=>{
 await seed(page);const before=await snapshot(page),picker=page.getByRole('group',{name:'Màu giao diện',exact:true});await expect(picker.getByRole('button')).toHaveCount(3);
 for(const [value,label]of [['light','Trắng'],['sepia','Giấy'],['dark','Tối']]){await picker.getByRole('button',{name:label,exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-ui-theme',value);await expect.poll(async()=>(await snapshot(page)).reader?.theme).toBe(value);const after=await snapshot(page);expect(after.reader).toMatchObject({font:'times',fontSize:25,ttsRate:1.3,voiceId:defaults.voiceId,futureReaderOption:'keep',background:'',textColor:''});const {reader,...data}=after,{reader:old,...original}=before;expect(data).toEqual(original);await page.reload();await expect(picker.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('html')).toHaveAttribute('data-ui-theme',value);await readable(picker.getByRole('button',{name:label,exact:true}));}
 await page.evaluate(()=>localStorage.setItem('reader-ui-theme','invalid'));await page.reload();await expect(page.locator('html')).toHaveAttribute('data-ui-theme','dark');expect(await page.evaluate(()=>localStorage.getItem('reader-ui-theme'))).toBe('dark');
});

test('dark theme covers library, story, import dialog and portal without changing book data',async({page})=>{
 await seed(page);await page.getByRole('group',{name:'Màu giao diện',exact:true}).getByRole('button',{name:'Tối',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-ui-theme','dark');const before=await snapshot(page);await page.goto('/');await readable(page.locator('.book-card'));await readable(page.getByRole('searchbox',{name:'Tìm truyện',exact:true}));
 await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Thêm truyện',exact:true});await readable(dialog);await readable(dialog.getByLabel('Tên truyện',{exact:true}));await dialog.getByRole('button',{name:'Đóng',exact:true}).last().click();
 await page.getByRole('button',{name:'Tùy chọn Truyện thử màu',exact:true}).click();const options=page.getByRole('dialog',{name:'Tùy chọn Truyện thử màu',exact:true});await readable(options);await options.press('Escape');await page.getByRole('link',{name:'Thông tin Truyện thử màu',exact:true}).click();await readable(page.locator('.story-summary'));await readable(page.getByLabel('Tìm chương',{exact:true}));
 const {reader,...data}=await snapshot(page),{reader:old,...original}=before;expect(data).toEqual(original);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('legacy gray is retained until an explicit reader preset, with only three visible choices',async({page})=>{
 await seed(page,'gray');await expect(page.locator('html')).toHaveAttribute('data-ui-theme','dark');expect((await snapshot(page)).reader.theme).toBe('gray');await page.goto('/read/theme-book/theme-chapter');await expect(page.locator('.prose')).toContainText('Văn bản tổng hợp');await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();const select=page.getByLabel('Nền',{exact:true});expect(await select.evaluate((node:HTMLSelectElement)=>Array.from(node.options).filter(option=>!option.hidden).map(option=>option.textContent))).toEqual(['Trắng','Giấy','Tối']);
 for(const theme of ['dark','sepia','light']){await select.selectOption(theme);await expect(page.locator('.reader')).toHaveClass(new RegExp('theme-'+theme));await expect(page.locator('html')).toHaveAttribute('data-ui-theme',theme);await expect.poll(async()=>(await snapshot(page)).reader.theme).toBe(theme);expect((await snapshot(page)).reader).toMatchObject({font:'times',fontSize:25,voiceId:defaults.voiceId,ttsRate:1.3,background:'',textColor:''});}
 await page.reload();await expect(page.locator('.reader')).toHaveClass(/theme-light/);await expect(page.locator('html')).toHaveAttribute('data-ui-theme','light');
});

test('AI switches keep visible tracks, contrasting thumbs and keyboard focus in all three themes',async({page},testInfo)=>{
 await seed(page);
 const appearance=page.getByRole('group',{name:'Màu giao diện',exact:true});
 const open=async()=>{await page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true}).click();return page.getByRole('dialog',{name:'Dịch AI',exact:true});};
 const colors=async(input:Locator)=>input.evaluate(node=>{
  const style=getComputedStyle(node),thumb=getComputedStyle(node,':before'),panel=getComputedStyle(node.closest('.reader-panel')!);
  const luma=(color:string)=>{const [r,g,b]=color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
  const contrast=(a:string,b:string)=>{const x=luma(a),y=luma(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  return {background:style.backgroundColor,thumbContrast:contrast(thumb.backgroundColor,style.backgroundColor),trackContrast:contrast(style.backgroundColor,panel.backgroundColor),x:thumb.transform==='none'?0:new DOMMatrixReadOnly(thumb.transform).m41,outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth)};
 });
 for(const [theme,label]of [['light','Trắng'],['sepia','Giấy'],['dark','Tối']]){
  await page.goto('/settings/appearance');await appearance.getByRole('button',{name:label,exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-ui-theme',theme);
  await page.goto('/read/theme-book/theme-chapter');await expect(page.locator('.prose')).toContainText('Văn bản tổng hợp');const panel=await open();
  for(const name of ['Dịch sẵn chương kế tiếp','Dịch chia phần song song']){
   const input=panel.getByRole('switch',{name,exact:true});await expect(input).toBeEnabled();await input.uncheck();await expect(input).not.toBeChecked();await expect(input).toBeEnabled();await expect.poll(async()=>(await colors(input)).x).toBe(0);const off=await colors(input);expect(off.trackContrast).toBeGreaterThanOrEqual(3);expect(off.thumbContrast).toBeGreaterThanOrEqual(3);
   await input.check();await expect(input).toBeEnabled();await expect.poll(async()=>(await colors(input)).x).toBe(16);const on=await colors(input);expect(on.background).not.toBe(off.background);expect(on.trackContrast).toBeGreaterThanOrEqual(3);expect(on.thumbContrast).toBeGreaterThanOrEqual(3);
   await input.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await expect(input).toBeFocused();const focused=await colors(input);expect(focused.outline).toBe('solid');expect(focused.outlineWidth).toBeGreaterThanOrEqual(2);
   await input.press('Space');await expect(input).not.toBeChecked();await expect(input).toBeEnabled();await input.press('Space');await expect(input).toBeChecked();await expect(input).toBeEnabled();
  }
  await page.reload();const reloaded=await open();for(const name of ['Dịch sẵn chương kế tiếp','Dịch chia phần song song'])await expect(reloaded.getByRole('switch',{name,exact:true})).toBeChecked();
  const split=reloaded.getByRole('switch',{name:'Dịch chia phần song song',exact:true});await expect(split).toBeEnabled();await split.uncheck();await expect(split).toBeEnabled();
  await page.screenshot({path:`.dsh-tmp/ui-switch/${theme}-${testInfo.project.name}.png`});
 }
});
