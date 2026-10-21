**10/10/2026 13:10 ICT — KEY-POOL-1 + GEMMA 4 ĐÃ PHÁT HÀNH:** key pool **19 key Gemini** trong secret `GEMINI_API_KEYS` (nạp từ stdin, không lưu file) + xoay tuần tự ngay khi 429 (cooling `key:model`, retire 10 phút rồi tự thử lại, id theo fingerprint/hàng D1); **allowlist 8 model** = 6 Gemini (default `gemini-3.5-flash`, có `gemini-2.5-flash`; legacy map `3.5-flash-lite`/`3.6`/`3.7` ở server + client) + **2 Gemma 4** (`gemma-4-26b-a4b-it` chạy tốt ~12s; `gemma-4-31b-it` hiện Google 500/503) — Gemma hỗ trợ `systemInstruction` nhưng **không** hỗ trợ `thinkingConfig` và trả kèm part `thought:true` (server bỏ qua); **UI thêm/xoá key trong ⚙AI** qua `GET/POST/DELETE /api/ai/keys` (D1 `ai_keys`, migration 0006, trần 50, rate-limit 30 ghi/10 phút/IP, **không token** theo quyết định người dùng, chỉ trả bản che). Kiểm chứng: unit **1040/1040 exit0** (70 file), build **exit0**, E2E `ai-keys`+`reader-controls` repeat3 **24/24 exit0**; production Worker **c3475c16** + Pages **dc516643**, smoke thật `smoke-ai-keypool-production` (k1/19 key) + `AI_GEMMA_SMOKE=1` (Gemma 26B 200/tiếng Việt), round-trip add/delete/cleanup, `smoke-ai-production` + `smoke-ai-ui-production` đều exit0. Chi tiết: private-novel/docs/AI-KEY-POOL-PLAN.md (§15–§18). Các checkpoint dưới là lịch sử.
**10/10/2026 12:30 ICT — KEY-POOL-1 Phase 1+2 phát hành (6 model):** (đã thay bằng checkpoint 13:10 ở trên, cùng phiên).
**10/10/2026 11:40 ICT — KEY-POOL-1 (Phase 1) code xong, chưa deploy:** (đã thay bằng checkpoint 12:30 ở trên, cùng phiên).
**10/10/2026 09:55 ICT — R2/R3 AI-TTS recovery:** prewarm AI bounded retry/cooldown/dedupe + TTS cursor/auto-scroll/resume sau reload (một nút tiếp tục, không autoplay); root1014unit/69files +build95 +E2E208pass repeat3(recheck2flaky6/6) +review độc lập134targeted6/6invariant; production smokes realTikTokresume/prewarmrecoverymock/realGeminiUI 2viewport đạt; Pages870d4d15. Chi tiết xem HANDOFF và docs/AI-TTS-RECOVERY-PLAN.md. Các checkpoint dưới là lịch sử.
**09/10/2026 07:25 ICT — AI-READ-1 release91c7f479:** inlineAI/TTSautonext/preload1/dedupe/arrows/URLreload/8models/perbookconfig; root595unit/build84 +198scenarios192pass6legacyfail→6Namefinalpass; independent66/160/build0. RealGemini/default+3.8/nativeTikTokproduction đạt. MIN2 kho namedprompt/Albumregistry/cloudmetadata còn mở; xem HANDOFF và docs/AI-READING-PRELOAD.md. Các checkpoint dưới là lịch sử.
**08/10/2026 22:13 ICT — MIN2 kế hoạch:** xem private-novel/docs/READER-MINIMAL-2-PLAN.md; ưu tiên dọn UI/ConvertPanel, prompt chung/riêng, Album tạo/xóa giữ truyện, rồi metadata cloud. Chưa triển khai.
## 08/10/2026 22:09 ICT — NO-AUTH / ONE-STEP, trạng thái mới nhất
- Theo chỉ đạo người dùng: bỏ PIN/login/mã kết nối AI và xác nhận phụ. Không tự khôi phục. Quyết định này supersede capability/Origin/RAM connection trong các checkpoint cũ.
- AI endpoint công khai dùng secret server; key không nằm VITE/bundle/Git/log. TXT/batch/folder chọn rồi Nhập một lần; xóa/gỡ trực tiếp. Giữ validation/checksum/quota/cloud-delete trước local-delete.
- Root531unit/44files/build82 exit0;216/216 E2E10spec repeat3, desktopEdge+Androidviewport. Known backup globalNames it.fails chưa sửa; Androidhardware chưa xác minh.
- Native publication cancel/unmount36/36: sửa promise Dexie.waitFor treo khi native abort; race cancellation chỉ reject khi tx.on(abort) rollback, cleanup own IDs và không cleanup sau commit.
- Production Pages387b2a49, index-CzVAWXhO.js/CSSindex-D5xAlN3s.css; Worker0865fd17-1de7-4e3a-89bd-4c0b20d803bc. Không đổi key/schema/migration.
- Production API anonymous2001487ms/foreignOrigin2001075ms STOP/Names đúng; UI1280/522 realGemini/customprompt/sourcePreserved/panelFits/noConnectionRequired đạt. One-step smoke single/batch/folder/Album/noConfirm/delete đạt cả2sizes, cloud/dict mocked không read/write/delete truyện thật.
- GPT-6.1-sol/medium triển khai backend/import; root frontend/tích hợp/cancel fix/deploy. GPT-6-astra/high review170tests rồi quota; GPT-6.1-sol/high fallback266tests+build và88importtests+build sau fix, không blocker.
- Chưa hoàn tất STORAGE2/originals/EPUB ảnh/cloudName+progress/bulk corpus/AI>32k/checkpoint/cache/Android thật. Không khẳng định toàn web xong.
# Kế hoạch hoàn thành Private Novel Reader

**08/10/2026 21:25 ICT — READER-CONTROLS-1:** nút dịch trực tiếp +cụm AI/tai nghe48px/gear như ảnh STV, kết nối AI nhớ RAMtab và Ngắt kết nối;517unit/build82/132repeatE2E, independentGPT-6-astra62/build, production50a0e030 nativeTikTok+Gemini1280/522 đạt. AIpreview, không fullAIprose/TTSAI, không copyuserscript/keyrotation.

**08/10/2026 19:50 ICT — AI-4:** Gemini3.5FlashLite/customprompt/preview bảo vệ capability, Pages→privateWorker regionUS đã production6d6a4b67;517unit/build82/48repeatE2E, independent62/build, realAPI200/anon401/origin403 +browser1280/522 đạt. Chưa checkpoint/chia phần>32k/cache/chương dài/Androidhardware; xem HANDOFF/log, không coi toàn web hoàn tất.

**08/10/2026 15:44 ICT — TTS-5xx:** samevoice/bodyone600msretryHTTP500/502/503/504/abortglobaldeadline30s.455unit/build/12repeatE2E; release02a02f53. Actualuserparagraph2sentencescurrently200, exactfailurechưarepro/noSLAguarantee.

**08/10/2026 15:35 ICT — TTS-2:** prefetch2/dedupeexactvoice+text/boundedwindow3/generationcancelall vàpunctuationtailoffsetfix. Root453unit/build80/48E2E+12finalrace, independent47tests+edgeprobes; productiona2e5f8ce. Câuđầu/upstream500/networkvariance vàAndroidhardware vẫngiới hạn; khôngsilentfallback/cachecrossgeneration/LRU32/retry/clipping.

**08/10/2026 15:26 ICT — TTS-500:** leadingstandalone...táihiệngateway500unsupportedlanguage, bỏpunct-onlyspeechchunks/giữoffsetsource.447unit/build/12repeatE2E vànativeproduction1280/522pass; release613aaf58. Khôngcookie; khôngnghĩamọi500cleared/upstreamSLA.

