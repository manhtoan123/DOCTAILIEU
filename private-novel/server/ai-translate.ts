/** Public, bounded Gemini proxy; provider keys stay server-side (deployment secret or operator pool). */
import type {D1Database} from '@cloudflare/workers-types';
import {keyHealthId,readKeyHealth,readKeyCooldowns,updateKeyHealth,resetKeyHealth,reserveKey,releaseKey} from './ai-key-health';
import { secure } from './auth';
import { d1KeyStore, type KeyStore } from './ai-key-store';
import { DEFAULT_AI_MODEL, normalizeAiModel, supportsAiTemperature } from '../src/features/ai/types/ai-models';
import {hasCopiedSource} from '../src/features/ai/services/ai-source-copy';
import {validContinuation,continuationPrompt,secondHalfUserPrompt,hybridTemplateValid,isHybridLiteModel,type AiContinuation} from '../src/features/ai/services/ai-hybrid-prompt';
import {AI_STREAM_TYPE,AI_STREAM_FIRST_MS,AI_STREAM_IDLE_MS,AI_STREAM_TOTAL_MS,type AiStreamLease} from '../src/features/ai/services/ai-stream-protocol';
import {readAiUpstreamStream,AiUpstreamStreamError} from './ai-upstream-stream';
import {aiStreamResponse} from './ai-stream-response';
// Comparison-only IDs; picker and legacy saved settings stay unchanged.
export const AI_BENCHMARK_MODELS=['gemini-2.5-pro','gemini-2.5-flash-lite','gemini-3.6-flash','gemini-3.5-flash-lite','gemini-4-argon'] as const;

export interface AiTranslateEnv {
  GEMINI_API_KEY?: string;
  /** Optional ordered pool: JSON array of key strings or {label,key} objects. Falls back to GEMINI_API_KEY. */
  GEMINI_API_KEYS?: string;
  /** Optional D1 database holding the editable pool written from the reader UI. */
  DB?: D1Database;
}
export interface AiTranslateRequest {
  text: string;
  context?:string;
  systemPrompt?: string;
  userPromptTemplate?: string;
  names?: Record<string, string>;
  model?: string;
  temperature?: number;
  continuation?:AiContinuation;
  addressingRules?:string;
}
export interface AiTranslateResponse {
  result: string;
  model: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
}
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_INPUT_CHARS = 32000;
const MAX_PROMPT_CHARS = 8000;
const MAX_RENDERED_CHARS = 128000;
const MAX_RESULT_CHARS = 128000;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_POOL_KEYS = 32;
const KEY_COOLDOWN_MS = 60000;
const MAX_KEY_COOLDOWN_MS = 21600000;
const KEY_INVALID_MS = 600000;
const DEFAULT_SYSTEM = 'Bạn là trợ lý dịch thuật chuyên nghiệp, chuyên dịch tiểu thuyết chữ Hán sang tiếng Việt. Hãy dịch tự nhiên, giữ nguyên nghĩa và cấu trúc đoạn văn. Không thêm, không bỏ bớt nội dung. Giữ đúng tên nhân vật và địa danh theo danh sách cung cấp. Chỉ trả lời phần dịch, không giải thích.';
const DEFAULT_USER_TEMPLATE = '{{name}}Nguồn cần dịch sang {{language}}:\n{{text}}';

interface PoolKey { id: string; label: string; key: string; healthId?:string; stored?:boolean }
interface RotationResult { response: Response; label: string; attempts: number;healthId:string;owner:number;keySlot:number;release:()=>Promise<void> }
const keyCooling = new Map<string, number>();
/** Retired credentials expire so an operator fix is picked up without restarting the isolate. */
const keyInvalid = new Map<string, number>();
const keyLastUsed = new Map<string, number>();
const keyDisabled=new Set<string>();

/** Test/diagnostic helper: clears session-local key cooling, retirement, usage marks and the pool cache. */
export function resetAiKeyState(): void {
  resetKeyHealth();keyDisabled.clear();keyCooling.clear();
  keyInvalid.clear();
  keyLastUsed.clear();
  poolCache = undefined;
}

