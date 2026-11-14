# Virtualized library list
**Date:** 2026-11-14
**Status:** Deployed to Pages production 2026-11-14 (deployment `82fd26db-8975-4aec-94d5-e5c642dfd98c`, source `06dd051`); production verification passed. Physical Android was not tested and is not required for the current web-only scope.
## What changed
The library now virtualizes the filtered book list only when it contains more than 300 books. Smaller lists keep the existing rendering path. Large lists render measured rows around the viewport in cover, list, and compact modes. The implementation keeps normal book order, uses stable book IDs, and measures row heights because titles and chapter matches can wrap differently.
The focused book remains mounted while the user scrolls. Tab and Shift+Tab continue into the next virtual row when it is outside the rendered window. Virtual list items expose `aria-posinset` and `aria-setsize`. Existing selection remains owned by `App`, so virtual row removal does not clear selected IDs.
## GitHub idea used
The [TanStack Virtual repository](https://github.com/TanStack/virtual) documents a headless virtualizer with measured items, overscan, and a customizable range extractor. The app uses those concepts through `@tanstack/react-virtual` **3.14.26 (MIT)**. No upstream source code was copied. The dependency was added after the large-list profile showed that rendering every card created long tasks and tens of thousands of DOM elements.
## Before/after profile
Production builds were served locally from isolated Edge profiles. The baseline is commit `ed5cb66`; the candidate is the matching local production build before deployment. The fixture wrote synthetic book metadata directly to IndexedDB; service workers and API requests were disabled/intercepted. The desktop viewport was 1365×900; the narrow viewport was 393×852 with mobile/touch emulation. Each cell is one run, not a p50/p95 result. DOM counts are all elements in the document (`getElementsByTagName('*')`), not only book cards. Search time runs from filling a title query to a single matching card and status; it also includes asynchronous chapter-search work.
| Viewport / books | DOM elements before → after | Long task max before → after | Search before → after |
|---|---:|---:|---:|
| Desktop / 1,000 | 11,039 → 320 (-97.1%) | 99 → 0 ms | 659 → 440 ms |
| Desktop / 5,000 | 55,039 → 320 (-99.4%) | 891 → 164 ms | 2,147 → 1,363 ms |
| 393 px / 1,000 | 11,039 → 155 (-98.6%) | 123 → 0 ms | 518 → 394 ms |
| 393 px / 5,000 | 55,039 → 155 (-99.7%) | 568 → 167 ms | 2,781 → 1,383 ms |
The virtualized window held 25 book cards at the measured desktop viewport and 10 at 393 px. The 5,000-book search still takes about 1.4 seconds in this single synthetic run, and the largest long task remains above 50 ms. The app still reads and filters all book metadata; this change reduces mounted UI work and does not make search cost independent of library size. The production JS bundle grew by 38.46 KB raw and 12.16 KB gzip (baseline 1,081.08/348.28 KB; candidate 1,119.54/360.44 KB).
These measurements do not represent a real user library, a physical Android device, network conditions, or p95 behavior. `performance.memory` was available but is only a single Chromium heap snapshot and is not used as an acceptance result.
## Verification
- `npm.cmd run build` — passed; production bundle `index-D_mK8lJo.js`, PWA shell build `78ae21da2c0f28d6`.
- Local production preview E2E, desktop Chromium — 2/2 passed (1,000-book keyboard/focus, scroll return, all views; 5,000-book bounded DOM and final item).
- Local production preview E2E, Pixel 7 viewport emulation in Edge — 2/2 passed. This is emulation, not Android hardware.
- `npm.cmd audit --omit=dev --json` — 0 production dependency advisories. `npm install` reported 8 advisories in the full dependency tree; they were not triaged or changed as part of this feature.
- Production Edge E2E against `https://thu-phong-private.pages.dev`: virtualization 2/2 and offline-shell regression 1/1 passed using synthetic IndexedDB fixtures and intercepted `/api/**` requests. The canonical and deployment URLs serve `/assets/index-D_mK8lJo.js` with SHA-256 equal to the local build; `/sw.js` is JavaScript with PWA build ID `78ae21da2c0f28d6`.
- Physical Android: not measured. Pixel 7 viewport emulation passed; the user clarified that a phone connection is not needed for the current web work.
