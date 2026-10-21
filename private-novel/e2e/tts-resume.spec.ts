import {test,expect,type Page} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:r.request().postDataJSON().text,model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}}));});
async function seed(page:Page){
 await page.addInitScript(()=>{const all:any[]=[];Object.defineProperty(window,'__audios',{get:()=>all.filter(a=>!a.loop)});(window as any).__plays=0;(window as any).Audio=class{loop=false;currentTime=0;playbackRate=1;onended?:()=>void;onerror?:()=>void;constructor(){all.push(this);}removeAttribute(){}load(){}play(){if(!this.loop)(window as any).__plays++;return Promise.resolve();}pause(){}};});
 await page.route('**/api/library**',r=>r.fulfill({json:{books:[],deleted:[],public:true}}));await page.route('**/api/dictionaries',r=>r.fulfill({json:{dictionaries:[]}}));
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.books.put({id:'resume',title:'Resume fixture',author:'',status:'ready',chapterCount:1,charCount:100,createdAt:1,updatedAt:1});await db.chapters.put({id:'resume-1',bookId:'resume',order:0,title:'Chapter',text:Array.from({length:50},(_,i)=>`Sentence ${i} here. ${'Detail '.repeat(14)}.`).join('\n'),revision:1,sourceId:''});});await page.goto('/read/resume/resume-1',{waitUntil:'domcontentloaded'});await expect(page.getByRole('button',{name:'Nghe truyện nhanh',exact:true})).toBeEnabled();
}
const listen=(page:Page)=>page.getByRole('button',{name:'Nghe truyện nhanh',exact:true});
async function advance(page:Page){const count=await page.evaluate(()=>{const a=(window as any).__audios;a.at(-1).onended?.();return (window as any).__plays;});await expect.poll(()=>page.evaluate(()=>(window as any).__plays)).toBeGreaterThan(count);}
test('TTS sentence editor and gateway preserve the reported mươi word at the old 200-character cut',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:503}));await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:r.request().postDataJSON().text,model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}}));const spoken:string[]=[];
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}});});await seed(page);
 const text='Lý Thập Ngũ cúi chào, rồi cố gắng trấn tĩnh tinh thần, nói: "Đại khái là, tiền bối một trăm tuổi thì quen biết ta, còn tiền bối hai mươi tuổi thì không quen biết ta, bởi vì một trăm tuổi ở trước hai mươi tuổi, tương đương với việc tiền bối ngài đã trải qua một trăm tuổi trước, rồi mới có hai mươi tuổi.';
 await page.evaluate(async text=>{const {db}=await import('/src/core/db.ts');await db.chapters.update('resume-1',{text});await db.settings.put({key:'reader-options',value:{autoNext:false,preloadAi:false}});},text);await page.reload();await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await page.getByRole('button',{name:'Dịch AI',exact:true}).click();await expect(page.locator('.prose')).toContainText('trước hai mươi tuổi');
 await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();await page.getByRole('button',{name:/^Câu \(\d+\)$/}).click();const dialog=page.getByRole('dialog',{name:'Sửa câu đọc trong phiên',exact:true}),rows=await dialog.locator('textarea').evaluateAll(nodes=>nodes.map(n=>(n as HTMLTextAreaElement).value));
 expect(rows.join('')).toBe(text);expect(rows.some(t=>t.includes('trước hai mươi tuổi'))).toBe(true);expect(rows[0].trimEnd()).toMatch(/ta,$/);await dialog.getByRole('button',{name:'Áp dụng cho phiên',exact:true}).click();await page.getByRole('button',{name:'Đóng thông báo',exact:true}).click();await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');await expect.poll(()=>spoken.length).toBe(rows.length);expect(spoken.map(s=>s.trim())).toEqual(rows.map(s=>s.trim()));expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get('resume-1'))!.text;})).toBe(text);
});
for(const mode of ['RAW','Dịch AI'])test(`${mode} resumes local cursor after native reload without autoplay or source writes`,async({page})=>{
 const spoken:string[]=[];let aiCalls=0;await page.route('https://ottsy.weilbyte.dev/api/generation',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}});});await page.route('**/api/ai/translate',r=>{aiCalls++;return r.fulfill({json:{result:['Translated first.','Translated second.','Translated third.'].map(s=>s+' '+('Detail '.repeat(14))+'.').join('\n'),model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await seed(page);if(mode==='Dịch AI'){await page.getByRole('button',{name:'Bản gốc',exact:true}).click();await page.getByRole('button',{name:mode,exact:true}).click();}await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');await advance(page);await page.evaluate(()=>{(window as any).__audios.at(-1).currentTime=2.5;});await listen(page).click();
 const callsBeforeReload=aiCalls;expect(callsBeforeReload).toBeGreaterThan(0);const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:resume')!));expect(before.offset).toBeGreaterThan(0);await page.reload();await expect(page.getByRole('button',{name:'Dịch AI',exact:true})).toHaveAttribute('aria-pressed','true');await expect(listen(page)).toBeEnabled();await expect(listen(page)).toHaveAttribute('data-resume','true');expect(await page.evaluate(()=>(window as any).__audios.length)).toBe(0);const count=spoken.length;await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');expect(spoken[count]).toContain('Translated second');expect(await page.evaluate(()=>(window as any).__audios[0].currentTime)).toBe(2.5);expect(aiCalls).toBe(callsBeforeReload);
 expect(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get('resume-1'))!.text;})).toContain('Sentence 0');await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('tts-cursor:v1:resume'))).toBeNull();await expect(listen(page)).not.toHaveAttribute('data-resume','true');
});
test('manual wheel temporarily suspends following, then offscreen current paragraph follows',async({page})=>{
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}}));await seed(page);await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');await page.evaluate(()=>{window.dispatchEvent(new WheelEvent('wheel',{deltaY:900}));window.scrollTo(0,document.body.scrollHeight);});const bottom=await page.evaluate(()=>window.scrollY);await advance(page);await page.waitForTimeout(600);expect(await page.evaluate(()=>window.scrollY)).toBe(bottom);await expect.poll(async()=>{const b=await page.locator('.speaking').boundingBox();return !!b&&b.y>=0&&b.y<page.viewportSize()!.height;},{timeout:6000}).toBe(true);
});

