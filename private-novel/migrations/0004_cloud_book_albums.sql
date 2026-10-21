-- Optional grouping metadata. Existing snapshots, reservations and tombstones stay intact.
-- Apply once through the D1 migration ledger before deploying the album-aware API.
ALTER TABLE cloud_books ADD COLUMN album TEXT NOT NULL DEFAULT '' CHECK(length(album) <= 120);
