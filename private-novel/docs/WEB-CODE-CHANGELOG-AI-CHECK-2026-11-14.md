# Web change report for later AI review

**Date:** 2026-11-14

**Purpose:** explain how the web changed during this improvement work, identify what was actually changed versus only measured, and give a later reviewer precise source paths and evidence to recheck.

## Tóm tắt tiếng Việt

- Code trên GitHub có thêm vỏ web offline, sửa cách đọc từ điển packed cho thống nhất, gom sách theo Album nhanh hơn, chỉ vẽ các thẻ thư viện đang nhìn thấy khi danh sách lớn, và tìm gần đúng khi gõ sai.
- Xóa nhiều truyện **không được sửa code trong đợt này**; giới hạn bốn yêu cầu đồng thời đã có từ trước. Chỉ chạy thử luồng giả lập thành công/lỗi/thử lại.
- EPUB chỉ được nghiên cứu; **không sửa TTS** và không kết nối điện thoại.
- Báo cáo có đường dẫn source, commit, test và lệnh chạy lại. Tuy nhiên checkout đang mở, GitHub `master` và production chưa được chứng minh là cùng một phiên bản; AI sau phải kiểm tra điểm này trước khi kết luận.

## Comparison boundary

This report compares baseline **`29e47f3`** with the app-code snapshot **`0e33424`**. At the time of source comparison, `git ls-remote` reported `0e33424` as current `origin/master`. These two reports were later added by documentation-only commit **`9a5aa1b`**, which is now the remote `master` tip and does not change app code. The code diff is 41 files, +1,342 / -92 lines; that count includes documentation, E2E specs, benchmark scripts and build support, so it is not 1,342 lines of product behavior.

This is not the same as the open workspace checkout. The open workspace is detached at `b84f718`, has many pre-existing modified files, and lacks the PWA, virtualization and fuzzy-search source files present on remote `master`. Its `HANDOFF.md` records Pages deployment `591d1c98`; the clean-checkout release notes record `97962f61`. A live read on 2026-11-14 returned `/` HTTP 200, `/assets/index-BiyQs2jW.js`, and `/sw.js` HTTP 200 with JavaScript build ID `48b1e9cdcbd76e96`. That confirms the live site serves a worker and the reported app bundle, but does not independently map the live response to either deployment ID. Treat the remote clean checkout, the open dirty checkout, and production as three states until their commit/artifact mapping is reconciled.

### How a later AI should use this report

1. Use repository `https://github.com/manhtoan123/DOCTAILIEU.git` in a **new clean checkout**. Do not use or clean the dirty `b84f718` workspace to make the comparison.
2. Confirm remote `master` first. At report time it was `0e334248c855660d3fc04a361358700b91a92e0a`; compare against baseline `29e47f344a1baaab6264882233d051176b56f140`. If either commit is unavailable or `master` moved, record that and adjust the comparison explicitly.
3. Inspect the exact source paths below and rerun the focused tests. A passing old report is evidence about that recorded run, not a promise that a later checkout still passes.
4. Confirm the production HTML asset and `/sw.js` build ID against the Cloudflare deployment record. An HTTP 200 alone does not prove which commit produced the page.
5. Separate reproduced results from claims that can no longer be reproduced. The browser-profile harnesses and full-suite logs under `.dsh-tmp/` were ignored temporary artifacts, not committed files; they may not be present for a later AI. The documented test results can be rerun, but the exact bulk-delete timing harness may need reconstruction.

**Tracked evidence notes on the recorded remote `master`:** `docs/WEB-CODE-GITHUB-IDEAS-REPORT-2026-11-14.md`, `docs/PWA-OFFLINE-SHELL-M0.md`, `docs/DICTIONARY-PACKED-CACHE.md`, `docs/ALBUM-GROUPING-PERF.md`, `docs/LIST-VIRTUALIZATION-PERF.md`, `docs/FUZZY-LIBRARY-SEARCH.md`, `docs/EPUB-NAVIGATION-SPIKE-2026-11-14.md`, `docs/TTS-GAP-PROFILE-2026-11-14.md`, and the 14/11 entries in `docs/HANDOFF-LOG.md`. The two bulk-delete profiling scripts were named `profile-bulk-delete-31books.mjs` and `profile-bulk-delete-partial-retry.mjs` under ignored `.dsh-tmp/`; they were not committed. The full-suite log was `.dsh-tmp/full-unit-baseline-20261114.log`, also not committed.

