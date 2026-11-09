/**
 * Runtime proof for split-part parallel translation.
 *
 * Nothing about the lease layer is mocked: the client scheduler in src/features/ai/services/ai-parts.ts and
 * src/features/ai/services/ai-reading.ts calls the REAL server handleAiTranslate, which reserves the REAL
 * D1-backed key leases. Only the Google upstream `fetch` is replaced (500 ms hold) so
 * wall-clock overlap can be observed without any network or credential.
 *
 * Frozen contract under proof:
 *   X-AI-Request-ID / X-AI-Lease-Id-Hash / X-AI-Key-Slot / X-AI-Keys-Available / X-AI-Parallel
 *   response.debug {requestId,leaseIdHash,keySlot,keysAvailable}
 *   AiPartsProgress {activeRequests,activeLeases,leaseHashes,keySlots,parallelLeases,keysAvailable}
 *   setAiPartsTrace start/lease/end events with jobId + lease hash + slot + width
 *   AiReadingSession warm capacity -> runAiParts(initialParallel=2)
 */
import type {D1Database} from '@cloudflare/workers-types';
import {readFile} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {keyHealthId, reserveKey, resetKeyHealth, updateKeyHealth} from '../server/ai-key-health';
import {handleAiTranslate, resetAiKeyState, type AiTranslateEnv} from '../server/ai-translate';
import {AI_DEFAULTS, AiReadingSession} from '../src/features/ai/services/ai-reading';
import {AiTranslateClientError, parseAiRetryAfter, type AiLeaseInfo, type AiTranslateClientRequest, type AiTranslateClientResponse} from '../src/features/ai/services/ai-translate';
import {runAiParts, setAiPartsTrace, splitAiText, type AiPartsProgress, type AiPartsTrace} from '../src/features/ai/services/ai-parts';
import {DEFAULT_AI_MODEL} from '../src/features/ai/types/ai-models';
import {readAiStreamResponse} from '../src/features/ai/services/ai-stream-client';
import {AI_STREAM_TYPE} from '../src/features/ai/services/ai-stream-protocol';
import {convertPolishSettings} from '../src/features/ai/services/convert-polish';

const MODEL = DEFAULT_AI_MODEL;
const HOLD_MS = 500;
// Synthetic credentials only: printable ASCII, 8..512 chars (server pool contract).
const KEY_ALPHA = 'synthetic-key-alpha-0001';
const KEY_BETA = 'synthetic-key-beta-0002';
const ALL_KEYS = [KEY_ALPHA, KEY_BETA];
const PROMPT_MARKER = 'Nguồn cần dịch sang tiếng Việt:\n';
const settings = {...AI_DEFAULTS, splitParts: true, fallbackModels: [] as string[]};

interface WireCall {
  label: string;
  length: number;
  start: number;
  end?: number;
  status?: number;
  parallel?: 2;
  debug?: AiLeaseInfo;
  errorCode?: string;
  retryAfterMs?: number;
}

let runtime: Miniflare;
let database: D1Database;
let calls: WireCall[] = [];
let exposures: string[] = [];
let traces: AiPartsTrace[] = [];
let upstream: {key: string; label: string; length:number; at: number; end?:number}[] = [];
let activeSends = 0;
let maxActiveSends = 0;
let cutLength = 0;
let firstPair: {ready:Promise<void>;open:()=>void}|undefined;

const sourceOf = (bookId: string, id: string, text: string) => ({bookId, id, revision: 1, text});
const makeEnv = (keys: string[]): AiTranslateEnv => ({DB: database, GEMINI_API_KEYS: JSON.stringify(keys)});
const labelOf = (text: string) => (/^[A-Z]$/.test(text[0] ?? '') ? text[0] : 'Warm');
const overlaps = (a: WireCall, b: WireCall) =>
  Math.max(a.start, b.start) < Math.min(a.end ?? Number.POSITIVE_INFINITY, b.end ?? Number.POSITIVE_INFINITY);

/** Max simultaneous [start,end) intervals; adjacent end==start never counts as overlap. */
function maxConcurrent(list: WireCall[]): number {
  const points: Array<[number, number]> = [];
  for (const call of list) points.push([call.start, 1], [call.end ?? call.start, -1]);
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0;
  let max = 0;
  for (const [, delta] of points) {
    active += delta;
    max = Math.max(max, active);
  }
  return max;
}

