import {epubCrc} from '../../src/features/import-export/services/epub-zip';
/** Synthetic stored ZIP entries; real backing bytes, no D or user corpus. */
export function largeEpub(mebibytes:number){
 const enc=new TextEncoder(),parts:BlobPart[]=[],central:Uint8Array[]=[],filler=new Uint8Array(16*1048576);let offset=0;const fillerCrc=epubCrc(filler);
 function entry(name:string,data:Uint8Array,crc=epubCrc(data)){
  const filename=enc.encode(name),local=new Uint8Array(30+filename.length),l=new DataView(local.buffer);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,2048,true);l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,filename.length,true);local.set(filename,30);
  const record=new Uint8Array(46+filename.length),c=new DataView(record.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,2048,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);record.set(filename,46);central.push(record);parts.push(local,new Uint8Array(data));offset+=local.length+data.length;
 }
 entry('mimetype',enc.encode('application/epub+zip'));entry('META-INF/container.xml',enc.encode('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'));entry('OPS/book.opf',enc.encode('<package><metadata><title>Large synthetic</title></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>'));entry('OPS/c.xhtml',enc.encode('<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第一章</h1><p><em>林儿</em></p></body></html>'));
 let remaining=mebibytes*1048576;for(let n=0;remaining;n++){const size=Math.min(remaining,filler.length),data=filler.subarray(0,size);entry('OPS/pad'+n+'.bin',data,size===filler.length?fillerCrc:epubCrc(data));remaining-=size;}
 const size=central.reduce((s,c)=>s+c.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);return new File([...parts,...central,end],'Large synthetic.epub',{type:'application/epub+zip'});
}
