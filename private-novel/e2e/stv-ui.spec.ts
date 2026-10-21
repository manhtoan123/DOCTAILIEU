import {test,expect} from '@playwright/test';

test('late saved settings hydration cannot overwrite a newer theme edit',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    await db.settings.put({key:'reader',value:{theme:'sepia',font:'times',fontSize:27,width:800,background:'#a3e6a2',textColor:'#ff0000'}});
    const table=db.settings;const get=table.get.bind(table);
    const saved=await get('reader');
    const put=table.put.bind(table);(window as any).readerSettingsWrites=0;
    table.put=(...args:unknown[])=>{(window as any).readerSettingsWrites++;return put(...args);};
    table.get=(key:unknown)=>key==='reader'?new Promise(resolve=>{
      (window as any).releaseReaderSettings=()=>{table.get=get;resolve(saved);};
    }):get(key);
  });
  await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();
  await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();
  await page.getByLabel('Nền',{exact:true}).selectOption('dark');
  await expect(page.locator('.reader')).toHaveClass(/theme-dark/);
  expect(await page.evaluate(()=>(window as any).readerSettingsWrites)).toBe(0);
  await page.evaluate(()=>{(window as any).releaseReaderSettings();});
  // The delayed read resolves with sepia; the user edit must survive it.
  await expect(page.getByLabel('Font',{exact:true})).toHaveValue('times');
  await expect(page.locator('.reader')).toHaveClass(/theme-dark/);
  await expect(page.locator('.prose')).toHaveCSS('max-width','800px');
  await expect(page.locator('.prose')).toHaveCSS('font-size','27px');
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return(await db.settings.get('reader'))?.value;})).toMatchObject({theme:'dark',font:'times',width:800,background:'',textColor:''});
  await page.getByRole('button',{name:'← Tủ sách'}).click();await page.reload();
  await page.getByRole('button',{name:'Mở sách →'}).click();
  await expect(page.locator('.reader')).toHaveClass(/theme-dark/);
});

test('settings read failure is surfaced and cannot overwrite unread saved settings',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);const table=db.settings;
    await table.put({key:'reader',value:{theme:'sepia',font:'times'}});
    (window as any).readSavedReader=table.get.bind(table);const put=table.put.bind(table);
    (window as any).readerSettingsWrites=0;
    // Only the reader key counts: unrelated settings writers (album registry)
    // are not part of this invariant.
    table.put=(...args:unknown[])=>{(window as any).readerSettingsWrites+=((args[0] as {key?:string}|undefined)?.key==='reader'?1:0);return put(...args);};
    table.get=(key:unknown)=>key==='reader'?Promise.reject(new Error('Injected settings read failure')):(window as any).readSavedReader(key);
  });
  await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();
  await expect(page.getByRole('status').filter({hasText:'Không tải được cài đặt: Injected settings read failure'})).toBeVisible();
  await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();await page.getByLabel('Nền',{exact:true}).selectOption('dark');
  await page.getByRole('button',{name:'Ẩn Cài đặt hiển thị'}).click();await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();
  await expect(page.getByRole('button',{name:'Lưu cài đặt',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).readerSettingsWrites)).toBe(0);
  expect(await page.evaluate(async()=>(await(window as any).readSavedReader('reader')).value)).toEqual({theme:'sepia',font:'times'});
  expect(errors).toEqual([]);
});

test('settings write failure is surfaced without an unhandled rejection',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
    await db.settings.put({key:'reader',value:{theme:'sepia',font:'times'}});
    db.settings.put=()=>Promise.reject(new Error('Injected settings write failure'));
  });
  await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();
  await expect(page.getByLabel('Font',{exact:true})).toHaveValue('times');await page.getByLabel('Nền',{exact:true}).selectOption('dark');
  await expect(page.getByRole('status').filter({hasText:'Không lưu được cài đặt: Injected settings write failure'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('settings hydration resolved after leaving the reader is ignored',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);const table=db.settings;
    await table.put({key:'reader',value:{theme:'dark',font:'times'}});const get=table.get.bind(table);const row=await get('reader');
    const put=table.put.bind(table);(window as any).readerSettingsWrites=0;
    table.put=(...args:unknown[])=>{(window as any).readerSettingsWrites++;return put(...args);};
    table.get=(key:unknown)=>key==='reader'?new Promise(resolve=>{(window as any).releaseReaderSettings=()=>{table.get=get;resolve(row);};}):get(key);
  });
  await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await page.getByRole('button',{name:'← Tủ sách'}).click();
  await page.evaluate(async()=>{(window as any).releaseReaderSettings();await new Promise(resolve=>requestAnimationFrame(resolve));});
  expect(await page.evaluate(()=>(window as any).readerSettingsWrites)).toBe(0);
  await page.getByRole('button',{name:'Mở sách →'}).click();await expect(page.locator('.reader')).toHaveClass(/theme-dark/);
  expect(errors).toEqual([]);
});