/** Negative guard: a success without the frozen lease headers must fail loudly, never silently pass. */
function leaseFrom(response: Response): AiLeaseInfo {
  const requestId = response.headers.get('X-AI-Request-ID');
  const leaseIdHash = response.headers.get('X-AI-Lease-Id-Hash');
  const rawSlot = response.headers.get('X-AI-Key-Slot');
  const rawAvailable = response.headers.get('X-AI-Keys-Available');
  if (!requestId) throw new Error('X-AI-Request-ID missing from success response');
  if (!leaseIdHash) throw new Error('X-AI-Lease-Id-Hash missing from success response');
  if (!rawSlot) throw new Error('X-AI-Key-Slot missing from success response');
  expect(requestId, 'X-AI-Request-ID malformed').toMatch(/^[a-f0-9-]{36}$/);
  expect(leaseIdHash, 'X-AI-Lease-Id-Hash must be lowercase hex 16..64').toMatch(/^[a-f0-9]{16,64}$/);
  expect(rawSlot, 'X-AI-Key-Slot must be a positive integer').toMatch(/^\d{1,2}$/);
  expect(Number(rawSlot)).toBeGreaterThanOrEqual(1);
  return {
    requestId,
    leaseIdHash,
    keySlot: Number(rawSlot),
    ...(rawAvailable && /^\d{1,2}$/.test(rawAvailable) ? {keysAvailable: Number(rawAvailable)} : {}),
  };
}

/** Client wire adapter: mirrors aiTranslate()'s HTTP + error handling, but calls the real worker handler. */
async function bridge(
  input: AiTranslateClientRequest,
  signal: AbortSignal,
  env: AiTranslateEnv,
  onLease?: (lease: AiLeaseInfo) => void,
): Promise<AiTranslateClientResponse> {
  const wire = await handleAiTranslate(
    new Request('https://synthetic.example/api/ai/translate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: AI_STREAM_TYPE,...(input.reportFreeKeys?{'X-AI-Free-Keys':'1'}:{})},
      body: JSON.stringify(input),
      signal,
    }),
    env,
  );
  const streamed=wire.headers.get('Content-Type')?.includes(AI_STREAM_TYPE);
  const response=streamed?await readAiStreamResponse(wire,signal,()=>{},onLease):wire;
  const text = await response.text();
  exposures.push(JSON.stringify([...response.headers]) + text);
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* Non-JSON error bodies are classified by HTTP status below. */
  }
  if (!response.ok) {
    const httpCode = response.status === 429 ? 'ai_rate_limited'
      : response.status === 408 || response.status === 504 ? 'ai_timeout'
        : response.status === 401 || response.status === 403 ? 'ai_auth_error' : 'ai_gateway_error';
    const code = typeof body.error === 'string' ? body.error : httpCode;
    const requestId = response.headers.get('X-AI-Request-ID') ?? undefined;
    const retryAfterMs = response.status === 429 ? parseAiRetryAfter(response.headers.get('Retry-After')) : undefined;
    throw new AiTranslateClientError(code, 'synthetic bridge failure', response.status, response.headers.get('X-AI-Failure-Reason')??undefined, requestId, undefined, retryAfterMs);
  }
  const debug = leaseFrom(response);
  const parallel = response.headers.get('X-AI-Parallel') === '2' ? 2 as const : undefined;
  if(!streamed)onLease?.(debug);
  return {
    result: body.result as string,
    model: body.model as string,
    finishReason: body.finishReason as string,
    inputTokens: body.inputTokens as number,
    outputTokens: body.outputTokens as number,
    ...(parallel ? {parallel} : {}),
    debug,
  };
}

