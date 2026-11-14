import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '../src/core/db';
import {prepareBatchFiles,prepareBatchDocuments,commitBatchImports,validateBatchSelection} from '../src/features/import-export/services/batch-import';
const mocks=vi.hoisted(()=>({prepare:vi.fn(),read:vi.fn()}));
vi.mock('../src/features/import-export/services/document-convert',async original=>({...await original<typeof import('../src/features/import-export/services/document-convert')>(),prepareDocument:mocks.prepare}));
vi.mock('../src/features/import-export/services/epub-package',()=>({openEpubPackage:async(blob:Blob)=>({blob,entries:new Map(),title:'Synthetic',author:'',spine:[{path:'one.xhtml',title:'Chapter 1'}]}),readEpubChapter:mocks.read,readEpubChapterParts:async(...args:unknown[])=>{const result=await mocks.read(...args);return Array.isArray(result)?result:[result];}}));
const file=(name:string)=>new File(['same raw original'],name),archive=()=>new File(['converted archive'],'reading.epub');
const prepare=(files:File[],signal=new AbortController().signal,documents?:ReadonlyMap<File,File>)=>prepareBatchFiles(files,'auto','',true,()=>{},signal,0,undefined,documents);
beforeEach(async()=>{await db.delete();await db.open();vi.clearAllMocks();vi.stubGlobal('navigator',{storage:{estimate:async()=>({quota:1e9,usage:0})}});mocks.prepare.mockImplementation(async()=>archive());mocks.read.mockResolvedValue({path:'one.xhtml',body:'<body><p>Text</p></body>',styles:[],nodes:['Text']});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function counts(){return Promise.all([db.books.count(),db.chapters.count(),db.sources.count(),db.importJobs.count()]);}
it('previews all documents sequentially with zero DB mutation, ignoring TXT/EPUB conversions',async()=>{
 const files=[file('one.pdf'),file('skip.txt'),file('two.docx'),file('skip.epub')],result=await prepareBatchDocuments(files,()=>{},new AbortController().signal);
 expect([...result.keys()]).toEqual([files[0],files[2]]);expect(mocks.prepare.mock.calls.map(args=>args[0])).toEqual([files[0],files[2]]);expect(await counts()).toEqual([0,0,0,0]);
});
it('makes identical selected documents independent books even when already present',async()=>{
 const first=await prepare([file('existing.pdf')]);await commitBatchImports(first.ids);
 const files=[file('one.pdf'),file('two.docx')],cached=new Map(files.map(f=>[f,archive()])),result=await prepare(files,undefined,cached);
 expect(mocks.prepare).toHaveBeenCalledTimes(1);expect(result.ids).toHaveLength(2);await commitBatchImports(result.ids);
 expect((await db.books.bulkGet(result.ids)).map(b=>b?.title)).toEqual(['one','two']);expect(await counts()).toEqual([3,3,6,3]);
 for(const id of result.ids){const sources=await db.sources.where('bookId').equals(id).toArray();expect(sources).toHaveLength(2);const raw=sources.find(s=>s.encoding!=='epub')!;expect(await raw.blob.text()).toBe('same raw original');expect(raw.sha256).not.toBe(sources.find(s=>s.encoding==='epub')!.sha256);}
});
it('rolls back the complete batch when a later chapter fails without deleting an existing book',async()=>{
 const {ids}=await prepare([file('existing.pdf')]);await commitBatchImports(ids);const prior=await counts();mocks.read.mockResolvedValueOnce({path:'one.xhtml',body:'<body><p>One</p></body>',styles:[],nodes:['One']}).mockRejectedValueOnce(Error('bad chapter'));
 await expect(prepare([file('one.pdf'),file('two.docx')])).rejects.toThrow('bad chapter');expect(await counts()).toEqual(prior);expect((await db.books.toArray()).map(b=>b.id)).toEqual(ids);
});
it('rolls back both current and completed books when original attachment fails later',async()=>{
 const add=db.sources.add.bind(db.sources);vi.spyOn(db.sources,'add').mockImplementation((...args:Parameters<typeof add>)=>{if(args[0].name==='two.docx')return Promise.reject(Error('original write failure')) as ReturnType<typeof add>;return add(...args);});
 await expect(prepare([file('one.pdf'),file('two.docx')])).rejects.toThrow('original write failure');expect(await counts()).toEqual([0,0,0,0]);
});
it('cancel during read-only conversion cannot create books or continue remaining files',async()=>{
 const controller=new AbortController();mocks.prepare.mockImplementationOnce(async()=>{controller.abort();return archive();});await expect(prepare([file('one.pdf'),file('two.docx')],controller.signal)).rejects.toThrow();expect(mocks.prepare).toHaveBeenCalledTimes(1);expect(await counts()).toEqual([0,0,0,0]);
});
it('cancel while saving the second document cleans the first and the active document',async()=>{
 const controller=new AbortController(),add=db.sources.add.bind(db.sources);vi.spyOn(db.sources,'add').mockImplementation((...args:Parameters<typeof add>)=>{if(args[0].name==='two.docx')controller.abort();return add(...args);});await expect(prepare([file('one.pdf'),file('two.docx')],controller.signal)).rejects.toThrow();expect(await counts()).toEqual([0,0,0,0]);
});
it('rejects incomplete cached previews rather than silently reconverting after confirmation',async()=>{
 const files=[file('one.pdf'),file('two.docx')];await expect(prepare(files,undefined,new Map([[files[0],archive()]]))).rejects.toThrow(/xem trước/);expect(mocks.prepare).not.toHaveBeenCalled();expect(await counts()).toEqual([0,0,0,0]);
});
it('checks cumulative preview bytes both during preparation and at staging boundary',async()=>{
 const huge=archive();Object.defineProperty(huge,'size',{value:65*1048576});mocks.prepare.mockResolvedValue(huge);const files=[file('one.pdf'),file('two.docx')];await expect(prepareBatchDocuments(files,()=>{},new AbortController().signal)).rejects.toThrow(/128 MiB/);await expect(prepare(files,undefined,new Map(files.map(f=>[f,huge])))).rejects.toThrow(/128 MiB/);expect(await counts()).toEqual([0,0,0,0]);
});
it('checks file count, unsupported extension, size and document-only quota even with EPUB',()=>{
 expect(()=>validateBatchSelection(Array.from({length:101},()=>file('one.pdf')))).toThrow(/100/);expect(()=>validateBatchSelection([file('bad.zip')])).toThrow(/chỉ hỗ trợ/);const over=file('big.pdf');Object.defineProperty(over,'size',{value:40*1048576+1});expect(()=>validateBatchSelection([over])).toThrow(/40 MiB/);
 const docs=Array.from({length:7},(_,i)=>{const f=file(`${i}.docx`);Object.defineProperty(f,'size',{value:40*1048576});return f;});expect(()=>validateBatchSelection([...docs,file('one.epub')])).toThrow(/256 MiB nguồn PDF/);
});