**08/10/2026 15:20 ICT — TTS-UI:** user chỉTikTok/no permissioncheckbox; nútNghe trực tiếp48px/pauseResume/loadingstop +⚙Nghe2voices, khôngautoplaystartup.446unit/build/120repeatE2E, Pagesbaf76e2c. TTS-2prefetch chưatriểnkhai.

**08/10/2026 15:08 ICT — TTS-1 release1472c005:** hai giọng Việt TikTok public POST/base64, consent/tốcđộ/highlight/pauseResume/stop/autonext, Unicode200/timeout30s/streamcap2MiB và CSPexactorigin. Root446unitreported/build80/120E2E+48finalrace, independent90targeted; actualnativeAudio local+production1280/522 và canonical/CSP đạt. Per-sentencegap/no prefetch, Androidhardware/background/nghe bằngtai cònmở. Không schema/cloud/authaccess change; tham khảoSTV chỉ đọc, khôngprivateproxy.

**08/10/2026 14:39 ICT — UI/Reader release:** production454f94ce canonicalverified. UI software P0+VNsearch: title18/20, freshReader19/1.65/760 giữsettingsvoice, Nameinline/advancedlazy, snapshotConvert liên tục/sourceRangeanchor/cancelAudio/progressguard, VNsearch contextsafe. Root427unitreported/build80/330repeatE2E, finalindependent57/build/72repeatE2E đạt; actualChineseproductionName/noBlank/reload/font/menu đạt1280/522, syntheticcleanup200. Androidhardware/IME/zoom/P2RAM/M0/EPUB/storage/cloudNameupdates/backupknownfails vẫn mở; xemUI-READER-UX-PLAN và HANDOFF hiện hành.

**08/10/2026 08:24 ICT — UX-1A local:** root tiếp quản sau agent GPT-6-astra/high quota (plan đã lưu). Typography title18/20px, fullwrap/left/fontinherit/hit44px, handlers/metadata không đổi. Root427unitreported/build0/30finalrepeatE2E đạt; initial6fixture-orderfails giữ. Chưa deploy/Androidhardware/zoom/Readerpreset/Name snapshot-inline. UX-0 giờ01:xx ghi hostUTC, thực08:xx ICT; dùng checkpoint này làm trạng thái mới nhất.

**08/10/2026 01:17 ICT — UX-0 nghiên cứu/plan:** người dùng chỉ định GPT-6-astra; docs/UI-READER-UX-PLAN.md là ưu tiên UI mới: dễ chọn tiêu đề, Reader vừa màn hình, Name gọn và không blank/nhảy cuộn khi reconvert. Root xác nhận title12px, panel82–84% chiều cao mobile và DOM blank50ms bằng Chinese tổng hợp. Root/agent57targeted pass; chưa triển khai UI/deploy, production793cfdd4 giữ. Không đổi schema hoặc phạm vi cloud; STORAGE/EPUB/BULK còn mở.

**08/10/2026 00:46 ICT — FOLDER-ALBUM-2/UI-4:** quy tắc mới mỗiTXT=truyện, mỗifolder=Albumfullparent, mandatorysplit/atomicperbookAlbum; không gộp TXT thường theofolder nữa. BOMautodetect+blankrejectreview89/root427/build/60finalrepeatE2E đạt. Bỏtopbar/notes/footer/chrome lặp, menu⋯nởcard khôngclipped, actualprod1280/522 hit-test pass. Deploy793cfdd4, synthetic13.45MiB→75parts/cloudSHA+autoAlbum2books đạt/cleanup. Oldbooks không tự migrate; parts/originals/EPUB/BULK cònmở.

**07/10/2026 23:53 ICT — FOLDER-LARGE-1:** TXT>2MiB trong folder tự thành truyện riêng qua Worker, không yêu cầu chọn lại; nhóm thường giữ nguyên, Album atomic. Caps40MiBfile/32MiBnormalgroup/256MiBselection, rollback scoped. Root417reported/build/42repeatE2E, independent79/build; deploy c8886be8 actual synthetic14103969byte→75chapters/14117709cloudbytes/SHA+Album đạt và fixturecleanup. Chưa nội dung/encoding file thật, EPUB hoặc toàn corpus; server32MiB snapshot vẫngiữ.

**07/10/2026 21:02 ICT — CHAPTER-1/ALBUM-1:** bắt buộc chia chương, Album optional chứa truyện. Bỏ disable detection, folder tự tách heading/phần64k giữ filegốc; Unicode/feed-boundary regression; Album import atomic +snapshot/catalog+D1 additive0004+lọcTủsách. Root399unitreported/build/66repeatE2E, independent147/build/18AlbumE2E; production9981adb9 actual Album/Chinese Convert/reload đạt. Chưa chuyển Album truyện cloud đã publish, taxonomy, EPUB/toàn corpus; tiếp STORAGE-2 parts/originals. Các câu chờ mapping checkpoint cũ thay bằng chỉ đạo này.

**07/10/2026 18:49 ICT — BULK-0:** Người dùng chọn toàn kho STV Novel để upload theo thể loại/tác giả → truyện → chương. Đã quét metadata 73.839 file, TXT72.680/EPUB62; chưa upload. Mapping tập hợp đang chờ lựa chọn; 21 nhóm raw >32MiB nên cần STORAGE-2 chapter parts/originals, EPUB parser và metadata catalog trước nhập toàn kho. Xem private-novel/docs/BULK-LIBRARY-PLAN.md và HANDOFF; checkpoint này thay ghi chú trước chưa có quyền upload nguồn chọn này. Scanner373unitreported/build/30repeatE2E và independent10targeted đã đạt; chưa nghiệm thu corpus/Android thật.

**07/10/2026 18:29 ICT — Kho chung auto/public theo quyết định người dùng:** PUBLIC_LIBRARY=1, ai có URL đều đọc/thêm/xóa, không cầnlink/password. Tủsáchlocal/cloudchung;7từđiển53451768bytesR2seed/clientatomicmissinginstall; xóa permanenttombstone/chốngretryresurrection; menuSao lưu/Đồng bộẩnmodepublic. NativeFixedLengthStream sửatransport lớn;363unitreported(knownbackupfails)/build/72repeatE2E, independent134+119 vàproductionfreshprofile/3realSHAtransfers đạt. Deployeca0c5c4. Originals/EPUB/progress/Nameupdate/GC cònmở; lịch sử private phía dưới không còn là UX hiện hành.

**06/10/2026 22:51 ICT — UI-2 production:** mainnav2 Tủ sách/Cài đặt, một select4groups, UI-1 dọn nút cùng deploy9971e099.282unitreported/build/108repeatE2E và canonicalproduction navigation smoke pass; không đổi schema/auth/sync. Tiếp UI-3 catalog chung, giữ STORAGE2/EPUB1/SYNC2 mở.

**06/10/2026 22:42 ICT — UI tối giản:** ưu tiên mới gom chức năng theo luồng, xem docs/MINIMAL-STEPS-PLAN.md. UI-1 local bỏ nút lặp và Sửa/Xóa qua ⋯ đã282unitreported/build/48repeatE2E pass; chưa deploy. Tiếp UI-2 Cài đặt theo nhóm, UI-3 Tủ sách chung; không đồng nghĩa STORAGE-2/SYNC-2 hoàn tất.

