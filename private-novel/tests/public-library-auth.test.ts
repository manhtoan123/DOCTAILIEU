import {createHash} from 'node:crypto';
import type {D1Database} from '@cloudflare/workers-types';
import {describe, expect, it, vi} from 'vitest';
import {handleCloudDeviceAuth, type CloudDeviceEnv} from '../server/cloud-device-auth';

const origin = 'https://example.test';
// Synthetic fixtures only.
const token = 'ab'.repeat(32);
const digest = createHash('sha256').update(token).digest('hex');
const passwordHash = `pbkdf2-sha256:600000:${'a'.repeat(32)}:${'b'.repeat(64)}`;
function setup(flag: string | undefined = '1') {
  const query = {bind: vi.fn().mockReturnThis(), first: vi.fn(async () => ({expires_at: Date.now() + 60_000}))};
  const db = {prepare: vi.fn(() => query)};
  const env: CloudDeviceEnv = {DB: db as unknown as D1Database, AUTH_PASSWORD_HASH: '', PUBLIC_LIBRARY: flag};
  const next = vi.fn(async () => new Response('library', {headers: {'Cache-Control': 'public, max-age=3600'}}));
  return {env, db, query, next};
}
function request(method = 'GET', headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/cloud/books`, {method, headers});
}
function secureHeaders(response: Response) {
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  expect(response.headers.get('Set-Cookie')).toBeNull();
  expect(response.headers.get('WWW-Authenticate')).toBeNull();
  expect(response.headers.get('Location')).toBeNull();
}

describe('explicit public library access', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('permits anonymous %s without credentials or session lookup', async method => {
    const s = setup();
    const response = await handleCloudDeviceAuth(request(method), s.env, s.next);
    expect(response.status).toBe(200);secureHeaders(response);
    expect(s.next).toHaveBeenCalledOnce();expect(s.db.prepare).not.toHaveBeenCalled();
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('permits same-origin anonymous %s', async method => {
    const s = setup();
    const response = await handleCloudDeviceAuth(request(method, {Origin: origin}), s.env, s.next);
    expect(response.status).toBe(200);secureHeaders(response);
    expect(s.next).toHaveBeenCalledOnce();expect(s.db.prepare).not.toHaveBeenCalled();
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('blocks missing and hostile Origin on %s before downstream access', async method => {
    const s = setup();
    const headers: Record<string, string>[] = [{}, {Origin: 'null'}, {Origin: 'https://attacker.test'}, {Origin: `${origin}/`}, {Origin: 'http://example.test'}];
    for (const header of headers) {
      const response = await handleCloudDeviceAuth(request(method, header), s.env, s.next);
      expect(response.status).toBe(403);expect(await response.json()).toEqual({error: 'invalid_origin'});secureHeaders(response);
    }
    expect(s.next).not.toHaveBeenCalled();expect(s.db.prepare).not.toHaveBeenCalled();
  });
  it('only explicit public mode ignores old token/password config and stale credentials', async () => {
    const s = setup();
    for (const configured of [undefined, '', 'malformed', digest]) {
      s.env.CLOUD_ACCESS_TOKEN_HASH = configured;
      s.env.AUTH_PASSWORD_HASH = 'malformed';
      const requests: Record<string, string>[] = [{}, {Authorization: 'Bearer wrong', Cookie: '__Host-session=expired'}];
      for (const headers of requests) {
        const response = await handleCloudDeviceAuth(request('GET', headers), s.env, s.next);
        expect(response.status).toBe(200);secureHeaders(response);
      }
    }
    expect(s.next).toHaveBeenCalledTimes(8);expect(s.db.prepare).not.toHaveBeenCalled();
  });
  it('requires a DB binding even for public reads and mutations', async () => {
    const s = setup();
    const env = {...s.env, DB: undefined} as unknown as CloudDeviceEnv;
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const response = await handleCloudDeviceAuth(request(method, {Origin: origin}), env, s.next);
      expect(response.status).toBe(503);expect(await response.json()).toEqual({error: 'cloud_auth_unavailable'});secureHeaders(response);
    }
    expect(s.next).not.toHaveBeenCalled();
  });
  it('closes on downstream failures without leaking details', async () => {
    const s = setup();s.next.mockRejectedValueOnce(new Error('private binding details'));
    const response = await handleCloudDeviceAuth(request(), s.env, s.next);
    expect(response.status).toBe(503);expect(await response.json()).toEqual({error: 'cloud_auth_unavailable'});secureHeaders(response);
  });
  it('rejects malformed flags before either public or private authentication', async () => {
    const s = setup();s.env.CLOUD_ACCESS_TOKEN_HASH = digest;s.env.AUTH_PASSWORD_HASH = passwordHash;
    for (const flag of ['', 'true', 'false', 'yes', '01', ' 1', '1 ', '2', 1, true, null]) {
      const env = {...s.env, PUBLIC_LIBRARY: flag} as unknown as CloudDeviceEnv;
      const response = await handleCloudDeviceAuth(request('GET', {Authorization: `Bearer ${token}`, Cookie: `__Host-session=${token}`}), env, s.next);
      expect(response.status).toBe(503);expect(await response.json()).toEqual({error: 'cloud_auth_unavailable'});secureHeaders(response);
    }
    expect(s.next).not.toHaveBeenCalled();expect(s.db.prepare).not.toHaveBeenCalled();
  });
});

describe.each([undefined, '0'])('private compatibility with PUBLIC_LIBRARY=%s', flag => {
  it('preserves SHA bearer verification and malformed-hash fail closed behavior', async () => {
    const s = setup();s.env.PUBLIC_LIBRARY = flag;s.env.CLOUD_ACCESS_TOKEN_HASH = digest;
    for (const Authorization of ['', 'Bearer malformed', `Bearer ${'cd'.repeat(32)}`]) {
      expect((await handleCloudDeviceAuth(request('GET', {Authorization}), s.env, s.next)).status).toBe(401);
    }
    expect((await handleCloudDeviceAuth(request('GET', {Authorization: `Bearer ${token}`}), s.env, s.next)).status).toBe(200);
    s.env.AUTH_PASSWORD_HASH = passwordHash;
    for (const configured of ['', 'bad', digest.toUpperCase()]) {
      s.env.CLOUD_ACCESS_TOKEN_HASH = configured;
      expect((await handleCloudDeviceAuth(request('GET', {Cookie: `__Host-session=${token}`}), s.env, s.next)).status).toBe(503);
    }
    expect(s.next).toHaveBeenCalledOnce();expect(s.db.prepare).not.toHaveBeenCalled();
  });
  it('preserves legacy sessions only with absent token hash', async () => {
    const s = setup();s.env.PUBLIC_LIBRARY = flag;
    expect((await handleCloudDeviceAuth(request(), s.env, s.next)).status).toBe(503);
    s.env.AUTH_PASSWORD_HASH = passwordHash;
    expect((await handleCloudDeviceAuth(request(), s.env, s.next)).status).toBe(401);
    expect((await handleCloudDeviceAuth(request('GET', {Cookie: `__Host-session=${token}`}), s.env, s.next)).status).toBe(200);
    expect(s.next).toHaveBeenCalledOnce();expect(s.db.prepare).toHaveBeenCalledOnce();
    expect(s.query.bind).toHaveBeenCalledWith(digest);
  });
});
