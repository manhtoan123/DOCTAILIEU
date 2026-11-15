import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

test('an incomplete shell build fails installation instead of caching the SPA fallback',async({page})=>{
  const worker=await readFile('dist/sw.js');
  const shellRequests:string[]=[];
  const local=createServer((request,response)=>{
    if(request.url==='/sw.js'){
      response.writeHead(200,{'Content-Type':'application/javascript'}).end(worker);
      return;
    }
    if(request.url?.startsWith('/assets/'))shellRequests.push(request.url);
    response.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Shell fixture</title>');
  });
  await new Promise<void>((resolve,reject)=>{local.once('error',reject);local.listen(0,'127.0.0.1',resolve);});
  try{
    await page.goto(`http://127.0.0.1:${(local.address() as AddressInfo).port}/`);
    const result=await page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.register('/sw.js');
      const installing=registration.installing;
      if(installing&&installing.state!=='redundant'&&installing.state!=='activated'){
        await new Promise<void>(resolve=>installing.addEventListener('statechange',()=>{
          if(installing.state==='redundant'||installing.state==='activated')resolve();
        }));
      }
      return {state:installing?.state,active:!!registration.active,cacheNames:await caches.keys()};
    });
    expect(shellRequests.length).toBeGreaterThan(0);
    expect(result.state).toBe('redundant');
    expect(result.active).toBe(false);
    expect(result.cacheNames).toEqual([]);
  }finally{
    await page.close();
    await new Promise<void>(resolve=>local.close(()=>resolve()));
  }
});

test('offline shell opens a saved story and leaves API data uncached',async({page,context})=>{
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'isolated offline-shell fixture'}}));
  const workerResponse=await page.request.get('/sw.js');
  expect(workerResponse.ok()).toBe(true);
  expect(workerResponse.headers()['content-type']).toContain('javascript');
  const workerText=await workerResponse.text();
  expect(workerText).not.toContain('__PRECACHE_ENTRIES__');
  expect(workerText).toMatch(/"integrity":"sha256-[A-Za-z0-9+/]{43}="/);
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
    const index=await caches.match('/index.html');
    return {scope:registrations[0]?.scope,controller:Boolean(navigator.serviceWorker.controller),paths:requests.map(request=>new URL(request.url).pathname),indexEncoding:index?.headers.get('content-encoding')};
  });
  expect(cached.scope).toBe(`${new URL(page.url()).origin}/`);
  expect(cached.controller).toBe(true);
  expect(cached.paths).toContain('/index.html');
  expect(cached.paths).toContain('/epub-bridge-v2.js');
  expect(cached.paths.some(path=>path.startsWith('/assets/')&&path.endsWith('.js'))).toBe(true);
  expect(cached.indexEncoding).toBeNull();
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
