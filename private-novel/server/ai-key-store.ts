/** Editable Gemini key pool store. D1 rows are secrets: they are never returned to a caller. */
import type {D1Database} from '@cloudflare/workers-types';

export interface StoredKey { id: string; label: string; secret: string; createdAt: number }
export interface KeyStore {
  list(): Promise<StoredKey[]>;
  count(): Promise<number>;
  add(entries: { label: string; secret: string }[]): Promise<number>;
  remove(id: string): Promise<boolean>;
}

export const AI_KEYS_MAX = 50;

function storedKey(value: Record<string, unknown>): StoredKey | undefined {
  const id = value.id, secret = value.secret;
  if (typeof id !== 'string' || !id || typeof secret !== 'string' || secret.length < 8) return undefined;
  return { id, label: typeof value.label === 'string' ? value.label : '', secret, createdAt: Number(value.created_at) || 0 };
}
function changes(result: { meta?: { changes?: number } } | null | undefined): number {
  const value = Number(result?.meta?.changes);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export function d1KeyStore(db: D1Database): KeyStore {
  return {
    async list() {
      try {
        const result = await db.prepare('SELECT id,label,secret,created_at FROM ai_keys ORDER BY created_at, id LIMIT ?').bind(AI_KEYS_MAX).all<Record<string, unknown>>();
        return (result.results ?? []).flatMap(value => { const parsed = storedKey(value); return parsed ? [parsed] : []; });
      } catch { return []; }
    },
    async count() {
      try {
        const result = await db.prepare('SELECT COUNT(*) AS total FROM ai_keys').first<{ total?: unknown }>();
        const total = Number(result?.total);
        return Number.isSafeInteger(total) && total > 0 ? total : 0;
      } catch { return 0; }
    },
    async add(entries) {
      let added = 0;
      for (const entry of entries) {
        try {
          const result = await db.prepare('INSERT INTO ai_keys (id,label,secret,created_at) VALUES (?,?,?,?) ON CONFLICT(secret) DO NOTHING')
            .bind(crypto.randomUUID(), entry.label, entry.secret, Date.now()).run();
          added += changes(result as { meta?: { changes?: number } });
        } catch { /* One rejected row never aborts the rest of the batch. */ }
      }
      return added;
    },
    async remove(id) {
      try {
        const result = await db.prepare('DELETE FROM ai_keys WHERE id=?').bind(id).run();
        return changes(result as { meta?: { changes?: number } }) > 0;
      } catch { return false; }
    },
  };
}
