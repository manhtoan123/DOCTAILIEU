-- Disposable LOCAL probe database only. Not a library migration.
CREATE TABLE probe_dictionary (
  source_key TEXT NOT NULL CHECK(length(source_key) BETWEEN 1 AND 256),
  kind TEXT NOT NULL,
  value TEXT NOT NULL CHECK(length(value)<=4096),
  lookup_key TEXT NOT NULL CHECK(length(lookup_key) BETWEEN 1 AND 256),
  ordinal INTEGER NOT NULL PRIMARY KEY
) WITHOUT ROWID;
CREATE INDEX probe_dictionary_lookup ON probe_dictionary(lookup_key);
CREATE INDEX probe_dictionary_kind ON probe_dictionary(kind);
CREATE TABLE probe_metadata (id INTEGER PRIMARY KEY CHECK(id=1), max_key_length INTEGER NOT NULL CHECK(max_key_length BETWEEN 1 AND 256));
