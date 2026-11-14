import {cleanImportedBody} from './import-advertising';
import type {EpubLayout} from './epub-layout-schema';
export {validateEpubLayout,validateEpubBook} from './epub-layout-schema';
export type {EpubLayout,EpubBook} from './epub-layout-schema';
const xmlEntities:Record<string,number>={nbsp:160,copy:169,reg:174,mdash:8212,ndash:8211,hellip:8230,lsquo:8216,rsquo:8217,ldquo:8220,rdquo:8221,bull:8226,laquo:171,raquo:187,ensp:8194,emsp:8195,thinsp:8201,shy:173,trade:8482,euro:8364,cent:162,pound:163,yen:165,sect:167,deg:176,plusmn:177,times:215,divide:247,hearts:9829,clubs:9827,spades:9824,diams:9830,star:9733,para:182,middot:183,iexcl:161,iquest:191,micro:181};
export function epubXml(text:string){if(text.length>16777216||/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text))throw Error('EPUB XML vượt giới hạn hoặc chứa khai báo entity không hỗ trợ.');const input=text.replace(/<!DOCTYPE[^>]*>/gi,'').replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#[xX][0-9a-fA-F]+);)/g,'&amp;').replace(/&([a-zA-Z]+);/g,(raw,key)=>xmlEntities[key.toLowerCase()]?`&#${xmlEntities[key.toLowerCase()]};`:raw),doc=new DOMParser().parseFromString(input,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('EPUB XML/XHTML không hợp lệ.');return doc;}
export function epubDoc(text:string){try{return epubXml(text);}catch(error){if((error as Error).message==='EPUB XML/XHTML không hợp lệ.'){if(text.length>16777216||/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text))throw Error('EPUB XML vượt giới hạn hoặc chứa khai báo entity không hỗ trợ.');const clean=text.replace(/<!DOCTYPE[^>]*>/gi,''),doc=new DOMParser().parseFromString(clean,'text/html');if(!doc.body)throw Error('EPUB thiếu nội dung chương.');return doc;}throw error;}}
export const epubElements=(root:Document|Element,tag:string)=>Array.from(root.getElementsByTagNameNS('*',tag));
const forbidden=new Set(['script','iframe','frame','frameset','object','embed','applet','base','form','input','textarea','button','select','meta','link','foreignobject','audio','video','source','animate','animatemotion','animatetransform','set','discard','use']);
const EPUB_CHAPTER_CHARS=128000;
const blockTags=new Set(['address','article','aside','blockquote','body','dd','div','dl','dt','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','header','li','main','nav','ol','p','pre','section','table','tbody','td','tfoot','th','thead','tr','ul']);
interface EpubTextPiece {node:Text;start:number;end:number;text:string;block:Element|null}
function textPieces(nodes:Text[]):EpubTextPiece[]{const pieces:EpubTextPiece[]=[];for(const node of nodes){const value=node.data;let block=node.parentElement;while(block&&!blockTags.has(block.localName.toLowerCase()))block=block.parentElement;let start=0;while(start<value.length){let end=Math.min(value.length,start+EPUB_CHAPTER_CHARS);if(end<value.length&&/[\uDC00-\uDFFF]/.test(value[end])&&/[\uD800-\uDBFF]/.test(value[end-1]))end--;pieces.push({node,start,end,text:value.slice(start,end),block});start=end;}}return pieces;}
function splitEpubBody(doc:Document,body:Element,path:string,styles:{path:string;text:string}[],nodes:Text[]):EpubLayout[]{
 const pieces=textPieces(nodes);if(!pieces.length)return [{path,body:new XMLSerializer().serializeToString(body),styles,nodes:[]}];
 const groups:EpubTextPiece[][]=[];let from=0;
 while(from<pieces.length){let end=from,length=0,lastBlockBoundary=-1;while(end<pieces.length){const next=length+(end>from?1:0)+pieces[end].text.length;if(next>EPUB_CHAPTER_CHARS)break;length=next;end++;if(end<pieces.length&&pieces[end-1].block!==pieces[end].block)lastBlockBoundary=end;}if(end===from)throw Error('Không thể chia đoạn EPUB trong giới hạn.');const cut=end<pieces.length&&lastBlockBoundary>from?lastBlockBoundary:end;groups.push(pieces.slice(from,cut));from=cut;}
 return groups.map((group,index)=>{const range=doc.createRange();if(index===0)range.setStart(body,0);else{const previous=groups[index-1].at(-1)!;range.setStart(previous.node,previous.end);}const last=group.at(-1)!;if(index===groups.length-1)range.setEnd(body,body.childNodes.length);else range.setEnd(last.node,last.end);const fragment=range.cloneContents(),partBody=body.cloneNode(false) as Element;partBody.append(fragment);return {path,body:new XMLSerializer().serializeToString(partBody),styles,nodes:group.map(piece=>piece.text)};});
}
/** Detached XML, never attached to the parent DOM. Resource URLs become inert data attributes. */
export function sanitizeEpubChapter(input:string,path:string,removeAdvertising=false):EpubLayout{
 const parts=sanitizeEpubChapterParts(input,path,removeAdvertising);if(parts.length!==1)throw Error('Chương EPUB vượt giới hạn 128.000 ký tự.');return parts[0];
}
export function sanitizeEpubChapterParts(input:string,path:string,removeAdvertising=false):EpubLayout[]{
 const doc=epubDoc(input),body=epubElements(doc,'body')[0];if(!body)throw Error('EPUB thiếu nội dung chương.');const elements=epubElements(doc,'style');if(elements.length>100)throw Error('EPUB có quá nhiều stylesheet.');const styles=elements.map(s=>{const text=s.textContent??'';if(text.length>2097152)throw Error('EPUB CSS vượt giới hạn.');return {path,text};});
 for(const element of [body,...Array.from(body.querySelectorAll('*'))]){const tag=element.localName.toLowerCase();if(forbidden.has(tag)||tag==='style'){element.remove();continue;}for(const attr of Array.from(element.attributes)){const key=attr.localName.toLowerCase();if(key.startsWith('on')||['srcset','poster','data','action','formaction','target','download','autofocus','contenteditable'].includes(key)){element.removeAttribute(attr.name);continue;}if(['src','href','background'].includes(key)){element.setAttribute('data-epub-'+key.replace(':','-'),attr.value);element.removeAttribute(attr.name);}}}
 if(removeAdvertising)cleanImportedBody(body);
 const isVoidOrMedia=(el:Element)=>['img','br','hr','table','svg','audio','video'].includes(el.localName.toLowerCase());
 for(const el of Array.from(body.querySelectorAll('*')).reverse()){
  const tag=el.localName.toLowerCase();if(['span','font','div'].includes(tag)){const hasAttrs=el.hasAttribute('id')||el.hasAttribute('style')||el.hasAttribute('class')||Array.from(el.attributes).some(a=>a.name.startsWith('data-epub-'));if(!hasAttrs){el.replaceWith(...Array.from(el.childNodes));continue;}}
  if(!isVoidOrMedia(el)&&!el.querySelector('img,table,svg')&&!el.textContent?.trim())el.remove();
 }
 body.normalize();const textNodes:Text[]=[],walker=doc.createTreeWalker(body,4);while(walker.nextNode()){const node=walker.currentNode as Text;if(!node.data.trim())continue;node.data=node.data.replace(/\r\n?/g,'\n');textNodes.push(node);}
 if(textNodes.map(node=>node.data).join('\n').length<=EPUB_CHAPTER_CHARS)return [{path,body:new XMLSerializer().serializeToString(body),styles,nodes:textNodes.map(node=>node.data)}];
 return splitEpubBody(doc,body,path,styles,textNodes);
}
