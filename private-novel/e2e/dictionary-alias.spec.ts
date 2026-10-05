import {test,expect} from '@playwright/test';

test('dictionary picker recognizes pronoun aliases and skips unrelated auxiliary files',async({page})=>{
  await page.goto('/');await page.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('button',{name:/Từ điển/}).click();
  const picker=page.getByLabel('Chọn file TXT (có thể chọn nhiều)');
  for(const name of ['DaiTuNhanXung.txt','Names2.txt','Pronouns.txt']){
    await picker.setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from('测试=Fixture name\n')});
    await expect(page.locator('select').first()).toHaveValue('names2');
    await page.getByRole('button',{name:'Lưu 1 file vào trình duyệt'}).click();
    await expect.poll(()=>page.evaluate(async()=>{
      const path='/src/db.ts';const {db}=await import(/* @vite-ignore */path);
      const dictionary=await db.dictionaries.get('names2');
      return dictionary?{name:dictionary.name,text:await dictionary.blob.text()}:null;
    })).toEqual({name,text:'测试=Fixture name\n'});
  }
  await picker.setInputFiles({name:'Blacklist.txt',mimeType:'text/plain',buffer:Buffer.from('测试=Unrelated fixture\n')});
  await expect(page.getByText(/Không nhận biết loại: Blacklist\.txt/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Lưu 1 file vào trình duyệt'})).toHaveCount(0);
});
