/** Monotone cuts protect overlapping Names regardless of dictionary order. */
export function protectAiBoundary(text:string,cut:number,keys:string[]=[],min=0,max=text.length):number{
  const original=cut;
  for(const direction of [-1,1]){
    cut=original;
    for(;;){
      const before=cut;
      if(/[\uD800-\uDBFF]/.test(text[cut-1])&&/[\uDC00-\uDFFF]/.test(text[cut]))cut+=direction;
      for(const key of keys){if(!key||key.length>256)continue;const at=text.lastIndexOf(key,cut-1);if(at>=0&&at<cut&&at+key.length>cut)cut=direction<0?at:at+key.length;}
      if(cut<=min||cut>max)break;
      if(cut===before)return cut;
    }
  }
  return 0;
}
