import {describe,it,expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {aiParallelStatus} from '../src/features/ai/types/ai-parallel-status';
import {AiJobStatus,type AiJobView} from '../src/features/ai/components/AiJobStatus';
import type {AiPartsProgress} from '../src/features/ai/services/ai-parts';
const progress=(overrides:Partial<AiPartsProgress>={}):AiPartsProgress=>({total:3,done:1,active:[2],text:'',parallel:1,...overrides});
const job=(p:AiPartsProgress):AiJobView=>({target:'Chương đang đọc',status:'Đang dịch',model:'gemini-2.5-flash',progress:p});
describe('aiParallelStatus',()=>{
 it('formats the running line from active parts only',()=>{
  expect(aiParallelStatus(progress({active:[2,3],total:3,done:1})).running).toBe('Đang chạy 2/3 phần');
 });
 it('claims two keys only with two distinct active lease hashes',()=>{
  const result=aiParallelStatus(progress({active:[1,2],activeRequests:2,activeLeases:2,leaseHashes:['lease-a','lease-b'],keySlots:[0,1],keysAvailable:2}));
  expect(result.keys).toBe('2 key đang chạy');expect(result.verifiedTwoKeys).toBe(true);
 });
 it('renders sequential text when exactly one key is available',()=>{
  const result=aiParallelStatus(progress({active:[1],activeRequests:1,activeLeases:1,leaseHashes:['lease-a'],keySlots:[0],keysAvailable:1}));
  expect(result.keys).toBe('Đang chạy tuần tự — 1 key khả dụng');expect(result.verifiedTwoKeys).toBe(false);
 });
 it('prefers direct two-lease evidence over a stale one-key capacity snapshot',()=>{
  const result=aiParallelStatus(progress({active:[1,2],activeLeases:2,keysAvailable:1}));
  expect(result.keys).toBe('2 key đang chạy');expect(result.verifiedTwoKeys).toBe(true);
 });
 it('never claims two keys from parallel===2 without lease evidence',()=>{
  for(const activeLeases of [0,1,undefined]){
   const result=aiParallelStatus(progress({parallel:2,activeLeases,leaseHashes:activeLeases?['lease-a']:undefined}));
   expect(result.verifiedTwoKeys).toBe(false);expect(result.keys).toBeUndefined();expect(result.keys??'').not.toContain('2 key');
  }
 });
});
describe('AiJobStatus parallel evidence',()=>{
 it('shows running count and verified two-key text',()=>{
  const markup=renderToStaticMarkup(React.createElement(AiJobStatus,{job:job(progress({total:3,done:1,active:[1,2],parallel:2,activeRequests:2,activeLeases:2,leaseHashes:['lease-a','lease-b'],keySlots:[0,1],keysAvailable:2}))}));
  expect(markup).toContain('Đang chạy 2/3 phần');expect(markup).toContain('2 key đang chạy');expect(markup).not.toContain('tối đa 2 phần');
 });
 it('shows sequential one-key text when one key is available',()=>{
  const markup=renderToStaticMarkup(React.createElement(AiJobStatus,{job:job(progress({total:3,done:1,active:[1],activeRequests:1,activeLeases:1,leaseHashes:['lease-a'],keySlots:[0],keysAvailable:1}))}));
  expect(markup).toContain('Đang chạy 1/3 phần');expect(markup).toContain('Đang chạy tuần tự — 1 key khả dụng');expect(markup).not.toContain('2 key đang chạy');expect(markup).not.toContain('tối đa 2 phần');
 });
 it('does not display two-key text from parallel width alone',()=>{
  const markup=renderToStaticMarkup(React.createElement(AiJobStatus,{job:job(progress({total:3,done:1,active:[1],parallel:2,activeLeases:0}))}));
  expect(markup).toContain('Đang chạy 1/3 phần');expect(markup).not.toContain('2 key');expect(markup).not.toContain('tối đa 2 phần');
 });
});
