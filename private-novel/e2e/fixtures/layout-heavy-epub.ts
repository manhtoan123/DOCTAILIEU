import {zipSync,strToU8} from 'fflate';
export const layoutChapterCount=800;
export const layoutText='山水林风'.repeat(750);
export const layoutCss='p{color:rgb(12,34,56)}/*'+'x'.repeat(80*1024)+'*/';
/** Real XHTML chapters and linked CSS, not an unused padded archive. No user content. */
export function layoutHeavyEpub(count=layoutChapterCount){
 const files:Record<string,Uint8Array>={'mimetype':strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'),'OPS/style.css':strToU8(layoutCss)};
 const items:string[]=[],spine:string[]=[];
 for(let i=0;i<count;i++){items.push(`<item id="c${i}" href="${i}.xhtml" media-type="application/xhtml+xml"/>`);spine.push(`<itemref idref="c${i}"/>`);files[`OPS/${i}.xhtml`]=strToU8(`<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="style.css"/></head><body><h1>第${i+1}章</h1><p><em>${layoutText}</em></p><table><tr><td>尾段 ${i}</td></tr></table></body></html>`);}
 files['OPS/book.opf']=strToU8(`<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Synthetic layout heavy EPUB</dc:title></metadata><manifest>${items.join('')}<item id="css" href="style.css" media-type="text/css"/></manifest><spine>${spine.join('')}</spine></package>`);
 return Buffer.from(zipSync(files));
}