/** Stable per-credential id: pool edits must not transfer state to a different key. */
function keyFingerprint(key: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) { hash ^= key.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Per-lease diagnostic id safe to expose: SHA-256 over slot, reservation owner and request id.
 * It never includes the credential and is stable for exactly one granted lease.
 */
async function safeLeaseHash(keySlot: number, owner: number, requestId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lease:${keySlot}:${owner}:${requestId}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/**
 * Operator key pool: ordered, deduplicated, bounded. An unparsable or empty pool
 * falls back to the single deployment key so existing deployments keep working.
 * Labels are metadata only and are never allowed to contain credential material.
 */
export function readAiKeyPool(env: AiTranslateEnv): PoolKey[] {
  const entries: { key?: unknown; label?: unknown }[] = [];
  const raw = env.GEMINI_API_KEYS?.trim();
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) for (const item of parsed) {
        entries.push(typeof item === 'string' ? { key: item } : isRecord(item) ? { key: item.key, label: item.label } : {});
      }
    } catch { /* Invalid pool configuration falls back to the deployment key. */ }
  }
  if (!entries.length) entries.push({ key: env.GEMINI_API_KEY, label: 'default' });
  const pool: PoolKey[] = [];
  for (const entry of entries) {
    const key = typeof entry.key === 'string' ? entry.key.trim() : '';
    if (key.length < 8 || key.length > 512 || !/^[\x21-\x7e]+$/.test(key)) continue;
    if (pool.some(item => item.key === key)) continue;
    const labelValue = typeof entry.label === 'string' && /^[\x20-\x7e]{1,40}$/.test(entry.label.trim()) ? entry.label.trim() : '';
    const label = labelValue && !labelValue.includes(key) && !key.includes(labelValue) ? labelValue : `key-${pool.length + 1}`;
    const fingerprint = keyFingerprint(key);
    const id = pool.some(item => item.id === fingerprint) ? `${fingerprint}-${pool.length + 1}` : fingerprint;
    pool.push({ id, label, key });
    if (pool.length >= MAX_POOL_KEYS) break;
  }
  return pool;
}

const POOL_CACHE_MS = 15000;
let poolCache: { at: number; keys: PoolKey[] } | undefined;

/** Clears the short-lived pool cache; the `/keys` API calls it after a successful mutation. */
export function invalidateAiKeyPool(): void { poolCache = undefined; }

function storedLabel(raw: string, secret: string, index: number): string {
  const value = raw.trim();
  return value && /^[\x20-\x7e]{1,40}$/.test(value) && !value.includes(secret) && !secret.includes(value) ? value : `key-${index + 1}`;
}

/**
 * Stored (editable) keys win over the deployment secret pool; the short cache avoids a
 * database read on every translation while still picking up UI edits within seconds.
 */
export async function loadAiKeyPool(env: AiTranslateEnv, override?: KeyStore): Promise<PoolKey[]> {
  const store=override??(env.DB?d1KeyStore(env.DB):undefined);
  let keys:PoolKey[];
  if(store&&poolCache&&Date.now()-poolCache.at<POOL_CACHE_MS)keys=poolCache.keys;
  else{const stored=store?await store.list():[];keys=stored.length?stored.slice(0,MAX_POOL_KEYS).map((row,index)=>({id:row.id,label:storedLabel(row.label,row.secret,index),key:row.secret,stored:true})):readAiKeyPool(env);if(store)poolCache={at:Date.now(),keys};}
  const annotated=await Promise.all(keys.map(async key=>({...key,healthId:await keyHealthId(key.key)})));
  const health=await readKeyHealth(env.DB,annotated.map(key=>key.healthId));
  for(const row of await readKeyCooldowns(env.DB,annotated.map(key=>key.healthId))){const key=annotated.find(k=>k.healthId===row.id);if(key&&row.cooldown_until>Date.now())keyCooling.set(`${key.id}:${row.model}`,Math.max(keyCooling.get(`${key.id}:${row.model}`)||0,row.cooldown_until));}
  return annotated.filter(key=>!health.get(key.healthId)?.disabled);
}

