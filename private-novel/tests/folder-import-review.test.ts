import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db,commitImport,deleteBook,readyChapters} from '../src/core/db';
import {importFolderGroup,planFolderImport} from '../src/features/import-export/services/folder-import';
import {hashBlob,prepareBackup,stageBackup,restoreBackup} from '../src/features/import-export/services/backup';

function chapter(path:string,text:string|Uint8Array='正文🙂'){
  const file=new File([typeof text==='string'?text:new Uint8Array(text)],path.split('/').at(-1)!);
  Object.defineProperty(file,'webkitRelativePath',{value:path});return file;
}
async function stage(files:File[],signal=new AbortController().signal){
  return importFolderGroup(planFolderImport(files).groups[0],'utf-8',()=>{},signal);
}
async function snapshot(){return Promise.all([db.books.toArray(),db.chapters.toArray(),db.sources.toArray(),db.importJobs.toArray(),db.names.toArray(),db.progress.toArray()]);}
beforeEach(async()=>{await db.delete();await db.open();});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('independent folder import data review',()=>{
  it('rolls back a failure at the final job write, keeping all unrelated tables unchanged',async()=>{
    const existing=await stage([chapter('Existing/1.txt')]);await commitImport(existing.id);
    const first=(await readyChapters(existing.id))[0];
    await db.names.add({id:'name',bookId:existing.id,key:'文',value:'văn'});
    await db.progress.add({bookId:existing.id,chapterId:first.id,paragraph:0,offset:0,revision:1,updatedAt:1});
    const before=await snapshot();
    vi.spyOn(db.importJobs,'add').mockRejectedValue(new DOMException('Quota at final write','QuotaExceededError'));
    await expect(stage([chapter('New/1.txt'),chapter('New/2.txt')])).rejects.toThrow('Quota at final write');
    expect(await snapshot()).toEqual(before);
  });

  it('cancels after the final job request succeeds but before the transaction completes',async()=>{
    const controller=new AbortController();const add=db.importJobs.add.bind(db.importJobs);
    vi.spyOn(db.importJobs,'add').mockImplementation((...args:Parameters<typeof add>)=>add(...args).then(key=>{controller.abort();return key;}));
    await expect(stage([chapter('Book/1.txt')],controller.signal)).rejects.toThrow('hủy');
    expect((await snapshot()).every(rows=>rows.length===0)).toBe(true);
  });

  it('cancels while quota estimation is pending without reading or writing files',async()=>{
    let release!:(value:{quota:number;usage:number})=>void;
    vi.stubGlobal('navigator',{storage:{estimate:()=>new Promise(resolve=>{release=resolve;})}});
    const controller=new AbortController();const file=chapter('Book/1.txt');const read=vi.spyOn(file,'arrayBuffer');
    const pending=stage([file],controller.signal);controller.abort();release({quota:1000000,usage:0});
    await expect(pending).rejects.toThrow('hủy');expect(read).not.toHaveBeenCalled();
    expect((await snapshot()).every(rows=>rows.length===0)).toBe(true);
  });

  it('leaves no database rows if progress reporting throws before staging',async()=>{
    const group=planFolderImport([chapter('Book/1.txt')]).groups[0];
    await expect(importFolderGroup(group,'utf-8',()=>{throw new Error('UI callback failed');},new AbortController().signal)).rejects.toThrow('UI callback failed');
    expect((await snapshot()).every(rows=>rows.length===0)).toBe(true);
  });

  it('reimports equal content as distinct identities and deleting one book preserves the other',async()=>{
    const files=[chapter('Book/1.txt'),chapter('Book/2.txt')];
    const [a,b]=await Promise.all([stage(files),stage(files)]);expect(a.id).not.toBe(b.id);
    await commitImport(a.id);await commitImport(b.id);
    const retained=(await snapshot()).map(rows=>rows.filter(row=>'bookId' in row?row.bookId===b.id:'id' in row&&row.id===b.id));
    await deleteBook(a.id);
    expect(await snapshot()).toEqual(retained);
    expect((await readyChapters(b.id))).toHaveLength(2);
    expect(new Set((await readyChapters(b.id)).map(row=>row.sourceId)).size).toBe(2);
  });

  it('round-trips folder chapters, equal-content sources, names and progress through existing portable format',async()=>{
    const raw='\uFEFF第1章\r\n正文🙂\r尾\n';
    const {id}=await stage([chapter('父/小说/10.txt',raw),chapter('父/小说/2.txt',raw)]);await commitImport(id);
    const chapters=await readyChapters(id);
    await db.names.add({id:'name',bookId:id,key:'文',value:'văn'});
    await db.progress.add({bookId:id,chapterId:chapters[1].id,paragraph:1,offset:2,revision:1,updatedAt:1});
    const plan=await prepareBackup(id,{mode:'portable'});const packets=[];
    for(let i=0;i<plan.total;i++){const part=await plan.part(i);packets.push(new File([part.blob],part.name));}
    await db.delete();await db.open();
    const [backupId]=await stageBackup(packets,()=>{});const restored=await restoreBackup(backupId);
    const restoredChapters=await readyChapters(restored);
    expect(restoredChapters.map(row=>[row.order,row.title,row.text])).toEqual(chapters.map(row=>[row.order,row.title,row.text]));
    const sources=await db.sources.where('bookId').equals(restored).toArray();expect(sources).toHaveLength(2);
    expect(sources.map(row=>row.relativePath).sort()).toEqual(['父/小说/10.txt','父/小说/2.txt']);
    for(const row of sources){expect(new Uint8Array(await row.blob.arrayBuffer())).toEqual(new TextEncoder().encode(raw));expect(row.sha256).toBe(await hashBlob(new Blob([raw])));}
    expect(new Set(restoredChapters.map(row=>row.sourceId))).toEqual(new Set(sources.map(row=>row.id)));
    expect((await db.names.where('bookId').equals(restored).first())?.value).toBe('văn');
    expect((await db.progress.get(restored))?.chapterId).toBe(restoredChapters[1].id);
    expect(db.verno).toBe(4);
  });

  it('keeps combining characters, astral characters, trailing whitespace and literal markup',async()=>{
    const text='e\u0301𠀀🙂\r\n<script>alert(1)</script>  \r末\n';
    const {id}=await stage([chapter('Book/1.txt',text)]);
    const [row]=await readyChapters(id);expect(row.text).toBe(text.replace(/\r\n?/g,'\n'));
    expect((await db.books.get(id))?.charCount).toBe(row.text.length);
    const source=await db.sources.get(row.sourceId);expect(await source?.blob.text()).toBe(text);
  });

  it('treats visually similar Unicode paths and collator ties as separate files with deterministic order',()=>{
    const files=['Book/é.txt','Book/e\u0301.txt','Book/01.txt','Book/1.txt','Book/a.txt','Book/A.txt'].map(path=>chapter(path));
    const first=planFolderImport(files).groups[0].files.map(file=>file.name);
    const second=planFolderImport([...files].reverse()).groups[0].files.map(file=>file.name);
    expect(first).toEqual(second);expect(new Set(first).size).toBe(files.length);
  });

  it('rejects filename/path mismatches and invalid ignored paths at the write boundary',async()=>{
    const mismatch=new File(['text'],'actual.txt');Object.defineProperty(mismatch,'webkitRelativePath',{value:'Book/fake.txt'});
    expect(()=>planFolderImport([mismatch])).toThrow('không hợp lệ');
    expect(()=>planFolderImport([chapter('Book/../cover.png')])).toThrow('không hợp lệ');
    await expect(importFolderGroup({path:'Wrong',title:'Wrong',files:[chapter('Book/1.txt')]},'utf-8',()=>{},new AbortController().signal)).rejects.toThrow('Nhóm');
    expect((await snapshot()).every(rows=>rows.length===0)).toBe(true);
  });

  it('keeps all previews staging when a batch confirmation has one invalid job',async()=>{
    const a=await stage([chapter('A/1.txt')]);const b=await stage([chapter('B/1.txt')]);
    const job=await db.importJobs.where('bookId').equals(b.id).first();await db.importJobs.update(job!.jobId,{phase:'processing'});
    await expect(db.transaction('rw',[db.books,db.importJobs],async()=>{await commitImport(a.id);await commitImport(b.id);})).rejects.toThrow('chưa hoàn tất');
    expect((await db.books.toArray()).every(book=>book.status==='staging')).toBe(true);
    expect((await db.importJobs.where('bookId').equals(a.id).first())?.phase).toBe('preview');
  });
});
