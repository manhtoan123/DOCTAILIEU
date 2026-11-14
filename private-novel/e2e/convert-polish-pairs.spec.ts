import {test,expect,type Page} from '@playwright/test';
const original='清晨花园很安静。小林打开门。\n'.repeat(160),book='paired-polish',chapter='paired-polish-1';
async function seed(page:Page,repeat=160,indexed=false){
 const fixtureOriginal=indexed?Array.from({length:repeat},(_,i)=>`清晨花园很安静。小林打开门。 ${i+1000}\n`).join(''):'清晨花园很安静。小林打开门。\n'.repeat(repeat);
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic fixture'}}));
 await page.goto('/');await expect(page.getByRole('button',{name:'Thêm truyện',exact:true})).toBeVisible();
 await page.evaluate(async({original,book,chapter})=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['books','chapters','sources','dictionaries','settings'],'readwrite');
  tx.objectStore('books').put({id:book,title:'Vườn tổng hợp',author:'Tổng hợp',status:'ready',chapterCount:1,charCount:original.length,createdAt:1,updatedAt:1});
  tx.objectStore('chapters').put({id:chapter,bookId:book,order:0,title:'Chương một',text:original,revision:1,sourceId:'paired-source'});
  tx.objectStore('sources').put({id:'paired-source',bookId:book,name:'synthetic.txt',encoding:'utf-8',bytes:new TextEncoder().encode(original).length,sha256:'fixture-unchanged',blob:new Blob([original])});
  tx.objectStore('dictionaries').put({kind:'vp',name:'Synthetic dictionary',blob:new Blob(['清晨花园很安静=Khu vườn buổi sáng yên tĩnh\n小林打开门=Tiểu Lâm mở cửa']),sha256:'synthetic-paired-dictionary',updatedAt:1});
  tx.objectStore('settings').put({key:'reader-options',value:{mode:'raw',preloadAi:false,autoNext:false}});
  tx.objectStore('settings').put({key:`ai-book-settings:${book}`,value:{model:'gemini-2.5-flash',modelMode:'fixed',temperature:0,splitParts:true,fallbackModels:[],systemPrompt:'PROMPT DỊCH KHÔNG ĐƯỢC DÙNG'}});
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
 },{original:fixtureOriginal,book,chapter});
 await page.goto(`/read/${book}/${chapter}`);await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.reader-convert-status')).toHaveCount(0);await expect(page.locator('.prose')).toContainText('Khu vườn buổi sáng yên tĩnh');
}
async function start(page:Page){await page.getByText('Công cụ ▾',{exact:true}).click();await page.getByRole('button',{name:'Trau chuốt bản Convert',exact:true}).click();await page.getByRole('button',{name:'Bắt đầu trau chuốt',exact:true}).click();}
function edit(body:any){const blocks=[...body.text.matchAll(/\[Convert \d+\]\n([\s\S]*?)(?=\n\[Nguyên văn \d+\]\n|$)/g)];expect(blocks.length).toBeGreaterThan(0);return blocks.map(m=>m[1]).join('').replaceAll('buổi sáng','sớm mai').trim();}
const reply=(body:any,result=edit(body))=>({result:'<BAN_TU_DIEN></BAN_TU_DIEN>\n<BAN_DICH>\n'+result+'\n</BAN_DICH>',model:body.model,finishReason:'STOP',inputTokens:10,outputTokens:10});
async function snapshot(page:Page){return page.evaluate(async({chapter})=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const read=(table:string,key?:string)=>new Promise<any>((resolve,reject)=>{const store=db.transaction(table).objectStore(table),r=key?store.get(key):store.getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const [saved,source,rows]=await Promise.all([read('chapters',chapter),read('sources','paired-source'),read('settings')]);db.close();return {chapter:saved.text,source:await source.blob.text(),hash:source.sha256,cache:rows.filter((r:any)=>r.key.startsWith('convert-polish:v1:'))};
},{chapter});}
test('saved editorial prompt sends exact alternating pairs and leaves original bytes unchanged',async({page})=>{
 await seed(page);await page.goto('/settings/ai');const prompt=page.getByRole('textbox',{name:'Prompt trau chuốt riêng'});await expect(prompt).toBeEnabled();await expect(prompt).toHaveValue(/Nguyên văn Trung/);await prompt.fill('Biên tập riêng: giữ Tiểu Lâm, giữ nguyên nghĩa và dòng.');await page.getByRole('button',{name:'Lưu cài đặt trau chuốt'}).click();await expect(page.locator('.polish-settings [role=status]')).toContainText('Đã lưu cài đặt');await page.reload();await expect(prompt).toHaveValue('Biên tập riêng: giữ Tiểu Lâm, giữ nguyên nghĩa và dòng.');
 const calls:any[]=[];await page.route('**/api/ai/translate',r=>{const body=r.request().postDataJSON();calls.push(body);return r.fulfill({json:reply(body)});});
 await page.goto(`/read/${book}/${chapter}`);await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('buổi sáng');const before=await snapshot(page);await start(page);await expect(page.getByRole('status').filter({hasText:'Đã áp dụng bản trau chuốt'})).toBeVisible({timeout:20000});
 expect(calls.length).toBeGreaterThan(1);for(const body of calls){expect(body.systemPrompt).toContain('Biên tập riêng: giữ Tiểu Lâm, giữ nguyên nghĩa và dòng.');expect(body.systemPrompt).toContain('<BAN_TU_DIEN>');expect(body.text).toMatch(/^\[Nguyên văn 1\]\n(?:清晨花园很安静。|小林打开门。)/);expect(body.text).toContain('小林打开门。');expect(body.text).toContain('Tiểu Lâm mở cửa.');expect(body.context).toBeUndefined();expect(body.text.length+body.systemPrompt.length+body.userPromptTemplate.replace('{{text}}','').length).toBeLessThanOrEqual(32000);}
 await expect(page.locator('.prose')).toContainText('sớm mai');await expect(page.locator('.prose')).not.toContainText('[Nguyên văn');const after=await snapshot(page);expect({...after,cache:[]}).toEqual({...before,cache:[]});expect(after.cache).toHaveLength(1);const bar=page.getByRole('progressbar',{name:'Tiến độ trau chuốt từng phần'});expect(await bar.locator('[data-state="done"]').count()).toBe(Number(await bar.getAttribute('aria-valuemax')));
 await page.reload();await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('sớm mai');
});
test('progressive prefix keeps tail Edit Name; second Convert cancels, clears cache and rejects late results',async({page})=>{
 await seed(page);let count=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/api/ai/translate',async r=>{const body=r.request().postDataJSON();if(++count>1)await gate;await r.fulfill({json:reply(body)}).catch(()=>{});});
 await start(page);await expect(page.locator('.prose')).toContainText('sớm mai');await expect(page.locator('.prose')).toContainText('buổi sáng');const bar=page.getByRole('progressbar',{name:'Tiến độ trau chuốt từng phần'});await expect(bar.locator('[data-state="done"]')).toHaveCount(1);expect(await bar.locator('[data-state="pending"]').count()).toBeGreaterThan(0);
 await page.locator('.prose .word-token').filter({hasText:'Tiểu Lâm'}).last().click();await expect(page.getByRole('dialog',{name:'Chỉnh Name',exact:true})).toBeVisible();await expect(page.getByRole('dialog',{name:'Chọn cụm từ',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Đóng Chỉnh Name',exact:true}).click();
 await page.getByRole('button',{name:'Convert',exact:true}).click();release();await expect(page.locator('.polish-inline')).toHaveCount(0);await expect(page.locator('.prose')).not.toContainText('sớm mai');await expect.poll(async()=>(await snapshot(page)).cache.length).toBe(0);await page.reload();await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('buổi sáng');expect((await snapshot(page)).cache).toHaveLength(0);expect((await snapshot(page)).source).toBe(original);
});
for(const invalid of ['label','cut','refusal'])test(`does not accept or replay invalid part: ${invalid}`,async({page})=>{
 await seed(page);let calls=0;await page.route('**/api/ai/translate',r=>{calls++;const body=r.request().postDataJSON();if(invalid==='refusal')return r.fulfill({status:502,headers:{'X-AI-Failure-Reason':'upstream_finish_reason'},json:{error:'ai_incomplete_result'}});return r.fulfill({json:invalid==='cut'?{...reply(body),finishReason:'MAX_TOKENS'}:reply(body,'[Convert 1]\nKết quả có nhãn sai.')});});
 await start(page);await expect(page.getByRole('button',{name:'Thử lại phần lỗi',exact:true})).toBeVisible();expect(calls).toBeGreaterThan(0);await expect(page.locator('.polish-inline [role="alert"]')).toHaveCount(0);await expect(page.getByRole('button',{name:'Convert',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('progressbar').locator('[data-state="done"]')).toHaveCount(0);expect((await snapshot(page)).cache).toHaveLength(0);await expect(page.locator('.prose')).toContainText('buổi sáng');
});
test('switching polish models retries only skipped roots and preserves accepted prose',async({page})=>{
 await seed(page,360,true);
 const a='gemini-2.5-flash',b='gemini-3.8-flash',c='gemini-3.7-flash';
 const requests:{model:string;text:string}[]=[],failed:string[]=[];
 let phase=0;
 await page.route('**/api/ai/translate',r=>{
  const body=r.request().postDataJSON();
  const index=requests.push({model:body.model,text:body.text})-1;
  if(!phase&&(index===1||index===3))failed.push(body.text);
  if((phase<=1&&failed.includes(body.text))||(phase===2&&body.text===failed[1])){
   return r.fulfill({status:502,headers:{'X-AI-Failure-Reason':'upstream_finish_reason'},json:{error:'ai_incomplete_result'}});
  }
  const phrase=body.model===a?'sớm mai':body.model===b?'bình minh vừa lên':'ban mai';
  return r.fulfill({json:reply(body,edit(body).replaceAll('sớm mai',phrase))});
 });
 const applied=page.getByRole('status').filter({hasText:'Đã áp dụng bản trau chuốt'});
 const retry=page.getByRole('button',{name:'Thử lại phần lỗi',exact:true});
 const picker=page.getByRole('combobox',{name:'Model trau chuốt'});
 const bar=page.getByRole('progressbar',{name:'Tiến độ trau chuốt từng phần'});
 const fallback=bar.locator('[data-state="skipped"]');
 await start(page);
 await expect(applied).toBeVisible({timeout:20000});
 expect(failed).toHaveLength(2);
 expect(new Set(requests.map(row=>row.text)).size).toBe(requests.length);
 expect(requests.every(row=>row.model===a)).toBe(true);
 await expect(fallback).toHaveCount(2);
 const initial=(await snapshot(page)).cache[0].value;
 const initialCount=requests.length;
 const oldRanges=initial.fallback as {targetStart:number;targetEnd:number}[];
 expect(oldRanges).toHaveLength(2);

 phase=1;
 await picker.selectOption(b);
 await expect(retry).toBeVisible();
 expect(requests).toHaveLength(initialCount);
 await retry.click();
 await expect(applied).toBeVisible();
 expect(requests.slice(initialCount)).toEqual(failed.map(text=>({model:b,text})));
 expect((await snapshot(page)).cache[0].value.text).toBe(initial.text);
 await expect(fallback).toHaveCount(2);

 phase=2;
 await retry.click();
 await expect(applied).toBeVisible();
 expect(requests.slice(initialCount+2)).toEqual(failed.map(text=>({model:b,text})));
 const mixed=(await snapshot(page)).cache[0].value;
 const newRange=mixed.fallback[0];
 await expect(fallback).toHaveCount(1);
 expect(mixed.models).toEqual([a,b]);
 expect(mixed.text.slice(0,oldRanges[0].targetStart)).toBe(initial.text.slice(0,oldRanges[0].targetStart));
 expect(mixed.text.slice(newRange.targetStart)).toBe(initial.text.slice(oldRanges[1].targetStart));
 expect(mixed.text.slice(oldRanges[0].targetStart,newRange.targetStart)).toContain('bình minh');
 expect(newRange.targetStart).not.toBe(oldRanges[1].targetStart);

 phase=3;
 await picker.selectOption(c);
 await retry.click();
 await expect(applied).toBeVisible();
 expect(requests.slice(initialCount+4)).toEqual([{model:c,text:failed[1]}]);
 await expect(fallback).toHaveCount(0);
 const final=(await snapshot(page)).cache[0].value;
 expect(final.models).toEqual([a,b,c]);
 expect(final.text.slice(0,newRange.targetStart)).toBe(mixed.text.slice(0,newRange.targetStart));
 expect(final.text.endsWith(mixed.text.slice(newRange.targetEnd))).toBe(true);
 expect(final.text.slice(newRange.targetStart)).toContain('ban mai');
});
test('polish saves Vietphrase and shared AI Names with separate buttons',async({page})=>{
 await seed(page);
 const requests:any[]=[];
 await page.route('**/api/ai/translate',r=>{
  const body=r.request().postDataJSON();
  requests.push(body);
  if(body.text.startsWith('[Nguyên văn'))return r.fulfill({json:{...reply(body),result:'<BAN_TU_DIEN>\n{Khu vườn}: $花园=Vườn hoa\n</BAN_TU_DIEN>\n<BAN_DICH>\n'+edit(body)+'\n</BAN_DICH>'}});
  return r.fulfill({json:{model:body.model,finishReason:'STOP',inputTokens:10,outputTokens:10,result:'Vườn hoa rất yên tĩnh. Tiểu Lâm mở cửa.\n'.repeat(160)}});
 });
 await start(page);
 await expect(page.getByRole('status').filter({hasText:'Đã áp dụng bản trau chuốt'})).toBeVisible({timeout:20000});
 await page.getByRole('checkbox',{name:'Chọn $花园=Vườn hoa'}).check();
 const vietphrase=page.getByRole('button',{name:'Lưu Vietphrase đã chọn'});
 const common=page.getByRole('button',{name:'Lưu Name chung cho AI'});
 await vietphrase.click();
 await expect(page.getByRole('status').filter({hasText:'Đã lưu 1 mục Vietphrase'})).toBeVisible();
 await expect(vietphrase).toBeDisabled();
 await expect(common).toBeEnabled();
 await common.click();
 await expect(page.getByRole('status').filter({hasText:'Đã lưu 1 mục Name chung cho AI'})).toBeVisible();
 await page.getByRole('button',{name:'Đóng trau chuốt'}).click();
 await page.getByRole('button',{name:'Bản gốc',exact:true}).click();
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await expect.poll(()=>requests.find(body=>!body.text.startsWith('[Nguyên văn'))?.names).toMatchObject({'花园':'Vườn hoa'});
});
test('saving Edit Name preserves completed polish and active narration without a reload or restart',async({page})=>{
 await page.addInitScript(()=>{(window as any).__audios=[];(window as any).__plays=0;(window as any).Audio=class{onended?:()=>void;playbackRate=1;src='';currentTime=0;duration=30;readyState=1;constructor(){(window as any).__audios.push(this);}removeAttribute(){}load(){}play(){if(this.onended)(window as any).__plays++;return Promise.resolve();}pause(){}};});
 await seed(page);let calls=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);await page.route('**/api/ai/translate',async r=>{const body=r.request().postDataJSON();if(++calls>1)await gate;await r.fulfill({json:reply(body)}).catch(()=>{});});
 const spoken:string[]=[];await page.route(/\/api\/(?:tts|generation)$/,r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}});});
 await start(page);await expect(page.locator('.prose')).toContainText('sớm mai');await expect.poll(()=>calls).toBe(2);const row=page.locator('.prose [data-paragraph]').first();if(test.info().project.name==='android-layout'){await row.tap({position:{x:15,y:10}});await expect(page.getByRole('dialog',{name:'Chọn cụm từ',exact:true})).toHaveCount(0);await page.waitForTimeout(450);await row.tap({position:{x:15,y:10}});await row.tap({position:{x:15,y:10}});}else{await row.click({position:{x:15,y:10}});await expect(page.getByRole('dialog',{name:'Chọn cụm từ',exact:true})).toHaveCount(0);await row.dblclick({position:{x:15,y:10}});}const chooser=page.getByRole('dialog',{name:'Chọn cụm từ',exact:true});await expect(chooser).toBeVisible();await chooser.getByRole('button',{name:'Đóng',exact:true}).click();await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__plays)).toBeGreaterThan(0);
 await expect(page.getByRole('button',{name:'Convert',exact:true})).toHaveAttribute('aria-pressed','true');await page.evaluate(()=>{(window as any).__noReloadMarker='same document';(window as any).__audios.at(-1).currentTime=7;});const tailToken=page.locator('.prose .word-token').filter({hasText:'Tiểu Lâm'}).last();await tailToken.focus();await tailToken.press('Enter');const popup=page.getByRole('dialog',{name:'Chỉnh Name',exact:true});await popup.getByLabel('Cụm từ tùy chọn',{exact:true}).fill('Lâm Mới mở cửa');await popup.getByRole('button',{name:'Lưu cụm từ tùy chọn',exact:true}).click();await expect(popup).toHaveCount(0);
 await expect(page.locator('.prose')).toContainText('Lâm Mới mở cửa');await expect(page.locator('.prose')).toContainText('sớm mai');await expect(page.getByRole('progressbar').locator('[data-state="done"]')).toHaveCount(1);expect(calls).toBe(2);expect(await page.evaluate(()=>(window as any).__noReloadMarker)).toBe('same document');await expect(page.getByRole('button',{name:'Dừng đọc nhanh',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();expect(await page.evaluate(()=>(window as any).__audios.at(-1).currentTime)).toBe(7);const plays=await page.evaluate(()=>(window as any).__plays);await page.evaluate(()=>{const audios=(window as any).__audios;audios.at(-1).onended?.();});await expect.poll(()=>page.evaluate(()=>(window as any).__plays)).toBeGreaterThan(plays);expect(spoken.some(t=>t.includes('sớm mai'))).toBe(true);
 await page.getByRole('button',{name:'Dừng trau chuốt',exact:true}).click();release();await page.reload();await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('sớm mai');await expect(page.locator('.prose')).toContainText('Lâm Mới mở cửa');expect(await page.evaluate(()=>(window as any).__plays)).toBe(0);expect((await snapshot(page)).source).toBe(original);
});
test('polished narration advances to the next Convert chapter and keeps pause/resume usable',async({page})=>{
 await page.addInitScript(()=>{(window as any).__audios=[];(window as any).__plays=0;(window as any).Audio=class{onended?:()=>void;playbackRate=1;src='';currentTime=0;duration=30;readyState=1;constructor(){(window as any).__audios.push(this);}removeAttribute(){}load(){}play(){if(this.onended)(window as any).__plays++;return Promise.resolve();}pause(){}};});
 await seed(page,1);await page.evaluate(async({book})=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);});await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['books','chapters','settings'],'readwrite');const readBook=tx.objectStore('books').get(book);readBook.onsuccess=()=>tx.objectStore('books').put({...readBook.result,chapterCount:2});tx.objectStore('chapters').put({id:'paired-polish-2',bookId:book,order:1,title:'Chương hai',text:'清晨花园很安静。小林打开门。',revision:1,sourceId:''});tx.objectStore('settings').put({key:'reader-options',value:{autoNext:true,preloadAi:false}});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();},{book});
 await page.reload();await page.getByRole('button',{name:'Convert',exact:true}).click();let calls=0;await page.route('**/api/ai/translate',r=>{calls++;const body=r.request().postDataJSON();return r.fulfill({json:reply(body)});});await page.route(/\/api\/(?:tts|generation)$/,r=>r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}}));
 await start(page);await expect(page.locator('.polish-inline [role=status]')).toContainText('Đã áp dụng bản trau chuốt');await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__plays)).toBe(1);await page.evaluate(()=>(window as any).__audios.at(-1).onended?.());await expect(page).toHaveURL(/\/paired-polish-2$/);await expect.poll(()=>page.evaluate(()=>(window as any).__plays)).toBe(2);await expect(page.getByRole('button',{name:'Convert',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();await page.getByRole('button',{name:'Nghe truyện nhanh',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__plays)).toBe(3);expect(calls).toBe(1);await expect(page.getByRole('button',{name:'Convert',exact:true})).toHaveAttribute('aria-pressed','true');
});
