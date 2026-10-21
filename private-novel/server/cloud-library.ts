import type {R2Bucket, R2Object} from '@cloudflare/workers-types';
import {streamR2Body} from './r2-stream';
import {handleCloudDeviceAuth, type CloudDeviceEnv} from './cloud-device-auth';
import {routeCloudOriginals,cleanupCloudOriginals} from './cloud-originals';

export interface CloudLibraryEnv extends CloudDeviceEnv { LIBRARY_BUCKET?: R2Bucket;SHARED_STATE_ENABLED?:string }
export const MAX_CLOUD_SNAPSHOT_BYTES = 64 * 1024 * 1024;
export const CLOUD_STORAGE_BUDGET_BYTES = 9_000_000_000;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hashPattern = /^[a-f0-9]{64}$/;
interface CatalogRow {
  id: string; title: string; displayTitle?: string; album: string; author?:string; cover?:string; sha256: string; bytes: number;
  state: 'pending' | 'ready'; object_key: string; updated_at: number;
}
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const error = (status: number, code: string) => Response.json({error: code}, {status});
class BodyTooLarge extends Error {}

// Never trust Content-Length: count actual streamed bytes before any reservation/write.
async function boundedBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_CLOUD_SNAPSHOT_BYTES)) throw new BodyTooLarge();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_CLOUD_SNAPSHOT_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLarge();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function matchingObject(object: R2Object | null, row: CatalogRow): boolean {
  return object !== null && object.key === row.object_key && object.size === row.bytes
    && object.customMetadata?.sha256 === row.sha256
    && object.checksums.sha256 !== undefined && hex(object.checksums.sha256) === row.sha256;
}

async function isDeleted(env: CloudLibraryEnv, id: string): Promise<boolean> {
  return (await env.DB.prepare('SELECT id FROM cloud_book_deletions WHERE id=?').bind(id).first()) !== null;
}

async function cleanupDeletedObject(env: CloudLibraryEnv, row: CatalogRow): Promise<void> {
  // Never trust an arbitrary stored path for deletion. This exact immutable key
  // belongs to this UUID/hash only, and its reservation is retained even on success.
  if (!uuid.test(row.id) || !hashPattern.test(row.sha256)
    || row.object_key !== `books/v1/${row.id}/${row.sha256}.json`) return;
  // Tombstone is already committed. R2 failure must not undo logical deletion;
  // repeating DELETE retries cleanup. A crashed late PUT can still leave an orphan.
  await env.LIBRARY_BUCKET!.delete(row.object_key).catch(() => undefined);
}

