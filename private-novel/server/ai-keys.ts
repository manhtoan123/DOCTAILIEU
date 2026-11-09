/** `/keys` API for the editable Gemini key pool. Secrets are never echoed; callers only see masked values. */
import {keyHealthId,readKeyHealth,readKeyModelBlocks,keyHealthView,updateKeyHealth} from './ai-key-health';
import { secure } from './auth';
import { AI_KEYS_MAX, d1KeyStore, type KeyStore, type StoredKey } from './ai-key-store';
import { readAiKeyPool, type AiTranslateEnv } from './ai-translate';

/** Only Gemini-shaped keys are accepted, so a pasted Groq/OpenAI key can never enter the pool. */
export const GEMINI_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{30,45}$/;
const MAX_BODY_BYTES = 32 * 1024;
const WRITE_WINDOW_MS = 600000;
const WRITE_LIMIT = 30;
const writes = new Map<string, number[]>();

export function maskKey(secret: string): string { return `…${secret.slice(-4)}`; }

function rateLimited(id: string): boolean {
  const now = Date.now();
  const recent = (writes.get(id) ?? []).filter(at => now - at < WRITE_WINDOW_MS);
  if (recent.length >= WRITE_LIMIT) { writes.set(id, recent); return true; }
  recent.push(now);
  writes.set(id, recent);
  if (writes.size > 500) for (const [key, value] of writes) if (!value.some(at => now - at < WRITE_WINDOW_MS)) writes.delete(key);
  return false;
}

/** Accepts `{keys:[...]}` or `{text:"one key per line"}`; invalid entries are counted, not stored. */
export function parseKeyInput(value: unknown): string[] {
  const raw: unknown[] = [];
  if (typeof value === 'string') raw.push(...value.split(/\r?\n/));
  else if (Array.isArray(value)) raw.push(...value);
  return raw.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean);
}

async function handleAiKeysInternal(request: Request, env: AiTranslateEnv, override?: KeyStore): Promise<Response> {
  const keys = override ?? (env.DB ? d1KeyStore(env.DB) : undefined);
  const respond = (body: Record<string, unknown>, status = 200, changed = false): Response => {
    const response = secure(Response.json(body, { status }));
    if (changed) response.headers.set('X-AI-Keys-Changed', '1');
    return response;
  };
  const snapshot=async()=>{
    const stored=await keys!.list(),configured=readAiKeyPool(env),health=await readKeyHealth(env.DB);
    const entries=[...stored.map(row=>row.secret),...configured.map(row=>row.key)],hashes=await Promise.all(entries.map(keyHealthId)),blocks=await readKeyModelBlocks(env.DB,hashes);
    const rows=await Promise.all([...stored.map(row=>({id:row.id,label:row.label,secret:row.secret,createdAt:row.createdAt,source:'stored',selected:true})),...configured.map(row=>({id:`secret-${row.id}`,label:row.label,secret:row.key,createdAt:0,source:'secret',selected:!stored.length}))].map(async row=>{
      const healthId=await keyHealthId(row.secret),state=health.get(healthId);return {blockedModels:blocks.filter(block=>block.id===healthId).map(block=>block.model),id:row.id,label:row.label&&/^[\x20-\x7e]{1,40}$/.test(row.label)&&!row.label.includes(row.secret)&&!row.secret.includes(row.label)?row.label:'',masked:maskKey(row.secret),createdAt:row.createdAt,source:row.source,selected:row.selected,...keyHealthView(state)};
    }));
    return {keys:rows.filter(row=>row.status!=='disabled'),stored:stored.length,secretPool:configured.length,active:rows.filter(row=>row.selected&&row.status!=='disabled'&&row.status!=='cooling').length,excluded:rows.filter(row=>row.status==='disabled').length};
  };
  if (!keys) return respond({ error: 'keys_not_configured' }, 503);
  if (request.method === 'GET') return respond(await snapshot());
  if (request.method !== 'POST' && request.method !== 'DELETE') return respond({ error: 'method_not_allowed' }, 405);
  if (rateLimited(request.headers.get('CF-Connecting-IP') ?? 'local')) return respond({ error: 'too_many_requests' }, 429);

  if (request.method === 'DELETE') {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return respond({ error: 'invalid_id' }, 400);
    const configured=id.startsWith('secret-')?readAiKeyPool(env).find(row=>`secret-${row.id}`===id):undefined;
    if(configured&&!await updateKeyHealth(await keyHealthId(configured.key),{disabled:1,busy_until:0},env.DB))return respond({error:'key_state_unavailable'},503);
    const removed=configured?true:await keys.remove(id);
    return respond({ ...(await snapshot()), removed }, 200, removed);
  }

  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return respond({ error: 'request_too_large' }, 413);
  let body: unknown;
  try { body = JSON.parse(await request.text()); }
  catch { return respond({ error: 'invalid_json' }, 400); }
  const payload = body && typeof body === 'object' ? body as { keys?: unknown; text?: unknown; label?: unknown } : {};
  const candidates = [...parseKeyInput(payload.keys), ...parseKeyInput(payload.text)];
  if (!candidates.length) return respond({ error: 'no_keys' }, 400);
  const valid: string[] = [];
  for (const candidate of candidates) if (GEMINI_KEY_PATTERN.test(candidate) && !valid.includes(candidate)) valid.push(candidate);
  let rejected = candidates.length - valid.length;
  if (!valid.length) return respond({ error: 'invalid_key', rejected }, 400);
  const room = Math.max(0, AI_KEYS_MAX - await keys.count());
  if (!room) return respond({ error: 'keys_full', rejected }, 400);
  const accepted = valid.slice(0, room);
  rejected += valid.length - accepted.length;
  const label = typeof payload.label === 'string' && /^[\x20-\x7e]{1,40}$/.test(payload.label.trim()) ? payload.label.trim() : '';
  const added = await keys.add(accepted.map(secret => ({ label, secret })));
  return respond({ added, rejected, ...(await snapshot()) }, 200, added > 0);
}

export async function handleAiKeys(request:Request,env:AiTranslateEnv,override?:KeyStore):Promise<Response>{
  try{return await handleAiKeysInternal(request,env,override);}catch{return secure(Response.json({error:'key_state_unavailable'},{status:503}));}
}
