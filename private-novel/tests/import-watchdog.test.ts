import 'fake-indexeddb/auto';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const conversion=vi.hoisted(()=>({batch:vi.fn()}));
vi.mock('../src/features/names-convert/services/title-converter',()=>({convertBatchTitles:conversion.batch,convertSingleTitle:async(s:string)=>s}));
import {db,readyChapters} from '../src/core/db';
import {importFiles} from '../src/features/import-export/services/importer';
class WorkerStub{
 onmessage:((e:{data:unknown})=>void)|null=null;onerror:null=null;stopped=false;
 terminate(){this.stopped=true;}
 emit(data:unknown){if(!this.stopped)this.onmessage?.({data});}
 postMessage(message:{type:string}){queueMicrotask(()=>{if(message.type==='start')this.emit({type:'batch',parts:[{title:'Chapter 1',text:'Chapter 1\nContent'}]});else if(message.type==='ack')this.emit({type:'done',sha256:'a'.repeat(64),chars:17});});}
}
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('Worker',WorkerStub);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each(['slow','timeout','abort'])('separates worker timeout from %s batch conversion and prevents late writes',async mode=>{
 let release!:(s:string[])=>void,entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});
 conversion.batch.mockImplementation(()=>{entered();return new Promise<string[]>(r=>{release=r;});});
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});const stop=new AbortController();
 const result=importFiles([new File(['Chapter 1\nContent'],'new.txt')],'Book','utf-8','',true,()=>{},stop.signal).then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 await started;
 await vi.advanceTimersByTimeAsync(mode==='timeout'?120001:35000);
 if(mode==='abort')stop.abort();if(mode==='slow')release(['Chapter 1']);const outcome=await result;
 if(mode==='slow'){expect(outcome.error).toBeUndefined();expect(await readyChapters(outcome.value!.id)).toHaveLength(1);}
 else {expect(outcome.error.message).toContain(mode==='abort'?'hủy':'Chuẩn bị tiêu đề');for(const table of [db.books,db.chapters,db.sources,db.importJobs])expect(await table.count()).toBe(0);release(['Chapter 1']);await Promise.resolve();await Promise.resolve();expect(await db.chapters.count()).toBe(0);}
});

