import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db,commitImport,readyChapters} from '../src/core/db';
import {importFolderGroup,planFolderImport,MAX_FOLDER_FILE_BYTES,MAX_FOLDER_SOURCE_BYTES} from '../src/features/import-export/services/folder-import';

function file(path:string,content:string|Uint8Array='正文'){
  const f=new File([typeof content==='string'?content:new Uint8Array(content)],path.split('/').at(-1)!);
  Object.defineProperty(f,'webkitRelativePath',{value:path});return f;
}
async function run(files:File[],encoding='utf-8',controller=new AbortController()){
  return importFolderGroup(planFolderImport(files).groups[0],encoding,()=>{},controller.signal);
}
async function expectEmpty(){for(const table of [db.books,db.chapters,db.sources,db.importJobs])expect(await table.count()).toBe(0);}
beforeEach(async()=>{await db.delete();await db.open();});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('folder selection plan',()=>{
  it('separates direct parents, naturally sorts every chapter and explicitly lists ignored files',()=>{
    const files=[file('Root/Story/10.txt'),file('Root/Story/2.txt'),file('Root/Story/01.txt'),file('Root/Story/nested/1.txt'),file('Root/Other/1.txt'),file('Root/Story/cover.jpg'),file('Root/Story/book.epub')];
    const plan=planFolderImport(files);
    expect(plan.groups.map(g=>g.path)).toEqual(['Root/Other','Root/Story','Root/Story/nested']);
    expect(plan.groups[1].files.map(f=>f.name)).toEqual(['01.txt','2.txt','10.txt']);
    expect(plan.ignored).toEqual(['Root/Story/book.epub','Root/Story/cover.jpg']);
    expect(files[0].name).toBe('10.txt');
  });
  it.each(['../a.txt','Root/../a.txt','/Root/a.txt','Root//a.txt','Root/./a.txt','Root\\a.txt','C:/Root/a.txt'])('rejects invalid relative path %s before writes',async path=>{
    expect(()=>planFolderImport([file(path)])).toThrow('không hợp lệ');await expectEmpty();
  });
  it('rejects duplicate paths even when they are unsupported files',()=>{
    expect(()=>planFolderImport([file('Root/a.txt'),file('Root/a.txt')])).toThrow('trùng');
    expect(()=>planFolderImport([file('Root/a.jpg'),file('Root/a.jpg')])).toThrow('trùng');
  });
});
describe('atomic folder staging',()=>{
  it('keeps identical texts as distinct chapters and separate books, retains original source bytes, and commits preview',async()=>{
    const a=file('Root/2.txt','第1章\r\n正文\r\n第2章\r\n完');const b=file('Root/10.txt','第1章\r\n正文\r\n第2章\r\n完');
    const {id}=await run([b,a]);const {id:second}=await run([file('Other/2.txt',await a.text())]);
    const chapters=await readyChapters(id);expect(chapters.map(c=>c.title)).toEqual(['第1章','第2章','第1章','第2章']);
    expect(chapters.map(c=>c.text)).toEqual(['第1章\n正文\n','第2章\n完','第1章\n正文\n','第2章\n完']);
    expect((await db.books.get(id))?.status).toBe('staging');expect((await readyChapters(second))).toHaveLength(2);
    expect(chapters.map(c=>c.order)).toEqual([0,1,2,3]);
    const sources=await db.sources.where('bookId').equals(id).toArray();expect(sources).toHaveLength(2);
    expect(sources[0].sha256).toBe(sources[1].sha256);
    expect(new Uint8Array(await sources[0].blob.arrayBuffer())).toEqual(new Uint8Array(await a.arrayBuffer()));
    await commitImport(id);expect((await db.books.get(id))?.status).toBe('ready');
    expect((await db.importJobs.where('bookId').equals(id).first())?.phase).toBe('committed');
  });
  it('does not persist a successfully read first chapter when a later file is invalid',async()=>{
    await expect(run([file('Root/1.txt'),file('Root/2.txt',new Uint8Array([0xff]))])).rejects.toThrow('encoding');await expectEmpty();
  });
  it('rejects empty chapters rather than silently dropping them',async()=>{
    await expect(run([file('Root/1.txt'),file('Root/2.txt',' \r\n')])).rejects.toThrow('rỗng');await expectEmpty();
  });
  it('rolls back all tables after source write failure and preserves an unrelated book',async()=>{
    await db.books.add({id:'existing',title:'existing',author:'',createdAt:1,updatedAt:1,status:'ready',chapterCount:0,charCount:0});
    vi.spyOn(db.sources,'bulkAdd').mockRejectedValue(new Error('source failure'));
    await expect(run([file('Root/1.txt')])).rejects.toThrow('source failure');
    expect((await db.books.toArray()).map(b=>b.id)).toEqual(['existing']);
    for(const table of [db.chapters,db.sources,db.importJobs])expect(await table.count()).toBe(0);
  });
  it('cancels before reading, between files and during the transaction without partial data',async()=>{
    const early=new AbortController();early.abort();await expect(run([file('Root/1.txt')],'utf-8',early)).rejects.toThrow('hủy');
    const duringRead=new AbortController();const f=file('Root/1.txt');const read=f.arrayBuffer.bind(f);
    vi.spyOn(f,'arrayBuffer').mockImplementation(async()=>{duringRead.abort();return read();});
    await expect(run([f],'utf-8',duringRead)).rejects.toThrow('hủy');await expectEmpty();
    const between=new AbortController();const group=planFolderImport([file('Root/1.txt'),file('Root/2.txt')]).groups[0];
    await expect(importFolderGroup(group,'utf-8',()=>between.abort(),between.signal)).rejects.toThrow('hủy');await expectEmpty();
    const writing=new AbortController();const bulkAdd=db.sources.bulkAdd.bind(db.sources);
    vi.spyOn(db.sources,'bulkAdd').mockImplementation((...args:Parameters<typeof bulkAdd>)=>{writing.abort();return bulkAdd(...args);});
    await expect(run([file('Root/1.txt')],'utf-8',writing)).rejects.toThrow('hủy');await expectEmpty();
  });
  it('revalidates malformed or mixed preview groups at the write boundary',async()=>{
    await expect(importFolderGroup({path:'Root',title:'Root',files:[file('Root/a.txt'),file('Root/sub/b.txt')]},'utf-8',()=>{},new AbortController().signal)).rejects.toThrow('Nhóm');await expectEmpty();
  });
  it('rejects byte, total staging and quota limits without partial writes',async()=>{
    const big=file('Root/a.txt');Object.defineProperty(big,'size',{value:MAX_FOLDER_FILE_BYTES+1});
    await expect(run([big])).rejects.toThrow('2 MiB');
    const many=Array.from({length:MAX_FOLDER_SOURCE_BYTES/MAX_FOLDER_FILE_BYTES+1},(_,i)=>{const f=file(`Root/${i}.txt`);Object.defineProperty(f,'size',{value:MAX_FOLDER_FILE_BYTES});return f;});
    await expect(run(many)).rejects.toThrow('32 MiB');
    vi.stubGlobal('navigator',{storage:{estimate:async()=>({usage:800,quota:1000})}});
    await expect(run([file('Root/a.txt','a'.repeat(21))])).rejects.toThrow('Không đủ dung lượng');await expectEmpty();
  });
  it('automatically divides a long folder TXT into bounded chapters while preserving every character and original bytes',async()=>{
    const text='文🙂'.repeat(50000),original=file('Root/1.txt',text);
    const {id}=await run([original]);const chapters=await readyChapters(id);
    expect(chapters.length).toBeGreaterThan(1);expect(chapters.map(c=>c.text).join('')).toBe(text);
    expect(chapters.every(c=>c.text.length<=64000&&!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(c.text))).toBe(true);
    expect((await db.books.get(id))?.charCount).toBe(text.length);
    expect(new Uint8Array(await (await db.sources.where('bookId').equals(id).first())!.blob.arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()));
  });
  it.each([
    ['utf-8',new Uint8Array([0xef,0xbb,0xbf,0x61]),'a','utf-8'],
    ['gb18030',new Uint8Array([0xd6,0xd0,0xce,0xc4]),'中文','gb18030'],
    ['utf-8',new Uint8Array([0xff,0xfe,0x2d,0x4e]),'中','utf-16le'],
    ['utf-8',new Uint8Array([0xfe,0xff,0x4e,0x2d]),'中','utf-16be'],
  ])('decodes %s and BOM while preserving bytes',async(encoding,bytes,text,actual)=>{
    const {id}=await run([file('Root/1.txt',bytes)],encoding);
    expect((await readyChapters(id))[0].text).toBe(text);
    expect((await db.sources.where('bookId').equals(id).first())?.encoding).toBe(actual);
  });
  it('rejects incomplete UTF16 and GB18030 bytes rather than replacing characters',async()=>{
    await expect(run([file('Root/a.txt',new Uint8Array([0xff,0xfe,0x2d]))])).rejects.toThrow('encoding');
    await expect(run([file('Root/a.txt',new Uint8Array([0x81]))],'gb18030')).rejects.toThrow('encoding');await expectEmpty();
  });
});
