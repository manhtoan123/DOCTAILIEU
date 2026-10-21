import {handleAuth, safeEqual, sameOrigin, secure, type Env} from './auth';

export interface CloudDeviceEnv extends Env { CLOUD_ACCESS_TOKEN_HASH?: string; PUBLIC_LIBRARY?: string }
const hex256 = /^[a-f0-9]{64}$/;

function failure(status: number, error: string): Response {
  return secure(Response.json({error}, {status}));
}

/** Single-owner capability. Only its SHA-256 digest belongs in server secrets.
 * Tokens are accepted exclusively in Authorization, never cookies or URLs.
 * Rotating the configured digest revokes every device using the previous token.
 */
export async function handleCloudDeviceAuth(request: Request, env: CloudDeviceEnv, next: () => Promise<Response>): Promise<Response> {
  // Public read/write access is an explicit deployment choice. Reject typos so
  // neither credentials nor malformed flags can accidentally select this mode.
  if (env.PUBLIC_LIBRARY !== undefined && env.PUBLIC_LIBRARY !== '0' && env.PUBLIC_LIBRARY !== '1') return failure(503, 'cloud_auth_unavailable');
  if (env.PUBLIC_LIBRARY === '1') {
    try {
      if (!env.DB) return failure(503, 'cloud_auth_unavailable');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOrigin(request)) return failure(403, 'invalid_origin');
      const response=secure(await next());
      response.headers.set('X-Library-Access','public');
      return response;
    } catch {
      return failure(503, 'cloud_auth_unavailable');
    }
  }
  // Absence alone selects legacy sessions. Empty/malformed configuration cannot
  // silently downgrade a device-token deployment to cookie authentication.
  if (env.CLOUD_ACCESS_TOKEN_HASH === undefined) return handleAuth(request, env, next);
  try {
    const configured = env.CLOUD_ACCESS_TOKEN_HASH;
    if (!env.DB || typeof configured !== 'string' || !hex256.test(configured)) return failure(503, 'cloud_auth_unavailable');
    const authorization = /^([a-zA-Z]{6}) ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') ?? '');
    if (!authorization || authorization[1].toLowerCase() !== 'bearer') return failure(401, 'unauthorized');
    const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization[2])));
    const expected = new Uint8Array(32);
    for (let i = 0; i < expected.length; i++) expected[i] = parseInt(configured.slice(i * 2, i * 2 + 2), 16);
    if (!safeEqual(actual, expected)) return failure(401, 'unauthorized');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOrigin(request)) return failure(403, 'invalid_origin');
    return secure(await next());
  } catch {
    // Do not include binding exceptions, request headers, or capability material.
    return failure(503, 'cloud_auth_unavailable');
  }
}
