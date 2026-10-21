CREATE TABLE IF NOT EXISTS shared_state_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0, used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes>=0), row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count>=0));
INSERT OR IGNORE INTO shared_state_meta(id,revision) VALUES(1,0);
CREATE TABLE IF NOT EXISTS shared_state (
 id TEXT PRIMARY KEY, scope TEXT NOT NULL, kind TEXT NOT NULL, entity_key TEXT NOT NULL,
 record TEXT NOT NULL CHECK(json_valid(record)), revision INTEGER NOT NULL,
 deleted INTEGER NOT NULL CHECK(deleted IN(0,1)), bytes INTEGER NOT NULL CHECK(bytes>=0 AND bytes=length(CAST(record AS BLOB)))
);
CREATE INDEX IF NOT EXISTS shared_state_delta ON shared_state(scope,revision);
CREATE TRIGGER IF NOT EXISTS shared_state_insert_budget BEFORE INSERT ON shared_state BEGIN
 SELECT (CASE WHEN EXISTS(SELECT 1 FROM shared_state WHERE id=NEW.id) THEN RAISE(ABORT,'state_replace_forbidden') END);
 SELECT (CASE WHEN (SELECT used_bytes FROM shared_state_meta WHERE id=1)+NEW.bytes>67108864 OR (SELECT row_count FROM shared_state_meta WHERE id=1)>=60000 THEN RAISE(ABORT,'state_budget_exceeded') END);
END;
CREATE TRIGGER IF NOT EXISTS shared_state_update_budget BEFORE UPDATE ON shared_state BEGIN
 SELECT (CASE WHEN (SELECT used_bytes FROM shared_state_meta WHERE id=1)-OLD.bytes+NEW.bytes>67108864 THEN RAISE(ABORT,'state_budget_exceeded') END);
END;
CREATE TRIGGER IF NOT EXISTS shared_state_insert_charge AFTER INSERT ON shared_state BEGIN
 UPDATE shared_state_meta SET used_bytes=used_bytes+NEW.bytes,row_count=row_count+1 WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS shared_state_update_charge AFTER UPDATE ON shared_state BEGIN
 UPDATE shared_state_meta SET used_bytes=used_bytes-OLD.bytes+NEW.bytes WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS shared_state_keep_tombstone BEFORE DELETE ON shared_state BEGIN SELECT RAISE(ABORT,'state_tombstone_required'); END;
CREATE TABLE IF NOT EXISTS shared_state_blobs (sha256 TEXT PRIMARY KEY, bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=83886080), state TEXT NOT NULL CHECK(state IN('pending','ready')));
CREATE TRIGGER IF NOT EXISTS shared_state_blob_budget BEFORE INSERT ON shared_state_blobs BEGIN
 SELECT (CASE WHEN EXISTS(SELECT 1 FROM shared_state_blobs WHERE sha256=NEW.sha256) THEN RAISE(ABORT,'state_blob_replace_forbidden') END);
 SELECT (CASE WHEN (SELECT COALESCE(SUM(bytes),0) FROM shared_state_blobs)+NEW.bytes>268435456 OR (SELECT COUNT(*) FROM shared_state_blobs)>=3000 THEN RAISE(ABORT,'state_blob_budget_exceeded') END);
END;
CREATE TRIGGER IF NOT EXISTS shared_state_blob_immutable BEFORE UPDATE ON shared_state_blobs BEGIN
 SELECT (CASE WHEN NEW.sha256!=OLD.sha256 OR NEW.bytes!=OLD.bytes OR OLD.state='ready' AND NEW.state!='ready' THEN RAISE(ABORT,'state_blob_immutable') END);
END;
CREATE TRIGGER IF NOT EXISTS shared_state_blob_keep BEFORE DELETE ON shared_state_blobs BEGIN SELECT RAISE(ABORT,'state_blob_keep'); END;
