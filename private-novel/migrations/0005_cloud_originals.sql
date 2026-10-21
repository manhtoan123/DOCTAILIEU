-- Additive quota ledger. Retain reservations forever in this version, including
-- tombstoned/pending entries. This protects old v1 writers during rolling deploys.
CREATE TABLE IF NOT EXISTS cloud_storage_budget (
  id INTEGER PRIMARY KEY CHECK(id=1),
  used_bytes INTEGER NOT NULL CHECK(used_bytes>=0 AND used_bytes<=9000000000)
);
CREATE TABLE IF NOT EXISTS cloud_originals (
  book_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  descriptor_json TEXT NOT NULL CHECK(length(descriptor_json)<=16384),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 41943040),
  object_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('pending','ready')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(book_id,source_id)
);
CREATE TRIGGER IF NOT EXISTS cloud_books_budget_guard BEFORE INSERT ON cloud_books
WHEN NOT EXISTS(SELECT 1 FROM cloud_books WHERE id=NEW.id)
BEGIN
  SELECT (CASE WHEN (SELECT used_bytes FROM cloud_storage_budget WHERE id=1) IS NULL
    OR (SELECT used_bytes FROM cloud_storage_budget WHERE id=1)+NEW.bytes>9000000000
    THEN RAISE(ABORT,'cloud_storage_budget_exceeded') END);
END;
CREATE TRIGGER IF NOT EXISTS cloud_books_budget_charge AFTER INSERT ON cloud_books
BEGIN UPDATE cloud_storage_budget SET used_bytes=used_bytes+NEW.bytes WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS cloud_books_bytes_immutable BEFORE UPDATE ON cloud_books
WHEN NEW.bytes!=OLD.bytes OR NEW.id!=OLD.id OR NEW.sha256!=OLD.sha256 OR NEW.object_key!=OLD.object_key
BEGIN SELECT RAISE(ABORT,'immutable_storage_bytes'); END;
-- REPLACE can bypass DELETE triggers when recursive_triggers is disabled.
-- Enforce immutable identities before conflict resolution as well as UPDATE.
CREATE TRIGGER IF NOT EXISTS cloud_books_insert_identity BEFORE INSERT ON cloud_books
WHEN EXISTS(SELECT 1 FROM cloud_books WHERE id=NEW.id AND
  (bytes!=NEW.bytes OR sha256!=NEW.sha256 OR object_key!=NEW.object_key))
  OR EXISTS(SELECT 1 FROM cloud_books WHERE object_key=NEW.object_key AND id!=NEW.id)
BEGIN SELECT RAISE(ABORT,'immutable_storage_bytes'); END;
CREATE TRIGGER IF NOT EXISTS cloud_books_reservation_retained BEFORE DELETE ON cloud_books
BEGIN SELECT RAISE(ABORT,'storage_reservation_retained'); END;
CREATE TRIGGER IF NOT EXISTS cloud_originals_guard BEFORE INSERT ON cloud_originals
WHEN NOT EXISTS(SELECT 1 FROM cloud_originals WHERE book_id=NEW.book_id AND source_id=NEW.source_id)
BEGIN
  SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM cloud_books WHERE id=NEW.book_id AND state='ready')
    OR EXISTS(SELECT 1 FROM cloud_book_deletions WHERE id=NEW.book_id)
    THEN RAISE(ABORT,'original_book_unavailable') END);
  SELECT (CASE WHEN (SELECT COUNT(*) FROM cloud_originals WHERE book_id=NEW.book_id)>=100
    THEN RAISE(ABORT,'original_count_exceeded') END);
  SELECT (CASE WHEN (SELECT used_bytes FROM cloud_storage_budget WHERE id=1) IS NULL
    OR (SELECT used_bytes FROM cloud_storage_budget WHERE id=1)+NEW.bytes>9000000000
    THEN RAISE(ABORT,'cloud_storage_budget_exceeded') END);
END;
CREATE TRIGGER IF NOT EXISTS cloud_originals_budget_charge AFTER INSERT ON cloud_originals
BEGIN UPDATE cloud_storage_budget SET used_bytes=used_bytes+NEW.bytes WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS cloud_originals_descriptor_immutable BEFORE UPDATE ON cloud_originals
WHEN NEW.book_id!=OLD.book_id OR NEW.source_id!=OLD.source_id
  OR NEW.descriptor_json!=OLD.descriptor_json OR NEW.sha256!=OLD.sha256
  OR NEW.bytes!=OLD.bytes OR NEW.object_key!=OLD.object_key
BEGIN SELECT RAISE(ABORT,'immutable_original_descriptor'); END;
CREATE TRIGGER IF NOT EXISTS cloud_originals_insert_identity BEFORE INSERT ON cloud_originals
WHEN EXISTS(SELECT 1 FROM cloud_originals WHERE book_id=NEW.book_id AND source_id=NEW.source_id AND
  (descriptor_json!=NEW.descriptor_json OR sha256!=NEW.sha256 OR bytes!=NEW.bytes OR object_key!=NEW.object_key))
  OR EXISTS(SELECT 1 FROM cloud_originals WHERE object_key=NEW.object_key AND
    (book_id!=NEW.book_id OR source_id!=NEW.source_id))
BEGIN SELECT RAISE(ABORT,'immutable_original_descriptor'); END;
CREATE TRIGGER IF NOT EXISTS cloud_originals_reservation_retained BEFORE DELETE ON cloud_originals
BEGIN SELECT RAISE(ABORT,'storage_reservation_retained'); END;
CREATE TRIGGER IF NOT EXISTS cloud_storage_budget_retained BEFORE DELETE ON cloud_storage_budget
BEGIN SELECT RAISE(ABORT,'storage_reservation_retained'); END;
CREATE TRIGGER IF NOT EXISTS cloud_storage_budget_monotonic BEFORE UPDATE ON cloud_storage_budget
WHEN NEW.id!=OLD.id OR NEW.used_bytes<OLD.used_bytes
BEGIN SELECT RAISE(ABORT,'storage_budget_decrease_forbidden'); END;
CREATE TRIGGER IF NOT EXISTS cloud_storage_budget_insert_monotonic BEFORE INSERT ON cloud_storage_budget
WHEN EXISTS(SELECT 1 FROM cloud_storage_budget WHERE id=NEW.id AND used_bytes>NEW.used_bytes)
BEGIN SELECT RAISE(ABORT,'storage_budget_decrease_forbidden'); END;
-- Guards are installed before initialization: old writers before guards are
-- included in the final SUM; after guards, a missing singleton blocks writes.
INSERT INTO cloud_storage_budget(id,used_bytes)
SELECT 1,COALESCE((SELECT SUM(bytes) FROM cloud_books),0)
  +COALESCE((SELECT SUM(bytes) FROM cloud_originals),0)
  WHERE NOT EXISTS(SELECT 1 FROM cloud_storage_budget WHERE id=1)
ON CONFLICT(id) DO NOTHING;
-- Partial-rollout retry may repair an underestimate, but never refund bytes.
UPDATE cloud_storage_budget SET used_bytes=MAX(used_bytes,
  COALESCE((SELECT SUM(bytes) FROM cloud_books),0)+COALESCE((SELECT SUM(bytes) FROM cloud_originals),0)) WHERE id=1;
