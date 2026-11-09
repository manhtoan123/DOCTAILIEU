import {test,expect,type Page} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';
import {readFileSync} from 'node:fs';
test.beforeEach(async({page})=>{if(process.env.AI_LATENCY_BUILT_PREVIEW==='1'){const body=readFileSync('.dsh-tmp/ai-latency-impl/fixture-bridge.js','utf8');await page.route('**/src/**',r=>r.fulfill({contentType:'application/javascript',body}));}});
const book='ai-parts-book',chapter='ai-parts-chapter',raw='甲'.repeat(1800)+'乙'.repeat(1800)+'丙'.repeat(1800),translated=['Phần một đã hoàn thành.','Phần hai đã hoàn thành.','Phần ba đã hoàn thành.'];
const complete=(text:string,model:string)=>({result:text,model,finishReason:'STOP',inputTokens:10,outputTokens:10});
function gate(){let release!:()=>void;const promise=new Promise<void>(r=>{release=r;});return {promise,release};}
async function seed(page:Page,epub=false,text=raw){
 await page.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('/prompts')?{revision:0,rows:[]}:r.request().url().includes('/state')?{revision:0,payload:null}:r.request().url().includes('dictionaries')?{dictionaries:[]}:{books:[],ids:[],cursor:null,keys:[]}}));
 await page.goto('/');await page.evaluate(async({book,chapter,text,epub})=>{
  const{db}=await import('/src/core/db.ts');const{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');
  await db.settings.put({key:'reader-options',value:{autoNext:false,preloadAi:false}});await db.settings.put({key:`ai-book-settings:${book}`,value:{...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[],splitParts:true}});
  await db.books.put({id:book,title:'Dịch từng phần',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:text.length});
  const nodes=['甲'.repeat(31900),'乙'.repeat(31900),'丙'.repeat(31900)];
  await db.chapters.put({id:chapter,bookId:book,title:'Chương kiểm tra',order:0,text,revision:1,sourceId:'',...(epub?{epub:{path:'one.xhtml',body:`<body><p><em>${nodes[0]}</em></p><p>${nodes[1]}</p><p>${nodes[2]}</p></body>`,styles:['em{font-style:italic}'],nodes}}: {})});
 },{book,chapter,text,epub});await page.goto(`/read/${book}/${chapter}`);await expect(page.locator('.reader-book-heading h1')).toHaveText('Dịch từng phần');
}
async function cache(page:Page){return page.evaluate(async()=>{const{db}=await import('/src/core/db.ts');const chapters=await db.chapters.toArray();if(chapters.length!==1)throw Error('Expected exactly one isolated synthetic chapter');return {full:await db.settings.where('key').startsWith('ai-reading-cache:v1:').count(),parts:await db.settings.where('key').startsWith('ai-reading-cache:parts:v1:').count(),raw:chapters[0].text};});}
test('out-of-order responses show a contiguous preview, cap concurrency and allow listening the translated prefix',async({page})=>{
 await seed(page);const held=gate();let active=0,max=0,tts=0;const calls:number[]=[];
 await page.route('**/api/tts/**',r=>{tts++;return r.fulfill({status:503});});
 await page.route('**/api/ai/translate',async r=>{const input=r.request().postDataJSON(),part='甲乙丙'.indexOf(input.text[0]);calls.push(part);max=Math.max(max,++active);if(part===1)await held.promise;active--;await r.fulfill({headers:{'X-AI-Parallel':'2'},json:complete(translated[part],input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.getByLabel('Tiến độ dịch chương')).toContainText('Đã xong 2/3 phần');
 await expect(page.locator('.prose')).toContainText(translated[0]);await expect(page.locator('.prose')).not.toContainText(translated[2]);expect(max).toBe(2);expect(calls).toEqual([0,1,2]);
 const state=await cache(page);expect(state.full).toBe(0);expect(state.raw).toBe(raw);
 await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();await expect(page.getByRole('button',{name:'▶ Nghe CapCut',exact:true})).toBeEnabled();expect(tts).toBe(0);
 held.release();await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);await expect(page.locator('.prose [data-paragraph]')).toHaveText(translated);await expect(page.getByLabel('Tiến độ dịch chương')).toHaveCount(0);
 expect((await cache(page)).full).toBe(1);expect(tts).toBe(0);
});
test('reload resumes persisted completed parts after an error without overwriting source',async({page})=>{
 await seed(page);let failing=true;const calls:number[]=[];
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON(),part='甲乙丙'.indexOf(input.text[0]);calls.push(part);return part===1&&failing?r.fulfill({status:403,json:{error:'ai_auth_error'}}):r.fulfill({headers:{'X-AI-Parallel':'2'},json:complete(translated[part],input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.getByRole('button',{name:'Tiếp tục phần còn thiếu',exact:true})).toBeVisible();await expect.poll(async()=>(await cache(page)).parts).toBe(2);expect((await cache(page)).full).toBe(0);
 failing=false;await page.reload();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);await expect(page.locator('.prose [data-paragraph]')).toHaveText(translated);expect(calls.filter(p=>p===0)).toHaveLength(1);expect(calls.filter(p=>p===2)).toHaveLength(1);expect(calls.filter(p=>p===1)).toHaveLength(2);expect((await cache(page)).raw).toBe(raw);
});
test('stop and immediate retry retain the completed prefix and ignore aborted late results',async({page})=>{
 await seed(page);const held=gate();let retry=false;const calls:number[]=[];
 await page.route('**/api/ai/translate',async r=>{const input=r.request().postDataJSON(),part='甲乙丙'.indexOf(input.text[0]),old=!retry;calls.push(part);if(part>0&&old)await held.promise;await r.fulfill({headers:{'X-AI-Parallel':'2'},json:complete(part>0&&old?'KẾT QUẢ CŨ':translated[part],input.model)}).catch(()=>{});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>calls.length).toBe(3);await page.getByRole('button',{name:'Dừng chương này',exact:true}).first().click();await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toContainText('Đã dừng');
 retry=true;await page.getByRole('button',{name:'Tiếp tục phần còn thiếu',exact:true}).click();held.release();await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);await expect(page.locator('.prose [data-paragraph]')).toHaveText(translated);await expect(page.locator('.prose')).not.toContainText('KẾT QUẢ CŨ');expect(calls.filter(p=>p===0)).toHaveLength(1);expect((await cache(page)).raw).toBe(raw);
});
test('EPUB preview retains emphasis and resumes only missing node groups',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:503}));await page.goto('/');const held=gate(),nodes=['甲'.repeat(31900),'乙'.repeat(31900),'丙'.repeat(31900)];
 const file=Buffer.from(zipSync({'mimetype':strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),'book.opf':strToU8('<package><metadata><title>Dịch từng phần EPUB</title></metadata><manifest><item id="c" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>'),'one.xhtml':strToU8(`<html xmlns="http://www.w3.org/1999/xhtml"><head><style>em{font-style:italic}</style></head><body><p><em>${nodes[0]}</em></p><p>${nodes[1]}</p><p>${nodes[2]}</p></body></html>`)}));
 await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();await page.getByLabel(/^(Chọn|Đổi) file$/).setInputFiles({name:'Parts.epub',mimeType:'application/epub+zip',buffer:file});await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();await expect(page.frameLocator('iframe').locator('em')).toContainText('甲');
 await page.evaluate(async()=>{const{db}=await import('/src/core/db.ts');const{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');const chapters=await db.chapters.toArray();if(chapters.length!==1)throw Error('Expected exactly one isolated synthetic chapter');await db.settings.put({key:'reader-options',value:{autoNext:false,preloadAi:false}});await db.settings.put({key:`ai-book-settings:${chapters[0].bookId}`,value:{...AI_DEFAULTS,model:'gemini-2.5-flash',fallbackModels:[],splitParts:false}});});await page.reload();const original=(await cache(page)).raw;
 await page.route('**/api/ai/translate',async r=>{const input=r.request().postDataJSON(),row=JSON.parse(input.text),id=Object.keys(row)[0];if(id==='1')await held.promise;await r.fulfill({headers:{'X-AI-Parallel':'2'},json:complete(JSON.stringify({[id]:translated[Number(id)]}),input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.getByLabel('Tiến độ dịch chương')).toContainText('Đã xong 2/3 phần');const frame=page.frameLocator('iframe');await expect(frame.locator('em')).toHaveText(translated[0]);await expect(frame.locator('body')).not.toContainText(translated[2]);expect((await cache(page)).full).toBe(0);
 held.release();await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);await expect(frame.locator('em')).toHaveText(translated[0]);await expect(frame.locator('body')).toContainText(translated[2]);expect((await cache(page)).raw).toBe(original);
});
test('TXT longer than the previous 32k limit is proactively split and fully assembled',async({page})=>{
 const long='甲'.repeat(32401);await seed(page,false,long);let calls=0;
 await page.route('**/api/ai/translate',r=>{calls++;const input=r.request().postDataJSON();expect(input.text.length).toBeLessThanOrEqual(32000);return r.fulfill({headers:{'X-AI-Parallel':'2'},json:complete('V'.repeat(input.text.length),input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(async()=>(await cache(page)).full).toBe(1);expect(calls).toBeGreaterThan(2);await expect(page.locator('.reader-convert-status:not(.ai-model-notice)')).toHaveCount(0);await expect.poll(async()=>(await page.locator('.prose [data-paragraph]').allTextContents()).join('').replaceAll(/\s/g,'')==='V'.repeat(long.length)).toBe(true);expect((await cache(page)).raw===long).toBe(true);
});

test('an ordinary chapter under the output budget stays whole and publishes only a complete result',async({page})=>{
 const text='甲'.repeat(1600);await seed(page,false,text);const held=gate();let calls=0;
 await page.route('**/api/ai/translate',async r=>{calls++;const input=r.request().postDataJSON();expect(input.text).toBe(text);expect(input.continuation).toBeUndefined();await held.promise;await r.fulfill({json:complete('Bản dịch nguyên chương.',input.model)});});
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>calls).toBe(1);await expect(page.getByLabel('Tiến độ dịch chương')).toHaveCount(0);expect((await cache(page)).full).toBe(0);held.release();await expect(page.locator('.prose')).toContainText('Bản dịch nguyên chương.');expect(calls).toBe(1);expect((await cache(page)).raw).toBe(text);await expect.poll(async()=>(await cache(page)).full).toBe(1);
});