test('hidden reader keeps warm audio transitions and cursor without following layout, then follows on return',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:503}));
 await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:r.request().postDataJSON().text,model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}}));
 const spoken:string[]=[];await page.route('https://ottsy.weilbyte.dev/api/generation',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}});});
 await seed(page);await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');await expect.poll(()=>spoken.length).toBe(3);
 await page.evaluate(()=>{
  (window as any).__hidden=true;(window as any).__followReads=0;
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>(window as any).__hidden});
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>(window as any).__hidden?'hidden':'visible'});
  const original=Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect=function(){if(this.classList.contains('speaking'))(window as any).__followReads++;return original.call(this);};
  document.dispatchEvent(new Event('visibilitychange'));
 });
 for(let i=1;i<=4;i++){
  await advance(page);await expect.poll(()=>spoken.length).toBe(i+3);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:resume')!).offset)).toBeGreaterThan(0);
 }
 await page.waitForTimeout(650);expect(await page.evaluate(()=>(window as any).__followReads)).toBe(0);
 expect(await page.evaluate(()=>(window as any).__audios.length)).toBe(1);
 expect(new Set(spoken).size).toBe(spoken.length);
 await page.evaluate(()=>{(window as any).__hidden=false;document.dispatchEvent(new Event('visibilitychange'));});
 await expect.poll(()=>page.evaluate(()=>(window as any).__followReads)).toBeGreaterThan(0);
 await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');
});
test('changed source revision invalidates persisted offset before next listen',async({page})=>{
 const spoken:string[]=[];await page.route('https://ottsy.weilbyte.dev/api/generation',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}});});await seed(page);await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');await advance(page);await listen(page).click();await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.chapters.update('resume-1',{text:'Changed first. Changed second.',revision:2});});await page.reload();await expect(listen(page)).toBeEnabled();const n=spoken.length;await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');expect(spoken[n]).toBe('Changed first. Changed second.');
});
test('finished chapter clears the cursor so the next listen starts at the first sentence',async({page})=>{
 const spoken:string[]=[];await page.route('https://ottsy.weilbyte.dev/api/generation',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}});});await seed(page);
 await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.chapters.update('resume-1',{text:'Sentence 0 here.\nSentence 1 here.',revision:2});});
 await expect(page.locator('.prose')).toContainText('Sentence 1 here.');await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');
 await page.evaluate(()=>{(window as any).__audios.at(-1).onended?.();});await expect(listen(page)).toHaveAttribute('aria-pressed','false');
 expect(await page.evaluate(()=>localStorage.getItem('tts-cursor:v1:resume'))).toBeNull();await expect(listen(page)).not.toHaveAttribute('data-resume','true');
 const n=spoken.length;await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');expect(spoken[n]?.trim()).toBe('Sentence 0 here.\nSentence 1 here.');
});