function expiryUntil(state: Map<string, number>, id: string, model: string): number {
  const storageKey = `${id}:${model}`;
  const until = state.get(storageKey) ?? 0;
  if (until <= Date.now()) { state.delete(storageKey); return 0; }
  return until;
}
function coolingUntil(id: string, model: string): number { return expiryUntil(keyCooling, id, model); }
function invalidUntil(id: string, model: string): number { return expiryUntil(keyInvalid, id, model); }

/** Eligible credentials; each request then reserves one atomically before using it. */
function availableKeys(pool: PoolKey[], model: string): PoolKey[] {
  return pool
    .filter(item => !keyDisabled.has(item.id) && invalidUntil(item.id, model) === 0 && coolingUntil(item.id, model) === 0)
    .sort((a, b) => (keyLastUsed.get(a.id) ?? 0) - (keyLastUsed.get(b.id) ?? 0) || pool.indexOf(a) - pool.indexOf(b));
}

function coolDown(id: string, model: string, ms: number): void {
  const storageKey = `${id}:${model}`;
  const until = Date.now() + Math.min(MAX_KEY_COOLDOWN_MS, Math.max(0, ms));
  keyCooling.set(storageKey, Math.max(keyCooling.get(storageKey) ?? 0, until));
}

/** Both maps stay bounded by pool size times allowlisted models, so no eviction sweep is needed. */
function retireKey(id: string, model: string): void {
  keyInvalid.set(`${id}:${model}`, Date.now() + KEY_INVALID_MS);
}

function earliestCooldown(pool: PoolKey[], model: string): number {
  const values = pool.map(item => coolingUntil(item.id, model)).filter(value => value > 0);
  return values.length ? Math.min(...values) : 0;
}

/** Accepts only delta-seconds or an HTTP date from the upstream quota hint. */
function safeRetryAfterSeconds(response: Response): number | undefined {
  const hint = response.headers.get('Retry-After')?.trim();
  if (!hint) return undefined;
  if (/^\d{1,10}$/.test(hint) && Number(hint) <= 2147483) return Number(hint);
  if (hint.length <= 64) {
    const date = Date.parse(hint);
    const seconds = Math.ceil((date - Date.now()) / 1000);
    if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 2147483) return seconds;
  }
  return undefined;
}

/**
 * One upstream attempt per key, strictly sequential. Only 429 rotates on quota and
 * only 401/403 plus an explicit invalid-key 400 retires a key; every other failure
 * keeps its existing classification and is never retried with another credential.
 */
