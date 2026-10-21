import {afterEach, describe, expect, it, vi} from 'vitest';
import {aiTranslate} from '../src/features/ai/services/ai-translate';
import {DEFAULT_AI_MODEL} from '../src/features/ai/types/ai-models';

const req = {text: '林儿推开窗。'};
const valid = {result: 'Lâm Nhi mở cửa sổ.', model: DEFAULT_AI_MODEL, finishReason: 'STOP', inputTokens: 3, outputTokens: 4};
function respond(response: Response) { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response)); }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('AI client response classification', () => {
  it('bounds a fetch that ignores abort and cancels its late body', async () => {
    vi.useFakeTimers(); let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => {finish = resolve;})));
    const rejected = aiTranslate(req).catch(error => error);
    await vi.advanceTimersByTimeAsync(70_000);
    expect(await rejected).toMatchObject({code:'ai_timeout',reason:'client_deadline'});
    const cancel = vi.fn();
    finish(new Response(new ReadableStream({cancel}), {headers:{'Content-Type':'application/json'}}));
    await Promise.resolve(); await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds stalled response body and releases/cancels the stream', async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    const stream = new ReadableStream({cancel});
    respond(new Response(stream,{headers:{'Content-Type':'application/json'}}));
    const rejected = aiTranslate(req).catch(error => error);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(await rejected).toMatchObject({code:'ai_timeout',reason:'client_deadline'});
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false);
  });
  it('external abort immediately settles a fetch that ignores its signal', async () => {
    vi.useFakeTimers(); const controller = new AbortController();
    vi.stubGlobal('fetch',vi.fn(() => new Promise(() => {})));
    const rejected = aiTranslate(req,controller.signal).catch(error => error);
    controller.abort(); expect(await rejected).toMatchObject({name:'AbortError'});
    expect(vi.getTimerCount()).toBe(0);
  });
  it('external abort cancels a stalled body without waiting for the deadline', async () => {
    vi.useFakeTimers(); const controller = new AbortController(), cancel = vi.fn();
    respond(new Response(new ReadableStream({cancel}),{headers:{'Content-Type':'application/json'}}));
    const rejected = aiTranslate(req,controller.signal).catch(error => error);
    await Promise.resolve();controller.abort();
    expect(await rejected).toMatchObject({name:'AbortError'});
    expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('clears deadline on success, and validates diagnostic headers on errors', async () => {
    vi.useFakeTimers();respond(Response.json(valid));await aiTranslate(req);
    expect(vi.getTimerCount()).toBe(0);
    respond(Response.json({error:'ai_invalid_response'}, {status:502,headers:{'x-ai-request-id':'12345678-1234-1234-1234-123456789abc','x-ai-duration-ms':'100'}}));
    await expect(aiTranslate(req)).rejects.toMatchObject({requestId:'12345678-1234-1234-1234-123456789abc',durationMs:100});
    expect(vi.getTimerCount()).toBe(0);
  });
  it('drops arbitrary diagnostic header text', async () => {
    respond(Response.json({error:'ai_invalid_response'}, {status:502,headers:{'x-ai-request-id':'private body','x-ai-duration-ms':'NaN'}}));
    const error = await aiTranslate(req).catch(error => error);
    expect(error.requestId).toBeUndefined(); expect(error.durationMs).toBeUndefined();
  });
  it('exposes only an allowlisted server failure reason', async () => {
    respond(Response.json({error:'ai_invalid_response'}, {status:502,headers:{'x-ai-failure-reason':'upstream_parts'}}));
    await expect(aiTranslate(req)).rejects.toMatchObject({reason:'upstream_parts'});
    respond(Response.json({error:'ai_invalid_response'}, {status:502,headers:{'x-ai-failure-reason':'private text'}}));
    await expect(aiTranslate(req)).rejects.toMatchObject({reason:'http'});
  });
  it.each(['size','content_type'])('does not wait for a hung stream cancellation on %s failure', async kind => {
    vi.useFakeTimers(); const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream({start(c) {if(kind==='size')c.enqueue(new Uint8Array(1024*1024+1));}, cancel});
    respond(new Response(stream,{headers:{'Content-Type':kind==='size'?'application/json':'text/html'}}));
    await expect(aiTranslate(req)).rejects.toMatchObject({code:kind==='size'?'ai_response_too_large':'ai_invalid_response'});
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false);expect(vi.getTimerCount()).toBe(0);
  });
  it('returns only a validated complete translation', async () => {
    respond(Response.json({...valid, unwanted: 'ignored'}));
    expect(await aiTranslate(req)).toEqual(valid);
  });
  it.each([[200, 'ai_invalid_response'], [502, 'ai_gateway_error'], [503, 'ai_gateway_error'], [504, 'ai_timeout'], [429, 'ai_rate_limited']])('classifies HTML HTTP %s without exposing its body', async (status, code) => {
    respond(new Response('<html>PRIVATE PROVIDER BODY</html>', {status, headers: {'Content-Type': 'text/html'}}));
    await expect(aiTranslate(req)).rejects.toMatchObject({code, status, reason: 'content_type'});
  });
  it.each([200, 502])('classifies truncated JSON HTTP %s', async status => {
    respond(new Response('{"result":', {status, headers: {'Content-Type': 'application/json'}}));
    await expect(aiTranslate(req)).rejects.toMatchObject({code: status === 200 ? 'ai_invalid_response' : 'ai_gateway_error', reason: 'json'});
  });
  it.each([
    [null, 'ai_invalid_response', 'schema'],
    [{...valid, finishReason: 'MAX_TOKENS'}, 'ai_incomplete_result', 'finish_reason'],
    [{...valid, result: '  '}, 'ai_empty_result', 'empty_result'],
    [{...valid, result: 1}, 'ai_invalid_response', 'result_type'],
    [{...valid, model: 'wrong'}, 'ai_invalid_response', 'model'],
    [{...valid, inputTokens: -1}, 'ai_invalid_response', 'usage'],
    [{...valid, outputTokens: 1.2}, 'ai_invalid_response', 'usage'],
  ])('rejects malformed completed envelope %#', async (data, code, reason) => {
    respond(Response.json(data));
    await expect(aiTranslate(req)).rejects.toMatchObject({code, reason});
  });
  it('preserves a safe server error code', async () => {
    respond(Response.json({error: 'ai_location_unavailable'}, {status: 503}));
    await expect(aiTranslate(req)).rejects.toMatchObject({code: 'ai_location_unavailable', reason: 'http'});
  });
  it('does not expose arbitrary server text', async () => {
    respond(Response.json({error: 'private text <secret>'}, {status: 502}));
    await expect(aiTranslate(req)).rejects.toMatchObject({code: 'ai_gateway_error'});
  });
  it('does not echo even identifier-shaped unknown provider text', async () => {
    respond(Response.json({error: 'private_provider_value'}, {status: 502}));
    await expect(aiTranslate(req)).rejects.toMatchObject({code: 'ai_gateway_error'});
  });
  it('rejects an oversized response and cancels its stream', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({start(c) {c.enqueue(new Uint8Array(1024 * 1024 + 1));}, cancel});
    respond(new Response(stream, {headers: {'Content-Type': 'application/json'}}));
    await expect(aiTranslate(req)).rejects.toMatchObject({code: 'ai_response_too_large'});
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('classifies network failure without retrying', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetch);
    await expect(aiTranslate(req)).rejects.toMatchObject({code: 'ai_network_error'});
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('preserves cancellation rather than classifying it as network failure', async () => {
    const error = new DOMException('Cancelled', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    await expect(aiTranslate(req)).rejects.toBe(error);
  });
  it('rejects an aborted late successful response', async () => {
    const controller = new AbortController(); controller.abort();
    respond(Response.json(valid));
    await expect(aiTranslate(req, controller.signal)).rejects.toMatchObject({name: 'AbortError'});
  });
  it('classifies a broken response stream', async () => {
    respond(new Response(new ReadableStream({start(c) {c.error(new Error('disconnected'));}}), {headers: {'Content-Type': 'application/json'}}));
    await expect(aiTranslate(req)).rejects.toMatchObject({code: 'ai_network_error', reason: 'body_stream'});
  });
  it('accepts a mapped or aliased model for a removed id instead of failing the open tab', async () => {
    respond(Response.json({...valid, model: DEFAULT_AI_MODEL}));
    expect(await aiTranslate({text: req.text, model: 'gemini-3.5-flash-lite'})).toMatchObject({model: DEFAULT_AI_MODEL});
    respond(Response.json({...valid, model: 'gemini-3.5-flash-lite'}));
    expect(await aiTranslate({text: req.text, model: 'gemini-3.5-flash-lite'})).toMatchObject({model: 'gemini-3.5-flash-lite'});
  });
  it('still rejects a response for a different listed model', async () => {
    respond(Response.json({...valid, model: 'gemini-3.8-flash'}));
    await expect(aiTranslate({text: req.text, model: 'gemini-2.5-flash'})).rejects.toMatchObject({code: 'ai_invalid_response', reason: 'model'});
  });
});
