import {LanguageEngine} from '../src/features/names-convert/services/language';
import {test,expect,type Page} from '@playwright/test';
async function seed(page:Page,preload=false){
 await page.route('**/api/**',async r=>{if(new URL(r.request().url()).pathname==='/api/convert/name'){if(r.request().method()==='GET')return r.fulfill({json:{version:'test-name-1',dictionaries:[{kind:'vp',sha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},{kind:'hanviet',sha256:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'}]}});const {text,names}=r.request().postDataJSON();const engine=new LanguageEngine();engine.add('vp','林儿=Lâm Nhi');engine.add('hanviet','林=Lâm');engine.add('hanviet','儿=Nhi');const tokens=engine.convert(text,names,{reference:true,standardizePunctuation:true,capitalize:true});return r.fulfill({json:{version:'test-name-1',tokens,lookup:engine.lookup(text),lookups:tokens.filter(t=>t.source.trim()).map(t=>({source:t.source,...engine.lookup(t.source)}))}});}return r.fulfill({json:{revision:0,rows:[],payload:null,books:[],ids:[],keys:[],dictionaries:[]}});});
 await page.goto('/');await page.evaluate(async preload=>{
  const {db}=await import('/src/core/db.ts'),{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');
  await db.settings.put({key:'reader-options',value:{preloadAi:preload,autoNext:false}});
  await db.settings.put({key:'ai-book-settings:name-ai',value:{...AI_DEFAULTS,model:'gemini-2.5-flash',splitParts:false}});
  await db.books.put({id:'name-ai',title:'Name AI synthetic',author:'',status:'ready',chapterCount:3,charCount:30,createdAt:1,updatedAt:1});
  for(let i=1;i<=3;i++)await db.chapters.put({id:`name-ai-${i}`,bookId:'name-ai',title:`Chương ${i}`,order:i,sourceId:'',text:'林儿打开门。',revision:1});
  await db.dictionaries.put({kind:'vp',name:'fixture-vp',blob:new Blob(['林儿=Lâm Nhi']),sha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',updatedAt:1});
  await db.dictionaries.put({kind:'hanviet',name:'fixture',blob:new Blob(['林=Lâm\n儿=Nhi']),sha256:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',updatedAt:1});
 },preload);await page.goto('/read/name-ai/name-ai-1');
}
test('AI popup saves one book Name without translating again; next chapter uses it',async({page})=>{
 await seed(page);const calls:any[]=[];
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls.push(input);return r.fulfill({json:{result:'Lâm Nhi mở cánh cửa.',model:input.model,finishReason:'STOP',inputTokens:10,outputTokens:10}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lâm Nhi mở cánh cửa.');
 const before=await page.locator('.prose [data-paragraph="0"]').textContent();
 await page.evaluate(async()=>{const {TikTokPlayer}=await import('/src/features/tts/services/tts.ts');const stop=TikTokPlayer.prototype.stop;(window as any).__nameStops=0;TikTokPlayer.prototype.stop=function(...args:any[]){(window as any).__nameStops++;return stop.apply(this,args as []);};(window as any).__nameBlobReads=0;const read=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=function(){(window as any).__nameBlobReads++;return read.call(this);};});
 await page.locator('.prose [data-paragraph="0"]').dblclick();
 const chooser=page.getByRole('dialog',{name:'Chọn cụm từ',exact:true});await expect(chooser).toBeVisible();
 await expect(chooser.locator('textarea,input')).toHaveCount(0);
 await chooser.locator('button[data-source="林儿"]').click();
 const popup=page.getByRole('dialog',{name:'Chỉnh Name',exact:true});await expect(popup).toBeVisible();await expect(chooser).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__nameBlobReads)).toBe(0);
 await expect(popup.getByRole('button',{name:'Chạy Convert',exact:true})).toHaveCount(0);
 await expect(popup.getByRole('button',{name:'Áp dụng cụm từ tùy chọn',exact:true})).toHaveCount(0);
 await popup.getByLabel('Cụm từ tùy chọn',{exact:true}).fill('Tiểu Lâm');
 await expect(popup.getByRole('button',{name:'Lưu cụm từ tùy chọn',exact:true})).toBeEnabled();
 await popup.getByRole('button',{name:'Lưu cụm từ tùy chọn',exact:true}).click();await expect(popup).toHaveCount(0);await expect(chooser).toBeVisible();
 await expect.poll(()=>page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return(await db.names.where('bookId').equals('name-ai').toArray()).map(n=>[n.key,n.value]);})).toEqual([['林儿','Tiểu Lâm']]);
 await expect.poll(()=>page.locator('.prose [data-paragraph="0"]').evaluate(el=>{const copy=el.cloneNode(true) as HTMLElement;copy.querySelectorAll('button').forEach(b=>b.remove());return copy.textContent?.trim();})).toBe(before?.trim());expect(calls).toHaveLength(1);expect(await page.evaluate(()=>(window as any).__nameStops)).toBe(0);
 await chooser.locator('button[data-source="林儿"]').click();await expect(popup).toBeVisible();await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);await expect(chooser).toBeVisible();await page.keyboard.press('Escape');await expect(chooser).toHaveCount(0);
 await page.getByRole('link',{name:'Chương sau →',exact:true}).first().click();await expect.poll(()=>calls.length).toBe(2);expect(calls[1].names['林儿']).toBe('Tiểu Lâm');
});
test('live Name changes preserve current and prewarmed AI requests',async({page})=>{
 await seed(page,true);const calls:any[]=[];
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();calls.push(input);return r.fulfill({json:{result:'Lâm Nhi mở cánh cửa.',model:input.model,finishReason:'STOP',inputTokens:10,outputTokens:10}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>calls.length).toBe(2);
 await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.names.put({id:'live-name',bookId:'name-ai',key:'林儿',value:'Tiểu Lâm'});});
 await expect(page.locator('.prose')).toContainText('Lâm Nhi mở cánh cửa.');
 await page.getByRole('link',{name:'Chương sau →',exact:true}).first().click();await expect.poll(()=>calls.length).toBe(3);
 expect(calls[2].names['林儿']).toBe('Tiểu Lâm');
});

 test('double click opens an approximate Convert paragraph despite unequal counts, without an inline button',async({page})=>{
  await seed(page);
  await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.chapters.update('name-ai-1',{text:'前文。\n\n开头。\n\n林儿打开门。\n\n末尾。\n\n后文。'});});
  await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:'Đoạn trước.\n\nLâm Nhi mở cửa.\n\nĐoạn sau.',model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:10,outputTokens:10}}));
  await page.getByRole('button',{name:'Dịch AI',exact:true}).click();const paragraph=page.locator('.prose [data-paragraph]').filter({hasText:'Lâm Nhi mở cửa.'});await expect(paragraph).toBeVisible();await paragraph.click();await expect(page.locator('.prose button').filter({hasText:'Thêm Name'})).toHaveCount(0);await paragraph.dblclick();
  const chooser=page.getByRole('dialog',{name:'Chọn cụm từ',exact:true});await expect(chooser.locator('button[data-source="林儿"]')).toBeVisible();await expect(chooser).not.toContainText('Đoạn trước');await expect(chooser).not.toContainText('Đoạn sau');
  await chooser.locator('button[data-source="林儿"]').click();await expect(page.getByRole('dialog',{name:'Chỉnh Name',exact:true}).getByLabel('Chữ Trung',{exact:true})).toHaveValue('林儿');
 });

test('server failure waits for explicit local dictionary fallback',async({page})=>{
 await seed(page);
 await page.route('**/api/convert/name',r=>r.fulfill({status:503,json:{error:'unavailable'}}));
 await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:'Lâm Nhi mở cửa.',model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:10,outputTokens:10}}));
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lâm Nhi mở cửa.');
 await page.locator('.prose [data-paragraph="0"]').dblclick();
 const chooser=page.getByRole('dialog',{name:'Chọn cụm từ',exact:true});
 await expect(chooser.getByRole('button',{name:'Dùng từ điển trên máy',exact:true})).toBeVisible();
 await expect(chooser.locator('button[data-source="林儿"]')).toHaveCount(0);
 await chooser.getByRole('button',{name:'Dùng từ điển trên máy',exact:true}).click();
 await expect(chooser.locator('button[data-source="林儿"]')).toBeVisible();
 await chooser.locator('button[data-source="林儿"]').click();
 await expect(page.getByRole('dialog',{name:'Chỉnh Name',exact:true})).toBeVisible();
});