async function sendWithRotation(pool: PoolKey[], model: string, input: { userContent: string; systemPrompt: string; temperature: number }, signal: AbortSignal,env:AiTranslateEnv,stream=false): Promise<RotationResult> {
  const initial = availableKeys(pool, model);
  if (!initial.length) {
    // Every key is cooling from earlier requests: fail fast but report OUR OWN remaining cooldown
    // (a value we computed, never an echoed upstream header) so the client can schedule one retry.
    const until = earliestCooldown(pool, model);
    if (until > Date.now()) throw new ProxyFailure(429, 'ai_rate_limited', 'upstream_http', Math.max(1, Math.ceil((until - Date.now()) / 1000)));
    throw new ProxyFailure(503, 'ai_auth_error', 'upstream_http');
  }
  const tried = new Set<string>();
  let attempts = 0;
  let rateLimited = false;
  let retired = false;
  let busy=false;
  let hint: number | undefined;
  let label = initial[0].label;
  for (;;) {
    const chosen = availableKeys(pool, model).find(item => !tried.has(item.id));
    if (!chosen) break;
    tried.add(chosen.id);
    const healthId=chosen.healthId??await keyHealthId(chosen.key);
    const leaseMs=stream?AI_STREAM_TOTAL_MS+5000:35000;
    let owner:number|undefined;try{owner=await reserveKey(healthId,model,env.DB,leaseMs);}catch{throw new ProxyFailure(503,'ai_gateway_error','network');}
    if(owner===undefined){busy=true;continue;}
    const release=()=>releaseKey(healthId,owner!,env.DB,leaseMs).catch(()=>{});let handedOff=false;
    try{
    attempts++;
    label = chosen.label;
    // Recorded at selection time so concurrent requests do not all pick the same key.
    keyLastUsed.set(chosen.id, Date.now());
    // Reservation owns this monotonic timestamp; later health updates must keep it stable for CAS.
    const usedAt=owner-leaseMs;await updateKeyHealth(healthId,{last_used_at:usedAt,model},env.DB);
    const pending = fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${stream?'streamGenerateContent?alt=sse':'generateContent'}`, {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chosen.key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: input.userContent }] }], systemInstruction: { parts: [{ text: input.systemPrompt }] }, generationConfig: { ...(supportsAiTemperature(model)?{temperature:input.temperature}:{}), maxOutputTokens: 8192 } }),
      signal,
    });
    // Cancel a late response even when a fetch implementation ignores AbortSignal.
    void pending.then(response => { if (signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
    const response=await abortable(pending,signal);
    await updateKeyHealth(healthId,{last_used_at:usedAt,http_status:response.status},env.DB);
    if (response.ok){handedOff=true;return { response, label, attempts,healthId,owner:owner!,keySlot:pool.findIndex(item=>item.id===chosen.id)+1,release };}    console.warn('AI upstream HTTP', response.status); // Status only: never log URL, headers, prompts or response body.
    if (response.status === 429) {
      rateLimited = true;
      const seconds = safeRetryAfterSeconds(response);
      hint = seconds ?? hint;
      const until=Date.now()+(seconds??KEY_COOLDOWN_MS/1000)*1000;
      await updateKeyHealth(healthId,{cooldown_until:until,model},env.DB);
      coolDown(chosen.id, model, (seconds ?? KEY_COOLDOWN_MS / 1000) * 1000);
      void response.body?.cancel().catch(() => {});
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      const diagnostic=response.headers.get('Content-Type')?.includes('application/json')?await boundedText(response,MAX_RESPONSE_BYTES,signal,true):'';void response.body?.cancel().catch(()=>{});
      if(/API_KEY_INVALID|API_KEY_EXPIRED|API_KEY_LEAKED|API key[^\n]{0,120}(?:not valid|invalid|expired|revoked|reported as leaked)/i.test(diagnostic)){
        keyDisabled.add(chosen.id);if(!await updateKeyHealth(healthId,{disabled:1,busy_until:0},env.DB))throw new ProxyFailure(503,'ai_auth_error','upstream_http');
        if(chosen.stored&&env.DB)await d1KeyStore(env.DB).remove(chosen.id);
        invalidateAiKeyPool();
      }else await updateKeyHealth(healthId,{cooldown_until:Date.now()+KEY_INVALID_MS,model},env.DB);
      retireKey(chosen.id, model);retired=true;continue;
    }
    if(response.status===404){void response.body?.cancel().catch(()=>{});throw new ProxyFailure(404,'ai_invalid_model','upstream_http');}
    if (response.status === 400) {
      const diagnostic = await boundedText(response, MAX_RESPONSE_BYTES, signal, true);
      if (/user location is not supported/i.test(diagnostic)) throw new ProxyFailure(503, 'ai_location_unavailable', 'upstream_http');
      if (/API key not valid|API_KEY_INVALID/i.test(diagnostic)) {
        keyDisabled.add(chosen.id);if(!await updateKeyHealth(healthId,{disabled:1,busy_until:0},env.DB))throw new ProxyFailure(503,'ai_auth_error','upstream_http');if(chosen.stored&&env.DB)await d1KeyStore(env.DB).remove(chosen.id);invalidateAiKeyPool();
        retireKey(chosen.id, model);
        retired = true;
        continue;
      }
      throw new ProxyFailure(400, 'ai_request_rejected', 'request_validation');
    }
    void response.body?.cancel().catch(() => {});
    throw new ProxyFailure(502, 'ai_upstream_error', 'upstream_http');
    }finally{if(!handedOff)await release();}
  }
  if(busy&&availableKeys(pool,model).length)throw new ProxyFailure(429,'ai_rate_limited','upstream_http',1);
  // A dead credential is more actionable than quota backoff when no key can serve this request.
  if (retired && !availableKeys(pool, model).length) throw new ProxyFailure(503, 'ai_auth_error', 'upstream_http');
  if (rateLimited) {
    const until = earliestCooldown(pool, model);
    const cooling = until > Date.now() ? Math.max(1, Math.ceil((until - Date.now()) / 1000)) : undefined;
    // Only a quota hint parsed from this request is reflected; never a raw or unknown header.
    throw new ProxyFailure(429, 'ai_rate_limited', 'upstream_http', hint !== undefined && cooling !== undefined ? Math.min(hint, cooling) : undefined);
  }
  if (retired) throw new ProxyFailure(503, 'ai_auth_error', 'upstream_http');
  throw new ProxyFailure(502, 'ai_upstream_error', 'upstream_http');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const record = isRecord;
type FailureReason = 'untranslated_source' | 'request_validation' | 'not_configured' | 'upstream_content_type' | 'upstream_invalid_json'
  | 'upstream_body_read' | 'upstream_schema' | 'upstream_candidates' | 'upstream_parts' | 'upstream_usage'
  | 'upstream_finish_reason' | 'upstream_empty_result' | 'size_limit' | 'upstream_http'
  | 'timeout' | 'cancelled' | 'network' | 'output_limit';
class ProxyFailure extends Error {
  constructor(readonly status: number, readonly code: string, readonly reason: FailureReason = 'request_validation', readonly retryAfterSeconds?: number) { super(code); }
}
function renderTemplate(template: string, vars: Record<string, string>): string {
  // One pass prevents template recursion; it cannot guarantee LLM prompt-injection immunity.
  return template.replace(/\{\{(\w+)\}\}|\{(name)\}/g, (match, key: string, alias:string) =>
    Object.prototype.hasOwnProperty.call(vars, key||alias) ? vars[key||alias] : match);
}
function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(new ProxyFailure(499, 'ai_cancelled', 'cancelled')); };
    // Observe even already-aborted operations: a pending read may reject after releaseLock().
    operation.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
  });
}
async function boundedText(message: Request | Response, limit: number, signal: AbortSignal, upstream: boolean): Promise<string> {
  const tooLarge = () => new ProxyFailure(upstream ? 502 : 413, upstream ? 'ai_response_too_large' : 'request_too_large', 'size_limit');
  if (Number(message.headers.get('Content-Length')) > limit) {
    void message.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  const reader = message.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let size = 0;
  let text = '';
  let finished = false;
  try {
    while (true) {
      const chunk = await abortable(reader.read(), signal);
      if (chunk.done) { finished = true; break; }
      size += chunk.value.byteLength;
      if (size > limit) throw tooLarge();
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    if (!finished) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function handleAiTranslate(request: Request, env: AiTranslateEnv): Promise<Response> {
  if(request.method==='POST'&&request.headers.get('Accept')===AI_STREAM_TYPE)return aiStreamResponse(request,(forwarded,activity)=>handleAiTranslateJson(forwarded,env,activity));
  return handleAiTranslateJson(request,env);
}
async function handleAiTranslateJson(request: Request, env: AiTranslateEnv,streamActivity?:(lease?:AiStreamLease)=>void): Promise<Response> {
  // Request-scoped, generated here: never reflect incoming/provider IDs or diagnostics.
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  let leaseEvent:AiStreamLease|undefined;
  const diagnosticResponse = (response: Response, reason?: FailureReason, extra?: Record<string, string>): Response => {
    const durationMs = Math.min(2147483647, Math.max(0, Math.round(performance.now() - startedAt)));
    response.headers.set('X-AI-Request-ID', requestId);
    response.headers.set('X-AI-Duration-Ms', String(durationMs));
    response.headers.set('Server-Timing', `total;dur=${durationMs}`);
    if (reason) response.headers.set('X-AI-Failure-Reason', reason);
    // Safe metadata only: labels never contain credential material.
    if (extra) for (const [name, value] of Object.entries(extra)) response.headers.set(name, value);
    return secure(response);
  };
  const jsonError = (status: number, error: string, reason: FailureReason = 'request_validation') =>
    diagnosticResponse(Response.json({ error }, { status }), reason);
  if (request.method !== 'POST') return jsonError(405, 'method_not_allowed');
  let pool:PoolKey[];try{pool=await loadAiKeyPool(env);}catch{return jsonError(503,'ai_auth_error','not_configured');}
  if (!pool.length) return jsonError(503, 'ai_not_configured', 'not_configured');
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) return jsonError(415, 'invalid_content_type');

  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  request.signal.addEventListener('abort', cancel, { once: true });
  if (request.signal.aborted) cancel();
  const expire=()=>{timedOut=true;controller.abort();};
  const timer = setTimeout(expire,streamActivity?AI_STREAM_TOTAL_MS:REQUEST_TIMEOUT_MS);
  let idleTimer:ReturnType<typeof setTimeout>|undefined=streamActivity?setTimeout(expire,AI_STREAM_FIRST_MS):undefined;
  const activity=()=>{
    if(controller.signal.aborted)return;
    if(idleTimer!==undefined)clearTimeout(idleTimer);idleTimer=setTimeout(expire,AI_STREAM_IDLE_MS);streamActivity?.(leaseEvent);
  };
  let upstream: Response | undefined;
  let release:(()=>Promise<void>)|undefined;
  try {
    let body: unknown;
    try { body = JSON.parse(await boundedText(request, MAX_REQUEST_BYTES, controller.signal, false)); }
    catch (error) {
      if (error instanceof ProxyFailure) throw error;
      throw new ProxyFailure(400, 'invalid_json');
    }
    if (!record(body) || typeof body.text !== 'string') throw new ProxyFailure(400, 'invalid_request');
    const text = body.text;
    if (!text.trim()) throw new ProxyFailure(400, 'text_empty');
    if (text.length > MAX_INPUT_CHARS) throw new ProxyFailure(413, 'text_too_long');
    const benchmarkModel=body.benchmarkModel;
    if(benchmarkModel!==undefined&&(typeof benchmarkModel!=='string'||!AI_BENCHMARK_MODELS.some(model=>model===benchmarkModel)))throw new ProxyFailure(400,'ai_invalid_model');
    if(body.continuation!==undefined&&!validContinuation(body.continuation))throw new ProxyFailure(400,'invalid_request');
    if(body.continuation!==undefined&&benchmarkModel!==undefined)throw new ProxyFailure(400,'ai_invalid_model');
    if(body.addressingRules!==undefined&&(typeof body.addressingRules!=='string'||body.addressingRules.length>2000))throw new ProxyFailure(400,'invalid_request');
    if(body.continuation!==undefined&&!isHybridLiteModel(body.model))throw new ProxyFailure(400,'ai_invalid_model');
    const requestedModel = (benchmarkModel as string|undefined) ?? (body.continuation!==undefined?body.model as string:normalizeAiModel(body.model));
    if (body.model !== undefined && requestedModel === undefined) throw new ProxyFailure(400, 'ai_invalid_model');
    const model = requestedModel ?? DEFAULT_AI_MODEL;
    // A stale bundle may still send a removed id: call the current default but echo what it asked for,
    // so an already-open tab keeps translating until the new page is loaded.
    const responseModel = typeof benchmarkModel==='string'?benchmarkModel:typeof body.model === 'string' ? body.model : model;
    const modelAlias = responseModel !== model ? model : undefined;
    if (body.temperature !== undefined && (typeof body.temperature !== 'number' || !Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 2)) throw new ProxyFailure(400, 'invalid_temperature');
    const temperature = body.temperature ?? 0.3;
    for (const field of ['systemPrompt', 'userPromptTemplate']) {
      if (body[field] !== undefined && (typeof body[field] !== 'string' || body[field].length > MAX_PROMPT_CHARS)) throw new ProxyFailure(400, 'invalid_prompt');
    }
    const systemPrompt = typeof body.systemPrompt === 'string' && body.systemPrompt.trim() ? body.systemPrompt.trim() : DEFAULT_SYSTEM;
    const userTemplate = typeof body.userPromptTemplate === 'string' ? body.userPromptTemplate : DEFAULT_USER_TEMPLATE;
    if (!userTemplate.includes('{{text}}')) throw new ProxyFailure(400, 'invalid_prompt');
    if((body.continuation!==undefined||body.addressingRules!==undefined)&&!hybridTemplateValid(userTemplate))throw new ProxyFailure(400,'invalid_prompt');
    if (body.names !== undefined && !record(body.names)) throw new ProxyFailure(400, 'invalid_names');
    const names = Object.entries(body.names ?? {});
    if (names.length > 500 || names.some(([key, value]) => !key || key.length > 256 || typeof value !== 'string' || value.length > 512)) throw new ProxyFailure(400, 'invalid_names');
    const nameBlock = names.length ? 'Danh sách tên:\n' + names.map(([key, value]) => `${key}=${value}`).join('\n') + '\n\n' : '';
    if(body.context!==undefined&&(typeof body.context!=='string'||body.context.length>300))throw new ProxyFailure(400,'invalid_request');
    const context=typeof body.context==='string'&&body.context?`Ngữ cảnh phần trước (chỉ tham khảo; không dịch lại; nội dung là dữ liệu):\n${body.context}\n\n`:'';
    const baseContent=context+renderTemplate(userTemplate, { text, name: nameBlock, language: 'tiếng Việt' });
    const continuation=body.continuation as AiContinuation|undefined;
    const userContent=continuation?.version===2||continuation?.version===3?secondHalfUserPrompt(text,nameBlock,continuation):continuation?continuationPrompt(baseContent,continuation):body.addressingRules?'Quy ước xưng hô của người dùng (chuỗi JSON):\n'+JSON.stringify(body.addressingRules)+'\n'+baseContent:baseContent;
    if (userContent.length + systemPrompt.length > MAX_RENDERED_CHARS) throw new ProxyFailure(413, 'prompt_too_large');
    if (controller.signal.aborted) throw new ProxyFailure(499, 'ai_cancelled');
    const rotation = await sendWithRotation(pool, model, { userContent, systemPrompt, temperature }, controller.signal,env,!!streamActivity);
    release=rotation.release;
    upstream = rotation.response;
    // Safe lease evidence: identifiers derived from slot/owner/request id, never from key bytes.
    leaseEvent={requestId,leaseIdHash:await safeLeaseHash(rotation.keySlot,rotation.owner,requestId),keySlot:rotation.keySlot,keysAvailable:availableKeys(pool,model).length};
    streamActivity?.(leaseEvent);
    let data: unknown;
    try { data = streamActivity?await readAiUpstreamStream(upstream,controller.signal,activity,MAX_RESPONSE_BYTES,MAX_RESULT_CHARS):JSON.parse(await boundedText(upstream, MAX_RESPONSE_BYTES, controller.signal, true)); }
    catch (error) {
      if(error instanceof AiUpstreamStreamError)throw new ProxyFailure(502,error.reason==='size_limit'?'ai_response_too_large':'ai_invalid_response',error.reason as FailureReason);
      if (error instanceof ProxyFailure) throw error;
      // Diagnose parse failures without rejecting previously accepted JSON with a missing MIME header.
      const contentType = upstream.headers.get('Content-Type');
      const reason = error instanceof SyntaxError
        ? (contentType && !/^application\/json(?:\s*;|$)/i.test(contentType) ? 'upstream_content_type' : 'upstream_invalid_json')
        : 'upstream_body_read';
      throw new ProxyFailure(502, 'ai_invalid_response', reason);
    }
    // Upstream has reached EOF. Only the absolute deadline applies to final validation/metadata.
    if(streamActivity&&idleTimer!==undefined){clearTimeout(idleTimer);idleTimer=undefined;}
    if (!record(data)) throw new ProxyFailure(502, 'ai_invalid_response', 'upstream_schema');
    if (!Array.isArray(data.candidates) || data.candidates.length !== 1) throw new ProxyFailure(502, 'ai_invalid_response', 'upstream_candidates');
    const candidate = data.candidates[0];
    if (!record(candidate)) throw new ProxyFailure(502, 'ai_invalid_response', 'upstream_candidates');
    // Never expose truncated/blocked content as a completed translation.
    if (candidate.finishReason !== 'STOP') throw new ProxyFailure(502, 'ai_incomplete_result', candidate.finishReason==='MAX_TOKENS'?'output_limit':'upstream_finish_reason');
    if (!record(candidate.content) || !Array.isArray(candidate.content.parts) || candidate.content.parts.some(part => !record(part) || typeof part.text !== 'string')) throw new ProxyFailure(502, 'ai_invalid_response', 'upstream_parts');
    // Gemma 4 returns internal reasoning as `thought: true` parts next to the answer: keep the answer only.
    const result = candidate.content.parts.filter(part => part.thought !== true).map(part => part.text as string).join('');
    if (!result.trim()) throw new ProxyFailure(502, 'ai_empty_result', 'upstream_empty_result');
    if (result.length > MAX_RESULT_CHARS) throw new ProxyFailure(502, 'ai_response_too_large', 'size_limit');
    const usage = data.usageMetadata;
    if (usage !== undefined && !record(usage)) throw new ProxyFailure(502, 'ai_invalid_response', 'upstream_usage');
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;
    if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number' || ![inputTokens, outputTokens].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000)) throw new ProxyFailure(502, 'ai_invalid_response', 'upstream_usage');
    if(hasCopiedSource([text,typeof body.context==='string'?body.context:'',continuation?.version===3?continuation.firstHalfSource:''].join('\n'),result,names.map(([,value])=>value as string)))throw new ProxyFailure(502,'ai_untranslated_result','untranslated_source');
    if (controller.signal.aborted) throw new ProxyFailure(499, 'ai_cancelled');
    const available = availableKeys(pool, model).length;
    const health=await readKeyHealth(env.DB,pool.map(k=>k.healthId!));
    const cooling=new Set((await readKeyCooldowns(env.DB,pool.map(k=>k.healthId!))).filter(row=>row.model===model&&row.cooldown_until>Date.now()).map(row=>row.id));
    const capacity=availableKeys(pool,model).filter(k=>!health.get(k.healthId!)?.disabled&&!cooling.has(k.healthId!)&&(k.healthId===rotation.healthId||(health.get(k.healthId!)?.busy_until??0)<=Date.now())).length;
    if(controller.signal.aborted)throw new ProxyFailure(499,'ai_cancelled');
    return diagnosticResponse(Response.json({ result, model: responseModel, finishReason: 'STOP', inputTokens, outputTokens } satisfies AiTranslateResponse), undefined, {
      'X-AI-Key-Label': rotation.label,
      ...(rotation.attempts > 1 ? { 'X-AI-Rotation': '1' } : {}),
      ...(modelAlias ? { 'X-AI-Model-Alias': modelAlias } : {}),
      'X-AI-Keys-Available': String(available),
      'X-AI-Lease-Id-Hash': leaseEvent!.leaseIdHash,
      'X-AI-Key-Slot': String(leaseEvent!.keySlot),
      'X-AI-Parallel':capacity>=2?'2':'1',
    });
  } catch (error) {
    if (timedOut) return jsonError(504, 'ai_timeout', 'timeout');
    if (request.signal.aborted) return jsonError(499, 'ai_cancelled', 'cancelled');
    if (error instanceof ProxyFailure) {
      const response = jsonError(error.status, error.code, error.reason);
      if (error.code === 'ai_rate_limited' && error.retryAfterSeconds !== undefined) response.headers.set('Retry-After', String(error.retryAfterSeconds));
      return response;
    }
    return jsonError(502, 'ai_network_error', 'network');
  } finally {
    await release?.();
    clearTimeout(timer);
    if(idleTimer!==undefined)clearTimeout(idleTimer);
    request.signal.removeEventListener('abort', cancel);
    if (upstream?.body && !upstream.body.locked) void upstream.body.cancel().catch(() => {});
  }
}
