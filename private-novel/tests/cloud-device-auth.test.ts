import {describe, expect, it, vi} from 'vitest';
import {createHash} from 'node:crypto';
import type {D1Database, R2Bucket} from '@cloudflare/workers-types';
import {handleCloudDeviceAuth, type CloudDeviceEnv} from '../server/cloud-device-auth';
import {handleCloudLibrary, type CloudLibraryEnv} from '../server/cloud-library';

// Synthetic fixture capabilities, never production credentials.
const token = 'ab'.repeat(32);
const wrongToken = 'cd'.repeat(32);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const origin = 'https://example.test';
function setup() {
  const prepared = {bind: vi.fn().mockReturnThis(), first: vi.fn(async () => ({expires_at: Date.now() + 60_000})), all: vi.fn(async () => ({results: [], success: true})), run: vi.fn(async () => ({success: true}))};
  const db = {prepare: vi.fn(() => prepared)};
  const bucket = {get: vi.fn(), put: vi.fn(), head: vi.fn()};
  const env: CloudLibraryEnv = {DB: db as unknown as D1Database, AUTH_PASSWORD_HASH: '', CLOUD_ACCESS_TOKEN_HASH: digest(token), LIBRARY_BUCKET: bucket as unknown as R2Bucket};
  const next = vi.fn(async () => Response.json({private: true}));
  return {env, db, bucket, next};
}
function request(headers: Record<string, string> = {}, method = 'GET', suffix = '') {
  return new Request(`${origin}/api/cloud/books${suffix}`, {method, headers});
}
function authorized(method = 'GET', extra: Record<string, string> = {}) {
  return request({Authorization: `Bearer ${token}`, ...(method === 'GET' ? {} : {Origin: origin}), ...extra}, method);
}

