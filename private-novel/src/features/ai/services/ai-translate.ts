/**
 * AI client (frontend) — gọi /api/ai/translate.
 * Gemini key chỉ ở server. Không cần mã kết nối hoặc đăng nhập.
 */
import { DEFAULT_AI_MODEL, normalizeAiModel } from '../types/ai-models';
import {hasCopiedSource} from './ai-source-copy';
import {nameSourceKey,parseNameValue} from '../../names-convert/services/name-images';
import {validContinuation,aiUserPromptPreview,hybridTemplateValid,type AiContinuation} from './ai-hybrid-prompt';
import {AI_STREAM_TYPE,AI_STREAM_FIRST_MS,AI_STREAM_IDLE_MS,AI_STREAM_TOTAL_MS,AI_STREAM_CLIENT_GRACE_MS,type AiStreamLease} from './ai-stream-protocol';
import {readAiStreamResponse} from './ai-stream-client';

export interface AiTranslateClientRequest {
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

/** Safe lease evidence returned by the server: identifiers only, never credential material. */
export interface AiLeaseInfo {requestId:string;leaseIdHash:string;keySlot?:number;keysAvailable?:number}
export interface AiTranslateClientResponse {
  result: string;
  model: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
  parallel?:2;
  debug?:AiLeaseInfo;
  halves?:{version:1;models:[string,string];sampleHash:string};
}

export type AiTranslateError =
  | 'ai_not_configured'
  | 'ai_rate_limited'
  | 'ai_timeout'
  | 'ai_upstream_error'
  | 'ai_auth_error'
  | 'ai_empty_result'
  | 'forbidden_origin'
  | 'text_empty'
  | 'text_too_long'
  | string;

export class AiTranslateClientError extends Error {
  constructor(
    public readonly code: AiTranslateError,
    message: string,
    public readonly status?: number,
    public readonly reason?: string,
    public readonly requestId?: string,
    public readonly durationMs?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AiTranslateClientError';
  }
}
export function aiFailureAction(code?:string):'keys'|'settings'|undefined{
  if(code==='ai_auth_error'||code==='ai_not_configured')return 'keys';
  if(code&&['ai_request_rejected','invalid_prompt','prompt_too_large','ai_invalid_model','invalid_request','invalid_names','invalid_temperature'].includes(code))return 'settings';
}

const FRIENDLY: Record<string, string> = {
  ai_untranslated_result:'AI còn để nguyên một đoạn tiếng Trung. Các phần đã dịch được giữ; hãy thử tiếp.',
  ai_request_rejected:'Model từ chối cấu hình yêu cầu. Kiểm tra prompt và model trước khi thử lại.',
  prompt_too_large:'Toàn bộ mẫu vượt giới hạn dịch kết hợp. Giữ tiến độ; hãy chọn chế độ thường cho chương này.',
  ai_invalid_response: 'Phản hồi dịch không hợp lệ. Thử lại sau.',
  ai_network_error: 'Không kết nối được dịch vụ dịch. Kiểm tra mạng rồi thử lại.',
  ai_gateway_error: 'Máy chủ trung gian chưa trả được bản dịch. Thử lại sau.',
  ai_response_too_large: 'Phản hồi dịch vượt giới hạn kích thước.',
  ai_location_unavailable: 'Google chưa hỗ trợ vị trí máy chủ hiện tại. Cần đổi tuyến máy chủ được hỗ trợ.',
  ai_incomplete_result: 'Gemini chưa dịch trọn vẹn. Không hiển thị bản bị cắt; thử đoạn ngắn hơn.',
  invalid_prompt: 'Prompt không hợp lệ. User Prompt phải chứa {{text}}.',
  ai_not_configured: 'Chức năng dịch AI chưa được cấu hình trên server.',
  ai_rate_limited: 'API đang bận, vui lòng thử lại sau ít phút.',
  ai_timeout: 'Yêu cầu dịch quá thời gian. Thử đoạn ngắn hơn hoặc thử lại.',
  ai_upstream_error: 'Server Gemini trả lỗi. Thử lại sau.',
  ai_auth_error: 'API key không hợp lệ hoặc hết hạn. Liên hệ quản trị.',
  ai_empty_result: 'Gemini trả kết quả rỗng (bị chặn bởi safety filter hoặc finishReason khác STOP).',
  forbidden_origin: 'Yêu cầu bị từ chối (origin không hợp lệ).',
  text_empty: 'Văn bản dịch không được để trống.',
  text_too_long: 'Văn bản quá dài (tối đa 32.000 ký tự).',
};
const SERVER_ERROR_CODES = new Set([...Object.keys(FRIENDLY), 'ai_cancelled', 'ai_invalid_model',
  'invalid_content_type', 'invalid_json', 'invalid_names', 'invalid_request', 'invalid_temperature',
  'request_too_large', 'method_not_allowed']);
const SERVER_FAILURE_REASONS = new Set(['untranslated_source','output_limit','request_validation', 'not_configured', 'upstream_content_type',
  'upstream_invalid_json', 'upstream_body_read', 'upstream_schema', 'upstream_candidates', 'upstream_parts',
  'upstream_usage', 'upstream_finish_reason', 'upstream_empty_result', 'size_limit', 'upstream_http',
  'timeout', 'cancelled', 'network']);

export function friendlyAiError(code: string): string {
  if (code.startsWith('ai_empty_result:'))
    return `Gemini trả kết quả rỗng (${code.slice('ai_empty_result:'.length)}).`;
  return FRIENDLY[code] ?? `Lỗi dịch AI: ${code}`;
}

export function assertAiTranslationCoverage(input:AiTranslateClientRequest,result:AiTranslateClientResponse):void{
  const source=[input.text,input.context??'',input.continuation?.version===3?input.continuation.firstHalfSource:''].join('\n');
  if(hasCopiedSource(source,result.result,Object.values(input.names??{})))throw new AiTranslateClientError('ai_untranslated_result',friendlyAiError('ai_untranslated_result'),502,'untranslated_source');
}

export async function aiTranslate(
  req: AiTranslateClientRequest,
  signal?: AbortSignal,
  onLease?: (lease: AiLeaseInfo) => void,
): Promise<AiTranslateClientResponse> {
  // Legacy JSON keeps its 40s watchdog. Negotiated activity has separate first,
  // idle and hard bounds; empty transport bytes never extend the idle deadline.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  let abort!: () => void;
  let activity!:(phase?:'progress'|'legacy')=>void;
  const startedAt=Date.now();
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => {
      controller.abort();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const expire=() => {
      controller.abort();
      reject(new AiTranslateClientError('ai_timeout', friendlyAiError('ai_timeout'), undefined, 'client_deadline'));
    };
    timer=setTimeout(expire,AI_STREAM_FIRST_MS+AI_STREAM_CLIENT_GRACE_MS);
    activity=(phase='progress')=>{clearTimeout(timer);const remaining=phase==='legacy'?40_000-(Date.now()-startedAt):AI_STREAM_IDLE_MS+AI_STREAM_CLIENT_GRACE_MS;if(remaining<=0)expire();else timer=setTimeout(expire,remaining);};
    hardTimer=setTimeout(expire,AI_STREAM_TOTAL_MS+15_000);
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) abort();
  });
  try {
    return await Promise.race([translateResponse(req, controller.signal,activity,onLease), cancelled]);
  } finally {
    clearTimeout(timer);
    clearTimeout(hardTimer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Accept only delta-seconds or an HTTP date; never retain the raw header. */
export function parseAiRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed) * 1000;
    return Number.isSafeInteger(ms) && ms <= Number.MAX_SAFE_INTEGER - now ? ms : undefined;
  }
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(trimmed)) return undefined;
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

