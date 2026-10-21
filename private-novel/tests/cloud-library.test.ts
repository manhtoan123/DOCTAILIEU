import {afterEach, describe, expect, it, vi} from 'vitest';
import {DatabaseSync, type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {D1Database, R2Bucket} from '@cloudflare/workers-types';
import {handleCloudLibrary, MAX_CLOUD_SNAPSHOT_BYTES, CLOUD_STORAGE_BUDGET_BYTES, type CloudLibraryEnv} from '../server/cloud-library';

const origin = 'https://example.test';
const token = 'b'.repeat(64);
const authHash = `pbkdf2-sha256:600000:${'a'.repeat(32)}:${'a'.repeat(64)}`;
const id = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const snapshot = JSON.stringify({version: 1, book: {id, title: 'Truyện 中文'}, chapters: ['source']});
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

// Real SQLite executes the production migration and reservation SQL. Only the D1
// transport and R2 binding are adapters; quota/concurrency tests do not emulate SQL.
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  sqlite.exec(readFileSync(new URL('../migrations/0001_auth.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0002_cloud_library.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0003_cloud_book_deletions.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0004_cloud_book_albums.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0005_cloud_originals.sql', import.meta.url), 'utf8'));
  sqlite.prepare('INSERT INTO sessions VALUES (?, ?)').run(digest(token), Date.now() + 60_000);
  const failures = {put: false, publish: false};
  const db = {prepare(sql: string) {
    let bindings: SQLInputValue[] = [];
    return {
      bind(...args: SQLInputValue[]) { bindings = args; return this; },
      async first() { if (failures.publish && sql.startsWith('UPDATE cloud_books')) throw new Error('D1 interrupted'); return sqlite.prepare(sql).get(...bindings) ?? null; },
      async all() { return {success: true, results: sqlite.prepare(sql).all(...bindings)}; },
      async run() { const result = sqlite.prepare(sql).run(...bindings); return {success: true, meta: {changes: Number(result.changes)}}; },
    };
  }};
  const objects = new Map<string, {bytes: Uint8Array<ArrayBuffer>; sha256: string}>();
  function metadata(key: string) {
    const value = objects.get(key);
    return value ? {key, size: value.bytes.byteLength, customMetadata: {sha256: value.sha256}, checksums: {sha256: Uint8Array.from(Buffer.from(value.sha256, 'hex')).buffer}} : null;
  }
  const bucket = {
    put: vi.fn(async (key: string, bytes: Uint8Array, options: {sha256: string; onlyIf: {etagDoesNotMatch: string}}) => {
      if (failures.put) throw new Error('R2 interrupted');
      expect(options.onlyIf.etagDoesNotMatch).toBe('*');
      expect(digest(bytes)).toBe(options.sha256);
      if (objects.has(key)) return null;
      objects.set(key, {bytes: bytes.slice(), sha256: options.sha256});
      return metadata(key);
    }),
    head: vi.fn(async (key: string) => metadata(key)),
    get: vi.fn(async (key: string) => {
      const info = metadata(key);
      return info ? {...info, body: new Response(objects.get(key)!.bytes).body} : null;
    }),
  };
  const env: CloudLibraryEnv = {DB: db as unknown as D1Database, AUTH_PASSWORD_HASH: authHash, LIBRARY_BUCKET: bucket as unknown as R2Bucket};
  const request = (path = '/api/cloud/books', init: RequestInit = {}) => {
    const headers = new Headers({Cookie: `__Host-session=${token}`});
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    return new Request(origin + path, {...init, headers});
  };
  const put = (bookId = id, body = snapshot, extra: Record<string, string> = {}) => request(`/api/cloud/books/${bookId}`, {method: 'PUT', body, headers: {Origin: origin, 'Content-Type': 'application/json', 'X-Book-Title': encodeURIComponent('Truyện 中文'), 'X-Content-SHA256': digest(body), ...extra}});
  const run = (req: Request) => handleCloudLibrary(req, env);
  return {sqlite, env, bucket, objects, failures, request, put, run};
}

