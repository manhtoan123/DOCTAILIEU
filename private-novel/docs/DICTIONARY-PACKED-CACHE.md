# Packed dictionary cache

Status: deployed to Pages Preview and Production on 2026-11-11. The local language Worker may cache compiled `vp` and `hanviet` indexes in the separate IndexedDB database `dsh-dictionary-cache`. The original TXT stored in the app database remains authoritative. Cache identity is `formatVersion:sha256:updatedAt`; invalid or missing entries are rebuilt from TXT. Other dictionary kinds and server loading retain the existing path.

The packed format stores sorted UTF-16 code units, offsets, a second normalized-key table, and maximum key lengths by first code unit. Conversion overlays (including local Vietphrase edits) remain writable Maps over the packed read-only base. Entries retain last-write-wins ordering and keys longer than 256 code units are rejected as in `Index`.

Parser parity: both regular and packed loads validate through `readDictionary`/`dictionaryEntry`; packed insertion now also uses the shared `parseEntry` helper instead of manually splitting on `=`. Regression fixture covers comments, BOM, invalid/empty entries, trimming, and values that contain `=`. Focused `tests/packed-index.test.ts`: 5/5 pass. No parser mismatch was reproduced in the shared validation path; this change removes the duplicate parser implementation and locks down equivalence. Commit `75a0e26` is deployed to Pages production `1c0d940e` (`master`); production-built dictionary persistence/Convert E2E passed 1/1. PWA shell after this next release also passed 1/1 in a fresh browser profile (build ID `1839862ac648a243`). No real Vietphrase file or Android hardware used.

