# Private Novel Reader — chỉ mục làm việc

Tra cứu: [tài liệu theo tính năng](private-novel/docs/README.md), [bản đồ mã nguồn](private-novel/src/README.md), [scripts](private-novel/scripts/README.md). Điểm bắt đầu của workspace: [README](README.md).
Theo quyết định11/10/2026: app đã chạy, sửa nhỏ theo yêu cầu; đây là chỉ mục, không là checklist bắt buộc mỗi phiên.
Trạng thái/phiên mới nhất ở HANDOFF.md; kiểm thử theo rủi ro ở AGENTS.md.
Kế hoạch đầy đủ/lịch sử giữ nguyên: private-novel/docs/archive/WEB-READER-IMPLEMENTATION-PLAN-2026-10-11-before-light.md.

| Phạm vi | Code chính dưới private-novel/ | Test/tài liệu khi cần |
|---|---|---|
| Import/splitter | src/splitter.ts, importer.ts, workers/import.worker.ts; src/ui/*ImportDialog.tsx, ChapterSplitPreview.tsx | tests/chapter-split.test.ts, chapter-storage-roundtrip.test.ts; e2e/chapter-split-preview.spec.ts, import-publication.spec.ts |
| Batch/folder | src/batch-import.ts, folder-selection.ts, folder-import.ts | tests/batch-import*.test.ts, folder*.test.ts; e2e/one-step-import.spec.ts |
| Reader/Name/Convert | src/ui/Reader.tsx, NameManager.tsx; src/language.ts, workers/language.worker.ts, convert-*.ts | e2e/reader-*.spec.ts, name-manager.spec.ts; docs/UI-READER-UX-PLAN.md |
| Album/shelf | src/ui/App.tsx, AlbumPanel.tsx; src/albums.ts, album-registry.ts | tests/album*.test.ts; e2e/album-*.spec.ts |
| AI | src/ai-*.ts, ui/AiPanel.tsx; server/ai-*.ts | tests/ai-*.test.ts; docs/AI-KEY-POOL-PLAN.md, AI-TTS-RECOVERY-PLAN.md |
| TTS | src/tts*.ts, ui/Reader.tsx | tests/tts*.test.ts; e2e/tts-resume.spec.ts; docs/TIKTOK-TTS-GATEWAY.md |
| Storage/cloud/backup | src/db.ts, backup.ts, cloud-*.ts; server/cloud-*.ts, migrations/ | tests/backup.test.ts, cloud*.test.ts; docs/STORAGE2-IMPLEMENTATION-CHECKPOINT.md |
| Deploy | wrangler.jsonc, wrangler.ai.jsonc, scripts/smoke-*.mjs | skill Wrangler chỉ khi cần deploy; không đổi secrets/migration theo suy đoán |

## Quy tắc chọn việc
- Người dùng chỉ sửa UI/copy/CSS: làm đúng file/luồng, không mở architecture/M0/backlog.
- Sửa logic: chọn invariant và targeted tests; giữ regression mới nếu lỗi có thể tái diễn.
- Rủi ro dữ liệu/auth/cloud/schema: đối chiếu quyết định liên quan, review độc lập + integration; không tin báo cáo cũ thay test.
- Feature lớn/corpus/bulk/storage: lúc đó mới đọc plan M0, số đo và bảng lệch; code thực là nguồn xác minh, không migrate chỉ để khớp tài liệu.
- Open backlog: xem HANDOFF; không tự ưu tiên feature mới khi chưa được yêu cầu.
