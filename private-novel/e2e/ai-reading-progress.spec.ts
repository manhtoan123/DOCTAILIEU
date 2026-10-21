import {test,expect,type Page,type BrowserContext} from '@playwright/test';
const book='31000000-0000-4000-8000-000000000001',ids=[0,1,2].map(i=>'32000000-0000-4000-8000-00000000000'+i),texts=['甲','乙','丙'].map(s=>s.repeat(80));
const answer=(input:any,result='Bản dịch '+texts.findIndex(s=>s===input.text))=>({model:input.model,result,finishReason:'STOP',inputTokens:1,outputTokens:1});
const store=()=>({revision:0,rows:new Map<string,any>()});
async function connect(context:BrowserContext,server:ReturnType<typeof store>,transport={online:true}){
 await context.route('**/api/**',r=>r.fulfill({status:503}));
 await context.route('**/api/cloud/**',r=>r.fulfill({json:r.request().url().includes('dictionaries')?{version:1,dictionaries:[]}:{books:[],ids:[],cursor:null,public:true}}));
 await context.route('**/api/prompts**',r=>r.fulfill({json:{revision:0,rows:[]}}));
 await context.route(/\/api\/state(?:\?|$)/,r=>{
  if(!transport.online)return r.abort('internetdisconnected');const req=r.request(),url=new URL(req.url());
  if(req.method()==='GET'){const scope=url.searchParams.get('book')??'',after=Number(url.searchParams.get('after')??0),rows=[...server.rows.values()].filter(row=>(row.record.bookId??'')===scope&&row.revision>after).sort((a,b)=>a.revision-b.revision);return r.fulfill({json:{rows,cursor:server.revision,more:false}});}
  const input=req.postDataJSON(),old=server.rows.get(input.id);if((old?.revision??0)!==input.baseRevision)return r.fulfill({status:409,json:{row:old}});const row={id:input.id,record:input.record,revision:++server.revision};server.rows.set(input.id,row);return r.fulfill({json:{row}});
 });
 await context.route('**/api/ai/translate',r=>r.fulfill({json:answer(r.request().postDataJSON())}));
}
async function seed(page:Page,preload=false,hybrid=false){
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.evaluate(async({book,ids,texts,preload,hybrid})=>{const {db}=await import('/src/core/db.ts'),{AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');
  await db.books.put({id:book,title:'Mốc AI đồng bộ',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:3,charCount:240});
  await db.chapters.bulkPut(ids.map((id,i)=>({bookId:book,id,order:i,title:'Chương '+(i+1),text:hybrid&&i===1?'乙'.repeat(1800)+'丙'.repeat(1800):texts[i],revision:1,sourceId:'original'})));
  await db.settings.put({key:'reader-options',value:{preloadAi:preload,autoNext:false}});await db.settings.put({key:'ai-book-settings:'+book,value:{...AI_DEFAULTS,model:'gemini-2.5-flash',...(hybrid?{hybrid:{version:1,liteModel:'gemini-3.5-flash-lite',rules:''}}:{})}});
  await db.progress.put({bookId:book,chapterId:ids[0],paragraph:0,offset:0,revision:1,updatedAt:1});
 },{book,ids,texts,preload,hybrid});
}
const progress=(page:Page)=>page.evaluate(async book=>{const {db}=await import('/src/core/db.ts');return db.progress.get(book);},book);
async function sync(page:Page){await page.evaluate(async()=>{const {syncSharedState}=await import('/src/features/sync-cloud/services/shared-state-sync.ts');await syncSharedState();await syncSharedState();});}

test('offline AI + completed prewarm sync to another device; old cursor/reader do not rewind or jump',async({page,browser})=>{
 const server=store(),transport={online:true},otherContext=await browser.newContext({viewport:page.viewportSize()!});let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 try{
  await connect(page.context(),server,transport);await connect(otherContext,server);await seed(page,true);await sync(page);const other=await otherContext.newPage();await seed(other);await sync(other);
  await other.evaluate(async({book,chapterId})=>{const {writeTtsCursor,ttsHash}=await import('/src/features/tts/services/tts-cursor.ts');writeTtsCursor({version:1,bookId:book,chapterId,revision:1,mode:'raw',sourceHash:await ttsHash('甲'.repeat(80)),semanticHash:'b'.repeat(64),renderedHash:'c'.repeat(64),voiceId:'tiktok-female-1',rate:1,offset:0,audioTime:0,updatedAt:Date.now()+60000});},{book,chapterId:ids[0]});
  await other.goto(`/read/${book}/${ids[0]}`,{waitUntil:'domcontentloaded'});transport.online=false;
  await page.route('**/api/ai/translate',async r=>{const input=r.request().postDataJSON();if(input.text===texts[1])await gate;await r.fulfill({json:answer(input)});});
  await page.goto(`/read/${book}/${ids[0]}`,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Bản dịch 0');await expect.poll(async()=> (await progress(page))?.mode).toBe('ai');expect((await progress(page))?.chapterId).toBe(ids[0]);
  release();await expect.poll(async()=> (await progress(page))?.chapterId).toBe(ids[1]);await expect(page.locator('.prose')).toContainText('Bản dịch 0');expect(page.url()).toContain(ids[0]);
  transport.online=true;await sync(page);await sync(other);await expect.poll(async()=> (await progress(other))?.chapterId).toBe(ids[1]);expect((await progress(other))?.mode).toBe('ai');expect(other.url()).toContain(ids[0]);
  await other.goto(`/book/${book}`,{waitUntil:'domcontentloaded'});await expect(other.locator('.story-progress')).toContainText('Chương 2');
  await other.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.settings.put({key:'reader-options',value:{preloadAi:false,autoNext:false}});});
  await other.getByRole('button',{name:'Đọc tiếp',exact:true}).click();await expect(other).toHaveURL(new RegExp(ids[1]));await expect(other.locator('.prose')).toContainText('Bản dịch 1');
  await other.getByRole('button',{name:'Bản gốc',exact:true}).click();await other.goto(`/read/${book}/${ids[0]}`,{waitUntil:'domcontentloaded'});await expect(other.locator('.prose')).toContainText('甲');await other.goto('/',{waitUntil:'domcontentloaded'});expect((await progress(other))?.chapterId).toBe(ids[1]);
 }finally{release();await otherContext.close();}
});

