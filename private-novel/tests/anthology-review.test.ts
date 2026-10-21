import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {anthologyGroups,deriveAnthologyFiles,scanAnthology} from '../src/features/import-export/services/anthology';
import {parseOriginalDescriptor} from '../src/features/sync-cloud/services/cloud-original-schema';

const chunk=262144;
const storyPattern='^STORY';
const content='Preamble\r\nSTORY Alpha\r\n甲😀\r\nSTORY Beta\r\n乙\r\n';
const sourceId='00000000-0000-4000-8000-000000000921';
const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
function encoded(text:string,encoding:string){
  if(encoding==='utf-8')return new Uint8Array(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text)]));
  const body=Buffer.from(text,'utf16le');if(encoding==='utf-16be')body.swap16();
  return new Uint8Array(Buffer.concat([Buffer.from(encoding==='utf-16be'?[0xfe,0xff]:[0xff,0xfe]),body]));
}
async function assertPartition(file:File,encoding:string){
  const outline=await scanAnthology(file,'gb18030',storyPattern);
  expect(outline.encoding).toBe(encoding);expect(outline.markers).toHaveLength(2);
  const parts=await deriveAnthologyFiles(file,outline,outline.starts,['Alpha','Beta']);
  const rebuilt=new Uint8Array(await new Blob(parts).arrayBuffer()),original=new Uint8Array(await file.arrayBuffer());
  expect(rebuilt).toEqual(original);expect(outline.sha256).toBe(hash(original));
  const groups=anthologyGroups(outline,outline.starts);
  expect(groups[0].start).toBe(0);expect(groups[0].end).toBe(groups[1].start);expect(groups[1].end).toBe(file.size);
  for(const [index,part] of parts.entries()){
    const bytes=new Uint8Array(await part.arrayBuffer());
    expect(bytes).toEqual(original.subarray(groups[index].start,groups[index].end));
    expect(new TextDecoder(encoding,{fatal:true}).decode(bytes)).toContain(index?'乙':'甲😀');
    expect(parseOriginalDescriptor({version:1,sourceId,name:part.name,relativePath:part.webkitRelativePath,encoding,sha256:hash(bytes),bytes:part.size}).name).toBe(part.name);
  }
  expect(new TextDecoder(encoding).decode(await parts[0].arrayBuffer())).toContain('Preamble');
}
afterEach(()=>vi.restoreAllMocks());

it.each(['utf-8','utf-16le','utf-16be'])('partitions %s BOM, preamble, CRLF and non-BMP text without inserting bytes',async encoding=>{
  await assertPartition(new File([encoded(content,encoding)],'synthetic.txt'),encoding);
});

it('keeps raw GB18030 four-byte sequences intact without re-encoding decoded text',async()=>{
  const bytes=new Uint8Array([...Buffer.from('Preamble\r\nSTORY Alpha\r\n'),0x81,0x30,0x81,0x30,...Buffer.from('\r\nSTORY Beta\r\n'),0xb5,0xda,0xd2,0xbb,0xd5,0xc2]);
  const file=new File([bytes],'synthetic.txt'),outline=await scanAnthology(file,'gb18030',storyPattern);
  const parts=await deriveAnthologyFiles(file,outline,outline.starts,['Alpha','Beta']);
  expect(new Uint8Array(await new Blob(parts).arrayBuffer())).toEqual(bytes);
  expect(outline.sha256).toBe(hash(bytes));expect(outline.encoding).toBe('gb18030');
  expect(new TextDecoder('gb18030',{fatal:true}).decode(await parts[1].arrayBuffer())).toContain('第一章');
});