**06/10/2026 22:07 — R2 đã nối thật:** bucket private thu-phong-library/DB migrations/Pages secret hash đã cấu hình, finaldeploy1f4733f0. Kết nối bằng liên kết một lần (không mật khẩu), auto upload bản chữ/chương/Name và đọc cloud một lần bấm.282unitreported(1knownfails),build0,68independenttargeted,48repeatE2E+18finaldevice-link pass; actual R2/browser synthetic roundtrip pass và fixturecleanup. Chưa lưu cloud file gốc/dictionary/progress/ảnhEPUB hoặc fullupdate/delete; đọc HANDOFF trước ghi chú lỗi10042 lịch sử bên dưới.

**06/10/2026 18:54 — Bắt đầu kế hoạch ít thao tác:** xem private-novel/docs/MINIMAL-STEPS-PLAN.md. FAST-1 cache Convert trước queue warm-load đã kiểm chứng/deploy e789c046;251unitreported(1knownfails),build0,30finalrepeatE2E và production fixture Chinese pass. Chương cũ mở khi Worker load còn bị giữ; không phải compiled index hoặc dictionary cloud. Tiếp mục/truyện/chương và EPUB; R2 account activation còn là thao tác chủ tài khoản, các lệnh cấu hình sẽ do AI thực hiện trong phạm vi cho phép.

## Định hướng sản phẩm hiện hành — xác nhận 06/10/2026

Website là **thư viện riêng cho một người**, phục vụ lưu TXT/EPUB, đọc Convert và lưu trữ lâu dài. Đây là ưu tiên hiện hành khi các kế hoạch lịch sử bên dưới khác phạm vi.

- Nhập nhiều file: mỗi TXT/EPUB là một truyện; nhập folder: mỗi folder một truyện, các file nội dung trực tiếp là chương.
- Tạo mục trong thư viện để chia nhóm: mục → truyện → chương. Truyện có thể chuyển mục; dữ liệu chương và quy tắc nhập không thay đổi khi đổi nhóm. Cần thiết kế/kiểm chứng trước đổi schema.
- Đọc TXT/EPUB trên Windows và Android; EPUB giữ ảnh, thứ tự và mục lục, phần chữ vẫn Convert và sửa Name cố định. Tiêu đề truyện/chương hiển thị Convert.
- Giữ file gốc để tải lại và giữ riêng dữ liệu phục vụ đọc/chỉnh sửa. Không coi compact snapshot chỉ có chữ là đã hoàn thành lưu trữ TXT/EPUB.
- Kho theo yêu cầu R2 trước đó, cùng thư viện Windows/Android; người dùng bỏ yêu cầu mật khẩu truy cập lúc17:25. Thiết kế truy cập không yêu cầu nhập mật khẩu cần quyết định trước đổi backend; auth API hiện có chưa được sửa. Local phục vụ đọc và giữ dữ liệu khi upload lỗi. Cần hỗ trợ mang theo Name, từ điển và vị trí đọc; thiết kế xung đột cho cùng một người dùng nhiều thiết bị.
- Vietphrase và bộ từ điển gốc được lưu bền vững trên web, chọn một lần và dùng lại. Ưu tiên khởi động nhanh: đo đọc Blob/parse/index/Convert riêng; thử cache index đã chuẩn bị và kết quả chương/tiêu đề để tránh chặn đọc bởi parse toàn bộ. Cache phải tự hết hiệu lực khi từ điển hoặc Name thay đổi. Chưa triển khai các cache này; IndexedDB hiện chỉ giữ bản gốc và Worker vẫn parse lại khi reload.
- Có xuất/sao lưu/khôi phục đã kiểm chứng. Giữ yêu cầu chi phí 0 VNĐ; dung lượng thực tế và khả năng đáp ứng kho20GB phải được xác minh, không tự đổi sang trả phí.
- Giao diện đọc/sửa từ theo tham khảo STV và Convert theo Vietphrase. Không làm đăng ký cộng đồng, nhiều vai trò người dùng, bình luận, tương tác xã hội hoặc xếp hạng. TTS và dịch AI là phần sau.

Ưu tiên bổ sung17:25: tối ưu khởi động Vietphrase, tổ chức mục/truyện/chương và EPUB có ảnh/Convert/edit Name; sau đó hoàn thiện kho giữ file gốc, truy cập không yêu cầu mật khẩu và đồng bộ dữ liệu đọc/chỉnh sửa. Backup/restore, dung lượng lớn và thiết bị thật là điều kiện nghiệm thu lưu trữ. Cấu hình R2 có thể tiến hành song song khi tài khoản sẵn sàng. Hiện TXT đã có; mục/EPUB/file gốc cloud/full sync/cache Convert chưa hoàn thành.

**06/10 14:04:** folder TXT đã triển khai/kiểm chứng nhỏ: parent trực tiếp=truyện, TXT=chương, natural sort, preview/cancel/atomic confirmation.182unit/build/36repeatE2E+4final pass, review75targeted. Trần2MiB/file,32MiB/folder,128k/chương; không có streaming kho20GB. EPUB ảnh vẫn chưa làm; các mô tả chưa triển khai folder phía dưới là lịch sử trước checkpoint này.

**Yêu cầu importer bổ sung 06/10/2026:** nhập riêng TXT/EPUB: mỗi file là một truyện. Nhập theo folder: mỗi folder là một truyện, mỗi file nội dung trực tiếp bên trong là một chương; chọn nhiều folder tạo nhiều truyện. EPUB giữ ảnh và thứ tự nội dung, phần chữ vẫn Convert/chạm từ/edit Name cố định theo truyện như Reader hiện tại. Chưa triển khai. Cần preview thứ tự chương trước commit; xử lý folder lồng nhau/file không hỗ trợ phải hiện rõ, không tự gộp hoặc bỏ âm thầm. Backup/restore cần giữ ảnh, liên kết tài nguyên và Names; storage cloud 20GB chưa chọn phương án.

**Checkpoint06/10/2026 11:29:** popup #nsbox/Reader mặc định Convert/chạm từ đã qua phạm vi nhỏ: high review persistence/race,145unit,build,74fullE2E và retokenization repeat3. Hai lỗi review (mất khoảng trắng và một range tạm lỗi làm mất/chặn range khác) đã có regression. Tiếp 5 biến thể AddName/Tr Sửa/layout tổng; chưa Android thật hoặc clone100%.

**Cập nhật05/10/2026 21:00:** STV-3a trang truyện local đã qua nghiệm thu nhỏ: metadata/mục lục/read-only, resume/từ đầu/chọn chương và quay lại. Back trước hydrate từng ghi đè progress, đã sửa và reviewer48/48repeat3; root68/68E2E,116unit(1expected),buildpass. TiếpSTV-3b/Readerwordedit hẹp theo HANDOFF; M0/backup/Android/private gates giữ mở.

**Ưu tiên mới05/10/2026 20:05:** clone UI và thao tác STV từng luồng theo `STV-FEATURE-PARITY-PLAN.md`; Convert đối chiếu Vietphrase và lưu Name cố định đã qua phạm vi nhỏ. Không coi bản clone/hosting hiện tại là đạt tất cả gate. Prompt bàn giao tại `NEXT-AI-PROMPT.md`.

**Cập nhật 05/10/2026 14:28:** người dùng ưu tiên Convert trước. Luồng Convert đoạn local đã qua83 unit/40E2E và review độc lập; benchmark bộ thật43,7MB trên Windows đã có trong `private-novel/docs/CONVERT-VALIDATION-2026-10-05.md`. Đây là điều chỉnh ưu tiên so với tạm hoãn feature bên dưới; Android thật, RAM Worker, parity đầy đủ và các gate R0/R1 vẫn mở.

