import {test,expect} from '@playwright/test';

async function seedSearchBooks(page:import('@playwright/test').Page){
  await page.evaluate(async()=>{
    const database=await new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open('thu-phong-v1');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    try{
      await new Promise<void>((resolve,reject)=>{
        const transaction=database.transaction(['books','chapters'],'readwrite');
        const books=transaction.objectStore('books'),chapters=transaction.objectStore('chapters');
        const rows=[
          {id:'fuzzy-author',title:'Bản ghi ưu tiên gần đây',displayTitle:'Bản ghi ưu tiên gần đây',author:'Phàm Nhân',album:'Tác giả/Phàm Nhân',status:'ready',createdAt:1,updatedAt:20,chapterCount:1,charCount:12},
          {id:'fuzzy-vietnamese',title:'仙逆',displayTitle:'Nghịch Tiên',author:'Người Khác',album:'Tác giả/Huyền Huyễn',status:'ready',createdAt:2,updatedAt:10,chapterCount:1,charCount:12},
          {id:'fuzzy-chinese',title:'重生之我是大佬',displayTitle:'Ta Là Đại Lão',author:'Mộ Dung Liễu',album:'Tác giả/Trùng Sinh',status:'ready',createdAt:3,updatedAt:5,chapterCount:1,charCount:12},
          {id:'fuzzy-title-priority',title:'Lâm Viễn Trở Về',displayTitle:'Lâm Viễn Trở Về',author:'Người Khác',album:'Tác giả/Khác',status:'ready',createdAt:4,updatedAt:1,chapterCount:1,charCount:12},
          {id:'fuzzy-author-priority',title:'Tác Phẩm Khác',displayTitle:'Tác Phẩm Khác',author:'Nghịch Tiên',album:'Tác giả/Khác',status:'ready',createdAt:5,updatedAt:30,chapterCount:1,charCount:12},
        ];
        for(const book of rows){books.put(book);chapters.put({id:`${book.id}-chapter`,bookId:book.id,title:'Chương mở đầu',displayTitle:'Chương mở đầu',order:0,text:'Synthetic chapter text.',revision:1,sourceId:''});}
        transaction.oncomplete=()=>resolve();
        transaction.onerror=()=>reject(transaction.error);
      });
    }finally{database.close();}
  });
}

test('fuzzy metadata fallback preserves exact search and ranks title ahead of author',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'isolated fuzzy-search fixture'}}));
  await page.goto('/phong-toi?album=T%C3%A1c%20gi%E1%BA%A3');
  await page.getByRole('button',{name:'Thêm truyện',exact:true}).waitFor();
  await seedSearchBooks(page);
  await page.reload();
  const search=page.getByRole('searchbox',{name:'Tìm truyện trong Tác giả'});
  const cards=page.locator('.book-card');
  const resultStatus=page.locator('p.muted[role="status"]').last();

  await search.fill('nghich tien');
  await expect(cards).toHaveCount(2);
  await expect(resultStatus).toContainText('2 kết quả');
  await expect(resultStatus).not.toContainText('gần đúng');

  await search.fill('nghich tienn');
  await expect(resultStatus).toContainText('khớp gần đúng');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Nghịch Tiên');
  await expect(cards.nth(1)).toContainText('Tác Phẩm Khác');

  for(const [query,title] of [['phamm nhan','Bản ghi ưu tiên gần đây'],['huyen huyehn','Nghịch Tiên'],['重生之我是不佬','Ta Là Đại Lão']] as const){
    await search.fill(query);
    await expect(resultStatus).toContainText('khớp gần đúng');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(title);
  }

  await search.fill('xy');
  await expect(cards).toHaveCount(0);
  await expect(resultStatus).toContainText('0 kết quả');
  await expect(resultStatus).not.toContainText('gần đúng');
});
