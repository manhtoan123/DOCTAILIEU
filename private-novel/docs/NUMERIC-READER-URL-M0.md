# Numeric Reader URL — M0
24/10/2026. Scope: /r/<numeric-book-code>/<chapter-number>, legacy UUID/base64 URLs remain valid.
- Stable server registry maps existing ready cloud UUIDs to monotonically assigned numeric codes (row ID +10000); no source/progress/book ID migration.
- Registry immutable and never recycled, including deleted books. Max100000 rows; allocation only SELECT from a ready non-tombstoned book. Auth/origin gate reused; no arbitrary user alias/body or new service/billing.
- Client caches only validated server mappings for offline use in settings. Missing/offline assignment leaves existing URL valid; opening numeric unknown fails explicitly, never chooses another bookmark.
- User correction: final segment is one-based position in the visible TOC, sorted by existing order (not order+1 or heading). Hidden chapters excluded consistently; out-of-range fails explicitly. No conversion/AI call. Reordering/inserting/hiding chapters can change the position URL; UUID links continue identifying original chapters.
- Alias/canonicalization callbacks guarded by route generation and ownership. URL changes use replaceState, chapter transitions keep history.
- Gates: independent review, real SQLite allocation/immutability/tombstone/cap regression; full unit/build; route+progress E2E; production synthetic smoke with API mocked. Apply only additive0014, never run pending0013 as a side effect or reset data.

## Result24/10
- User final choice: 1-based position in visible TOC, not heading number or order+1. UUID/base64 links preserved; number changes with reorder/insertion/hiding by definition.
- Registry/schema0014 applied directly to existing D1 (not migrations apply; pending0013 untouched;0014 may still appear pending in migration ledger, rerun is idempotent). No binding/tier/dependency/source-ID changes.
- Review_numeric_route closed REPLACE bypass, reciprocal cache conflicts and stale Reader ownership findings. Final independent10 tests include real SQLite and empty/nonempty network-style Request streams.
- Full174files/2152 tests passed before final empty-POST stream fix; after fix targeted56/56 + release build pass. E2E26/26 for route/progress/late allocation/TOC position across desktop/mobile-layout. D6 static-source assertion updated to include extracted progress component, preserving invariant.
- First actual POST probe exposed CF empty stream vs null body (400); fixed bounded one-read EOF gate, no payload accepted. Live final POST+GET passes: selected book3ce4fbe4-c37d-4c7c-ad82-eb51c567ab33 assigned10001, sourceWrites0.
- Final Pagesb07246d0/index-DaAY9LhF.js. Synthetic production smoke2/2, mockedAPI/0AI/0cloud writes; separate real registry allocation writes alias only. Logs .dsh-tmp/numeric-route-*. Local-only/unpublished books or failed registration keep legacy URL; confirmed mappings cached locally for offline use. No real Android/provider test.
