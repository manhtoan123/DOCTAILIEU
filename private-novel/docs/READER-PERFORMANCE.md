# Reader performance

## Convert scroll rendering

Convert renders token-level buttons so word selection and editing work; long chapters therefore create many more layout and paint nodes than the raw reader. 

### Experiment evaluated before release
1. **Direct text rendering for tokens without Name Image**: In `Reader.tsx`, if `x.token.nameImage` is absent (the vast majority of tokens), `x.text` is rendered directly as a text string instead of passing through `<NameImageText>`. This eliminates thousands of redundant `Set`, sort, slice, and `Fragment` allocations per render cycle.
2. **Scoping `content-visibility: auto` to Convert mode**: In `stv-layout.css`, Convert paragraphs after the first three use `content-visibility: auto` with an experimental `12em` intrinsic-size estimate, scoped directly via `.reader[data-reader-mode="convert"] .prose > [data-paragraph]:not(.speaking):nth-of-type(n+4)`. This replaces the slower `:has(...)` selector and explicitly keeps the active TTS `.speaking` paragraph eager to prevent unexpected layout jumps during audio playback.
3. **Preserving `<button>` semantics**: Token elements remain `<button>` to ensure full keyboard navigation, focus management, and accessibility invariants without unsupported assertions about element weight.

### Sources & References
- [Chrome: Defer rendering heavy content](https://developer.chrome.com/docs/modern-web-guidance/guides/performance/defer-rendering-heavy-content)
- [MDN: content-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility)
- [MDN: contain-intrinsic-size](https://developer.mozilla.org/en-US/docs/Web/CSS/contain-intrinsic-size)
- [Yomitan Text Scanner](https://github.com/themoeway/yomitan)

### Verification & Review Verdict
- `npm.cmd run build` passed with clean exit using `.dsh-tmp/t/bld` temp directory.
- Targeted tests: 93 tests passed across 5 test files (`reader-word-edit.test.ts`, `reader-word-actions.test.ts`, `polish-word-blocks.test.ts`, `name-images.test.ts`, `reader-route.test.ts`).
- **Independent review verdict**:
  - *Direct text render branch*: **PASS**. Preserves text nodes, Name image handling, token click delegation, keyboard navigation, and zero state mutation.
  - *CSS `content-visibility: auto`*: **FINDINGS / HOLD FOR REAL DEVICE VALIDATION**. Before production deploy, verify scroll stability on long chapters with mixed dialogue and narrative across Chrome/Edge Windows and Chrome Android:
    1. First-pass scroll down and scroll up (scrollbar thumb jitter check).
    2. Reload mid-chapter (`scrollIntoView` at target paragraph index).
    3. Font size changes and Raw ↔ Convert mode switches (`restoreReadingAnchor`).
    4. TTS audio follow (`.speaking` exemption and center auto-scroll).
    5. Keyboard Tab/Enter/Space navigation and text phrase selection across paragraphs.
- Edge Windows automated smoke on the built preview (synthetic mixed-length chapter, 220 paragraphs, cloud APIs mocked): saved paragraph 100 and Enter lookup passed. After opening the word popup with Enter and switching to Raw, paragraph 100 left the viewport with the CSS enabled and stayed visible with the CSS disabled in the same build. Over five wheel inputs the document height shrank by 5,344 px with CSS enabled and stayed constant with CSS disabled. These height samples do not measure frame timing. Pixel 7 emulation kept paragraph 100 visible on the mode switch but also showed changing document height.
- Deployment remains held. Real Android, font changes and TTS follow remain unverified. Evidence: `.dsh-tmp/reader-perf/scroll-smoke-ab.log`.

## EPUB Convert render and frame indexing · 12/11/2026

EPUB Convert could repeat expensive work when unrelated Reader state changed: rebuilding converted spine nodes and joined text, reapplying polished output, and serializing the complete EPUB layout/content signatures. These derived values now use `useMemo` keyed to their actual input references. The opaque EPUB bridge also used a DOM `Range` for every text node to find offsets inside a converted wrapper. It now walks each wrapper's text nodes once with a consumed-character counter. TTS updates binary-search the ordered text-node offsets and create ranges only for nodes intersecting the current sentence; word-selection styling scans all token spans only when the selected range changes.

The approach follows React's guidance to cache expensive calculations while dependencies remain unchanged ([`useMemo`](https://react.dev/reference/react/useMemo)); it preserves EPUB's token buttons, word selection, and TTS range mapping. Targeted `epub-render-security-review.test.ts`: 8/8 pass, including a synthetic 2,000-word update checking one `Range.setStart`, exact highlighted text, selected-word offset, and one token-span scan across two TTS updates. `npm.cmd run build` passed. Production Pages deployment `29c07660` on `master`, rollback `13aee3d4`. Canonical HTML and bridge returned HTTP 200; production bridge SHA-256 matches the built source. This deployment includes unrelated existing dirty-tree changes. No frame-time benchmark or real-device measurement was made.

### Production release · 11/11/2026
Pages production deployment 84660ae0 on master. Rollback point a51be252. The release keeps direct text for tokens without Name Image and removes the experimental content-visibility rule and its mode attribute. The reconstructed baseline matched the production JS and CSS SHA-256 before the Reader change. Final build passed. Preview and production smoke passed on Windows Edge and Pixel 7 emulation with cloud APIs mocked. Both restored paragraph 100, opened token lookup with Enter, retained the paragraph on switching to Raw, and showed stable document height over five wheel inputs. Production returned HTTP 200 and the JS SHA-256 matched the release artifact. Real Android, TTS and frame timing were not measured. Logs in .dsh-tmp/reader-perf/text-*.log.
