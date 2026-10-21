import {test,expect} from '@playwright/test';

test('dictionary picker recognizes pronoun aliases and skips unrelated auxiliary files',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('dictionary');
  const picker=page.getByLabel('Chọn file TXT (có thể chọn nhiều)');
  for(const name of ['DaiTuNhanXung.txt','Names2.txt','Pronouns.txt']){
    await picker.setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from('测试=Fixture name\n')});
    const kind=name==='Names2.txt'?'names2':'pronouns';
    await expect(page.locator('.dictionary-list select').first()).toHaveValue(kind);
    await page.getByRole('button',{name:'Lưu 1 file vào trình duyệt'}).click();
    await expect.poll(()=>page.evaluate(async(kind)=>{
      const path='/src/core/db.ts';const {db}=await import(/* @vite-ignore */path);
      const dictionary=await db.dictionaries.get(kind);
      return dictionary?{name:dictionary.name,text:await dictionary.blob.text()}:null;
    },kind)).toEqual({name,text:'测试=Fixture name\n'});
  }
  await picker.setInputFiles({name:'Blacklist.txt',mimeType:'text/plain',buffer:Buffer.from('测试=Unrelated fixture\n')});
  await expect(page.locator('.dictionary-list select').first()).toHaveValue('blacklist');
  await page.getByRole('button',{name:'Lưu 1 file vào trình duyệt'}).click();
  await expect(page.getByRole('status').filter({hasText:'Đã lưu 1 file'})).toBeVisible();
});
