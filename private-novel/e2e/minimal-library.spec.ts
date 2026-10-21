import {test,expect} from '@playwright/test';

test('two main destinations; all settings groups remain accessible',async({page})=>{
  await page.route('**/api/**',r=>r.fulfill({status:503}));await page.goto('/');
  const nav=page.getByRole('navigation',{name:'Điều hướng chính'});
  await expect(nav.getByRole('button')).toHaveCount(2);
  await nav.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();
  const group=page.getByLabel('Nhóm cài đặt',{exact:true});
  await expect(group).toHaveValue('dictionary');
  await expect(page.getByRole('heading',{name:'Từ điển & Convert',exact:true})).toBeVisible();await group.selectOption('ai');await expect(page.getByRole('heading',{name:'Dịch AI & Prompt',exact:true})).toBeVisible();
  await group.selectOption('about');
  await expect(page.getByRole('heading',{name:'Một thư phòng của riêng bạn'})).toBeVisible();
  await nav.getByRole('button',{name:/Tủ sách/}).click();
  await expect(group).toHaveCount(0);
  await nav.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();
  await expect(group).toHaveValue('about');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/settings-groups-${test.info().project.name}.png`});
});

test('one import entry; card options preserve editing and cancellation',async({page})=>{
  await page.route('**/api/**',r=>r.fulfill({status:503}));await page.goto('/');
  await expect(page.getByRole('button',{name:'＋ Thêm truyện TXT / EPUB',exact:true})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Chọn file TXT',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Sao lưu →',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Đọc truyện mẫu →',exact:true}).click();
  await page.getByRole('button',{name:'← Tủ sách',exact:true}).click();
  const card=page.locator('.book-card');
  await expect(card.getByRole('button',{name:'Sửa',exact:true})).toBeHidden();
  const options=page.getByLabel('Tùy chọn Một khoảng bình yên', {exact:true});
  await options.focus();await page.keyboard.press('Enter');
  await page.getByRole('dialog',{name:'Tùy chọn Một khoảng bình yên',exact:true}).getByRole('button',{name:'Sửa thông tin',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Thông tin truyện',exact:true});
  await editor.getByLabel('Tên truyện', {exact:true}).fill('Truyện đã đổi tên');
  await editor.getByRole('button',{name:'Lưu',exact:true}).click();
  await expect(card.getByRole('heading')).toHaveText('Truyện đã đổi tên');

  await page.getByRole('button',{name:'Tùy chọn Truyện đã đổi tên',exact:true}).click();await expect(page.getByRole('dialog',{name:'Tùy chọn Truyện đã đổi tên',exact:true}).getByRole('button',{name:'Xóa truyện',exact:true})).toBeVisible();await page.getByRole('dialog',{name:'Tùy chọn Truyện đã đổi tên',exact:true}).press('Escape');
  await page.reload();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card').getByRole('heading')).toHaveText('Truyện đã đổi tên');
  await expect(page.getByRole('button',{name:'Xóa',exact:true})).toBeHidden();
  await page.getByRole('button',{name:'Mở sách →',exact:true}).click();
  await expect(page.locator('.prose')).toContainText('Một chỗ ngồi bên cửa sổ');
});
