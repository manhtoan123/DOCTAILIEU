import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'isolated import regression'}}));await page.goto('/');});
test('TXT preview and worker import remove banners but retain source bytes/hash',async({page})=>{
 const result=await page.evaluate(async()=>{
  const importerPath='/src/features/import-export/services/importer.ts',dbPath='/src/core/db.ts';
  const {importFiles}=await import(/* @vite-ignore */importerPath),{db}=await import(/* @vite-ignore */dbPath);
  const raw='-----\r\n本文件来自尚香书院。\r\n发布页：sxsy.org\r\n-----\r\nChapter 1\r\nA neutral journey.\r\nChapter 2\r\nThe sign mentioned sxsy.org in dialogue.\r\n';
  const file=new File([raw],'[sxsy.org] Journey.txt');
  const preview=await new Promise<any>((resolve,reject)=>{const worker=new Worker('/src/workers/import.worker.ts',{type:'module'});worker.onmessage=({data})=>{if(data.type==='preview_done'){worker.terminate();resolve(data);}else if(data.type==='preview_error'){worker.terminate();reject(Error(data.message));}};worker.onerror=()=>{worker.terminate();reject(Error('worker failed'));};worker.postMessage({type:'preview',file,encoding:'utf-8',pattern:'',maxChars:64000});});
  const {id}=await importFiles([file],'[sxsy.org] Journey','utf-8','',true,()=>{},new AbortController().signal);
  const book=await db.books.get(id),chapters=await db.chapters.where('bookId').equals(id).sortBy('order'),source=await db.sources.where('bookId').equals(id).first();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
  return {title:book.title,chapters:chapters.map(c=>c.text),previewCount:preview.chapterCount,previewChars:preview.totalChars,charCount:book.charCount,sourceText:await source.blob.text(),raw,hashMatches:hash===source.sha256,sourceName:source.name};
 });
 expect(result.title).toBe('Journey');expect(result.chapters).toHaveLength(2);expect(result.previewCount).toBe(2);expect(result.previewChars).toBe(result.charCount);
 expect(result.chapters.join('')).toBe('Chapter 1\nA neutral journey.\nChapter 2\nThe sign mentioned sxsy.org in dialogue.\n');expect(result.sourceText).toBe(result.raw);expect(result.hashMatches).toBe(true);expect(result.sourceName).toBe('[sxsy.org] Journey.txt');
});
test('EPUB import cleans leaf ads while preserving formatting, media and default existing render behavior',async({page})=>{
 const result=await page.evaluate(async()=>{
  const docPath='/src/features/import-export/services/document-convert.ts',importPath='/src/features/import-export/services/epub-import.ts',modelPath='/src/features/import-export/services/epub-model.ts',dbPath='/src/core/db.ts';
  const {packageDocument}=await import(/* @vite-ignore */docPath),{importEpub}=await import(/* @vite-ignore */importPath),{sanitizeEpubChapter}=await import(/* @vite-ignore */modelPath),{db}=await import(/* @vite-ignore */dbPath);
  const html='<section><p>-----</p><p>本文件来自<strong>尚香书院</strong>。</p><p>发布页：sxsy.org</p><p>-----</p><p>A <em>neutral</em> journey.</p><p>Visit <a href="https://example.test">sxsy.org</a> for details.</p><p><img src="image1.png"/>Image caption.</p></section>';
  const file=packageDocument({sections:[{title:'[sxsy.org] Chapter 1',html}],assets:{'image1.png':new Uint8Array([137,80,78,71])}},'[sxsy.org] Journey');
  const {id}=await importEpub(file,'',()=>{},new AbortController().signal);
  const book=await db.books.get(id),chapter=await db.chapters.where('bookId').equals(id).first(),source=await db.sources.where('bookId').equals(id).first();
  const body=new DOMParser().parseFromString(chapter.epub.body,'application/xml');
  return {title:book.title,chapterTitle:chapter.title,text:chapter.text,em:body.querySelector('em')?.textContent,images:body.querySelectorAll('img').length,sourceSame:await source.blob.text()===await file.text(),defaultKeepsAds:sanitizeEpubChapter('<html><body>'+html+'</body></html>','test.xhtml').nodes.join('').includes('发布页')};
 });
 expect(result).toMatchObject({title:'Journey',chapterTitle:'Chapter 1',em:'neutral',images:1,sourceSame:true,defaultKeepsAds:true});expect(result.text).not.toMatch(/发布页|尚香|-----/);expect(result.text).toContain('sxsy.org');expect(result.text).toContain('Image caption.');
});
