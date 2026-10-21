import type {D1Database} from '@cloudflare/workers-types';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {keyHealthId,readKeyHealth,reserveKey,releaseKey,resetKeyHealth,updateKeyHealth} from '../server/ai-key-health';
import {handleAiTranslate,resetAiKeyState} from '../server/ai-translate';

const MODEL='gemini-2.5-flash';
const reply={candidates:[{content:{parts:[{text:'Bản dịch tổng hợp.'}]},finishReason:'STOP'}]};
const request=(signal?:AbortSignal,extra:Record<string,unknown>={})=>new Request('https://synthetic.example/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'合成文字。',model:MODEL,...extra}),signal});
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
afterEach(()=>{vi.restoreAllMocks();resetAiKeyState();});

describe('independent review: actual D1 lease ownership',()=>{
 let runtime:Miniflare,database:D1Database;
 beforeAll(async()=>{
  runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-01-01',d1Databases:['DB']}));
  database=await runtime.getD1Database('DB') as unknown as D1Database;
  for(const file of ['0006_ai_keys.sql','0008_ai_key_health.sql']){
   const sql=(await readFile('migrations/'+file,'utf8')).replace(/--[^\n]*/g,'');
   for(const statement of sql.split(';').filter(s=>s.trim()))await database.prepare(statement).run();
  }
 });
 beforeEach(async()=>{resetKeyHealth();await database.prepare('DELETE FROM ai_key_health').run();await database.prepare('DELETE FROM ai_key_cooldowns').run();});
 afterAll(async()=>{await runtime?.dispose();});
 it('allows exactly one simultaneous claimant across fresh isolate memory',async()=>{
  const owners=await Promise.all(Array.from({length:6},()=>reserveKey('synthetic-health-id',MODEL,database)));
  expect(owners.filter(owner=>owner!==undefined)).toHaveLength(1);
  resetKeyHealth();expect(await reserveKey('synthetic-health-id',MODEL,database)).toBeUndefined();
  const owner=owners.find(value=>value!==undefined)!;await releaseKey('synthetic-health-id',owner,database);
  expect(await reserveKey('synthetic-health-id',MODEL,database)).toBeTypeOf('number');
 });
 it('a released owner is never reused even when reacquired within the same millisecond',async()=>{
  vi.spyOn(Date,'now').mockReturnValue(1_900_000_000_000);
  const first=(await reserveKey('synthetic-health-id',MODEL,database))!;
  await releaseKey('synthetic-health-id',first,database);
  const second=(await reserveKey('synthetic-health-id',MODEL,database))!;
  expect(second).not.toBe(first);
  await releaseKey('synthetic-health-id',first,database);
  expect((await readKeyHealth(database)).get('synthetic-health-id')?.busy_until).toBe(second);
 });
 it('stale health updates preserve reservation, disabled state and longer model cooldown',async()=>{
  const owner=(await reserveKey('synthetic-health-id',MODEL,database))!;
  const until=Date.now()+60_000;
  await updateKeyHealth('synthetic-health-id',{disabled:1,cooldown_until:until,model:MODEL},database);
  resetKeyHealth();await updateKeyHealth('synthetic-health-id',{disabled:0,busy_until:0,cooldown_until:1,model:MODEL},database);
  const row=(await readKeyHealth(database)).get('synthetic-health-id')!;
  expect(row).toMatchObject({disabled:1,busy_until:owner,cooldown_until:until});
  await releaseKey('synthetic-health-id',owner,database);
  expect(await reserveKey('synthetic-health-id',MODEL,database)).toBeUndefined();
 });
 it('enforces model cooldown across memory reset while allowing another model',async()=>{
  await updateKeyHealth('synthetic-health-id',{cooldown_until:Date.now()+60_000,model:MODEL},database);
  resetKeyHealth();expect(await reserveKey('synthetic-health-id',MODEL,database)).toBeUndefined();
  expect(await reserveKey('synthetic-health-id','gemini-3.1-flash-lite-preview',database)).toBeTypeOf('number');
 });
 it('database failure cannot fall back to an uncoordinated memory lease',async()=>{
  const failed={prepare(){throw Error('synthetic database unavailable');}} as unknown as D1Database;
  await expect(reserveKey('synthetic-health-id',MODEL,failed)).rejects.toThrow('synthetic database unavailable');
  expect((await readKeyHealth()).has('synthetic-health-id')).toBe(false);
 });
 it.each(['disabled','cooling'])('capacity refresh excludes a second key newly %s by another isolate',async state=>{
  const secrets=['synthetic-only-key-alpha','synthetic-only-key-beta'];let body!:ReadableStreamDefaultController<Uint8Array>;
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(new ReadableStream({start(c){body=c;}})));
  const pending=handleAiTranslate(request(),{DB:database,GEMINI_API_KEYS:JSON.stringify(secrets)});
  await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
  await updateKeyHealth(await keyHealthId(secrets[1]),state==='disabled'?{disabled:1}:{model:MODEL,cooldown_until:Date.now()+60_000},database);
  body.enqueue(new TextEncoder().encode(JSON.stringify(reply)));body.close();
  const response=await pending;expect(response.status).toBe(200);expect(response.headers.get('X-AI-Parallel')).toBe('1');
 });
});

