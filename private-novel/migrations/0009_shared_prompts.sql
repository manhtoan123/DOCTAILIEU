CREATE TABLE IF NOT EXISTS prompt_sync_meta(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO prompt_sync_meta(id,revision) VALUES(1,0);
CREATE TABLE IF NOT EXISTS shared_prompts(id TEXT PRIMARY KEY,profile TEXT,revision INTEGER NOT NULL,deleted INTEGER NOT NULL CHECK(deleted IN(0,1)));
CREATE INDEX IF NOT EXISTS shared_prompts_revision ON shared_prompts(revision);