it('tracks byte offsets and CRLF lines when both line endings and UTF16 units cross chunk edges',async()=>{
  for(const encoding of ['utf-8','utf-16le','utf-16be']){
    const fill=encoding==='utf-8'?chunk-4:chunk/2-2;
    const text='P'.repeat(fill)+'\r\nSTORY Alpha\r\nA\r\nSTORY Beta\r\nB';
    const file=new File([encoded(text,encoding)],'synthetic.txt');
    const outline=await scanAnthology(file,'utf-8',storyPattern);
    expect(outline.markers.map(marker=>marker.line)).toEqual([2,4]);
    const unit=encoding==='utf-8'?1:2,bom=encoding==='utf-8'?3:2;
    expect(outline.markers[0].offset).toBe(bom+(fill+2)*unit);
    const parts=await deriveAnthologyFiles(file,outline,outline.starts,['Alpha','Beta']);
    expect(new Uint8Array(await new Blob(parts).arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()));
  }
});

it('rejects same-size replacement after preview and aborted derivation before producing parts',async()=>{
  const file=new File([content],'synthetic.txt'),outline=await scanAnthology(file,'utf-8',storyPattern);
  await expect(deriveAnthologyFiles(new File([content.replace('甲','丙')],'synthetic.txt'),outline,outline.starts,['Alpha','Beta'])).rejects.toThrow(/thay đổi/);
  const controller=new AbortController();controller.abort();
  await expect(deriveAnthologyFiles(file,outline,outline.starts,['Alpha','Beta'],controller.signal)).rejects.toThrow();
  const cancelled=new AbortController(),slice=file.slice.bind(file);
  vi.spyOn(file,'slice').mockImplementation((...args)=>{
    const blob=slice(...args),read=blob.arrayBuffer.bind(blob);
    vi.spyOn(blob,'arrayBuffer').mockImplementation(async()=>{const bytes=await read();cancelled.abort();return bytes;});return blob;
  });
  await expect(deriveAnthologyFiles(file,outline,outline.starts,['Alpha','Beta'],cancelled.signal)).rejects.toThrow();
});

it('rejects reordered, duplicate, excessive and unaligned boundaries before deriving files',async()=>{
  const file=new File([encoded(content,'utf-16be')],'synthetic.txt'),outline=await scanAnthology(file,'utf-8',storyPattern);
  for(const starts of [[1],[0,0],[0,2],[0,1,0]])expect(()=>anthologyGroups(outline,starts)).toThrow();
  expect(()=>anthologyGroups({...outline,markers:outline.markers.map((marker,index)=>index?{...marker,offset:marker.offset+1}:marker)},[0,1])).toThrow();
  const many=await scanAnthology(new File([Array.from({length:101},(_,index)=>`STORY ${index}\nA`).join('\n')],'synthetic.txt'),'utf-8',storyPattern);
  expect(()=>anthologyGroups(many,many.starts)).toThrow(/100/);
});

it('rejects control characters that would make derived originals unsynchronizable',async()=>{
  const file=new File([content],'synthetic.txt'),outline=await scanAnthology(file,'utf-8',storyPattern);
  await expect(deriveAnthologyFiles(file,outline,outline.starts,['Alpha\u0090Title','Beta'])).rejects.toThrow();
  await expect(deriveAnthologyFiles(new File([content],'parent\u0090.txt'),outline,outline.starts,['Alpha','Beta'])).rejects.toThrow();
});

it('keeps percent-encoded provenance literal and sanitizes derived names into valid descriptors',async()=>{
  const file=new File([content],'original%2f中.txt'),outline=await scanAnthology(file,'utf-8',storyPattern);
  const parts=await deriveAnthologyFiles(file,outline,outline.starts,['../%2e/Alpha:??','Beta😀']);
  for(const part of parts){
    expect(part.webkitRelativePath.startsWith('original%2f中.txt/')).toBe(true);
    const bytes=new Uint8Array(await part.arrayBuffer());
    expect(parseOriginalDescriptor({version:1,sourceId,name:part.name,relativePath:part.webkitRelativePath,encoding:'utf-8',sha256:hash(bytes),bytes:part.size}).relativePath).toBe(part.webkitRelativePath);
  }
  expect(new Uint8Array(await new Blob(parts).arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()));
});
