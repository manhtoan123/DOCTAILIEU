import {deflateRawSync} from 'node:zlib';
import {expect,it,describe} from 'vitest';
import {epubCrc,epubPath,resolveEpubPath,openEpubZip,readEpubEntry} from '../src/features/import-export/services/epub-zip';

interface ZipRow {path:string;text?:string;data?:Uint8Array;method?:number;flags?:number;centralCrc?:number;localCrc?:number;centralBytes?:number;localBytes?:number;localCompressed?:number;extra?:Uint8Array;localExtra?:Uint8Array;disk?:number;attributes?:number}
const utf8=(text:string)=>new TextEncoder().encode(text);
function zip(rows:ZipRow[]){
 const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0;
 for(const row of rows){const name=Buffer.from(utf8(row.path)),data=row.data??utf8(row.text??'Synthetic'),method=row.method??8,compressed=method===0?Buffer.from(data):deflateRawSync(data),crc=epubCrc(data),extra=Buffer.from(row.extra??[]),localExtra=Buffer.from(row.localExtra??[]),local=Buffer.alloc(30),central=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(row.flags??0,6);local.writeUInt16LE(method,8);local.writeUInt32LE(row.localCrc??crc,14);local.writeUInt32LE(row.localCompressed??compressed.length,18);local.writeUInt32LE(row.localBytes??data.length,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(localExtra.length,28);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,6);central.writeUInt16LE(row.flags??0,8);central.writeUInt16LE(method,10);central.writeUInt32LE(row.centralCrc??crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(row.centralBytes??data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(extra.length,30);central.writeUInt16LE(row.disk??0,34);central.writeUInt32LE(row.attributes??0,38);central.writeUInt32LE(offset,42);
  const part=Buffer.concat([local,name,localExtra,compressed]);locals.push(part);centrals.push(Buffer.concat([central,name,extra]));offset+=part.length;
 }
 const central=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(rows.length,8);end.writeUInt16LE(rows.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);return new Blob([Buffer.concat([...locals,central,end])]);
}
async function readFirst(blob:Blob){const entries=await openEpubZip(blob),entry=entries.values().next().value!;return readEpubEntry(blob,entry);}
describe('independent bounded EPUB ZIP review',()=>{
 it('verifies known CRC and preserves exact UTF-8 bytes for stored/deflate entries',async()=>{
  expect(epubCrc(utf8('123456789'))).toBe(0xcbf43926);for(const method of [0,8]){const data=utf8('甲=Giáp😀\r\n'),blob=zip([{path:'OEBPS/chapter.xhtml',data,method}]);expect(await readFirst(blob)).toEqual(data);}
 });
 it('rejects duplicate/traversal/encrypted/multidisk/symlink/ZIP64 entries',async()=>{
  for(const blob of [zip([{path:'same'},{path:'same'}]),zip([{path:'../outside'}]),zip([{path:'/outside'}]),zip([{path:'back\\slash'}]),zip([{path:'secret',flags:1}]),zip([{path:'other-disk',disk:1}]),zip([{path:'symlink',attributes:0xa0000000}]),zip([{path:'zip64',extra:new Uint8Array([1,0,0,0])}])])await expect(openEpubZip(blob)).rejects.toThrow();
 });
 it('rejects central CRC corruption, declared-output overflow and truncated archives',async()=>{
  await expect(readFirst(zip([{path:'crc',centralCrc:0}]))).rejects.toThrow();await expect(readFirst(zip([{path:'overflow',data:new Uint8Array(1048576).fill(97),centralBytes:8,localBytes:8}]))).rejects.toThrow();const blob=zip([{path:'truncated'}]);await expect(openEpubZip(blob.slice(0,-1))).rejects.toThrow();
 });
 it('enforces a caller byte cap before decompressing and rejects already aborted reads',async()=>{
  const blob=zip([{path:'bounded',text:'1234567890'}]),entries=await openEpubZip(blob),entry=entries.get('bounded')!;await expect(readEpubEntry(blob,entry,9)).rejects.toThrow();const controller=new AbortController();controller.abort();await expect(openEpubZip(blob,controller.signal)).rejects.toThrow();await expect(readEpubEntry(blob,entry,100,controller.signal)).rejects.toThrow();
 });
 it('abort during a stored/deflate stream cancels upstream and cannot return partial bytes',async()=>{
  for(const method of [0,8]){
   const controller=new AbortController(),original=zip([{path:'cancel-active',data:new Uint8Array(8192).fill(97),method}]);let rangeStart=-1,rangeEnd=-1,cancelled=false;
   class AbortStreamBlob extends Blob{override slice(start=0,end=this.size,type?:string){const result=super.slice(start,end,type);if(start!==rangeStart||end!==rangeEnd)return result;return new class extends Blob{override stream(){return new ReadableStream<Uint8Array<ArrayBuffer>>({async start(stream){const raw=new Uint8Array(await result.arrayBuffer());stream.enqueue(raw.subarray(0,Math.min(raw.length,10)));queueMicrotask(()=>controller.abort());},cancel(){cancelled=true;}});}}([result]);}}
   const blob=new AbortStreamBlob([original]),entry=(await openEpubZip(blob)).get('cancel-active')!;rangeStart=entry.offset+30+utf8(entry.path).length;rangeEnd=rangeStart+entry.compressedBytes;
   await expect(readEpubEntry(blob,entry,10000,controller.signal)).rejects.toHaveProperty('name','AbortError');await new Promise(resolve=>setTimeout(resolve,0));expect(cancelled).toBe(true);
  }
 });
 it('reads only central/tail/selected entry ranges, not unrelated resources',async()=>{
  const original=zip([{path:'large-image.bin',data:new Uint8Array(2*1048576),method:0},{path:'selected.xhtml',text:'Selected only'}]),ranges:{start:number;end:number}[]=[];
  class TrackingBlob extends Blob{override slice(start=0,end=this.size,type?:string){ranges.push({start,end});return super.slice(start,end,type);}}
  const blob=new TrackingBlob([original]),entries=await openEpubZip(blob);expect(utf8('Selected only')).toEqual(await readEpubEntry(blob,entries.get('selected.xhtml')!));expect(ranges.every(range=>range.end-range.start<=65557)).toBe(true);expect(ranges.every(range=>range.start!==0||range.end!==blob.size)).toBe(true);
 });
 it('keeps resource path resolution within the archive',()=>{
  expect(resolveEpubPath('OPS/text/ch.xhtml','../images/a%20b.png#cover')).toBe('OPS/images/a b.png');for(const href of ['../../../outside','https://external.invalid/a','//external.invalid/a','/absolute','%5coutside'])expect(()=>resolveEpubPath('OPS/text/ch.xhtml',href)).toThrow();for(const path of ['../x','a//b','a/./b','https://external.invalid','a\\b'])expect(()=>epubPath(path)).toThrow();
 });
 it('rejects a local-header CRC mismatch even when central/data CRC agree',async()=>{await expect(readFirst(zip([{path:'local-crc',localCrc:0}]))).rejects.toThrow();});
 it('rejects local-header sizes that contradict central metadata without a data descriptor',async()=>{await expect(readFirst(zip([{path:'local-size',localBytes:1,localCompressed:1}]))).rejects.toThrow();});
 it('rejects ZIP64 local extra fields even when the central extra is absent',async()=>{await expect(readFirst(zip([{path:'local-zip64',localExtra:new Uint8Array([1,0,0,0])}]))).rejects.toThrow();});
});
