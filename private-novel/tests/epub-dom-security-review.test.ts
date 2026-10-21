import {build} from 'esbuild';
import {chromium,type Browser,type Page} from '@playwright/test';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
let browser:Browser,page:Page;
beforeAll(async()=>{
 const bundled=await build({stdin:{contents:"export {epubXml,sanitizeEpubChapter,validateEpubLayout} from './src/features/import-export/services/epub-model';",resolveDir:process.cwd(),sourcefile:'epub-dom-review-entry.ts',loader:'ts'},bundle:true,write:false,format:'iife',globalName:'__epubDomReview',platform:'browser',target:'es2022'});
 browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage();await page.route('https://epub-review.invalid/**',route=>route.abort());await page.addScriptTag({content:bundled.outputFiles[0].text});
},30000);
afterAll(async()=>{await browser?.close();});
describe('independent detached EPUB XML/DOM security',()=>{
 it('parsing/sanitizing malicious XHTML stays detached and creates no network/script execution',async()=>{
  const requests:string[]=[];const requestListener=(request:{url():string})=>requests.push(request.url());page.on('request',requestListener);
  try{
   const result=await page.evaluate(()=>{
    const api=(window as any).__epubDomReview;(window as any).__epubUntrustedExecuted=0;
    const input=`<!DOCTYPE html SYSTEM "https://epub-review.invalid/external.dtd"><html xmlns="http://www.w3.org/1999/xhtml"><head><style>@import url('https://epub-review.invalid/style.css'); p{background-image:url('https://epub-review.invalid/css.png')}</style></head><body onload="window.__epubUntrustedExecuted=1"><script>window.__epubUntrustedExecuted=1</script><iframe src="https://epub-review.invalid/frame"></iframe><form action="https://epub-review.invalid/form"><input autofocus="autofocus" /></form><object data="https://epub-review.invalid/object"></object><p style="color:red;background:url('https://epub-review.invalid/inline.png')">甲<strong>乙</strong>😀</p><img src="https://epub-review.invalid/image.png" srcset="https://epub-review.invalid/set.png 2x" onerror="window.__epubUntrustedExecuted=1"/><a href="javascript:window.__epubUntrustedExecuted=1" target="_top">link</a><svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" src="https://epub-review.invalid/svgframe"/></foreignObject></svg></body></html>`;
    const layout=api.sanitizeEpubChapter(input,'OPS/chapter.xhtml'),doc=new DOMParser().parseFromString(layout.body,'application/xml'),body=doc.documentElement;
    return {layout,activeAttributes:Array.from(body.querySelectorAll('*')).flatMap(element=>Array.from(element.attributes).filter(attr=>/^on/i.test(attr.name)||['src','href','srcset','action','data','target'].includes(attr.name)).map(attr=>attr.name)),forbidden:body.querySelectorAll('script,iframe,form,input,object,foreignObject').length,executed:(window as any).__epubUntrustedExecuted,parentBody:document.body.textContent};
   });
   await page.waitForTimeout(100);expect(requests).toEqual([]);expect(result.executed).toBe(0);expect(result.forbidden).toBe(0);expect(result.activeAttributes).toEqual([]);expect(result.layout.nodes).toEqual(['甲','乙','😀','link']);expect(result.parentBody).toBe('');
   // Raw style data is detached input for the later CSS/iframe sanitizer; this
   // does not claim renderer CSP, nonce bridge, or CSS rewriting are verified.
   expect(result.layout.styles).toHaveLength(1);
  }finally{page.off('request',requestListener);}
 });
 it('rejects entity expansion/internal DTD and parses supported entities without fetching a DTD',async()=>{
  const result=await page.evaluate(()=>{
   const api=(window as any).__epubDomReview;const rejected:string[]=[];for(const source of ['<!DOCTYPE html [<!ENTITY x "explosive">]><html><body>&x;</body></html>','<!ENTITY x SYSTEM "file:///private"><html><body/></html>','<html><body>&unknownEntity;</body></html>']){try{api.epubXml(source);}catch{rejected.push(source);}}
   const doc=api.epubXml('<html><body>A&nbsp;B&amp;C&mdash;D</body></html>');return {rejected:rejected.length,text:doc.documentElement.textContent};
  });expect(result.rejected).toBe(3);expect(result.text).toBe('A\u00a0B&C—D');
 });
 it('preserves headings/inline/table/image structure and exact numbered text nodes',async()=>{
  const result=await page.evaluate(()=>{
   const api=(window as any).__epubDomReview,layout=api.sanitizeEpubChapter('<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>章一</h1><p>甲<em>乙</em>😀</p><table><tr><td>表格</td></tr></table><img src="../images/a.png" alt="cover" /></body></html>','OPS/text/ch.xhtml'),doc=new DOMParser().parseFromString(layout.body,'application/xml');return {nodes:layout.nodes,heading:doc.querySelector('h1')?.textContent,em:doc.querySelector('em')?.textContent,table:doc.querySelector('td')?.textContent,image:doc.querySelector('img')?.getAttribute('data-epub-src'),originalSrc:doc.querySelector('img')?.getAttribute('src')};
  });expect(result).toEqual({nodes:['章一','甲','乙','😀','表格'],heading:'章一',em:'乙',table:'表格',image:'../images/a.png',originalSrc:null});
 });
});
