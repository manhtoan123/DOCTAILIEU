import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {anthologyGroups,deriveAnthologyFiles,scanAnthology} from '../src/features/import-export/services/anthology';

const chapterLines=(count:number)=>Array.from({length:count},(_,index)=>`第${index+1}章 Chapter\r\nBody ${index}.`).join('\r\n');
const file=(text:string)=>new File([text],'synthetic.txt');
afterEach(()=>vi.restoreAllMocks());

it('retains late explicit boundaries and every UTF16BE byte after the chapter pool overflows',async()=>{
  const preamble=chapterLines(2001),text=`${preamble}\r\n《Alpha》 作者: Author A\r\nFirst 😀\r\n作品：Beta\r\n${chapterLines(3)}\r\nFinal tail`;
  const body=Buffer.from(text,'utf16le');body.swap16();const original=Buffer.concat([Buffer.from([0xfe,0xff]),body]);
  const source=new File([original],'synthetic.txt'),outline=await scanAnthology(source,'utf-8');
  expect(outline.encoding).toBe('utf-16be');expect(outline.markers).toHaveLength(2);expect(outline.starts).toEqual([0,1]);
  expect(outline.warnings.join(' ')).not.toContain('dù cùng số');
  expect(outline.markers.map(marker=>marker.line)).toEqual([4003,4005]);
  const expectedOffset=2+Buffer.byteLength(`${preamble}\r\n`,'utf16le');expect(outline.markers[0].offset).toBe(expectedOffset);
  const groups=anthologyGroups(outline,outline.starts);expect(groups.map(group=>group.title)).toEqual(['Alpha','Beta']);
  const parts=await deriveAnthologyFiles(source,outline,outline.starts,groups.map(group=>group.title));
  const joined=Buffer.concat(await Promise.all(parts.map(async part=>Buffer.from(await part.arrayBuffer()))));
  expect(joined).toEqual(original);expect(outline.sha256).toBe(createHash('sha256').update(original).digest('hex'));
  expect(new TextDecoder('utf-16be',{fatal:true}).decode(await parts[1].arrayBuffer())).toContain('Final tail');
});

it('keeps custom chapter regex authoritative even when explicit story labels could avoid its overflow',async()=>{
  const source=file(`书名：Alpha\n${chapterLines(2001)}\n文件2: Beta.txt\nTail`);
  await expect(scanAnthology(source,'utf-8','^第')).rejects.toThrow(/Regex.*2\.000/);
  const outline=await scanAnthology(source,'utf-8');expect(outline.markers.map(marker=>marker.title)).toEqual(['书名：Alpha','文件2: Beta.txt']);
  const custom=await scanAnthology(source,'utf-8','^文件');expect(custom.markers.map(marker=>marker.title)).toEqual(['文件2: Beta.txt']);expect(custom.starts).toEqual([0]);
});

it('keeps every fallback marker at the exact cap and rejects overflow with only one explicit label',async()=>{
  const prefix='作品：Alpha\n';
  const exact=await scanAnthology(file(prefix+chapterLines(1999)),'utf-8');
  expect(exact.markers).toHaveLength(2000);expect(exact.markers[0].title).toBe('作品：Alpha');expect(exact.markers.at(-1)!.title).toBe('第1999章 Chapter');
  await expect(scanAnthology(file(prefix+chapterLines(2000)),'utf-8')).rejects.toThrow(/2\.000/);
});

it('continues reading and honors cancellation after detecting two early explicit labels',async()=>{
  const source=file('书名：Alpha\nBody\n作品：Beta\n'+'Body line.\n'.repeat(30000)),controller=new AbortController();
  const slice=source.slice.bind(source);let reads=0;
  vi.spyOn(source,'slice').mockImplementation((...args)=>{
    const blob=slice(...args),read=blob.arrayBuffer.bind(blob);
    vi.spyOn(blob,'arrayBuffer').mockImplementation(async()=>{const bytes=await read();if(++reads===2)controller.abort();return bytes;});return blob;
  });
  await expect(scanAnthology(source,'utf-8','',controller.signal)).rejects.toThrow();expect(reads).toBe(2);
});
