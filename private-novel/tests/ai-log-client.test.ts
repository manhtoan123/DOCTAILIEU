import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../src/features/sync-cloud/services/cloud-device',()=>({getCloudDeviceToken:async()=>undefined}));
import {aiChapterLog,type AiRunMetric} from '../src/features/ai/services/ai-metrics';
import type {AiLogEvent} from '../src/shared/types/ai-log';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.resetModules();});
const base:AiRunMetric={workId:'11111111-1111-4111-8111-111111111111',attempts:1,kind:'txt',sourceChars:100,status:'complete',durationMs:3000,requests:2,apiMs:5000,totalParts:1,completeParts:1,recoveryPasses:0,cacheHit:false};
function storage(){const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});vi.stubGlobal('window',new EventTarget());vi.stubGlobal('navigator',{onLine:false});return data;}
it('reports wall-clock chapter completion without logging source/settings or summed parallel time',()=>{
 const event=aiChapterLog(base,1000,4000);
 expect(event).toEqual({id:'chapter:'+base.workId,kind:'chapter',model:'unknown',status:'success',startedAt:1000,updatedAt:4000,durationMs:3000,sourceChars:100,attempts:1});
 expect(aiChapterLog({...base,cacheHit:true},1000,4000).status).toBe('cache');
 expect(aiChapterLog({...base,status:'cancelled',errorCode:'invalid_result'},1000,4000)).toMatchObject({status:'cancelled',errorCode:'ai_cancelled'});
});
it('persists offline events, flushes once online, and deduplicates terminal success',async()=>{
 const data=storage(),api=await import('../src/features/ai/services/ai-log-client');const event=aiChapterLog(base,Date.now()-3000);
 api.queueAiChapterLog(event);api.queueAiChapterLog({...event,status:'error',attempts:2,updatedAt:event.updatedAt+1,errorCode:'ai_timeout'});
 expect(JSON.parse([...data.values()][0])).toEqual([event]);
 const fetcher=vi.fn().mockResolvedValue(Response.json({ok:true}));vi.stubGlobal('fetch',fetcher);vi.stubGlobal('navigator',{onLine:true});
 await api.flushAiLogOutbox();expect(fetcher).toHaveBeenCalledOnce();expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(event);expect(data.size).toBe(0);
});
it('keeps events after transient logging failure without changing translation or spinning',async()=>{
 const data=storage(),api=await import('../src/features/ai/services/ai-log-client');api.queueAiChapterLog(aiChapterLog(base,Date.now()-3000));
 const fetcher=vi.fn().mockRejectedValue(Error('network'));vi.stubGlobal('fetch',fetcher);vi.stubGlobal('navigator',{onLine:true});
 await api.flushAiLogOutbox();expect(fetcher).toHaveBeenCalledOnce();expect(data.size).toBe(1);
});
it('bounds offline journal and drops malformed rejected events so newer ones can flush',async()=>{
 const data=storage(),api=await import('../src/features/ai/services/ai-log-client');for(let i=0;i<103;i++)api.queueAiChapterLog({...aiChapterLog(base,Date.now()-3000),id:'chapter:'+i.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111'});
 const rows=JSON.parse([...data.values()][0]) as AiLogEvent[];expect(rows).toHaveLength(100);
 const fetcher=vi.fn().mockImplementation(async()=>Response.json({error:'invalid_log'},{status:400}));vi.stubGlobal('fetch',fetcher);vi.stubGlobal('navigator',{onLine:true});
 await api.flushAiLogOutbox();expect(fetcher).toHaveBeenCalledTimes(100);expect(data.size).toBe(0);
});
it('loads shared history without waiting for a slow background journal upload',async()=>{
 storage();const api=await import('../src/features/ai/services/ai-log-client');api.queueAiChapterLog(aiChapterLog(base,Date.now()-3000));
 let release!:(value:Response)=>void;const held=new Promise<Response>(resolve=>{release=resolve;});
 const fetcher=vi.fn().mockImplementation(async(_url,init)=>init?.method==='POST'?held:Response.json({rows:[],serverNow:Date.now(),earliest:null,limit:5000,retentionDays:30}));
 vi.stubGlobal('fetch',fetcher);vi.stubGlobal('navigator',{onLine:true});const pending=api.flushAiLogOutbox();
 try{await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());expect((await api.fetchAiLogs()).rows).toEqual([]);expect(fetcher).toHaveBeenCalledTimes(2);}
 finally{release(Response.json({ok:true}));await pending;}
});
