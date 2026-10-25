-- Disposable LOCAL probe. Dictionary events are packed to avoid a million writes.
CREATE TABLE probe_buckets (id INTEGER NOT NULL,page INTEGER NOT NULL,first_key TEXT NOT NULL,last_key TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=45000),PRIMARY KEY(id,page)) WITHOUT ROWID;
CREATE INDEX probe_bucket_range ON probe_buckets(id,first_key,last_key);
CREATE TABLE probe_rules (source_key TEXT NOT NULL CHECK(length(source_key) BETWEEN 1 AND 256),kind TEXT NOT NULL CHECK(kind='rules'),value TEXT NOT NULL CHECK(length(value)<=4096),lookup_key TEXT NOT NULL,ordinal INTEGER PRIMARY KEY);
CREATE TABLE probe_metadata (id INTEGER PRIMARY KEY CHECK(id=1),max_key_length INTEGER NOT NULL CHECK(max_key_length BETWEEN 1 AND 256));