test('three AI chapters share one audio element, warm chapter boundaries and honor media controls',async({page})=>{
 const spoken:string[]=[];
 await page.addInitScript(()=>{const handlers:Record<string,(()=>void)|null>={};(window as any).__mediaHandlers=handlers;Object.defineProperty(navigator,'mediaSession',{configurable:true,value:{metadata:null,playbackState:'none',setActionHandler:(name:string,handler:(()=>void)|null)=>{handlers[name]=handler;}}});});
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}});});
 await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:r.request().postDataJSON().text,model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}}));
 await seed(page);await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.books.update('resume',{chapterCount:3});await db.chapters.update('resume-1',{text:'First one.First two.First three.',revision:2});for(let i=2;i<=3;i++)await db.chapters.put({id:`resume-${i}`,bookId:'resume',order:i-1,title:`Chapter ${i}`,text:`Chapter ${i} one.Chapter ${i} two.Chapter ${i} three.`,revision:1,sourceId:''});});
 await expect(page.locator('.prose')).toContainText('First one.');await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');
 await expect(page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true})).toHaveAttribute('data-prewarm','ready');
 await page.evaluate(()=>(window as any).__mediaHandlers.pause());await expect(listen(page)).toHaveAttribute('title','Tiếp tục nghe');
 await page.evaluate(()=>(window as any).__mediaHandlers.play());await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');
 for(let chapter=1;chapter<3;chapter++){await expect(page.getByRole('button',{name:'Tùy chỉnh prompt và model',exact:true})).toHaveAttribute('data-prewarm','ready');await advance(page);await expect(page.locator('.prose')).toContainText(`Chapter ${chapter+1} one.`);await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');}
 expect(spoken).toHaveLength(3);expect(await page.evaluate(()=>(window as any).__audios.length)).toBe(1);expect(await page.evaluate(()=>navigator.mediaSession.metadata?.title)).toBe('Chapter 3');
 await page.evaluate(()=>(window as any).__mediaHandlers.stop());await expect(listen(page)).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>localStorage.getItem('tts-cursor:v1:resume'))).toBeNull();expect(await page.evaluate(()=>Object.values((window as any).__mediaHandlers).every(h=>h===null))).toBe(true);
});

