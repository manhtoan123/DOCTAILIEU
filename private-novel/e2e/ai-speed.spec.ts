import {test,expect,type Page} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';
const book='speed-ui-book',chapter='speed-ui-chapter',model='gemini-2.5-flash';
const raw='甲'.repeat(900)+'乙'.repeat(900);
const answer=(result:string,model:string)=>({result,model,finishReason:'STOP',inputTokens:2,outputTokens:3});
async function isolate(page:Page){await page.route('**/api/**',route=>route.fulfill({status:503}));await page.goto('/',{waitUntil:'domcontentloaded'});}
async function seed(page:Page,text=raw,next?:string){
 await isolate(page);await page.evaluate(async({book,chapter,text,next,model})=>{
  const {db}=await import('/src/core/db.ts'),{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');
  await db.settings.put({key:'reader-options',value:{autoNext:false,preloadAi:!!next}});await db.settings.put({key:`ai-book-settings:${book}`,value:{...AI_DEFAULTS,model}});
  await db.books.put({id:book,title:'Kiểm tra phục hồi AI',author:'',status:'ready',createdAt:1,updatedAt:1,charCount:text.length+(next?.length??0),chapterCount:next?2:1});
  await db.chapters.put({id:chapter,bookId:book,title:'Chương kiểm tra',order:0,text,revision:1,sourceId:''});if(next)await db.chapters.put({id:chapter+'-next',bookId:book,title:'Chương tiếp',order:1,text:next,revision:1,sourceId:''});
 },{book,chapter,text,next,model});await page.goto(`/read/${book}/${chapter}`,{waitUntil:'domcontentloaded'});await expect(page.locator('.reader-book-heading h1')).toHaveText('Kiểm tra phục hồi AI');
}
async function stored(page:Page){return page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');const source=await db.chapters.get(decodeURIComponent(location.pathname.split('/')[3]));return {raw:source?.text,rows:await db.settings.where('key').startsWith('ai-reading-cache:').toArray(),model:(await db.settings.get(`ai-book-settings:${source?.bookId}`))?.value};});}

test('TXT reload keeps a validated split child and sends only its missing sibling',async({page})=>{
 await seed(page);let fail=true;const calls:string[]=[];
 await page.route('**/api/ai/translate',route=>{const input=route.request().postDataJSON();calls.push(input.text);if(input.text.length===1800)return route.fulfill({status:502,headers:{'X-AI-Failure-Reason':'output_limit'},json:{error:'ai_incomplete_result'}});if(input.text[0]==='乙'&&fail)return route.fulfill({status:403,json:{error:'ai_auth_error'}});return route.fulfill({json:answer(input.text[0]==='甲'?'Nửa đầu đã dịch.':'Nửa sau đã dịch.',input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.getByRole('button',{name:'Thử lại AI',exact:true})).toBeVisible();await expect.poll(async()=>(await stored(page)).rows.some(row=>(row.value as {partId?:string}).partId==='0/0')).toBe(true);
 const firstCalls=calls.length;fail=false;await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);await expect(page.locator('.prose [data-paragraph]')).toHaveText(['Nửa đầu đã dịch.','Nửa sau đã dịch.']);expect(calls.slice(firstCalls)).toEqual(['乙'.repeat(900)]);expect((await stored(page)).raw).toBe(raw);
});

test('EPUB reload restores split singleton mapping and original emphasis',async({page})=>{
 await isolate(page);const file=Buffer.from(zipSync({'mimetype':strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),'book.opf':strToU8('<package><metadata><title>EPUB phục hồi AI</title></metadata><manifest><item id="c" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>'),'one.xhtml':strToU8(`<html xmlns="http://www.w3.org/1999/xhtml"><head><style>em{font-style:italic}</style></head><body><p><em>${raw}</em></p></body></html>`)}));
 await page.getByRole('button',{name:/Thêm truyện TXT/}).click();await page.getByLabel('Chọn file TXT hoặc EPUB').setInputFiles({name:'Speed.epub',mimeType:'application/epub+zip',buffer:file});await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.frameLocator('iframe').locator('em')).toContainText('甲');
 await page.evaluate(async model=>{const {db}=await import('/src/core/db.ts'),{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');await db.settings.put({key:'reader-options',value:{autoNext:false,preloadAi:false}});await db.settings.put({key:`ai-book-settings:${decodeURIComponent(location.pathname.split('/')[2])}`,value:{...AI_DEFAULTS,model}});},model);await page.reload({waitUntil:'domcontentloaded'});const original=(await stored(page)).raw;let fail=true;const calls:string[]=[];
 await page.route('**/api/ai/translate',route=>{const input=route.request().postDataJSON(),row=JSON.parse(input.text),id=Object.keys(row)[0],text=row[id] as string;calls.push(id);if(text.length===1800)return route.fulfill({status:502,headers:{'X-AI-Failure-Reason':'output_limit'},json:{error:'ai_incomplete_result'}});if(text[0]==='乙'&&fail)return route.fulfill({status:403,json:{error:'ai_auth_error'}});return route.fulfill({json:answer(JSON.stringify({[id]:text[0]==='甲'?'Trái.':'Phải.'}),input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.getByRole('button',{name:'Thử lại AI',exact:true})).toBeVisible();const firstCalls=calls.length;fail=false;await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);await expect(page.frameLocator('iframe').locator('em')).toHaveText('Trái.Phải.');expect(calls.slice(firstCalls)).toEqual(['0/1']);expect((await stored(page)).raw).toBe(original);
});

test('both active workers hitting quota recover serially and show shared waiting state',async({page})=>{
 await seed(page,'甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800)+'丁'.repeat(1800));const attempts=new Map<string,number>();let quota=false,active=0,maxAfter=0;
 await page.route('**/api/ai/translate',async route=>{const input=route.request().postDataJSON(),id=input.text[0],attempt=attempts.get(id)??0;attempts.set(id,attempt+1);if((id==='乙'||id==='丙')&&!attempt){quota=true;return route.fulfill({status:429,headers:{'Retry-After':'2'},json:{error:'ai_rate_limited'}});}active++;if(quota)maxAfter=Math.max(maxAfter,active);await new Promise(resolve=>setTimeout(resolve,80));active--;return route.fulfill({headers:{'X-AI-Parallel':'2'},json:answer('Dịch '+id,input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.getByLabel('Tiến độ dịch chương')).toContainText('API đang bận');await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);await expect(page.locator('.prose [data-paragraph]')).toHaveText(['Dịch 甲','Dịch 乙','Dịch 丙','Dịch 丁']);expect(maxAfter).toBe(1);expect(attempts.get('甲')).toBe(1);expect(attempts.get('丁')).toBe(1);
});

test('next chapter uses recent validated capacity before its first part returns',async({page})=>{
 await seed(page,'热身','甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800));let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve),calls:string[]=[];
 await page.route('**/api/ai/translate',async route=>{const input=route.request().postDataJSON();calls.push(input.text[0]);if(input.text!=='热身')await held;return route.fulfill({headers:{'X-AI-Parallel':'2'},json:answer(input.text==='热身'?'Chương hiện tại đã dịch.':'Dịch '+input.text[0],input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Chương hiện tại đã dịch.');await expect.poll(()=>calls).toEqual(['热','甲','乙']);release();await expect.poll(()=>calls).toEqual(['热','甲','乙','丙']);
});

test('manual whole-chapter fallback keeps old checkpoints separate and does not overwrite preferred settings',async({page})=>{
 const text='甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800);await seed(page,text);const calls:{model:string;text:string}[]=[];
 await page.route('**/api/ai/translate',route=>{const input=route.request().postDataJSON();calls.push({model:input.model,text:input.text});if(input.model===model&&input.text[0]==='乙')return route.fulfill({status:403,json:{error:'ai_auth_error'}});return route.fulfill({headers:{'X-AI-Parallel':'2'},json:answer(`${input.model} ${input.text[0]}`,input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.getByRole('button',{name:'Tiếp tục phần còn thiếu',exact:true})).toBeVisible();await page.getByRole('button',{name:'Dịch lại bằng Gemini 3 Flash (Preview)',exact:true}).click();await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);await expect(page.locator('.prose [data-paragraph]')).toHaveText(['gemini-3-flash-preview 甲','gemini-3-flash-preview 乙','gemini-3-flash-preview 丙']);
 const state=await stored(page);expect(state.raw).toBe(text);expect((state.model as {model:string}).model).toBe(model);expect(state.rows.some(row=>(row.value as {response:{model:string}}).response.model===model)).toBe(true);expect(calls.filter(call=>call.model==='gemini-3-flash-preview')).toHaveLength(3);
});

test('manual fallback warms the next chapter under preferred settings and navigation sends nothing twice',async({page})=>{
 const text='甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800);await seed(page,text,'NEXT');const nextModels:string[]=[];
 await page.route('**/api/ai/translate',route=>{const input=route.request().postDataJSON();if(input.text==='NEXT'){nextModels.push(input.model);return route.fulfill({headers:{'X-AI-Parallel':'2'},json:answer('Chương sau đúng cài đặt '+input.model,input.model)});}if(input.model===model&&input.text[0]==='乙')return route.fulfill({status:403,json:{error:'ai_auth_error'}});return route.fulfill({headers:{'X-AI-Parallel':'2'},json:answer(`${input.model} ${input.text[0]}`,input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.getByRole('button',{name:'Tiếp tục phần còn thiếu',exact:true})).toBeVisible();await page.getByRole('button',{name:'Dịch lại bằng Gemini 3 Flash (Preview)',exact:true}).click();await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','ready');expect(nextModels).toEqual([model]);
 await page.getByRole('button',{name:'Chương sau →',exact:true}).first().click();await expect(page.locator('.prose')).toContainText('Chương sau đúng cài đặt '+model);expect(nextModels).toEqual([model]);
});

test('automatic prewarm retry preserves one original work ID and sums its calls',async({page})=>{
 await seed(page,'CURRENT','NEXT');await page.clock.install();await page.evaluate(()=>{const rows:unknown[]=[];(window as unknown as {speedMetrics:unknown[]}).speedMetrics=rows;window.addEventListener('reader-ai-metric',event=>rows.push((event as CustomEvent).detail));});let fail=true;
 await page.route('**/api/ai/translate',route=>{const input=route.request().postDataJSON();return input.text==='NEXT'&&fail?route.fulfill({status:503,json:{error:'ai_upstream_error'}}):route.fulfill({headers:input.text==='NEXT'?{'X-AI-Parallel':'2'}:{},json:answer('Đã dịch '+input.text,input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','error');fail=false;await page.clock.fastForward(16000);await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','ready');
 const rows=await page.evaluate(()=>(window as unknown as {speedMetrics:{sourceChars:number;status:string;workId:string;requests:number;attempts:number}[]}).speedMetrics.filter(row=>row.sourceChars===4));expect(rows).toHaveLength(2);expect(rows[0].status).toBe('error');expect(rows[1]).toMatchObject({status:'complete',workId:rows[0].workId,attempts:2,requests:3});
});

test('a next-only Name change followed by a permanent error does not restart translation by itself',async({page})=>{
 await seed(page,'CURRENT','NEXT 林儿');await page.evaluate(async book=>{const {db}=await import('/src/core/db.ts');await db.names.put({id:'next-only-name',bookId:book,key:'林儿',value:'OLD'});},book);await page.clock.install();let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let oldCalls=0,newCalls=0;
 await page.route('**/api/ai/translate',async route=>{const input=route.request().postDataJSON();if(input.names['林儿']==='OLD'){oldCalls++;await held;return route.fulfill({json:answer('OLD STALE',input.model)}).catch(()=>{});}newCalls++;return route.fulfill({status:403,json:{error:'ai_auth_error'}});});
 await page.getByRole('button',{name:'Convert',exact:true}).click();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>oldCalls).toBe(1);await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.names.update('next-only-name',{value:'NEW'});});await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','error');await page.clock.runFor(1500);expect(newCalls).toBe(1);release();await page.clock.runFor(300);await expect(page.locator('.ai-trigger')).toHaveAttribute('data-prewarm','error');expect(newCalls).toBe(1);await expect(page.locator('.prose')).toContainText('CURRENT');await expect(page.locator('.prose')).not.toContainText('OLD STALE');
});
