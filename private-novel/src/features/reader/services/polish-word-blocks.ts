import {paragraphRanges} from '../../../core/domain';
import type {AppliedPolish} from '../../ai/services/convert-polish';
import type {PolishFallbackRange} from '../../ai/services/polish-output';
import type {EpubWordRange} from '../../import-export/services/epub-render';
import type {Token} from '../../names-convert/services/language';

export function untouchedPolishRanges(base:string,rendered:string,value:AppliedPolish|undefined):PolishFallbackRange[]{
 const suffixStart=value?.sourceEnd;
 const suffix=typeof suffixStart==='number'&&value?.partial&&Number.isSafeInteger(suffixStart)&&suffixStart>=0&&suffixStart<base.length
  ?base.slice(suffixStart):'';
 const suffixRange=suffix&&rendered.endsWith(suffix)
  ?{sourceStart:suffixStart!,sourceEnd:base.length,targetStart:rendered.length-suffix.length,targetEnd:rendered.length}:undefined;

 const ranges:PolishFallbackRange[]=[];
 if(value?.baseConvert===base&&Array.isArray(value.fallback)){
  const sourceLimit=suffixRange?.sourceStart??base.length,targetLimit=suffixRange?.targetStart??rendered.length;
  let sourceAt=0,targetAt=0;
  for(const range of value.fallback){
   if(!range||![range.sourceStart,range.sourceEnd,range.targetStart,range.targetEnd].every(Number.isSafeInteger)||
      range.sourceStart<sourceAt||range.sourceEnd<=range.sourceStart||range.sourceEnd>sourceLimit||
      range.targetStart<targetAt||range.targetEnd<=range.targetStart||range.targetEnd>targetLimit||
      base.slice(range.sourceStart,range.sourceEnd)!==rendered.slice(range.targetStart,range.targetEnd)){
    // Invalid saved metadata cannot invalidate an independently verified suffix.
    return suffixRange?[suffixRange]:[];
   }
   const previous=ranges.at(-1);
   if(previous?.sourceEnd===range.sourceStart&&previous.targetEnd===range.targetStart){
    previous.sourceEnd=range.sourceEnd;
    previous.targetEnd=range.targetEnd;
   }else ranges.push({...range});
   sourceAt=range.sourceEnd;
   targetAt=range.targetEnd;
  }
 }
 if(suffixRange)ranges.push(suffixRange);
 return ranges;
}

export interface PolishWordPiece {text:string;token?:Token;sourceStart:number;sourceEnd:number;literal:boolean}
export function polishWordBlocks(text:string,tokens:Token[],ranges:readonly PolishFallbackRange[]):PolishWordPiece[][]{
 const spans:{start:number;end:number;token:Token;sourceOffset:number}[]=[];
 let offset=0,rangeIndex=0;
 for(const token of tokens){
  if(rangeIndex===ranges.length)break;
  const start=offset;
  offset+=token.targetText.length;
  while(rangeIndex<ranges.length&&ranges[rangeIndex].sourceEnd<=start)rangeIndex++;
  for(let index=rangeIndex;index<ranges.length&&ranges[index].sourceStart<offset;index++){
   const range=ranges[index],from=Math.max(start,range.sourceStart),to=Math.min(offset,range.sourceEnd);
   // A clipped nonliteral token cannot identify the exact source selection.
   if(to<=from||((from!==start||to!==offset)&&token.source!==token.targetText))continue;
   const target=range.targetStart+from-range.sourceStart;
   spans.push({start:target,end:target+to-from,token,sourceOffset:from-start});
  }
 }
 let index=0;
 return paragraphRanges(text).map(p=>{
  const row:PolishWordPiece[]=[];
  let at=p.start;
  const end=p.start+p.text.length;
  const plain=(a:number,b:number)=>{
   if(b>a)row.push({text:text.slice(a,b),sourceStart:0,sourceEnd:0,literal:false});
  };
  while(index<spans.length&&spans[index].end<=at)index++;
  for(let j=index;j<spans.length&&spans[j].start<end;j++){
   const span=spans[j],a=Math.max(at,span.start),b=Math.min(end,span.end);
   plain(at,a);
   const literal=span.token.source===span.token.targetText,delta=span.sourceOffset+a-span.start;
   const sourceStart=literal?span.token.sourceStart+delta:span.token.sourceStart;
   const sourceEnd=literal?sourceStart+b-a:span.token.sourceEnd;
   const piece=text.slice(a,b);
   const selected=literal?{...span.token,source:span.token.source.slice(delta,delta+b-a),targetText:piece,sourceStart,sourceEnd}:span.token;
   row.push({text:piece,token:selected,sourceStart,sourceEnd,literal});
   at=b;
  }
  plain(at,end);
  return row;
 });
}

export function polishedEpubWords(words:EpubWordRange[],baseNodes:string[],targetNodes:string[],ranges:readonly PolishFallbackRange[]):EpubWordRange[]{
 if(!ranges.length||baseNodes.length!==targetNodes.length)return [];
 let sourceAt=0,targetAt=0,rangeIndex=0;
 const nodeStarts=baseNodes.map((node,i)=>{
  const starts={source:sourceAt,target:targetAt};
  sourceAt+=node.length+1;
  targetAt+=targetNodes[i].length+1;
  return starts;
 });
 const mapped:EpubWordRange[]=[];
 for(const word of words){
  const {node,start,end}=word,starts=nodeStarts[node],sourceStart=starts.source+start,sourceEnd=starts.source+end;
  while(rangeIndex<ranges.length&&ranges[rangeIndex].sourceEnd<=sourceStart)rangeIndex++;
  const range=ranges[rangeIndex];
  if(!range||sourceStart<range.sourceStart||sourceEnd>range.sourceEnd)continue;
  const from=range.targetStart+sourceStart-range.sourceStart-starts.target,to=from+end-start;
  // The proof must put the entire word in the same rendered EPUB node.
  if(from>=0&&to<=targetNodes[node].length&&baseNodes[node].slice(start,end)===targetNodes[node].slice(from,to)){
   mapped.push({...word,start:from,end:to});
  }
 }
 return mapped;
}
