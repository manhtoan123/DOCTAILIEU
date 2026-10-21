-- EPUB256MiB cap; ledger remains unchanged. Copy before recreating charge triggers; ledger unchanged.
CREATE TABLE cloud_originals_epub_new (
  book_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  descriptor_json TEXT NOT NULL CHECK(length(descriptor_json)<=16384),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 268435456 AND (bytes<=41943040 OR (json_valid(descriptor_json) AND json_extract(descriptor_json,'$.encoding')='epub'))),
  object_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('pending','ready')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(book_id,source_id)
);
INSERT INTO cloud_originals_epub_new SELECT * FROM cloud_originals;
DROP TABLE cloud_originals;
ALTER TABLE cloud_originals_epub_new RENAME TO cloud_originals;
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

CREATE TABLE cloud_original_parts_locks(book_id TEXT NOT NULL,source_id TEXT NOT NULL,token TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(book_id,source_id));
CREATE TABLE cloud_original_parts_meta(id INTEGER PRIMARY KEY CHECK(id=1), used_bytes INTEGER NOT NULL CHECK(used_bytes BETWEEN 0 AND 268435456), row_count INTEGER NOT NULL CHECK(row_count BETWEEN 0 AND 4096));
INSERT INTO cloud_original_parts_meta VALUES(1,0,0);
CREATE TABLE cloud_original_parts (
 book_id TEXT NOT NULL, source_id TEXT NOT NULL, part INTEGER NOT NULL CHECK(part BETWEEN 1 AND 16),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64), bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 16777216), object_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('pending','ready')), updated_at INTEGER NOT NULL,
 PRIMARY KEY(book_id,source_id,part), FOREIGN KEY(book_id,source_id) REFERENCES cloud_originals(book_id,source_id)
);
CREATE TRIGGER cloud_original_parts_guard BEFORE INSERT ON cloud_original_parts WHEN NOT EXISTS(SELECT 1 FROM cloud_original_parts p WHERE p.book_id=NEW.book_id AND p.source_id=NEW.source_id AND p.part=NEW.part) BEGIN
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM cloud_originals o JOIN cloud_books b ON b.id=o.book_id WHERE o.book_id=NEW.book_id AND o.source_id=NEW.source_id AND NOT EXISTS(SELECT 1 FROM cloud_original_parts_locks l WHERE l.book_id=o.book_id AND l.source_id=o.source_id AND l.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) AND o.state='pending' AND o.bytes>67108864 AND json_extract(o.descriptor_json,'$.encoding')='epub' AND b.state='ready' AND NOT EXISTS(SELECT 1 FROM cloud_book_deletions d WHERE d.id=b.id) AND NEW.bytes=MIN(16777216,o.bytes-(NEW.part-1)*16777216)) THEN RAISE(ABORT,'invalid_original_part') END);
 SELECT (CASE WHEN (SELECT used_bytes FROM cloud_original_parts_meta WHERE id=1) IS NULL OR (SELECT used_bytes FROM cloud_original_parts_meta WHERE id=1)+NEW.bytes>268435456 OR (SELECT row_count FROM cloud_original_parts_meta WHERE id=1)>=4096 THEN RAISE(ABORT,'original_parts_budget_exceeded') END);
END;
CREATE TRIGGER cloud_original_parts_immutable BEFORE UPDATE ON cloud_original_parts
WHEN NEW.book_id!=OLD.book_id OR NEW.source_id!=OLD.source_id OR NEW.part!=OLD.part OR NEW.sha256!=OLD.sha256 OR NEW.bytes!=OLD.bytes OR NEW.object_key!=OLD.object_key
BEGIN SELECT RAISE(ABORT,'immutable_original_part'); END;

CREATE TRIGGER cloud_original_parts_charge AFTER INSERT ON cloud_original_parts BEGIN UPDATE cloud_original_parts_meta SET used_bytes=used_bytes+NEW.bytes,row_count=row_count+1 WHERE id=1; END;
CREATE TRIGGER cloud_original_parts_release AFTER DELETE ON cloud_original_parts BEGIN UPDATE cloud_original_parts_meta SET used_bytes=used_bytes-OLD.bytes,row_count=row_count-1 WHERE id=1; END;

-- Existing identities cannot be replaced, even via INSERT OR REPLACE. Exact
-- retries are ignored before SQLite's replacement/delete/charge path.
CREATE TRIGGER cloud_original_parts_insert_identity BEFORE INSERT ON cloud_original_parts
WHEN EXISTS(SELECT 1 FROM cloud_original_parts WHERE book_id=NEW.book_id AND source_id=NEW.source_id AND part=NEW.part AND
 (sha256!=NEW.sha256 OR bytes!=NEW.bytes OR object_key!=NEW.object_key))
 OR EXISTS(SELECT 1 FROM cloud_original_parts WHERE object_key=NEW.object_key AND
 (book_id!=NEW.book_id OR source_id!=NEW.source_id OR part!=NEW.part))
BEGIN SELECT RAISE(ABORT,'immutable_original_part'); END;
CREATE TRIGGER cloud_original_parts_duplicate BEFORE INSERT ON cloud_original_parts
WHEN EXISTS(SELECT 1 FROM cloud_original_parts WHERE book_id=NEW.book_id AND source_id=NEW.source_id AND part=NEW.part AND sha256=NEW.sha256 AND bytes=NEW.bytes AND object_key=NEW.object_key)
BEGIN SELECT RAISE(IGNORE); END;
