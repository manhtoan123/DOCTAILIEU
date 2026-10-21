-- 0006: Gemini key pool editable from the reader UI (no per-user auth: PUBLIC_LIBRARY=1).
-- Secrets are only ever read server-side; the HTTP API returns masked values.
CREATE TABLE IF NOT EXISTS ai_keys (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  secret TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_keys_secret_idx ON ai_keys(secret);
