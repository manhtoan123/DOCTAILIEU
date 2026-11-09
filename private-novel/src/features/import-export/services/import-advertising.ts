/** Conservative import-only rules. Original files/hashes are never rewritten. */
const site = String.raw`(?:sxsy(?:\s*\.\s*org)?|尚香书[院苑]|搜书吧|老王论坛|聚友客栈|epubBuilder|cnepub\.com|soushu(?:20\d{2})?\.com|掌上书苑|静读天下)`;
const domain = String.raw`(?:sxsy\.org|cnepub\.com|soushu(?:20\d{2})?\.com)`;
const tag = new RegExp(String.raw`^(?:\[|【|\()\s*${site}\s*(?:\]|】|\))\s*|\s*(?:\[|【|\()\s*${site}\s*(?:\]|】|\))$`, 'iu');
const notice = new RegExp(String.raw`^(?:(?:本文件来自|本书来自|本文来自)\s*${site}[。.!！]?|${site}|(?:发布页|發布頁|备用地址|备用网址|永久地址|防失联地址|最新地址|请收藏本站)\s*[:：]?\s*(?:https?://)?(?:www\.)?${domain}(?:/[\w/?=&%#.+~-]*)?[。.]?|(?:https?://)?(?:www\.)?${domain}/?[。.]?)$`, 'iu');
function stripTags(value:string){let next=value;do{value=next;next=value.replace(tag,'');}while(next!==value);return next;}
export function cleanImportedTitle(value:string){return stripTags(value.trim()).trim()||'Truyện mới';}
export function isAdvertisingLine(value:string){const text=value.trim().normalize('NFKC');return text.length<=512&&notice.test(text);}
const separator=(value:string)=>/^[\s]*[-─━_=*＊]{5,}[\s]*$/u.test(value);
/** Separators are removed only immediately around recognized notices, never globally. */
export function advertisingLineMask(lines:string[]):boolean[]{
 const removed=lines.map(isAdvertisingLine);
 for(let i=0;i<lines.length;i++)if(removed[i])for(const direction of [-1,1]){
  for(let j=i+direction,steps=0;j>=0&&j<lines.length&&steps<8;j+=direction,steps++){
   if(!lines[j].trim())continue;
   if(separator(lines[j]))removed[j]=true;
   break;
  }
 }
 return removed;
}
export function cleanImportedText(text:string):string{
 const pieces:string[]=[];new ImportAdvertisingFilter(piece=>pieces.push(piece)).feed(text,true);return pieces.join('');
}
/** Complete physical lines only. Oversized lines pass through unchanged with bounded buffering. */
export class ImportAdvertisingFilter {
 private tail='';private pending:string[]=[];private continued=false;private afterAd=false;
 constructor(private emit:(text:string)=>void){}
 private flush(){for(const line of this.pending)this.emit(line);this.pending=[];}
 private line(line:string){
  if(this.continued){this.flush();this.emit(line);this.continued=false;this.afterAd=false;return;}
  if(isAdvertisingLine(line)){this.pending=[];this.afterAd=true;return;}
  if(this.afterAd&&(!line.trim()||separator(line))){if(line.trim())this.afterAd=false;return;}
  this.afterAd=false;
  if(!line.trim()||separator(line)){this.pending.push(line);if(this.pending.length>8)this.emit(this.pending.shift()!);return;}
  this.flush();this.emit(line.length>4096?line:stripTags(line));
 }
 feed(chunk:string,final=false){
  this.tail+=chunk;
  let match:RegExpExecArray|null;
  while((match=/\r\n|\r|\n/u.exec(this.tail))){
   if(!final&&match[0]==='\r'&&match.index===this.tail.length-1)break;
   const end=match.index+match[0].length;this.line(this.tail.slice(0,end));this.tail=this.tail.slice(end);
  }
  if(this.tail.length>4096){this.flush();const keep=this.tail.endsWith('\r')?1:0;this.emit(this.tail.slice(0,this.tail.length-keep));this.tail=keep?'\r':'';this.continued=true;this.afterAd=false;}
  if(final){if(this.tail)this.line(this.tail);this.tail='';this.flush();}
 }
}
/** Detached DOM only; never remove a container holding unrelated story blocks/images. */
export function cleanImportedBody(body:Element){
 const blocks='p,div,section,article,li,td,blockquote,aside,footer,pre,h1,h2,h3,h4,h5,h6';
 const leaves=Array.from(body.querySelectorAll(blocks)).filter(element=>!element.querySelector(blocks));
 const protectedMedia=(element:Element)=>!!element.querySelector('img,svg,math,table');
 const removed=advertisingLineMask(leaves.map(element=>protectedMedia(element)?'\uFFFC':element.textContent??''));
 leaves.forEach((element,i)=>{
  if(removed[i]&&!protectedMedia(element)){element.remove();return;}
  // Never interpret fragments of inline prose as standalone lines.
  if(!element.children.length)element.textContent=cleanImportedText(element.textContent??'');
 });
 if(!body.children.length)body.textContent=cleanImportedText(body.textContent??'');
}