test('pending resume is visible and Stop prevents its late play promise from reviving sound',async({page})=>{
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}}));await seed(page);await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');await listen(page).click();
 await page.evaluate(()=>{(window as any).__audios[0].play=()=>new Promise<void>(resolve=>(window as any).__resumeResolve=resolve);});
 await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng tải');await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();await page.evaluate(()=>(window as any).__resumeResolve());await expect(listen(page)).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>localStorage.getItem('tts-cursor:v1:resume'))).toBeNull();
});
test('a chunk completed while paused advances exactly once only after explicit resume',async({page})=>{
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}}));await seed(page);await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');await listen(page).click();const count=await page.evaluate(()=>{(window as any).__audios[0].onended?.();return (window as any).__plays;});await expect(listen(page)).toHaveAttribute('title','Tiếp tục nghe');expect(await page.evaluate(()=>(window as any).__plays)).toBe(count);await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');expect(await page.evaluate(()=>(window as any).__plays)).toBe(count+1);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:resume')!).offset)).toBeGreaterThan(0);
});
for(const reload of [false,true])test(`temporary network failure preserves the current sentence ${reload?'after reload':'in the same session'}`,async({page})=>{
 const spoken:string[]=[];let offline=false;
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>{spoken.push(r.request().postDataJSON().text);return offline?r.abort('internetdisconnected'):r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}});});
 await seed(page);await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');offline=true;
 await advance(page);await advance(page);await page.evaluate(()=>(window as any).__audios[0].onended?.());await expect(page.locator('.reader-convert-status').filter({hasText:'Tự thử lại sau'})).toBeVisible();await expect(listen(page)).toHaveAttribute('data-state','loading');const cursor=await page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:resume')!));expect(cursor.offset).toBeGreaterThan(0);offline=false;
 if(reload){await page.reload();await expect(listen(page)).toHaveAttribute('data-resume','true');expect(await page.evaluate(()=>(window as any).__plays)).toBe(0);}
 const count=spoken.length;if(reload)await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');expect(spoken[count]).toContain('Sentence 3');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:resume')!).offset)).toBe(cursor.offset);
});

test('listen icons follow playback and a failed audio resumes automatically at the same position',async({page})=>{
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}}));await seed(page);
 const button=listen(page);await button.click();await expect(button).toHaveAttribute('data-state','playing');await expect(button.locator('svg path')).toHaveAttribute('d','M8 5v14M16 5v14');
 await page.evaluate(()=>{const audio=(window as any).__audios[0];audio.currentTime=2.5;audio.onerror?.();});
 await expect(button).toHaveAttribute('data-state','loading');await expect(page.locator('.reader-convert-status').filter({hasText:'Tự thử lại sau'})).toBeVisible();
 await expect(button).toHaveAttribute('data-state','playing');expect(await page.evaluate(()=>(window as any).__audios[0].currentTime)).toBe(2.5);
 await button.click();await expect(button).toHaveAttribute('data-state','paused');await expect(button.locator('svg path')).toHaveAttribute('d','m8 5 11 7-11 7Z');
 await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();await expect(button).toHaveAttribute('data-state','idle');await expect(button.locator('svg rect')).toHaveCount(2);
});