async function route(request: Request, env: CloudLibraryEnv, waitUntil:(promise:Promise<unknown>)=>void): Promise<Response> {
  if (!env.LIBRARY_BUCKET) return error(503, 'cloud_not_configured');
  const url = new URL(request.url);
  if(/^\/api\/cloud\/books\/[^/]+\/originals(?:\/|$)/.test(url.pathname))return routeCloudOriginals(request,env,waitUntil);
  const deletions = url.pathname === '/api/cloud/deletions';
  const match = /^\/api\/cloud\/books(?:\/([^/]+))?$/.exec(url.pathname);
  if (!match && !deletions) return error(404, 'not_found');
  const id = match?.[1];
  if (id !== undefined && !uuid.test(id)) return error(400, 'invalid_book_id');
  if (request.method !== 'GET' && !(['PUT', 'DELETE'].includes(request.method) && id)) {
    return new Response(null, {status: 405, headers: {Allow: id ? 'GET, PUT, DELETE' : 'GET'}});
  }
  if (request.method === 'GET' && !id) {
    const cursor = url.searchParams.get('cursor') ?? '';
    const rawLimit = url.searchParams.get('limit') ?? '100';
    if ((cursor && !uuid.test(cursor)) || !/^\d{1,3}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100) return error(400, 'invalid_pagination');
    const limit = Number(rawLimit);
    if (deletions) {
      const result = await env.DB.prepare('SELECT id FROM cloud_book_deletions WHERE id > ? ORDER BY id LIMIT ?')
        .bind(cursor, limit + 1).all<{id: string}>();
      const ids = result.results.slice(0, limit).map(row => row.id);
      return Response.json({ids, cursor: result.results.length > limit ? ids[ids.length - 1] : null});
    }
    const result = await env.DB.prepare(env.SHARED_STATE_ENABLED==='1'?"SELECT b.id,COALESCE(json_extract(s.record,'$.value.title'),b.title) title,json_extract(s.record,'$.value.displayTitle') displayTitle,json_extract(s.record,'$.value.cover') cover,COALESCE(json_extract(s.record,'$.value.author'),'') author,CASE WHEN s.id IS NULL THEN b.album ELSE COALESCE(json_extract(s.record,'$.value.album'),'') END album,b.sha256,b.bytes,b.updated_at FROM cloud_books b LEFT JOIN shared_state s ON s.scope=b.id AND s.kind='book' AND s.deleted=0 WHERE b.state='ready' AND b.id>? AND NOT EXISTS(SELECT 1 FROM cloud_book_deletions WHERE id=b.id) ORDER BY b.id LIMIT ?":"SELECT id, title, album, sha256, bytes, updated_at FROM cloud_books WHERE state='ready' AND id > ? AND NOT EXISTS (SELECT 1 FROM cloud_book_deletions WHERE id=cloud_books.id) ORDER BY id LIMIT ?")
      .bind(cursor, limit + 1).all<CatalogRow>();
    const rows = result.results.slice(0, limit);
    let features: {originalsV1:boolean}|undefined;
    if(url.searchParams.get('features')==='1'){
      let originalsV1=false;
      try{originalsV1=!!await env.DB.prepare('SELECT used_bytes FROM cloud_storage_budget WHERE id=1').first()&&!!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cloud_originals'").first();}catch{/* Old schema still serves v1 catalog. */}
      features={originalsV1};
    }
    return Response.json({books: rows.map(row => ({id: row.id, title: row.title, ...(row.displayTitle?{displayTitle:row.displayTitle}:{}), ...(row.album?{album:row.album}:{}),...(row.author?{author:row.author}:{}),...(row.cover?{cover:JSON.parse(row.cover)}:{}), sha256: row.sha256, bytes: row.bytes, updatedAt: row.updated_at})), cursor: result.results.length > limit ? rows[rows.length - 1].id : null,...(features?{features}:{})});
  }
  if (!id) return error(404, 'not_found');
  if (request.method === 'DELETE') {
    // This single primary-key write is the linearization point. It precedes all
    // cleanup and blocks both reservation and publication in concurrent PUTs.
    await env.DB.prepare('INSERT INTO cloud_book_deletions (id, deleted_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING')
      .bind(id, Date.now()).run();
    const row = await env.DB.prepare('SELECT * FROM cloud_books WHERE id=?').bind(id).first<CatalogRow>();
    if (row) await cleanupDeletedObject(env, row);
    await cleanupCloudOriginals(env,id);
    return Response.json({id, deleted: true});
  }
  if (request.method === 'GET') {
    const row = await env.DB.prepare("SELECT * FROM cloud_books WHERE id=? AND state='ready' AND NOT EXISTS (SELECT 1 FROM cloud_book_deletions WHERE id=cloud_books.id)").bind(id).first<CatalogRow>();
    if (!row) return error(404, 'not_found');
    const object = await env.LIBRARY_BUCKET.get(row.object_key);
    if (await isDeleted(env, id)) {
      if (object) await object.body.cancel().catch(() => undefined);
      return error(404, 'not_found');
    }
    if (!matchingObject(object, row)) {
      if (object) await object.body.cancel().catch(() => undefined);
      return error(503, 'snapshot_unavailable');
    }
    const body=streamR2Body(object!,row.bytes,waitUntil);
    return new Response(body, {headers: {'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(row.bytes), 'X-Content-SHA256': row.sha256}});
  }
  if (await isDeleted(env, id)) return error(410, 'book_deleted');
  // No original-writer enablement without migration; old v1 SQL is also guarded
  // by migration triggers during a mixed-version rollout.
  const ledger=await env.DB.prepare('SELECT used_bytes FROM cloud_storage_budget WHERE id=1').first<{used_bytes:number}>();
  if(!ledger)return error(503,'storage_migration_required');
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') ?? '')) return error(415, 'json_required');
  const expectedHash = request.headers.get('X-Content-SHA256') ?? '';
  const encodedTitle = request.headers.get('X-Book-Title') ?? '';
  let title: string;
  try { title = encodedTitle.length <= 2700 ? decodeURIComponent(encodedTitle) : ''; } catch { return error(400, 'invalid_title'); }
  if (!title.trim() || title.length > 300 || /[\u0000-\u001f\u007f]/.test(title)) return error(400, 'invalid_title');
  // Optional v1 extension; bound encoded input before decoding or any write.
  const encodedAlbum = request.headers.get('X-Book-Album') ?? '';
  let album: string;
  try {
    if (encodedAlbum.length > 1080) return error(400, 'invalid_album');
    album = decodeURIComponent(encodedAlbum);
    if (/[\u0000-\u001f\u007f]/.test(album)) return error(400, 'invalid_album');
    album = album.trim();
    if (album.length > 120) return error(400, 'invalid_album');
  } catch { return error(400, 'invalid_album'); }
  if (!hashPattern.test(expectedHash)) return error(400, 'invalid_sha256');
  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = await boundedBody(request); } catch (cause) {
    if (cause instanceof BodyTooLarge) return error(413, 'snapshot_too_large');
    return error(400, 'snapshot_read_failed');
  }
  if (!bytes.byteLength) return error(400, 'empty_snapshot');
  const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
  if (sha256 !== expectedHash) return error(400, 'snapshot_hash_mismatch');
  // Opaque version-1 snapshot: client validates its JSON schema before import. Do not
  // parse text here (large Unicode/JSON copies multiply the bounded Worker memory).
  const objectKey = `books/v1/${id}/${sha256}.json`;
  // One SQLite statement serializes both the budget check and reservation. Pending
  // entries count forever; a failure can be retried but never silently frees space.
  try{await env.DB.prepare(`INSERT INTO cloud_books (id, title, album, sha256, bytes, state, object_key, updated_at)
    SELECT ?, ?, ?, ?, ?, 'pending', ?, ?
    WHERE (SELECT used_bytes FROM cloud_storage_budget WHERE id=1) + ? <= ?
      AND NOT EXISTS (SELECT 1 FROM cloud_book_deletions WHERE id=?)
    ON CONFLICT(id) DO NOTHING`)
    .bind(id, title, album, sha256, bytes.byteLength, objectKey, Date.now(), bytes.byteLength, CLOUD_STORAGE_BUDGET_BYTES, id).run();
  }catch(e){if(String(e).includes('cloud_storage_budget_exceeded'))return error(507,'cloud_storage_budget_exceeded');if(String(e).includes('immutable_storage_bytes'))return error(409,'immutable_snapshot_conflict');throw e;}
  const row = await env.DB.prepare('SELECT * FROM cloud_books WHERE id=?').bind(id).first<CatalogRow>();
  if (await isDeleted(env, id)) return error(410, 'book_deleted');
  if (!row) return error(507, 'cloud_storage_budget_exceeded');
  if (row.sha256 !== sha256 || row.bytes !== bytes.byteLength || row.object_key !== objectKey) return error(409, 'immutable_snapshot_conflict');
  if (row.state === 'ready') return Response.json({id, sha256});
  // Conditional create prevents retry/concurrent writes from replacing an object.
  const written = await env.LIBRARY_BUCKET.put(objectKey, bytes, {
    onlyIf: {etagDoesNotMatch: '*'}, sha256,
    httpMetadata: {contentType: 'application/json'}, customMetadata: {sha256},
  });
  const stored = written ?? await env.LIBRARY_BUCKET.head(objectKey);
  if (await isDeleted(env, id)) {
    await cleanupDeletedObject(env, row);
    return error(410, 'book_deleted');
  }
  if (!matchingObject(stored, row)) return error(503, 'snapshot_unavailable');
  const published = await env.DB.prepare("UPDATE cloud_books SET state='ready' WHERE id=? AND sha256=? AND bytes=? AND object_key=? AND NOT EXISTS (SELECT 1 FROM cloud_book_deletions WHERE id=cloud_books.id) RETURNING id")
    .bind(id, sha256, bytes.byteLength, objectKey).first<{id: string}>();
  if (!published) {
    if (await isDeleted(env, id)) {
      await cleanupDeletedObject(env, row);
      return error(410, 'book_deleted');
    }
    return error(503, 'snapshot_publish_failed');
  }
  return Response.json({id, sha256}, {status: 201});
}

export function handleCloudLibrary(request: Request, env: CloudLibraryEnv, waitUntil:(promise:Promise<unknown>)=>void=promise=>{void promise.catch(()=>{});}): Promise<Response> {
  // Required even when the outer Pages middleware intentionally permits public UI.
  return handleCloudDeviceAuth(request, env, async () => {
    try { return await route(request, env, waitUntil); } catch (failure) {
      // D1 wraps binding failures in Error.cause. Expose only an allowlisted
      // category, never exception text, SQL, credentials or stored content.
      let cause:unknown=failure;
      for(let depth=0;depth<4&&cause instanceof Error;depth++,cause=cause.cause){
        if(/exceeded D1's free tier daily row read limit/i.test(cause.message)){
          const now=new Date(),reset=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1);
          return Response.json({error:'cloud_read_limit'},{status:503,headers:{'Retry-After':String(Math.max(1,Math.ceil((reset-now.getTime())/1000)))}});
        }
      }
      return error(503, 'cloud_unavailable');
    }
  });
}
