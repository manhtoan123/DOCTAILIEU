function textNodes(element:HTMLElement){
  const walker=element.ownerDocument.createTreeWalker(element,NodeFilter.SHOW_TEXT);
  const nodes:Text[]=[];
  while(walker.nextNode())nodes.push(walker.currentNode as Text);
  return nodes;
}

/** A visual line can start or end inside a token that wraps. Measure text, not elements. */
export function readerTextRange(paragraph:HTMLElement,whole:boolean,x:number,y:number):Range|undefined{
  const doc=paragraph.ownerDocument;
  const range=doc.createRange();
  if(whole){range.selectNodeContents(paragraph);return range;}
  const caret=doc.caretRangeFromPoint?.(x,y);
  const caretRect=caret&&paragraph.contains(caret.startContainer)?caret.getBoundingClientRect():undefined;
  let lineY=y;
  const nodes=textNodes(paragraph);
  if(caretRect?.height&&y>=caretRect.top&&y<=caretRect.bottom){
    lineY=(caretRect.top+caretRect.bottom)/2;
  }else{
    let distance=Infinity;
    for(const node of nodes){
      range.selectNodeContents(node);
      for(const rect of range.getClientRects()){
        const center=(rect.top+rect.bottom)/2,delta=Math.abs(y-center);
        if(rect.height>0&&delta<distance){distance=delta;lineY=center;}
      }
    }
  }
  let first:{node:Text;offset:number}|undefined,last:{node:Text;offset:number}|undefined;
  function measure(node:Text,start:number,end:number){
    if(start>=end)return;
    range.setStart(node,start);range.setEnd(node,end);
    const rects=[...range.getClientRects()].filter(rect=>rect.height>0);
    const sameLine=(rect:DOMRect)=>lineY>=rect.top&&lineY<rect.bottom;
    if(!rects.some(sameLine))return;
    let middle=(start+end)>>1;
    if(middle>start&&/[\uDC00-\uDFFF]/u.test(node.data[middle]))middle++;
    if(rects.every(sameLine)||middle===start||middle===end){
      first??={node,offset:start};last={node,offset:end};return;
    }
    measure(node,start,middle);
    measure(node,middle,end);
  }
  for(const node of nodes)measure(node,0,node.length);
  if(!first||!last)return;
  range.setStart(first.node,first.offset);range.setEnd(last.node,last.offset);
  return range;
}

/** Never guess a source offset for a clipped translated token or polished prose. */
export function readerRangeSource(paragraph:HTMLElement,range:Range,original:string){
  const nodes=textNodes(paragraph).filter(node=>range.intersectsNode(node));
  if(nodes.some(node=>node.data.trim()&&!node.parentElement?.closest('.word-token')))return;
  const words=[...paragraph.querySelectorAll<HTMLElement>('.word-token')].filter(word=>range.intersectsNode(word));
  let start:number|undefined,end:number|undefined;
  for(const word of words){
    const from=Number(word.dataset.sourceStart),to=Number(word.dataset.sourceEnd);
    if(word.dataset.sourceComplete!=='true'||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<=from||to>original.length)return;
    const offset=(node:Node,index:number,fallback:number)=>{
      if(!word.contains(node))return fallback;
      const prefix=word.ownerDocument.createRange();prefix.selectNodeContents(word);prefix.setEnd(node,index);
      return prefix.toString().length;
    };
    const length=word.textContent?.length??0;
    const left=offset(range.startContainer,range.startOffset,0),right=offset(range.endContainer,range.endOffset,length);
    if(left===right)continue;
    if(left>0||right<length)return;
    if(end!==undefined&&end!==from)return;
    start??=from;end=to;
  }
  return start!==undefined&&end!==undefined?{start,end}:undefined;
}
