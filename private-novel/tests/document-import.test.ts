import {sanitizeSourceFilename} from '../src/features/library/services/title-resolver';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {unzipSync,strFromU8} from 'fflate';
import {packageDocument,prepareDocument,importDocument} from '../src/features/import-export/services/document-convert';
import {parseOriginalDescriptor,MAX_ORIGINAL_BYTES} from '../src/features/sync-cloud/services/cloud-original-schema';

const mocks=vi.hoisted(()=>({importEpub:vi.fn(),hash:vi.fn(),count:vi.fn(),add:vi.fn(),deleteBook:vi.fn(),transaction:vi.fn()}));
vi.mock('../src/features/import-export/services/epub-import',()=>({importEpub:mocks.importEpub}));
vi.mock('../src/features/import-export/services/backup',()=>({hashBlob:mocks.hash}));
vi.mock('../src/features/import-export/services/importer',()=>({throwIfImportAborted:(signal:AbortSignal)=>signal.throwIfAborted()}));
vi.mock('../src/core/domain',()=>({uid:()=> 'synthetic-source',cleanTitle:(name:string)=>name.replace(/\.[^.]+$/,'')}));
vi.mock('../src/core/db',()=>({db:{sources:{where:()=>({equals:()=>({count:mocks.count})}),add:mocks.add},transaction:mocks.transaction},deleteBook:mocks.deleteBook}));

const section={title:'Chương <một> & "hai"',html:'<p>Văn bản</p><p><img src="image1.png" /></p>'};
const document=()=>({sections:[section],assets:{'image1.png':new Uint8Array([137,80,78,71])}});
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.hash.mockResolvedValue('a'.repeat(64));mocks.count.mockResolvedValue(0);mocks.add.mockResolvedValue('synthetic-source');
 mocks.deleteBook.mockResolvedValue(undefined);mocks.importEpub.mockResolvedValue({id:'new-book'});
 mocks.transaction.mockImplementation(async(...args:unknown[])=>(args.at(-1) as ()=>Promise<void>)());
});

describe('document EPUB packaging',()=>{
 it('keeps section order, asset bytes and escaped metadata in the generated archive',async()=>{
  const converted=document();converted.sections.push({title:'Thứ hai',html:'<p>Tiếp</p>'});
  const file=packageDocument(converted,'Sách <&>');
  const entries=unzipSync(new Uint8Array(await file.arrayBuffer()));
  expect(strFromU8(entries.mimetype)).toBe('application/epub+zip');
  expect(entries['image1.png']).toEqual(converted.assets['image1.png']);
  expect(strFromU8(entries['section0.xhtml'])).toContain('<title>Chương &lt;một&gt; &amp; &quot;hai&quot;</title>');
  expect(strFromU8(entries['section0.xhtml'])).toContain(section.html);
  expect(strFromU8(entries['section1.xhtml'])).toContain('<p>Tiếp</p>');
  expect(strFromU8(entries['nav.xhtml'])).toContain('href="section0.xhtml">Chương &lt;một&gt; &amp; &quot;hai&quot;</a>');
  const opf=strFromU8(entries['book.opf']);
  expect(opf).toContain('<dc:title>Sách &lt;&amp;&gt;</dc:title>');
  expect(opf).toContain('<itemref idref="s0"/><itemref idref="s1"/>');
  expect(opf).toContain('href="image1.png" media-type="image/png"');
 });
 it.each(['../image1.png','https://example.test/image1.png','image1.svg','section0.xhtml'])('rejects an unsafe or unsupported asset key %s',path=>{
  expect(()=>packageDocument({sections:[section],assets:{[path]:new Uint8Array([1])}},'Title')).toThrow(/Ảnh/);
 });
 it('rejects per-image and combined asset limits before compression',()=>{
  expect(()=>packageDocument({sections:[section],assets:{'image1.png':new Uint8Array(8*1048576+1)}},'Title')).toThrow(/Ảnh/);
  const image=new Uint8Array(8*1048576),assets=Object.fromEntries(Array.from({length:9},(_,i)=>[`image${i}.png`,image]));
  expect(()=>packageDocument({sections:[section],assets},'Title')).toThrow(/24 MiB/);
 });
 it('rejects empty documents, excessive sections and an oversized section',()=>{
  expect(()=>packageDocument({sections:[],assets:{}},'Title')).toThrow();
  expect(()=>packageDocument({sections:Array(2001).fill(section),assets:{}},'Title')).toThrow(/2.000/);
  expect(()=>packageDocument({sections:[{title:'Large',html:'x'.repeat(500000)}],assets:{}},'Title')).toThrow(/quá lớn/);
 });
});

