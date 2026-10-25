/**
 * Independent adversarial review of "parts of one chapter run on up to 2 different keys".
 * This file must fail on a fake/partial implementation. It does not trust variable names,
 * configured maxima, or UI copy: it measures wall-clock overlap and inspects the actual
 * server-issued lease evidence through the real handler, real D1 (Miniflare) and a mocked
 * provider. The final test bridges the real browser client to the real server handler in one
 * process (mocked transport + mocked provider only).
 */
import type {D1Database} from '@cloudflare/workers-types';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';
import {aiParallelStatus} from '../src/features/ai/types/ai-parallel-status';
import {AiReadingSession,AI_DEFAULTS} from '../src/features/ai/services/ai-reading';
import {aiTranslate} from '../src/features/ai/services/ai-translate';
import type {AiPartsProgress} from '../src/features/ai/services/ai-parts';
import {runAiParts,type AiPart} from '../src/features/ai/services/ai-parts';
import {DEFAULT_AI_MODEL} from '../src/features/ai/types/ai-models';

const KEY_A='synthetic-only-key-alpha';
const KEY_B='synthetic-only-key-beta';
const MODEL=DEFAULT_AI_MODEL;
const reply={candidates:[{content:{parts:[{text:'Bản dịch tổng hợp.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:5}};
const providerReply={candidates:[{index:0,content:{parts:[{text:'Bản dịch kiểm chứng độc lập.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:5}};
const encoder=new TextEncoder();
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const request=(signal?:AbortSignal,extra:Record<string,unknown>={})=>new Request('https://synthetic.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'合成文字。',model:MODEL,...extra}),signal});
const leaseOf=(response:Response)=>({requestId:response.headers.get('X-AI-Request-ID')??'',hash:response.headers.get('X-AI-Lease-Id-Hash')??'',slot:Number(response.headers.get('X-AI-Key-Slot')),available:response.headers.get('X-AI-Keys-Available'),parallel:response.headers.get('X-AI-Parallel')});

let runtime:Miniflare,database:D1Database;
beforeAll(async()=>{
 runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-01-01',d1Databases:['DB']}));
 database=await runtime.getD1Database('DB') as unknown as D1Database;
 for(const file of ['0006_ai_keys.sql','0008_ai_key_health.sql']){
  const sql=(await readFile('migrations/'+file,'utf8')).replace(/--[^\n]*/g,'');
  for(const statement of sql.split(';').filter(s=>s.trim()))await database.prepare(statement).run();
 }
});
beforeEach(async()=>{await database.prepare('DELETE FROM ai_key_health').run();await database.prepare('DELETE FROM ai_key_cooldowns').run();});
afterEach(()=>{vi.restoreAllMocks();resetAiKeyState();});
afterAll(async()=>{await runtime?.dispose();});

describe('(a) real handler + real D1: two keys run concurrently with distinct leases',()=>{
 it('overlaps upstream calls and returns distinct lease hash/slot/request id without leaking a key',async()=>{
  const upstream:{start:number;end:number;key:string}[]=[];
  let started=0;let openGate!:()=>void;const gate=new Promise<void>(resolve=>{openGate=resolve;});
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_input,init)=>{
   const key=new Headers(init?.headers??{}).get('x-goog-api-key')??'';
   const entry={start:performance.now(),end:0,key};
   // Hold both provider calls at a barrier so event-loop/worker delays cannot shrink the
   // overlap window: release only after BOTH handlers have reached the provider fetch.
   const hold=upstream.length===0?300:500;
   upstream.push(entry);
   if(++started===2)openGate();
   await gate;
   await new Promise(resolve=>setTimeout(resolve,hold));
   entry.end=performance.now();
   return Response.json(reply);
  });
  const env={DB:database,GEMINI_API_KEYS:JSON.stringify([KEY_A,KEY_B])};
  const first=handleAiTranslate(request(),env);
  await vi.waitFor(()=>expect(upstream).toHaveLength(1));
  const second=handleAiTranslate(request(),env);
  await vi.waitFor(()=>expect(upstream).toHaveLength(2));
  const [firstResponse,secondResponse]=await Promise.all([first,second]);
  expect(firstResponse.status).toBe(200);expect(secondResponse.status).toBe(200);
  // Wall-clock proof: both upstream calls were in flight at the same time. After the barrier
  // the first call holds 300ms, the second 500ms, so overlap is ~300ms regardless of load.
  const overlap=Math.min(upstream[0].end,upstream[1].end)-Math.max(upstream[0].start,upstream[1].start);
  expect(overlap).toBeGreaterThan(200);
  expect(new Set(upstream.map(entry=>entry.key)).size).toBe(2);
  expect(upstream.every(entry=>entry.key.length>0)).toBe(true);
  const firstLease=leaseOf(firstResponse),secondLease=leaseOf(secondResponse);
  for(const lease of [firstLease,secondLease]){
   expect(lease.requestId).toMatch(/^[a-f0-9-]{36}$/);
   expect(lease.hash).toMatch(/^[a-f0-9]{32}$/);
   expect(Number.isInteger(lease.slot)&&lease.slot>=1&&lease.slot<=2).toBe(true);
  }
  expect(firstLease.requestId).not.toBe(secondLease.requestId);
  expect(firstLease.hash).not.toBe(secondLease.hash);
  expect(firstLease.slot).not.toBe(secondLease.slot);
  // X-AI-Parallel is capacity after each response, not a claim of two simultaneous keys;
  // the last finisher sees the released sibling and reports 2.
  expect([firstLease.parallel,secondLease.parallel].sort()).toEqual(['1','2']);
  expect(firstLease.available).toBe('2');expect(secondLease.available).toBe('2');
  for(const response of [firstResponse,secondResponse]){
   const exposed=JSON.stringify([...response.headers])+await response.text();
   for(const secret of [KEY_A,KEY_B])expect(exposed).not.toContain(secret);
  }
  expect(fetch).toHaveBeenCalledTimes(2);
 });
});

describe('(b) one key: a second overlapping attempt is refused, never two leases',()=>{
 it('gets 429 with no lease evidence while the only key is leased',async()=>{
  let releaseUpstream!:()=>void;const gate=new Promise<void>(resolve=>{releaseUpstream=resolve;});
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{await gate;return Response.json(reply);});
  const env={DB:database,GEMINI_API_KEYS:JSON.stringify([KEY_A])};
  const first=handleAiTranslate(request(),env);
  await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
  await flush();
  const refused=await handleAiTranslate(request(),env);
  expect(refused.status).toBe(429);
  expect(refused.headers.get('X-AI-Lease-Id-Hash')).toBeNull();
  expect(refused.headers.get('X-AI-Key-Slot')).toBeNull();
  expect(refused.headers.get('X-AI-Parallel')).toBeNull();
  expect(refused.headers.get('Retry-After')).toBe('1');
  releaseUpstream();
  const firstResponse=await first;
  expect(firstResponse.status).toBe(200);
  expect(firstResponse.headers.get('X-AI-Parallel')).toBe('1');
  expect(firstResponse.headers.get('X-AI-Keys-Available')).toBe('1');
  expect(firstResponse.headers.get('X-AI-Lease-Id-Hash')).toMatch(/^[a-f0-9]{32}$/);
  // Exactly one lease id can ever be observed: no two-key claim is possible here.
  expect(new Set([firstResponse.headers.get('X-AI-Lease-Id-Hash')]).size).toBe(1);
  expect(fetch).toHaveBeenCalledTimes(1);
 });
});

describe('(c) break tests: UI/status must not claim two keys without lease evidence',()=>{
 const progress=(overrides:Partial<AiPartsProgress>={}):AiPartsProgress=>({total:3,done:1,active:[2],text:'',parallel:2,...overrides});
 it('never claims two keys from parallel width alone (0, 1 or missing active leases)',()=>{
  for(const activeLeases of [0,1,undefined]){
   const status=aiParallelStatus(progress({activeLeases,keysAvailable:2,leaseHashes:activeLeases?['a'.repeat(32)]:undefined,keySlots:activeLeases?[1]:undefined}));
   expect(status.verifiedTwoKeys).toBe(false);
   expect(status.keys??'').not.toContain('2 key');
  }
 });
 it('two simultaneously active distinct leases beat a stale one-key capacity snapshot',()=>{
  const status=aiParallelStatus(progress({activeLeases:2,keysAvailable:1,leaseHashes:['a'.repeat(32),'b'.repeat(32)],keySlots:[1,2]}));
  expect(status.keys).toBe('2 key đang chạy');
  expect(status.verifiedTwoKeys).toBe(true);
 });
 it('one available key plus at most one lease still shows sequential text',()=>{
  const status=aiParallelStatus(progress({active:[2],activeLeases:1,keysAvailable:1,leaseHashes:['a'.repeat(32)],keySlots:[1]}));
  expect(status.keys).toBe('Đang chạy tuần tự — 1 key khả dụng');
  expect(status.verifiedTwoKeys).toBe(false);
 });
 it('producer counts DISTINCT lease hashes, so a duplicate hash cannot fake two keys',async()=>{
  const states:AiPartsProgress[]=[],parts:AiPart[]=[{id:'0',text:'a',start:0,end:1},{id:'1',text:'b',start:1,end:2}];
  const result=await runAiParts(parts,new AbortController().signal,new Map(),async(_part,onLease)=>{
   onLease?.({requestId:'11111111-1111-4111-8111-111111111111',leaseIdHash:'f'.repeat(32),keySlot:1});
   await new Promise(resolve=>setTimeout(resolve,20));
   return {result:'x',model:MODEL,finishReason:'STOP',inputTokens:1,outputTokens:1};
  },state=>states.push(state),undefined,undefined,2);
  expect(result.result).toBe('x\nx');
  // Both requests overlapped but reported the SAME lease hash: activeLeases must stay 1.
  expect(states.some(state=>(state.activeRequests??0)>=2)).toBe(true);
  expect(states.every(state=>(state.activeLeases??0)<=1)).toBe(true);
  for(const state of states){expect(aiParallelStatus(state).keys??'').not.toContain('2 key');}
 });
 it('Reader and extracted progress contain no hard-coded two-part/two-key claim',async()=>{
  const source=(await Promise.all(['Reader','ReaderAiProgress'].map(name=>readFile(`src/features/reader/components/${name}.tsx`,'utf8')))).join('\n');
  expect(source).not.toContain('tối đa 2 phần');
  expect(source).not.toContain('2 key đang chạy');
  // Runtime helper is the only source of the two-key string.
  expect(source).toContain('aiParallelStatus');
 });
});

describe('(d) real client<->real handler bridge: cold start is sequential for 2 parts, 2 keys overlap only after part 1',()=>{
 const chapterText=(blocks:number)=>Array.from({length:blocks},()=>'甲'.repeat(1200)).join('\n');
 const settings={...AI_DEFAULTS,splitParts:true,fallbackModels:[]};
 const source=(text:string)=>({bookId:'review-parallel',id:'chapter',revision:1,text});
 function installBridge(holdMs:number,pairBarrier=false){
  const upstream:{start:number;end:number;key:string}[]=[];
  const live={current:0,max:0};
  let pairStarted=0;let openPair!:()=>void;const pairGate=new Promise<void>(resolve=>{openPair=resolve;});
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
   const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
   if(url.includes('/api/ai/translate')){
    const headers=new Headers(init?.headers??{});
    const forwarded=new Request('https://reader.example/api/ai/translate',{method:'POST',headers,body:String(init?.body??''),signal:init?.signal??undefined});
    return handleAiTranslate(forwarded,{DB:database,GEMINI_API_KEYS:JSON.stringify([KEY_A,KEY_B])});
   }
   if(url.includes('generativelanguage.googleapis.com')){
    const key=new Headers(init?.headers??{}).get('x-goog-api-key')??'';
    const entry={start:performance.now(),end:0,key};
    upstream.push(entry);live.current++;live.max=Math.max(live.max,live.current);
    // Pair barrier: the two concurrent parts release together, so event-loop/worker delay
    // between their first requests cannot shrink the measured overlap window.
    if(pairBarrier&&upstream.length>1){if(++pairStarted===2)openPair();await pairGate;}
    let sink!:ReadableStreamDefaultController<Uint8Array>;
    const body=new ReadableStream<Uint8Array>({start(controller){sink=controller;}});
    setTimeout(()=>{entry.end=performance.now();live.current--;try{sink.enqueue(encoder.encode('data: '+JSON.stringify(providerReply)+'\r\n\r\n'));sink.close();}catch{/* stream already cancelled */}},holdMs);
    return new Response(body,{headers:{'Content-Type':'text/event-stream'}});
   }
   throw new Error('unexpected fetch '+url);
  });
  return {upstream,live};
 }
 it('2-part cold chapter: width starts at 1, parts never overlap (key rotation is sequential, not concurrent)',async()=>{
  const {upstream,live}=installBridge(200);
  const session=new AiReadingSession(aiTranslate);
  const progress:AiPartsProgress[]=[];
  try{
   const result=await session.request(source(chapterText(2)),settings,[],undefined,undefined,state=>progress.push(state));
   expect(result.result.trim().length).toBeGreaterThan(0);
   expect(upstream).toHaveLength(2);
   // No wall-clock overlap even though the second part may rotate to the other idle key.
   expect(live.max).toBe(1);
   expect(upstream[0].end).toBeLessThan(upstream[1].start);
   expect(progress.every(state=>(state.activeLeases??0)<=1)).toBe(true);
   expect(progress.some(state=>(state.parallelLeases??0)>=2)).toBe(false);
  }finally{session.clear();}
 });
 it('3-part cold chapter: part 1 is alone, parts 2+3 overlap on two distinct keys with two lease hashes and slots',async()=>{
  // Parts 2+3 wait at a pair barrier and then both hold 500ms: overlap stays ~500ms under load.
  const {upstream,live}=installBridge(500,true);
  const session=new AiReadingSession(aiTranslate);
  const progress:AiPartsProgress[]=[];
  try{
   const result=await session.request(source(chapterText(3)),settings,[],undefined,undefined,state=>progress.push(state));
   expect(result.result.trim().length).toBeGreaterThan(0);
   expect(upstream).toHaveLength(3);
   expect(live.max).toBe(2);
   // Part 0 is strictly alone: it ends before the overlap pair starts.
   expect(upstream[0].end).toBeLessThan(upstream[1].start);
   const pair=upstream.slice(1);
   const pairOverlap=Math.min(pair[0].end,pair[1].end)-Math.max(pair[0].start,pair[1].start);
   expect(pairOverlap).toBeGreaterThan(150);
   expect(pair[0].key).not.toBe(pair[1].key);
   expect(new Set(upstream.map(entry=>entry.key)).size).toBe(2);
   const concurrent=progress.filter(state=>(state.activeLeases??0)>=2);
   expect(concurrent.length).toBeGreaterThan(0);
   const evidence=concurrent.at(-1)!;
   expect(new Set(evidence.leaseHashes??[]).size).toBeGreaterThanOrEqual(2);
   expect(new Set(evidence.keySlots??[]).size).toBeGreaterThanOrEqual(2);
   expect(evidence.activeRequests).toBeGreaterThanOrEqual(2);
   expect(evidence.parallelLeases).toBe(2);
   const exposed=JSON.stringify(progress);
   for(const secret of [KEY_A,KEY_B])expect(exposed).not.toContain(secret);
   expect(exposed).not.toContain(KEY_A.slice(0,8));
  }finally{session.clear();}
 });
});
