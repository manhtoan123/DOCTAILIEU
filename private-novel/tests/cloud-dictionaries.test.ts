import {createHash} from 'node:crypto';
import {describe, expect, it, vi} from 'vitest';
import type {D1Database, R2Bucket} from '@cloudflare/workers-types';
import {CLOUD_DICTIONARY_MANIFEST_KEY, handleCloudDictionaries, MAX_CLOUD_DICTIONARY_BYTES, MAX_CLOUD_DICTIONARY_MANIFEST_BYTES, type CloudDictionariesEnv} from '../server/cloud-dictionaries';

const token = 'b'.repeat(64);
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const encode = (value: string) => new TextEncoder().encode(value);
const content = encode('你好=xin chào\n世界=thế giới');
const sha256 = digest(content);
const entry = {kind: 'vp', name: 'Vietphrase.txt', sha256, bytes: content.length, objectKey: `dictionaries/v1/vp/${sha256}.txt`};
const blobPath = `/api/cloud/dictionaries/vp/${sha256}`;
interface Stored {data: Uint8Array; size: number; checksum?: string; key?: string; chunks?: Uint8Array[]; fail?: boolean}

function setup() {
  const objects = new Map<string, Stored>();
  const cancellations = vi.fn();
  const pulls = vi.fn();
  const bucket = {get: vi.fn(async (key: string) => {
    const stored = objects.get(key);
    if (!stored) return null;
    const chunks = stored.chunks ?? [stored.data];
    let index = 0;
    return {key: stored.key ?? key, size: stored.size,
      checksums: stored.checksum === undefined ? {} : {sha256: Uint8Array.from(Buffer.from(stored.checksum, 'hex')).buffer},
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls(key);
          if (stored.fail) return controller.error(new Error('Secret backend detail'));
          if (index === chunks.length) controller.close();
          else controller.enqueue(chunks[index++]);
        }, cancel: cancellations,
      }, {highWaterMark: 0}),
    };
  })};
  const env: CloudDictionariesEnv = {
    DB: {} as D1Database, AUTH_PASSWORD_HASH: '', CLOUD_ACCESS_TOKEN_HASH: digest(token), LIBRARY_BUCKET: bucket as unknown as R2Bucket,
  };
  function manifest(value: unknown = {version: 1, dictionaries: [entry]}) {
    const data = encode(JSON.stringify(value));
    objects.set(CLOUD_DICTIONARY_MANIFEST_KEY, {data, size: data.length});
  }
  const request = (path = '/api/cloud/dictionaries', init: RequestInit = {}) => {
    const headers = new Headers({Authorization: `Bearer ${token}`, Origin: 'https://example.test'});
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    return new Request(`https://example.test${path}`, {...init, headers});
  };
  const run = (path?: string, init?: RequestInit) => handleCloudDictionaries(request(path, init), env);
  manifest();
  objects.set(entry.objectKey, {data: content, size: content.length, checksum: sha256});
  return {objects, bucket, env, manifest, request, run, pulls, cancellations};
}

