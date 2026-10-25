/** Derived locally from the actual part plan and assembled results; never model-generated. */
export interface AiTextMap {version:1;sourceLength:number;spans:{sourceStart:number;sourceEnd:number;translatedStart:number;translatedEnd:number}[]}
export function validAiTextMap(value:unknown,targetLength:number,sourceLength?:number):value is AiTextMap{
 if(!value||typeof value!=='object')return false;
 const map=value as AiTextMap;
 if(map.version!==1||!Number.isSafeInteger(map.sourceLength)||map.sourceLength<1||sourceLength!==undefined&&map.sourceLength!==sourceLength||!Array.isArray(map.spans)||!map.spans.length||map.spans.length>4096)return false;
 let source=0,target=0;
 for(const span of map.spans){
  if(!span||![span.sourceStart,span.sourceEnd,span.translatedStart,span.translatedEnd].every(Number.isSafeInteger)||span.sourceStart!==source||span.translatedStart!==target||span.sourceEnd<=source||span.sourceEnd>map.sourceLength||span.translatedEnd<=target||span.translatedEnd>targetLength)return false;
  source=span.sourceEnd;target=span.translatedEnd+1; // Results are joined with exactly one newline.
 }
 return source===map.sourceLength&&target-1===targetLength;
}