describe('independent review: response body and safe public metadata',()=>{
 it('memory-only leases also reject an old owner after same-millisecond reuse',async()=>{
  vi.spyOn(Date,'now').mockReturnValue(1_900_000_000_000);
  const first=(await reserveKey('synthetic-memory-id',MODEL))!;
  await releaseKey('synthetic-memory-id',first);
  const second=(await reserveKey('synthetic-memory-id',MODEL))!;
  expect(second).not.toBe(first);await releaseKey('synthetic-memory-id',first);
  expect((await readKeyHealth()).get('synthetic-memory-id')?.busy_until).toBe(second);
 });
 it('retains the single-key reservation through a stalled body and frees it on cancellation',async()=>{
  let body!:ReadableStreamDefaultController<Uint8Array>;
  const cancel=vi.fn();
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(new ReadableStream({start(c){body=c;},cancel}))).mockImplementation(async()=>Response.json(reply));
  const stop=new AbortController(),env={GEMINI_API_KEY:'synthetic-only-key-alpha'};
  const pending=handleAiTranslate(request(stop.signal),env);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));await flush();
  const occupied=await handleAiTranslate(request(),env);
  expect(occupied.status).toBe(429);expect(occupied.headers.get('Retry-After')).toBe('1');expect(fetch).toHaveBeenCalledTimes(1);
  stop.abort();expect((await pending).status).toBe(499);expect(cancel).toHaveBeenCalled();
  expect((await handleAiTranslate(request(),env)).status).toBe(200);expect(fetch).toHaveBeenCalledTimes(2);expect(body).toBeDefined();
 });
 it('concurrent parts use two distinct credentials and public metadata reveals neither credential',async()=>{
  const secrets=['synthetic-only-key-alpha','synthetic-only-key-beta'],bodies:ReadableStreamDefaultController<Uint8Array>[]=[],used:string[]=[];
  vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{
   used.push(new Headers(init?.headers).get('x-goog-api-key')!);
   return new Response(new ReadableStream({start(c){bodies.push(c);}}));
  });
  const env={GEMINI_API_KEYS:JSON.stringify(secrets)},first=handleAiTranslate(request(),env),second=handleAiTranslate(request(),env);
  await vi.waitFor(()=>expect(used).toHaveLength(2));expect(new Set(used).size).toBe(2);
  const occupied=await handleAiTranslate(request(),env);expect(occupied.status).toBe(429);expect(used).toHaveLength(2);
  bodies[0].enqueue(new TextEncoder().encode(JSON.stringify(reply)));bodies[0].close();
  const firstResponse=await first;expect(firstResponse.headers.get('X-AI-Parallel')).toBe('1');
  bodies[1].enqueue(new TextEncoder().encode(JSON.stringify(reply)));bodies[1].close();
  const secondResponse=await second;expect(secondResponse.headers.get('X-AI-Parallel')).toBe('2');
  for(const response of [firstResponse,secondResponse]){
   expect(response.status).toBe(200);
   const exposed=JSON.stringify([...response.headers])+await response.text();
   for(const secret of secrets)expect(exposed).not.toContain(secret);
  }
 },15000);
 it('rejects an oversized context before any provider call',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json(reply));
  const response=await handleAiTranslate(request(undefined,{context:'x'.repeat(301)}),{GEMINI_API_KEY:'synthetic-only-key-alpha'});
  expect(response.status).toBe(400);expect(fetch).not.toHaveBeenCalled();
 });
});
