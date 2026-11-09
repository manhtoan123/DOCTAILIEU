import {test,expect,type Page} from '@playwright/test';
const book='activity-stream-book',chapter='activity-stream-chapter',model='gemma-4-26b-a4b-it',raw='你好';
async function seed(page:Page){
  await page.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('/prompts')?{revision:0,rows:[]}:r.request().url().includes('/state')?{revision:0,payload:null}:{books:[],ids:[],cursor:null,keys:[],dictionaries:[]}}));
  await page.goto('/');await page.evaluate(async({book,chapter,model,raw})=>{
    const {db}=await import('/src/core/db.ts');const {AI_DEFAULTS}=await import('/src/features/ai/services/ai-reading.ts');
    await db.settings.put({key:'reader-options',value:{preloadAi:false}});
    await db.settings.put({key:`ai-book-settings:${book}`,value:{...AI_DEFAULTS,model,fallbackModels:[]}});
    await db.books.put({id:book,title:'Kiểm tra luồng hoạt động AI',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:raw.length});
    await db.chapters.put({id:chapter,bookId:book,title:'Chương thử',order:0,text:raw,revision:1,sourceId:''});
  },{book,chapter,model,raw});await page.goto(`/read/${book}/${chapter}`);await expect(page.locator('.prose')).toContainText(raw);
  await page.clock.install();await page.evaluate(()=>{
    const original=window.fetch.bind(window);const state={calls:0,cancelled:false};(window as unknown as {activityTest:typeof state}).activityTest=state;
    window.fetch=async(input,init)=>{
      if(typeof input!=='string'||input!=='/api/ai/translate')return original(input,init);
      state.calls++;const encoder=new TextEncoder();let timers:ReturnType<typeof setTimeout>[]=[];
      return new Response(new ReadableStream<Uint8Array>({start(c){
        const emit=(value:unknown)=>c.enqueue(encoder.encode(JSON.stringify(value)+'\n'));
        const cancel=()=>{state.cancelled=true;timers.forEach(clearTimeout);};init?.signal?.addEventListener('abort',cancel,{once:true});
        timers=[setTimeout(()=>emit({type:'progress'}),22000),setTimeout(()=>{emit({type:'result',status:200,headers:{},data:{result:'Bản dịch Gemma hoàn tất sau 65 giây.',model:JSON.parse(String(init?.body)).model,finishReason:'STOP',inputTokens:10,outputTokens:12}});c.close();init?.signal?.removeEventListener('abort',cancel);},28000)];
      },cancel(){state.cancelled=true;timers.forEach(clearTimeout);}}),{headers:{'Content-Type':'application/x-ndjson'}});
    };
  });
}
const cacheCount=(page:Page)=>page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.settings.toArray()).filter(row=>row.key.startsWith('ai-reading-cache:v1:')).length;});
test('Gemma activity refreshes the output deadline; only the complete result is cached',async({page})=>{
  await seed(page);await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {activityTest:{calls:number}}).activityTest.calls)).toBe(1);
  await page.clock.fastForward(22001);expect(await cacheCount(page)).toBe(0);await expect(page.getByRole('button',{name:'Thử lại AI',exact:true})).toHaveCount(0);
  await page.clock.fastForward(6001);await expect(page.locator('.prose')).toContainText('Bản dịch Gemma hoàn tất sau 65 giây.');expect(await cacheCount(page)).toBe(1);
  expect(await page.evaluate(()=>(window as unknown as {activityTest:{calls:number}}).activityTest.calls)).toBe(1);
  expect(await page.evaluate(async({chapter})=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get(chapter))?.text;},{chapter})).toBe(raw);
});
test('leaving AI cancels an active stream and never saves its late result',async({page})=>{
  await seed(page);await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {activityTest:{calls:number}}).activityTest.calls)).toBe(1);
  await page.clock.fastForward(22001);await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await expect(page.locator('.prose')).toContainText(raw);
  await page.clock.fastForward(90000);expect(await cacheCount(page)).toBe(0);expect(await page.evaluate(()=>(window as unknown as {activityTest:{cancelled:boolean}}).activityTest.cancelled)).toBe(true);
});
test('stalled draft gets one replay on the same model using another key before fallback',async({page})=>{
 await seed(page);await page.evaluate(()=>{
  const original=window.fetch.bind(window),state={calls:[] as {model:string;avoid:string|null}[]};(window as unknown as {secondChance:typeof state}).secondChance=state;
  window.fetch=async(input,init)=>{
   if(input!=='/api/ai/translate')return original(input,init);
   const chosen=JSON.parse(String(init?.body)).model,headers=new Headers(init?.headers);state.calls.push({model:chosen,avoid:headers.get('X-AI-Avoid-Key-Slot')});if(chosen!=='gemini-3.5-flash')return Response.json({error:'ai_timeout'},{status:504});const attempt=state.calls.filter(r=>r.model===chosen).length,enc=new TextEncoder();
   return new Response(new ReadableStream({start(c){const emit=(v:unknown)=>c.enqueue(enc.encode(JSON.stringify(v)+'\n'));emit({type:'progress',lease:{requestId:'11111111-1111-4111-8111-111111111111',leaseIdHash:'a'.repeat(32),keySlot:attempt===1?1:2,keysAvailable:2}});emit({type:'text',text:'Synthetic draft.\n'});emit(attempt===1?{type:'result',status:504,headers:{},data:{error:'ai_timeout'}}:{type:'result',status:200,headers:{},data:{result:'Complete answer after one replay.',model:chosen,finishReason:'STOP',inputTokens:1,outputTokens:1}});c.close();}}),{headers:{'Content-Type':'application/x-ndjson'}});
  };
 });
 await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('Complete answer after one replay.');expect(await cacheCount(page)).toBe(1);
 const calls=await page.evaluate(()=>(window as unknown as {secondChance:{calls:{model:string;avoid:string|null}[]}}).secondChance.calls);expect(calls.map(r=>r.model)).toEqual(['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash','gemini-3.5-flash']);expect(calls[3].avoid).toBe('1');
});
