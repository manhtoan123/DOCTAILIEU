import {afterEach,it,expect,vi} from 'vitest';
vi.mock('../src/core/db',()=>({db:{dictionaries:{toArray:vi.fn(async()=>[])},settings:{get:vi.fn(async()=>undefined)}}}));
class StubWorker extends EventTarget {
 static instances:StubWorker[]=[];last:any;terminated=false;
 constructor(){super();StubWorker.instances.push(this);}
 postMessage(message:any){this.last=message;}
 terminate(){this.terminated=true;}
 reply(result:unknown=[]){this.dispatchEvent(new MessageEvent('message',{data:{id:this.last.id,type:'result',result}}));}
}
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();StubWorker.instances=[];});
it('reset rejects active and queued jobs but fresh conversion survives old load rejection',async()=>{
 vi.stubGlobal('Worker',StubWorker);const c=await import('../src/features/names-convert/services/language-client');
 const first=c.convert('旧',[]);const firstResult=expect(first).rejects.toThrow('thay đổi');
 await vi.waitFor(()=>expect(StubWorker.instances).toHaveLength(1));
 const queued=c.lookup('旧');const queuedResult=expect(queued).rejects.toThrow('thay đổi');c.resetLanguage();const fresh=c.convert('新',[]);
 await firstResult;await queuedResult;await vi.waitFor(()=>expect(StubWorker.instances).toHaveLength(2));
 const worker=StubWorker.instances[1];expect(worker.last.type).toBe('load');worker.reply([]);
 await vi.waitFor(()=>expect(worker.last.type).toBe('convert'));worker.reply([{targetText:'new'}]);expect(await fresh).toEqual([{targetText:'new'}]);c.resetLanguage();
});
it('reset during database read prevents obsolete worker creation',async()=>{
 vi.stubGlobal('Worker',StubWorker);const {db}=await import('../src/core/db');let release!:(value:any)=>void;
 vi.mocked(db.dictionaries.toArray).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}) as any);
 const c=await import('../src/features/names-convert/services/language-client');const job=c.convert('旧',[]);const result=expect(job).rejects.toThrow('thay đổi');await vi.waitFor(()=>expect(release).toBeTypeOf('function'));c.resetLanguage();release([]);await result;expect(StubWorker.instances).toHaveLength(0);
});