describe('cloud dictionary manifest and immutable streaming download', () => {
  it('authenticates both routes before R2 access, with no public fallback by default', async () => {
    const s = setup();
    for (const path of ['/api/cloud/dictionaries', blobPath]) {
      for (const Authorization of ['', `Bearer ${'a'.repeat(64)}`, 'Bearer invalid']) {
        const response = await s.run(path, {headers: {Authorization}});
        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      }
    }
    expect(s.bucket.get).not.toHaveBeenCalled();
  });

  it('fails closed for malformed auth or missing bucket and sanitizes binding errors', async () => {
    const s = setup();
    s.env.CLOUD_ACCESS_TOKEN_HASH = '';
    expect((await s.run()).status).toBe(503);
    expect(s.bucket.get).not.toHaveBeenCalled();
    s.env.CLOUD_ACCESS_TOKEN_HASH = digest(token);
    s.env.LIBRARY_BUCKET = undefined;
    expect((await s.run()).status).toBe(503);
    s.env.LIBRARY_BUCKET = s.bucket as unknown as R2Bucket;
    s.bucket.get.mockRejectedValueOnce(new Error('secret R2 detail'));
    const failed = await s.run();
    expect(failed.status).toBe(503);
    expect(await failed.text()).toBe('{"error":"dictionaries_unavailable"}');
  });

  it('returns only public manifest fields and an empty manifest when absent', async () => {
    const s = setup();
    const response = await s.run();
    expect(await response.json()).toEqual({version: 1, dictionaries: [{kind: entry.kind, name: entry.name, sha256, bytes: content.length}]});
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    s.objects.delete(CLOUD_DICTIONARY_MANIFEST_KEY);
    expect(await (await s.run()).json()).toEqual({version: 1, dictionaries: []});
    expect((await s.run(blobPath)).status).toBe(404);
  });

  it.each([
    {version: 2, dictionaries: [entry]},
    {version: 1, dictionaries: null},
    {version: 1, dictionaries: Array(11).fill(entry)},
    {version: 1, dictionaries: [entry, entry]},
    ...[{kind: 'unknown'}, {name: ''}, {name: 'x\n.txt'}, {name: 'x'.repeat(301)}, {sha256: 'A'.repeat(64)}, {bytes: 0}, {bytes: 1.5}, {bytes: MAX_CLOUD_DICTIONARY_BYTES + 1}, {objectKey: 'secret/file'}, {objectKey: `dictionaries/v1/vp/../${sha256}.txt`}]
      .map(patch => ({version: 1, dictionaries: [{...entry, ...patch}]})),
  ])('rejects corrupt manifest before any dictionary lookup: %j', async value => {
    const s = setup();
    s.manifest(value);
    const response = await s.run(blobPath);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error: 'dictionaries_unavailable'});
    expect(s.bucket.get).toHaveBeenCalledTimes(1);
  });

  it('bounds manifest metadata and actual stream bytes, rejects invalid UTF-8/JSON and truncation', async () => {
    const s = setup();
    const samples: Stored[] = [
      {data: encode('{}'), size: MAX_CLOUD_DICTIONARY_MANIFEST_BYTES + 1},
      {data: new Uint8Array(MAX_CLOUD_DICTIONARY_MANIFEST_BYTES + 1), size: 10},
      {data: encode('{}'), size: 3},
      {data: new Uint8Array([255]), size: 1},
      {data: encode('{'), size: 1},
    ];
    for (const stored of samples) {
      s.objects.set(CLOUD_DICTIONARY_MANIFEST_KEY, stored);
      expect((await s.run()).status).toBe(503);
    }
    expect(s.cancellations).toHaveBeenCalled();
  });

  it('does not expose arbitrary keys, encoded traversal or unlisted hash content', async () => {
    const s = setup();
    for (const path of [
      '/api/cloud/dictionaries/%2e%2e%2fsecret/' + sha256,
      '/api/cloud/dictionaries/vp/%2e%2e%2fsecret',
      '/api/cloud/dictionaries/vp/' + sha256 + '/extra',
      '/api/cloud/dictionaries/vp/' + 'c'.repeat(64),
    ]) expect([400, 404]).toContain((await s.run(path)).status);
    expect(s.bucket.get.mock.calls.every(([key]) => key === CLOUD_DICTIONARY_MANIFEST_KEY)).toBe(true);
  });

  it('rejects writes and unsupported methods without touching R2', async () => {
    const s = setup();
    for (const method of ['PUT', 'POST', 'DELETE', 'HEAD', 'OPTIONS']) {
      const response = await s.run(blobPath, {method});
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET');
    }
    expect(s.bucket.get).not.toHaveBeenCalled();
  });

  it('streams exact bytes on demand with binary type, SHA and private headers', async () => {
    const s = setup();
    s.objects.get(entry.objectKey)!.chunks = [content.subarray(0, 3), content.subarray(3)];
    const response = await s.run(blobPath);
    expect(response.status).toBe(200);
    expect(s.pulls.mock.calls.filter(([key]) => key === entry.objectKey)).toHaveLength(0);
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(response.headers.get('Content-Length')).toBe(String(content.length));
    expect(response.headers.get('X-Content-SHA256')).toBe(sha256);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(content);
  });

  it('accepts CLI objects without stored SHA metadata, leaving actual hashing to client', async () => {
    const s = setup();
    s.objects.get(entry.objectKey)!.checksum = undefined;
    const response = await s.run(blobPath);
    expect(response.status).toBe(200);
    expect(digest(new Uint8Array(await response.arrayBuffer()))).toBe(sha256);
  });

  it('rejects missing object, mismatched size/key and any present incorrect SHA', async () => {
    const s = setup();
    for (const patch of [{size: content.length + 1}, {key: 'elsewhere'}, {checksum: 'c'.repeat(64)}]) {
      s.objects.set(entry.objectKey, {data: content, size: content.length, checksum: sha256, ...patch});
      expect((await s.run(blobPath)).status).toBe(503);
    }
    expect(s.cancellations).toHaveBeenCalledTimes(3);
    s.objects.delete(entry.objectKey);
    expect((await s.run(blobPath)).status).toBe(503);
  });

  it('errors downstream on oversized/truncated/error streams and propagates cancellation', async () => {
    const s = setup();
    for (const patch of [{chunks: [new Uint8Array(content.length + 1)]}, {chunks: [content.subarray(1)]}, {fail: true}]) {
      s.objects.set(entry.objectKey, {data: content, size: content.length, checksum: sha256, ...patch});
      const response = await s.run(blobPath);
      expect(response.status).toBe(200);
      await expect(response.arrayBuffer()).rejects.toThrow('Dictionary stream unavailable');
    }
    s.objects.set(entry.objectKey, {data: content, size: content.length, checksum: sha256});
    const response = await s.run(blobPath);
    await response.body!.cancel('user stopped');
    expect(s.cancellations).toHaveBeenCalledWith('user stopped');
  });
});