describe('cloud device capability gate', () => {
  it('fails closed for malformed configured digest or missing D1 without invoking storage', async () => {
    const s = setup();
    for (const configured of ['', 'wrong', 'A'.repeat(64), 'a'.repeat(63), `${digest(token)} `]) {
      s.env.CLOUD_ACCESS_TOKEN_HASH = configured;
      expect((await handleCloudDeviceAuth(authorized(), s.env, s.next)).status).toBe(503);
    }
    const missingDb = {...s.env, CLOUD_ACCESS_TOKEN_HASH: digest(token), DB: undefined} as unknown as CloudDeviceEnv;
    expect((await handleCloudDeviceAuth(authorized(), missingDb, s.next)).status).toBe(503);
    expect(s.db.prepare).not.toHaveBeenCalled();expect(s.next).not.toHaveBeenCalled();
  });
  it('uses identical generic 401 responses for absent, malformed and wrong capabilities', async () => {
    const s = setup();
    for (const Authorization of ['', `Bearer ${wrongToken}`, `Basic ${token}`, `Bearer ${token.toUpperCase()}`, `Bearer ${token}x`, `Bearer  ${token}`, `Bearer ${token}, Bearer ${token}`]) {
      const response = await handleCloudDeviceAuth(request({Authorization}), s.env, s.next);
      expect(response.status).toBe(401);expect(await response.json()).toEqual({error: 'unauthorized'});
      expect(response.headers.get('Set-Cookie')).toBeNull();expect(response.headers.get('Location')).toBeNull();
    }
    expect(s.next).not.toHaveBeenCalled();expect(s.db.prepare).not.toHaveBeenCalled();
  });
  it('never accepts cookie-only or query credentials, including a valid legacy session', async () => {
    const s = setup();s.env.AUTH_PASSWORD_HASH = `pbkdf2-sha256:600000:${'a'.repeat(32)}:${'b'.repeat(64)}`;
    for (const req of [request({Cookie: `__Host-session=${token}`}), request({}, 'GET', `?token=${token}`), request({}, 'GET', `?access_token=${token}`), request({Cookie: `cloud-token=${token}`})]) {
      expect((await handleCloudDeviceAuth(req, s.env, s.next)).status).toBe(401);
    }
    s.env.CLOUD_ACCESS_TOKEN_HASH = '';
    expect((await handleCloudDeviceAuth(request({Cookie: `__Host-session=${token}`}), s.env, s.next)).status).toBe(503);
    expect(s.db.prepare).not.toHaveBeenCalled();expect(s.next).not.toHaveBeenCalled();
  });
  it('accepts correct bearer digest without a password or session lookup and applies private headers', async () => {
    const s = setup();
    for (const scheme of ['Bearer', 'bearer', 'BEARER']) {
      const response = await handleCloudDeviceAuth(request({Authorization: `${scheme} ${token}`}), s.env, s.next);
      expect(response.status).toBe(200);expect(await response.json()).toEqual({private: true});
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    }
    expect(s.db.prepare).not.toHaveBeenCalled();expect(s.next).toHaveBeenCalledTimes(3);
  });
  it('enforces same origin on every unsafe method before downstream actions', async () => {
    const s = setup();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const Origin of ['', 'null', 'https://evil.test', `${origin}/`]) {
        const response = await handleCloudDeviceAuth(authorized(method, {Origin}), s.env, s.next);
        expect(response.status).toBe(403);expect(await response.json()).toEqual({error: 'invalid_origin'});
      }
      expect((await handleCloudDeviceAuth(authorized(method), s.env, s.next)).status).toBe(200);
    }
    expect(s.next).toHaveBeenCalledTimes(4);
  });
  it('rotation revokes the old token immediately, and generic errors never echo token/hash/exception', async () => {
    const s = setup();s.env.CLOUD_ACCESS_TOKEN_HASH = digest(wrongToken);
    expect((await handleCloudDeviceAuth(authorized(), s.env, s.next)).status).toBe(401);
    expect((await handleCloudDeviceAuth(request({Authorization: `Bearer ${wrongToken}`}), s.env, s.next)).status).toBe(200);
    const response = await handleCloudDeviceAuth(request({Authorization: `Bearer ${wrongToken}`}), s.env, async () => {throw new Error(`${wrongToken}:${digest(wrongToken)}:private binding`);});
    expect(response.status).toBe(503);expect(await response.json()).toEqual({error: 'cloud_auth_unavailable'});
  });
  it('retains legacy session behavior only when token configuration is undefined', async () => {
    const s = setup();delete s.env.CLOUD_ACCESS_TOKEN_HASH;
    expect((await handleCloudDeviceAuth(authorized(), s.env, s.next)).status).toBe(503);
    s.env.AUTH_PASSWORD_HASH = `pbkdf2-sha256:600000:${'a'.repeat(32)}:${'b'.repeat(64)}`;
    expect((await handleCloudDeviceAuth(authorized(), s.env, s.next)).status).toBe(401);
    expect((await handleCloudDeviceAuth(request({Cookie: `__Host-session=${token}`}), s.env, s.next)).status).toBe(200);
    expect(s.db.prepare).toHaveBeenCalledTimes(1);expect(s.next).toHaveBeenCalledTimes(1);
  });
  it('gates actual cloud routes before D1/R2 access and leaves unsupported mutations disabled', async () => {
    const s = setup();
    const untrusted = request({'Content-Type': 'application/json', 'X-Content-SHA256': 'a'.repeat(64), Origin: origin}, 'PUT', '/00000000-0000-4000-8000-000000000001');
    expect((await handleCloudLibrary(untrusted, s.env)).status).toBe(401);
    expect(s.db.prepare).not.toHaveBeenCalled();expect(s.bucket.put).not.toHaveBeenCalled();
    const list = await handleCloudLibrary(authorized(), s.env);
    expect(list.status).toBe(200);expect(await list.json()).toEqual({books: [], cursor: null});
    expect(s.db.prepare).toHaveBeenCalledTimes(1);
    expect((await handleCloudLibrary(authorized('DELETE'), s.env)).status).toBe(405);
    expect(s.bucket.put).not.toHaveBeenCalled();
  });
});
