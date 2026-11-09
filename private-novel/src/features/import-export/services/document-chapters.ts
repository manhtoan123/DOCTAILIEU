import {isHeading} from './splitter';
export interface DocumentBlock {html:string;text?:string;heading?:boolean}
export function documentChapterTitle(text:string):string|undefined{
 const title=text.trim().replace(/^[【\[](.+)[】\]]$/u,'$1').trim().replace(/[\t \u3000]+/g,' ');
 // Plain page numbers, list items and references to chapters are not boundaries.
 if(!title||title.length>160||/[\r\n。！？!?]/u.test(title)||/(?:\.{2,}|…{2,}|·{3,}|_{2,})\s*[0-9０-９]+$/u.test(title))return;
 const western=/^(?:Chương|Chuong|Chapter|Hồi|Hoi)\s+[0-9０-９IVXLCDMⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+(?:\s|[:：.\-–—]|$)/iu.test(title);
 if(!western&&(!/^(?:第\s*[0-9０-９零〇一二两兩三四五六七八九十百千万萬亿億ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[章節节回话話集]|序章|楔子|引子|终章|終章|尾声|尾聲|番外|后记|後記|Prologue\b|Epilogue\b)/iu.test(title)||!isHeading(title)))return;
 return title;
}
/** Page/HTML-block boundaries never create chapters. Preserve every block in order. */
export function assembleDocumentChapters(blocks:Iterable<DocumentBlock>,fallback='Nội dung'):{title:string;html:string}[]{
 const chapters:{title:string;html:string}[]=[];let html='',title='',textChars=0,htmlChars=0;
 const flush=()=>{if(!html)return;if(chapters.length>=2000)throw Error('Tài liệu vượt 2.000 chương.');chapters.push({title:title||fallback,html});html='';textChars=htmlChars=0;};
 for(const block of blocks){
  const marker=documentChapterTitle(block.text??'')||(block.heading&&(block.text??'').trim().length<=160?(block.text??'').trim():undefined);
  if(marker&&marker.toLowerCase()!==title.toLowerCase()){if(title)flush();title=marker;}
  html+=block.html;htmlChars+=block.html.length;textChars+=(block.text?.length??0)+1;
  if(textChars>128000||htmlChars>450000)throw Error(`Chương “${title||fallback}” quá lớn (128.000 ký tự hoặc 450.000 ký tự bố cục). Không tự cắt theo trang; hãy kiểm tra tiêu đề chương trong tài liệu.`);
 }
 flush();return chapters;
}
