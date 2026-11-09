import {describe,it,expect} from 'vitest';
import {MAX_ORIGINAL_BYTES,MAX_ORIGINAL_DESCRIPTOR_BYTES,MAX_ORIGINAL_NAME_CHARS,MAX_ORIGINAL_PATH_CHARS,ORIGINAL_ENCODINGS,parseOriginalDescriptor,parseOriginalDescriptorJson,originalObjectKey,type OriginalDescriptor} from '../src/features/sync-cloud/services/cloud-original-schema';
import {usableLocalOriginal} from '../src/features/import-export/services/source-data';
import type {SourceFile} from '../src/core/domain';
const book='12345678-1234-4000-8000-123456789abc';
const source='abcdef12-1234-4000-8000-123456789abc';
const descriptor:OriginalDescriptor={version:1,sourceId:source,name:'truyện😀.txt',relativePath:'Kho chữ Hán/Root/A/truyện😀.txt',encoding:'utf-8',sha256:'ab'.repeat(32),bytes:40*1024*1024};
describe('candidate immutable original descriptor',()=>{
  it('preserves Unicode paths, source names, hash, bytes and encoding exactly',()=>{
    expect(parseOriginalDescriptor(descriptor)).toEqual(descriptor);expect(parseOriginalDescriptorJson(JSON.stringify(descriptor))).toEqual(descriptor);
    const decomposed={...descriptor,name:'e\u0301 100% complete.txt',relativePath:'root/e\u0301 100% complete.txt'};expect(parseOriginalDescriptor(decomposed)).toEqual(decomposed);
    expect(parseOriginalDescriptor({...descriptor,relativePath:descriptor.name})).toMatchObject({relativePath:descriptor.name});
    for(const encoding of ORIGINAL_ENCODINGS)expect(parseOriginalDescriptor({...descriptor,encoding,...(['epub','pdf','docx'].includes(encoding)?{name:`truyện😀.${encoding}`,relativePath:`Kho chữ Hán/Root/A/truyện😀.${encoding}`}:{})}).encoding).toBe(encoding);
  });
  it.each([null,undefined,[],1,'text',{},new Date(),{...descriptor,version:2},{...descriptor,version:'1'},{...descriptor,extra:'future'},{...descriptor,sourceId:undefined}])('rejects unsupported shape/version %j',value=>{expect(()=>parseOriginalDescriptor(value)).toThrow('invalid_original_descriptor');});
  it.each([0,-1,1.5,NaN,Infinity,MAX_ORIGINAL_BYTES+1,Number.MAX_SAFE_INTEGER+1,'1'])('rejects invalid declared byte count %j',bytes=>{expect(()=>parseOriginalDescriptor({...descriptor,bytes})).toThrow();});
  it('accepts exactly one byte and exactly the existing 40MiB cap',()=>{expect(parseOriginalDescriptor({...descriptor,bytes:1}).bytes).toBe(1);expect(MAX_ORIGINAL_BYTES).toBe(41943040);expect(parseOriginalDescriptor(descriptor).bytes).toBe(MAX_ORIGINAL_BYTES);});
  it.each(['a'.repeat(63),'a'.repeat(65),'AB'.repeat(32),'gg'.repeat(32),'../'+ 'a'.repeat(61)])('rejects noncanonical hashes %j',sha256=>{expect(()=>parseOriginalDescriptor({...descriptor,sha256})).toThrow();});
  it.each([source.toUpperCase(),source.replaceAll('-',''),`{${source}}`,source+'/',source+'\n','../../escape'])('rejects noncanonical book/source IDs %j',id=>{
    expect(()=>parseOriginalDescriptor({...descriptor,sourceId:id})).toThrow();expect(()=>originalObjectKey(id,descriptor)).toThrow();
  });
  it.each(['gbk','big5','UTF-8','auto','utf-32',null])('rejects unsupported encoding %j',encoding=>{expect(()=>parseOriginalDescriptor({...descriptor,encoding})).toThrow();});
  it.each(['/root/file.txt','//server/share/file.txt','C:/root/file.txt','C:\\root\\file.txt','../file.txt','root/../file.txt','root/./file.txt','root//file.txt','root/file.txt/','root\\file.txt','root/\u0000file.txt','root/\u007ffile.txt','root/\u0085file.txt','root/\uD800file.txt'])('rejects unsafe provenance %j',relativePath=>{expect(()=>parseOriginalDescriptor({...descriptor,name:'file.txt',relativePath})).toThrow();});
  it.each(['',' ','..','.','folder/file.txt','folder\\file.txt','C:file.txt','bad\n.txt'])('rejects unsafe basename %j',name=>{expect(()=>parseOriginalDescriptor({...descriptor,name,relativePath:name})).toThrow();});
  it('requires final path component to match the basename without case/Unicode normalization',()=>{
    expect(()=>parseOriginalDescriptor({...descriptor,name:'one.txt',relativePath:'root/two.txt'})).toThrow();
    expect(()=>parseOriginalDescriptor({...descriptor,name:'ONE.txt',relativePath:'root/one.txt'})).toThrow();
    expect(()=>parseOriginalDescriptor({...descriptor,name:'é.txt',relativePath:'root/e\u0301.txt'})).toThrow();
  });
  it('bounds name/path and raw JSON UTF8, including multibyte and whitespace overhead',()=>{
    const name='x'.repeat(MAX_ORIGINAL_NAME_CHARS);expect(parseOriginalDescriptor({...descriptor,name,relativePath:name}).name).toBe(name);
    expect(()=>parseOriginalDescriptor({...descriptor,name:name+'x',relativePath:name+'x'})).toThrow();
    const relativePath='r'.repeat(MAX_ORIGINAL_PATH_CHARS-descriptor.name.length-1)+'/'+descriptor.name;expect(parseOriginalDescriptor({...descriptor,relativePath}).relativePath).toBe(relativePath);
    expect(()=>parseOriginalDescriptor({...descriptor,relativePath:'r'+relativePath})).toThrow();
    expect(()=>parseOriginalDescriptorJson(' '.repeat(MAX_ORIGINAL_DESCRIPTOR_BYTES)+JSON.stringify(descriptor))).toThrow();
    const multibyte=JSON.stringify({...descriptor,name:'é'.repeat(1000),relativePath:'漢'.repeat(3000)+'/'+'é'.repeat(1000)});
    expect(multibyte.length).toBeLessThan(MAX_ORIGINAL_DESCRIPTOR_BYTES);expect(()=>parseOriginalDescriptorJson(' '.repeat(5000)+multibyte)).toThrow();
    expect(()=>parseOriginalDescriptorJson('{broken')).toThrow();
  });
  it('rejects symbols, inherited records and getters without invoking them',()=>{
    expect(()=>parseOriginalDescriptor({...descriptor,[Symbol('extra')]:1})).toThrow();expect(()=>parseOriginalDescriptor(Object.create(descriptor))).toThrow();
    let called=false;const input={...descriptor};Object.defineProperty(input,'name',{get(){called=true;return descriptor.name;}});expect(()=>parseOriginalDescriptor(input)).toThrow();expect(called).toBe(false);
  });
  it('generates stable namespaced keys solely from canonical book/source/hash',()=>{
    const key=`originals/v1/${book}/${source}/${descriptor.sha256}.bin`;
    expect(originalObjectKey(book,descriptor)).toBe(key);expect(originalObjectKey(book,{...descriptor,name:'different.txt',relativePath:'Elsewhere/different.txt'})).toBe(key);
    expect(originalObjectKey(book,{...descriptor,bytes:1})).toBe(key);
    expect(originalObjectKey('22345678-1234-4000-8000-123456789abc',descriptor)).not.toBe(key);
    expect(originalObjectKey(book,{...descriptor,sourceId:'bbcdef12-1234-4000-8000-123456789abc'})).not.toBe(key);
    expect(originalObjectKey(book,{...descriptor,sha256:'cd'.repeat(32)})).not.toBe(key);
    expect(key).not.toContain('truyện');expect(key).not.toContain('Root');
  });
});

