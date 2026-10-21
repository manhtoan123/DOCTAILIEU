import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function openConvert(page:Page) {
  await page.goto('/');
  await page.evaluate(async()=>{
    const dbPath='/src/core/db.ts';const clientPath='/src/features/names-convert/services/language-client.ts';
    const {db}=await import(/* @vite-ignore */dbPath);
    const {resetLanguage}=await import(/* @vite-ignore */clientPath);
    await db.dictionaries.bulkPut([
      {kind:'vp',name:'Vietphrase.txt',blob:new Blob(['来到=đi tới/đến\n山门=sơn môn/cổng núi']),sha256:'synthetic-vp',updatedAt:1},
      {kind:'names',name:'Names.txt',blob:new Blob(['李明=Lý Minh']),sha256:'synthetic-names',updatedAt:1},
      {kind:'hanviet',name:'HanViet.txt',blob:new Blob(['李=lý\n明=minh\n来=lai\n到=đáo\n山=sơn\n门=môn']),sha256:'synthetic-hv',updatedAt:1},
    ]);resetLanguage();
  });
  await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('dictionary');
}

test('standalone Convert: modes, meanings, lookup and session Names stay local',async({page})=>{
  await openConvert(page);
  const panel=page.getByRole('region',{name:'Convert đoạn chữ Trung'});
  await panel.getByLabel('Văn bản Trung',{exact:true}).fill('李明来到山门。');
  await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();
  await expect(panel.getByLabel('Kết quả Convert')).toContainText('Lý Minh đi tới sơn môn.');
  await panel.getByRole('button',{name:'Tra 山门',exact:true}).click();
  await expect(panel.getByLabel('Tra từ Convert')).toContainText('sơn môn');
  await expect(panel.getByLabel('Tra từ Convert')).toContainText('cổng núi');
  await panel.getByLabel('Tên Việt tạm',{exact:true}).fill('Cổng Tuyết');
  await panel.getByRole('button',{name:'Áp dụng tạm và Convert lại'}).click();
  await expect(panel.getByLabel('Kết quả Convert')).toContainText('Cổng Tuyết');
  await panel.locator('summary').click();
  await expect(panel.getByLabel('Name List tạm',{exact:true})).toHaveValue('山门=Cổng Tuyết');
  const exported=page.waitForEvent('download');await panel.getByRole('button',{name:'Xuất Name List tạm'}).click();
  const download=await exported;expect(await readFile((await download.path())!,'utf8')).toBe('山门=Cổng Tuyết');
  await panel.getByRole('button',{name:'Xóa Name List tạm'}).click();
  await expect(panel.getByLabel('Kết quả Convert')).toBeEmpty();
  await panel.getByLabel('Hiện nhiều nghĩa').check();
  await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();
  await expect(panel.getByLabel('Kết quả Convert')).toContainText('cổng núi');
  await panel.getByLabel('Chế độ Convert',{exact:true}).selectOption('hanviet');
  await expect(panel.getByLabel('Kết quả Convert')).toBeEmpty();
  await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();
  await expect(panel.getByLabel('Kết quả Convert')).toContainText('lai đáo');
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return db.names.count();})).toBe(0);
  await panel.getByLabel('Name List tạm',{exact:true}).fill('李明=Tên giữ lại');
  await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();
  await expect(panel.getByLabel('Kết quả Convert')).not.toBeEmpty();
  await page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.dictionaries.update('vp',{sha256:'changed-vp',updatedAt:2});});
  await expect(panel.getByLabel('Kết quả Convert')).toBeEmpty();
  await expect(panel.getByLabel('Văn bản Trung',{exact:true})).toHaveValue('李明来到山门。');
  await expect(panel.getByLabel('Name List tạm',{exact:true})).toHaveValue('李明=Tên giữ lại');
});

