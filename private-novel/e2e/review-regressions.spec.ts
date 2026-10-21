import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Component/browser regressions: synthetic data and intercepted localhost only.
// This keeps the failure checks independent of Vite's cold module transforms.
let bundle='';
test.beforeAll(async()=>{
  const result=await build({stdin:{contents:"export {db} from './src/core/db';export {largeEpub} from './e2e/fixtures/large-epub';export {OriginalFiles} from './src/features/sync-cloud/components/OriginalFiles';export {PromptStockPanel} from './src/features/ai/components/PromptStockPanel';export {hashBlob} from './src/features/import-export/services/backup';export {AI_DEFAULTS} from './src/features/ai/services/ai-reading';export {getPromptStock,savePromptProfile} from './src/features/ai/prompt/prompt-stock';export {createElement} from 'react';export {createRoot} from 'react-dom/client';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',globalName:'ReviewFixes',platform:'browser',jsx:'automatic'});
  bundle=result.outputFiles[0].text;
});

async function openFixture(page:Page){
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin==='http://localhost'&&url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<html><body><div id="fixture"></div></body></html>'});
    return route.fulfill({status:503,json:{error:'synthetic_offline'}});
  });
  await page.goto('http://localhost/');
  await page.addScriptTag({content:bundle});
}

test('reopening book custom settings retains inherited common prompt and saves it with the book CAS baseline',async({page})=>{
  await openFixture(page);
  await page.evaluate(async()=>{
    const api=(window as any).ReviewFixes;
    await api.db.settings.put({key:'ai-translate-settings',value:{...api.AI_DEFAULTS,userPromptTemplate:'INHERITED COMMON {{text}}'}});
    await api.getPromptStock();
    await api.savePromptProfile({title:'Other',settings:{...api.AI_DEFAULTS,userPromptTemplate:'OTHER {{text}}'}});
    api.createRoot(document.getElementById('fixture')).render(api.createElement(api.PromptStockPanel,{initialBookId:'one',books:[{id:'one',title:'Book one'}]}));
  });
  const prompt=page.getByLabel('User Prompt kho',{exact:true});
  await expect(prompt).toHaveValue('INHERITED COMMON {{text}}');
  await page.getByRole('button',{name:'Chọn prompt Other',exact:true}).click();
  await expect(prompt).toHaveValue('OTHER {{text}}');
  await page.locator('.prompt-card').filter({hasText:'Tùy chỉnh của truyện'}).click();
  await expect(prompt).toHaveValue('INHERITED COMMON {{text}}');
  await page.getByRole('button',{name:'Lưu prompt',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>(await (window as any).ReviewFixes.db.settings.get('ai-book-settings:one'))?.value.userPromptTemplate)).toBe('INHERITED COMMON {{text}}');
});

async function mountOriginal(page:Page,size:number,displayName?:string){
  await openFixture(page);
  await page.evaluate(async({size,displayName})=>{
    const api=(window as any).ReviewFixes,bookId='00000000-0000-4000-8000-000000000091',blob=api.largeEpub(size);
    await api.db.books.put({id:bookId,title:'Synthetic EPUB',author:'',status:'ready',chapterCount:0,charCount:0,createdAt:1,updatedAt:1});
    await api.db.sources.put({id:'00000000-0000-4000-8000-000000000092',bookId,name:blob.name,displayName,relativePath:blob.name,encoding:'epub',blob,bytes:blob.size,sha256:await api.hashBlob(blob)});
    api.createRoot(document.getElementById('fixture')).render(api.createElement(api.OriginalFiles,{bookId}));
  },{size,displayName});
  await page.locator('#fixture summary').click();
  const button=page.locator('#fixture').getByRole('button',{name:`Tải ${displayName||'Large synthetic.epub'}`,exact:true});
  await expect(button).toBeEnabled();
  return button;
}

test('a local EPUB above 40 MiB downloads its original bytes while cloud is unavailable',async({page})=>{
  const button=await mountOriginal(page,41);
  const downloaded=page.waitForEvent('download');
  await button.click();
  const download=await downloaded;
  expect(download.suggestedFilename()).toBe('Large synthetic.epub');
  const expected=await page.evaluate(async()=>(await (window as any).ReviewFixes.db.sources.get('00000000-0000-4000-8000-000000000092')).sha256);
  expect(createHash('sha256').update(await readFile((await download.path())!)).digest('hex')).toBe(expected);
});

test('an old TXT display name downloads EPUB with the correct extension',async({page})=>{
  const button=await mountOriginal(page,1,'Tên Việt.epub.txt');
  const downloaded=page.waitForEvent('download');
  await button.click();
  expect((await downloaded).suggestedFilename()).toBe('Tên Việt.epub');
});