test('a long source paragraph uses a bounded excerpt without splitting Unicode',async({page})=>{
 await seed(page);
 await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.chapters.update('name-ai-1',{text:'😀天空中没有光亮。'.repeat(100)+'林儿打开门。'});});
 const sent:string[]=[];
 await page.route('**/api/convert/name',async r=>{
  if(r.request().method()==='GET')return r.fallback();
  const {text,names}=r.request().postDataJSON();sent.push(text);
  const engine=new LanguageEngine();engine.add('vp','林儿=Lâm Nhi');const tokens=engine.convert(text,names,{reference:true,standardizePunctuation:true,capitalize:true});
  return r.fulfill({json:{version:'test-name-1',tokens,lookup:engine.lookup(text),lookups:tokens.filter(t=>t.source.trim()).map(t=>({source:t.source,...engine.lookup(t.source)}))}});
 });
 await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:'Trời tối. Lâm Nhi mở cửa.',model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:10,outputTokens:10}}));
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();const paragraph=page.locator('.prose [data-paragraph="0"]');await expect(paragraph).toContainText('Lâm Nhi');
 await paragraph.evaluate(el=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node:Node|null,last:Node|null=null;while((node=walker.nextNode()))last=node;if(last){const range=document.createRange();range.setStart(last,last.textContent!.length);range.collapse(true);getSelection()!.removeAllRanges();getSelection()!.addRange(range);}el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));});
 const chooser=page.getByRole('dialog',{name:'Chọn cụm từ',exact:true});await expect(chooser.locator('button[data-source="林儿"]')).toBeVisible();
 expect(sent).toHaveLength(1);expect(sent[0].length).toBeLessThanOrEqual(256);expect(sent[0]).toContain('林儿');expect(sent[0]).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
});