**Quyết định hiện hành 05/10/2026:** R0 đọc/Convert, chưa bắt buộc TTS; M5 là tùy chọn sau R0. Không tự bật Web Speech fallback. Trạng thái M0–M8 và lệch schema/layout ở `private-novel/docs/STATUS.md`; bảng/cây bên dưới là thiết kế mục tiêu, không phải mô tả mã đã hoàn tất. Tạm hoãn feature mới để đóng kiểm chứng A3 và các spike M0. Kế hoạch cũ đã archive.

Ngày lập: 04/10/2026. Thiết bị ưu tiên do người dùng chọn: Windows + Android.

Trạng thái: local alpha đã có bản chạy thử; chưa deploy hosting. Ngày 04/10/2026 người dùng yêu cầu giản lược MVP: mỗi file TXT là một truyện, chương trong file tạo mục lục, nghe chỉ tiếng Việt và ưu tiên TikTok TTS qua adapter/gateway được phép. Kế hoạch này thay thế các quyết định kiến trúc xung đột trong PRIVATE-WEB-PLAN.md.

## 1. Kết luận và phạm vi phát hành

Khả thi để hoàn thành bản đọc TXT + Convert + Name List + TikTok TTS qua gateway được phép + backup trên thiết bị, đưa giao diện lên web riêng trong hạn mức hosting miễn phí. Cloud không phải điều kiện để nhập, lưu và xử lý truyện local; phần xác thực server là điều kiện trước khi phát hành URL private online.

Chốt ba mức sản phẩm:

| Bản | Nội dung | Điều kiện hoàn thành |
|---|---|---|
| R0 — local alpha | TXT, Library, Reader, splitter, Convert, Name List, backup/restore; TTS chưa bắt buộc | Các luồng R0 hoạt động trên Windows và Android; không lỗi mất dữ liệu mở; dữ liệu nằm trên từng thiết bị |
| R1 — private web MVP | R0 + đăng nhập server + triển khai Pages + kiểm thử phát hành | Có URL HTTPS miễn phí, người chưa đăng nhập không mở ứng dụng/API được; dữ liệu truyện vẫn local |
| R2 — mở rộng chọn lọc | Metadata/progress sync, Gemini theo yêu cầu, Azure nếu phù hợp; content sync là quyết định riêng | Chỉ triển khai chức năng có nhu cầu, quota và cơ chế lưu dữ liệu đã được xác minh |

R1 là đích của kế hoạch triển khai chính. Các mốc R2 có backlog nhưng không kéo dài điều kiện nghiệm thu R1. Điều này giữ phạm vi MVP trong tài liệu đính kèm, đồng thời đáp ứng yêu cầu website private online ban đầu.

MVP không bao gồm: đưa toàn bộ 4,96 GB lên cloud; dịch AI hàng loạt; Edge bridge; EPUB/DOCX/PDF; Pixiv; service worker/PWA offline mã hóa; tự đồng bộ toàn bộ kho. TikTok TTS chỉ dùng gateway được phép và không nhúng API key/secret vào bundle.

Local-first không đồng nghĩa mở lại web khi mất mạng hoàn toàn: R1 chưa có service worker cache ứng dụng. Khi trang đã tải, đọc/convert local không cần API nội dung; đăng nhập và mở phiên online mới vẫn cần mạng. TTS offline còn tùy giọng.

## 2. Bằng chứng và những điểm đã sửa so với tài liệu đầu vào

Kho nguồn: `D:\linh tinh\tm\STV Novel`. Kiểm kê trước đó: 73.822 file, 4.962.990.882 bytes; 72.665 TXT chiếm 3.244.069.557 bytes; TXT lớn nhất 38.259.088 bytes. Đây là dung lượng thập phân, chưa loại trùng. Chỉ đọc file cần kiểm tra, không sửa/xóa/đổi tên file nguồn và không chạy script trong kho.

Đã tìm thấy nguồn ZXC tại `D:\linh tinh\tm\truyen\vietphrase.zxc.io.vn`, gồm các module được chỉ định. Bổ sung dữ liệu thực tế:

| File trong src/test-dicts | Kích thước | Kết luận hiện tại |
|---|---:|---|
| Vietphrase.txt | 43.687.000 bytes | Đã tìm thấy, không còn là tài nguyên thiếu; 200 dòng đầu kiểm tra đều có dấu = |
| Names.txt | 2.429.701 bytes | Có dữ liệu; kiểm tra mẫu, chưa kiểm định toàn bộ |
| HanViet.txt | 182.819 bytes | Có dữ liệu; mẫu có dòng không theo dạng key=value, parser cần báo cáo |
| PhienAm.txt | 42 bytes | Chỉ 4 dòng; không dùng làm bộ phiên âm đầy đủ |
| !LuatNhan.txt | 1.115.636 bytes | Tên có dấu !; nhập phải chọn loại từ điển rõ ràng, không phụ thuộc duy nhất filename |

NameList.txt trong kho STV Novel có 3.200 dòng, 3.200 key khác nhau sau trim, không có value rỗng, 3.198 key chứa chữ Hán trong dải đã kiểm tra. Có thể dùng làm ứng viên nhập Name List; chưa kết luận mọi mục đều là tên riêng hoặc đúng nghĩa. Giữ file và tên gốc, cho người dùng chọn phạm vi áp dụng.

Đã kiểm tra mã m_translation.js: nó import DOM, có translationCache dạng Map, tạo Cartesian product trước rồi mới slice xuống 100 gợi ý. Phải sinh giới hạn ngay từ đầu và bỏ phụ thuộc DOM trước khi đưa vào worker. Trong dictionary worker, kết quả ghi IndexedDB cần xác nhận bằng transaction complete, không coi riêng request success là giao dịch đã commit.

Các điều chỉnh bắt buộc:

| Vấn đề | Quyết định triển khai |
|---|---|
| Tài liệu nói chưa tìm được Vietphrase 43,6 MB | Cập nhật: đã có file 43,69 MB ở đường dẫn trên; kiểm định/benchmark tại M0 và M3 |
| SHA-256 theo luồng | Dùng thư viện incremental trong worker, đề xuất hash-wasm. Web Crypto digest nhận toàn bộ input, không phải streaming hash |
| Browser TTS preload/cache audio | Chỉ chuẩn bị câu tiếp theo; Web Speech không trả MP3/Blob để lưu ttsCache. Cache audio để dành provider trả audio sau MVP |
| 3 worker từ điển/convert chạy song song | Chỉ một engine giữ từ điển đã nạp trong RAM; parsing và convert là module, có thể chung worker. Không nhân đôi bộ 43 MB thành nhiều Map/Trie ở main thread và worker |
| Name dài/Name ngắn | Trong cùng lớp ưu tiên chọn match dài nhất. Khi Name override ngắn giao nhau với tên dài ở lớp thấp hơn, cho xem trước cảnh báo và xác định hành vi bằng fixture |
| Auth ở sau phát hành | R0 chạy thử local; auth phải xong trước R1 online. Không cần chờ đồng bộ metadata/content mới làm auth |
| Ẩn danh không thấy dữ liệu | Test server gate và origin/profile độc lập. Đây không phải mã hóa IndexedDB trên thiết bị đang đăng nhập |
| Sync progress khi chưa sync nội dung | Dùng content hash để ghép cùng truyện; Android vẫn cần import cùng bản hoặc restore backup |
| Gemini chỉ nhận chapterId | Khi TXT chỉ local, client phải gửi đoạn text được chọn, hash/revision và glossary cần thiết sau khi người dùng bấm dịch |
| HTML Pixiv/key bị lộ | Tài liệu đầu vào có cảnh báo nhưng lượt này chưa xác minh file/credential cụ thể. Không tự khẳng định đã lộ, không thao tác tài khoản; chỉ kiểm tra trước publish và thu hồi credential nếu xác nhận sự cố |

