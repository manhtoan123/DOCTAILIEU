-- Permanent deletion markers also cover IDs not yet reserved by an in-flight PUT.
-- Keep cloud_books rows/bytes: a late or interrupted R2 upload may still consume
-- space after deletion. Reclaiming reservations needs a separate quiescence/GC design.
-- Additive only: existing immutable snapshots and auth tables remain unchanged.
CREATE TABLE IF NOT EXISTS cloud_book_deletions (
  id TEXT PRIMARY KEY NOT NULL,
  deleted_at INTEGER NOT NULL
);
