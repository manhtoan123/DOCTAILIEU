import {test,expect,type Page} from '@playwright/test';

const KEY_ONE='AIza'+'S'.repeat(35), KEY_TWO='AIza'+'T'.repeat(35), GROQ='gsk_'+'u'.repeat(48);

async function seed(page:Page){
  await page.route('**/api/library**',r=>r.fulfill({json:{books:[],deleted:[],public:true}}));
  await page.route('**/api/dictionaries',r=>r.fulfill({json:{dictionaries:[]}}));
  await page.goto('/');
  await page.evaluate(async()=>{
    const {db}=await import('/src/core/db.ts');
    await db.books.put({id:'keybook',title:'Key fixture',author:'',status:'ready',chapterCount:1,charCount:8,createdAt:1,updatedAt:1});
    await db.chapters.put({id:'key-1',bookId:'keybook',order:0,title:'第1章',text:'林儿你好。',revision:1,sourceId:''});
  });
  await page.goto('/read/keybook/key-1');
  await expect(page.locator('.prose')).toBeVisible();
  await page.getByRole('button',{name:'Tùy chỉnh prompt và model'}).click();await page.getByRole('button',{name:'Cài đặt dịch AI'}).click();await page.locator('.ai-keys-details>summary').click();
}

test('key list stays masked, add and delete round-trip without echoing the key',async({page})=>{
  const posted:string[]=[],deleted:string[]=[];
  await page.route('**/api/ai/keys**',async route=>{
    const method=route.request().method();
    if(method==='GET')return route.fulfill({json:{keys:[{id:'row-1',label:'',masked:'…AAAA',createdAt:1}],stored:1,secretPool:19,active:20}});
    if(method==='POST'){
      posted.push(route.request().postDataJSON().text);
      return route.fulfill({json:{keys:[{id:'row-1',label:'',masked:'…AAAA',createdAt:1},{id:'row-2',label:'team',masked:'…BBBB',createdAt:2}],stored:2,secretPool:19,active:21,added:1,rejected:1}});
    }
    deleted.push(new URL(route.request().url()).searchParams.get('id')??'');
    return route.fulfill({json:{keys:[{id:'row-2',label:'team',masked:'…BBBB',createdAt:2}],stored:1,secretPool:19,active:20,removed:true}});
  });
  await seed(page);

  await expect(page.getByText('API keys (20 đang dùng)')).toBeVisible();
  await expect(page.getByText('Trang này đang công khai: ai có URL cũng thêm/xoá được key.')).toBeVisible();
  const list=page.getByLabel('Danh sách key đã lưu');
  await expect(list.getByText('…AAAA')).toBeVisible();
  expect(await page.content()).not.toContain(KEY_ONE);

  await page.getByLabel('Dán key Gemini').fill(`${KEY_ONE}\n${GROQ}\n${KEY_TWO}`);
  await page.getByRole('button',{name:'Thêm key',exact:true}).click();
  await expect(list.getByText('…BBBB')).toBeVisible();
  await expect(page.getByText('API keys (21 đang dùng)')).toBeVisible();
  expect(posted).toEqual([`${KEY_ONE}\n${GROQ}\n${KEY_TWO}`]);
  expect(await page.content()).not.toContain(KEY_TWO);

  await page.getByRole('button',{name:'Xoá key …AAAA',exact:true}).click();
  await expect(list.getByText('…AAAA')).toHaveCount(0);
  expect(deleted).toEqual(['row-1']);
});
