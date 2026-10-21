import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAiTranslate, resetAiKeyState } from '../server/ai-translate';
import { DEFAULT_AI_MODEL } from '../src/features/ai/types/ai-models';

const env = { GEMINI_API_KEY: 'private-key-marker' };
const endpoint = 'https://reader.example/api/ai/translate';
const valid = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Translation.' }] } }] };
function request(signal?: AbortSignal) {
  return new Request(endpoint, { method: 'POST', signal, headers: {
    'Content-Type': 'application/json', 'X-AI-Request-ID': 'forged-private-id',
    'X-AI-Failure-Reason': 'forged-private-reason', 'X-AI-Duration-Ms': '999999999999',
  }, body: JSON.stringify({ text: 'private-source-marker', systemPrompt: 'private-prompt-marker' }) });
}
function diagnostics(response: Response, reason?: string) {
  expect(response.headers.get('X-AI-Request-ID')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const ms = response.headers.get('X-AI-Duration-Ms');
  expect(ms).toMatch(/^\d{1,10}$/);
  expect(Number(ms)).toBeLessThanOrEqual(2147483647);
  expect(response.headers.get('Server-Timing')).toBe(`total;dur=${ms}`);
  expect(response.headers.get('X-AI-Failure-Reason')).toBe(reason ?? null);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  const allHeaders = [...response.headers].flat().join(' ');
  for (const value of ['private-source-marker', 'private-prompt-marker', env.GEMINI_API_KEY, 'forged-private', 'provider-secret']) {
    expect(allHeaders).not.toContain(value);
  }
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); resetAiKeyState(); });

describe('AI server safe response diagnostics', () => {
  it.each([['120','120'], ['private-provider-body',null], ['9999999999',null]])('passes only safe quota Retry-After %s',async(hint,expected)=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('private provider',{status:429,headers:{'Retry-After':hint}}));
    const response=await handleAiTranslate(request(),env);
    expect(response.headers.get('Retry-After')).toBe(expected);
    expect(await response.json()).toEqual({error:'ai_rate_limited'});
  });
  it('keeps success body and selected model, creates independent IDs, and ignores foreign headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(valid, { headers: { 'X-AI-Request-ID': 'provider-secret', 'X-AI-Failure-Reason': 'provider-secret' } }));
    // One configured key means only one lease can be live at a time: the second diagnostics probe is sequential.
    const first = await handleAiTranslate(request(), env);
    const second = await handleAiTranslate(request(), env);
    for (const response of [first, second]) {
      diagnostics(response);
      expect(await response.json()).toEqual({ result: 'Translation.', model: DEFAULT_AI_MODEL, finishReason: 'STOP', inputTokens: 0, outputTokens: 0 });
    }
    expect(first.headers.get('X-AI-Request-ID')).not.toBe(second.headers.get('X-AI-Request-ID'));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['<html>provider-secret</html>', 'text/html', 'upstream_content_type'],
    ['{"provider-secret":', 'application/json', 'upstream_invalid_json'],
    ['provider-secret', null, 'upstream_invalid_json'],
  ])('categorizes failed JSON safely (%s)', async (body, contentType, reason) => {
    const response = new Response(body);
    response.headers.delete('Content-Type');
    if (contentType) response.headers.set('Content-Type', contentType);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const result = await handleAiTranslate(request(), env);
    diagnostics(result, reason);
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: 'ai_invalid_response' });
  });

  it.each([
    [null, 'upstream_schema', 'ai_invalid_response'],
    [{}, 'upstream_candidates', 'ai_invalid_response'],
    [{ candidates: [null] }, 'upstream_candidates', 'ai_invalid_response'],
    [{ candidates: [valid.candidates[0], valid.candidates[0]] }, 'upstream_candidates', 'ai_invalid_response'],
    [{ candidates: [{ finishReason: 'provider-secret' }] }, 'upstream_finish_reason', 'ai_incomplete_result'],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: 'provider-secret' } }] }, 'upstream_parts', 'ai_invalid_response'],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'provider-secret', thought: true }] } }] }, 'upstream_empty_result', 'ai_empty_result'],
    [{ ...valid, usageMetadata: 'provider-secret' }, 'upstream_usage', 'ai_invalid_response'],
    [{ ...valid, usageMetadata: { candidatesTokenCount: 'provider-secret' } }, 'upstream_usage', 'ai_invalid_response'],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [] } }] }, 'upstream_empty_result', 'ai_empty_result'],
  ])('categorizes envelope failure without changing error body (%j)', async (body, reason, error) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body));
    const response = await handleAiTranslate(request(), env);
    diagnostics(response, reason);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error });
  });

  it('keeps valid JSON accepted without a JSON MIME header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(valid)));
    const response = await handleAiTranslate(request(), env);
    diagnostics(response);
    expect(response.status).toBe(200);
  });

  it('provides headers on validation and configuration errors before fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const [req, config, status, error, reason] of [
      [new Request(endpoint), env, 405, 'method_not_allowed', 'request_validation'],
      [request(), {}, 503, 'ai_not_configured', 'not_configured'],
    ] as const) {
      const response = await handleAiTranslate(req, config);
      diagnostics(response, reason);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps network and upstream HTTP diagnostics categorical', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('provider-secret'))
      .mockResolvedValueOnce(new Response('provider-secret', { status: 429 }));
    const network = await handleAiTranslate(request(), env);
    diagnostics(network, 'network');
    expect(await network.json()).toEqual({ error: 'ai_network_error' });
    const http = await handleAiTranslate(request(), env);
    diagnostics(http, 'upstream_http');
    expect(await http.json()).toEqual({ error: 'ai_rate_limited' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each(['deadline', 'cancel'] as const)('preserves stalled-body cleanup on %s', async mode => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const controller = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const pending = handleAiTranslate(request(controller.signal), env);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    if (mode === 'deadline') await vi.advanceTimersByTimeAsync(30000);
    else controller.abort();
    const response = await pending;
    diagnostics(response, mode === 'deadline' ? 'timeout' : 'cancelled');
    expect(response.status).toBe(mode === 'deadline' ? 504 : 499);
    expect(await response.json()).toEqual({ error: mode === 'deadline' ? 'ai_timeout' : 'ai_cancelled' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps body read failures sanitized and cancels oversized bodies', async () => {
    const cancel = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new Uint8Array([255])))
      .mockResolvedValueOnce(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1024 * 1024 + 1)); }, cancel })));
    const invalid = await handleAiTranslate(request(), env);
    diagnostics(invalid, 'upstream_body_read');
    expect(await invalid.json()).toEqual({ error: 'ai_invalid_response' });
    const oversize = await handleAiTranslate(request(), env);
    diagnostics(oversize, 'size_limit');
    expect(await oversize.json()).toEqual({ error: 'ai_response_too_large' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('observes read rejection when request is already aborted and releases the body', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    const cancel = vi.fn();
    const req = new Request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: controller.signal, body: new ReadableStream({ cancel }), duplex: 'half' } as RequestInit);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const response = await handleAiTranslate(req, env);
    diagnostics(response, 'cancelled');
    expect(response.status).toBe(499);
    expect(await response.json()).toEqual({ error: 'ai_cancelled' });
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(req.body?.locked).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes abort listener immediately even if upstream fetch never settles', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const pending = handleAiTranslate(request(), env);
    await vi.waitFor(() => expect(signal).toBeDefined());
    const removed = vi.spyOn(signal!, 'removeEventListener');
    await vi.advanceTimersByTimeAsync(30000);
    const response = await pending;
    diagnostics(response, 'timeout');
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