**Availability:** this report is currently an untracked local Markdown file in the open workspace. Another AI using that same workspace can read it. An AI working from GitHub or a separate clean clone will not see this file until it is added to Git and pushed. The feature source/docs on remote `master` are separate from this new local report.

### Source commits to compare

| Commit | Product change |
|---|---|
| `c2f86d1`, `a4261c2` | Add and fix versioned offline app shell. |
| `75a0e26` | Use shared parser semantics in packed dictionary load. |
| `d275743` | Group Album shelves through a `Map`. |
| `06dd051` | Virtualize large library shelves. |
| `e7f9bb2` | Add fuzzy library metadata search. |

These code commits are on the recorded remote `master` sequence. Later commits through `0e33424` mainly record verification, benchmarks, research and unit-suite triage. Production deployment IDs in the tracked notes include `1c0d940e` for the parser/PWA follow-up, `603c6577` for Album grouping, `82fd26db` for virtualization and `97962f61` for fuzzy search plus the PWA shell. The open workspace separately records `591d1c98`; mapping the live artifact to one deployment remains unresolved.

## Product code changes

### 1. Offline app shell

**Before:** no service worker managed the reader shell; `/sw.js` could be handled as the SPA fallback rather than a worker script. A previously loaded local book therefore still depended on the web app shell being available from the network.

**After:** versioned service worker precaches `index.html`, the built JS/CSS shell and EPUB bridge scripts. It excludes API responses, user/book data, PDF/DOCX conversion chunks and large PDF assets. Navigation falls back to cached `index.html` when offline. A new worker waits for pages controlled by the old worker to close; it does not force activation with `skipWaiting()` or `clients.claim()`.

**Main files:** `src/pwa/register-offline-shell.ts`, `public/sw.js`, `scripts/build-pwa-shell.mjs`, `src/main.tsx`, `playwright.pwa.config.ts`, `e2e/pwa-offline.spec.ts`.

**Evidence recorded:** build and Edge offline-shell E2E passed; production Edge offline E2E passed with synthetic IndexedDB data and `/api/**` blocked. A separate Edge test loaded two different production asset sets and checked old-tab/new-worker cache lifecycle. It did not hold a real Pages tab open across a production deployment. First visit still requires network; offline does not provide cloud sync, AI or new TTS audio.

**Idea used:** Workbox's versioned precache and safe update lifecycle; no Workbox dependency or copied implementation.

### 2. Consistent parsing of packed dictionaries

**Before:** packed dictionary construction had its own line parsing, separate from the normal dictionary parser. The two paths could interpret malformed, commented or `=`-containing lines differently.

**After:** packed loading now uses the shared `parseEntry` rule before adding entries. This aims to make the same input mean the same thing whether it is loaded through the normal or packed path. It is a correctness change, not a claimed speed improvement.

**Main files:** `src/features/names-convert/services/load-language-engine.ts`, `tests/packed-index.test.ts`.

**Evidence recorded:** focused parser tests 5/5; production-built dictionary persistence/Convert E2E 1/1 with synthetic data. A Node benchmark on four selected dictionary files (Vietphrase 41.66 MiB plus three related files) found packed cold load and Convert slower than Map in that run. Edge cold/warm measurements used a synthetic 200k-entry, 9.6 MB fixture; they do not prove faster Convert with a real dictionary in a browser.

**Ideas used:** broad compact-index/cache ideas from Kuromoji.js and Yomitan; no source code or dictionary data copied from those repositories.

### 3. Pre-group books by Album path

**Before:** `AlbumShelf` iterated through Album folders and filtered the full book list separately for each folder, approximately `O(M × N)` for `M` Album paths and `N` books.

**After:** `groupBooksByAlbumPath` builds a `Map` in one pass over books and puts a book into its direct Album and each valid parent Album. Expected work is approximately `O(N × D + M)`, where `D` is Album depth. The existing path, parent/Series hierarchy, book order and legacy labels are preserved; stored book data is not rewritten.

**Main files:** `src/features/library/services/album-tree.ts`, `src/features/library/components/AlbumShelf.tsx`, `tests/album-tree.test.ts`, `scripts/benchmark-album-grouping.mjs`.

