import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db,commitImport} from '../src/core/db';
import {prepareFolderSelection} from '../src/features/import-export/services/folder-selection';
import {MAX_FOLDER_FILE_BYTES} from '../src/features/import-export/services/folder-import';

// Independent failure-boundary review. Real IndexedDB, controlled Worker protocol.
class ReviewWorker {
  onmessage:((event:{data:unknown})=>void)|null=null;
  onerror:(()=>void)|null=null;
  stopped=false;
  terminate(){this.stopped=true;}
  postMessage(message:{type:string}){
    queueMicrotask(()=>{
      if(this.stopped)return;
      this.onmessage?.({data:message.type==='start'
        ?{type:'batch',parts:[{title:'第1章',text:'第1章\nreview content'}]}
        :{type:'done',sha256:'review-same-content',chars:19}});
    });
  }
}
function input(path:string,large=false){
  const file=new File(['第1章\nreview content'],path.split('/').at(-1)!);
  Object.defineProperty(file,'webkitRelativePath',{value:path});
  if(large)Object.defineProperty(file,'size',{value:MAX_FOLDER_FILE_BYTES+1});
  return file;
}
const prepare=(files:File[],signal=new AbortController().signal)=>prepareFolderSelection(files,'utf-8',()=>{},signal);
const mixed=()=>[input('New/A/1.txt'),input('New/Z/large.txt',true)];
async function snapshot(){return Promise.all([db.books.toArray(),db.chapters.toArray(),db.sources.toArray(),db.importJobs.toArray(),db.names.toArray(),db.progress.toArray()]);}
async function existing(){
  const {ids}=await prepare([input('Old/old.txt',true)]);await commitImport(ids[0]);
  await db.names.add({id:'old-name',bookId:ids[0],key:'文',value:'văn'});
  await db.progress.add({bookId:ids[0],chapterId:(await db.chapters.toArray())[0].id,paragraph:0,offset:1,revision:1,updatedAt:1});
  return snapshot();
}
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('Worker',ReviewWorker);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('independent mixed large-folder regression',()=>{
  it('rejects cancellation during aggregate quota estimation before reading or writing',async()=>{
    let release!:(value:{quota:number;usage:number})=>void;
    vi.stubGlobal('navigator',{storage:{estimate:()=>new Promise(resolve=>{release=resolve;})}});
    const controller=new AbortController(),files=mixed(),read=vi.spyOn(files[0],'arrayBuffer'),add=vi.spyOn(db.books,'add');
    const pending=prepare(files,controller.signal);controller.abort();release({quota:1e9,usage:0});
    await expect(pending).rejects.toThrow('hủy');
    expect(read).not.toHaveBeenCalled();expect(add).not.toHaveBeenCalled();
    expect((await snapshot()).every(rows=>rows.length===0)).toBe(true);
  });

  it('keeps a returned preview intact when its old signal aborts later',async()=>{
    const controller=new AbortController(),{ids}=await prepare(mixed(),controller.signal),before=await snapshot();
    controller.abort();await new Promise(resolve=>setTimeout(resolve,5));
    expect(await snapshot()).toEqual(before);expect(ids).toHaveLength(2);
  });

  it('cleans active and completed imports on large-source write failure without touching old equal-content data',async()=>{
    const before=await existing();
    vi.spyOn(db.sources,'add').mockRejectedValue(new DOMException('Source quota exhausted','QuotaExceededError'));
    await expect(prepare(mixed())).rejects.toThrow('Source quota exhausted');
    expect(await snapshot()).toEqual(before);
  });

  it('cleans the final preview checkpoint failure after large-source bytes were saved',async()=>{
    const before=await existing(),update=db.importJobs.update.bind(db.importJobs);
    vi.spyOn(db.importJobs,'update').mockImplementation((...args:Parameters<typeof update>)=>{
      if((args[1] as {phase?:string}).phase==='preview')return Promise.reject(new Error('Final checkpoint blocked')) as ReturnType<typeof update>;
      return update(...args);
    });
    await expect(prepare(mixed())).rejects.toThrow('Final checkpoint blocked');
    expect(await snapshot()).toEqual(before);
  });

  it('attempts every completed ID cleanup even when one rollback transaction fails',async()=>{
    const before=await existing(),remove=db.books.delete.bind(db.books);
    const deleted:string[]=[];
    // All TXT now stream through sources.add: fail the third book after two completed previews.
    const sourceAdd=db.sources.add.bind(db.sources);let sourceCalls=0;
    vi.spyOn(db.sources,'add').mockImplementation((...args:Parameters<typeof sourceAdd>)=>{
      if(++sourceCalls===3)return Promise.reject(new Error('Source write failed')) as ReturnType<typeof sourceAdd>;
      return sourceAdd(...args);
    });
    vi.spyOn(db.books,'delete').mockImplementation((...args:Parameters<typeof remove>)=>{
      deleted.push(args[0]);
      if(deleted.length===2)return Promise.reject(new Error('One rollback blocked')) as ReturnType<typeof remove>;
      return remove(...args);
    });
    await expect(prepare([input('New/A/1.txt'),input('New/B/1.txt'),input('New/Z/large.txt',true)])).rejects.toThrow('Không xóa được');
    expect(deleted).toHaveLength(3);
    const oldId=before[0][0].id,books=await db.books.toArray();
    expect(books).toHaveLength(2);expect(books.find(book=>book.id===oldId)).toEqual(before[0][0]);
    const retained=books.find(book=>book.id!==oldId)!;
    expect(retained.status).toBe('staging');expect(retained.title).toBe('1');
    expect(await db.names.toArray()).toEqual(before[4]);expect(await db.progress.toArray()).toEqual(before[5]);
    expect(await db.chapters.where('bookId').equals(retained.id).count()).toBe(1);
    expect(await db.sources.where('bookId').equals(retained.id).count()).toBe(1);
  });

  it('rejects malformed ignored paths in an otherwise valid large-only selection before writes',async()=>{
    const add=vi.spyOn(db.books,'add');
    await expect(prepare([input('New/large.txt',true),input('New/../cover.png')])).rejects.toThrow('Đường dẫn');
    expect(add).not.toHaveBeenCalled();expect((await snapshot()).every(rows=>rows.length===0)).toBe(true);
  });
});

