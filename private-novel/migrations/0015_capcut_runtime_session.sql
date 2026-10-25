-- Derived runtime credential only; never part of library/shared-state/backup.
CREATE TABLE IF NOT EXISTS capcut_runtime_session (
 bootstrap TEXT PRIMARY KEY,
 sealed TEXT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 blocked_until INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL
);
