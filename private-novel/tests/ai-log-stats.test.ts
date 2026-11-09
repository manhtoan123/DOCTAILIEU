import {describe,expect,it} from 'vitest';
import {aggregateAiLogs,aiLogDuration,aiLogHour} from '../src/features/ai/services/ai-log-stats';
import type {AiLogEvent} from '../src/shared/types/ai-log';
const now=Date.parse('2026-10-28T12:00:00Z');
const event=(patch:Partial<AiLogEvent>={}):AiLogEvent=>({id:'event',kind:'request',startedAt:now-1000,updatedAt:now,durationMs:1000,status:'success',model:'model-a',sourceChars:1000,attempts:1,...patch});
const stats=(rows:AiLogEvent[])=>aggregateAiLogs(rows,{now,days:7});
describe('AI log statistics',()=>{
 it('keeps successful v2 work with unknown clocks in success counts but outside duration samples',()=>{
  const telemetry={metricVersion:1 as const,client:{timing:{epoch:'11111111-1111-4111-8111-111111111111',sequence:1}}};
  const unknown=event({kind:'chapter',schemaVersion:2,durationMs:0,telemetry});
  const known=event({kind:'chapter',schemaVersion:2,durationMs:0,telemetry:{...telemetry,client:{timing:{...telemetry.client.timing,workCompleteMs:12000}}}});
  expect(aiLogDuration(unknown)).toBeUndefined();
  expect(stats([unknown,known,event({kind:'chapter',status:'error'})]).chapter).toMatchObject({success:2,errors:1,sample:3,successRate:2/3,durationN:1,meanMs:12000,medianMs:12000,p90Ms:12000,per1000CharsMs:12000});
 });
 it('groups UTC timestamps by Vietnamese starting hour including midnight',()=>{
  expect(aiLogHour(Date.parse('2026-10-27T17:00:00Z'))).toBe(0);
  expect(aiLogHour(Date.parse('2026-10-28T16:59:59Z'))).toBe(23);
  const result=stats([event({startedAt:Date.parse('2026-10-27T17:00:00Z')}),event({status:'error',startedAt:Date.parse('2026-10-27T17:30:00Z')})]);
  expect(result.hours).toHaveLength(24);expect(result.hours[0]).toMatchObject({total:2,sample:2,successRate:.5});
  expect(result.hours[1].successRate).toBeNull();
 });
 it('excludes cancellation/cache from validation denominators and keeps chapters separate',()=>{
  const result=stats([event(),event({status:'error'}),event({status:'cancelled'}),event({status:'cache'}),event({kind:'chapter',durationMs:50000})]);
  expect(result.request).toMatchObject({total:4,success:1,errors:1,cancelled:1,cache:1,sample:2,successRate:.5,failureRate:.5,meanMs:1000});
  expect(result.chapter).toMatchObject({total:1,meanMs:50000});
  expect(stats([event({status:'cache'})]).request.successRate).toBeNull();
 });
 it('computes direct sample mean/median/nearest-rank P90 and char-weighted speed',()=>{
  const result=stats([event({durationMs:1000,sourceChars:100}),event({durationMs:3000,sourceChars:900}),event({durationMs:5000,sourceChars:0}),event({status:'error',durationMs:999999})]);
  expect(result.request).toMatchObject({durationN:3,meanMs:3000,medianMs:3000,p90Ms:5000,per1000CharsMs:4000});
  const uneven=stats([event({model:'a',durationMs:1000}),event({model:'b',durationMs:4000}),event({model:'b',durationMs:4000})]);
  expect(uneven.request.meanMs).toBe(3000);expect(uneven.requestModels).toHaveLength(2);
 });
 it('filters by time and model without mutating input and includes unknown reasons',()=>{
  const rows=[event({id:'old',startedAt:now-8*86400000}),event({id:'second',model:'b'}),event({id:'first',status:'error',model:'a'})];
  const before=structuredClone(rows),result=aggregateAiLogs(rows,{now,days:7,model:'a'});
  expect(result.rows.map(row=>row.id)).toEqual(['first']);expect(result.reasons).toEqual([{reason:'unknown',requests:1,chapters:0}]);expect(rows).toEqual(before);
 });
 it('separates HTTP successes from validated successes and excludes cancelled/cache upstream',()=>{
  const upstream=[{status:200,durationMs:10,errorCode:'empty_output'},{status:429,durationMs:20},{status:0,durationMs:30,errorCode:'network'}];
  const result=stats([event({status:'error',upstream}),event({status:'cancelled',upstream}),event({status:'cache',upstream})]);
  expect(result.request.success).toBe(0);expect(result.upstream).toEqual({total:3,httpOk:1,httpErrors:1,transportErrors:1,reportedErrors:2,failed:3});
 });
 it('preserves a 429 cause before a successful 200 without treating the request as failed',()=>{
  const result=stats([event({status:'success',attempts:2,upstream:[{status:429,errorCode:'ai_rate_limited',durationMs:12},{status:200,durationMs:25}]})]);
  expect(result.request).toMatchObject({success:1,errors:0,successRate:1,failureRate:0});
  expect(result.reasons).toEqual([]);expect(result.upstream).toMatchObject({total:2,httpOk:1,httpErrors:1,failed:1});
  expect(result.upstreamReasons).toEqual([{reason:'ai_rate_limited',count:1,share:1}]);
 });
 it('uses HTTP or network fallback causes and counts each failed upstream only once',()=>{
  const result=stats([event({upstream:[{status:429,durationMs:1},{status:0,durationMs:1},{status:403,errorCode:'ai_auth_error',durationMs:1}]})]);
  expect(result.upstream.failed).toBe(3);expect(result.upstreamReasons).toHaveLength(3);
  expect(result.upstreamReasons.every(row=>row.count===1&&row.share===1/3)).toBe(true);
  expect(result.upstreamReasons.map(row=>row.reason).sort()).toEqual(['ai_auth_error','http_429','network']);
 });
 it('honestly reports no sample instead of zero percent',()=>{
  expect(stats([]).request).toMatchObject({sample:0,successRate:null,failureRate:null,meanMs:null,medianMs:null,p90Ms:null,per1000CharsMs:null});
 });
});
