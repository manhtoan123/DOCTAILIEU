// Deployed key-pool smoke: ONE synthetic real Gemini request. Never reads a novel, never reads or prints a key.
import assert from 'node:assert/strict';
const base = process.env.AI_SMOKE_ORIGIN || 'https://thu-phong-private.pages.dev';
const fixture = '林儿推开窗，看见张明站在院子里。他说：“等了十分钟，我们终于可以出发了。”';
const body = { text: fixture, model: 'gemini-3.5-flash', temperature: 0, userPromptTemplate: '{{name}}Dịch sang {{language}} và chỉ trả bản dịch:\n{{text}}' };
const started = Date.now();
const response = await fetch(base + '/api/ai/translate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(75000),
});
const data = await response.json();
const summary = {
  status: response.status,
  ms: Date.now() - started,
  keyLabel: response.headers.get('x-ai-key-label'),
  keysAvailable: response.headers.get('x-ai-keys-available'),
  rotated: response.headers.get('x-ai-rotation'),
  model: data.model,
  finishReason: data.finishReason,
  vietnamese: typeof data.result === 'string' && /Lâm Nhi/.test(data.result),
};
console.log(JSON.stringify(summary));
assert.equal(response.status, 200, 'expected HTTP 200 from the deployed pool');
assert.equal(data.finishReason, 'STOP');
assert.ok(/Lâm Nhi/.test(data.result), 'expected Vietnamese output');
assert.ok(summary.keyLabel, 'expected X-AI-Key-Label to name the pool entry used');
assert.ok(Number(summary.keysAvailable) >= 1, 'expected at least one usable key');
assert.ok(!JSON.stringify(summary).includes('AIza'), 'no key material may appear in the response');

// Optional add/delete round-trip against the live /keys API. Off by default because it writes
// one synthetic key to the pool; run with AI_KEYS_ROUNDTRIP=1 and it always cleans up after itself.
if (process.env.AI_KEYS_ROUNDTRIP === '1') {
  const synthetic = 'AIza' + 'S'.repeat(35);
  const before = await (await fetch(base + '/api/ai/keys')).json();
  const added = await (await fetch(base + '/api/ai/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${synthetic}\ngsk_notageminikey_${'u'.repeat(40)}` }) })).json();
  const row = added.keys?.find(entry => entry.label === '' || entry.label === 'smoke');
  const masked = synthetic.slice(-4);
  const roundTrip = {
    activeBefore: before.active,
    storedBefore: before.stored,
    added: added.added,
    rejected: added.rejected,
    storedAfterAdd: added.stored,
    listedMasked: Array.isArray(added.keys) && added.keys.some(entry => entry.masked === `…${masked}`),
    leaked: JSON.stringify(added).includes(synthetic.slice(0, 12)),
  };
  const removed = row ? await (await fetch(base + '/api/ai/keys?id=' + encodeURIComponent(row.id), { method: 'DELETE' })).json() : { keys: [], stored: added.stored, removed: false };
  const after = await (await fetch(base + '/api/ai/keys')).json();
  console.log(JSON.stringify({ ...roundTrip, removed: removed.removed, storedAfterCleanup: after.stored }));
  assert.equal(roundTrip.added, 1, 'expected exactly one key stored');
  assert.equal(roundTrip.rejected, 1, 'expected the Groq key to be rejected');
  assert.ok(roundTrip.listedMasked, 'expected the stored key to be listed masked');
  assert.ok(!roundTrip.leaked, 'the stored key must never be echoed back');
  assert.ok(removed.removed, 'expected the synthetic key to be deleted');
  assert.equal(after.stored, before.stored, 'cleanup must restore the original stored count');
}
// Optional Gemma probe (AI_GEMMA_SMOKE=1): both Gemma models are reported, the 26B one must translate.
if (process.env.AI_GEMMA_SMOKE === '1') {
  for (const model of ['gemma-4-26b-a4b-it', 'gemma-4-31b-it']) {
    const started = Date.now();
    const response = await fetch(base + '/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await response.json();
    const summary = {
      model,
      status: response.status,
      ms: Date.now() - started,
      failureReason: response.headers.get('x-ai-failure-reason'),
      finishReason: data.finishReason,
      error: typeof data.error === 'string' ? data.error : undefined,
      vietnamese: typeof data.result === 'string' && /Lâm Nhi/.test(data.result),
      result: typeof data.result === 'string' ? data.result.slice(0, 80) : undefined,
    };
    console.log(JSON.stringify(summary));
    if (model === 'gemma-4-26b-a4b-it') {
      assert.equal(response.status, 200, 'expected Gemma 4 26B to translate');
      assert.ok(summary.vietnamese, 'expected Vietnamese output from Gemma 4 26B');
      assert.equal(summary.finishReason, 'STOP');
    }
  }
}
console.log('key pool production smoke OK');
