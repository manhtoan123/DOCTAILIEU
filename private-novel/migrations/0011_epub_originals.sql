-- EPUB-only cap expansion. Copy before recreating charge triggers; ledger unchanged.
CREATE TABLE cloud_originals_epub_new (
  book_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  descriptor_json TEXT NOT NULL CHECK(length(descriptor_json)<=16384),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 67108864 AND (bytes<=41943040 OR (json_valid(descriptor_json) AND json_extract(descriptor_json,'$.encoding')='epub'))),
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