test('pending settings writes from an old reader cannot overwrite newer edits after reopening',async({page})=>{
  await page.goto('/');await page.evaluate(async()=>{
    const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);const table=db.settings;
    await table.put({key:'reader',value:{theme:'sepia',font:'arial',width:800}});
    const put=table.put.bind(table);let writes=0;(window as any).readerWriteStarted=false;
    table.put=(...args:unknown[])=>{
      if(++writes===1){(window as any).readerWriteStarted=true;return new Promise((resolve,reject)=>{
        (window as any).releaseReaderWrite=()=>put(...args).then(resolve,reject);
      });}
      return put(...args);
    };
  });
  await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();
  await expect(page.locator('.prose')).toHaveCSS('max-width','800px');
  await page.getByLabel('Nền',{exact:true}).selectOption('dark');
  await expect.poll(()=>page.evaluate(()=>(window as any).readerWriteStarted)).toBe(true);
  await page.getByLabel('Font',{exact:true}).selectOption('times');
  await page.getByRole('button',{name:'← Tủ sách'}).click();await page.getByRole('button',{name:'Mở sách →'}).click();
  await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();await page.getByLabel('Nền',{exact:true}).selectOption('gray');
  await page.evaluate(()=>{(window as any).releaseReaderWrite();});
  await expect(page.getByLabel('Font',{exact:true})).toHaveValue('times');
  await expect(page.locator('.reader')).toHaveClass(/theme-gray/);
  await expect.poll(()=>page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return(await db.settings.get('reader'))?.value;})).toMatchObject({theme:'gray',font:'times',width:800});
  await page.getByRole('button',{name:'← Tủ sách'}).click();await page.reload();await page.getByRole('button',{name:'Mở sách →'}).click();
  await expect(page.locator('.reader')).toHaveClass(/theme-gray/);
});

test('STV controls hide, retain settings and recover from reading-only mode',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();
  await page.getByLabel('Nền',{exact:true}).selectOption('dark');await page.getByLabel('Font',{exact:true}).selectOption('times');
  await expect(page.locator('.reader')).toHaveClass(/theme-dark/);await expect(page.locator('.prose')).toHaveCSS('font-family',/Times New Roman/);
  await page.getByRole('button',{name:'Ẩn Cài đặt hiển thị'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Chỉ đọc',exact:true})).toHaveCount(0);await expect(page.locator('.reader-actions')).toBeVisible();
  await expect(page.getByRole('button',{name:'Hiện thanh công cụ'})).toHaveCount(0);
  await page.getByRole('button',{name:'← Tủ sách'}).click();await page.reload();await page.getByRole('button',{name:'Mở sách →'}).click();
  await expect(page.locator('.reader')).toHaveClass(/theme-dark/);await expect(page.locator('.prose')).toHaveCSS('font-family',/Times New Roman/);
  await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Cài đặt đọc truyện'})).toBeFocused();
});

test('Name panel keeps hidden draft; Convert and word editing are enabled by default',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'＋ Thêm truyện TXT'}).click();await page.getByLabel('Tên truyện').fill('Tên riêng');await page.getByLabel('Hoặc dán nội dung').fill('Chương 1: Thử Name\n张三来了。\nChương 2: Tiếp\n张三回家。');await page.getByRole('button',{name:'Nhập truyện'}).click();
  await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();await page.getByRole('button',{name:'✎ Name',exact:true}).click();await page.locator('.name-manager-advanced summary').click();await page.getByLabel('Nội dung Name List').fill('张三=Trương Tam');await page.getByRole('button',{name:'Ẩn Name riêng của truyện'}).click();
  await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();await page.getByRole('button',{name:'✎ Name',exact:true}).click();await page.locator('.name-manager-advanced summary').click();await expect(page.getByLabel('Nội dung Name List')).toHaveValue('张三=Trương Tam');await page.getByRole('button',{name:'Lưu nhiều tên',exact:true}).click();await page.getByRole('button',{name:'Ẩn Name riêng của truyện'}).click();
  await expect(page.locator('.prose')).toContainText('Trương Tam');await expect(page.locator('.word-token').filter({hasText:'Trương Tam'})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Convert',exact:true})).toHaveCount(1);await expect(page.getByRole('button',{name:'Convert',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:/Sửa từ:/})).toHaveCount(0);
  await page.locator('.word-token').filter({hasText:'Trương Tam'}).click();
  await expect(page.getByRole('dialog',{name:'Chỉnh Name'})).toBeVisible();await expect(page.getByLabel('Chữ Trung',{exact:true})).toHaveValue('张三');
  await page.getByLabel('Cụm từ tùy chọn',{exact:true}).fill('Tên Tạm');await page.getByRole('button',{name:'Áp dụng cụm từ tùy chọn',exact:true}).click();
  await expect(page.locator('.prose')).toContainText('Tên Tạm');await expect(page.locator('.word-token').filter({hasText:'Tên Tạm'})).toBeVisible();
});

test('speech panel discloses remote text and reports missing audio gateway',async({page})=>{
  await page.route('https://ottsy.weilbyte.dev/api/generation',route=>route.fulfill({contentType:'text/html',body:'<html>Gateway unavailable</html>'}));
  await page.goto('/');await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();
  await expect(page.getByLabel('Đồng ý gửi câu đang đọc đến gateway TTS')).toHaveCount(0);await expect(page.getByRole('button',{name:'▶ Nghe TikTok',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'▶ Nghe TikTok',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Gateway chưa trả JSON âm thanh'})).toBeVisible();
  await page.getByRole('button',{name:/Câu \(/}).click();await expect(page.getByRole('dialog',{name:'Sửa câu đọc trong phiên'})).toBeVisible();await expect(page.getByRole('dialog',{name:'Nghe sách',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
