-- Read paths only: preserve records, revisions, tombstones and quota ledgers.
CREATE INDEX IF NOT EXISTS shared_state_change_scan ON shared_state(revision,scope);
CREATE INDEX IF NOT EXISTS shared_state_book_catalog ON shared_state(scope) WHERE kind='book' AND deleted=0;
