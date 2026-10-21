import {chromium,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';

const origin=process.env.SMOKE_ORIGIN||'https://thu-phong-private.pages.dev';
const directory='.dsh-tmp/tts-backup-stability/production';
mkdirSync(directory,{recursive:true});
const html=readFileSync('dist/index.html','utf8').trim();
expect((await(await fetch(origin)).text()).trim()).toBe(html);
const mp3=readFileSync('tests/fixtures/tts-continuous.mp3').toString('base64');
const browser=await chromium.launch({channel:'msedge'}),runs=[];

async function isolated(viewport){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  await context.route('**/api/**',route=>route.fulfill({status:503}));
  await context.route('**/api/ai/translate',route=>route.fulfill({json:{result:route.request().postDataJSON().text,model:route.request().postDataJSON().model,finishReason:'STOP',inputTokens:1,outputTokens:1}}));
  await context.route('https://ottsy.weilbyte.dev/api/generation',route=>route.fulfill({json:{success:true,data:mp3}}));
  await context.addInitScript(()=>{const Native=window.Audio;window.__audios=[];window.Audio=function(){const audio=new Native();window.__audios.push(audio);return audio;};});
  const page=await context.newPage();page.setDefaultTimeout(30000);
  await page.goto(origin);await expect(page.getByRole('button',{name:/Thêm truyện TXT/})).toBeVisible();
  return {context,page};
}
try{
  for(const width of [869,393]){
    const source=await isolated({width,height:835});let target;
    try{
      // Only synthetic records inside a fresh browser context; all API traffic is mocked.
      await source.page.evaluate(async()=>{
        const request=indexedDB.open('thu-phong-v1');
        const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
        const text=Array.from({length:5},(_,i)=>`Đoạn kiểm tra ${i+1}. `+'Nội dung tổng hợp để kiểm tra phát âm thanh và lưu bản sao truyện. '.repeat(2)).join('\n');
        const blob=new Blob([text]);const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
        const tx=db.transaction(['books','chapters','sources','settings'],'readwrite');
        tx.objectStore('books').put({id:'stability-book',title:'Kiểm tra TTS và backup',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:text.length});
        tx.objectStore('chapters').put({id:'stability-chapter',bookId:'stability-book',order:0,title:'Chương một',text,revision:1,sourceId:'stability-source'});
        tx.objectStore('sources').put({id:'stability-source',bookId:'stability-book',name:'synthetic.txt',displayName:'Bản thử.txt',relativePath:'synthetic.txt',encoding:'utf-8',sha256:sha,bytes:blob.size,blob});
        tx.objectStore('settings').put({key:'convert-name-list',value:[{key:'甲',value:'Giáp thử'}]});
        tx.objectStore('settings').put({key:'reader-options',value:{autoNext:false,preloadAi:false}});
        await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
      });
      await source.page.goto(origin+'/read/stability-book/stability-chapter');
      const listen=source.page.getByRole('button',{name:'Nghe truyện nhanh',exact:true});
      await listen.click();await expect(listen).toHaveAttribute('title','Tạm dừng nghe');
      await expect.poll(()=>source.page.evaluate(()=>window.__audios.find(a=>a.loop)?.duration)).toBe(10);
      await expect.poll(()=>source.page.evaluate(()=>window.__audios.find(a=>!a.loop)?.duration||0)).toBeGreaterThan(0);
      await source.page.evaluate(()=>{const voice=window.__audios.find(a=>!a.loop);voice.currentTime=voice.duration-.1;});
      await expect.poll(()=>source.page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:stability-book')||'null')?.offset||0)).toBeGreaterThan(0);
      await listen.click();const saved=await source.page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:stability-book')));
      await source.page.reload();await expect(listen).toHaveAttribute('data-resume','true');
      expect(await source.page.evaluate(()=>window.__audios.length)).toBe(0);
      await listen.click();await expect(listen).toHaveAttribute('title','Tạm dừng nghe');
      expect(await source.page.evaluate(()=>JSON.parse(localStorage.getItem('tts-cursor:v1:stability-book')).offset)).toBe(saved.offset);
      await source.page.getByRole('button',{name:'Dừng đọc nhanh',exact:true}).click();

      await source.page.goto(origin+'/settings/backup');
      await source.page.getByRole('heading',{name:'Sao lưu & chuyển thiết bị',exact:true}).waitFor();
      await source.page.getByRole('combobox',{name:/^Chọn truyện/}).selectOption('stability-book');
      await source.page.getByRole('combobox',{name:/^Chế độ sao lưu/}).selectOption('portable');
      await source.page.getByRole('button',{name:'Chuẩn bị sao lưu (Đầy đủ)',exact:true}).click();
      const download=source.page.waitForEvent('download');await source.page.getByRole('button',{name:'Tải phần 1/1',exact:true}).click();
      const downloaded=await download,filename=`${directory}/synthetic-${width}.tpbackup.json`;await downloaded.saveAs(filename);
      const packet=JSON.parse(readFileSync(filename,'utf8')),body=JSON.parse(packet.body);
      expect(body.convertNames).toEqual([{key:'甲',value:'Giáp thử'}]);expect(body.sources[0].displayName).toBe('Bản thử.txt');
      target=await isolated({width,height:835});await target.page.goto(origin+'/settings/backup');
      await target.page.getByLabel('Chọn các phần sao lưu',{exact:true}).setInputFiles(filename);
      await target.page.getByRole('button',{name:'Khôi phục (Bản mới)',exact:true}).click();
      await expect(target.page.getByText('Đã khôi phục truyện "Kiểm tra TTS và backup" vào tủ sách.',{exact:true})).toBeVisible();
      const restored=await target.page.evaluate(async()=>{
        const request=indexedDB.open('thu-phong-v1');const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
        const tx=db.transaction(['sources','settings'],'readonly');
        const sourceRequest=tx.objectStore('sources').getAll(),namesRequest=tx.objectStore('settings').get('convert-name-list');
        await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
        return {sourceText:await sourceRequest.result[0].blob.text(),displayName:sourceRequest.result[0].displayName,names:namesRequest.result?.value};
      });
      expect(restored).toEqual({sourceText:body.chapters[0].text,displayName:'Bản thử.txt',names:[{key:'甲',value:'Giáp thử'}]});
      await target.page.screenshot({path:`${directory}/restore-${width}.png`,fullPage:true});
      runs.push({width,status:'passed',nativeAudio:true,localCarrierSeconds:10,resumeOffset:saved.offset,cleanProfileRestore:true,cloudWrites:0,realAndroid:false});
    }catch(error){
      writeFileSync(`${directory}/failure-${width}.txt`,`${error}\nSource URL: ${source.page.url()}\n${await source.page.locator('body').innerText()}\nTarget URL: ${target?.page.url()||''}\n${target?await target.page.locator('body').innerText():''}`);
      throw error;
    }finally{await target?.context.close();await source.context.close();}
  }
}finally{
  await browser.close();
  writeFileSync(`${directory}/report.json`,JSON.stringify({origin,bundle:html.match(/src="([^"]+\.js)"/)[1],runs},null,2));
}
console.log(JSON.stringify(runs));