async function tracked(
  input: AiTranslateClientRequest,
  signal: AbortSignal,
  env: AiTranslateEnv,
  onLease?: (lease: AiLeaseInfo) => void,
): Promise<AiTranslateClientResponse> {
  const call: WireCall = {label: labelOf(input.text), length: input.text.length, start: Date.now()};
  calls.push(call);
  activeSends++;
  maxActiveSends = Math.max(maxActiveSends, activeSends);
  try {
    const result = await bridge(input, signal, env, lease => {
      call.debug = lease;
      onLease?.(lease);
    });
    call.status = 200;
    call.parallel = result.parallel;
    call.end = Date.now();
    return result;
  } catch (error) {
    call.end = Date.now();
    if (error instanceof AiTranslateClientError) {
      call.status = error.status;
      call.errorCode = error.code;
      call.retryAfterMs = error.retryAfterMs;
    } else {
      call.status = -1;
      call.errorCode = error instanceof Error ? error.message : 'unknown';
    }
    throw error;
  } finally {
    activeSends--;
  }
}

const sessionTranslate = (env: AiTranslateEnv) =>
  (input: AiTranslateClientRequest, signal: AbortSignal, onLease?: (lease: AiLeaseInfo) => void) =>
    tracked(input, signal, env, onLease);

function assertNoSecrets(...values: unknown[]): void {
  const text = JSON.stringify(values);
  for (const secret of ALL_KEYS) expect(text).not.toContain(secret);
}

async function upstreamMock(_url: unknown, init?: RequestInit): Promise<Response> {
  const key = new Headers(init?.headers).get('x-goog-api-key') ?? '';
  const payload = JSON.parse(String(init?.body)) as {contents?: Array<{parts?: Array<{text?: string}>}>};
  const prompt = payload.contents?.[0]?.parts?.[0]?.text ?? '';
  const markerAt = prompt.lastIndexOf(PROMPT_MARKER);
  const sourceText = markerAt >= 0 ? prompt.slice(markerAt + PROMPT_MARKER.length) : prompt;
  const label = /^[A-Z]$/.test(sourceText[0] ?? '') ? sourceText[0] : 'Warm';
  const work={key,label,length:sourceText.length,at:Date.now(),end:undefined as number|undefined};upstream.push(work);
  if(firstPair&&['A','B'].every(label=>upstream.some(row=>row.label===label)))firstPair.open();
  const data={
    candidates: [{content: {parts: [{text: `Bản dịch ${label}`}]}, finishReason: sourceText.length===cutLength?'MAX_TOKENS':'STOP'}],
    usageMetadata: {promptTokenCount: 1, candidatesTokenCount: 1},
  };
  // Headers arrive first; the provider is still generating while the client
  // receives lease evidence. Record actual body work, not just adapter overlap.
  if(String(_url).includes('streamGenerateContent')){
    let timer:ReturnType<typeof setTimeout>,cancelled=false;
    return new Response(new ReadableStream<Uint8Array>({start(controller){
      // Headers remain immediate. In the cold-pair proof, hold answer bodies
      // until both actual upstream requests exist; host load cannot shorten overlap.
      const ready=firstPair&&['A','B'].includes(label)?firstPair.ready:Promise.resolve();
      void ready.then(()=>{if(!cancelled)timer=setTimeout(()=>{work.end=Date.now();controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));controller.close();},HOLD_MS);});
    },cancel(){cancelled=true;clearTimeout(timer);work.end=Date.now();}}),{headers:{'Content-Type':'text/event-stream'}});
  }
  await new Promise(resolve=>setTimeout(resolve,HOLD_MS));work.end=Date.now();return Response.json(data);
}

function assertUpstreamOverlap(a:typeof upstream[number],b:typeof upstream[number]){
  expect(a.key).not.toBe(b.key);
  expect(Math.min(a.end!,b.end!)-Math.max(a.at,b.at)).toBeGreaterThan(HOLD_MS/2);
}

beforeAll(async () => {
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-01-01',
    d1Databases: ['DB'],
  }));
  database = await runtime.getD1Database('DB') as unknown as D1Database;
  for (const file of ['0006_ai_keys.sql', '0008_ai_key_health.sql', '0017_ai_key_model_blocks.sql']) {
    const sql = (await readFile('migrations/' + file, 'utf8')).replace(/--[^\n]*/g, '');
    for (const statement of sql.split(';').filter(s => s.trim())) await database.prepare(statement).run();
  }
});

