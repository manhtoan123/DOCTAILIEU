import {test,expect} from '@playwright/test';
test('capture minimal library, reader and settings without horizontal overflow',async({page})=>{
  await page.goto('/');
  await page.screenshot({path:`docs/screenshots/library-${test.info().project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await expect(page.locator('.prose')).toContainText('Một chỗ ngồi bên cửa sổ');
  await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();await page.getByLabel('Font',{exact:true}).selectOption('arial');await page.getByLabel('Nền',{exact:true}).selectOption('sepia');await page.getByRole('button',{name:'Ẩn Cài đặt hiển thị'}).click();
  await page.locator('.reader-header').scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`docs/screenshots/reader-${test.info().project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();
  await expect(page.getByRole('dialog',{name:'Cài đặt hiển thị'})).toBeVisible();
  await page.screenshot({path:`docs/screenshots/settings-${test.info().project.name}.png`});
});
