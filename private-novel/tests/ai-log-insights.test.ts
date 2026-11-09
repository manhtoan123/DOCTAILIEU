import {expect,it} from 'vitest';
import {aiLogCohort,aiLogInsights} from '../src/features/ai/services/ai-log-insights';
import {aggregateAiLogs} from '../src/features/ai/services/ai-log-stats';
import type {AiLogEvent} from '../src/shared/types/ai-log';
const row:AiLogEvent={id:'request:r',kind:'request',model:'gemini-2.5-flash',status:'success',sourceChars:1000,startedAt:1,updatedAt:2,durationMs:100,attempts:1,schemaVersion:2,telemetry:{metricVersion:1,trace:{workId:'w',partPath:'0',purpose:'foreground',initialPurpose:'prewarm',fallbackIndex:0},context:{format:'txt',appVersion:'v2',policyVersion:'p1',validationVersion:'c1',strategy:'whole'},server:{execution:{version:1,model:'gemini-2.5-flash',temperature:0,thinking:'provider-default',maxOutputTokens:8192,promptId:'a'.repeat(64)},timing:{clock:'server-monotonic',completeMs:100,firstChunkMs:30}}}};
it('keeps prompt/config/fallback/purpose/format/length/version cohorts separate',()=>{
 const alternatives=[structuredClone(row),structuredClone(row),structuredClone(row),structuredClone(row),structuredClone(row),structuredClone(row),structuredClone(row)];
 alternatives[0].telemetry!.server!.execution!.temperature=1;
 alternatives[1].telemetry!.server!.execution!.promptId='b'.repeat(64);
 alternatives[2].telemetry!.trace!.fallbackIndex=1;
 alternatives[3].telemetry!.trace!.purpose='trial';
 alternatives[4].telemetry!.context!.format='epub';
 alternatives[5].sourceChars=6000;
 alternatives[6].telemetry!.context!.appVersion='v3';
 expect(new Set([row,...alternatives].map(aiLogCohort)).size).toBe(8);
});
it('measures 12 second work and 2 second foreground wait with independent sample counts',()=>{
 const chapter:AiLogEvent={...row,id:'chapter:w',kind:'chapter',durationMs:12000,telemetry:{metricVersion:1,trace:row.telemetry!.trace,client:{timing:{epoch:'epoch',sequence:1,workCompleteMs:12000,foregroundAcceptedMs:2000},recovery:'model',completeness:'observed'}}};
 const result=aiLogInsights([row,chapter,{...chapter,id:'cache',status:'cache'},{...chapter,id:'stop',status:'cancelled'}]);
 expect(result.complete).toMatchObject({n:1,mean:12000});expect(result.foreground).toMatchObject({n:1,mean:2000});expect(result.preview.n).toBe(0);expect(result.firstChunk).toMatchObject({n:1,mean:30});expect(result.recovered).toBe(1);
});
it('leaves legacy data unknown and filters trial without mutating input',()=>{
 const legacy={...row,schemaVersion:undefined,telemetry:undefined},trial=structuredClone(row);trial.telemetry!.trace!.purpose='trial';
 const rows=[row,legacy,trial],before=structuredClone(rows);expect(aiLogInsights(rows).legacy).toBe(1);expect(aiLogInsights(rows).unlinked).toBe(1);
 expect(aiLogInsights(rows,{purpose:'trial'}).selected).toEqual([trial]);expect(rows).toEqual(before);
});
it('reading overview excludes known trials and keeps legacy explicitly unknown',()=>{
 const trial=structuredClone(row);trial.telemetry!.trace!.purpose='trial';
 const legacy={...row,schemaVersion:undefined,telemetry:undefined};
 expect(aggregateAiLogs([row,trial,legacy],{now:10,days:1,purpose:'reading'}).request.total).toBe(2);
 expect(aggregateAiLogs([row,trial,legacy],{now:10,days:1,purpose:'trial'}).request.total).toBe(1);
 expect(aggregateAiLogs([row,trial,legacy],{now:10,days:1,purpose:'unknown'}).request.total).toBe(1);
});
it('joins prompt-filtered chapters through consistently observed request configuration',()=>{
 const chapter:AiLogEvent={...row,kind:'chapter',id:'chapter:w',telemetry:{metricVersion:1,trace:row.telemetry!.trace,client:{timing:{epoch:'clock',sequence:1,foregroundAcceptedMs:2000}}}};
 expect(aiLogInsights([row,chapter],{prompt:'a'.repeat(64)}).foreground.n).toBe(1);
 const different=structuredClone(row);different.telemetry!.server!.execution!.promptId='b'.repeat(64);
 expect(aiLogInsights([row,different,chapter],{prompt:'a'.repeat(64)}).foreground.n).toBe(0);
});