beforeEach(async () => {
  resetAiKeyState();
  await database.prepare('DELETE FROM ai_key_health').run();
  await database.prepare('DELETE FROM ai_key_cooldowns').run();
  calls = [];
  exposures = [];
  traces = [];
  upstream = [];
  activeSends = 0;
  maxActiveSends = 0;
  cutLength = 0;
  firstPair=undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation(upstreamMock as unknown as typeof fetch);
  setAiPartsTrace(event => traces.push(event));
});

afterEach(() => {
  firstPair?.open();
  setAiPartsTrace(undefined);
  vi.restoreAllMocks();
  resetAiKeyState();
});

afterAll(async () => {
  await runtime?.dispose();
});

describe('runtime proof: split-part parallel translation with real D1 leases', () => {
  it.each([false,true])('polish uses four distinct leases, or three if another request owns a key (%s)',async busy=>{
    const keys=[...ALL_KEYS,'synthetic-key-gamma-0003','synthetic-key-delta-0004'];
    if(busy)expect(await reserveKey(await keyHealthId(keys[3]),MODEL,database)).toBeDefined();
    const env=makeEnv(keys),session=new AiReadingSession(sessionTranslate(env));
    let start=0;
    const polishPairs=Array.from({length:36},(_,index)=>{
      const converted=`Đoạn ${index}. `+'Khu vườn buổi sáng yên tĩnh. '.repeat(30)+'\n';
      const pair={start,end:start+converted.length,converted,original:'清晨花园。\n'};
      start=pair.end;
      return pair;
    });
    const text=polishPairs.map(pair=>pair.converted).join('');
    try {
      await session.request({...sourceOf('synthetic','polish:proof',text),polishPairs},convertPolishSettings(MODEL),[]);
      const width=busy?3:4;
      expect(calls[0].debug?.freeKeys).toBe(width-1);
      expect(maxConcurrent(calls)).toBe(width);
      expect(new Set(calls.slice(0,width).map(call=>call.debug!.leaseIdHash)).size).toBe(width);
      expect(new Set(upstream.slice(0,width).map(work=>work.key)).size).toBe(width);
      expect(upstream.slice(0,width).every(work=>work.at<upstream[0].end!)).toBe(true);
      if(busy)expect(upstream.some(work=>work.key===keys[3])).toBe(false);
      for(const secret of keys)expect(JSON.stringify({exposures,traces,calls})).not.toContain(secret);
    } finally {session.clear();}
  },20000);
  it('guard: a success without the frozen lease headers fails loudly instead of silently passing', () => {
    expect(() => leaseFrom(new Response('{}', {status: 200}))).toThrow(/X-AI-Request-ID/);
    expect(() => leaseFrom(new Response('{}', {
      status: 200,
      headers: {'X-AI-Request-ID': '00000000-0000-0000-0000-000000000000'},
    }))).toThrow(/X-AI-Lease-Id-Hash/);
  });

  it('A: a warm scheduler launches two parts of ONE chapter concurrently on two distinct keys and leases', async () => {
    const env = makeEnv([KEY_ALPHA, KEY_BETA]);
    const session = new AiReadingSession(sessionTranslate(env));
    try {
      // Warm the session: a 1-part chapter whose success advertises 2 available keys.
      const warm = await session.request(sourceOf('proof-warm', 'warm', 'W'.repeat(600)), settings, []);
      expect(warm.parallel).toBe(2);
      const warmCall = calls.find(call => call.label === 'W')!;
      expect(warmCall.status).toBe(200);
      expect(warmCall.parallel).toBe(2);
      expect(warmCall.debug?.keysAvailable).toBe(2);

      const result = await session.request(
        sourceOf('proof-main', 'main', 'A'.repeat(1800) + 'B'.repeat(1800) + 'C'.repeat(1800) + 'D'.repeat(1800)),
        settings,
        [],
      );
      expect(result.result).toBe('Bản dịch A\nBản dịch B\nBản dịch C\nBản dịch D');

      const partCalls = calls.filter(call => ['A','B','C','D'].includes(call.label));
      expect(partCalls).toHaveLength(4);
      const [partA, partB] = ['A', 'B'].map(label => partCalls.find(call => call.label === label)!);
      expect(partA.status).toBe(200);
      expect(partB.status).toBe(200);

      // Wall-clock overlap of the two parts (this is the core parallelism proof).
      expect(overlaps(partA, partB)).toBe(true);
      expect(Math.max(partA.start, partB.start)).toBeLessThan(Math.min(partA.end!, partB.end!));
      expect(maxConcurrent(partCalls)).toBe(2);
      expect(maxActiveSends).toBe(2);

      // Distinct server-issued lease evidence per concurrent request.
      const hashes = new Set(partCalls.map(call => call.debug!.leaseIdHash));
      const slots = new Set(partCalls.map(call => call.debug!.keySlot));
      const requestIds = new Set(partCalls.map(call => call.debug!.requestId));
      expect(hashes.size).toBe(4);
      expect(slots.size).toBe(2);
      expect(requestIds.size).toBe(4);

      // Two distinct credentials actually served the two parts, mapped by slot.
      const upstreamA = upstream.find(row => row.label === 'A')!;
      const upstreamB = upstream.find(row => row.label === 'B')!;
      assertUpstreamOverlap(upstreamA,upstreamB);
      expect(upstreamA.key).not.toBe(upstreamB.key);
      expect(new Set([upstreamA.key, upstreamB.key])).toEqual(new Set([KEY_ALPHA, KEY_BETA]));
      for (const call of partCalls) {
        expect(call.debug, 'server lease metadata must be present on every success').toBeDefined();
        const slot = call.debug?.keySlot;
        if (slot !== 1 && slot !== 2) throw new Error('A parallel part did not receive a 1-based key slot');
        expect(upstream.find(row => row.label === call.label)!.key).toBe(slot === 1 ? KEY_ALPHA : KEY_BETA);
      }

      // Four requests retain distinct hashes and use the two observed slots at width 2.
      const mainLeases = traces.filter(event => event.type === 'lease' && event.jobId === 'proof-main/main');
      expect(mainLeases).toHaveLength(4);
      expect(new Set(mainLeases.map(event => event.leaseIdHash)).size).toBe(4);
      expect(new Set(mainLeases.map(event => event.keySlot)).size).toBe(2);
      for (const event of mainLeases) expect(event.parallel).toBe(2);

      assertNoSecrets(exposures, traces, calls, result);
    } finally {
      session.clear();
    }
  }, 20000);

  it('B: cold 4-part chapter expands on the first streamed lease before part 1 finishes', async () => {
    const env = makeEnv([KEY_ALPHA, KEY_BETA]);
    const session = new AiReadingSession(sessionTranslate(env));
    try {
      // Fresh session = the real click-Dịch-AI flow: no warm capacity yet.
      const result = await session.request(
        sourceOf('proof-cold', 'four', 'A'.repeat(1800) + 'B'.repeat(1800) + 'C'.repeat(1800) + 'D'.repeat(1800)),
        settings,
        [],
      );
      expect(result.result).toBe('Bản dịch A\nBản dịch B\nBản dịch C\nBản dịch D');

      const [partA, partB, partC, partD] = ['A', 'B', 'C', 'D'].map(label => calls.find(call => call.label === label)!);
      expect(partA.status).toBe(200);
      expect(partB.status).toBe(200);
      expect(partC.status).toBe(200);
      expect(partD.status).toBe(200);

      expect(overlaps(partA, partB)).toBe(true);
      expect(new Set([partA,partB].map(call=>call.debug!.keySlot)).size).toBe(2);
      assertUpstreamOverlap(upstream.find(row=>row.label==='A')!,upstream.find(row=>row.label==='B')!);

      expect(maxConcurrent([partA,partB,partC,partD])).toBe(2);
      expect(new Set([partB, partC].map(call => call.debug!.leaseIdHash)).size).toBe(2);

      assertNoSecrets(exposures, traces, calls, result);
    } finally {
      session.clear();
    }
  }, 20000);

  it('B: cold 6000-character chapter overlaps on distinct streamed D1 leases', async () => {
    let open!:()=>void;
    const ready=new Promise<void>(resolve=>{open=resolve;}),timeout=setTimeout(open,2000);
    firstPair={ready,open:()=>{clearTimeout(timeout);open();}};
    const env = makeEnv([KEY_ALPHA, KEY_BETA]);
    const session = new AiReadingSession(sessionTranslate(env));
    try {
      const result = await session.request(sourceOf('proof-cold', 'four', 'A'.repeat(1500) + 'B'.repeat(1500) + 'C'.repeat(1500) + 'D'.repeat(1500)), settings, []);
      expect(result.result).toBe('Bản dịch A\nBản dịch B\nBản dịch C\nBản dịch D');

      const partCalls = calls.filter(call => ['A','B','C','D'].includes(call.label));
      expect(partCalls).toHaveLength(4);
      const [partA, partB] = ['A', 'B'].map(label => partCalls.find(call => call.label === label)!);
      expect(overlaps(partA, partB)).toBe(true);
      expect(maxConcurrent(partCalls)).toBe(2);
      expect(maxActiveSends).toBe(2);
      expect(new Set(partCalls.map(call=>call.debug!.leaseIdHash)).size).toBe(4);
      expect(new Set(partCalls.map(call=>call.debug!.keySlot)).size).toBe(2);
      assertUpstreamOverlap(upstream.find(row=>row.label==='A')!,upstream.find(row=>row.label==='B')!);

      assertNoSecrets(exposures, traces, calls, result);
    } finally {
      session.clear();
    }
  }, 20000);

  it('recovery children overlap on real distinct leases and publish the prefix before the parent completes',async()=>{
    cutLength=1800;const kept=['C','D','E'].map((label,index)=>({id:String(index+1),response:{result:'Bản dịch '+label,model:MODEL,finishReason:'STOP',inputTokens:1,outputTokens:1}}));
    const session=new AiReadingSession(sessionTranslate(makeEnv(ALL_KEYS)),{read:async()=>undefined,write:async()=>true,readParts:async()=>kept}),states:AiPartsProgress[]=[];
    try{
      const result=await session.request(sourceOf('proof-recovery','one','A'.repeat(900)+'B'.repeat(900)+'C'.repeat(1800)+'D'.repeat(1800)+'E'.repeat(1800)),settings,[],undefined,undefined,state=>states.push(state));
      expect(result.result).toBe('Bản dịch A\nBản dịch B\nBản dịch C\nBản dịch D\nBản dịch E');
      const children=calls.filter(call=>call.length===900);expect(children).toHaveLength(2);
      expect(overlaps(children[0],children[1])).toBe(true);
      expect(new Set(children.map(call=>call.debug!.leaseIdHash)).size).toBe(2);
      expect(new Set(children.map(call=>call.debug!.keySlot)).size).toBe(2);
      const childrenWork=upstream.filter(row=>row.length===900);expect(childrenWork).toHaveLength(2);assertUpstreamOverlap(childrenWork[0],childrenWork[1]);
      expect(maxActiveSends).toBe(2);
      expect(states.some(state=>state.text==='Bản dịch A'&&state.done<state.total)).toBe(true);
      expect(states.some(state=>state.activeLeases===2)).toBe(true);
      expect(states.at(-1)?.activeLeases??0).toBe(0);
      assertNoSecrets(exposures,traces,states,calls,result);
    }finally{session.clear();}
  },20000);

  it('C: one key never grants two live leases; the concurrent 429 falls back to width 1 and stays ordered', async () => {
    const env = makeEnv([KEY_ALPHA]);
    const controller = new AbortController();
    const states: AiPartsProgress[] = [];
    const parts = splitAiText('A'.repeat(1800) + 'B'.repeat(1800));
    expect(parts).toHaveLength(2);

    const result = await runAiParts(
      parts,
      controller.signal,
      new Map<string, AiTranslateClientResponse>(),
      (part, onLease) => tracked({text: part.text, model: MODEL}, controller.signal, env, onLease),
      state => states.push(state),
      undefined,
      undefined,
      2,
      undefined,
      'proof-one-key',
    );
    expect(result.result).toBe('Bản dịch A\nBản dịch B');

    const successes = calls.filter(call => call.status === 200);
    const rejected = calls.filter(call => call.status === 429);
    expect(successes).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].errorCode).toBe('ai_rate_limited');
    expect(rejected[0].retryAfterMs).toBe(1000);
    // The 429 was a concurrent second send while another lease was live.
    expect(successes.some(call => overlaps(call, rejected[0]))).toBe(true);
    expect(rejected[0].end!).toBeLessThan(Math.max(...successes.map(call => call.end!)));

    // Successful translations never overlap and only slot 1 is ever used.
    expect(maxConcurrent(successes)).toBe(1);
    expect(new Set(successes.map(call => call.debug!.keySlot))).toEqual(new Set([1]));
    expect(new Set(successes.map(call => call.debug!.leaseIdHash)).size).toBe(2);
    for (const state of states) {
      expect(state.activeLeases ?? 0).toBeLessThanOrEqual(1);
      expect(state.parallelLeases ?? 0).toBeLessThanOrEqual(1);
    }

    // Scheduler evidence: started at width 2, then fell back to width 1 with a wait.
    expect(states[0].parallel).toBe(2);
    expect(states.at(-1)!.parallel).toBe(1);
    expect(states.some(state => state.parallel === 1 && typeof state.waitUntil === 'number' && state.waitUntil > Date.now() - 10_000)).toBe(true);
    expect(states.some(state => (state.retrying ?? []).length > 0)).toBe(true);
    for (const event of traces.filter(event => event.type === 'lease')) expect(event.activeRequests).toBeLessThanOrEqual(1);

    assertNoSecrets(exposures, traces, states, calls, result);
  }, 20000);

  it('D: pre-cooled single key returns 429 + Retry-After; the client waits, then runs sequentially', async () => {
    const env = makeEnv([KEY_ALPHA]);
    await updateKeyHealth(await keyHealthId(KEY_ALPHA), {model: MODEL, cooldown_until: Date.now() + 900}, database);

    // Direct probe of the server contract: 429 with a delta-seconds Retry-After.
    const probe = await handleAiTranslate(new Request('https://synthetic.example/api/ai/translate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text: 'A'.repeat(64), model: MODEL}),
    }), env);
    expect(probe.status).toBe(429);
    const retryAfterHeader = probe.headers.get('Retry-After');
    expect(retryAfterHeader).toBe('1');
    expect(parseAiRetryAfter(retryAfterHeader)).toBe(1000);

    const states: AiPartsProgress[] = [];
    const session = new AiReadingSession(sessionTranslate(env));
    const started = Date.now();
    try {
      const result = await session.request(
        sourceOf('proof-cooldown', 'four', 'A'.repeat(1500) + 'B'.repeat(1500) + 'C'.repeat(1500) + 'D'.repeat(1500)),
        settings,
        [],
        undefined,
        undefined,
        state => states.push(state),
      );
      const elapsed = Date.now() - started;
      expect(result.result).toBe('Bản dịch A\nBản dịch B\nBản dịch C\nBản dịch D');
      expect(result.parallel).toBeUndefined();

      const rejected = calls.filter(call => call.status === 429);
      const successes = calls.filter(call => call.status === 200);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].retryAfterMs).toBe(1000);
      expect(successes).toHaveLength(4);

      // Client actually waited on the server hint before retrying, and stayed sequential.
      expect(elapsed).toBeGreaterThanOrEqual(700);
      expect(successes[0].start - rejected[0].start).toBeGreaterThanOrEqual(700);
      expect(states.some(state => typeof state.waitUntil === 'number' && state.waitUntil >= started + 700)).toBe(true);
      expect(maxConcurrent(calls)).toBe(1);
      expect(maxConcurrent(successes)).toBe(1);
      for(let index=1;index<successes.length;index++)expect(overlaps(successes[index-1],successes[index])).toBe(false);
      expect(new Set(successes.map(call => call.debug!.keySlot))).toEqual(new Set([1]));
      for (const state of states) {
        expect(state.parallel).toBe(1);
        expect(state.activeLeases ?? 0).toBeLessThanOrEqual(1);
      }
      for (const event of traces.filter(event => event.type === 'lease')) expect(event.activeRequests).toBeLessThanOrEqual(1);

      assertNoSecrets(exposures, traces, states, calls, result);
    } finally {
      session.clear();
    }
  }, 20000);
});