test('Convert preserves Unicode/newlines in TXT output and rejects oversized input',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).__copiedConvert=text;}}}));
  await openConvert(page);
  const panel=page.getByRole('region',{name:'Convert đoạn chữ Trung'});
  const original='李明来到山门。\n🙂\n第二行';
  await panel.getByLabel('Nhập đoạn TXT',{exact:true}).setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(original)});
  await expect(panel.getByLabel('Văn bản Trung',{exact:true})).toHaveValue(original);
  await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();
  await expect(panel.getByLabel('Kết quả Convert')).toContainText('🙂');
  const expected=await panel.getByLabel('Kết quả Convert').textContent();
  await panel.getByRole('button',{name:'Sao chép kết quả'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__copiedConvert)).toBe(expected);
  const exported=page.waitForEvent('download');await panel.getByRole('button',{name:'Tải kết quả TXT'}).click();
  expect(await readFile((await(await exported).path())!,'utf8')).toBe(expected);
  expect(expected).toContain('\n🙂\n');
  await panel.getByLabel('Nhập đoạn TXT',{exact:true}).setInputFiles({name:'large.txt',mimeType:'text/plain',buffer:Buffer.from('中'.repeat(64001))});
  await expect(panel.getByRole('status')).toContainText('vượt 64.000');
  await expect(panel.getByLabel('Văn bản Trung',{exact:true})).toHaveValue(original);
  await expect(panel.getByLabel('Kết quả Convert')).toBeEmpty();
  await panel.getByLabel('Văn bản Trung',{exact:true}).fill('中'.repeat(64001));
  await expect(panel.getByLabel('Văn bản Trung',{exact:true})).toHaveValue(original);
  await expect(panel.getByRole('status')).toContainText('vượt 64.000');
});

test('late Convert and lookup results are discarded after edits or leaving workspace',async({page})=>{
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;const pending:(()=>void)[]=[];
    class DelayedLanguage extends EventTarget {
      postMessage(message:any) {
        const result=message.type==='load'?{}:message.type==='lookup'?{meanings:['old meaning'],hanviet:'old reading'}:[{sourceStart:0,sourceEnd:message.text.length,source:message.text,targetText:'OLD OUTPUT',type:'vp',meanings:[],hanviet:''}];
        const reply=()=>this.dispatchEvent(new MessageEvent('message',{data:{id:message.id,type:'result',result}}));
        if(message.type==='load')queueMicrotask(reply);else pending.push(reply);
      }
      terminate(){}
    }
    (window as any).Worker=function(url:URL,options:WorkerOptions){return String(url).includes('language.worker')?new DelayedLanguage():new NativeWorker(url,options);};
    (window as any).__pendingConvert=()=>pending.length;
    (window as any).__releaseConvert=()=>{while(pending.length)pending.shift()!();};
  });
  await openConvert(page);const panel=page.getByRole('region',{name:'Convert đoạn chữ Trung'});
  await panel.getByLabel('Văn bản Trung',{exact:true}).fill('旧');await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__pendingConvert())).toBe(1);
  await panel.getByLabel('Văn bản Trung',{exact:true}).fill('新');await page.evaluate(()=>(window as any).__releaseConvert());
  await expect(panel.getByLabel('Kết quả Convert')).toBeEmpty();
  await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__pendingConvert())).toBe(1);
  await page.evaluate(()=>(window as any).__releaseConvert());await panel.getByRole('button',{name:'Tra 新',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__pendingConvert())).toBe(1);
  await panel.getByLabel('Chế độ Convert',{exact:true}).selectOption('hanviet');await page.evaluate(()=>(window as any).__releaseConvert());
  await expect(panel.getByLabel('Tra từ Convert')).toHaveCount(0);
  await panel.getByRole('button',{name:'Convert đoạn',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__pendingConvert())).toBe(1);
  const nav=page.getByRole('navigation',{name:'Điều hướng chính'});await nav.getByRole('button',{name:/Tủ sách/}).click();
  await page.evaluate(()=>(window as any).__releaseConvert());await nav.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('dictionary');
  await expect(page.getByRole('region',{name:'Convert đoạn chữ Trung'}).getByLabel('Kết quả Convert')).toBeEmpty();
});

