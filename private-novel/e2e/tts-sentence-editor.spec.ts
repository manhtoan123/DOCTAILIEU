import {test,expect} from '@playwright/test';

const raw='标题没有标点\n第一行没有标点\n第二行没有标点';
const translated=['Chương 1452: Đại Từ Bi Tự','Trong Đại Tội Ác Tự, ánh sáng chập chờn','Oa Oa ngẩng đầu'];
for(const mode of ['original','ai'] as const)test(`${mode}: each real newline completes an editor row and applies only to the listening session`,async({page,context})=>{
 await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic fixture'}}));
 await context.route('**/api/ai/translate',r=>r.fulfill({json:{result:translated.join('\n'),model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}}));
 const spoken:string[]=[];
 await context.route('**/api/tts',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}});});
 await page.addInitScript(()=>{(window as any).Audio=class{currentTime=0;playbackRate=1;pause(){}load(){}removeAttribute(){}play(){return Promise.resolve();}};});
 await page.goto('/');await expect(page.getByRole('button',{name:'Thêm truyện',exact:true})).toBeVisible();
 await page.evaluate(async({raw})=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['books','chapters','settings'],'readwrite');
   tx.objectStore('books').put({id:'sentence-editor-book',title:'Truyện tổng hợp sửa câu',author:'Tổng hợp',status:'ready',chapterCount:1,charCount:raw.length,createdAt:1,updatedAt:1});
   tx.objectStore('chapters').put({id:'sentence-editor-chapter',bookId:'sentence-editor-book',order:0,title:'Chương thử',text:raw,revision:1,sourceId:''});
   tx.objectStore('settings').put({key:'reader-options',value:{mode:'original',preloadAi:false,autoNext:false}});
   tx.objectStore('settings').put({key:'ai-book-settings:sentence-editor-book',value:{model:'gemini-2.5-flash',fallbackModels:[],splitParts:false}});
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });db.close();
 },{raw});
 await page.goto('/read/sentence-editor-book/sentence-editor-chapter');
 const expected=mode==='ai'?translated:raw.split('\n');
 if(mode==='ai')await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await expect(page.locator('.prose')).toContainText(expected[1]);
 async function openEditor(){await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();await page.getByRole('button',{name:'Câu (3)',exact:true}).click();}
 await openEditor();const dialog=page.getByRole('dialog',{name:'Sửa câu đọc trong phiên',exact:true});
 await expect(dialog.locator('textarea')).toHaveCount(3);
 expect(await dialog.locator('textarea').evaluateAll(nodes=>nodes.map(node=>(node as HTMLTextAreaElement).value))).toEqual(expected);
 const edited='Câu thứ hai đã sửa';await dialog.getByRole('textbox',{name:'Câu 2',exact:true}).fill(edited);
 await dialog.getByRole('button',{name:'Áp dụng cho phiên',exact:true}).click();
 await openEditor();await expect(dialog.getByRole('textbox',{name:'Câu 2',exact:true})).toHaveValue(edited);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();
 await expect(page.getByRole('button',{name:'Nghe truyện nhanh',exact:true})).toHaveAttribute('data-state','playing');
 await expect.poll(()=>spoken.join('')).toContain(edited+'.\n');
 expect(spoken[0]).toContain(expected[0]+'.\n');
 await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();
 expect(await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);});
  const row=await new Promise<any>(resolve=>{const r=db.transaction('chapters').objectStore('chapters').get('sentence-editor-chapter');r.onsuccess=()=>resolve(r.result);});db.close();return row.text;
 })).toBe(raw);
 if(mode==='original')await page.getByRole('button',{name:'Bản gốc',exact:true}).click();
 await expect(page.locator('.prose')).toContainText(expected[1]);
});
