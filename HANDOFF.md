# Private Novel
02/11/2026.

Chỉ mục: docs/README.md. UI gọn và nút về Phòng tối: docs/QUIET-UI.md. Chuẩn bị Android: mục Android trong docs/README.md.

## Online
https://thu-phong-private.pages.dev/ — Pages b56d1e87, index-CznOMLyy.js, source c9ea547. AI Worker e2e5a4ea. Schema0018, SHARED_STATE_ENABLED=1. Rollback Pages 1ed7a036, AI 710b3319.

Nhập lọc quảng cáo, giữ nguồn/sách cũ: docs/IMPORT-ADVERTISING-CLEANUP.md. Gemma26 cố định prompt/auto-resume: docs/GEMMA26-AND-AI-RESUME-2026-11-02.md.

Han-only repair giữ audio/cache/cursor; TTS retry0/1/2/4/8s, timeout25s, session15s; deploy01/11. docs/AI-HAN-REPAIR-2026-11-01.md.

Phòng tối: Album3view Chi tiết/Lưới gọn/Danh sách, nhớ máy; preview/mở rộng12/tìm/Đọc tiếp. Quản lý/Xong bật chọn. docs/ALBUM-PREVIEW-2026-11-02.md; docs/LIBRARY-MANAGEMENT.md.

Name EPUB/PDF/DOCX giữ iframe/patch, deploy01/11. docs/EPUB-LIVE-NAME-UPDATE-2026-11-01.md.

Cloud metadata1000/migration0018: 801records/ledger khớp trước-sau. docs/CLOUD-METADATA-COMPATIBILITY-2026-11-01.md.

## Reader, AI, Convert
URL /r/mã-số/vị-trí (mục lục từ1, bỏ chương ẩn); mã22 và /read cũ còn dùng.
Bảng AI: RAM/cache cùng facts theo request key; legacy unknown; tiến độ phần lá; Dừng đúng chương. Bỏ footer; nút chương≥48px; mục lục định vị.
Đổi Auto/Fixed/model giữ chương AI hoàn tất/prewarm; prompt/Names/source vẫn khớp. docs/AI-COMPLETED-CHAPTER-REUSE-2026-11-02.md.
Name: chung Album tác giả/gồm series; giữ legacy/xung đột, snapshot/add-only/capacity20k atomic. docs/ALBUM-NAMES-M0.md.
Convert OCI mTLS + local chọn tay; Bản gốc không nạp TXT. Có artifact, chưa deploy. docs/OCI-CONVERT.md.
AI≤2request: Auto/Fixed; Groq sau2.5; Auto chưa có phần hợp lệ thì không pinwarm. Providerhếtkey Auto đi tiếp, quota429 được giữ; key-model blocks0017. Gemma minimal/first90s, modelkhác45s, idle7/hard180. Lịch sửRAM từngrequest mở rộng dưới chương: model/thời gian/lỗi; reload/cache cũ có thểkhôngcó. docs/AI-REPAIR-AND-TIMELINE-2026-11-01.md.
Tiến độ theo đoạn đang đọc, prewarm chỉ cache; giữ bookmark có chứng cứ. AI Name TXT có source→AI map trong cache; legacy fallback.
Trau chuốt/Name: ≤4 theo lease; Trau chuốt chọn model, lọc/sửa/lưu nhóm Vietphrase; phần lỗi giữ Convert và tra từ. Name ẩn khóa đã có. Tô vùng chọn, nút ←/→ nhấp 2 dòng/3 đoạn. Deploy 09/11. docs/CONVERT-POLISH.md, docs/AI-NAME-DISCOVERY.md.
TTS CapCut mặc định, ≤3active; cookie mã hóa/cache riêng, Stop hủy, reload không autoplay. docs/CAPCUT-TTS-SETUP.md.

## Dữ liệu và dung lượng
React/Vite/Dexie + Pages/AIWorker/D1/R2; features/core/shared/workers. Local-first, chỉ nhập truyện được chọn. Album tác giả→Series→truyện→chương; không làm phẳng/gộp. Giữ bytes/SHA/atomicity/cancel, cloud-delete trước local-delete; D chỉ đọc; không tự tái nhập dữ liệu cũ.
TXT40MiB; EPUB256MiB/expanded512MiB/entry16MiB/derived128MiB. Tuyển tập2000, preview/batch atomic. Append đầy đủ/chỉ mới, xác nhận mốc; giữ ID/progress/CAS. TXT tiến độ theo byte, ETA; watchdog kiểm phản hồi sau30s im lặng. Convert120s.
TXT auto/BOM/fatal; giữ nguồn/codec/SHA và mốc thêm, không tách lại chương cũ. docs/TXT-AUTO-READING.md.
Cloud JSON decoded256MiB; original>64MiB dùng parts16MiB/resume/fullSHA; ledger9GB. Shared-files256MiB/3000 reservations. Backup source/dictionary kiểmSHA, packet≤16MiB; chưa portable lớn, không chứa prompt/AI/cursor nghe.
Sync CAS/delta/offline/tombstone/conflict gồm Names/profiles/reader/progress/Album/metadata/chapter edits/dictionaries. DBv4 source revision index-only;1000truyện reload0GET originals/0Blob reads. Sửa/xóa TXT soft-delete, restore cùngID; sharedCAS+ACK trước local, backupv3/cloudv2 remap. PWA offline hoàn toàn và Android thật chưa xác minh.

Audit/fix: docs/REGRESSION-AUDIT-2026-11-02.md. Tách2web riêng dữ liệu chưa triển khai.
