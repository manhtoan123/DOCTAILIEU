import {test,expect} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';
import type {AiLogEvent,AiLogResponse} from '../src/shared/types/ai-log';
const now=Date.parse('2026-10-28T12:00:00Z'),startedAt=Date.parse('2026-10-28T01:30:00Z');
const event=(i:number,patch:Partial<AiLogEvent>={}):AiLogEvent=>({id:`request:${i.toString().padStart(8,'0')}-1111-4111-8111-111111111111`,kind:'request',model:'gemini-2.5-flash',status:'success',sourceChars:1000,startedAt,updatedAt:startedAt+10000,durationMs:10000,attempts:1,upstream:[{status:200,durationMs:10}],...patch});
const fixture:AiLogResponse={serverNow:now,earliest:startedAt,limit:5000,retentionDays:30,rows:[
 event(1,{upstream:[{status:429,errorCode:'ai_rate_limited',durationMs:5},{status:200,durationMs:10}]}),event(2,{durationMs:20000}),
 event(3,{status:'error',errorCode:'ai_incomplete_result',reason:'output_limit'}),
 event(4,{status:'cancelled',errorCode:'ai_cancelled'}),
 event(5,{id:'chapter:00000005-1111-4111-8111-111111111111',kind:'chapter',model:'unknown',durationMs:30000,upstream:undefined}),
 event(6,{id:'chapter:00000006-1111-4111-8111-111111111111',kind:'chapter',model:'unknown',status:'cache',upstream:undefined}),
]};
test.beforeEach(async({context})=>{await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'isolated synthetic fixture'}}));});
for(const theme of ['light','sepia','dark'])test(`shared AI journal works with ${theme} theme, filters and precise counts`,async({page},info)=>{
 await page.route('**/api/ai/logs',r=>r.fulfill({json:fixture}));
 await page.goto('/');await expect(page.getByRole('button',{name:'Thêm truyện',exact:true})).toBeVisible();
 await page.evaluate(async theme=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('thu-phong-v1');r.onsuccess=()=>resolve(r.result);});await new Promise<void>(resolve=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({key:'reader',value:{theme}});tx.oncomplete=()=>resolve();});db.close();},theme);
 await page.goto('/settings/ai-log');await expect(page.getByRole('heading',{name:'Nhật ký dịch AI',exact:true})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-ui-theme',theme);
 const models=page.getByRole('region',{name:'Thống kê request theo model',exact:true});
 await expect(models.getByRole('row').filter({hasText:'gemini-2.5-flash'})).toContainText('66,7%');
 await expect(models.getByRole('row').filter({hasText:'gemini-2.5-flash'})).toContainText('33,3%');
 const journal=page.getByRole('region',{name:'Nhật ký sự kiện gần đây',exact:true});await expect(journal).toContainText('08:30:00');
 await page.getByRole('combobox',{name:'Model',exact:true}).selectOption('gemini-2.5-flash');await expect(journal).not.toContainText('Cache');
 await page.getByRole('combobox',{name:'Model',exact:true}).selectOption('');await expect(journal).toContainText('Cache');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath(`ai-log-${theme}.png`),fullPage:true});
});
test('empty journal is honest and a later refresh failure preserves clearly stale data',async({page})=>{
 let unavailable=false;
 await page.route('**/api/ai/logs',r=>unavailable?r.fulfill({status:503,json:{error:'ai_log_unavailable'}}):r.fulfill({json:{...fixture,rows:[]}}));
 await page.goto('/settings/ai-log');await expect(page.getByRole('heading',{name:'Nhật ký dịch AI',exact:true})).toBeVisible();
 await expect(page.getByText(/Chưa có dữ liệu|Chưa có sự kiện/).first()).toBeVisible();
 unavailable=true;await page.getByRole('button',{name:'Làm mới',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Chưa tải được');
 await expect(page.getByText(/snapshot|ảnh chụp|lần tải trước|dữ liệu trước/i).first()).toBeVisible();
});
test('v2 shows linked work, effective configuration and actual foreground wait separately',async({page})=>{
 const workId='11111111-1111-4111-8111-111111111111';
 const trace={workId,partPath:'0',purpose:'foreground' as const,initialPurpose:'prewarm' as const,fallbackIndex:0};
 const request=event(20,{schemaVersion:2,telemetry:{metricVersion:1,trace,context:{format:'txt',appVersion:'obs-v2',policyVersion:'p1',validationVersion:'c1',strategy:'whole'},server:{execution:{version:1,model:'gemini-2.5-flash',temperature:0,thinking:'provider-default',maxOutputTokens:8192,promptId:'a'.repeat(64)},timing:{clock:'server-monotonic',completeMs:12000,firstChunkMs:1000}}}});
 const chapter=event(21,{id:`chapter:${workId}`,kind:'chapter',durationMs:12000,schemaVersion:2,telemetry:{metricVersion:1,trace,client:{timing:{epoch:workId,sequence:1,foregroundMs:10000,acceptedContentVisibleMs:12000,workCompleteMs:12000,foregroundAcceptedMs:2000,foregroundCompleteMs:2000},leafParts:1,acceptedLeafParts:1,validation:'accepted',recovery:'none',completeness:'observed'}}});
 await page.route('**/api/ai/logs',r=>r.fulfill({json:{...fixture,schemaVersions:[1,2],rows:[request,chapter]}}));
 await page.goto('/settings/ai-log');const analysis=page.getByRole('region',{name:'Phân tích quy trình dịch',exact:true});
 await expect(analysis.locator('.ai-log-summary>span').filter({hasText:'Chờ từ lúc mở chương'})).toContainText('2 s');
 await expect(analysis.locator('.ai-log-summary>span').filter({hasText:'Hoàn tất công việc'})).toContainText('12 s');
 await analysis.getByText(/Nhóm so sánh tương đương \(/).click();await expect(analysis.getByRole('region',{name:'Nhóm so sánh tương đương',exact:true})).toContainText('aaaaaaaaaaaa');
 await analysis.getByText(/Chuỗi công việc và phục hồi \(/).click();await expect(analysis.getByRole('region',{name:'Chuỗi công việc',exact:true})).toContainText('11111111');
});
test('EPUB accepted visibility waits for its current frame ready message',async({page})=>{
 const reports:AiLogEvent[]=[];
 await page.route('**/api/ai/logs',r=>{if(r.request().method()==='POST'){reports.push(r.request().postDataJSON());return r.fulfill({json:{ok:true}});}return r.fulfill({json:{...fixture,rows:[],schemaVersions:[1,2]}});});
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON(),nodes=JSON.parse(input.text);return r.fulfill({json:{result:JSON.stringify(Object.fromEntries(Object.keys(nodes).map((k,i)=>[k,`Bản dịch tổng hợp ${i}`]))),model:input.model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await page.addInitScript(()=>{(window as any).__frameMessages=[];window.addEventListener('message',event=>{if((window as any).__holdFrames&&event.data?.ready&&event.data?.epub){event.stopImmediatePropagation();(window as any).__frameMessages.push({data:event.data,source:event.source});}},true);});
 const fixtureZip=Buffer.from(zipSync({'mimetype':strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),'book.opf':strToU8('<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Khung EPUB tổng hợp</dc:title></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>'),'c.xhtml':strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>合成章节</h1><p>这是合成测试文本，不是真实用户数据。</p></body></html>')}));
 await page.goto('/');await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();await page.getByLabel(/^(Chọn|Đổi) file$/).setInputFiles({name:'visibility.epub',mimeType:'application/epub+zip',buffer:fixtureZip});await page.getByRole('button',{name:'Nhập truyện',exact:true}).click();
 await expect(page.frameLocator('.epub-frame').locator('h1')).toContainText('合成章节');
 await page.evaluate(()=>{(window as any).__holdFrames=true;});await page.getByRole('button',{name:'Dịch AI',exact:true}).click();
 await expect.poll(()=>reports.filter(r=>r.schemaVersion===2&&r.kind==='chapter'&&r.status==='success').length).toBeGreaterThan(0);
 expect(reports.filter(r=>r.kind==='chapter').at(-1)?.telemetry?.client?.timing.acceptedContentVisibleMs).toBeUndefined();
 await expect.poll(()=>page.evaluate(()=>(window as any).__frameMessages.length)).toBeGreaterThan(0);
 await page.evaluate(()=>{(window as any).__holdFrames=false;for(const e of (window as any).__frameMessages)window.dispatchEvent(new MessageEvent('message',e));});
 await expect.poll(()=>reports.filter(r=>r.kind==='chapter').at(-1)?.telemetry?.client?.timing.acceptedContentVisibleMs).toBeGreaterThanOrEqual(0);
});
