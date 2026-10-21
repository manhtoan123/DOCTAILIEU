import {AiTranslateClientError, friendlyAiError} from './ai-translate';

const MAX_AUTO_WAIT_MS = 30_000;
const TRANSIENT_REASONS = new Set(['content_type', 'json', 'empty_body', 'body_stream',
  'upstream_content_type', 'upstream_invalid_json', 'upstream_body_read']);
const PERMANENT_REASONS = new Set(['schema', 'result_type', 'model', 'usage', 'finish_reason', 'empty_result',
  'upstream_schema', 'upstream_candidates', 'upstream_parts', 'upstream_usage', 'upstream_finish_reason',
  'upstream_empty_result', 'request_validation', 'not_configured', 'size_limit', 'size', 'cancelled']);
const PERMANENT_CODES = new Set(['ai_untranslated_result','ai_request_rejected','ai_recovery_exhausted','ai_auth_error', 'ai_empty_result', 'ai_incomplete_result',
  'ai_not_configured', 'ai_location_unavailable', 'ai_response_too_large', 'ai_cancelled', 'ai_invalid_model',
  'forbidden_origin', 'text_empty', 'text_too_long', 'invalid_prompt', 'invalid_content_type', 'invalid_json',
  'invalid_names', 'invalid_request', 'invalid_temperature', 'request_too_large', 'method_not_allowed']);

export function isTransientAiFailure(error: unknown): error is AiTranslateClientError {
  if (!(error instanceof AiTranslateClientError)) return false;
  if (PERMANENT_CODES.has(error.code) || PERMANENT_REASONS.has(error.reason ?? '')) return false;
  if (error.status === 401 || error.status === 403) return false;
  if (error.status === 429 || error.code === 'ai_rate_limited') return true;
  if (error.status !== undefined && error.status >= 400 && error.status < 500 && error.status !== 408) return false;
  // A 5xx stays retryable even when the safe reason is missing or unknown; the
  // explicit permanent reasons above still win.
  if (error.code === 'ai_invalid_response') return TRANSIENT_REASONS.has(error.reason ?? '')
    || (error.status !== undefined && error.status >= 500 && error.status <= 599);
  return error.code === 'ai_network_error' || error.code === 'ai_timeout' || error.code === 'ai_gateway_error'
    || (error.status !== undefined && error.status >= 500 && error.status <= 599);
}

function cancelled() { return new DOMException('Cancelled', 'AbortError'); }
export function waitForAiConnection(signal:AbortSignal):Promise<void>{
  if(signal.aborted)return Promise.reject(cancelled());
  if(typeof window==='undefined'||typeof navigator==='undefined'||navigator.onLine!==false)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const clean=()=>{window.removeEventListener('online',online);signal.removeEventListener('abort',abort);};
    const online=()=>{clean();resolve();},abort=()=>{clean();reject(cancelled());};
    window.addEventListener('online',online);signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted)abort();else if(navigator.onLine!==false)online();
  });
}
export function waitForAiRetry(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(cancelled()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, {once: true});
  });
}

/** Session-local quota restraint, keyed by selected model, with no credential rotation. */
export class AiRecovery {
  private cooldowns = new Map<string, number>();

  async run<T>(model: string, signal: AbortSignal, send: () => Promise<T>, retryTimeout=true,maxRetries=2,onQuota?:(delay:number)=>void): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) throw cancelled();
      // Recheck after waiting: another job may extend this model's cooldown.
      for (;;) {
        if(typeof navigator!=='undefined'&&navigator.onLine===false)await waitForAiConnection(signal);
        if(signal.aborted)throw cancelled();
        const remaining = (this.cooldowns.get(model) ?? 0) - Date.now();
        if (remaining <= 0) break;
        onQuota?.(remaining);
        if (remaining > MAX_AUTO_WAIT_MS) throw new AiTranslateClientError('ai_rate_limited',
          friendlyAiError('ai_rate_limited'), 429, 'cooldown', undefined, undefined, remaining);
        await waitForAiRetry(remaining, signal);
      }
      if (signal.aborted) throw cancelled();
      try { return await send(); }
      catch (error) {
        if (signal.aborted) throw cancelled();
        if (!isTransientAiFailure(error)) throw error;
        // Long requests recover by splitting immediately, rather than timing out
        // three times with the identical source. Short chunks retain bounded retries.
        if(!retryTimeout&&(error.code==='ai_timeout'||error.status===408))throw error;
        const rateLimited = error.status === 429 || error.code === 'ai_rate_limited';
        if (rateLimited) {
          const delay = error.retryAfterMs ?? MAX_AUTO_WAIT_MS;
          this.cooldowns.set(model, Math.max(this.cooldowns.get(model) ?? 0, Date.now() + delay));
          onQuota?.(delay);
        }
        if (attempt >= maxRetries || (this.cooldowns.get(model) ?? 0) - Date.now() > MAX_AUTO_WAIT_MS) throw error;
        // Retry fast: transient blips rarely need seconds of backoff, and attempts stay bounded (2 extra).
        await waitForAiRetry((attempt === 0 ? 600 : 2500) + Math.floor(Math.random() * 251), signal);
      }
    }
  }
}
