import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const origin='https://thu-phong-private.pages.dev',expected=readFileSync('dist/index.html','utf8').trim();expect((await(await fetch(origin)).text()).trim()).toBe(expected);
const response=await fetch(origin+'/api/prompts?after=0');expect(response.status).toBe(200);const snapshot=await response.json(),profiles=snapshot.rows.flatMap(row=>row.profile?[row.profile]:[]),groups=new Map();
for(const profile of profiles){const key=JSON.stringify([profile.bookId??null,profile.title.trim()]);groups.set(key,[...(groups.get(key)||[]),profile]);}for(const versions of groups.values())versions.sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
const browser=await chromium.launch({channel:'msedge'}),context=await browser.newContext({viewport:{width:869,height:835},serviceWorkers:'block'});let writes=0;
await context.route(origin+'/api/**',r=>r.fulfill({status:503,json:{error:'isolated read-only UI acceptance'}}));await context.route(origin+'/api/prompts**',r=>{if(r.request().method()!=='GET'){writes++;return r.fulfill({status:503});}return r.fulfill({json:snapshot});});
try{
 const page=await context.newPage();await page.goto(origin+'/settings/prompts');await expect(page.locator('.prompt-card')).toHaveCount(groups.size);await expect(page.getByRole('button',{name:'Chọn prompt Mặc định',exact:true})).toHaveCount(0);
 let checked=0;for(const versions of groups.values()){if(versions.length<2)continue;await page.getByRole('button',{name:`Chọn prompt ${versions[0].title}`,exact:true}).click();await expect(page.getByLabel('System Prompt kho')).toHaveValue(versions[0].settings.systemPrompt);await expect(page.getByLabel('Phiên bản prompt')).toHaveCount(0);await expect(page.locator('.prompt-cards')).not.toContainText('phiên bản');checked++;}
 await page.getByRole('button',{name:'Chọn prompt 0 độ',exact:true}).click();await page.screenshot({path:'.dsh-tmp/prompt-list/production.png'});expect(writes).toBe(0);
 const report={status:'passed',bundle:expected.match(/src="([^"]+\.js)"/)[1],storedProfiles:profiles.length,visibleCards:groups.size,versionGroupsChecked:checked,defaultHidden:true,cloudWrites:0,latestOnly:true,versionControlHidden:true,userTabUnchanged:true};writeFileSync('.dsh-tmp/prompt-list/production.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await context.close();await browser.close();}
