# EPUB-READER-3 — 13/10/2026

User requested Space scrolling, Google AI meaning query/Google Translate English prefill, VP multi-meanings, Convert parity and reported EPUB layout error. No new API/key/provider or Gemini billing.

Trusted opaque iframe forwards Space/ShiftSpace/PageUp/PageDown/Home/End to reader with source+nonce+key+strictboolean validation; editable/link/modifier guard and open-tool/modal guard. Enter still selects a word. PopupVP displays slash-joined meanings, selecting one remains supported. Search opens fixedHTTPSGoogle udm50 with quoted Chinese meaning question; Name English button opens GoogleTranslate zh-CN→en. URLs encode source as query data, noopener/noreferrer.

EPUB renderer no longer reintroduces untranslated/blacklisted source when dictionaries are loaded; preserves original whitespace and exact word offsets. Without any dictionaries, offline source preservation remains explicit. Reference Vietphrase primary source inspected (https://vietphrase.zxc.io.vn/src/js/m_translation.js): unavailable/empty translations omitted. Shared base does not override different Names/rules/custom edits; no externalfullcorpus identity claim.

Original sourcechapter128k unchanged. Display/render and AI cached/fresh mappings allow512k characters with exactnodecount; incompatible node count and over-cap errors now distinct. Selected problem snapshot43153sourcechars/769nodes re-sanitizes with769nodes; synthetic4x mapping170308chars builds successfully using actual layout. Snapshot only in ignoredtemp; no userbook edits/reimport.

Sol/high independent15PASS including nativeURL/token/cache/sourcecap and actualopaque bridge. Rootfull1307/97PASS/buildPASS. E2E currentDesktop+Androidlayout4PASS; raw/Convert/style/Space/ShiftSpace/VP/GoogleURLs and selectedlayout metrics. Relatedoriginal/folder/EPUB/M0 E2E17PASS+3intentionalskips. Logs `.dsh-tmp/epub-reader-3-independent-review.log`, `epub-reader-3-e2e-final.log`, `epub-large-root-e2e.log`. First UI test ran before trustedbridge resized; readiness predicate added, no production code weakened.

Production Pages d920c5dc/master/index-Bb5PMvGC.js; production2layouts PASS (Space/Google links/Name/EPUB/nền sync/noerrors/nooverflow), `.dsh-tmp/epub-reader-3-production.log`; Space race repeat3×2projects6PASS `.dsh-tmp/epub-reader-3-space-race.log`. Capacity scope/guardreview in EPUB-LARGE-1.md. No Androidreal/Gemini/actualstockVPfulloutput/realbigarchiveedge claim.