test('AI quota recovery keeps the listen intent and starts audio without another click',async({page})=>{
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}}));await seed(page);await page.clock.install();let calls=0,limited=true;const resumed:string[]=[];
 await page.route('**/api/ai/translate',r=>{calls++;if(!limited)resumed.push(r.request().postDataJSON().text);return limited?r.fulfill({status:429,headers:{'Retry-After':'31'},json:{error:'ai_rate_limited'}}):r.fulfill({json:{result:'Bản dịch đã phục hồi.',model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}});});
 await listen(page).click();await expect(page.locator('.reader-convert-status').filter({hasText:'Tự thử lại sau'})).toBeVisible();await expect(listen(page)).toHaveAttribute('data-state','waiting');
 const before=calls;limited=false;await page.clock.runFor(32000);await expect(listen(page)).toHaveAttribute('data-state','playing');expect(calls).toBe(before+resumed.length);expect(resumed.length).toBeGreaterThan(0);expect(resumed.join('')).toBe(await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');return (await db.chapters.get('resume-1'))!.text;}));await expect(page.locator('.prose')).toContainText('Bản dịch đã phục hồi.');
});
test('interrupting a stalled request keeps the chapter cursor and retries that sentence after reconnect',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:503}));await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:r.request().postDataJSON().text,model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}}));
 let holding=true,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),spoken:string[]=[];
 await page.route('https://ottsy.weilbyte.dev/api/generation',async r=>{const text=r.request().postDataJSON().text;spoken.push(text);if(holding&&text.includes('Sentence 3 '))await gate;await r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}}).catch(()=>{});});
 await seed(page);await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');await expect.poll(()=>spoken.length).toBe(3);
 await advance(page);await advance(page);await page.evaluate(()=>(window as any).__audios[0].onended?.());await expect(listen(page)).toHaveAttribute('title','Tạm dừng tải');
 await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tiếp tục nghe');const cursor=await page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:resume')!));expect(cursor.offset).toBeGreaterThan(0);
 holding=false;release();const count=spoken.length,plays=await page.evaluate(()=>(window as any).__plays);await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');
 expect(spoken[count]).toContain('Sentence 3 ');expect(await page.evaluate(()=>(window as any).__plays)).toBe(plays+1);expect(await page.evaluate(()=>(window as any).__audios.length)).toBe(1);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:resume')!).offset)).toBe(cursor.offset);
 await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('tts-cursor:v1:resume'))).toBeNull();
});
for(const action of ['Stop','Disable auto-next'])test(action+' while next AI is pending prevents playback after the late response',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/api/ai/translate',async r=>{const text=r.request().postDataJSON().text;if(text==='Next chapter.')await gate;await r.fulfill({json:{result:text,model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}}).catch(()=>{});});
 const spoken:string[]=[];await page.route('https://ottsy.weilbyte.dev/api/generation',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}});});await seed(page);await page.evaluate(async()=>{const {db}=await import('/src/core/db.ts');await db.chapters.update('resume-1',{text:'Current chapter.',revision:2});await db.chapters.put({id:'resume-2',bookId:'resume',order:1,title:'Next',text:'Next chapter.',revision:1,sourceId:''});});await expect(page.locator('.prose')).toContainText('Current chapter.');await listen(page).click();await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');await page.evaluate(()=>(window as any).__audios[0].onended?.());await expect(page.locator('.chapter-title-menu')).toContainText('Next');
 if(action==='Stop')await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();else{await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();await page.getByRole('checkbox',{name:'Qua chương',exact:true}).uncheck();await page.getByRole('button',{name:'Ẩn Nghe sách',exact:true}).click();}release();await expect(page.locator('.prose')).toContainText('Next chapter.');await expect(listen(page)).toHaveAttribute('aria-pressed','false');expect(spoken).toEqual(['Current chapter.']);
});
test('natural grouping is automatic and preserves playback',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:503}));
 await page.route('**/api/ai/translate',r=>r.fulfill({json:{result:r.request().postDataJSON().text,model:r.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}}));
 const spoken:string[]=[];
 await page.route('https://ottsy.weilbyte.dev/api/generation',r=>{spoken.push(r.request().postDataJSON().text);return r.fulfill({json:{success:true,data:'//PkxAAAAAAA'}});});
 await seed(page);await page.evaluate(async()=>{const{db}=await import('/src/core/db.ts');await db.chapters.update('resume-1',{text:Array.from({length:50},(_,i)=>`Sentence ${i} here.`).join('\n'),revision:2});});await expect(page.locator('.prose')).toContainText('Sentence 49 here.');
 await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();
 await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Nối câu tự nhiên',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Ẩn Nghe sách',exact:true}).click();
 await listen(page).click();
 await expect(listen(page)).toHaveAttribute('title','Tạm dừng nghe');
 await expect.poll(()=>spoken.length).toBeGreaterThan(0);
 expect(spoken[0]).toContain('Sentence 0 here.');
 expect(spoken[0]).toContain('Sentence 1 here.');
 await page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();
});

