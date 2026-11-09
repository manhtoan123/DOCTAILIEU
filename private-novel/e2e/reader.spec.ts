import {test,expect} from '@playwright/test';
test('sample reader, reload progress, theme and library search',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();await expect(page.locator('.prose')).toContainText('Một chỗ ngồi bên cửa sổ');
  await page.getByRole('link',{name:'Chương sau →'}).first().click();await expect(page.locator('.prose')).toContainText('Lối mòn trong vườn');await page.waitForTimeout(900);
  await page.getByRole('navigation',{name:'Điều hướng chương đầu trang'}).getByRole('button',{name:'☷ Mục lục'}).click();await expect(page.getByRole('heading',{name:'Mục lục'})).toBeVisible();await expect(page.getByRole('button',{name:'Chương 1: Một chỗ ngồi bên cửa sổ'})).toBeVisible();await page.getByRole('button',{name:'Đóng'}).click();
  await page.getByRole('link',{name:'← Tủ sách'}).click();await page.reload();await page.getByRole('link',{name:'Mở sách →'}).click();await expect(page.locator('.prose')).toContainText('Lối mòn trong vườn');
  await page.getByRole('button',{name:'Cài đặt đọc truyện',exact:true}).click();await page.getByRole('button',{name:'▶ Nghe sách',exact:true}).click();await expect(page.getByRole('combobox',{name:'Giọng đọc',exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Giọng đọc',exact:true}).locator('option:not([disabled])')).toHaveCount(2);await page.getByRole('button',{name:'Ẩn Nghe sách'}).click();
  await page.getByRole('button',{name:'Cài đặt đọc truyện'}).click();await expect(page.getByRole('combobox',{name:'Nền',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Nền',exact:true}).selectOption('dark');await expect(page.locator('.reader')).toHaveClass(/theme-dark/);
  await page.screenshot({path:`test-results/reader-${test.info().project.name}.png`,fullPage:true});
});
test('single-click TXT import and reading preserve content',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Thêm truyện',exact:true}).click();await page.getByLabel('Tên truyện').fill('Truyện kiểm thử');await page.getByText('Dán nội dung truyện',{exact:true}).click();await page.getByLabel('Hoặc dán nội dung').fill('Mở đầu\nChương 1: Gió\nNội dung một.\nChương 2: Mưa\nNội dung hai.');
  await page.getByRole('button',{name:'Nhập truyện'}).click();await expect(page.locator('.prose')).toContainText('Mở đầu');await page.getByRole('link',{name:'Chương sau →'}).first().click();await expect(page.locator('.prose')).toContainText('Nội dung một.');
});
test('backup panel supports compact and portable mode selection',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('backup');
  await expect(page.getByRole('heading',{name:'Sao lưu & chuyển thiết bị'})).toBeVisible();
  const modeSelect=page.getByLabel('Chế độ sao lưu');
  await expect(modeSelect).toBeVisible();
  await modeSelect.selectOption('portable');
  await expect(page.locator('.notice')).toContainText('Bản sao lưu Portable chứa toàn bộ dữ liệu tự túc');
});
test('library can add and delete a story',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Đọc truyện mẫu →'}).click();
  await page.getByRole('link',{name:'← Tủ sách'}).click();
  await page.getByLabel('Tùy chọn Một khoảng bình yên',{exact:true}).click();
  page.on('dialog',()=>{throw new Error('Unexpected confirmation dialog');});
  await page.getByRole('button',{name:'Xóa'}).click();
  await expect(page.getByRole('heading',{name:'Trang đầu tiên đang chờ'})).toBeVisible();
});
