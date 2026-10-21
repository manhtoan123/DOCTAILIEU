import {test,expect,type Page} from '@playwright/test';

async function openSample(page:Page){
  await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();
  await expect(page.locator('.prose')).toContainText('Một chỗ ngồi bên cửa sổ');
}
async function expectNoOverflow(page:Page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
async function savedSettings(page:Page){
  return page.evaluate(async()=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);return (await db.settings.get('reader'))?.value;});
}

test('fresh display preset fits 320px and advanced settings support keyboard and Escape',async({page})=>{
  await page.setViewportSize({width:320,height:524});await page.goto('/');await openSample(page);
  const prose=page.locator('.prose');
  await expect(prose).toHaveCSS('font-size','19px');await expect(prose).toHaveCSS('max-width','760px');
  expect(await prose.evaluate(element=>parseFloat(getComputedStyle(element).lineHeight))).toBeCloseTo(31.35,1);
  await expectNoOverflow(page);
  const settingsButton=page.getByRole('button',{name:'Cài đặt đọc truyện'});
  await settingsButton.focus();await page.keyboard.press('Enter');
  const panel=page.getByRole('dialog',{name:'Cài đặt hiển thị',exact:true});
  await expect(panel).toBeVisible();await expect(page.getByRole('button',{name:'Ẩn Cài đặt hiển thị'})).toBeFocused();
  await expect(page.getByLabel('Cỡ chữ',{exact:true})).toBeVisible();await expect(page.getByLabel('Giãn dòng',{exact:true})).toBeVisible();
  expect(await page.getByLabel('Giãn dòng',{exact:true}).evaluate(element=>(element as HTMLInputElement).validity.valid)).toBe(true);
  await page.getByRole('button',{name:'Tăng giãn dòng',exact:true}).click();await expect(page.getByLabel('Giãn dòng',{exact:true})).toHaveValue('1.75');
  await page.getByRole('button',{name:'Giảm giãn dòng',exact:true}).click();await expect(page.getByLabel('Giãn dòng',{exact:true})).toHaveValue('1.65');
  await expect(page.getByLabel('Font',{exact:true})).toBeVisible();await expect(page.getByLabel('Nền',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Màu nền tùy chọn')).toBeHidden();await expect(page.getByLabel('Bóng chữ nhẹ')).toBeHidden();
  const advanced=panel.locator('summary').filter({hasText:'Hiển thị nâng cao'});
  await advanced.focus();await page.keyboard.press('Enter');
  await expect(page.getByLabel('Màu nền tùy chọn')).toBeVisible();await expect(page.getByLabel('Bóng chữ nhẹ')).toBeVisible();
  await expectNoOverflow(page);await page.keyboard.press('Escape');await expect(panel).toBeHidden();await expect(settingsButton).toBeFocused();
  await settingsButton.press('Enter');await expect(page.getByLabel('Màu nền tùy chọn')).toBeHidden();
  await expectNoOverflow(page);
});

for(const fontSize of [22,40]){
  test(`saved ${fontSize}px/800px settings survive opening and explicit reset preserves speech`,async({page})=>{
    await page.setViewportSize({width:320,height:524});await page.goto('/');
    const speech={voiceId:'saved-custom-voice',ttsRate:1.3,ttsPitch:0.8,ttsFlex:4,highlightColor:'#aabbcc'};
    const settings={theme:'dark',font:'times',fontSize,lineHeight:2,width:800,background:'#123456',textColor:'#abcdef',align:'justify',textShadow:true,...speech};
    await page.evaluate(async settings=>{const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);await db.settings.put({key:'reader',value:settings});},settings);
    await openSample(page);
    await expect(page.locator('.prose')).toHaveCSS('font-size',`${fontSize}px`);await expect(page.locator('.prose')).toHaveCSS('max-width','800px');
    await expect(page.locator('.prose')).toHaveCSS('line-height',`${fontSize*2}px`);await expectNoOverflow(page);
    await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();
    await expect(page.getByLabel('Cỡ chữ',{exact:true})).toHaveValue(String(fontSize));await expect(page.getByLabel('Font',{exact:true})).toHaveValue('times');
    await expect.poll(()=>savedSettings(page)).toEqual(settings);
    await page.getByRole('button',{name:'Mặc định hiển thị',exact:true}).click();
    await expect(page.locator('.prose')).toHaveCSS('font-size','19px');await expect(page.locator('.prose')).toHaveCSS('max-width','760px');
    await expect(page.getByLabel('Giãn dòng',{exact:true})).toHaveValue('1.65');await expect(page.getByLabel('Font',{exact:true})).toHaveValue('arial');
    await expect.poll(()=>savedSettings(page)).toMatchObject({...speech,theme:'sepia',font:'arial',fontSize:19,lineHeight:1.65,width:760,background:'',textColor:'',align:'left',textShadow:false});
    await expectNoOverflow(page);await page.keyboard.press('Escape');await page.getByRole('button',{name:'← Tủ sách'}).click();await page.reload();
    await page.getByRole('button',{name:'Mở sách →'}).click();await expect(page.locator('.prose')).toHaveCSS('font-size','19px');
    await expect.poll(()=>savedSettings(page)).toMatchObject({...speech,fontSize:19,lineHeight:1.65,width:760});
  });
}