describe('PDF and DOCX original descriptor contract',()=>{
 const descriptor=(encoding:string,name:string,bytes=MAX_ORIGINAL_BYTES)=>({version:1,sourceId:'00000000-0000-4000-8000-000000000001',name,relativePath:`author/${name}`,encoding,sha256:'a'.repeat(64),bytes});
 it.each(['pdf','docx'])('accepts %s originals through the exact 40 MiB boundary and rejects extension/size mismatch',encoding=>{
  expect(parseOriginalDescriptor(descriptor(encoding,`Book.${encoding.toUpperCase()}`)).encoding).toBe(encoding);
  expect(()=>parseOriginalDescriptor(descriptor(encoding,`Book.${encoding}`,MAX_ORIGINAL_BYTES+1))).toThrow('invalid_original_descriptor');
  expect(()=>parseOriginalDescriptor(descriptor(encoding,'Book.epub'))).toThrow('invalid_original_descriptor');
  expect(()=>parseOriginalDescriptor(descriptor(encoding,`Book.${encoding}`,0))).toThrow('invalid_original_descriptor');
 });
 it('rejects unsupported, empty and oversized input before loading converters',async()=>{
  const signal=new AbortController().signal;
  for(const file of [new File(['x'],'book.txt'),new File([],'book.pdf'),new File([new Uint8Array(40*1048576+1)],'book.docx')])await expect(prepareDocument(file,signal)).rejects.toThrow(/40 MiB/);
 });
});

describe('original-source attachment and rollback orchestration',()=>{
 const original=()=>new File(['original immutable bytes'],'Book.DOCX');
 const prepared=()=>new File(['synthetic converted content'],'Book.epub');
 it('attaches the original bytes and provenance rather than the converted EPUB',async()=>{
  const source=original(),epub=prepared(),signal=new AbortController().signal;
  expect(await importDocument(source,epub,'Book',()=>{},signal)).toEqual({id:'new-book'});
  expect(mocks.importEpub).toHaveBeenCalledWith(epub,'Book',expect.any(Function),signal,{dedupe:'none'});
  expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({bookId:'new-book',name:'Book.DOCX',encoding:'docx',sha256:'a'.repeat(64),bytes:source.size,blob:source}));
  expect(mocks.deleteBook).not.toHaveBeenCalled();
 });
 it('does not start EPUB import for duplicate or already cancelled originals',async()=>{
  mocks.count.mockResolvedValueOnce(1);
  await expect(importDocument(original(),prepared(),'Book',()=>{},new AbortController().signal)).rejects.toThrow(/đã có/);
  const controller=new AbortController();controller.abort();
  await expect(importDocument(original(),prepared(),'Book',()=>{},controller.signal)).rejects.toThrow();
  expect(mocks.importEpub).not.toHaveBeenCalled();expect(mocks.add).not.toHaveBeenCalled();
 });
 it('rolls back the newly staged book if cancellation occurs after EPUB conversion',async()=>{
  const controller=new AbortController();
  mocks.importEpub.mockImplementationOnce(async()=>{controller.abort();return {id:'new-book'};});
  await expect(importDocument(original(),prepared(),'Book',()=>{},controller.signal)).rejects.toThrow();
  expect(mocks.add).not.toHaveBeenCalled();expect(mocks.deleteBook).toHaveBeenCalledExactlyOnceWith('new-book');
 });
 it('rolls back the staged book when saving the original source fails',async()=>{
  mocks.add.mockRejectedValueOnce(Error('source write failed'));
  await expect(importDocument(original(),prepared(),'Book',()=>{},new AbortController().signal)).rejects.toThrow('source write failed');
  expect(mocks.deleteBook).toHaveBeenCalledExactlyOnceWith('new-book');
 });
});

it.each(['pdf','docx'])('download keeps %s source format',format=>{expect(sanitizeSourceFilename('Book.'+format,format)).toBe('Book.'+format);expect(sanitizeSourceFilename('Book.'+format+'.txt',format)).toBe('Book.'+format);});

it('rejects a CJK table of contents beyond the runtime byte limit before packaging',()=>{expect(()=>packageDocument({sections:Array.from({length:2000},(_,i)=>({title:'第'+i+'章 '+'文'.repeat(150),html:'<p>x</p>'})),assets:{}},'Book')).toThrow(/Mục lục tài liệu vượt 512 KiB/);});
