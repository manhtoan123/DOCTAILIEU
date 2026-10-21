import {afterEach, describe, expect, it, vi} from 'vitest';
import {DatabaseSync, type SQLInputValue} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {D1Database, R2Bucket} from '@cloudflare/workers-types';
import {handleCloudLibrary, type CloudLibraryEnv} from '../server/cloud-library';

const origin = 'https://example.test';
const token = 'b'.repeat(64);
const id = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const thirdId = '00000000-0000-4000-8000-000000000003';
const snapshot = JSON.stringify({version: 1, book: {id, title: 'Synthetic'}, chapters: ['source']});
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const migration = readFileSync(new URL('../migrations/0003_cloud_book_deletions.sql', import.meta.url), 'utf8');
const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

// Execute the migration and all production SQL in real SQLite. Hooks pause only
// at awaited transport boundaries, allowing deterministic delete/upload races.
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  sqlite.exec(readFileSync(new URL('../migrations/0001_auth.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0002_cloud_library.sql', import.meta.url), 'utf8'));
  sqlite.exec(migration);
  sqlite.exec(readFileSync(new URL('../migrations/0004_cloud_book_albums.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0005_cloud_originals.sql', import.meta.url), 'utf8'));
  const failures = {put: false, remove: false, publish: false, tombstone: false};
  const hooks: {beforeSql?: (sql: string) => Promise<void>; afterSql?: (sql: string) => Promise<void>;
    beforePut?: () => Promise<void>; afterPut?: () => Promise<void>; afterGet?: () => Promise<void>} = {};
  const db = {prepare(sql: string) {
    let bindings: SQLInputValue[] = [];
    async function execute(mode: 'get' | 'all' | 'run') {
      await hooks.beforeSql?.(sql);
      if ((failures.publish && sql.startsWith('UPDATE cloud_books'))
        || (failures.tombstone && sql.startsWith('INSERT INTO cloud_book_deletions'))) throw new Error('D1 interrupted');
      const result = sqlite.prepare(sql)[mode](...bindings);
      await hooks.afterSql?.(sql);
      return result;
    }
    return {
      bind(...args: SQLInputValue[]) { bindings = args; return this; },
      async first() { return await execute('get') ?? null; },
      async all() { return {success: true, results: await execute('all')}; },
      async run() { return {success: true, meta: await execute('run')}; },
    };
  }};
  const objects = new Map<string, {bytes: Uint8Array<ArrayBuffer>; sha256: string}>();
  function metadata(key: string) {
    const value = objects.get(key);
    return value ? {key, size: value.bytes.byteLength, customMetadata: {sha256: value.sha256},
      checksums: {sha256: Uint8Array.from(Buffer.from(value.sha256, 'hex')).buffer}} : null;
  }
  const bucket = {
    put: vi.fn(async (key: string, bytes: Uint8Array, options: {sha256: string; onlyIf: {etagDoesNotMatch: string}}) => {
      await hooks.beforePut?.();
      if (failures.put) throw new Error('R2 interrupted');
      expect(options.onlyIf.etagDoesNotMatch).toBe('*');
      expect(digest(bytes)).toBe(options.sha256);
      if (objects.has(key)) return null;
      objects.set(key, {bytes: bytes.slice(), sha256: options.sha256});
      const result = metadata(key);
      await hooks.afterPut?.();
      return result;
    }),
    head: vi.fn(async (key: string) => metadata(key)),
    get: vi.fn(async (key: string) => {
      const info = metadata(key);
      const result = info ? {...info, body: new Response(objects.get(key)!.bytes).body} : null;
      await hooks.afterGet?.();
      return result;
    }),
    delete: vi.fn(async (key: string) => {
      if (failures.remove) throw new Error('R2 interrupted');
      objects.delete(key);
    }),
  };
  const env: CloudLibraryEnv = {DB: db as unknown as D1Database, AUTH_PASSWORD_HASH: '', CLOUD_ACCESS_TOKEN_HASH: digest(token), LIBRARY_BUCKET: bucket as unknown as R2Bucket};
  const request = (path = '/api/cloud/books', init: RequestInit = {}) => {
    const headers = new Headers({Authorization: `Bearer ${token}`});
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    return new Request(origin + path, {...init, headers});
  };
  const put = (bookId = id, body = snapshot) => request(`/api/cloud/books/${bookId}`, {method: 'PUT', body,
    headers: {Origin: origin, 'Content-Type': 'application/json', 'X-Book-Title': 'Synthetic', 'X-Content-SHA256': digest(body)}});
  const remove = (bookId = id, headers: Record<string, string> = {}) => request(`/api/cloud/books/${bookId}`, {method: 'DELETE', headers: {Origin: origin, ...headers}});
  const run = (req: Request) => handleCloudLibrary(req, env);
  const catalog = async () => (await run(request())).json();
  const deleted = async () => (await run(request('/api/cloud/deletions'))).json();
  const reserved = () => sqlite.prepare('SELECT SUM(bytes) AS bytes FROM cloud_books').get()?.bytes;
  return {sqlite, env, failures, hooks, objects, bucket, request, put, remove, run, catalog, deleted, reserved};
}

