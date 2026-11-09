import {test,expect,type Page} from '@playwright/test';

const book='name-discovery-synthetic',chapter='name-discovery-synthetic-1',source='林安走进白云山的书院，遇见陈月。';
async function seed(page:Page,text=source,theme='sepia'){
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic fixture'}}));
 await page.goto('/');await expect(page.getByRole('button',{name:'Thêm truyện',exact:true})).toBeVisible();
 await page.evaluate(async({book,chapter,source,theme})=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['books','chapters','settings'],'readwrite');
   tx.objectStore('books').put({id:book,title:'Truyện tổng hợp',author:'',status:'ready',chapterCount:1,charCount:source.length,createdAt:1,updatedAt:1});
   tx.objectStore('chapters').put({id:chapter,bookId:book,order:0,title:'Chương tổng hợp',text:source,revision:1,sourceId:''});
   tx.objectStore('settings').put({key:'reader-options',value:{mode:'convert',preloadAi:false,autoNext:false}});
   tx.objectStore('settings').put({key:'reader',value:{theme}});
   tx.objectStore('settings').put({key:`ai-book-settings:${book}`,value:{model:'gemini-2.5-flash',modelMode:'fixed',temperature:0,splitParts:true,fallbackModels:[],systemPrompt:'Prompt dịch thường'}});
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });db.close();
 },{book,chapter,source:text,theme});
 await page.goto(`/read/${book}/${chapter}`);
}
test('finds current-chapter Names, shows $ format, saves only selection without changing source',async({page})=>{
 await seed(page);
 await page.getByText('Công cụ ▾',{exact:true}).click();await page.getByRole('button',{name:'Tìm và dịch Name',exact:true}).click();
 const prompt='Chỉ tìm tên riêng thực sự có trong nguồn; dịch ngắn gọn.';
 await page.goto('/settings/ai');const input=page.getByRole('textbox',{name:'Prompt tìm Name'});await expect(input).toBeEnabled();await input.fill(prompt);await page.getByRole('button',{name:'Lưu prompt tìm Name'}).click();await expect(page.locator('[aria-label="Cài đặt tìm Name"] [role=status]')).toContainText('Đã lưu');await page.reload();await expect(input).toHaveValue(prompt);
 const calls:any[]=[];await page.route('**/api/ai/translate',r=>{const body=r.request().postDataJSON();calls.push(body);return r.fulfill({json:{result:'Đã nhận diện nhân vật 林安 và địa danh 白云山.\n```text\n$白云山=Bạch Vân Sơn\n$林安=Lâm An\n$林安=Lâm An\n$林安=Lâm Yên\n```',model:body.model,finishReason:'STOP',inputTokens:20,outputTokens:20}});});
 await page.goto(`/read/${book}/${chapter}`);await page.getByText('Công cụ ▾',{exact:true}).click();await page.getByRole('button',{name:'Tìm và dịch Name',exact:true}).click();await page.getByRole('button',{name:'Bắt đầu tìm Name',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Đã quét chương'})).toBeVisible({timeout:20000});expect(calls).toHaveLength(1);expect(calls[0].task).toBe('name-extraction');expect(calls[0].systemPrompt).toBe(prompt);expect(calls[0].text).toContain(source);expect(calls[0].text).toContain('"version":1');
 const first=page.getByRole('checkbox',{name:'Chọn $白云山'});
 const alternatives=page.getByRole('checkbox',{name:'Chọn $林安'});
 await expect(alternatives).toHaveCount(2);
 await first.check();
 await alternatives.nth(0).check();
 await alternatives.nth(1).check();
 await expect(alternatives.nth(0)).not.toBeChecked();
 await expect(first).toBeChecked();
 await alternatives.nth(1).uncheck();
 await page.getByRole('button',{name:'Lưu Name đã chọn'}).click();await expect(page.getByRole('status').filter({hasText:'Đã lưu 1 Name'})).toBeVisible();
 const saved=await page.evaluate(async({book,chapter})=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);});const read=(store:string,key?:string)=>new Promise<any>((resolve,reject)=>{const r=key?db.transaction(store).objectStore(store).get(key):db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const value={chapter:await read('chapters',chapter),names:await read('names')};db.close();return value;},{book,chapter});
 expect(saved.names.map((n:any)=>[n.key,n.value])).toEqual([['白云山','Bạch Vân Sơn']]);expect(saved.chapter.text).toBe(source);
});

