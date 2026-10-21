import {chromium,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';

const origin='https://thu-phong-private.pages.dev';
const html=await fetch(origin).then(response=>{if(!response.ok)throw new Error('Pages unavailable');return response.text();});
const local=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
if(html.trim()!==local.trim())throw new Error('Production HTML differs from current build');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  for(const viewport of [{width:1280,height:800},{width:522,height:516}]){
    const context=await browser.newContext({viewport});
    const page=await context.newPage();
    await page.goto(origin);
    const nav=page.getByRole('navigation',{name:'Điều hướng chính'});
    await expect(nav.getByRole('button')).toHaveCount(2);
    await nav.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();
    const group=page.getByLabel('Nhóm cài đặt',{exact:true});
    await expect(group).toHaveValue('dictionary');
    await expect(page.getByRole('region',{name:'Convert đoạn chữ Trung'})).toBeVisible();
    await expect(group.locator('option')).toHaveCount(2);
    await expect(page.getByRole('button',{name:'Đồng bộ tất cả truyện',exact:true})).toHaveCount(0);
    await group.selectOption('about');
    await expect(page.getByRole('heading',{name:'Một thư phòng của riêng bạn'})).toBeVisible();
    await nav.getByRole('button',{name:/Tủ sách/}).click();
    await expect(page.getByRole('button',{name:'＋ Thêm truyện TXT',exact:true})).toHaveCount(1);
    await expect(page.locator('.topbar,.local-note,.app-footer,.sidebar-bottom')).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Tủ sách',exact:true})).toHaveCount(1);
    const cards=page.locator('.book-card');
    await expect(cards.first()).toBeVisible({timeout:30000});
    if(await cards.count()){
      for(const index of [0,(await cards.count())-1]){
        const card=cards.nth(index);await card.locator('summary').click();
        const action=card.getByRole('button',{name:'Xóa',exact:true});await action.scrollIntoViewIfNeeded();
        if(!await action.evaluate(element=>{
          const box=element.getBoundingClientRect(),card=element.closest('.book-card').getBoundingClientRect();
          const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
          return box.top>=card.top&&box.bottom<=card.bottom&&box.left>=card.left&&box.right<=card.right&&(hit===element||element.contains(hit));
        }))throw new Error('Card action clipped or covered.');
        await card.locator('summary').click();
      }
      console.log(`Viewport ${viewport.width}: first/last card actions contained and hit-test passed; delete buttons never clicked.`);
    }
    if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error('Horizontal overflow');
    mkdirSync('test-results',{recursive:true});
    await page.screenshot({path:`test-results/minimal-production-${viewport.width}.png`});
    await context.close();
  }
  const response=await fetch(`${origin}/api/cloud/books`);
  if(response.status!==200||response.headers.get('X-Library-Access')!=='public')throw new Error('Anonymous public library unavailable');
  console.log('Production HTML matches build; desktop/mobile two-item navigation and two public settings groups pass; manual backup/sync absent; anonymous cloud 200. No user content uploaded.');
}finally{await browser.close();}
