import {test,expect,type Page} from '@playwright/test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createConvertServer} from '../convert-server/service';
import {convertTestTls} from '../tests/helpers/convert-tls';
import {secure} from '../server/auth';

const serviceOrigin='https://localhost:18443';
const appOrigin='http://127.0.0.1:18573';
const browserCalls=(page:Page)=>page.evaluate(()=>[...(window as any).__convertCalls] as string[]);
test.skip(process.env.VITE_CONVERT_SERVER_ORIGIN!==serviceOrigin,'Set the loopback HTTPS origin before starting Playwright.');

test('original Reader stays idle and explicit Convert uses the selected HTTPS service',async({browser},testInfo)=>{
  const directory=await mkdtemp(join(tmpdir(),'oci-e2e-'));
  const tls=convertTestTls(directory);
  const server=createConvertServer({tls:tls.server,appOrigin,directory});
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(18443,resolve);});
  const context=await browser.newContext({
    ...testInfo.project.use,baseURL:appOrigin,ignoreHTTPSErrors:true,
    clientCertificates:[{origin:serviceOrigin,cert:tls.client.cert,key:tls.client.key}],
  });
  try {
    await context.addInitScript(()=>{
      const calls:string[]=[];
      (window as any).__convertCalls=calls;
      const fetchPage=window.fetch.bind(window);
      window.fetch=(input,init)=>{
        const url=new URL(input instanceof Request?input.url:String(input),location.href);
        if(url.port==='18443'||url.pathname.startsWith('/api/cloud/dictionaries')||url.pathname.startsWith('/api/state-files/'))
          calls.push((init?.method??'GET')+' '+url.pathname);
        return fetchPage(input,init);
      };
      const NativeWorker=window.Worker;
      window.Worker=class extends NativeWorker{
        constructor(url:string|URL,options?:WorkerOptions){
          super(url,options);
          if(String(url).includes('language.worker'))calls.push('language.worker');
        }
      };
    });
    await context.route(url=>url.origin===appOrigin&&url.pathname.startsWith('/api/'),
      route=>route.fulfill({status:404,body:'{}',contentType:'application/json'}));
    // Serve the built SPA shell for the fixture's two client routes, with
    // the same CSP as Pages. Static assets and the mTLS service are real.
    const html=await readFile('.dsh-tmp/oci-app/index.html','utf8');
    const headers=Object.fromEntries(secure(new Response(null,{headers:{'Content-Type':'text/html'}}),serviceOrigin).headers);
    await context.route(url=>url.origin===appOrigin&&(/^\/(settings|read)\//.test(url.pathname)),
      route=>route.fulfill({status:200,body:html,headers}));
    const page=await context.newPage();
    page.setDefaultTimeout(8_000);
    await page.goto('/settings/dictionary');
    await expect(page.getByLabel('Đích Convert')).toHaveValue('unset');
    await page.getByLabel('Đích Convert').selectOption('server');
    await page.getByRole('button',{name:'Kiểm tra máy chủ'}).click();
    await expect(page.getByText('Máy chủ chưa có từ điển.',{exact:true})).toBeVisible();
    await page.locator('input[type=file]').setInputFiles([
      {name:'Vietphrase.txt',mimeType:'text/plain',buffer:Buffer.from('山门=cổng máy chủ\n')},
      {name:'Names.txt',mimeType:'text/plain',buffer:Buffer.from('小周=Tên từ TXT\n')},
    ]);
    await page.getByRole('button',{name:'Gửi 2 file và thay bộ trên máy chủ'}).click();
    await expect(page.getByText('Đã lưu TXT và dựng chỉ mục trên máy chủ.',{exact:true})).toBeVisible();
    expect(await browserCalls(page)).toContain('PUT /v1/profile');
    expect(await page.evaluate(async()=>{
      const db=await new Promise<IDBDatabase>((resolve,reject)=>{
        const open=indexedDB.open('thu-phong-v1');open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
      });
      try {
        return await new Promise<number>((resolve,reject)=>{
          const tx=db.transaction(['dictionaries','settings','books','chapters','names'],'readwrite');
          const count=tx.objectStore('dictionaries').count();
          tx.objectStore('settings').put({key:'shared-dictionaries-initialized',value:true});
          tx.objectStore('dictionaries').put({kind:'vp',name:'local.txt',blob:new Blob(['山门=cổng cục bộ']),sha256:'synthetic-local',updatedAt:1});
          tx.objectStore('books').put({id:'oci-book',title:'山门',author:'',status:'ready',chapterCount:1,charCount:6,createdAt:1,updatedAt:1});
          tx.objectStore('chapters').put({id:'oci-chapter',bookId:'oci-book',order:0,title:'小周',displayTitle:'Chương đã lưu',text:'小周来到山门。',revision:1,sourceId:''});
          tx.objectStore('names').put({id:'oci-name',bookId:'oci-book',key:'小周',value:'Tên trong truyện'});
          tx.oncomplete=()=>resolve(count.result);tx.onerror=()=>reject(tx.error);
        });
      } finally {db.close();}
    })).toBe(0);

    for(const backend of ['local','server']){
      await page.evaluate(backend=>localStorage.setItem('convert-backend',backend),backend);
      await page.goto('/read/oci-book/oci-chapter');
      await expect(page.locator('.reader-book-heading h1')).toHaveText('山门');
      await expect(page.locator('article')).toContainText('小周来到山门。');
      await page.getByRole('button',{name:/Mục lục/}).first().click();
      const toc=page.getByRole('dialog',{name:'Mục lục'});
      await expect(toc).toContainText('Chương đã lưu');
      await toc.getByRole('button',{name:'Đóng',exact:true}).click();
      expect(await browserCalls(page)).toEqual([]);
    }
    const convertRequest=page.waitForRequest(request=>request.url()===serviceOrigin+'/v1/convert');
    await page.getByRole('button',{name:'Convert',exact:true}).click();
    expect((await convertRequest).postDataJSON()).toMatchObject({
      text:'小周来到山门。',names:[{key:'小周',value:'Tên trong truyện'}],
    });
    await expect(page.locator('article')).toContainText('cổng máy chủ');
    await expect(page.locator('article')).toContainText('Tên trong truyện');
    expect(await browserCalls(page)).toEqual(['POST /v1/convert']);

    await page.goto('/settings/dictionary');
    await page.getByRole('button',{name:'Kiểm tra máy chủ'}).click();
    await expect(page.getByText('Máy chủ sẵn sàng.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Gỡ toàn bộ từ điển trên máy chủ'}).click();
    await expect(page.getByText('Đã gỡ bộ từ điển trên máy chủ.',{exact:true})).toBeVisible();
    await page.goto('/read/oci-book/oci-chapter');
    await page.getByRole('button',{name:'Convert',exact:true}).click();
    await expect(page.getByRole('button',{name:'Thử lại Convert'})).toBeVisible();
    await expect(page.getByText(/Máy chủ chưa có bộ từ điển/).first()).toBeVisible();
    expect(await browserCalls(page)).toEqual(['POST /v1/convert']);

    await page.goto('/settings/dictionary');
    await page.getByLabel('Đích Convert').selectOption('local');
    await page.goto('/read/oci-book/oci-chapter');
    await page.getByRole('button',{name:'Convert',exact:true}).click();
    await expect(page.locator('article')).toContainText('cổng cục bộ');
    await page.locator('article').getByRole('button',{name:/cổng cục bộ/}).click();
    await expect(page.getByRole('dialog',{name:'Chỉnh Name'})).toBeVisible();
    expect(await browserCalls(page)).toContain('language.worker');
    expect(await browserCalls(page)).not.toContain('POST /v1/convert');
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(directory,{recursive:true,force:true,maxRetries:5});
  }
});
