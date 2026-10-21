import type {R2Bucket, R2ObjectBody} from '@cloudflare/workers-types';
import {streamR2Body} from './r2-stream';
import {dictionaryKinds, type DictKind} from '../src/core/domain';
import {handleCloudDeviceAuth, type CloudDeviceEnv} from './cloud-device-auth';

export interface CloudDictionariesEnv extends CloudDeviceEnv { LIBRARY_BUCKET?: R2Bucket }
export const CLOUD_DICTIONARY_MANIFEST_KEY = 'dictionaries/v1/manifest.json';
export const MAX_CLOUD_DICTIONARY_BYTES = 80 * 1024 * 1024;
export const MAX_CLOUD_DICTIONARY_MANIFEST_BYTES = 16 * 1024;
interface DictionaryEntry { kind: DictKind; name: string; sha256: string; bytes: number; objectKey: string }
const hashPattern = /^[a-f0-9]{64}$/;
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
const error = (status: number, code: string) => Response.json({error: code}, {status});
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isKind = (value: unknown): value is DictKind => typeof value === 'string' && (dictionaryKinds as readonly string[]).includes(value);

function parseManifest(value: unknown): DictionaryEntry[] {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.dictionaries) || value.dictionaries.length > dictionaryKinds.length) throw new Error('Invalid manifest');
  const seen = new Set<DictKind>();
  return value.dictionaries.map((entry: unknown) => {
    if (!isRecord(entry) || !isKind(entry.kind) || seen.has(entry.kind)
      || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 300 || /[\u0000-\u001f\u007f]/.test(entry.name)
      || typeof entry.sha256 !== 'string' || !hashPattern.test(entry.sha256)
      || typeof entry.bytes !== 'number' || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > MAX_CLOUD_DICTIONARY_BYTES
      || entry.objectKey !== `dictionaries/v1/${entry.kind}/${entry.sha256}.txt`) throw new Error('Invalid dictionary');
    seen.add(entry.kind);
    return {kind: entry.kind, name: entry.name, sha256: entry.sha256, bytes: entry.bytes, objectKey: entry.objectKey};
  });
}

async function readManifest(bucket: R2Bucket): Promise<DictionaryEntry[]> {
  const object = await bucket.get(CLOUD_DICTIONARY_MANIFEST_KEY);
  if (!object) return [];
  if (object.key !== CLOUD_DICTIONARY_MANIFEST_KEY || !Number.isSafeInteger(object.size) || object.size <= 0 || object.size > MAX_CLOUD_DICTIONARY_MANIFEST_BYTES) {
    await object.body.cancel().catch(() => undefined);
    throw new Error('Invalid manifest size');
  }
  const reader = object.body.getReader();
  // Fixed maximum buffer; declared size alone never authorizes an unbounded read.
  const bytes = new Uint8Array(MAX_CLOUD_DICTIONARY_MANIFEST_BYTES);
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (length + chunk.value.byteLength > object.size) throw new Error('Manifest size mismatch');
      bytes.set(chunk.value, length);
      length += chunk.value.byteLength;
    }
    if (length !== object.size) throw new Error('Manifest size mismatch');
    return parseManifest(JSON.parse(new TextDecoder('utf-8', {fatal: true, ignoreBOM: false}).decode(bytes.subarray(0, length))));
  } catch (cause) {
    await reader.cancel().catch(() => undefined);
    throw cause;
  } finally { reader.releaseLock(); }
}


async function route(request: Request, env: CloudDictionariesEnv, waitUntil:(promise:Promise<unknown>)=>void): Promise<Response> {
  if (!env.LIBRARY_BUCKET) return error(503, 'cloud_not_configured');
  const match = /^\/api\/cloud\/dictionaries(?:\/([^/]+)\/([^/]+))?\/?$/.exec(new URL(request.url).pathname);
  if (!match) return error(404, 'not_found');
  if (request.method !== 'GET') return new Response(null, {status: 405, headers: {Allow: 'GET'}});
  const [, kind, sha256] = match;
  if (kind !== undefined && (!isKind(kind) || !hashPattern.test(sha256))) return error(400, 'invalid_dictionary');
  const entries = await readManifest(env.LIBRARY_BUCKET);
  if (kind === undefined) return Response.json({version: 1, dictionaries: entries.map(({kind, name, sha256, bytes}) => ({kind, name, sha256, bytes}))});
  const entry = entries.find(entry => entry.kind === kind && entry.sha256 === sha256);
  if (!entry) return error(404, 'not_found');
  const object = await env.LIBRARY_BUCKET.get(entry.objectKey);
  // CLI seed uploads may not carry a stored SHA-256. Verify it when available;
  // customMetadata is not proof. The client MUST hash bytes before installation.
  if (!object || object.key !== entry.objectKey || object.size !== entry.bytes
    || (object.checksums.sha256 !== undefined && hex(object.checksums.sha256) !== entry.sha256)) {
    if (object) await object.body.cancel().catch(() => undefined);
    return error(503, 'dictionary_unavailable');
  }
  return new Response(streamR2Body(object,entry.bytes,waitUntil), {headers: {
    'Content-Type': 'application/octet-stream', 'Content-Length': String(entry.bytes), 'X-Content-SHA256': entry.sha256,
  }});
}

export function handleCloudDictionaries(request: Request, env: CloudDictionariesEnv, waitUntil:(promise:Promise<unknown>)=>void=promise=>{void promise.catch(()=>{});}): Promise<Response> {
  return handleCloudDeviceAuth(request, env, async () => {
    try { return await route(request, env, waitUntil); }
    catch { return error(503, 'dictionaries_unavailable'); }
  });
}