test('expanding a word requests the full phrase lookup without closing the chooser',async({page})=>{
 await seed(page);const requests:any[]=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/convert/name'&&request.method()==='POST')requests.push(request.postDataJSON());});
 await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:'Lâm Nhi mở cửa.',model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:10,outputTokens:10}}));
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lâm Nhi mở cửa.');
 await page.locator('.prose [data-paragraph="0"]').dblclick();const chooser=page.getByRole('dialog',{name:'Chọn cụm từ',exact:true});await chooser.locator('button[data-source="林儿"]').click();
 const popup=page.getByRole('dialog',{name:'Chỉnh Name',exact:true});await popup.getByRole('button',{name:'Mở rộng sang phải',exact:true}).click();
 await expect(popup.getByLabel('Chữ Trung',{exact:true})).toHaveValue('林儿打开门');await expect.poll(()=>requests.some(request=>request.includeLookup===true&&request.text==='林儿打开门')).toBe(true);await expect(chooser).toBeVisible();
});

test('outside click or tap dismisses the chooser, but inside clicks and nested editing do not',async({page,isMobile})=>{
 await seed(page);let translations=0;
 await page.route('**/api/ai/translate',r=>{translations++;return r.fulfill({json:{result:'Lâm Nhi mở cửa.',model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:10,outputTokens:10}});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Lâm Nhi mở cửa.');
 await page.locator('.prose [data-paragraph="0"]').dblclick();const chooser=page.getByRole('dialog',{name:'Chọn cụm từ',exact:true});await expect(chooser).toBeVisible();
 await chooser.getByRole('heading',{name:'Chọn cụm từ',exact:true}).click();await expect(chooser).toBeVisible();
 const heading=await chooser.getByRole('heading',{name:'Chọn cụm từ',exact:true}).boundingBox();expect(heading).not.toBeNull();
 await page.mouse.move(heading!.x+8,heading!.y+8);await page.mouse.down();await page.mouse.move(5,5);await page.mouse.up();await expect(chooser).toBeVisible();
 await chooser.locator('button[data-source="林儿"]').click();const popup=page.getByRole('dialog',{name:'Chỉnh Name',exact:true});await expect(popup).toBeVisible();
 await page.mouse.click(5,5);await expect(popup).toHaveCount(0);await expect(chooser).toBeVisible();
 const backdrop=chooser.locator('..');if(isMobile)await backdrop.tap({position:{x:5,y:5}});else await backdrop.click({position:{x:5,y:5}});
 await expect(chooser).toHaveCount(0);await expect(page.locator('.prose')).toContainText('Lâm Nhi mở cửa.');expect(translations).toBe(1);
});

test('cached part boundaries find the source after AI merges paragraphs without extra AI calls or controls',async({page})=>{
 await seed(page);let aiCalls=0;const excerpts:string[]=[];
 await page.route('**/api/ai/translate',r=>{aiCalls++;return r.fulfill({status:503});});
 await page.route('**/api/convert/name',r=>{if(r.request().method()==='POST')excerpts.push(r.request().postDataJSON().text);return r.fallback();});
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts'),{writeAiReadingCache}=await import('/src/features/ai/services/ai-reading-cache.ts');
  const text='甲\n乙\n丙\n林儿打开门。\n戊\n己',first='Nội dung ba đoạn đầu đã được gộp thành một đoạn.',second='Lâm Nhi mở cửa.\nĐoạn sau.\nKết thúc.',result=first+'\n'+second;
  await db.chapters.update('name-ai-1',{text});
  const {readReaderAiPreferences}=await import('/src/features/ai/types/ai-reader-settings.ts'),{recommendedFallbackModels}=await import('/src/features/ai/services/ai-fallback.ts');const base=(await readReaderAiPreferences('name-ai')).settings,settings={...base,fallbackModels:recommendedFallbackModels(base.model)};return await writeAiReadingCache({bookId:'name-ai',id:'name-ai-1',revision:1,text},settings,[],{result,model:settings.model,finishReason:'STOP',inputTokens:1,outputTokens:1,textMap:{version:1,sourceLength:text.length,spans:[{sourceStart:0,sourceEnd:6,translatedStart:0,translatedEnd:first.length},{sourceStart:6,sourceEnd:text.length,translatedStart:first.length+1,translatedEnd:result.length}]}});
 })).toBe(true);
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 for(let i=0;i<2;i++){
  if(i)await page.reload();
  const paragraph=page.locator('.prose [data-paragraph]').filter({hasText:'Lâm Nhi mở cửa.'});await expect(paragraph).toBeVisible();await paragraph.dblclick();
  const chooser=page.getByRole('dialog',{name:'Chọn cụm từ',exact:true});await expect(chooser.locator('button[data-source="林儿"]')).toBeVisible();
  expect(excerpts.at(-1)).toBe('林儿打开门。');await expect(chooser.getByRole('button',{name:/trước|sau/})).toHaveCount(0);await chooser.getByRole('button',{name:'Đóng',exact:true}).click();
 }
 expect(aiCalls).toBe(0);
});
