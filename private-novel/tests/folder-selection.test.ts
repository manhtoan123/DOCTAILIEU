import 'fake-indexeddb/auto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {db,readyChapters} from '../src/core/db';
import {planFolderSelection,prepareFolderSelection} from '../src/features/import-export/services/folder-selection';
import {MAX_FOLDER_FILE_BYTES} from '../src/features/import-export/services/folder-import';
import {MAX_BATCH_FILE_BYTES,MAX_BATCH_SOURCE_BYTES} from '../src/features/import-export/services/batch-import';
import {commitAlbumImports,commitMappedAlbumImports} from '../src/features/library/services/albums';
import {StreamingSplitter,type Part} from '../src/features/import-export/services/splitter';

// Real splitter + IndexedDB; the Worker message/ACK boundary is simulated.
class SplitWorker {
  static afterDone:undefined|(()=>void);
  onmessage:((event:{data:unknown})=>void)|null=null;onerror:(()=>void)|null=null;
  stopped=false;file?:File;hash='';chars=0;
  emit(data:unknown){if(!this.stopped)this.onmessage?.({data});}
  terminate(){this.stopped=true;}
  postMessage(message:{type:string;file?:File;title?:string;detect?:boolean}){
    if(message.type==='start'){
      this.file=message.file!;
      void this.file.arrayBuffer().then(async buffer=>{
        if(this.file!.name==='invalid.txt'){this.emit({type:'error',message:'invalid encoding'});return;}
        this.hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
        const text=new TextDecoder().decode(buffer);const parts:Part[]=[];
        const splitter=new StreamingSplitter(message.title!,part=>{parts.push(part);this.chars+=part.text.length;},undefined,64000,message.detect);
        for(let offset=0;offset<text.length;offset+=4096)splitter.feed(text.slice(offset,offset+4096));
        splitter.feed('',true);
        if(parts.length)this.emit({type:'batch',parts});else this.done();
      });
    }else if(message.type==='ack')queueMicrotask(()=>{
      this.emit({type:'progress',read:this.file!.size,total:this.file!.size});this.done();
    });
  }
  done(){this.emit({type:'done',sha256:this.hash,chars:this.chars});SplitWorker.afterDone?.();}
}
function file(path:string,text='第1章 开始\r\n正文\r\n第2章 结束\r\n完',size?:number){
  const result=new File([text],path.split('/').at(-1)!);Object.defineProperty(result,'webkitRelativePath',{value:path});
  if(size!==undefined)Object.defineProperty(result,'size',{value:size});return result;
}
const large=(path:string,text?:string)=>file(path,text,MAX_FOLDER_FILE_BYTES+1);
const prepare=(files:File[],signal=new AbortController().signal,onProgress:()=>void=()=>{})=>prepareFolderSelection(files,'utf-8',onProgress,signal);
async function existing(){
  const {ids}=await prepare([large('Old/old.txt')]);await commitAlbumImports(ids,'Old album');
  await db.progress.put({bookId:ids[0],chapterId:(await readyChapters(ids[0]))[0].id,paragraph:0,offset:0,revision:1,updatedAt:1});
  return ids[0];
}
async function empty(){for(const table of [db.books,db.chapters,db.sources,db.importJobs])expect(await table.count()).toBe(0);}
beforeEach(async()=>{await db.delete();await db.open();SplitWorker.afterDone=undefined;vi.stubGlobal('Worker',SplitWorker);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('TXT books with direct-parent Albums',()=>{
  it('keeps all sizes as individual books with stable original files and parent paths',()=>{
    const a=file('Kho/A/2.txt','a',MAX_FOLDER_FILE_BYTES),b=large('Kho/A/A.txt'),c=large('Kho/B/2.txt');
    const plan=planFolderSelection([c,b,file('Kho/A/cover.jpg'),a]);
    expect(plan.groups.map(group=>[group.path,group.files.map(f=>f.name)])).toEqual([['Kho/A',['2.txt','A.txt']],['Kho/B',['2.txt']]]);
    expect(plan.assignments).toEqual([{file:a,album:'Kho/A'},{file:b,album:'Kho/A'},{file:c,album:'Kho/B'}]);expect(plan.ignored).toEqual(['Kho/A/cover.jpg']);
    expect(plan.assignments[1].file).toBe(b);expect(b.webkitRelativePath).toBe('Kho/A/A.txt');
  });
  it('validates ignored and large paths and duplicate paths before partitioning',async()=>{
    for(const files of [[large('Kho/../bad.txt')],[file('Kho/../cover.jpg')],[large('Kho/A.txt'),large('Kho/A.txt')],[file('Kho/cover.jpg'),file('Kho/cover.jpg')]]){
      await expect(prepare(files)).rejects.toThrow();
    }
    await empty();
  });
  it('creates separate IDs even when titles/content match the parent and the existing library',async()=>{
    const old=await existing(),source=large('Kho/A/A.txt');
    const {ids}=await prepare([file('Kho/A/1.txt'),source,large('Kho/B/A.txt')]);
    expect(ids).toHaveLength(3);expect(new Set(ids).size).toBe(3);
    expect((await db.books.bulkGet(ids)).map(book=>book?.title)).toEqual(['1','A','A']);
    for(const id of ids){expect((await db.books.get(id))?.status).toBe('staging');expect((await readyChapters(id)).map(chapter=>chapter.title)).toEqual(['第1章 开始','第2章 结束']);}
    const sources=await db.sources.toArray();expect(new Set(sources.map(s=>s.sha256)).size).toBe(1);
    const retained=await db.sources.where('bookId').equals(ids[1]).first();
    expect(retained?.relativePath).toBe('Kho/A/A.txt');
    expect(new Uint8Array(await retained!.blob.arrayBuffer())).toEqual(new Uint8Array(await source.arrayBuffer()));
    await commitAlbumImports(ids,' 新集 ');
    expect((await db.books.bulkGet(ids)).every(book=>book?.status==='ready'&&book.album==='新集')).toBe(true);
    expect((await db.books.get(old))?.album).toBe('Old album');
  });
  it('supports more than 100 normal chapter files without applying the batch file-count limit',async()=>{
    const {ids}=await prepare(Array.from({length:101},(_,i)=>file(`Kho/A/${i}.txt`,'正文')));
    expect(ids).toHaveLength(101);for(const id of ids)expect(await readyChapters(id)).toHaveLength(1);
  });
  it('prepares a parent above the former 32 MiB group limit as separate books',async()=>{
    // Synthetic metadata sizes exercise preflight; actual bytes are covered by real Worker E2E.
    const {ids}=await prepare(Array.from({length:17},(_,i)=>file(`Root/${i}.txt`,'正文',MAX_FOLDER_FILE_BYTES)));
    expect(ids).toHaveLength(17);expect(await db.sources.count()).toBe(17);
    expect((await db.sources.toArray()).reduce((sum,source)=>sum+source.bytes,0)).toBe(34*1024*1024);
  });
  it('streams small and large books losslessly, with mandatory headings and bounded fallback parts',async()=>{
    const heading='第1章 开始\n正文🙂\n第2章 后来\n结尾';
    const fallback='正文🙂没有标题。'.repeat(20000);
    const inputs=[file('Root/A/Common/Same.txt',heading),file('Root/B/Common/Same.txt',heading),file('Root/plain.txt',fallback)];
    const {ids,assignments}=await prepare(inputs);
    expect(ids).toHaveLength(3);expect(assignments.map(item=>item.album)).toEqual(['Root','Root/A/Common','Root/B/Common']);
    for(const id of ids){
      const source=await db.sources.where('bookId').equals(id).first();
      const chapters=await readyChapters(id),original=inputs.find(input=>input.webkitRelativePath===source!.relativePath)!;
      expect(chapters.map(chapter=>chapter.text).join('')).toBe(await original.text());
      expect(chapters.every(chapter=>chapter.text.length<=64000)).toBe(true);
      expect(new Uint8Array(await source!.blob.arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()));
      if(original.name==='Same.txt')expect(chapters.map(chapter=>chapter.title)).toEqual(['第1章 开始','第2章 后来']);
      else expect(chapters.length).toBeGreaterThan(1);
    }
    const sources=await db.sources.toArray(),chapters=await db.chapters.toArray();
    await commitMappedAlbumImports(assignments);
    for(const {id,album} of assignments)expect(await db.books.get(id)).toMatchObject({status:'ready',album});
    expect(await db.sources.toArray()).toEqual(sources);expect(await db.chapters.toArray()).toEqual(chapters);
  });
  it('rejects every source limit up front, including a later folder or standalone',async()=>{
    const add=vi.spyOn(db.books,'add');
    await expect(prepare([file('Kho/A/1.txt'),file('Kho/Z/big.txt','a',MAX_BATCH_FILE_BYTES+1)])).rejects.toThrow('40 MiB');
    await expect(prepare(Array.from({length:Math.floor(MAX_BATCH_SOURCE_BYTES/MAX_BATCH_FILE_BYTES)+1},(_,i)=>file(`Kho/${i}.txt`,'a',MAX_BATCH_FILE_BYTES)))).rejects.toThrow('256 MiB');
    expect(add).not.toHaveBeenCalled();await empty();
  });
  it('rolls back completed normal and large books after later worker failure, retaining unrelated data',async()=>{
    const old=await existing(),oldChapters=await readyChapters(old),oldSources=await db.sources.toArray();
    await expect(prepare([file('Kho/A/1.txt'),large('Kho/B/1.txt'),large('Kho/Z/invalid.txt')])).rejects.toThrow('invalid encoding');
    expect((await db.books.toArray()).map(book=>book.id)).toEqual([old]);
    expect(await readyChapters(old)).toEqual(oldChapters);expect(await db.sources.toArray()).toEqual(oldSources);
    expect(await db.importJobs.count()).toBe(1);expect(await db.progress.count()).toBe(1);
  });
  it('still rejects an empty normal source, rolling back an earlier group',async()=>{
    await expect(prepare([file('Kho/A/1.txt'),file('Kho/Z/empty.txt','')])).rejects.toThrow('rỗng');await empty();
  });
  it('isolates observer exceptions for both normal and standalone stages',async()=>{
    const {ids}=await prepare([file('Kho/A/1.txt'),large('Kho/Z/large.txt')],undefined,()=>{throw new Error('observer');});
    expect(ids).toHaveLength(2);expect((await db.books.bulkGet(ids)).every(book=>book?.status==='staging')).toBe(true);
  });
  it('cancels after Worker done before importer returns and removes earlier staging only',async()=>{
    const old=await existing(),controller=new AbortController();SplitWorker.afterDone=()=>controller.abort();
    await expect(prepare([file('Kho/A/1.txt'),large('Kho/Z/large.txt')],controller.signal)).rejects.toThrow('hủy');
    expect((await db.books.toArray()).map(book=>book.id)).toEqual([old]);
    for(const table of [db.sources,db.importJobs])expect(await table.count()).toBe(1);
    expect(await db.chapters.count()).toBe(2);expect(await db.progress.count()).toBe(1);
  });
  it('drains cancelled Worker chapter writes before deleting operation-owned data',async()=>{
    const old=await existing(),controller=new AbortController();const bulkAdd=db.chapters.bulkAdd.bind(db.chapters);let calls=0;
    vi.spyOn(db.chapters,'bulkAdd').mockImplementation((...args:Parameters<typeof bulkAdd>)=>{
      if(++calls!==2)return bulkAdd(...args);
      controller.abort();return new Promise((resolve,reject)=>setTimeout(()=>{void bulkAdd(...args).then(resolve,reject);},10)) as ReturnType<typeof bulkAdd>;
    });
    await expect(prepare([file('Kho/A/1.txt'),large('Kho/Z/large.txt')],controller.signal)).rejects.toThrow('hủy');
    expect((await db.books.toArray()).map(book=>book.id)).toEqual([old]);expect(await db.chapters.count()).toBe(2);expect(await db.sources.count()).toBe(1);
  });
  it('reports cleanup failure explicitly while preserving the remaining staging IDs',async()=>{
    const remove=db.books.delete.bind(db.books);let removed=0;
    vi.spyOn(db.books,'delete').mockImplementation((...args:Parameters<typeof remove>)=>{
      if(++removed===2)return Promise.reject(new Error('cleanup blocked')) as ReturnType<typeof remove>;
      return remove(...args);
    });
    await expect(prepare([file('Kho/A/1.txt'),large('Kho/Z/invalid.txt')])).rejects.toThrow('Không xóa được');
    expect(await db.books.count()).toBe(1);expect((await db.books.toArray())[0].status).toBe('staging');
  });
  it('rejects no TXT, quota and already-cancelled inputs before writes',async()=>{
    await expect(prepare([file('Kho/cover.jpg')])).rejects.toThrow('TXT');
    const controller=new AbortController();controller.abort();await expect(prepare([large('Kho/a.txt')],controller.signal)).rejects.toThrow('hủy');
    vi.stubGlobal('navigator',{storage:{estimate:async()=>({usage:900,quota:1000})}});
    await expect(prepare([file('Kho/a.txt','a'.repeat(30))])).rejects.toThrow('Không đủ dung lượng');await empty();
  });
});

