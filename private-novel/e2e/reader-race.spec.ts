import {test,expect} from '@playwright/test';

for(const stop of [false,true])test(`Convert auto-next uses new chapter and respects pending Stop: ${stop}`,async({page})=>{
  // Only the language worker and Audio are synthetic; the importer, IndexedDB,
  // React effects, navigation and TTS fetch run through the real application.
  await page.addInitScript(()=>{
    const state=window as any;const NativeWorker=window.Worker;
    const pending:(()=>void)[]=[];let currentAudio:any;
    class LanguageWorker extends EventTarget{
      postMessage(message:any){
        const reply=()=>this.dispatchEvent(new MessageEvent('message',{data:{id:message.id,type:'result',result:message.type==='load'?{}:[{sourceStart:0,sourceEnd:message.text.length,source:message.text,targetText:message.text,type:'original',meanings:[],hanviet:''}]}}));
        if(message.type==='convert'&&message.text.includes('BETA'))pending.push(reply);else queueMicrotask(reply);
      }
      terminate(){}
    }
    state.Worker=function(url:URL,options:WorkerOptions){return String(url).includes('language.worker')?new LanguageWorker():new NativeWorker(url,options);};
    state.Audio=class {onended?:()=>void;onerror?:()=>void;playbackRate=1;constructor(){currentAudio=this;}play(){return Promise.resolve();}pause(){}};
    state.__finishSentence=()=>currentAudio?.onended?.();
    state.__pendingCount=()=>pending.length;
    state.__releaseSecond=()=>{while(pending.length)pending.shift()!();};
  });
  const spoken:string[]=[];
  await page.route('**/io/s1213/tiktoktts?**',async route=>{spoken.push(new URL(route.request().url()).searchParams.get('text')||'');await route.fulfill({status:200,contentType:'audio/mpeg',body:'synthetic audio'});});
  await page.goto('/');await page.getByRole('button',{name:'＋ Thêm truyện TXT'}).click();await page.getByLabel('Tên truyện').fill('Race fixture');await page.getByLabel('Hoặc dán nội dung').fill('Chương 1: Alpha\nALPHA.\nChương 2: Beta\nBETA.');await page.getByRole('button',{name:'Tách chương & xem trước →'}).click();await page.getByRole('button',{name:'Xác nhận vào thư viện'}).click();
  await page.getByRole('button',{name:'Convert',exact:true}).click();await expect(page.locator('.prose')).toContainText('ALPHA.');
  await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();await page.getByLabel('Đồng ý gửi câu đang đọc đến gateway TTS').check();await page.getByRole('button',{name:'▶ Nghe TikTok',exact:true}).click();
  await expect.poll(()=>spoken.length).toBe(1);await page.evaluate(()=>(window as any).__finishSentence());await expect.poll(()=>spoken.length).toBe(2);await page.evaluate(()=>(window as any).__finishSentence());
  await expect.poll(()=>page.evaluate(()=>(window as any).__pendingCount())).toBeGreaterThan(0);
  if(stop)await page.getByRole('button',{name:'Dừng đọc',exact:true}).click();
  await page.evaluate(()=>(window as any).__releaseSecond());await expect(page.locator('.prose')).toContainText('BETA.');
  if(stop){await expect(page.getByRole('button',{name:'▶ Nghe TikTok',exact:true})).toBeVisible();expect(spoken).toHaveLength(2);}
  else{await expect.poll(()=>spoken.length).toBe(3);expect(spoken[2]).toContain('Beta');expect(spoken[2]).not.toContain('Alpha');}
});
