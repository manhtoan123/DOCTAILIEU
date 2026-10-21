import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {scanAnthology,anthologyGroups,deriveAnthologyFiles} from '../src/features/import-export/services/anthology';

const text='Lời đầu\r\n第1章 山河1\r\n甲😀\r\n第1章 山河2\r\n乙\r\n第2章 江海1\r\n丙\r\n第2章 江海2\r\n丁\r\n第4章 星光\r\nKết thúc';
function fixture(value=text){return new File([value],'tuyển tập.txt');}
describe('anthology byte-preserving outline',()=>{
  it('prioritizes story headers over thousands of chapter headings without dropping source bytes',async()=>{
    const chapters=Array.from({length:1100},(_,index)=>`第${index+1}章 Chương\r\nNội dung.`).join('\r\n');
    const file=fixture(`Lời đầu\r\n文件1: Sơn hà.txt\r\n${chapters}\r\n文件2: Giang hải.txt\r\n${chapters}\r\nKết`);
    const outline=await scanAnthology(file,'utf-8'),groups=anthologyGroups(outline,outline.starts);
    expect(outline.markers).toHaveLength(2);expect(outline.starts).toEqual([0,1]);expect(groups.map(group=>group.title)).toEqual(['Sơn hà','Giang hải']);
    const parts=await deriveAnthologyFiles(file,outline,outline.starts,groups.map(group=>group.title));
    expect(Buffer.concat(await Promise.all(parts.map(async part=>Buffer.from(await part.arrayBuffer()))))).toEqual(Buffer.from(await file.arrayBuffer()));
    expect((await parts[1].text()).match(/第\d+章/gu)).toHaveLength(1100);
  });
  it.each([['书名：山河','作品：江海'],['《山河》 作者：甲','《江海》作者:乙']])('uses explicit story names and leaves chapter detection to the import stage',async(first,second)=>{
    const outline=await scanAnthology(fixture(`${first}\n第1章 一\n甲\n第2章 二\n乙\n${second}\n第1章 三\n丙`),'utf-8');
    expect(anthologyGroups(outline,outline.starts).map(group=>group.title)).toEqual(['山河','江海']);expect(outline.markers).toHaveLength(2);
    const custom=await scanAnthology(fixture(`${first}\n第1章 一\n甲\n${second}\n第1章 二\n乙`),'utf-8','^第');expect(custom.markers.every(marker=>marker.title.startsWith('第'))).toBe(true);
  });
  it('does not truncate excessive chapter or explicit story matches, including late story headers',async()=>{
    const chapters=Array.from({length:2001},(_,index)=>`第${index+1}章 Chương`).join('\n');
    await expect(scanAnthology(fixture(chapters),'utf-8')).rejects.toThrow('chưa nhận diện đủ tên truyện');
    const outline=await scanAnthology(fixture(`${chapters}\n书名：甲\nNội dung\n书名：乙\nKết`),'utf-8');expect(outline.markers).toHaveLength(2);expect(outline.starts).toEqual([0,1]);
    await expect(scanAnthology(fixture(Array.from({length:2001},(_,index)=>`文件${index+1}: Book.txt`).join('\n')),'utf-8')).rejects.toThrow('2.000');
  });
  it('groups repeated outer numbers while preserving preamble, raw CRLF and final bytes',async()=>{
    const file=fixture(),outline=await scanAnthology(file,'utf-8'),groups=anthologyGroups(outline,outline.starts);
    expect(groups.map(group=>group.title)).toEqual(['山河','江海','星光']);expect(groups.map(group=>group.headingCount)).toEqual([2,2,1]);
    expect(outline.markers.map(marker=>marker.line)).toEqual([2,4,6,8,10]);expect(outline.warnings.join(' ')).toContain('2 sang 4');
    const files=await deriveAnthologyFiles(file,outline,outline.starts,groups.map(group=>group.title));
    const joined=Buffer.concat(await Promise.all(files.map(async part=>Buffer.from(await part.arrayBuffer()))));
    expect(joined).toEqual(Buffer.from(await file.arrayBuffer()));expect(files[0].webkitRelativePath).toBe(`tuyển tập.txt/${files[0].name}`);
    expect(files.map(part=>part.name)).toEqual(['001 - 山河.txt','002 - 江海.txt','003 - 星光.txt']);
    expect(outline.sha256).toBe(createHash('sha256').update(joined).digest('hex'));
  });
  it.each(['utf-16le','utf-16be'] as const)('keeps BOM only in the first slice and partitions %s exactly',async encoding=>{
    const bytes=Buffer.from(text,'utf16le');if(encoding==='utf-16be')bytes.swap16();
    const all=Buffer.concat([Buffer.from(encoding==='utf-16le'?[255,254]:[254,255]),bytes]);const file=new File([all],'utf16.txt');
    const outline=await scanAnthology(file,'utf-8'),groups=anthologyGroups(outline,outline.starts);expect(outline.encoding).toBe(encoding);
    const files=await deriveAnthologyFiles(file,outline,outline.starts,groups.map(group=>group.title));
    const parts=await Promise.all(files.map(async part=>Buffer.from(await part.arrayBuffer())));expect(Buffer.concat(parts)).toEqual(all);
    expect(parts[0].subarray(0,2)).toEqual(all.subarray(0,2));expect(parts[1].subarray(0,2)).not.toEqual(all.subarray(0,2));
  });
  it('does not automatically turn an ordinary ascending chapter list into many stories',async()=>{
    const outline=await scanAnthology(fixture('第1章 一\n甲\n第2章 二\n乙\n第3章 三\n丙'),'utf-8');
    expect(outline.starts).toEqual([0]);expect(outline.warnings.join(' ')).toContain('Chưa đủ dấu hiệu');
  });
  it('supports manual boundaries, CR-only files and a custom story marker',async()=>{
    const file=fixture('Preamble\rBOOK A\r第1章 一\r甲\rBOOK B\r第1章 二\r乙');
    const outline=await scanAnthology(file,'utf-8','^BOOK ');expect(outline.markers.map(marker=>marker.line)).toEqual([2,5]);
    const parts=await deriveAnthologyFiles(file,outline,[0,1],['Tên A','Tên B']);expect(await parts[0].text()).toContain('Preamble');expect(await parts[1].text()).toContain('BOOK B');
  });
  it('rejects a changed file, invalid ranges, too many stories and cancelled work',async()=>{
    const file=fixture(),outline=await scanAnthology(file,'utf-8');
    await expect(deriveAnthologyFiles(fixture(text.replace('Kết thúc','Hết rồi')),outline,outline.starts,['A','B','C'])).rejects.toThrow('đã thay đổi');
    expect(()=>anthologyGroups(outline,[0,0])).toThrow();expect(()=>anthologyGroups(outline,[1,2])).toThrow();expect(()=>anthologyGroups(outline,Array.from({length:101},(_,index)=>index))).toThrow();
    const controller=new AbortController();controller.abort();await expect(scanAnthology(file,'utf-8','',controller.signal)).rejects.toThrow();await expect(deriveAnthologyFiles(file,outline,outline.starts,['A','B','C'],controller.signal)).rejects.toThrow();
  });
  it('handles a heading crossing a chunk boundary and ignores oversized body lines',async()=>{
    const body='x'.repeat(262140)+'\r\n第1章 A1\n甲\n第1章 A2\n乙\n第2章 B1\n丙\n第2章 B2\n丁';
    const file=fixture(body),outline=await scanAnthology(file,'utf-8');expect(outline.markers).toHaveLength(4);expect(outline.starts).toEqual([0,2]);
    const files=await deriveAnthologyFiles(file,outline,outline.starts,['A','B']);expect(Buffer.concat(await Promise.all(files.map(async part=>Buffer.from(await part.arrayBuffer()))))).toEqual(Buffer.from(body));
  });
  it('rejects empty, malformed UTF16, bad regex and excess marker input',async()=>{
    await expect(scanAnthology(new Blob([]),'utf-8')).rejects.toThrow();await expect(scanAnthology(new Blob([new Uint8Array([255,254,1])]),'utf-8')).rejects.toThrow();
    await expect(scanAnthology(fixture(),'utf-8','[')).rejects.toThrow();await expect(scanAnthology(fixture(Array.from({length:2001},(_,index)=>`BOOK ${index}`).join('\n')),'utf-8','^BOOK ')).rejects.toThrow('2.000');
  });
});
