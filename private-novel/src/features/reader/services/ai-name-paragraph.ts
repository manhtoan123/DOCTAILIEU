import {paragraphRanges} from '../../../core/domain';
import {validAiTextMap,type AiTextMap} from '../../ai/services/ai-text-map';
/** Approximate the source paragraph by relative position, even after AI merges/splits. */
export function aiNameParagraph(source:string,translated:string,translatedStart:number,map?:AiTextMap,ratio=0.5):{start:number;text:string;focus?:number}|undefined{
 const input=paragraphRanges(source).filter(p=>p.text.trim());
 const output=paragraphRanges(translated).filter(p=>p.text.trim());
 const index=output.findIndex(p=>p.start===translatedStart);
 if(index<0||!input.length)return;
 if(validAiTextMap(map,translated.length,source.length)){
  const outputParagraph=output[index],length=outputParagraph.text.replace(/[\r\n]+$/,'').length;
  const point=outputParagraph.start+Math.min(Math.max(0,length-1),Math.floor(length*Math.max(0,Math.min(1,Number.isFinite(ratio)?ratio:0.5))));
  const span=map.spans.find(s=>point>=s.translatedStart&&point<s.translatedEnd);
  if(span){
   const anchor=span.sourceStart+Math.min(span.sourceEnd-span.sourceStart-1,Math.floor((point-span.translatedStart)/(span.translatedEnd-span.translatedStart)*(span.sourceEnd-span.sourceStart)));
   const candidates=input.filter(p=>p.start<span.sourceEnd&&p.start+p.text.length>span.sourceStart);
   const scale=(span.sourceEnd-span.sourceStart)/(span.translatedEnd-span.translatedStart);
   const from=span.sourceStart+Math.max(0,outputParagraph.start-span.translatedStart)*scale;
   const to=span.sourceStart+Math.min(span.translatedEnd-span.translatedStart,outputParagraph.start+length-span.translatedStart)*scale;
   // Select the source paragraph with greatest overlap with the clicked AI paragraph.
   // A click near its edge must not switch to a short neighbouring source paragraph.
   const overlap=(p:typeof input[number])=>Math.max(0,Math.min(to,p.start+p.text.replace(/[\r\n]+$/,'').length)-Math.max(from,p.start));
   const distance=(p:typeof input[number])=>Math.max(p.start-anchor,anchor-(p.start+p.text.length-1),0);
   const paragraph=candidates.reduce<typeof input[number]|undefined>((best,p)=>!best||overlap(p)>overlap(best)||overlap(p)===overlap(best)&&distance(p)<distance(best)?p:best,undefined);
   if(paragraph){let start=Math.max(span.sourceStart,paragraph.start),end=Math.min(span.sourceEnd,paragraph.start+paragraph.text.length);
    if(start>0&&/[\uDC00-\uDFFF]/.test(source[start])&&/[\uD800-\uDBFF]/.test(source[start-1]))start++;
    if(/[\uD800-\uDBFF]/.test(source[end-1]??''))end--;
    if(end>start)return {start,text:source.slice(start,end).replace(/[\r\n]+$/,''),focus:Math.max(0,anchor-start)};
   }
  }
 }
 const sourceIndex=Math.round(index*(input.length-1)/Math.max(1,output.length-1));
 const paragraph=input[sourceIndex];
 return {start:paragraph.start,text:paragraph.text.replace(/[\r\n]+$/,'')};
}
