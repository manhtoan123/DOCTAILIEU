import {chromium} from '@playwright/test';
import {join} from 'node:path';
import {stat} from 'node:fs/promises';
const directory=process.argv[2];if(!directory)throw new Error('Provide explicitly selected local dictionary directory.');
const names=['Vietphrase.txt','Names.txt','HanViet.txt','DaiTuNhanXung.txt'];
const paths=names.map(name=>join(directory,name));
const sizes=await Promise.all(paths.map(async path=>(await stat(path)).size));
const browser=await chromium.launch({channel:'msedge'});
try {
 const context=await browser.newContext();const page=await context.newPage();await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'⚙ Cài đặt',exact:true}).click();await page.getByLabel('Nhóm cài đặt',{exact:true}).selectOption('dictionary');
 await page.getByLabel('Chọn file TXT (có thể chọn nhiều)').setInputFiles(paths);
 const start=Date.now();await page.getByRole('button',{name:/Lưu 4 file vào trình duyệt/}).click();
 await page.getByRole('status').filter({hasText:'Đã lưu 4 file'}).waitFor({timeout:180000});const installMs=Date.now()-start;
 const result=await page.evaluate(async()=>{
  const client=await import('/src/features/names-convert/services/language-client.ts');const delays=[];let last=performance.now();const timer=setInterval(()=>{const now=performance.now();delays.push(now-last);last=now;},100);
  try {const start=performance.now();const stats=await client.loadDictionaries();const loadMs=performance.now()-start;const t=performance.now();const tokens=await client.convert('中国人民来到山门。',[]);return {stats,loadMs,convertMs:performance.now()-t,output:tokens.map(t=>t.targetText).join(''),maxMainTimerGapMs:Math.max(0,...delays),mainHeapBytes:performance.memory?.usedJSHeapSize??null};}finally{clearInterval(timer);client.resetLanguage();}
 });
 console.log(JSON.stringify({platform:'Windows Edge fresh browser context',sizes,installMs,...result,memoryScope:'main page only; worker total memory NOT measured'},null,2));await context.close();
} finally {await browser.close();}
