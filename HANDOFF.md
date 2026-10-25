# Private Novel
25/10/2026.

Chỉ mục private-novel/{docs,src,scripts}/README.md; AGENTS.md.

## Online
https://thu-phong-private.pages.dev/ — Pages6f16d27c (TTS tự phục hồi), index-DGAjMYUl.js. AIWorker giữ9a20f69f; giữ dữ liệu truyện. Remote0001–0012 + schema14 alias/15TTS(direct); index13 chờ quota; SHARED_STATE_ENABLED=1. Rollback Pagesa7cbfe29. Smoke cô lập cloud: .dsh-tmp/{numeric-route,album-names}-*.

Tủ sách: Lưới/Danh sách/Thu gọn, nhớ localStorage; title mở chi tiết.

## Reader, AI, Convert
URL /r/mã-số/vị-trí (mục lục từ1, bỏ chương ẩn); mã22 và /read cũ còn dùng.
Bảng AI: RAM/cache cùng facts theo request key; legacy unknown. Nội dung/tác vụ riêng; tiến độ phần lá; Dừng đúng chương. Bỏ footer; nút chương≥48px; mục lục định vị.
Plan: docs/UI-READER-UX-PLAN.md; D1–D2 xong; D6 UI tách, controller chờ D3–D4; D3–D5 chưa làm.
Name: chung theo Album tác giả/gồm series; ngoài Album riêng. UI tìm/phân trang10/bulk gọn; legacy giữ, xung đột chờ chọn. CAS/tomb/backup. AI TXT đúp→Convert→Name, giữ AI/TTS/picker. docs/ALBUM-NAMES-M0.md.
Convert Name server7814891b qua service binding; D1 corpus083752ea bất biến, pin SHA/versionSQL3. Cửa sổ256 UTF-16/100Names, output65k; request32KiB. Tra theo token, whole lookup khi mở rộng. Client cacheRAM8/timeout20s/abort/stale guard/SHA; không đọc fullVP khi thành công, có local fallback. QuotaCAS reserve2M/ceiling3M ngàyUTC. Free best effort, chưa bảo đảm mọi tải; docs/SERVER-CONVERT-FREE-M0.md.
AI tối đa2key/chương qua lease/cooldown; foreground ưu tiên prewarm. Mỗi đợt giữ send/deadline cap; hết đợt nghỉ≥60s/Retry-After rồi tự mở đợt mới, giữ partial/model pin. Lỗi kết quả thử chậm; auth/input/config chờ sửa, UI hổ phách. Stop chặn timer/callback; giữ prewarm qua hydrate. first60/idle30/hard180s/lease185s. STV image caption cho AI/TTS, raw nguồn giữ nguyên.
Tiến độ ghi chương/đoạn đang đọc; prewarm chỉ cache. reading:true thắng AIlegacy, sync theo thời điểm quan sát; AI dùng đoạn bản dịch, prefix chưa tới mốc phải chờ. Đọc tiếp ưu tiên bookmark thực hơn TTS cũ. Giữ mốc cũ thiếu chứng cứ. AI Name TXT dùng mốc phần nguồn→AI trong cache; bản cũ fallback, không thêm nút.
TTS:10giọng; cookie mã hóa, cache32MiB/24h tách cursor; ≤3active, retry/Stop/no autoplay. Build VITE_TTS_GATEWAY=capcut-v2. Chưa Android nền. docs/TTS-AUTONOMY-M0.md.

## Dữ liệu và dung lượng
React/Vite/Dexie + Pages/AIWorker/D1/R2; features/core/shared/workers. Local-first, chỉ nhập truyện được chọn. Album tác giả→Series→truyện→chương; không làm phẳng/gộp. Giữ bytes/SHA/atomicity/cancel, cloud-delete trước local-delete; D chỉ đọc; không tự tái nhập dữ liệu cũ.
TXT40MiB; EPUB256MiB/expanded512MiB/entry16MiB/derived128MiB. Tuyển tập cap2000, preview/batch atomic. Append đầy đủ/chỉ chương mới, xác nhận mốc; giữ ID/progress/CAS. Watchdog worker30s/Convert120s, chặn ghi muộn.
Cloud JSON decoded256MiB; original>64MiB dùng parts16MiB/resume/fullSHA; ledger9GB. Shared-files256MiB/3000 reservations. Backup source/dictionary kiểmSHA, packet≤16MiB; chưa portable lớn, không chứa prompt/AI/cursor nghe.
Sync CAS/delta/offline/tombstone/conflict gồm Names/profiles/reader/progress/Album/metadata/chapter edits/dictionaries. DBv4 source revision index-only;1000truyện reload0GET originals/0Blob reads. Sửa/xóa TXT soft-delete, restore cùngID; sharedCAS+ACK trước local, backupv3/cloudv2 remap. PWA offline hoàn toàn và Android thật chưa xác minh.

GitHub private https://github.com/manhtoan123/DOCTAILIEU; HTTPS/GCM; dữ liệu/secrets ngoài Git.
