import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {convertV4MiniflareOptions, Miniflare} from 'miniflare';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

// Independent synthetic runtime regression. The production handler is bundled
// in memory and executed by the installed workerd, at the deployment's date.
// No real dictionary, remote R2, credentials or production mutation is used.
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const large = new Uint8Array(43_687_000).fill(97);
const small = new TextEncoder().encode('字=word');
const bookId = '00000000-0000-4000-8000-000000000017';
const snapshot = new TextEncoder().encode(JSON.stringify({synthetic: 'a'.repeat(16 * 1024 * 1024)}));
const bookHash = digest(snapshot);
const bookKey = `books/v1/${bookId}/${bookHash}.json`;
const specs = [
  {kind: 'vp', name: 'synthetic-large.txt', bytes: large.length, sha256: digest(large)},
  {kind: 'hanviet', name: 'synthetic-small.txt', bytes: small.length, sha256: digest(small)},
].map(entry => ({...entry, objectKey: `dictionaries/v1/${entry.kind}/${entry.sha256}.txt`}));
let runtime: Miniflare;

beforeAll(async () => {
  const bundled = await build({
    stdin: {contents: `
      import {handleCloudDictionaries} from './server/cloud-dictionaries';
      import {handleCloudLibrary} from './server/cloud-library';
      let cancelled = 0, produced = 0;
      export default {
        async fetch(request, env, ctx) {
          if (new URL(request.url).pathname === '/review-cancel-state') return Response.json({cancelled, produced});
          const mode = new URL(request.url).searchParams.get('fixture');
          if (new URL(request.url).pathname.startsWith('/api/cloud/books')) {
            return handleCloudLibrary(request, env, promise => ctx.waitUntil(promise));
          }
          const bucket = mode ? {
            async get(key) {
              const object = await env.LIBRARY_BUCKET.get(key);
              if (!object || key.endsWith('manifest.json')) return object;
              const length = object.size + (mode === 'short' ? -1 : 1);
              const body = mode === 'cancel' ? new ReadableStream({
                pull(controller) {produced += 1024; controller.enqueue(new Uint8Array(1024));},
                cancel() {cancelled++;}
              }, {highWaterMark: 0}) : new Response(new Uint8Array(length)).body;
              return {key: object.key, size: object.size, checksums: object.checksums,
                body};
            }
          } : env.LIBRARY_BUCKET;
          return handleCloudDictionaries(request, {...env, LIBRARY_BUCKET: bucket}, promise => ctx.waitUntil(promise));
        }
      };`, resolveDir: process.cwd(), sourcefile: 'native-stream-review-entry.ts', loader: 'ts'},
    bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022',
  });
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundled.outputFiles[0].text,
    compatibilityDate: '2026-01-01',
    bindings: {PUBLIC_LIBRARY: '1'}, d1Databases: ['DB'], r2Buckets: ['LIBRARY_BUCKET'],
  }));
  const bucket = await runtime.getR2Bucket('LIBRARY_BUCKET');
  await bucket.put(specs[0].objectKey, large);
  await bucket.put(specs[1].objectKey, small);
  await bucket.put('dictionaries/v1/manifest.json', JSON.stringify({version: 1, dictionaries: specs}));
  await bucket.put(bookKey, snapshot, {sha256: bookHash, customMetadata: {sha256: bookHash}});
  const database = await runtime.getD1Database('DB');
  for (const migration of ['0002_cloud_library.sql', '0003_cloud_book_deletions.sql','0004_cloud_book_albums.sql']) {
    const statements = readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8')
      .replace(/^--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean);
    await database.batch(statements.map(statement => database.prepare(statement)));
  }
  await database.prepare("INSERT INTO cloud_books (id, title, sha256, bytes, state, object_key, updated_at) VALUES (?, 'Synthetic runtime review', ?, ?, 'ready', ?, 1)")
    .bind(bookId, bookHash, snapshot.length, bookKey).run();
}, 60_000);

afterAll(async () => {await runtime?.dispose();}, 30_000);

describe('independent workerd native dictionary streaming', () => {
  it('returns the complete 43,687,000-byte R2 object with exact SHA on three fresh requests', async () => {
    for (let run = 0; run < 3; run++) {
      const response = await runtime.dispatchFetch(`https://runtime.test/api/cloud/dictionaries/vp/${specs[0].sha256}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Library-Access')).toBe('public');
      expect(response.headers.get('Content-Length')).toBe(String(large.length));
      expect(response.headers.get('X-Content-SHA256')).toBe(specs[0].sha256);
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes.length).toBe(large.length);
      expect(digest(bytes)).toBe(specs[0].sha256);
    }
  }, 60_000);

  it.each(['short', 'long'])('rejects a native %s byte stream despite matching object metadata', async mode => {
    const response = await runtime.dispatchFetch(`https://runtime.test/api/cloud/dictionaries/hanviet/${specs[1].sha256}?fixture=${mode}`);
    expect(response.status).toBe(200);
    await expect(response.arrayBuffer()).rejects.toThrow();
  }, 30_000);

  it('streams a 16 MiB cloud book through the same native helper with real local D1 and R2', async () => {
    const response = await runtime.dispatchFetch(`https://runtime.test/api/cloud/books/${bookId}`, {headers: {'Accept-Encoding': 'identity'}});
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe(String(snapshot.length));
    expect(response.headers.get('X-Content-SHA256')).toBe(bookHash);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBe(snapshot.length);
    expect(digest(bytes)).toBe(bookHash);
  }, 30_000);

  it('propagates response cancellation through the native pipe to its upstream source', async () => {
    const response = await runtime.dispatchFetch(`https://runtime.test/api/cloud/dictionaries/vp/${specs[0].sha256}?fixture=cancel`);
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    await reader.cancel('review client stopped');
    reader.releaseLock();
    let cancelled = 0, produced = 0;
    for (let attempt = 0; attempt < 30 && !cancelled; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const state = await runtime.dispatchFetch('https://runtime.test/review-cancel-state');
      ({cancelled, produced} = (await state.json()) as {cancelled: number; produced: number});
    }
    expect(cancelled).toBe(1);
    expect(produced).toBeLessThan(large.length);
  }, 30_000);
});