describe('private immutable cloud library', () => {
  it('fails closed without auth configuration or bucket even when public UI is allowed', async () => {
    const s = setup();
    s.env.AUTH_PASSWORD_HASH = '';
    expect((await s.run(s.request())).status).toBe(503);
    s.env.AUTH_PASSWORD_HASH = authHash;
    s.env.LIBRARY_BUCKET = undefined;
    expect((await s.run(s.request())).status).toBe(503);
    expect(s.bucket.get).not.toHaveBeenCalled();
    expect(s.bucket.put).not.toHaveBeenCalled();
  });
  it('rejects anonymous/malformed sessions, expires sessions and rejects foreign or missing Origin', async () => {
    const s = setup();
    for (const cookie of ['', '__Host-session=bad']) expect((await s.run(s.request(undefined, {headers: {Cookie: cookie}}))).status).toBe(401);
    for (const Origin of ['', 'https://evil.test']) expect((await s.run(s.put(id, snapshot, {Origin}))).status).toBe(403);
    s.sqlite.exec('UPDATE sessions SET expires_at=0');
    expect((await s.run(s.put())).status).toBe(303);
    expect(s.bucket.put).not.toHaveBeenCalled();
  });
  it('uploads, lists and streams exact snapshot bytes with private security headers', async () => {
    const s = setup();
    const uploaded = await s.run(s.put());
    expect(uploaded.status).toBe(201);
    expect(await uploaded.json()).toEqual({id, sha256: digest(snapshot)});
    const list = await (await s.run(s.request())).json();
    expect(list).toEqual({books: [{id, title: 'Truyện 中文', sha256: digest(snapshot), bytes: Buffer.byteLength(snapshot), updatedAt: expect.any(Number)}], cursor: null});
    const downloaded = await s.run(s.request(`/api/cloud/books/${id}`));
    expect(await downloaded.text()).toBe(snapshot);
    expect(downloaded.headers.get('X-Content-SHA256')).toBe(digest(snapshot));
    expect(downloaded.headers.get('Cache-Control')).toBe('private, no-store');
    expect(downloaded.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
  it('makes same-content retries idempotent and rejects edits without changing first title or bytes', async () => {
    const s = setup();
    await s.run(s.put());
    expect((await s.run(s.put(id, snapshot, {'X-Book-Title': 'Changed'}))).status).toBe(200);
    expect((await s.run(s.put(id, snapshot + ' '))).status).toBe(409);
    expect(s.bucket.put).toHaveBeenCalledTimes(1);
    expect(s.sqlite.prepare('SELECT title FROM cloud_books').get()?.title).toBe('Truyện 中文');
  });
  it('same-ID simultaneous identical writes reserve once; conflicting content never overwrites', async () => {
    const s = setup();
    const responses = await Promise.all([s.run(s.put()), s.run(s.put()), s.run(s.put(id, snapshot + ' '))]);
    expect(responses.slice(0, 2).every(r => r.status === 200 || r.status === 201)).toBe(true);
    expect(responses[2].status).toBe(409);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM cloud_books').get()?.n).toBe(1);
    expect(s.objects.size).toBe(1);
    expect(await (await s.run(s.request(`/api/cloud/books/${id}`))).text()).toBe(snapshot);
  });
  it('keeps failed PUT reservation hidden and retries it successfully', async () => {
    const s = setup();
    s.failures.put = true;
    expect((await s.run(s.put())).status).toBe(503);
    expect(s.sqlite.prepare('SELECT state FROM cloud_books').get()?.state).toBe('pending');
    expect(await (await s.run(s.request())).json()).toEqual({books: [], cursor: null});
    expect((await s.run(s.request(`/api/cloud/books/${id}`))).status).toBe(404);
    s.failures.put = false;
    expect((await s.run(s.put())).status).toBe(201);
  });
  it('recovers a successful R2 write followed by failed D1 publication without replacing it', async () => {
    const s = setup();
    s.failures.publish = true;
    expect((await s.run(s.put())).status).toBe(503);
    expect(s.objects.size).toBe(1);
    expect(await (await s.run(s.request())).json()).toEqual({books: [], cursor: null});
    s.failures.publish = false;
    expect((await s.run(s.put())).status).toBe(201);
    expect(s.bucket.head).toHaveBeenCalledTimes(1);
  });
  it('atomically reserves the last available space across competing IDs, counting pending bytes', async () => {
    const s = setup();
    let remaining = CLOUD_STORAGE_BUDGET_BYTES - Buffer.byteLength(snapshot);
    let index = 0;
    const seed = s.sqlite.prepare("INSERT INTO cloud_books (id, title, sha256, bytes, state, object_key, updated_at) VALUES (?, 'reserved', ?, ?, 'pending', ?, 0)");
    while (remaining > 0) { const bytes = Math.min(remaining, MAX_CLOUD_SNAPSHOT_BYTES); seed.run(`seed-${index}`, 'a'.repeat(64), bytes, `seed/${index++}`); remaining -= bytes; }
    const responses = await Promise.all([s.run(s.put()), s.run(s.put(secondId))]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 507]);
    expect(s.sqlite.prepare('SELECT SUM(bytes) AS bytes FROM cloud_books').get()?.bytes).toBe(CLOUD_STORAGE_BUDGET_BYTES);
    expect(s.objects.size).toBe(1);
    expect((await s.run(s.put())).status).toBe(200);
  });
  it('rejects both declared oversize and lied Content-Length using actual streamed bytes', async () => {
    const s = setup();
    expect((await s.run(s.put(id, snapshot, {'Content-Length': String(MAX_CLOUD_SNAPSHOT_BYTES + 1)}))).status).toBe(413);
    const canceled = vi.fn();
    const body = new ReadableStream({pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel: canceled});
    const req = new Request(s.put(), {body, duplex: 'half'} as RequestInit);
    req.headers.set('Content-Length', '1');
    expect((await s.run(req)).status).toBe(413);
    expect(canceled).toHaveBeenCalledOnce();
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM cloud_books').get()?.n).toBe(0);
    expect(s.bucket.put).not.toHaveBeenCalled();
  });
  it('rejects incorrect hashes before reservations and handles interrupted body reads', async () => {
    const s = setup();
    expect((await s.run(s.put(id, snapshot, {'X-Content-SHA256': 'a'.repeat(64)}))).status).toBe(400);
    const body = new ReadableStream({start(controller) { controller.error(new Error('canceled upload')); }});
    expect((await s.run(new Request(s.put(), {body, duplex: 'half'} as RequestInit))).status).toBe(400);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM cloud_books').get()?.n).toBe(0);
  });
  it('bounds and validates IDs, metadata, media type, methods and pagination', async () => {
    const s = setup();
    expect((await s.run(s.put('invalid'))).status).toBe(400);
    for (const title of ['%', '', encodeURIComponent('x'.repeat(301)), '%0A']) expect((await s.run(s.put(id, snapshot, {'X-Book-Title': title}))).status).toBe(400);
    expect((await s.run(s.put(id, snapshot, {'X-Content-SHA256': 'bad'}))).status).toBe(400);
    expect((await s.run(s.put(id, snapshot, {'Content-Type': 'text/html'}))).status).toBe(415);
    expect((await s.run(s.request(`/api/cloud/books/${id}`, {method: 'PATCH', headers: {Origin: origin}}))).status).toBe(405);
    for (const query of ['limit=0', 'limit=101', 'limit=-1', 'limit=1.5', 'cursor=bad']) expect((await s.run(s.request(`/api/cloud/books?${query}`))).status).toBe(400);
    expect(s.bucket.put).not.toHaveBeenCalled();
  });
  it('paginates ready snapshots without including pending reservations', async () => {
    const s = setup();
    await s.run(s.put()); await s.run(s.put(secondId));
    const first = await (await s.run(s.request('/api/cloud/books?limit=1'))).json();
    expect(first.books.map((b: {id: string}) => b.id)).toEqual([id]);
    expect(first.cursor).toBe(id);
    const second = await (await s.run(s.request(`/api/cloud/books?limit=1&cursor=${first.cursor}`))).json();
    expect(second.books.map((b: {id: string}) => b.id)).toEqual([secondId]); expect(second.cursor).toBeNull();
  });
  it('never streams missing or mismatched R2 data', async () => {
    const s = setup();
    await s.run(s.put());
    const [key, object] = [...s.objects.entries()][0];
    s.objects.set(key, {...object, sha256: 'f'.repeat(64)});
    expect((await s.run(s.request(`/api/cloud/books/${id}`))).status).toBe(503);
    s.objects.delete(key);
    expect((await s.run(s.request(`/api/cloud/books/${id}`))).status).toBe(503);
  });
});