**Evidence recorded:** unit 4/4; local hierarchy E2E 4/4; synthetic 5,000-book / 150-path benchmark: grouping step p50 17.42 ms versus repeated filtering p50 1,139.34 ms. This is only the group-building step, not full page render or real-library timing.

**Idea used:** TC39 Array Grouping's bucket-by-key idea, implemented with a regular `Map` because each book belongs in several ancestor buckets; no dependency or copied code.

### 4. Virtualize large library lists

**Before:** every filtered book card was mounted in the page. Large libraries created tens of thousands of DOM elements and long main-thread tasks.

**After:** for lists over 300 books, only visible rows plus a small overscan window are rendered. The implementation measures rows, keeps the focused book available, supports keyboard movement into the next virtual row and preserves selection by stable book ID. Lists at or below 300 keep the existing path.

**Main files:** `src/features/library/components/VirtualizedBookGrid.tsx`, `src/features/library/components/LibraryBookCard.tsx`, `src/features/library/styles/library.css`, `src/App.tsx`, `e2e/library-virtualization.spec.ts`.

**Dependency:** `@tanstack/react-virtual` 3.14.26 (MIT), using the upstream API, not copied source.

**Recorded before → after profile:**

| Synthetic library / viewport | DOM elements | Largest long task | Search to one result |
|---|---:|---:|---:|
| 1,000 / desktop | 11,039 → 320 | 99 → 0 ms | 659 → 440 ms |
| 5,000 / desktop | 55,039 → 320 | 891 → 164 ms | 2,147 → 1,363 ms |
| 1,000 / 393 px | 11,039 → 155 | 123 → 0 ms | 518 → 394 ms |
| 5,000 / 393 px | 55,039 → 155 | 568 → 167 ms | 2,781 → 1,383 ms |

The measurements are single synthetic runs, not p50/p95 or physical Android results. Search still scans library metadata and took about 1.4 seconds with 5,000 books. The change reduces mounted UI work; it does not make search independent of library size. Production Edge E2E passed using synthetic IndexedDB fixtures and intercepted APIs.

### 5. Approximate search for library metadata

**Before:** normalized substring search handled names, authors, Albums and exact chapter-title matches. A small typo could produce no book result.

**After:** exact search still runs first. Only if it finds no book result does a background Worker run approximate matching over book title, saved converted title, author and Album. It does not fuzzy-search chapter text or convert text temporarily held only in memory. Queries must be 3–64 code points; metadata fields over 2,048 code points are skipped. Matching is delayed 120 ms after typing and old Worker work is cancelled when the query changes.

**Main files:** `src/features/library/services/fuzzy-library-search.ts`, `src/features/library/services/fuzzy-library-search.worker.ts`, `src/features/library/components/useFuzzyLibrarySearch.ts`, `src/features/library/services/library-search.ts`, `src/App.tsx`, `tests/library-search.test.ts`, `e2e/fuzzy-library-search.spec.ts`.

**Dependency:** `fuse.js` 7.5.0 (Apache-2.0), using its API; no upstream code copied. The threshold is 0.25, a combined acceptance score is capped at 0.37, and fields have different ranking penalties.

**Evidence recorded:** focused tests 6/6; production-preview and production Edge E2E passed with synthetic metadata. On one desktop Edge run with 5,000 synthetic books, five typo searches took 492–812 ms (median 694 ms); first query had a 68 ms long task. This does not prove ranking quality on real user typos or performance on Android.

## Work in this chat that did not change product code

### Batch deletion / p-limit question

`src/features/library/services/library-management.ts` already had `DELETE_CONCURRENCY = 4` at baseline `29e47f3`; the file is unchanged between `29e47f3` and `0e33424`. Therefore **the delete implementation itself is not a new feature from this chat**. It already waits for each item's cloud acknowledgement before local deletion and uses a bounded worker pool. This chat added synthetic profiling and failure/retry evidence only.

With 31 synthetic books and mocked 100 ms DELETE responses, the happy path used at most four concurrent requests and completed in 1.907 s versus 3.1 s for a serial calculation. On the failure path one request returned 503: already acknowledged books were removed locally; the failed book and 27 not-yet-started books remained local; selecting the Album again produced a 28-book retry that completed. All `/api/**` calls were intercepted. This is not a real-cloud latency benchmark and the batch is not atomic. The result supports keeping concurrency bounded; it does not show that `p-limit` or a new dependency is needed.

