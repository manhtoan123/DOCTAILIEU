import {paragraphRanges} from '../../../core/domain';

export interface ReadingAnchor {source:number;paragraph:number;top:number;literal:boolean}
function characterRect(element:HTMLElement,index:number){
  const text=element.firstChild;if(!(text instanceof Text)||!text.length)return undefined;
  const offset=Math.min(text.length-1,Math.max(0,index));const range=document.createRange();
  range.setStart(text,offset);range.setEnd(text,offset+1);return range.getBoundingClientRect();
}
function firstVisibleCharacter(element:HTMLElement){
  const text=element.firstChild;if(!(text instanceof Text)||!text.length)return 0;
  // Character boxes follow document order vertically. Binary search avoids
  // scanning a 64k literal paragraph one character at a time.
  let low=0,high=text.length-1;
  while(low<high){const mid=Math.floor((low+high)/2);const rect=characterRect(element,mid);if(rect&&rect.bottom<=0)low=mid+1;else high=mid;}
  if(low>0&&/[\uDC00-\uDFFF]/.test(text.data[low]))low--;
  return low;
}
export function captureReadingAnchor(article:HTMLElement,sourceText:string):ReadingAnchor|undefined{
  const row=[...article.querySelectorAll<HTMLElement>('[data-paragraph]')].find(p=>p.getBoundingClientRect().bottom>0&&p.getBoundingClientRect().top<innerHeight);
  if(!row)return;const paragraph=Number(row.dataset.paragraph);
  const token=[...row.querySelectorAll<HTMLElement>('[data-source-start]')].find(el=>el.getBoundingClientRect().bottom>0&&el.getBoundingClientRect().top<innerHeight);
  const element=token||row,literal=!token||token.dataset.sourceLiteral==='true';
  const offset=literal?firstVisibleCharacter(element):0;
  const start=token?Number(token.dataset.sourceStart):paragraphRanges(sourceText)[paragraph]?.start||0;
  return {source:start+offset,paragraph,top:characterRect(element,offset)?.top??element.getBoundingClientRect().top,literal};
}
export function restoreReadingAnchor(article:HTMLElement,sourceText:string,anchor:ReadingAnchor){
  const candidates=[...article.querySelectorAll<HTMLElement>('[data-source-start]')].filter(el=>Number(el.dataset.sourceStart)<=anchor.source&&Number(el.dataset.sourceEnd)>anchor.source);
  const token=candidates.find(el=>Number(el.closest<HTMLElement>('[data-paragraph]')?.dataset.paragraph)===anchor.paragraph)||candidates[0];
  const row=article.querySelector<HTMLElement>(`[data-paragraph="${anchor.paragraph}"]`);const element=token||row;if(!element)return;
  const literal=!token||token.dataset.sourceLiteral==='true';
  const start=token?Number(token.dataset.sourceStart):paragraphRanges(sourceText)[anchor.paragraph]?.start||0;
  const offset=anchor.literal&&literal?anchor.source-start:0;
  const rect=characterRect(element,offset);const top=rect?.top??element.getBoundingClientRect().top;
  window.scrollBy({top:top-anchor.top,behavior:'instant'});
}
