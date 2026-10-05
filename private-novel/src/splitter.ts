const heading = /^(?:(?:Chương|Chuong|Chapter)\s+\d+(?:\s|[:：.\-–—]|$)|第[0-9０-９零〇一二两兩三四五六七八九十百千万萬亿億]+[章節节回](?:\s|[:：.\-–—]|[^\d])?|(?:序章|楔子|前言|终章|終章|后记|後記|番外)(?:\s|[:：\-–—]|$))/iu;
export function isHeading(line: string, custom?:RegExp) { const s=line.trim(); return s.length<=180 && (custom ? custom.test(s) : heading.test(s)); }
export interface Part { title:string; text:string; }
/** Bounded working buffer, lossless over BOM/CRLF-normalized text. Long chapters become labelled parts. */
export class StreamingSplitter {
  private tail=''; private current=''; private title:string; private part=1; private cr=false; private first=true;
  constructor(title:string,private emit:(part:Part)=>void,private regex?:RegExp,private max=64000,private detect=true) { this.title=title; }
  private flush() { if(this.current.length) { this.emit({title:this.title+(this.part>1?` · phần ${this.part}`:''),text:this.current});this.current='';this.part++; } }
  private append(s:string) { while(s.length) { const room=this.max-this.current.length; const count=Math.min(room,s.length); this.current+=s.slice(0,count);s=s.slice(count);if(this.current.length===this.max)this.flush(); } }
  private line(s:string) { if(this.detect && isHeading(s,this.regex)) { this.flush();this.title=s.trim();this.part=1; } this.append(s); }
  feed(text:string,done=false) {
    if(this.first && text.length) {text=text.replace(/^\uFEFF/,'');this.first=false;}
    if(this.cr) {text='\r'+text;this.cr=false;}
    if(!done && text.endsWith('\r')) {text=text.slice(0,-1);this.cr=true;}
    this.tail+=text.replace(/\r\n?/g,'\n');
    let pos:number;while((pos=this.tail.indexOf('\n'))>=0) {this.line(this.tail.slice(0,pos+1));this.tail=this.tail.slice(pos+1);}
    // Huge lines cannot be headings; retain only a bounded tail.
    while(this.tail.length>this.max) {this.append(this.tail.slice(0,this.max));this.tail=this.tail.slice(this.max);}
    if(done) {if(this.tail)this.line(this.tail);this.tail='';this.flush();}
  }
}