The format borrows only the broad idea of compact prebuilt dictionary data from [kuromoji.js](https://github.com/takuyaa/kuromoji.js), and persistent imported dictionary storage from [Yomitan](https://github.com/yomidevs/yomitan). Their formats and algorithms were not copied; this cache is tailored to this app's `Index` semantics.

Android cold load, actual user dictionaries, and deployment remain unverified.

## Benchmark (Node synthetic microbenchmark)
Run on the current Windows host with Node v24.14.0, 1.2 million generated entries. `node --expose-gc scripts/benchmark-packed-dictionary.mjs 1200000`: old Map insertion 617.8 ms; packed builder including parse-like splitting, normalized/base map creation, sorting and packing 1949.2 ms; structuredClone of packed data 32.9 ms; PackedIndex construction 0.2 ms; 36,000 exact lookups Map 13.8 ms vs binary index 34.1 ms; reported heap 435.6 MiB; lookup equality passed. This isolated microbenchmark does not include Worker messaging, actual IndexedDB disk latency, UTF-8/blob reading, real dictionary shape, Android, or full Convert tokenization. Hit serialization is ~18.7x below the Map insertion-only baseline in this synthetic case, but total application startup improvement is not established. First build is slower and packed lookups cost more; use actual-device measurement before making product latency claims.

Focused test evidence: packed-index 4/4; dictionary/local Convert 20/20; Convert cache/titles 53/53; server suites 41/41. Full suite had unrelated failures (27 files / 45 tests failed, 210 passed / 7 skipped); see `.dsh-tmp/packed/full-suite.log`. Dictionary E2E failed at `page.goto('/')` timeouts on both Chromium and Android-layout, so UI runtime remains unverified. Build succeeded after setting task-local TEMP to `.dsh-tmp/tmp`; initial build hit Windows esbuild TEMP AccessDenied. Initial mTLS baseline had one `read ECONNRESET`; isolated rerun passed 6/6 and final server group passed 41/41. No deployment or independent Astra High review was available in this run.

Follow-up 11/11: isolated persistence spec was updated to mock `/api/**` and navigate with `waitUntil:'domcontentloaded'`, then rerun as Chromium/1 worker; it still timed out at `page.goto('/')`. A manually started Vite server answered one direct GET `/` with HTTP200, but became unresponsive during Playwright navigation; cause remains unconfirmed. Manual UI/real Vietphrase test did not run: browser computer-use stopped on Edge URL detection, and no local dictionary file was provided for a safe fixture. Do not deploy based on this evidence.

Preview E2E follow-up: `dictionary-persistence.spec.ts` now uses native IndexedDB APIs (no dev-only `/src` import), isolates `/api/**`, and navigates at `domcontentloaded`. Ran against built `dist` with a temporary Playwright config serving `vite preview`, Edge Chromium, 1 worker: 1/1 passed (9.0s). The test persists synthetic Vietphrase, verifies the separate `dsh-dictionary-cache` packed `vp` record, reloads and converts changed chapter text to force a new conversion request, and checks TXT bytes/SHA remain stable. This is automated synthetic browser evidence, not a manual test with the user's real Vietphrase file or Android-device proof.

## Preview deployment
Static-only Cloudflare Pages Preview: `https://eabc0ed1.thu-phong-private.pages.dev` (deployment `eabc0ed1-1f96-42f1-97d1-47731e0ad86e`, branch `codex-packed-dictionary`, Environment Preview). Uploaded only the built `dist` tree from `.dsh-tmp/packed/static-preview`; did not include the root `functions/` directory or project D1/R2/service bindings. Production remains deployment `85b93944-0c18-4e79-bf34-dbfcf4dcb4d9` on `master`. The Preview URL is public. App API/Cloudflare Function flows are not available on this static-only Preview; local dictionary/IndexedDB testing is the intended scope. HTTP page + bundle both returned 200 and bundle SHA matched uploaded artifact. Remote Preview E2E with synthetic dictionary: 1/1 pass in 9.7s. Other front-end changes already present in the built `dist` are included; this is not a feature-only frontend artifact. Independent Astra/Sol review and manual real-file/Android checks remain outstanding.
## Production deployment
Deployed by explicit user request to Pages production branch `master`: deployment `a51be252-5bb6-4d07-a639-271c05f837bd`; canonical `https://thu-phong-private.pages.dev`. Previous production deployment `85b93944-0c18-4e79-bf34-dbfcf4dcb4d9` recorded as rollback target. Production root and bundle returned HTTP 200; `/assets/index-CRh0Vw8e.js` SHA-256 matches local `dist`. Production persistence E2E with synthetic local IndexedDB fixture and all `/api/**` calls intercepted: 1/1 pass in 9.5s; no cloud test writes. Build exit0 immediately before release. Full suite remains 45 failing tests across 27 files; independent Astra/Sol review, real Vietphrase file test, and Android testing remain outstanding. This release includes other frontend and Pages Functions changes present in the working tree, not just Packed Cache.

## Benchmark bằng các dictionary đã chọn (Node trên Windows)

`node --expose-gc scripts/benchmark-vietphrase-readonly.mjs <thư-mục-dictionary>` đọc bốn file TXT vào RAM, không ghi lâu dài và không gửi request. Lượt đo dùng Vietphrase thật (41,66 MiB) cùng ba dictionary liên quan; tổng raw 44,16 MiB. Node v24.14.0, cold load 3 lượt, warm cache 30 lượt gồm 5 warm-up, Convert 35 lượt gồm 5 warm-up; p95 với tập nhỏ không đại diện phân vị ổn định.

| Phép đo | Map | Packed |
|---|---:|---:|
| Cold load p50 / p95 (n=3) | 1.910 / 1.938 ms | 3.255 / 3.303 ms |
| Convert 10k UTF-16 units p50 / p95 (n=30) | 6,60 / 13,19 ms | 12,57 / 13,82 ms |
| Convert 100k UTF-16 units p50 / p95 (n=30) | 72,21 / 120,92 ms | 137,21 / 144,99 ms |
| Warm packed cache p50 / p95 (n=25) | — | 161 / 177 ms |

Build cache lần đầu mất 3.213 ms; packed Vietphrase index chiếm 55,55 MiB. Map và packed trả output giống nhau trên input CJK tổng hợp. Đỉnh RSS khoảng 1,30 GiB và heap 538 MiB là giá trị gộp qua các phase, không tách được từng engine.

Đây là Node benchmark trên máy tính, Convert dùng câu CJK lặp tổng hợp và IndexedDB giả chỉ ở RAM; không đo disk IndexedDB, Worker/main-thread jank, chương thật, browser hay Android. Kết quả cho thấy cache hit packed nhanh, nhưng cold build và Convert trực tiếp của packed chậm hơn Map ở lượt này. Chưa đổi thuật toán/storage vì kết quả chưa đại diện runtime của app. Bản sao Vietphrase lên Android được người dùng cho phép riêng qua USB, không gửi mạng và phải xóa khỏi điện thoại sau phép đo; file nguồn `D:` tiếp tục read-only.

## Trạng thái sau khi chốt phạm vi web (14/11/2026)

Edge production-build persistence/Convert E2E dùng dictionary tổng hợp đã pass 1/1; nó xác nhận IndexedDB cache và Convert hoạt động trong browser, nhưng không đo hiệu năng của dictionary thật. Benchmark bốn file thật ở trên là Node-only, không đại diện IndexedDB trên disk hay jank trong browser. Người dùng sau đó xác nhận không cần kết nối điện thoại cho công việc web hiện tại; Android thật chưa đo và không chặn phần web. Chưa có bằng chứng để nói Packed cải thiện cold load hoặc Convert trên thiết bị người dùng.
