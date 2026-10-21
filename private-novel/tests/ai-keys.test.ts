import type {D1Database} from '@cloudflare/workers-types';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {GEMINI_KEY_PATTERN,handleAiKeys,maskKey} from '../server/ai-keys';
import type {KeyStore,StoredKey} from '../server/ai-key-store';
import {handleAiTranslate,invalidateAiKeyPool,loadAiKeyPool,resetAiKeyState} from '../server/ai-translate';

const KEY_A = 'AIza' + 'A'.repeat(35), KEY_B = 'AIza' + 'B'.repeat(35), GROQ = 'gsk_' + 'c'.repeat(48);
const validResult = { candidates: [{ content: { parts: [{ text: 'Xin chào.' }] }, finishReason: 'STOP' }] };

function memoryStore(initial: StoredKey[] = []): KeyStore & { rows: StoredKey[] } {
  const rows = [...initial];
  return {
    rows,
    async list() { return rows.map(row => ({ ...row })); },
    async count() { return rows.length; },
    async add(entries) {
      let added = 0;
      for (const entry of entries) {
        if (rows.some(row => row.secret === entry.secret)) continue;
        rows.push({ id: `id-${rows.length + 1}`, label: entry.label, secret: entry.secret, createdAt: rows.length });
        added++;
      }
      return added;
    },
    async remove(id) { const before = rows.length; const kept = rows.filter(row => row.id !== id); rows.length = 0; rows.push(...kept); return kept.length < before; },
  };
}
function keysRequest(method: string, body?: unknown, url = 'https://reader.example/api/ai/keys', ip = '203.0.113.9') {
  return new Request(url, {
    method,
    headers: body === undefined ? { 'CF-Connecting-IP': ip } : { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function fakeDb(rows: { id: string; label: string; secret: string; created_at: number }[]) {
  const leases=new Map<string,number>();
  return { prepare: (sql:string) => {let args:unknown[]=[];const statement={
    all:async()=>({results:sql.includes('ai_keys ')?rows:[]}),
    first:async()=>{if(!sql.includes('RETURNING busy_until'))return null;const id=String(args[4]),now=Number(args[5]);if((leases.get(id)??0)>now)return null;const owner=Number(args[0])+Number(args[1]);leases.set(id,owner);return {busy_until:owner};},
    run:async()=>{if(sql.startsWith('UPDATE ai_key_health SET busy_until=0')&&leases.get(String(args[0]))===args[1])leases.delete(String(args[0]));return {meta:{changes:1}};},
    bind:(...values:unknown[])=>{args=values;return statement;},
  };return statement;} } as unknown as D1Database;
}
const ENV = { GEMINI_API_KEY: 'AIza' + 'Z'.repeat(35) };

beforeEach(() => { resetAiKeyState(); invalidateAiKeyPool(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('editable Gemini key pool API', () => {
  it('returns only masked values and never a secret', async () => {
    const store = memoryStore([{ id: 'id-1', label: '', secret: KEY_A, createdAt: 5 }]);
    const response = await handleAiKeys(keysRequest('GET'), ENV, store);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toMatchObject({stored:1,secretPool:1,active:1});expect(data.keys).toHaveLength(2);expect(data.keys[0]).toMatchObject({id:'id-1',label:'',masked:maskKey(KEY_A),createdAt:5,selected:true,status:'ready'});expect(data.keys[1]).toMatchObject({source:'secret',selected:false});
    expect(JSON.stringify(data)).not.toContain(KEY_A.slice(0, 12));
    expect([...response.headers].flat().join(' ')).not.toContain(KEY_A.slice(0, 12));
  });
  it('adds Gemini-shaped keys, ignores a Groq key, and reports the counts', async () => {
    const store = memoryStore();
    const response = await handleAiKeys(keysRequest('POST', { text: `${KEY_A}\n${GROQ}\n${KEY_B}\n${KEY_A}` }), ENV, store);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('X-AI-Keys-Changed')).toBe('1');
    expect(data).toMatchObject({ added: 2, rejected: 2, stored: 2, active: 2 });
    expect(store.rows.map(row => row.secret)).toEqual([KEY_A, KEY_B]);
    expect(JSON.stringify(data)).not.toContain(KEY_A.slice(0, 12));
  });
  it('rejects a batch with no usable Gemini key', async () => {
    const store = memoryStore();
    for (const body of [{ text: GROQ }, { text: '' }, { keys: [] }]) {
      const response = await handleAiKeys(keysRequest('POST', body), ENV, store);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe(body.text === GROQ ? 'invalid_key' : 'no_keys');
    }
    expect(store.rows).toHaveLength(0);
    expect(GEMINI_KEY_PATTERN.test(GROQ)).toBe(false);
  });
  it('removes one key by id and keeps the rest', async () => {
    const store = memoryStore([{ id: 'id-1', label: '', secret: KEY_A, createdAt: 1 }, { id: 'id-2', label: '', secret: KEY_B, createdAt: 2 }]);
    const response = await handleAiKeys(keysRequest('DELETE', undefined, 'https://reader.example/api/ai/keys?id=id-1'), ENV, store);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ removed: true, stored: 1 });
    expect(store.rows.map(row => row.id)).toEqual(['id-2']);
    expect((await handleAiKeys(keysRequest('DELETE', undefined, 'https://reader.example/api/ai/keys?id=..nope'), ENV, store)).status).toBe(400);
  });
  it('fails closed without a store, on a full pool, and on unsupported methods', async () => {
    expect((await handleAiKeys(keysRequest('GET'), { GEMINI_API_KEY: ENV.GEMINI_API_KEY, GEMINI_API_KEYS: '[]' })).status).toBe(503);
    const full = memoryStore(Array.from({ length: 50 }, (_, index) => ({ id: `id-${index}`, label: '', secret: `AIza${'D'.repeat(30)}${index}`, createdAt: index })));
    expect((await handleAiKeys(keysRequest('POST', { text: KEY_A }), ENV, full)).status).toBe(400);
    expect((await handleAiKeys(new Request('https://reader.example/api/ai/keys', { method: 'PUT' }), ENV, memoryStore())).status).toBe(405);
  });
  it('rate limits writes per client without touching reads', async () => {
    const store = memoryStore();
    const ip = '203.0.113.77';
    for (let attempt = 0; attempt < 30; attempt++) expect((await handleAiKeys(keysRequest('POST', { text: `AIza${'E'.repeat(30)}${attempt}` }, undefined, ip), ENV, store)).status).toBe(200);
    expect((await handleAiKeys(keysRequest('POST', { text: KEY_A }, undefined, ip), ENV, store)).status).toBe(429);
    expect((await handleAiKeys(keysRequest('GET', undefined, undefined, ip), ENV, store)).status).toBe(200);
  });
  it('prefers stored keys over the deployment pool and follows edits after invalidation', async () => {
    const store = memoryStore([{ id: 'id-9', label: 'ui', secret: KEY_A, createdAt: 1 }]);
    invalidateAiKeyPool();
    expect((await loadAiKeyPool(ENV, memoryStore())).map(entry => entry.key)).toEqual([ENV.GEMINI_API_KEY]);
    invalidateAiKeyPool();
    expect(await loadAiKeyPool(ENV, store)).toMatchObject([{id:'id-9',label:'ui',key:KEY_A,stored:true}]);
    invalidateAiKeyPool();
    await store.add([{ label: 'ui', secret: KEY_B }]);
    expect((await loadAiKeyPool(ENV, store)).map(entry => entry.label)).toEqual(['ui', 'ui']);
    expect((await loadAiKeyPool(ENV, store)).map(entry => entry.key)).toEqual([KEY_A, KEY_B]);
  });
  it('translates with the stored pool and labels the key that was used', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(validResult));
    const response = await handleAiTranslate(new Request('https://reader.example/api/ai/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '你好' }) }), { DB: fakeDb([{ id: 'row-1', label: 'ui', secret: KEY_A, created_at: 1 }]) });
    expect(response.status).toBe(200);
    expect(spy.mock.calls[0][1]?.headers).toMatchObject({ 'x-goog-api-key': KEY_A });
    expect(response.headers.get('X-AI-Key-Label')).toBe('ui');
  });
});
