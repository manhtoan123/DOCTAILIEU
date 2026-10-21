-- Safe metadata only. Disabled secrets remain excluded across isolates/restarts.
CREATE TABLE IF NOT EXISTS ai_key_health (
  id TEXT PRIMARY KEY,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
  last_used_at INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER NOT NULL DEFAULT 0,
  busy_until INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS ai_key_cooldowns (
  id TEXT NOT NULL,
  model TEXT NOT NULL,
  cooldown_until INTEGER NOT NULL,
  PRIMARY KEY(id,model)
);
