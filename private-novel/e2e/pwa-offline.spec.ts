import {test,expect} from '@playwright/test';

test('offline shell opens a saved story and leaves API data uncached',async({page,context})=>{
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'isolated offline-shell fixture'}}));
  const workerResponse=await page.request.get('/sw.js');
  expect(workerResponse.ok()).toBe(true);
  expect(workerResponse.headers()['content-type']).toContain('javascript');
  const workerText=await workerResponse.text();
  expect(workerText).not.toContain('__PRECACHE_URLS__');
  expect(workerText).not.toContain('__BUILD_ID__');

  await page.goto('/');
  await expect(page.getByRole('button',{name:'Thêm truyện',exact:true})).toBeVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);

  await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open('thu-phong-v1');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    try{
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction(['books','chapters'],'readwrite');
        const text='Nội dung đọc khi mất mạng.';
        tx.objectStore('books').put({id:'pwa-fixture',title:'Truyện ngoại tuyến',author:'',status:'ready',chapterCount:1,charCount:text.length,createdAt:1,updatedAt:1});
        tx.objectStore('chapters').put({id:'pwa-chapter',bookId:'pwa-fixture',title:'Chương đã lưu',text,order:0,revision:1,sourceId:''});
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
      });
    }finally{db.close();}
  });

  const cached=await page.evaluate(async()=>{
    const registrations=await navigator.serviceWorker.getRegistrations();
    const cacheNames=await caches.keys();
    const requests=(await Promise.all(cacheNames.map(async name=>(await caches.open(name)).keys()))).flat();
    return {scope:registrations[0]?.scope,controller:Boolean(navigator.serviceWorker.controller),paths:requests.map(request=>new URL(request.url).pathname)};
  });
  expect(cached.scope).toBe('http://127.0.0.1:4173/');
  expect(cached.controller).toBe(true);
  expect(cached.paths).toContain('/index.html');
  expect(cached.paths).toContain('/epub-bridge-v2.js');
  expect(cached.paths.some(path=>path.startsWith('/assets/')&&path.endsWith('.js'))).toBe(true);
  expect(cached.paths.some(path=>path==='/api'||path.startsWith('/api/'))).toBe(false);

  await context.setOffline(true);
  const response=await page.goto('/read/pwa-fixture/pwa-chapter');
  expect(response?.status()).toBe(200);
  await expect(page.locator('.prose')).toContainText('Nội dung đọc khi mất mạng.');
  expect(await page.evaluate(async()=>{
    const names=await caches.keys();
    const requests=(await Promise.all(names.map(async name=>(await caches.open(name)).keys()))).flat();
    return requests.some(request=>{const path=new URL(request.url).pathname;return path==='/api'||path.startsWith('/api/');});
  })).toBe(false);
});
