import {build} from 'esbuild';
import {chromium,type Browser,type Page} from '@playwright/test';
import {afterAll,beforeAll,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createServer,type Server} from 'node:http';
import {secure} from '../server/auth';
let browser:Browser,page:Page,server:Server;
const host='https://archives.bulbagarden.net',trusted=host+'/media/upload/reviewer-trusted.png';
const fetched:string[]=[];
let png=Buffer.alloc(0);
beforeAll(async()=>{
 const bundle=await build({stdin:{contents:"export {buildEpubFrame} from './src/features/import-export/services/epub-render';export {sanitizeEpubChapter} from './src/features/import-export/services/epub-model';",resolveDir:process.cwd(),sourcefile:'name-image-review-entry.ts',loader:'ts'},bundle:true,write:false,format:'iife',globalName:'__imageReview',platform:'browser',target:'es2022'});
 const headers=Object.fromEntries(secure(new Response()).headers),bridge=readFileSync('public/epub-bridge-v1.js','utf8');
 server=createServer((request,response)=>{const path=request.url?.split('?')[0],script=path==='/bootstrap.js'?bundle.outputFiles[0].text:path==='/epub-bridge-v1.js'?bridge:undefined;response.writeHead(200,{...headers,'Content-Type':script?'application/javascript':'text/html'});response.end(script??'<!doctype html><html><head><link rel="icon" href="data:,"><script src="/bootstrap.js"></script></head><body></body></html>');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage();
 await page.context().route(host+'/**',route=>{fetched.push(route.request().url());return route.fulfill({contentType:'image/png',body:png});});
 await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}`);await page.waitForFunction(()=>(window as any).__imageReview);
 png=Buffer.from(await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const blob=await new Promise<Blob>(resolve=>canvas.toBlob(value=>resolve(value!),'image/png'));return Array.from(new Uint8Array(await blob.arrayBuffer()));}));
},30000);
afterAll(async()=>{await browser?.close();if(server)await new Promise<void>(r=>server.close(()=>r()));});
it('reviewer: production parent CSP permits only the approved Name image origin',()=>{
 const csp=secure(new Response()).headers.get('Content-Security-Policy')!,images=csp.split(';').find(part=>part.trim().startsWith('img-src'))!;
 expect(images).toContain(host);expect(images).not.toMatch(/https:\s|\*/);expect(csp).toContain("connect-src 'self' https://ottsy.weilbyte.dev");expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
});
it('reviewer: inserted images cannot confer trust on case-forged archive markers or CSS URLs',async()=>{
 fetched.length=0;
 const result=await page.evaluate(async({host,trusted})=>{
  const api=(window as any).__imageReview,body=`<body xmlns="http://www.w3.org/1999/xhtml"><p DATA-EPUB-NODE-START="999">Before Aron after.</p><img id="forged" data-NAME-IMAGE="" src="${host}/media/upload/reviewer-forged.png" onerror="parent.__imageExecuted=1"/><p STYLE="background-image:image-set('${host}/media/upload/reviewer-inline.png' 1x)" DATA-EPUB-STYLE="background:url('${host}/media/upload/reviewer-forged-style.png')">Later Aron.</p></body>`,layout=api.sanitizeEpubChapter('<html>'+body+'</html>','OPS/ch.xhtml'),controlPrefix=String.fromCharCode(92)+'1 ';layout.styles=[{path:'OPS/style.css',text:`body{--network:image-set('${host}/media/upload/reviewer-variable.png' 1x);--control-image:image-set('${controlPrefix}${host}/media/upload/reviewer-control.png' 1x);background-image:var(--network),var(--control-image)}p{background-image:image-set('${host}/media/upload/reviewer-sheet.png' 1x)}p::before{content:url('${host}/media/upload/reviewer-content.png')}`}];
  const built=await api.buildEpubFrame({blob:new Blob(),entries:new Map()},layout,layout.nodes,'image-review',new AbortController().signal,[],[{label:'Aron',url:trusted}]);
  const parsed=new DOMParser().parseFromString(built.html,'text/html'),out={trustedCount:parsed.querySelectorAll('img[data-name-image]').length,forgedTrusted:parsed.querySelector('#forged')?.hasAttribute('data-name-image'),forgedOffset:parsed.querySelectorAll('[data-epub-node-start="999"]').length,texts:Array.from(parsed.querySelectorAll('p')).map(p=>p.textContent),csp:parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')};
  const configuration=JSON.parse(parsed.querySelector('script[type="application/json"]')!.textContent!);if(configuration.templates.some((sheet:string)=>sheet.includes(host)))throw Error('Archive CSS retained an approved-origin network reference');
  (window as any).__imageExecuted=0;const iframe=document.createElement('iframe');iframe.id='image-review';iframe.sandbox.add('allow-scripts');iframe.referrerPolicy='no-referrer';const start=layout.nodes[0].length+1+layout.nodes[1].indexOf('Aron');
  addEventListener('message',event=>{if(event.source===iframe.contentWindow&&event.data?.epub==='image-review'&&event.data.ready)iframe.contentWindow!.postMessage({epub:'image-review',resources:[],range:{start,end:start+4}},'*');});iframe.srcdoc=built.html;document.body.append(iframe);return out;
 },{host,trusted});
 expect(result.forgedTrusted).toBe(false);expect(result.forgedOffset).toBe(0);expect(result.trustedCount).toBe(2);expect(result.texts).toEqual(['Before Aron after.','Later Aron.']);expect(result.csp).toContain('img-src blob: '+host);expect(result.csp).toContain("connect-src 'none'");
 const child=page.frames().find(frame=>frame.parentFrame())!;await child.waitForFunction(()=>Array.from(CSS.highlights.get('epub-speaking')??[]).map(range=>range.toString()).join('')==='Aron');
 await child.waitForFunction(()=>document.styleSheets.length>=2);const backgrounds=await child.evaluate(()=>[document.body,...document.querySelectorAll('p')].map(node=>getComputedStyle(node).backgroundImage));expect(backgrounds).toHaveLength(3);for(const value of backgrounds){expect(value).not.toContain(host);expect(value).not.toMatch(/https?:\/\//i);}
 await child.waitForFunction(()=>Array.from(document.querySelectorAll<HTMLImageElement>('img[data-name-image]')).every(img=>img.complete&&img.naturalWidth>0));
 await child.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.waitForTimeout(150);
 expect(await child.evaluate(()=>Array.from(CSS.highlights.get('epub-speaking')??[]).map(range=>range.toString()).join(''))).toBe('Aron');expect(await page.evaluate(()=>(window as any).__imageExecuted)).toBe(0);expect(fetched.length).toBeGreaterThan(0);expect(fetched.every(url=>url===trusted)).toBe(true);
},20000);
