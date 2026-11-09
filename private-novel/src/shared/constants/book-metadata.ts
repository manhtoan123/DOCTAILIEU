/** Match the existing backup title contract across cloud metadata paths. */
export const BOOK_METADATA_MAX_CHARS=1000;
/** encodeURIComponent needs at most nine ASCII characters per UTF-16 unit. */
export const BOOK_METADATA_MAX_ENCODED_CHARS=BOOK_METADATA_MAX_CHARS*9;
/** Reviewed DELETE metadata can contain UTF-8 title and Album path plus hashes. */
export const CLOUD_DELETE_METADATA_MAX_BYTES=32*1024;
