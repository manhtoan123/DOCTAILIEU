import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleAiTranslate, resetAiKeyState, AI_BENCHMARK_MODELS } from '../server/ai-translate';
import { AI_MODELS, DEFAULT_AI_MODEL } from '../src/features/ai/types/ai-models';
import { filterNamesForText, friendlyAiError, AiTranslateClientError } from '../src/features/ai/services/ai-translate';

const TOKEN = 'a'.repeat(64);
const VALID_ENV = { GEMINI_API_KEY: 'synthetic-key-only' };
const URL = 'https://reader.example/api/ai/translate';
function makeRequest(body: unknown = { text: '你好' }, options: { token?: string; origin?: string; signal?: AbortSignal } = {}) {
  return new Request(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(options.origin !== undefined ? { Origin: options.origin } : {}), ...(options.token !== undefined ? { Authorization: `Bearer ${options.token}` } : {}) }, body: JSON.stringify(body), signal: options.signal });
}
const validResult = { candidates: [{ content: { parts: [{ text: 'Xin chào.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };
function mockFetch(status = 200, body: unknown = validResult) { return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status })); }
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); resetAiKeyState(); });

 describe('Public AI access and input validation', () => {
  it.each([undefined, '', 'null', 'https://reader.example/forged-path', 'https://other.example'])('accepts valid anonymous input with origin %s and no capability hash', async origin => {
    const spy = mockFetch();
    const response = await handleAiTranslate(makeRequest(undefined, { origin }), VALID_ENV);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: 'Xin chào.', finishReason: 'STOP' });
    expect(spy).toHaveBeenCalledOnce();
  });
  it.each([TOKEN, 'b'.repeat(64), '', 'A'.repeat(64), 'short'])('ignores obsolete credentials %s', async token => {
    const spy = mockFetch();
    expect((await handleAiTranslate(makeRequest(undefined, { token, origin: 'https://other.example' }), VALID_ENV)).status).toBe(200);
    expect(spy).toHaveBeenCalledOnce();
  });
  it('does not depend on obsolete capability digest, cookies, or URL tokens', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(validResult)));
    for (const hash of [undefined, '', 'bad', 'A'.repeat(64)]) {
      const env = { ...VALID_ENV, CLOUD_ACCESS_TOKEN_HASH: hash };
      const req = new Request(`${URL}?token=${TOKEN}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `__Host-session=${TOKEN}` }, body: '{"text":"你好"}' });
      expect((await handleAiTranslate(req, env)).status).toBe(200);
    }
    expect(spy).toHaveBeenCalledTimes(4);
  });
  it.each([undefined, 'https://other.example'])('rejects invalid input with origin %s before upstream', async origin => {
    const spy = mockFetch();
    const response = await handleAiTranslate(makeRequest({ text: '' }, { origin, token: 'obsolete' }), VALID_ENV);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'text_empty' });
    expect(spy).not.toHaveBeenCalled();
  });
  it('requires POST and a configured server key', async () => {
    expect((await handleAiTranslate(new Request(URL), VALID_ENV)).status).toBe(405);
    expect(await (await handleAiTranslate(makeRequest(), { ...VALID_ENV, GEMINI_API_KEY: '' })).json()).toEqual({ error: 'ai_not_configured' });
  });
  it.each([null, [], 5, {}, { text: 5 }, { text: null }, { text: {} }])('rejects malformed JSON shape %j', async body => {
    expect((await handleAiTranslate(makeRequest(body), VALID_ENV)).status).toBe(400);
  });
  it.each([
    [{ text: ' ' }, 400, 'text_empty'], [{ text: 'a'.repeat(32001) }, 413, 'text_too_long'],
    [{ text: '好', model: 'gemini-expensive-unknown' }, 400, 'ai_invalid_model'],
    [{ text: '好', model: '../path' }, 400, 'ai_invalid_model'],
    [{ text: '好', temperature: null }, 400, 'invalid_temperature'],
    [{ text: '好', temperature: 3 }, 400, 'invalid_temperature'],
    [{ text: '好', systemPrompt: 'x'.repeat(8001) }, 400, 'invalid_prompt'],
    [{ text: '好', userPromptTemplate: 'missing' }, 400, 'invalid_prompt'],
    [{ text: '好', names: [] }, 400, 'invalid_names'],
    [{ text: '好', names: { name: 12 } }, 400, 'invalid_names'],
    [{ text: '好', names: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`n${i}`, 'name'])) }, 400, 'invalid_names'],
    [{ text: 'a'.repeat(32000), userPromptTemplate: '{{text}}'.repeat(5) }, 413, 'prompt_too_large'],
  ])('validates bounded fields %j', async (body, status, code) => {
    const spy = mockFetch();
    const res = await handleAiTranslate(makeRequest(body), VALID_ENV);
    expect(res.status).toBe(status); expect(await res.json()).toEqual({ error: code }); expect(spy).not.toHaveBeenCalled();
  });
  it('bounds streamed input bytes and cancels oversized stream without Content-Length', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('字'.repeat(100000))); }, cancel });
    const req = new Request(URL, { method: 'POST', headers: makeRequest().headers, body: stream, duplex: 'half' } as RequestInit);
    expect((await handleAiTranslate(req, VALID_ENV)).status).toBe(413); expect(cancel).toHaveBeenCalled();
  });
  it('rejects invalid JSON and wrong content type', async () => {
    const req = new Request(URL, { method: 'POST', headers: makeRequest().headers, body: '{bad' });
    expect((await handleAiTranslate(req, VALID_ENV)).status).toBe(400);
    const wrong = makeRequest(); wrong.headers.set('Content-Type', 'text/plain');
    expect((await handleAiTranslate(wrong, VALID_ENV)).status).toBe(415);
  });
});

describe('AI bounded upstream contract', () => {
  it.each(AI_MODELS.filter(m=>!m.id.includes('/')))('routes selected Google model $id exactly once with server-only credentials', async ({ id }) => {
    const spy = mockFetch();
    const res = await handleAiTranslate(makeRequest({ text: '你好', model: id }), VALID_ENV);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ model: id, result: 'Xin chào.', finishReason: 'STOP' });
    expect(JSON.stringify(data)).not.toContain(VALID_ENV.GEMINI_API_KEY);
    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent`);
    expect(url).not.toContain(VALID_ENV.GEMINI_API_KEY);
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': VALID_ENV.GEMINI_API_KEY });
    expect(init?.redirect).toBe('manual');
    expect(JSON.parse(init?.body as string).generationConfig.maxOutputTokens).toBe(8192);
  });
  it.each(AI_BENCHMARK_MODELS)('benchmarks exact model %s without changing legacy aliases or picker',async benchmarkModel=>{
    const spy=mockFetch();const response=await handleAiTranslate(makeRequest({text:'你好',benchmarkModel}),VALID_ENV);
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({model:benchmarkModel});
    expect(spy.mock.calls[0][0]).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${benchmarkModel}:generateContent`);
    if(benchmarkModel==='gemini-3.5-flash-lite')expect(AI_MODELS.map(row=>row.id)).toContain(benchmarkModel);else expect(AI_MODELS.map(row=>row.id)).not.toContain(benchmarkModel);
  });
  it.each([null,3,{},[], '', '../gemini-2.5-pro','gemini-2.5-pro?key=x','gemini-unknown'])('rejects benchmark ID %j before upstream',async benchmarkModel=>{
    const spy=mockFetch();const response=await handleAiTranslate(makeRequest({text:'你好',benchmarkModel}),VALID_ENV);
    expect(response.status).toBe(400);expect(await response.json()).toEqual({error:'ai_invalid_model'});expect(spy).not.toHaveBeenCalled();
  });
  it('preserves the verified default when model is omitted', async () => {
    const spy = mockFetch();
    const res = await handleAiTranslate(makeRequest(), VALID_ENV);
    expect(await res.json()).toMatchObject({ model: DEFAULT_AI_MODEL });
    expect(spy.mock.calls[0][0]).toContain(`/models/${DEFAULT_AI_MODEL}:generateContent`);
  });
  it.each([null, 3, [], {}, '', ' gemini-3.8-flash', 'Gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-3-pro-preview', 'gemini-3.1-flash-lite-preview', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-image', 'models/gemini-3.8-flash', 'gemini-3.8-flash?key=synthetic', '../gemini-3.8-flash'])('rejects unlisted model %j before contacting Google', async model => {
    const spy = mockFetch();
    const res = await handleAiTranslate(makeRequest({ text: '你好', model }), VALID_ENV);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'ai_invalid_model' });
    expect(spy).not.toHaveBeenCalled();
  });
  it.each(AI_MODELS.filter(m=>!m.id.includes('/')))('does not change Google model or retry quota failure for $id', async ({ id }) => {
    const spy = mockFetch(429, { error: { message: 'private provider diagnostic' } });
    const res = await handleAiTranslate(makeRequest({ text: '你好', model: id }), VALID_ENV);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'ai_rate_limited' });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain(`/models/${id}:generateContent`);
  });
  it.each(AI_MODELS)('keeps the input character boundary for $id', async ({ id }) => {
    const spy = mockFetch();
    const res = await handleAiTranslate(makeRequest({ text: '字'.repeat(32001), model: id }), VALID_ENV);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'text_too_long' });
    expect(spy).not.toHaveBeenCalled();
  });
  it('uses fixed model/header credential, one-pass template, and private no-store response', async () => {
    const spy = mockFetch();
    const res = await handleAiTranslate(makeRequest({ text: '你好{{name}}', names: { '你好': 'Xin chào' }, userPromptTemplate: '{{text}}', model: 'gemini-3.5-flash' }), VALID_ENV);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'Xin chào.', model: 'gemini-3.5-flash', finishReason: 'STOP', inputTokens: 10, outputTokens: 5 });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': VALID_ENV.GEMINI_API_KEY });
    expect(init?.redirect).toBe('manual');
    const payload = JSON.parse(init?.body as string);
    expect(payload.contents[0].parts[0].text).toBe('你好{{name}}');
    expect(payload.generationConfig.maxOutputTokens).toBe(8192);
  });
  it.each([[429, 429, 'ai_rate_limited'], [401, 503, 'ai_auth_error'], [403, 503, 'ai_auth_error'], [500, 502, 'ai_upstream_error']])('sanitizes upstream status %s', async (upstream, status, code) => {
    const cancel = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: upstream }));
    const res = await handleAiTranslate(makeRequest(), VALID_ENV);
    expect(res.status).toBe(status); expect(await res.json()).toEqual({ error: code }); expect(cancel).toHaveBeenCalled();
  });
  it.each([null, [], { candidates: {} }, { candidates: [null] }, { candidates: [{ finishReason: 'STOP', content: { parts: 'bad' } }] }, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 8 }] } }] }, { ...validResult, usageMetadata: { promptTokenCount: 'fake' } }])('rejects invalid response shape %j', async body => {
    mockFetch(200, body); const res = await handleAiTranslate(makeRequest(), VALID_ENV);
    expect(res.status).toBe(502); expect(await res.json()).toEqual({ error: 'ai_invalid_response' });
  });
  it.each(['MAX_TOKENS', 'SAFETY', undefined, 'unexpected-secret-project'])('rejects incomplete finish %s without echoing metadata', async finishReason => {
    mockFetch(200, { candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason }] });
    expect(await (await handleAiTranslate(makeRequest(), VALID_ENV)).json()).toEqual({ error: 'ai_incomplete_result' });
  });
  it('rejects empty STOP output and oversized result', async () => {
    for (const [text, error] of [[' ', 'ai_empty_result'], ['x'.repeat(128001), 'ai_response_too_large']]) {
      mockFetch(200, { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
      expect(await (await handleAiTranslate(makeRequest(), VALID_ENV)).json()).toEqual({ error });
    }
  });
  it('bounds streamed response bytes and cancels oversized body', async () => {
    const cancel = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(1024 * 1024 + 1)); }, cancel })));
    expect(await (await handleAiTranslate(makeRequest(), VALID_ENV)).json()).toEqual({ error: 'ai_response_too_large' });
    expect(cancel).toHaveBeenCalled();
  });
  it('sanitizes network errors containing secrets', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error(VALID_ENV.GEMINI_API_KEY));
    expect(await (await handleAiTranslate(makeRequest(), VALID_ENV)).json()).toEqual({ error: 'ai_network_error' });
  });
  it('enforces deadline after headers while reading a stalled response body', async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const pending = handleAiTranslate(makeRequest(), VALID_ENV);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(30000);
    expect(await (await pending).json()).toEqual({ error: 'ai_timeout' });
    expect(cancel).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels body when client disconnects and removes deadline timer', async () => {
    vi.useFakeTimers(); const cancel = vi.fn(); const abort = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const pending = handleAiTranslate(makeRequest(undefined, { signal: abort.signal }), VALID_ENV);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled()); abort.abort();
    const res = await pending; expect(res.status).toBe(499); expect(cancel).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts stalled fetch under the same deadline and drains its late response', async () => {
    vi.useFakeTimers(); let resolve!: (r: Response) => void; const cancel = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = handleAiTranslate(makeRequest(), VALID_ENV);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled()); await vi.advanceTimersByTimeAsync(30000);
    expect((await pending).status).toBe(504);
    resolve(new Response(new ReadableStream({ cancel }))); await Promise.resolve();
    expect(cancel).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('filterNamesForText', () => {
  it('returns only names present in text', () => {
    const names = [
      { key: '林儿', value: 'Lâm Nhi' },
      { key: '张明', value: 'Trương Minh' },
      { key: '皇帝', value: 'Hoàng Đế' },
    ];
    const result = filterNamesForText('林儿推开窗，看见张明站在院子里。', names);
    expect(result).toEqual({ '林儿': 'Lâm Nhi', '张明': 'Trương Minh' });
    expect(result['皇帝']).toBeUndefined();
  });

  it('returns empty object when no names match', () => {
    const result = filterNamesForText('你好世界', [{ key: '林儿', value: 'Lâm Nhi' }]);
    expect(result).toEqual({});
  });

  it('handles empty names array', () => {
    const result = filterNamesForText('林儿', []);
    expect(result).toEqual({});
  });
});

describe('friendlyAiError', () => {
  it('returns Vietnamese for known codes', () => {
    expect(friendlyAiError('ai_not_configured')).toContain('chưa được cấu hình');
    expect(friendlyAiError('ai_rate_limited')).toContain('bận');
    expect(friendlyAiError('text_too_long')).toContain('32.000');
  });

  it('includes finishReason for ai_empty_result:<reason>', () => {
    const msg = friendlyAiError('ai_empty_result:SAFETY');
    expect(msg).toContain('SAFETY');
  });

  it('falls back gracefully for unknown code', () => {
    const msg = friendlyAiError('totally_unknown_error');
    expect(msg).toContain('totally_unknown_error');
  });
});

describe('AiTranslateClientError', () => {
  it('is an Error with code property', () => {
    const e = new AiTranslateClientError('ai_timeout', 'Timeout', 504);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('ai_timeout');
    expect(e.status).toBe(504);
    expect(e.name).toBe('AiTranslateClientError');
  });
});


describe('safe Google 400 diagnosis',()=>{
 it.each([['User location is not supported for the API use.','ai_location_unavailable'],['API key not valid. API_KEY_INVALID','ai_auth_error']])('categorizes %s without returning its body',async(message,code)=>{
 mockFetch(400,{error:{message}});const response=await handleAiTranslate(makeRequest(),VALID_ENV);expect(response.status).toBe(503);expect(await response.json()).toEqual({error:code});
 });
});

describe('AI model allowlist change and operator key pool',()=>{
 const POOL = { GEMINI_API_KEYS: JSON.stringify([{ label: 'proj-a', key: 'synthetic-key-aaaa' }, { label: 'proj-b', key: 'synthetic-key-bbbb' }]) };
 function poolFetch() { return vi.spyOn(globalThis, 'fetch'); }
 it('reads a removed model by calling the current default and echoing the requested alias',async()=>{
   const spy = mockFetch();
   const res = await handleAiTranslate(makeRequest({ text: '你好', model: 'gemini-3.6-flash' }), VALID_ENV);
   expect(res.status).toBe(200);
   expect(await res.json()).toMatchObject({ model: 'gemini-3.6-flash' });
   expect(spy.mock.calls[0][0]).toContain(`/models/${DEFAULT_AI_MODEL}:generateContent`);
   expect(res.headers.get('X-AI-Model-Alias')).toBe(DEFAULT_AI_MODEL);
 });
 it('keeps the Gemma answer and drops its reasoning parts',async()=>{
   const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'phân tích nội bộ', thought: true }, { text: 'Lâm Nhi mở cửa.' }] } }] }));
   const res = await handleAiTranslate(makeRequest({ text: '你好', model: 'gemma-4-26b-a4b-it' }), VALID_ENV);
   expect(res.status).toBe(200);
   const body = await res.json();
   expect(body).toMatchObject({ model: 'gemma-4-26b-a4b-it', result: 'Lâm Nhi mở cửa.' });
   expect(JSON.stringify(body)).not.toContain('phân tích nội bộ');
   expect(spy.mock.calls[0][0]).toContain('/models/gemma-4-26b-a4b-it:generateContent');
   expect(JSON.parse(spy.mock.calls[0][1]?.body as string).systemInstruction).toBeDefined();
 });
 it('does not rotate keys on a non-quota upstream failure',async()=>{
   const spy = poolFetch().mockResolvedValueOnce(new Response('provider exploded', { status: 500 }));
   const res = await handleAiTranslate(makeRequest({ text: '你好' }), POOL);
   expect(res.status).toBe(502);expect(await res.json()).toEqual({ error: 'ai_upstream_error' });
   expect(spy).toHaveBeenCalledOnce();
 });
 it('gives a new credential its own state after the pool is edited',async()=>{
   const spy = poolFetch().mockResolvedValue(new Response('nope', { status: 403 }));
   const dead = { GEMINI_API_KEYS: JSON.stringify([{ label: 'old', key: 'synthetic-key-aaaa' }]) };
   expect((await handleAiTranslate(makeRequest({ text: '你好' }), dead)).status).toBe(503);
   spy.mockImplementation(async () => new Response(JSON.stringify(validResult), { status: 200 }));
   const res = await handleAiTranslate(makeRequest({ text: '你好' }), { GEMINI_API_KEYS: JSON.stringify([{ label: 'new', key: 'synthetic-key-cccc' }, { label: 'old', key: 'synthetic-key-aaaa' }]) });
   expect(res.status).toBe(200);
   expect(spy.mock.calls[1][1]?.headers).toMatchObject({ 'x-goog-api-key': 'synthetic-key-cccc' });
 });
 it('does not re-probe a key-model pair after a non-recoverable 403',async()=>{
   vi.useFakeTimers();
   try {
     const spy = poolFetch().mockResolvedValueOnce(new Response('nope', { status: 403 }));
     expect((await handleAiTranslate(makeRequest({ text: '你好' }), VALID_ENV)).status).toBe(503);
     spy.mockImplementation(async () => new Response(JSON.stringify(validResult), { status: 200 }));
     vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect((await handleAiTranslate(makeRequest({ text: '你好' }), VALID_ENV)).status).toBe(404);
    expect(spy).toHaveBeenCalledOnce();
   } finally { vi.useRealTimers(); }
 });
 it('prefers an actionable auth error when a credential is dead and no key can serve',async()=>{
   const spy = poolFetch()
     .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
     .mockResolvedValueOnce(new Response('quota', { status: 429, headers: { 'Retry-After': '30' } }));
   const res = await handleAiTranslate(makeRequest({ text: '你好' }), POOL);
   expect(res.status).toBe(503);expect(await res.json()).toEqual({ error: 'ai_auth_error' });
   expect(spy).toHaveBeenCalledTimes(2);
 });
 it('spreads simultaneous requests across pool keys instead of stacking on the first',async()=>{
   const spy = poolFetch().mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 5)); return new Response(JSON.stringify(validResult), { status: 200 }); });
   const [first, second] = await Promise.all([handleAiTranslate(makeRequest({ text: '你好' }), POOL), handleAiTranslate(makeRequest({ text: '你好' }), POOL)]);
   expect([first.status, second.status]).toEqual([200, 200]);
   expect(spy).toHaveBeenCalledTimes(2);
   const used = spy.mock.calls.map(call => (call[1]?.headers as Record<string, string>)['x-goog-api-key']);
   expect(new Set(used).size).toBe(2);
 });
 it('cancels a rotation in flight without a third attempt',async()=>{
   const controller = new AbortController();
   const spy = poolFetch()
     .mockResolvedValueOnce(new Response('quota', { status: 429, headers: { 'Retry-After': '5' } }))
     .mockImplementation(() => new Promise<Response>(() => {}));
   const pending = handleAiTranslate(makeRequest({ text: '你好' }, { signal: controller.signal }), POOL);
   await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
   controller.abort();
   expect((await pending).status).toBe(499);
   expect(spy).toHaveBeenCalledTimes(2);
 });
 it('never lets an operator label leak credential material into a public header',async()=>{
   const spy = mockFetch();
   const res = await handleAiTranslate(makeRequest({ text: '你好' }), { GEMINI_API_KEYS: JSON.stringify([{ label: 'synthetic-key-aaaa', key: 'synthetic-key-aaaa' }]) });
   expect(res.status).toBe(200);
   expect(res.headers.get('X-AI-Key-Label')).toBe('key-1');
   expect([...res.headers].flat().join(' ')).not.toContain('synthetic-key');
   expect(spy).toHaveBeenCalledOnce();
 });
 it('keeps a still-listed model and routes the newly added 2.5 Flash exactly',async()=>{
   const spy = mockFetch();
   const res = await handleAiTranslate(makeRequest({ text: '你好', model: 'gemini-2.5-flash' }), VALID_ENV);
   expect(await res.json()).toMatchObject({ model: 'gemini-2.5-flash' });
   expect(spy.mock.calls[0][0]).toContain('/models/gemini-2.5-flash:generateContent');
 });
 it('rotates to the next pool key on a 429 and never exposes key material',async()=>{
   const spy = poolFetch()
     .mockResolvedValueOnce(new Response('private provider body', { status: 429, headers: { 'Retry-After': '30' } }))
     .mockImplementation(async () => new Response(JSON.stringify(validResult), { status: 200 }));
   const res = await handleAiTranslate(makeRequest({ text: '你好' }), POOL);
   expect(res.status).toBe(200);
   const body = await res.json();
   expect(body).toMatchObject({ result: 'Xin chào.', finishReason: 'STOP' });
   expect(spy).toHaveBeenCalledTimes(2);
   expect(spy.mock.calls[0][1]?.headers).toMatchObject({ 'x-goog-api-key': 'synthetic-key-aaaa' });
   expect(spy.mock.calls[1][1]?.headers).toMatchObject({ 'x-goog-api-key': 'synthetic-key-bbbb' });
   expect(res.headers.get('X-AI-Rotation')).toBe('1');
   expect(res.headers.get('X-AI-Key-Label')).toBe('proj-b');
   expect(res.headers.get('X-AI-Keys-Available')).toBe('1');
   const all = [...res.headers].flat().join(' ') + JSON.stringify(body);
   expect(all).not.toContain('synthetic-key');
 });
 it('tries each key at most once and later fails fast without hammering cooling keys',async()=>{
   const spy = poolFetch().mockResolvedValue(new Response('private provider body', { status: 429, headers: { 'Retry-After': '45' } }));
   const first = await handleAiTranslate(makeRequest({ text: '你好' }), POOL);
   expect(first.status).toBe(429);expect(await first.json()).toEqual({ error: 'ai_rate_limited' });
   expect(spy).toHaveBeenCalledTimes(2);
   expect(first.headers.get('Retry-After')).toBe('45');
   const second = await handleAiTranslate(makeRequest({ text: '你好' }), POOL);
   expect(second.status).toBe(429);
   expect(spy).toHaveBeenCalledTimes(2);
   // Fail-fast reports OUR OWN remaining cooldown so the client can schedule one retry.
   expect(Number(second.headers.get('Retry-After'))).toBeGreaterThan(0);
   expect(Number(second.headers.get('Retry-After'))).toBeLessThanOrEqual(45);
 });
 it('retires an explicitly invalid key and never forces a caller to change model',async()=>{
   const spy = poolFetch()
     .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'API key not valid. API_KEY_INVALID' } }), { status: 400 }))
     .mockImplementation(async () => new Response(JSON.stringify(validResult), { status: 200 }));
   const res = await handleAiTranslate(makeRequest({ text: '你好', model: 'gemini-2.5-flash' }), POOL);
   expect(res.status).toBe(200);
   expect(await res.json()).toMatchObject({ model: 'gemini-2.5-flash' });
   expect(spy).toHaveBeenCalledTimes(2);
   expect(spy.mock.calls[1][1]?.headers).toMatchObject({ 'x-goog-api-key': 'synthetic-key-bbbb' });
 });
 it('ignores a malformed pool and keeps the deployment key working',async()=>{
   const spy = mockFetch();
   const res = await handleAiTranslate(makeRequest({ text: '你好' }), { ...VALID_ENV, GEMINI_API_KEYS: 'not-json' });
   expect(res.status).toBe(200);
   expect(spy.mock.calls[0][1]?.headers).toMatchObject({ 'x-goog-api-key': VALID_ENV.GEMINI_API_KEY });
   expect(res.headers.get('X-AI-Key-Label')).toBe('default');
   expect(res.headers.get('X-AI-Rotation')).toBeNull();
 });
 it('reports ai_not_configured for an empty pool without any upstream call',async()=>{
   const spy = mockFetch();
   const res = await handleAiTranslate(makeRequest({ text: '你好' }), { GEMINI_API_KEYS: '[]' });
   expect(res.status).toBe(503);
   expect(await res.json()).toEqual({ error: 'ai_not_configured' });
   expect(spy).not.toHaveBeenCalled();
 });
});