test('Convert keeps its current page while successful background AI advances the bookmark',async({page})=>{
 await connect(page.context(),store());await seed(page,true);await page.evaluate(async id=>{const {db}=await import('/src/core/db.ts');await db.chapters.update(id,{text:'CURRENT'});},ids[0]);await page.goto(`/read/${book}/${ids[0]}`,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('CURRENT');const before=await page.locator('.prose').innerText();
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(async()=> (await progress(page))?.chapterId).toBe(ids[1]);expect(await page.locator('.prose').innerText()).toBe(before);expect(page.url()).toContain(ids[0]);
});

test('a hybrid prefix is not a completed chapter; only successful second half advances progress',async({page})=>{
 await connect(page.context(),store());await seed(page,false,true);let fail=true;
 await page.route('**/api/ai/translate',r=>{const input=r.request().postDataJSON();return input.continuation&&fail?r.fulfill({status:403,json:{error:'ai_auth_error'}}):r.fulfill({json:answer(input,input.continuation?'Nửa sau hoàn tất.':'Nửa đầu đã dịch.')} );});
 await page.goto(`/read/${book}/${ids[1]}`,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.getByRole('button',{name:'Tiếp tục phần còn thiếu',exact:true})).toBeVisible();await expect(page.locator('.prose')).toContainText('Nửa đầu đã dịch.');expect((await progress(page))?.mode).not.toBe('ai');
 fail=false;await page.getByRole('button',{name:'Tiếp tục phần còn thiếu',exact:true}).click();await expect(page.locator('.prose')).toContainText('Nửa sau hoàn tất.');await expect.poll(async()=> (await progress(page))?.chapterId).toBe(ids[1]);expect((await progress(page))?.mode).toBe('ai');
});