it.each(['%2e%2e','%252f','story%2e.txt','%00.txt','100%.txt'])('preserves literal percent filenames without URL decoding: %s',name=>{
  const value={version:1 as const,sourceId:'00000000-0000-0000-0000-000000000001',name,relativePath:`root/%2F/${name}`,encoding:'utf-8' as const,sha256:'a'.repeat(64),bytes:1};
  expect(parseOriginalDescriptor(value)).toEqual(value);
  expect(originalObjectKey('00000000-0000-0000-0000-000000000002',value)).toBe(`originals/v1/00000000-0000-0000-0000-000000000002/${value.sourceId}/${value.sha256}.bin`);
});
it('applies the per-encoding original limit to local downloads',()=>{
  const local=(encoding:string,bytes:number)=>({encoding,bytes,blob:{size:bytes},sha256:'a'.repeat(64)} as unknown as SourceFile);
  expect(usableLocalOriginal(local('epub',41*1024*1024))).toBe(true);
  expect(usableLocalOriginal(local('epub',256*1024*1024))).toBe(true);
  expect(usableLocalOriginal(local('epub',256*1024*1024+1))).toBe(false);
  expect(usableLocalOriginal(local('utf-8',40*1024*1024))).toBe(true);
  expect(usableLocalOriginal(local('utf-8',40*1024*1024+1))).toBe(false);
  expect(usableLocalOriginal(undefined)).toBe(false);
});