async function translateResponse(req: AiTranslateClientRequest, signal: AbortSignal,activity:(phase?:'progress'|'legacy')=>void,onLease?:(lease:AiLeaseInfo)=>void): Promise<AiTranslateClientResponse> {
  if(req.continuation||req.addressingRules!==undefined){
    if(req.continuation&&!validContinuation(req.continuation)||!hybridTemplateValid(req.userPromptTemplate??'{{text}}')||req.addressingRules!==undefined&&(typeof req.addressingRules!=='string'||req.addressingRules.length>2000))throw new AiTranslateClientError('invalid_prompt','Dịch kết hợp cần đúng một {{text}} và toàn bộ mẫu hợp lệ.');
    if(aiUserPromptPreview(req).length+(req.systemPrompt?.length??0)>128000||new TextEncoder().encode(JSON.stringify(req)).byteLength>256*1024)throw new AiTranslateClientError('prompt_too_large','Toàn bộ mẫu vượt giới hạn dịch kết hợp. Giữ tiến độ; hãy chọn chế độ thường cho chương này.');
  }
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  let res: Response;
  try { res = await fetch('/api/ai/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json','Accept':AI_STREAM_TYPE },
    body: JSON.stringify(req),
    signal,
  }); } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new AiTranslateClientError('ai_network_error', friendlyAiError('ai_network_error'));
  }
  if (signal.aborted) {
    void res.body?.cancel().catch(() => {});
    throw new DOMException('Cancelled', 'AbortError');
  }
  let notifiedLease=false;
  const notifyLease=(lease:AiLeaseInfo)=>{if(notifiedLease)return;notifiedLease=true;onLease?.(lease);};
  if(res.ok&&res.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()===AI_STREAM_TYPE){
    // The first-activity deadline starts at send time, not at delayed headers.
    try{res=await readAiStreamResponse(res,signal,()=>activity(),lease=>notifyLease(lease));}
    catch(error){if(signal.aborted)throw new DOMException('Cancelled','AbortError');throw new AiTranslateClientError('ai_network_error',friendlyAiError('ai_network_error'),undefined,'body_stream');}
  }else activity('legacy');
  if(signal.aborted){void res.body?.cancel().catch(()=>{});throw new DOMException('Cancelled','AbortError');}
  const rawId = res.headers.get('x-ai-request-id');
  const requestId = rawId && /^[a-f0-9-]{36}$/.test(rawId) ? rawId : undefined;
  const rawDuration = res.headers.get('x-ai-duration-ms');
  const durationMs = rawDuration && /^\d{1,10}$/.test(rawDuration) && Number(rawDuration) <= 2_147_483_647 ? Number(rawDuration) : undefined;
  const rawReason = res.headers.get('x-ai-failure-reason');
  const serverReason = rawReason && SERVER_FAILURE_REASONS.has(rawReason) ? rawReason : undefined;
  const rawLease = res.headers.get('x-ai-lease-id-hash');
  const leaseIdHash = rawLease && /^[a-f0-9]{16,64}$/.test(rawLease) ? rawLease : undefined;
  const rawSlot = res.headers.get('x-ai-key-slot');
  const keySlot = rawSlot && /^\d{1,2}$/.test(rawSlot) && Number(rawSlot) >= 1 && Number(rawSlot) <= 32 ? Number(rawSlot) : undefined;
  const rawAvailable = res.headers.get('x-ai-keys-available');
  const keysAvailable = rawAvailable && /^\d{1,2}$/.test(rawAvailable) && Number(rawAvailable) <= 32 ? Number(rawAvailable) : undefined;
  const debug:AiLeaseInfo|undefined = requestId && leaseIdHash ? {requestId,leaseIdHash,...(keySlot!==undefined?{keySlot}:{}),...(keysAvailable!==undefined?{keysAvailable}:{})} : undefined;
  if(debug)notifyLease(debug);
  const retryAfterMs = res.status === 429 ? parseAiRetryAfter(res.headers.get('retry-after')) : undefined;
  const fail = (code: string, reason?: string): never => {
    throw new AiTranslateClientError(code, friendlyAiError(code), res.status, reason, requestId, durationMs, retryAfterMs);
  };
  const httpCode = res.status === 429 ? 'ai_rate_limited'
    : res.status === 408 || res.status === 504 ? 'ai_timeout'
    : res.status === 401 || res.status === 403 ? 'ai_auth_error' : 'ai_gateway_error';
  const type = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') {
    void res.body?.cancel().catch(() => {});
    return fail(res.ok ? 'ai_invalid_response' : httpCode, 'content_type');
  }
  let data: unknown;
  const reader = res.body?.getReader();
  if (!reader) return fail(res.ok ? 'ai_invalid_response' : httpCode, 'empty_body');
  const cancelBody = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancelBody, {once: true});
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (value) {
        size += value.byteLength;
        if (size > 1024 * 1024) {
          void reader.cancel().catch(() => {});
          return fail('ai_response_too_large', 'size');
        }
        chunks.push(value);
      }
      if (done) break;
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
    catch { return fail(res.ok ? 'ai_invalid_response' : httpCode, 'json'); }
  } catch (error) {
    if (error instanceof AiTranslateClientError || signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    return fail('ai_network_error', 'body_stream');
  } finally { signal.removeEventListener('abort', cancelBody); reader.releaseLock(); }
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const record = typeof data === 'object' && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown> : undefined;
  if (!res.ok) {
    // Never echo an arbitrary gateway body or provider message into the UI.
    const code = typeof record?.error === 'string' && SERVER_ERROR_CODES.has(record.error)
      ? record.error : httpCode;
    return fail(code, serverReason ?? 'http');
  }
  if (!record) return fail('ai_invalid_response', 'schema');
  if (record.finishReason !== 'STOP') return fail('ai_incomplete_result', 'finish_reason');
  if (typeof record.result !== 'string') return fail('ai_invalid_response', 'result_type');
  if (!record.result.trim()) return fail('ai_empty_result', 'empty_result');
  if (req.continuation?record.model!==req.model:(normalizeAiModel(record.model) ?? record.model) !== (normalizeAiModel(req.model) ?? req.model ?? DEFAULT_AI_MODEL)) return fail('ai_invalid_response', 'model');
  for (const field of ['inputTokens', 'outputTokens']) {
    if (!Number.isInteger(record[field]) || (record[field] as number) < 0 || (record[field] as number) > 1_000_000)
      return fail('ai_invalid_response', 'usage');
  }
  const completed={result: record.result, model: record.model as string, finishReason: 'STOP',
    inputTokens: record.inputTokens as number, outputTokens: record.outputTokens as number,...(res.headers.get('X-AI-Parallel')==='2'?{parallel:2 as const}:{}),...(debug?{debug}:{})};
  try{assertAiTranslationCoverage(req,completed);}catch(error){if(error instanceof AiTranslateClientError)return fail(error.code,error.reason??'untranslated_source');throw error;}
  return completed;
}

/** Tóm gọn Names truyện cho request (chỉ gửi names match đoạn văn để giảm token). */
export function filterNamesForText(
  text: string,
  names: { key: string; value: string }[],
): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const { key, value } of names) {
    const sourceKey=nameSourceKey(key),label=parseNameValue(value).label;
    if (sourceKey && label && text.includes(sourceKey)) {
      result[sourceKey] = label;
    }
  }
  return result;
}
