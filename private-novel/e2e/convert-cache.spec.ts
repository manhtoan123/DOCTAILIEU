import {test,expect} from '@playwright/test';
const source='你好山门。张三。';
test('cached Chinese chapter opens after reload while dictionary Worker load is blocked',async({page})=>{
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;
    const state={blocked:false,messages:[] as {type:string;text?:string}[]};
    Object.assign(window,{cacheProbe:state});
    window.Worker=class extends NativeWorker{
      postMessage(message:unknown,options?:StructuredSerializeOptions){
        const row=message as {type:string;text?:string};state.messages.push({type:row.type,text:row.text});
        if(row.type==='load'&&sessionStorage.getItem('block-dictionary-load')==='yes'){state.blocked=true;return;}
        super.postMessage(message,options||{});
      }
    };
  });
  await page.goto('/');await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    await db.dictionaries.put({kind:'vp',name:'Vietphrase.txt',blob:new Blob(['你好=xin chào\n山门=sơn môn\n张三=trương tam']),sha256:'cache-fixture-v1',updatedAt:1});
    await db.books.add({id:'cache-reader',title:'Cache fixture',author:'',status:'ready',createdAt:1,updatedAt:1,chapterCount:1,charCount:9});
    await db.chapters.add({id:'cache-chapter',bookId:'cache-reader',order:0,title:'Chapter fixture',text:'你好山门。张三。',revision:1,sourceId:''});
  });
  const cold=Date.now();await page.getByRole('link',{name:'Mở sách →',exact:true}).click();await expect(page.locator('.prose')).toContainText('Xin chào sơn môn. Trương tam.');
  const coldMs=Date.now()-cold;
  // Wait for the disposable cache entry to be committed before navigating.
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/features/names-convert/services/convert-cache.ts';const cache=await import(/* @vite-ignore */path);return cache.hasCachedConversions();})).toBe(true);
  await page.evaluate(()=>sessionStorage.setItem('block-dictionary-load','yes'));await page.reload();
  const warm=Date.now();await page.getByRole('link',{name:'Mở sách →',exact:true}).click();await expect(page.locator('.prose')).toContainText('Xin chào sơn môn. Trương tam.');const warmMs=Date.now()-warm;
  const probe=await page.evaluate(()=> (window as unknown as {cacheProbe:{blocked:boolean;messages:{type:string;text?:string}[]}}).cacheProbe);
  expect(probe.blocked).toBe(true);expect(probe.messages.filter(message=>message.type==='convert'&&message.text===source)).toHaveLength(0);
  console.log(JSON.stringify({project:test.info().project.name,coldOpenMs:coldMs,cachedOpenMs:warmMs,dictionaryLoadBlocked:true,chapterWorkerConverts:0}));
});