for (const theme of ['light','dark']) test('retries a skipped leaf with a different model and keeps edited selections in '+theme,async({page},info)=>{
 const text='林安'+'甲'.repeat(1198)+'白云山'+'乙'.repeat(1197);
 await seed(page,text,theme);
 await expect(page.locator('.reader')).toHaveClass(new RegExp('theme-'+theme));
 const firstModel='gemini-3.5-flash', retryModel='gemini-2.5-flash';
 const calls:{text:string;model:string}[]=[];
 let release!:()=>void;
 const hold=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/ai/translate',async route=>{
  const body=route.request().postDataJSON(), part=JSON.parse(body.text).source as string;
  calls.push({text:part,model:body.model});
  if(calls.length===1){
   await hold;
   return route.fulfill({status:502,headers:{'X-AI-Failure-Reason':'upstream_finish_reason'},json:{error:'ai_incomplete_result'}});
  }
  if(body.model===firstModel&&part.includes('林安'))return route.fulfill({status:502,headers:{'X-AI-Failure-Reason':'output_limit'},json:{error:'ai_incomplete_result'}});
  if(!part.includes('林安')&&!part.includes('白云山'))return route.fulfill({json:{result:'```text\n# Không tìm thấy Name.\n```',model:body.model,finishReason:'STOP',inputTokens:20,outputTokens:20}});
  const name=part.includes('林安')?'$林安=Lâm An':'$白云山=Bạch Vân Sơn';
  return route.fulfill({json:{result:'Giải thích\n```text\n'+name+'\n```',model:body.model,finishReason:'STOP',inputTokens:20,outputTokens:20}});
 });
 await page.getByText('Công cụ ▾',{exact:true}).click();
 await page.getByRole('button',{name:'Tìm và dịch Name',exact:true}).click();
 const panel=page.getByRole('region',{name:'Tìm và dịch Name'});
 const model=panel.getByRole('combobox',{name:'Model tìm Name'});
 const filter=panel.getByRole('searchbox',{name:'Lọc Name đề xuất'});
 const save=panel.getByRole('button',{name:'Lưu Name đã chọn'});
 await expect(filter).toHaveCount(0);
 await model.selectOption(firstModel);
 await panel.getByRole('button',{name:'Bắt đầu tìm Name'}).click();
 try { await expect(model).toBeDisabled(); } finally { release(); }
 await expect(panel.getByRole('status')).toHaveText('Đã quét chương và bỏ qua phần lỗi.');
 await expect(panel.getByText('2/3 phần xong · 1 bỏ qua')).toBeVisible();
 await panel.getByText('Xem phần đã bỏ qua',{exact:true}).click();
 await expect(panel.getByText(/^Phần 1\.1\.1 ·/)).toBeVisible();
 expect(calls.map(call=>call.text.length)).toEqual([2400,1200,600,600,1200]);
 expect(calls.every(call=>call.model===firstModel)).toBe(true);
 await expect(save).toBeDisabled();
 await filter.fill('bach van');
 const checked=panel.getByRole('checkbox',{name:'Chọn $白云山'});
 await checked.check();
 await panel.getByRole('button',{name:'Xóa bộ lọc'}).click();
 await expect(filter).toBeFocused();
 await expect(filter).toHaveValue('');
 const selected=panel.getByRole('button',{name:'Đã chọn (1)'});
 await selected.click();
 await expect(selected).toHaveAttribute('aria-pressed','true');
 const meaning=panel.getByRole('textbox',{name:'Nghĩa $白云山'});
 await meaning.fill('Núi Bạch Vân');
 await model.selectOption(retryModel);
 await panel.getByRole('button',{name:'Thử lại phần lỗi kỹ thuật'}).click();
 await expect(panel.getByRole('status')).toHaveText('Đã quét chương.');
 expect(calls.slice(5)).toEqual([{text:text.slice(0,600),model:retryModel}]);
 await expect(meaning).toHaveValue('Núi Bạch Vân');
 await expect(checked).toBeChecked();
 await expect(panel.getByRole('checkbox',{name:'Chọn $林安'})).toHaveCount(0);
 await selected.click();
 await filter.fill('$林安');
 await expect(panel.getByRole('checkbox',{name:'Chọn $林安'})).toBeVisible();
 await expect(checked).toHaveCount(0);
 await panel.getByRole('button',{name:'Xóa bộ lọc'}).click();
 await expect(save).toBeEnabled();
 expect(await panel.evaluate(node=>node.scrollWidth)).toBe(await panel.evaluate(node=>node.clientWidth));
 await panel.screenshot({path:info.outputPath('name-discovery.png')});
});
