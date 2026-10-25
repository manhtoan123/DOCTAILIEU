-- Additive URL aliases only. Source IDs, snapshots and progress stay untouched.
CREATE TABLE IF NOT EXISTS reader_routes (
 id INTEGER PRIMARY KEY AUTOINCREMENT CHECK(id BETWEEN 1 AND 999999989999),
 book_id TEXT NOT NULL UNIQUE CHECK(length(book_id)=36)
);
CREATE TRIGGER IF NOT EXISTS reader_routes_cap BEFORE INSERT ON reader_routes
WHEN NOT EXISTS(SELECT 1 FROM reader_routes WHERE book_id=NEW.book_id)
BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM reader_routes)>=100000 THEN RAISE(ABORT,'reader_routes_full') END; END;
CREATE TRIGGER IF NOT EXISTS reader_routes_no_update BEFORE UPDATE ON reader_routes
BEGIN SELECT RAISE(ABORT,'reader_route_immutable'); END;
CREATE TRIGGER IF NOT EXISTS reader_routes_no_delete BEFORE DELETE ON reader_routes
BEGIN SELECT RAISE(ABORT,'reader_route_retained'); END;
CREATE TRIGGER IF NOT EXISTS reader_routes_no_replace BEFORE INSERT ON reader_routes
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM reader_routes WHERE id=NEW.id AND book_id<>NEW.book_id) THEN RAISE(ABORT,'reader_route_immutable') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM reader_routes WHERE book_id=NEW.book_id) THEN RAISE(IGNORE) END;
END;