describe('permanent cloud deletions', () => {
  it('adds an idempotent migration without changing existing snapshots or auth rows', () => {
    const s = setup();
    s.sqlite.prepare('INSERT INTO sessions VALUES (?, ?)').run(digest(token), 123);
    s.sqlite.prepare("INSERT INTO cloud_books (id, title, sha256, bytes, state, object_key, updated_at) VALUES (?, 'Original', ?, ?, 'ready', ?, 1)")
      .run(id, digest(snapshot), Buffer.byteLength(snapshot), `books/v1/${id}/${digest(snapshot)}.json`);
    const before = s.sqlite.prepare('SELECT * FROM cloud_books').all();
    s.sqlite.exec(migration);
    expect(s.sqlite.prepare('SELECT * FROM cloud_books').all()).toEqual(before);
    expect(s.sqlite.prepare('SELECT expires_at FROM sessions').get()?.expires_at).toBe(123);
  });

  it('deletes only the selected immutable object, hides the book, retains its reservation and blocks retries', async () => {
    const s = setup();
    expect((await s.run(s.put())).status).toBe(201);
    expect((await s.run(s.put(otherId))).status).toBe(201);
    const reserved = s.reserved();
    const response = await s.run(s.remove());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({id, deleted: true});
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(s.bucket.delete).toHaveBeenCalledExactlyOnceWith(`books/v1/${id}/${digest(snapshot)}.json`);
    expect(s.reserved()).toBe(reserved);
    expect((await s.catalog()).books.map((book: {id: string}) => book.id)).toEqual([otherId]);
    expect((await s.run(s.request(`/api/cloud/books/${id}`))).status).toBe(404);
    expect(await (await s.run(s.request(`/api/cloud/books/${otherId}`))).text()).toBe(snapshot);
    for (const body of [snapshot, snapshot + ' ']) {
      const retry = await s.run(s.put(id, body));
      expect(retry.status).toBe(410);
      expect(await retry.json()).toEqual({error: 'book_deleted'});
    }
    expect(s.bucket.put).toHaveBeenCalledTimes(2);
    expect(await s.deleted()).toEqual({ids: [id], cursor: null});
  });

  it('permanently tombstones unknown IDs and makes repeated or simultaneous deletes idempotent', async () => {
    const s = setup();
    expect((await s.run(s.remove())).status).toBe(200);
    const timestamp = s.sqlite.prepare('SELECT deleted_at FROM cloud_book_deletions').get()?.deleted_at;
    const responses = await Promise.all([s.run(s.remove()), s.run(s.remove())]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect(s.sqlite.prepare('SELECT * FROM cloud_book_deletions').all()).toHaveLength(1);
    expect(s.sqlite.prepare('SELECT deleted_at FROM cloud_book_deletions').get()?.deleted_at).toBe(timestamp);
    expect((await s.run(s.put())).status).toBe(410);
    expect(s.reserved()).toBeNull();
    expect(s.bucket.put).not.toHaveBeenCalled();
  });

  it('requires the shared auth gate and same Origin for DELETE; tombstones remain private', async () => {
    const s = setup();
    for (const authorization of ['', 'Bearer bad', `Bearer ${'a'.repeat(64)}`]) {
      expect((await s.run(s.remove(id, {Authorization: authorization}))).status).toBe(401);
      expect((await s.run(s.request('/api/cloud/deletions', {headers: {Authorization: authorization}}))).status).toBe(401);
    }
    for (const badOrigin of ['', 'null', 'https://evil.test', origin + '.evil.test']) {
      expect((await s.run(s.remove(id, {Origin: badOrigin}))).status).toBe(403);
    }
    expect(await s.deleted()).toEqual({ids: [], cursor: null});
    expect(s.bucket.delete).not.toHaveBeenCalled();
    s.env.CLOUD_ACCESS_TOKEN_HASH = '';
    expect((await s.run(s.remove())).status).toBe(503);
  });

  it('preserves legacy session authorization for DELETE', async () => {
    const s = setup();
    delete s.env.CLOUD_ACCESS_TOKEN_HASH;
    s.env.AUTH_PASSWORD_HASH = `pbkdf2-sha256:600000:${'a'.repeat(32)}:${'a'.repeat(64)}`;
    s.sqlite.prepare('INSERT INTO sessions VALUES (?, ?)').run(digest(token), Date.now() + 60_000);
    expect((await s.run(s.remove())).status).toBe(401);
    expect((await s.run(s.remove(id, {Cookie: `__Host-session=${token}`, Origin: ''}))).status).toBe(403);
    expect((await s.run(s.remove(id, {Cookie: `__Host-session=${token}`}))).status).toBe(200);
  });

  it('fails closed before touching R2 if committing the tombstone fails', async () => {
    const s = setup();
    await s.run(s.put());
    s.failures.tombstone = true;
    expect((await s.run(s.remove())).status).toBe(503);
    expect((await s.catalog()).books).toHaveLength(1);
    expect(s.bucket.delete).not.toHaveBeenCalled();
  });

  it('keeps deletion durable on R2 failure and retries only cleanup without releasing reserved bytes', async () => {
    const s = setup();
    await s.run(s.put());
    const reserved = s.reserved();
    s.failures.remove = true;
    expect((await s.run(s.remove())).status).toBe(200);
    expect(s.objects.size).toBe(1);
    expect(await s.catalog()).toEqual({books: [], cursor: null});
    expect((await s.run(s.put())).status).toBe(410);
    s.failures.remove = false;
    expect((await s.run(s.remove())).status).toBe(200);
    expect(s.objects.size).toBe(0);
    expect(s.reserved()).toBe(reserved);
  });

  it('does not delete an unrelated object when a catalog key is malformed', async () => {
    const s = setup();
    await s.run(s.put());
    const unrelated = 'dictionary/unrelated.json';
    s.objects.set(unrelated, {bytes: new TextEncoder().encode('untouched'), sha256: digest('untouched')});
    // Simulate legacy/out-of-band corruption despite the new identity guard.
    // Production cleanup must still refuse this arbitrary persisted key.
    s.sqlite.exec('DROP TRIGGER cloud_books_bytes_immutable');
    s.sqlite.prepare('UPDATE cloud_books SET object_key=? WHERE id=?').run(unrelated, id);
    expect((await s.run(s.remove())).status).toBe(200);
    expect(s.bucket.delete).not.toHaveBeenCalled();
    expect(s.objects.has(unrelated)).toBe(true);
    expect(await s.catalog()).toEqual({books: [], cursor: null});
  });

  it('blocks a PUT deleted after its initial check but before atomic reservation', async () => {
    const s = setup();
    s.hooks.beforeSql = async sql => {
      if (!sql.startsWith('INSERT INTO cloud_books')) return;
      delete s.hooks.beforeSql;
      expect((await s.run(s.remove())).status).toBe(200);
    };
    expect((await s.run(s.put())).status).toBe(410);
    expect(s.reserved()).toBeNull();
    expect(s.bucket.put).not.toHaveBeenCalled();
  });

  it('blocks a PUT deleted immediately after reservation', async () => {
    const s = setup();
    s.hooks.afterSql = async sql => {
      if (!sql.startsWith('INSERT INTO cloud_books')) return;
      delete s.hooks.afterSql;
      expect((await s.run(s.remove())).status).toBe(200);
    };
    expect((await s.run(s.put())).status).toBe(410);
    expect(s.reserved()).toBe(Buffer.byteLength(snapshot));
    expect(s.bucket.put).not.toHaveBeenCalled();
    expect(await s.catalog()).toEqual({books: [], cursor: null});
  });

  it('cleans a late R2 write when deletion happens while put is awaiting storage', async () => {
    const s = setup();
    s.hooks.beforePut = async () => {
      delete s.hooks.beforePut;
      expect((await s.run(s.remove())).status).toBe(200);
      expect(s.objects.size).toBe(0);
    };
    expect((await s.run(s.put())).status).toBe(410);
    expect(s.objects.size).toBe(0);
    expect(s.bucket.delete).toHaveBeenCalledTimes(2);
    expect(s.reserved()).toBe(Buffer.byteLength(snapshot));
    expect(s.sqlite.prepare('SELECT state FROM cloud_books').get()?.state).toBe('pending');
  });

  it('retains accounting for late uploads even when the subsequent cleanup fails', async () => {
    const s = setup();
    s.hooks.beforePut = async () => {
      delete s.hooks.beforePut;
      await s.run(s.remove());
      s.failures.remove = true;
    };
    expect((await s.run(s.put())).status).toBe(410);
    expect(s.objects.size).toBe(1);
    expect(s.reserved()).toBe(Buffer.byteLength(snapshot));
    expect(await s.catalog()).toEqual({books: [], cursor: null});
    s.failures.remove = false;
    await s.run(s.remove());
    expect(s.objects.size).toBe(0);
  });

  it('blocks publication when deletion occurs after the R2 write', async () => {
    const s = setup();
    s.hooks.afterPut = async () => {
      delete s.hooks.afterPut;
      expect((await s.run(s.remove())).status).toBe(200);
    };
    expect((await s.run(s.put())).status).toBe(410);
    expect(s.objects.size).toBe(0);
    expect(s.sqlite.prepare('SELECT state FROM cloud_books').get()?.state).toBe('pending');
  });

  it('atomically blocks publication when deletion commits after the last check', async () => {
    const s = setup();
    s.hooks.beforeSql = async sql => {
      if (!sql.startsWith('UPDATE cloud_books')) return;
      delete s.hooks.beforeSql;
      expect((await s.run(s.remove())).status).toBe(200);
    };
    expect((await s.run(s.put())).status).toBe(410);
    expect(s.sqlite.prepare('SELECT state FROM cloud_books').get()?.state).toBe('pending');
    expect(s.objects.size).toBe(0);
    expect(await s.catalog()).toEqual({books: [], cursor: null});
  });

  it('cannot recover a previously failed publication by resurrecting a deleted snapshot', async () => {
    const s = setup();
    s.failures.publish = true;
    expect((await s.run(s.put())).status).toBe(503);
    expect(s.objects.size).toBe(1);
    await s.run(s.remove());
    s.failures.publish = false;
    expect((await s.run(s.put())).status).toBe(410);
    expect(s.bucket.put).toHaveBeenCalledTimes(1);
    expect(s.objects.size).toBe(0);
  });

  it('does not start streaming a snapshot deleted while GET awaits R2', async () => {
    const s = setup();
    await s.run(s.put());
    s.hooks.afterGet = async () => {
      delete s.hooks.afterGet;
      await s.run(s.remove());
    };
    expect((await s.run(s.request(`/api/cloud/books/${id}`))).status).toBe(404);
  });

  it('bounds deletion pagination and lists only deleted IDs while normal catalog omits them', async () => {
    const s = setup();
    await s.run(s.put()); await s.run(s.put(otherId)); await s.run(s.put(thirdId));
    await s.run(s.remove()); await s.run(s.remove(thirdId));
    const first = await (await s.run(s.request('/api/cloud/deletions?limit=1'))).json();
    expect(first).toEqual({ids: [id], cursor: id});
    const second = await (await s.run(s.request(`/api/cloud/deletions?limit=1&cursor=${id}`))).json();
    expect(second).toEqual({ids: [thirdId], cursor: null});
    expect((await s.catalog()).books.map((book: {id: string}) => book.id)).toEqual([otherId]);
    for (const query of ['limit=0', 'limit=101', 'limit=-1', 'limit=1.5', 'cursor=bad']) {
      expect((await s.run(s.request(`/api/cloud/deletions?${query}`))).status).toBe(400);
    }
    expect((await s.run(s.remove('invalid'))).status).toBe(400);
    expect((await s.run(s.request('/api/cloud/deletions', {method: 'DELETE', headers: {Origin: origin}}))).status).toBe(405);
  });
});
