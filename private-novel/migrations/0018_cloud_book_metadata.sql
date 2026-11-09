-- Align cloud book titles with the existing 1000-character backup metadata contract.
-- Copy exact rows into an uncharged table first; never reinsert through budget triggers.
-- Only the title CHECK changes. Restore all catalog and cross-table guards unchanged.
CREATE TABLE cloud_books_metadata_new (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 1000),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  bytes INTEGER NOT NULL CHECK(bytes > 0 AND bytes <= 67108864),
  state TEXT NOT NULL CHECK(state IN ('pending', 'ready')),
  object_key TEXT NOT NULL UNIQUE,
  updated_at INTEGER NOT NULL,
  album TEXT NOT NULL DEFAULT '' CHECK(length(album) <= 120)
);

INSERT INTO cloud_books_metadata_new (id, title, sha256, bytes, state, object_key, updated_at, album)
SELECT id, title, sha256, bytes, state, object_key, updated_at, album FROM cloud_books;

DROP TRIGGER IF EXISTS cloud_originals_guard;
DROP TRIGGER IF EXISTS cloud_original_parts_guard;
DROP TRIGGER IF EXISTS cloud_books_budget_guard;
DROP TRIGGER IF EXISTS cloud_books_budget_charge;
DROP TRIGGER IF EXISTS cloud_books_bytes_immutable;
DROP TRIGGER IF EXISTS cloud_books_insert_identity;
DROP TRIGGER IF EXISTS cloud_books_reservation_retained;

DROP TABLE cloud_books;

ALTER TABLE cloud_books_metadata_new RENAME TO cloud_books;

CREATE INDEX IF NOT EXISTS cloud_books_ready_id ON cloud_books(state, id);

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

CREATE TRIGGER cloud_original_parts_guard BEFORE INSERT ON cloud_original_parts WHEN NOT EXISTS(SELECT 1 FROM cloud_original_parts p WHERE p.book_id=NEW.book_id AND p.source_id=NEW.source_id AND p.part=NEW.part) BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM cloud_originals o JOIN cloud_books b ON b.id=o.book_id WHERE o.book_id=NEW.book_id AND o.source_id=NEW.source_id AND NOT EXISTS(SELECT 1 FROM cloud_original_parts_locks l WHERE l.book_id=o.book_id AND l.source_id=o.source_id AND l.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) AND o.state='pending' AND o.bytes>67108864 AND json_extract(o.descriptor_json,'$.encoding')='epub' AND b.state='ready' AND NOT EXISTS(SELECT 1 FROM cloud_book_deletions d WHERE d.id=b.id) AND NEW.bytes=MIN(16777216,o.bytes-(NEW.part-1)*16777216)) THEN RAISE(ABORT,'invalid_original_part') END);
 SELECT (CASE WHEN (SELECT used_bytes FROM cloud_original_parts_meta WHERE id=1) IS NULL OR (SELECT used_bytes FROM cloud_original_parts_meta WHERE id=1)+NEW.bytes>268435456 OR (SELECT row_count FROM cloud_original_parts_meta WHERE id=1)>=4096 THEN RAISE(ABORT,'original_parts_budget_exceeded') END);
END;