### EPUB and TTS

- EPUB navigation was a synthetic two-chapter research spike comparing the current model with Readium Locator concepts. It found that nested TOC hierarchy and fragment position are not retained as stable locators. No reader engine, dependency or product behavior was changed.
- TTS was profiled only with an existing synthetic MP3 fixture. **No TTS code was changed**, no production gateway call was made, and there was no phone connection or Android hardware test.

### Unit-suite triage

One full `npm.cmd test` run recorded 2,676 passed, 105 skipped and 83 failed across 48 files. Failures span multiple groups; some isolated failures were Miniflare setup errors, timeouts, network reset errors and expectation mismatches. This work classified failures but did not make the suite green. Do not treat a mock/browser check as proof of live AI, cloud-write, Android or audio behavior.

## GitHub idea decisions

| Source | Decision |
|---|---|
| [sindresorhus/p-limit](https://github.com/sindresorhus/p-limit) | Use the bounded-concurrency pattern only; existing local worker pool already does this; no package added. |
| [TC39 Array Grouping](https://github.com/tc39/proposal-array-grouping) | Use grouping-by-key idea with ordinary `Map`; no code copy or package. |
| [GoogleChrome/Workbox](https://github.com/GoogleChrome/workbox) | Use safe versioned precache/update ideas; custom service worker; no package. |
| [TanStack Virtual](https://github.com/TanStack/virtual) | Add `@tanstack/react-virtual` 3.14.26 for the virtualized list. |
| [Fuse.js](https://github.com/krisk/Fuse/tree/v7.5.0) | Add `fuse.js` 7.5.0 for metadata matching; Apache-2.0. |
| [Readium TypeScript Toolkit](https://github.com/readium/ts-toolkit) | Research only; no dependency or engine replacement. |

## Later AI verification checklist

1. Fetch `origin/master` and confirm it is still `0e33424` or document the newer commit before comparing.
2. Compare `29e47f3..0e33424` for the five product changes listed above; keep `library-management.ts` out of the “new code” list unless a later diff changes it.
3. Reconcile local detached/dirty `b84f718`, remote `master`, and the exact Pages deployment artifact. Confirm the currently served HTML bundle hash and worker build ID against a specific Cloudflare deployment record.
4. From `private-novel/`, rerun focused unit checks: `npm.cmd test -- tests/packed-index.test.ts`, `npm.cmd test -- tests/album-tree.test.ts`, and `npm.cmd test -- tests/library-search.test.ts`.
5. Run `npm.cmd run build` after the focused unit checks pass; the PWA browser config below serves the built `dist` directory.
6. Rerun the affected browser checks after matching the original browser/project setup: `npm.cmd run test:e2e -- e2e/album-hierarchy.spec.ts --project=chromium --workers=1 --reporter=line`, `npm.cmd run test:e2e -- e2e/library-virtualization.spec.ts --workers=1 --reporter=line`, `npm.cmd run test:e2e -- e2e/fuzzy-library-search.spec.ts --workers=1 --reporter=line`, and `npm.cmd run test:e2e -- --config=playwright.pwa.config.ts e2e/pwa-offline.spec.ts --workers=1 --reporter=line`. If the PWA command or browsers differ in the later environment, record that and use the project's supported config; don't silently count a skipped case as passed.
7. Do not make a real DELETE against user/cloud data for verification; use isolated synthetic fixtures and intercept `/api/**`.
8. Keep the limits explicit: synthetic fixtures are not a real library/network, viewport emulation is not Android hardware, actual cloud delete latency has not been measured, and no TTS change was requested.

## Bottom line

Compared with the selected pre-chat GitHub baseline, the remote web code gained offline shell support, consistent packed-dictionary parsing, faster Album grouping, a virtualized large-book list and typo-tolerant metadata search. The chat also measured deletion retry behavior but did not change deletion code, and it left TTS untouched. The live site currently serves the app bundle and service worker, but the precise mapping between production deployment `591d1c98`, report deployment `97962f61`, remote `master` and the open dirty checkout remains to be verified before a later AI signs off on the whole state.
