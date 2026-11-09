-- Deployment-wide bounded diagnostics only; never source, prompts or credentials.
CREATE TABLE IF NOT EXISTS ai_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('request','chapter')),
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','error','cancelled','cache')),
  attempts INTEGER NOT NULL,
  event TEXT NOT NULL CHECK(length(event) <= 8192)
);
CREATE INDEX IF NOT EXISTS ai_log_started ON ai_log(started_at DESC, id);