Nguồn: [Web Crypto digest](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest), [hash-wasm](https://github.com/Daninet/hash-wasm), [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis).

## 3. Kiến trúc chốt cho R1

```text
React + TypeScript + Vite
  Library / Import Wizard / Reader / Convert / Name Editor / TTS / Backup
       │
       ├── Dexie (IndexedDB, theo từng origin/profile)
       ├── import.worker: hash → decode → normalize → split → preview
       ├── language.worker: parse dictionary + convert + token suggestions
       └── TikTok audio adapter trên main thread → gateway cùng origin được phép

Pages Functions (cùng origin, chỉ bắt buộc khi phát hành online)
       ├── login / logout / session / gate toàn route
       └── D1: phiên + giới hạn đăng nhập; chưa chứa nội dung truyện

R2: metadata sync / Gemini / TTS trả audio / content storage theo lựa chọn
```

Thư viện: React, TypeScript, Vite, Dexie, dexie-react-hooks, hash-wasm. Kiểm thử bằng Vitest cho logic, Playwright cho luồng trình duyệt; kiểm thử TTS/bộ nhớ trên điện thoại thật. Hono + Pages Functions cho auth; Wrangler cho local server/migrations/deploy. Khóa phiên bản trong lockfile khi bắt đầu code.

Worker message có requestId, bookId, revision, dictionaryVersion, nameListVersion và generationId. Hủy job khi đổi nguồn/đổi chương; bỏ kết quả đến muộn. Gửi dữ liệu theo batch; chỉ truyền buffer có thể chuyển quyền sở hữu khi phù hợp, không postMessage toàn bộ từ điển về UI.

Giao diện dự kiến:

1. Library: tiếp tục đọc, tìm truyện, nhập TXT, dung lượng, sao lưu.
2. Import Wizard: chọn file → phân loại/encoding → preview chương → nhập.
3. Reader: mục lục, Trung/Convert, bốn theme, font/giãn dòng, sửa nội dung, nghe.
4. Name Editor: nguồn, phiên âm, nhiều nghĩa, phạm vi sửa tạm/theo truyện, import/export.
5. Settings: từ điển đang dùng, giọng khả dụng, bộ nhớ, backup/restore, đăng xuất.

Desktop dùng panel phụ; Android dùng bottom sheet, nút chạm tối thiểu 44 CSS px, không phụ thuộc hover. Không render hàng nghìn chương hay token cùng lúc; mục lục phân trang/virtualize, reader theo chương và phân đoạn khi chương quá lớn.

## 4. Hợp đồng dữ liệu local

| Store | Vai trò và trường quan trọng |
|---|---|
| books | id, title, author, language, sourceHash, revision, createdAt, updatedAt |
| sourceFiles | id, relativePath, encoding, byteLength, sha256, blob/chunkRefs, status |
| contentChunks | fileId/version, index, bytes/text; lưu khối có giới hạn |
| chapters | id, bookId, order, title, contentRef/range, contentRevision, paragraphIndex |
| dictionaryVersions | id, type, filename, sha256, parserVersion, status, sourceChunks/indexRefs |
| nameLists | bookId/global, key, value, revision; temporary overrides là state phiên |
| readingProgress | bookId, chapterId, variant, paragraphId, charOffset, contentRevision |
| settings | theme, typography, voice, rate, import preferences |
| importJobs | jobId, phase, processedFiles, stagingRefs, checkpoint, errors |
| restoreJobs | backupId, completedEntries, stagingRefs, conflicts, status |

Không tạo ttsCache audio trong MVP; để repository interface cho R2. Phần TXT được giữ nguyên bytes gốc để xuất lại, còn text chuẩn hóa chỉ lưu một bản theo chunks và chapter ranges khi có thể; tránh lưu cùng toàn văn cho mỗi chương. Sửa chương dùng revision mới, giữ nguồn gốc. Token Convert chỉ cache giới hạn theo hash/version; có thể tái sinh.

Import/restore ghi staging theo batch, transaction ngắn. Chỉ chuyển trạng thái ready bằng giao dịch cuối khi manifest/checksum hợp lệ; crash không làm hiện truyện nửa chừng. Hủy job thì dọn staging, không động vào file nguồn. Không giữ transaction IndexedDB mở xuyên suốt các await đọc file/worker.

Tiến độ lấy paragraphId + offset, có text fingerprint để tìm vị trí gần nhất khi revision thay đổi; chờ font/layout ổn định trước khi cuộn. Debounce khoảng 0,5–1 giây, ghi khi chuyển chương/visibilitychange; không chỉ dựa vào beforeunload trên Android.

Storage quota: dùng navigator.storage.estimate(), xin persist() khi người dùng đã nhập truyện và giải thích ý nghĩa. Xử lý QuotaExceededError bằng rollback/báo thiếu dung lượng; không tự xóa truyện nguồn trong IndexedDB. LRU chỉ xóa dữ liệu tái tạo được như cache Convert. Persist không phải bảo đảm chống người dùng xóa dữ liệu trình duyệt. [Storage quota và eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Chốt origin production trước nhập kho dùng thật: localhost, preview và pages.dev có IndexedDB riêng. Chuyển thiết bị/tên miền bằng backup/restore cho đến khi có sync.

## 5. Pipeline TXT và từ điển

MVP chọn đúng một file TXT hoặc dán nội dung mỗi lần; mỗi file là một truyện, heading bên trong tạo mục lục. Chọn thư mục/batch nhiều truyện là backlog riêng. Android không phụ thuộc quyền đọc trực tiếp đường dẫn D:; người dùng tự chọn file hoặc chuyển backup sau khi restore đạt nghiệm thu.

Hash incremental trên bytes gốc; decode bằng TextDecoder streaming để giữ ký tự cắt ngang chunk. BOM → kiểm tra UTF-8 → gợi ý GB18030 khi lỗi; đây là heuristic, luôn có preview/chọn encoding thủ công. Chuẩn hóa BOM/CRLF được định nghĩa cụ thể, không trim nội dung vô điều kiện.

Kết quả splitter dùng các khoảng không chồng lấn bao phủ toàn bộ text chuẩn hóa; title là metadata, vẫn giữ separator/header gốc trong phạm vi nội dung để round-trip đúng. Phân biệt Quyển và Chương. Giữ lời mở đầu, đoạn cuối, chương ngắn; không có heading thì một chương. splitByMaxChars tạo phần kỹ thuật dưới một chương, không tự tuyên bố đó là chương mới. mergeTinyParts chỉ gợi ý, không tự gộp mất cấu trúc.

Regex người dùng chạy trong worker có watchdog timeout, terminate/restart; input lớn có progress/cancel. Giới hạn RAM bằng queue ngắn và stream; không dùng file.text() rồi split toàn bộ kho cùng lúc.

Từ điển đọc theo dòng/batch, parse dấu = đầu tiên, không mất các dấu = trong value. Nhận đa nghĩa / và ; theo cấu hình; không chuẩn hóa mất dấu phân cách cần giữ. Báo dòng lỗi, key trùng và cách xử lý; không âm thầm bỏ qua tất cả lỗi. Có fixture nhỏ hợp lệ để dev, bộ từ điển thật người dùng import tại máy, không bundle mặc định 43 MB hoặc publish trước khi rõ quyền sử dụng.

Ưu tiên: sửa tạm → Name theo truyện → Names chung → Names2 → Vietphrase → Luật Nhân dạng hỗ trợ → Hán-Việt → giữ chữ lạ. Longest-match trong từng lớp. Token offsets tính theo UTF-16 của text chuẩn hóa để khớp DOM/JS, có test emoji/surrogate pair. Nếu Luật Nhân sinh câu mới, token vẫn giữ span nguồn gốc; không lấy offset của câu đã thay làm offset chữ Trung.

MVP giữ Luật Nhân một placeholder {0} với mẫu kiểm thử có giới hạn, không nhận regex tùy ý hoặc đệ quy vô hạn. Không cho luật ghi đè vùng Name đã bảo vệ. Sinh tối đa 100 gợi ý theo cách tăng dần và dừng trước khi bùng nổ tổ hợp; giới hạn số segment/ứng viên, LRU và thời gian xử lý. Viết hoa trình bày không làm thay đổi dictionary gốc.

## 6. TTS và giới hạn thực tế

MVP hiện dùng TikTok audio adapter và gateway được phép. Reader giữ danh sách giọng từ bản hiện có; Bing/Google chưa tích hợp phải disabled và ghi rõ chưa cấu hình. Endpoint mặc định không đồng nghĩa gateway đã hoạt động. Không dùng proxy nội bộ của website nguồn như API công khai.

Luồng idle → loading → playing → paused → ended/error. Fetch phải trả Content-Type audio, không chấp nhận HTML fallback. generation và audio identity chặn callback cũ sau stop/đổi chương/resume. Auto next chỉ chạy khi chapter/revision/Names hiện tại đã Convert xong; Dừng phải hủy cả continuation đang chờ. Hai scenario hiện có dùng worker/audio mô phỏng, vẫn cần audio thật trên Windows/Android.

Bảng Nghe mở từ công cụ; Ẩn bảng không dừng audio. Nút ■ dừng. Cho người dùng đồng ý gửi câu đang đọc đến gateway trước phát; cấu hình cùng origin hoặc CSP allowlist cụ thể. Nội dung nằm trong URL query của adapter hiện tại nên gateway/log phải được xem xét trước phát hành. Không nhúng secret trong VITE_*.

Highlight theo câu/đoạn, không hứa từng dòng thị giác. Khi sửa nội dung câu đọc cho phiên khác bản truyện, tạm tắt highlight để tránh sai offsets. Tốc độ có thể điều chỉnh ở player; pitch/flex chỉ có hiệu lực nếu gateway hỗ trợ. BrowserPlayer cũ còn trong tts.ts nhưng không nằm trong luồng UI; không coi là Browser TTS đã nghiệm thu.

Media Session/Wake Lock là backlog tăng cường. R1 nghiệm thu nghe foreground trên thiết bị thật; khóa màn hình chỉ ghi hỗ trợ trên cấu hình đã thử, không cam kết mọi máy.

## 7. Backup, tính riêng tư và phát hành online

Backup theo một hoặc nhiều truyện người dùng chọn, không mặc định đóng gói cả kho 4,96 GB. Manifest có schemaVersion, appVersion, file/chapter IDs, content hashes, encoding, thứ tự chương, Names và progress. Có hai chế độ rõ ràng: portable kèm bytes từ điển đang dùng; compact chỉ ghi hash/version và yêu cầu người dùng nhập lại từ điển đúng khi restore. Chỉ lưu dictionaryVersion không đủ khôi phục Convert.

Export theo stream/chia gói kích thước giới hạn để Android không tạo Blob hàng GB; định dạng archive/lib chọn sau thử M0. Các gói có manifest tổng, checksum từng entry và part. Bản backup không mã hóa được ghi rõ là file có thể đọc được. Không đưa session/cookie/secret vào backup. Restore kiểm tra schema, kích thước, số entry, đường dẫn và checksum; preview conflict trước commit, staging và checkpoint hỗ trợ resume. Không nhận archive tùy ý từ kho vào pipeline backup.

Gate Pages áp dụng toàn route, chỉ cho phép login và tài nguyên login tối thiểu. Chưa có auth config hoặc backend lỗi thì chặn. Session random, D1 chỉ lưu hash token, TTL và thu hồi logout; cookie __Host-session, HttpOnly, Secure, SameSite=Strict, Path=/. Kiểm tra Origin/CSRF và rate limit cho login/request thay đổi dữ liệu. Hash mật khẩu bằng KDF có salt, benchmark chi phí CPU ngay M0; không hạ độ mạnh để qua Free quota. Nếu giải pháp auth không đạt bảo mật trong Free budget thì chưa phát hành private online, tiếp tục R0 và đánh giá auth thay thế trước R1.

Không log text, password, dictionary, API key; không render nội dung bằng innerHTML/dangerouslySetInnerHTML. JS/CSS/font/WASM phục vụ cùng origin, CSP phù hợp; không analytics bên thứ ba mặc định. Robots/noindex chỉ phụ trợ. Pages Runtime Fail closed, preview tắt hoặc bảo vệ tương đương, response riêng tư private/no-store. Có gate test quota/backend failure. [Pages routing](https://developers.cloudflare.com/pages/functions/routing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

Threat model R1: chặn người ngoài truy cập web/API; nội dung mặc định lưu trên thiết bị của người dùng, không có API tải TXT công khai. Không bảo vệ trước người có quyền vào OS/browser profile hoặc DevTools của thiết bị đã lưu plaintext. Logout thu hồi phiên, xóa nội dung đang hiển thị và dừng TTS; không tự xóa thư viện. Có nút riêng xóa dữ liệu thiết bị với xác nhận. Mã hóa local/PWA là R2, không gắn nhãn IndexedDB hiện tại là kho mã hóa.

## 8. Các mốc triển khai và tiêu chí nghiệm thu

Ước lượng cho một người có kinh nghiệm, làm tập trung; là dự toán công sức, không phải lịch cam kết. Mỗi mốc có demo và kết quả test trước khi chuyển sang mốc phụ thuộc.

| Mốc | Công việc và đầu ra | Phụ thuộc | Ước lượng | Nghiệm thu |
|---|---|---|---|---|
| M0 | Khởi tạo repo; chốt schema; bộ fixture; spike từ điển 43 MB/backup streaming/auth CPU | Không | 1–2 ngày | Nhận diện bottleneck trên Windows/Android; có lựa chọn khả thi cho từng spike |
| M1 | Dexie migrations, Library, CRUD, Reader, mục lục, settings, progress | M0 | 2–3 ngày | Reload không mất truyện; đổi font/chiều màn hình khôi phục đúng đoạn; xóa không ảnh hưởng truyện khác |
| M2 | Manifest/hash/dedupe, encoding, split worker, preview, sửa chia chương, import staging/resume | M1 | 3–4 ngày | TXT 38.259.088 bytes nhập được; hash/round-trip text đúng; hủy/crash không tạo truyện nửa chừng |
| M3 | Engine từ điển/Convert worker; bounded suggestions; token model; Luật Nhân có giới hạn | M0, M2 | 3–5 ngày | Bộ thật nạp được trên máy mục tiêu; UI vẫn phản hồi; Name dài/cụm dài/fallback/offset đúng fixture |
| M4 | Name List từng truyện, token selection/expand, nhiều nghĩa, sửa tạm/vĩnh viễn, import/export | M3 | 2–3 ngày | Sửa tên ở truyện A không ảnh hưởng B; đổi version làm mới Convert; round-trip Name List |
| M5 (tùy chọn sau R0) | TikTok gateway được phép, highlight câu, pause/resume, stop, auto chapter | M1, M3; không chặn R0 | 2–3 ngày | Chuỗi ba chương nghe đúng thứ tự; không phát chồng; đổi chương nhanh không phát câu cũ |
| M6 | Backup/restore portable/compact, checksum, conflict preview, resume, storage UI | M2, M4 | 2–3 ngày | Restore sang profile sạch khớp hash, chương, Names, progress; file hỏng bị chặn trước commit |
| M7 | Server auth, D1 sessions, Pages config, login/logout, fail closed, deploy test | M0; hoàn tất sau R0 | 2–3 ngày | Chưa login bị chặn cả URL sâu/asset/API/preview; hết phiên và backend lỗi không mở dữ liệu |
| M8 | Kiểm thử Windows/Android, sửa lỗi, hướng dẫn sử dụng/backup, phát hành R1 | M1–M4, M6–M7; M5 tùy chọn | 2–4 ngày | Tất cả release gates bắt buộc đạt, không lỗi mất dữ liệu hoặc truy cập trái phép còn mở |

Tổng cơ sở: 19–30 ngày công (khoảng 4–6 tuần làm việc toàn thời gian). Dự phòng 20% cho RAM Android, TTS và auth/hosting: khoảng 23–36 ngày công. Nếu tự học và làm ngoài giờ, thời gian lịch sẽ dài hơn. Không cộng R2 vào ước lượng này.

Chuỗi ưu tiên hiện hành: M0 → M1 → M2 → M3 → M4 → M6 → M7 → M8; M5 tùy chọn sau R0. Spike auth ở M0 nhằm tránh đến cuối mới phát hiện Free budget không phù hợp; không yêu cầu đưa nội dung truyện lên cloud để thử auth.

## 9. Bộ kiểm thử và điều kiện phát hành

Fixture cốt lõi không chứa secret, ưu tiên văn bản tự tạo. File thật chỉ dùng tại máy, không commit/publish cả kho. Dùng đúng TXT lớn nhất và bộ từ điển thật cho bài hiệu năng; ghi phiên bản Chrome/Edge/Android, RAM thiết bị và thời gian thực đo.

| Nhóm | Ca bắt buộc |
|---|---|
| Import | UTF-8 BOM/không BOM, GB18030, CRLF, dòng dài, ký tự cắt qua chunk, file trùng, thiếu quota |
| Split | Không tiêu đề, lời mở đầu, Chương/第…章/Quyển, chương ngắn, heading lặp, regex xấu, phần cuối |
| Toàn vẹn | Ghép ranges đúng toàn bộ text chuẩn hóa; bytes gốc xuất lại khớp SHA-256; không double header |
| Convert | Longest match, Name precedence, nhiều nghĩa, dấu = trong value, key trùng, ký tự lạ, emoji, Luật Nhân |
| Bộ nhớ | Từ điển lớn chỉ một engine sở hữu; cache có trần; đổi 20 chương không tăng cache vô hạn; không tải toàn bộ kho |
| Reader | Font/width/theme/rotate, reload, revision thay đổi, progress khi Android chuyển nền |
| TTS | Gateway thiếu/trả HTML/audio lỗi, pause/resume, stop khi đang load, callback muộn, auto chương Convert, đồng ý gửi text |
| Restore | Gói hợp lệ, thiếu entry/part, checksum sai, schema mới hơn, trùng truyện, đóng tab giữa restore |
| Private | Login sai, hết phiên, logout, Origin sai, deep URL, preview, secret scan dist/repo, fail closed |
| Dữ liệu rời máy | Network inspection: import/convert/backup không upload text; TTS remote hiển thị rõ; chưa bật Gemini |

Mục tiêu UX đề xuất: phản hồi thao tác/cancel trong khoảng 250 ms khi main thread rảnh, cập nhật progress tối thiểu mỗi giây; đọc chương đã cache mở trong khoảng 1 giây trên thiết bị tham chiếu. Đây là ngân sách cần đo, không kết quả đã đạt. Không đặt số RAM/thời gian convert giả định trước khi benchmark máy Android thật.

Chỉ phát hành R1 khi: không còn lỗi nghiêm trọng mất nội dung/ghi đè/không thể restore, gate server hoạt động, import file 38 MB thành công, Convert/Names/TTS chạy đúng các ca chính trên Windows và Android, hướng dẫn backup và giới hạn TTS được cung cấp. Không đánh dấu xong bằng cách chỉ dựng nút chức năng.

## 10. Cấu trúc repo dự kiến

```text
private-novel/
  src/
    app/                       # routes, providers, error boundary
    features/
      library/ import/ reader/ convert/ names/ tts/ backup/ settings/
    domain/
      models.ts
      import/                  # encode/hash/split/ranges/manifest
      language/                # dictionary/trie/rules/tokens/suggestions
      backup/                  # manifest/schema/checksums/conflicts
    data/
      db.ts migrations.ts repositories/ storage-budget.ts
    workers/
      import.worker.ts
      language.worker.ts
      protocol.ts
    services/tts/
      provider.ts browser-provider.ts player.ts
  server/
    auth.ts sessions.ts rate-limit.ts
  functions/
    _middleware.ts
    auth/login.ts
    auth/logout.ts
    api/session.ts
  migrations/0001_auth.sql
  public/_routes.json
  tests/unit/ integration/ e2e/ fixtures/
  docs/USER-GUIDE.md BACKUP-GUIDE.md RELEASE-CHECKLIST.md
  wrangler.jsonc
  .dev.vars.example
  .gitignore
```

Tách pure logic khỏi React/DOM để kiểm thử. Không thêm backend nội dung vào R1. Không copy nguyên qtOnline.js/m_translation.js/m_modal.js hoặc TTS userscript vào bundle.

## 11. Triển khai 0 VNĐ và vận hành

Chọn Cloudflare Pages Free + Functions Free + D1 Free cho auth, địa chỉ pages.dev. Repo riêng, build Vite, output dist, secret chỉ ở runtime. Mọi route qua auth middleware trừ login tối thiểu; quota request của Functions vẫn áp dụng khi gate chạy trên asset. Chỉ đưa build/migrations lên hosting, không upload STV Novel hay thư mục source mirror.

Để giữ 0 VNĐ: không bật Workers Paid/R2/Azure trả phí; không mua domain; không gắn paid billing cho Gemini ở giai đoạn này. Hết hạn mức backend thì chặn mở phiên online mới theo Fail closed, không tự nâng gói; phần dữ liệu đã nạp local không phụ thuộc AI. Cloudflare account/D1/secrets cần người dùng cấu hình khi tới M7; không cần lấy password/API key qua chat trong giai đoạn lập kế hoạch.

Quy trình phát hành: local tests → preview dùng fixture, có gate → test Windows/Android → production → backup một truyện mẫu → restore sang thiết bị khác. Trước cập nhật schema, xuất backup và có kế hoạch phục hồi; rollback bundle không tự rollback schema IndexedDB.

Vercel và Tunnel không nằm trong đường triển khai mặc định để tránh duy trì nhiều adapter ở MVP. Tunnel giữ vai trò thử backend/Edge bridge trên PC ở R2, có phụ thuộc máy đang bật.

## 12. R2 và cách chốt tính khả thi trước khi làm

| Tính năng | Phụ thuộc | Điều kiện chấp nhận |
|---|---|---|
| Metadata/progress sync | R1 auth + book/content hash | Hai máy có cùng nội dung nhận đúng tiến độ; conflict có revision; không âm thầm tải TXT |
| Gemini một chương/đoạn theo yêu cầu | Auth + model free khả dụng | Client gửi text đã chọn vì server chưa có TXT; key server, quota project/model, cache theo hash/version; 429 chờ có hạn |
| Azure F0 | Tài khoản/giọng/hạn mức xác nhận | Không tự chuyển gói; hết quota dừng và thông báo; fallback chỉ khi được chốt riêng |
| Edge bridge | PC/service riêng + xác thực | Kiểm thử giọng thực; nêu phụ thuộc PC; không cam kết dịch vụ cộng đồng luôn hoạt động |
| TikTok | Provider hợp lệ, ổn định được xác minh | Không dùng endpoint STV làm backend của mình; chưa đủ điều kiện thì không bật giọng giả |
| Content sync | Chọn storage và ngân sách cụ thể | Chỉ truyện chọn; upload/resume/checksum/private access; không hứa chứa cả kho |
| EPUB/DOCX/PDF | TXT pipeline ổn định + parser riêng | Xuất text có preview; không chạy script/HTML được nhúng |
| PWA offline mã hóa | Thiết kế khóa local và phục hồi | Test mất khóa, logout, offline unlock, update/migration trước công bố bảo mật |

Lưu file ở giai đoạn mở rộng: Cloudflare R2 có free allowance nhưng không phải hard cap 0 đồng; không bật mặc định khi ràng buộc không phát sinh phí là tuyệt đối. D1 sharding chỉ dành tập nhỏ thử nghiệm, không quay lại chiến lược dùng nhiều DB chứa cả kho làm mặc định. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Gemini: rate limit theo project, không tăng bằng đổi key cùng project. Khi không có cloud content, cache bản dịch đầy đủ nên lưu local mặc định; server chỉ lưu trạng thái/hash nếu chưa chốt storage cho output. Job theo đoạn có idempotency/lease, retries hữu hạn; không bắt Worker ngủ chờ quota, không tự dịch hàng loạt. [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

## 13. Việc có thể bắt đầu ngay

1. Tạo project riêng trong workspace hiện tại, chốt schema local và protocol worker theo M0; không sửa thư mục nguồn D:.
2. Tạo fixture nhỏ tự viết, đưa một truyện người dùng chọn vào luồng nhập thử; phát hiện trước phần encoding/title bất thường.
3. Benchmark từ điển 43,69 MB và pipeline TXT 38,26 MB trên Windows/Android, quyết định cấu trúc chỉ mục phù hợp.
4. Hoàn thành Library + Reader và backup tối thiểu trong quá trình phát triển để không dùng dữ liệu thật mà chưa có đường xuất lại.
5. Tiếp tục từng mốc M2–M8; báo cáo theo chức năng thực sự chạy và kết quả nghiệm thu, không chỉ số file đã tạo.

Không còn thiếu vị trí bộ Vietphrase để bắt đầu. Các điểm còn cần xác minh trong lúc code là RAM/giọng thực tế trên Android, tính hợp lệ toàn bộ từ điển và quyền tái sử dụng nguồn tham khảo, cùng khả năng triển khai auth an toàn trong Free budget. Chúng là đầu việc M0/M3/M7, không phải lý do trì hoãn Library/Reader.

## 05/10/2026 — Trạng thái đối chiếu sau audit/UI

Codex đã đối chiếu mã và tạo ca tái hiện độc lập: chưa đạt toàn bộ R0/R1. M6 còn lỗi dữ liệu; M5 chưa gateway/audio thật; M7/M8 chưa deploy/private runtime và Android thật. Không dùng checkbox cũ trong lịch sử HANDOFF làm bằng chứng nghiệm thu.

UI hiện có bánh răng mở/ẩn, bảng Name/Nghe riêng, điều hướng hai đầu và Chỉ đọc theo pattern mã STV đã tải. Xem `private-novel/docs/STV-UI-MAPPING.md` và `USER-GUIDE.md`. Báo cáo/ưu tiên sửa nhỏ có invariants và test tại `private-novel/docs/AUDIT-2026-10-05.md`; release gates tại `RELEASE-CHECKLIST.md`. Các mục trên là tiêu chí chưa hoàn tất, không đánh dấu bằng cách chỉ tạo UI.

## 05/10/2026 09:28 ICT — lượt đa model đã kiểm chứng

A2 Compact Replace đã sửa/review độc lập; C1 longest Names/Names2 và C2 settings hydrate/save đã sửa. Root61/61unit,30/30E2E,buildpass; audit1fixed+6remainingdefects. Không tương đương hoàn toàn STV/Vietphrase hoặc release. Next A3 atomicdictionaryrestore; mapping từ điển và một thao tác Convert/UI nhỏ theo `private-novel/docs/MODEL-WORKFLOW.md`. HANDOFF chứa mô tả per-file/model/test/giới hạn, giữ lịch sử kết quảfail và chưaxácminh. Dữ liệu người dùng ở `D:\linh tinh\tm\STV Novel\mới chưa sửa\Vietphrase-data`, chỉ nhập khi được người dùng chọn, không upload.

**06/10/2026 16:39:** Người dùng cho phép R2 nội dung và nhập nhiềuTXT. Đã triển khai batch1file=1book với giới hạn100/40MiBfile/256MiBbatch. Cloudv1 add-only compacttext/chapter/Name,32MiB/bản/9GBcatalog; không fullsync edit/delete/progress/dictionary/source/EPUB. Tài khoản R2 chưa bật(code10042),AUTH secret absent; chưa remote migration hoặc livecloud. Chi tiết docs/R2-SETUP.md; trạng thái mới ưu tiên hơn các mô tả local-only lịch sử bên dưới.

## Checkpoint09/10/2026 12:28 ICT — MIN2-2/3
- Kho prompt chung/riêng vàAlbumlocal registry đã deploy47fdc6f2; Quản lýAlbum thu gọn ngay Tủ sách, không thêm menu chính. Local-only chưaMIN2-4metadata.
- Root650unit/build88/48AlbumimportrepeatE2E/72promptinlinegatefinal, reviewer33Album+38prompt/build0, productionChineseUI/Gemini1280/510 đã kiểm. Androidhardware chưa.
- STORAGE2-IMPLEMENTATION-CHECKPOINT.md thiết kế+catalogspike; sourceoriginal40MiB nativeR2wholeSHAstreamspike đangdở, khôngenablefeature. ChưaEPUB/AIpersistent/cache/chunk/metadata/bulk.

## Yêu cầu tương lai 10/10/2026 03:22 ICT
- Chi tiết tại private-novel/docs/AI-TTS-RECOVERY-PLAN.md: phân loại ai_invalid_response trước retry; prewarm phát hiện và phục hồi lỗi next, cooldown quota/project/model, fallback minh bạch theo chính sách truyện.
- TTS cursor riêng/highlight/auto-scroll/resume sau lỗi hoặc reload; boundedretry đúng đoạn và không nghe lại từ đầu. Không tự autoplay sau reload; một nút tiếp tục, không xác nhận phụ.
- Không coi kế hoạch là feature đã triển khai. Ưu tiên chốt lỗi CPU truyền40MiB production đang dở, rồi R1 errorclassification → R3 resumeTTS → R2 recoveryprewarm.

## 10/10/2026 05:44 — R1a
Đã phân loại và kiểm phản hồi AI ở client; không tự retry/fallback/keys. R1b diagnostics/deadline còn dở; tiếp R3 TTS cursor/auto-scroll/resume và R2 recoveryprewarm. Kế hoạch không là tuyên bố hoàn tất toàn sản phẩm; nghiệm thu/deploy tại HANDOFF.

## 10/10/2026 07:52 — R1b
Timeout toànAIrequest và diagnosticsan toàn đã triển khai, giữbody/status/APIcontract. TiếpR3TikTokcursor/auto-scroll/resume rồiR2boundedprewarmretry/cooldown. Nghiệmthu/deploy tạiHANDOFF/log; khôngcoilàTTS/EPUB/metadata đãxong.
