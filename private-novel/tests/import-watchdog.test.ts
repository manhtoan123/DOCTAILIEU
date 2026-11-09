import 'fake-indexeddb/auto';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const conversion=vi.hoisted(()=>({batch:vi.fn()}));
vi.mock('../src/features/names-convert/services/title-converter',()=>({convertBatchTitles:conversion.batch,convertSingleTitle:async(s:string)=>s}));
import {db,readyChapters} from '../src/core/db';
import {importFiles} from '../src/features/import-export/services/importer';
import {createImportProgress,createTxtWatchdog} from '../src/features/import-export/services/txt-import-progress';
class WorkerStub{
 onmessage:((e:{data:unknown})=>void)|null=null;onerror:null=null;stopped=false;
 terminate(){this.stopped=true;}
 emit(data:unknown){if(!this.stopped)this.onmessage?.({data});}
 postMessage(message:{type:string}){queueMicrotask(()=>{if(message.type==='start')this.emit({type:'batch',parts:[{title:'Chapter 1',text:'Chapter 1\nContent'}]});else if(message.type==='ack')this.emit({type:'done',sha256:'a'.repeat(64),chars:17});});}
}
beforeEach(async()=>{await db.delete();await db.open();vi.stubGlobal('Worker',WorkerStub);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each(['slow','abort'])('allows %s batch conversion beyond the worker timeout without late writes',async mode=>{
 let release!:(s:string[])=>void,entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});
 conversion.batch.mockImplementation(()=>{entered();return new Promise<string[]>(r=>{release=r;});});
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});const stop=new AbortController();
 const result=importFiles([new File(['Chapter 1\nContent'],'new.txt')],'Book','utf-8','',true,()=>{},stop.signal).then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 await started;
 await vi.advanceTimersByTimeAsync(125000);
 if(mode==='abort')stop.abort();if(mode==='slow')release(['Chapter 1']);const outcome=await result;
 if(mode==='slow'){expect(outcome.error).toBeUndefined();expect(await readyChapters(outcome.value!.id)).toHaveLength(1);}
 else {expect(outcome.error.message).toContain('hủy');for(const table of [db.books,db.chapters,db.sources,db.importJobs])expect(await table.count()).toBe(0);release(['Chapter 1']);await Promise.resolve();await Promise.resolve();expect(await db.chapters.count()).toBe(0);}
});

it('lets active work and responsive I/O exceed 30 seconds but stops a worker that cannot answer',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 const stall=vi.fn(),probe=vi.fn(),watchdog=createTxtWatchdog(stall,30000,probe);
 const checkpoint=(read:number)=>watchdog.advance({type:'progress',phase:'encoding',read,total:100});
 watchdog.arm();
 for(let i=1;i<=3;i++){await vi.advanceTimersByTimeAsync(25000);checkpoint(i);}
 expect(probe).not.toHaveBeenCalled();expect(stall).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(30000);expect(probe).toHaveBeenCalledTimes(1);
 watchdog.responsive();
 await vi.advanceTimersByTimeAsync(30000);expect(probe).toHaveBeenCalledTimes(2);
 checkpoint(3); // A repeated checkpoint is not a sign of forward progress.
 await vi.advanceTimersByTimeAsync(10000);expect(stall).toHaveBeenCalledTimes(1);
 watchdog.clear();
});

it('reports monotonic percentages and estimates only after observing the processing rate',()=>{
 let time=0;
 const progress=createImportProgress(()=>time);
 expect(progress('encoding',0)).toEqual({message:'encoding',percent:0});
 time=2000;expect(progress('encoding',.1).etaSeconds).toBeUndefined();
 time=4000;expect(progress('headings',.2)).toMatchObject({percent:20,etaSeconds:15});
 expect(progress('headings',.15).percent).toBe(20);
 expect(progress('saving',.99)).toEqual({message:'saving',percent:99});
});

