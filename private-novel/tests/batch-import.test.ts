import 'fake-indexeddb/auto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {db,readyChapters} from '../src/core/db';
import {prepareBatchFiles,commitBatchImports,MAX_BATCH_FILE_BYTES,MAX_BATCH_SOURCE_BYTES} from '../src/features/import-export/services/batch-import';
import {importFiles} from '../src/features/import-export/services/importer';

// Exercises actual IndexedDB staging/cleanup/transactions; only the browser
// Worker boundary is simulated. Real splitter/encoding belongs to Worker E2E.
class ImportWorker {
  onmessage:((event:{data:unknown})=>void)|null=null;
  onerror:(()=>void)|null=null;
  stopped=false;file?:File;text='';hash='';
  emit(data:unknown){if(!this.stopped)this.onmessage?.({data});}
  terminate(){this.stopped=true;}
  postMessage(message:{type:string;file?:File}){
    if(message.type==='start'){
      this.file=message.file!;
      void this.file.text().then(async text=>{
        if(this.file!.name==='invalid.txt'){this.emit({type:'error',message:'invalid encoding'});return;}
        this.text=text.replace(/\r\n?/g,'\n');
        this.hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(v=>v.toString(16).padStart(2,'0')).join('');
        if(this.text.trim())this.emit({type:'batch',parts:[{title:'Chapter',text:this.text}]});
        else this.emit({type:'done',sha256:this.hash,chars:0});
      });
    }else if(message.type==='ack'){
      queueMicrotask(()=>{this.emit({type:'progress',read:this.file!.size,total:this.file!.size});this.emit({type:'done',sha256:this.hash,chars:this.text.length});});
    }
  }
}
const file=(name:string,text='正文')=>new File([text],name);
const prepare=(files:File[],signal=new AbortController().signal,progress:(status:{message:string;percent:number})=>void=()=>{})=>prepareBatchFiles(files,'utf-8','',true,progress,signal);
async function tablesEmpty(){for(const table of [db.books,db.chapters,db.sources,db.importJobs])expect(await table.count()).toBe(0);}
async function existing(){const {ids}=await prepare([file('existing.txt','keep')]);await commitBatchImports(ids);return ids[0];}
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('Worker',ImportWorker);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('independent TXT batch books',()=>{
  it('preserves identical file content as independent books including existing library matches',async()=>{
    const first=await existing();
    const {ids}=await prepare([file('One.txt','keep'),file('Two.txt','keep')]);
    expect(ids).toHaveLength(2);expect(new Set(ids).size).toBe(2);
    for(const id of ids){expect((await readyChapters(id))[0].text).toBe('keep');expect((await db.books.get(id))?.status).toBe('staging');}
    expect((await db.sources.toArray()).map(s=>s.sha256)).toEqual(Array(3).fill((await db.sources.where('bookId').equals(first).first())!.sha256));
    await commitBatchImports(ids);expect((await db.books.toArray()).every(b=>b.status==='ready')).toBe(true);
  });
  it('retains legacy library dedupe when options are omitted',async()=>{
    await existing();
    await expect(importFiles([file('copy.txt','keep')],'Copy','utf-8','',true,()=>{},new AbortController().signal)).rejects.toThrow('đã có');
    expect(await db.books.count()).toBe(1);expect(await db.chapters.count()).toBe(1);
  });
  it('removes every staging book if a later worker fails, preserving existing data',async()=>{
    const id=await existing();const before=await readyChapters(id);
    await expect(prepare([file('One.txt'),file('invalid.txt')])).rejects.toThrow('invalid encoding');
    expect((await db.books.toArray()).map(b=>b.id)).toEqual([id]);expect(await readyChapters(id)).toEqual(before);
    for(const table of [db.sources,db.chapters,db.importJobs])expect(await table.count()).toBe(1);
  });
  it('cancels between books and removes completed staging books',async()=>{
    const controller=new AbortController();
    await expect(prepare([file('One.txt'),file('Two.txt')],controller.signal,status=>{if(status.message.includes('Two.txt'))controller.abort();})).rejects.toThrow('hủy');await tablesEmpty();
  });
  it('removes earlier staging on an empty later file or persistence failure',async()=>{
    await expect(prepare([file('One.txt'),file('empty.txt','')])).rejects.toThrow('rỗng');await tablesEmpty();
    const add=db.sources.add.bind(db.sources);let writes=0;
    vi.spyOn(db.sources,'add').mockImplementation((...args:Parameters<typeof add>)=>{
      if(++writes===2)return Promise.reject(new Error('source failure')) as ReturnType<typeof add>;
      return add(...args);
    });
    await expect(prepare([file('One.txt'),file('Two.txt')])).rejects.toThrow('source failure');await tablesEmpty();
  });
  it('drains an in-flight chapter write before cancellation cleanup; late writes leave no orphans',async()=>{
    const id=await existing();const controller=new AbortController();
    const bulkAdd=db.chapters.bulkAdd.bind(db.chapters);
    vi.spyOn(db.chapters,'bulkAdd').mockImplementation((...args:Parameters<typeof bulkAdd>)=>{
      controller.abort();
      return new Promise((resolve,reject)=>{setTimeout(()=>{void bulkAdd(...args).then(resolve,reject);},20);}) as ReturnType<typeof bulkAdd>;
    });
    await expect(prepare([file('One.txt')],controller.signal)).rejects.toThrow('hủy');
    expect((await db.books.toArray()).map(b=>b.id)).toEqual([id]);
    for(const table of [db.sources,db.chapters,db.importJobs])expect(await table.count()).toBe(1);
  });
  it('cleans staging when abort arrives during source persistence and avoids subsequent job writes',async()=>{
    const controller=new AbortController();const add=db.sources.add.bind(db.sources);
    vi.spyOn(db.sources,'add').mockImplementation((...args:Parameters<typeof add>)=>{controller.abort();return add(...args);});
    const update=vi.spyOn(db.importJobs,'update');
    await expect(prepare([file('One.txt')],controller.signal)).rejects.toThrow('hủy');
    expect(update).not.toHaveBeenCalled();await tablesEmpty();
  });
  it('isolates throwing progress observers and can commit successful previews',async()=>{
    const {ids}=await prepare([file('One.txt')],new AbortController().signal,()=>{throw new Error('observer');});
    await commitBatchImports(ids);expect((await db.books.get(ids[0]))?.status).toBe('ready');
  });
  it('rejects empty, unsupported, count, per-file and total byte limits before mutations',async()=>{
    await expect(prepare([])).rejects.toThrow('100');
    await expect(prepare([file('book.pdf')])).rejects.toThrow('TXT');
    await expect(prepare(Array.from({length:101},()=>file('book.txt')))).rejects.toThrow('100');
    const oversized=file('big.txt');Object.defineProperty(oversized,'size',{value:MAX_BATCH_FILE_BYTES+1});
    await expect(prepare([oversized])).rejects.toThrow('40 MiB');
    const many=Array.from({length:Math.floor(MAX_BATCH_SOURCE_BYTES/MAX_BATCH_FILE_BYTES)+1},()=>{const f=file('book.txt');Object.defineProperty(f,'size',{value:MAX_BATCH_FILE_BYTES});return f;});
    await expect(prepare(many)).rejects.toThrow('256 MiB');await tablesEmpty();
  });
  it('rejects quota and already cancelled inputs without creating staging rows',async()=>{
    const controller=new AbortController();controller.abort();await expect(prepare([file('book.txt')],controller.signal)).rejects.toThrow('hủy');
    vi.stubGlobal('navigator',{storage:{estimate:async()=>({usage:900,quota:1000})}});
    await expect(prepare([file('book.txt','a'.repeat(30))])).rejects.toThrow('Không đủ dung lượng');await tablesEmpty();
  });
  it('rolls back all ready transitions if a later preview is not eligible',async()=>{
    const {ids}=await prepare([file('One.txt'),file('Two.txt')]);
    await db.importJobs.where('bookId').equals(ids[1]).modify({phase:'processing'});
    await expect(commitBatchImports(ids)).rejects.toThrow('chưa hoàn tất');
    expect((await db.books.toArray()).every(b=>b.status==='staging')).toBe(true);
    expect((await db.importJobs.where('bookId').equals(ids[0]).first())?.phase).toBe('preview');
  });
  it('rejects duplicate IDs and cancels during atomic commit without partial ready books',async()=>{
    const {ids}=await prepare([file('One.txt'),file('Two.txt')]);
    await expect(commitBatchImports([ids[0],ids[0]])).rejects.toThrow('không hợp lệ');
    const controller=new AbortController();const update=db.books.update.bind(db.books);
    vi.spyOn(db.books,'update').mockImplementation((...args:Parameters<typeof update>)=>{controller.abort();return update(...args);});
    await expect(commitBatchImports(ids,controller.signal)).rejects.toThrow('hủy');
    expect((await db.books.toArray()).every(b=>b.status==='staging')).toBe(true);
  });
});
