-- Add-only snapshot catalog. Pending reservations survive interrupted R2 writes.
-- No existing auth tables or local IndexedDB schemas are changed.
CREATE TABLE IF NOT EXISTS cloud_books (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 300),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  bytes INTEGER NOT NULL CHECK(bytes > 0 AND bytes <= 67108864),
  state TEXT NOT NULL CHECK(state IN ('pending', 'ready')),
  object_key TEXT NOT NULL UNIQUE,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cloud_books_ready_id ON cloud_books(state, id);
