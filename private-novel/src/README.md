# Bản đồ mã nguồn

Tra theo chức năng để mở đúng file. Tính năng nằm trong `features/<tên>/` (`ai`, `reader`, `tts`, `names-convert`, `import-export`, `sync-cloud`, `library`), nền tảng vào `core/`, dùng chung vào `shared/`. Khi di chuyển file phải cập nhật imports, literal path (`readFile('src/...')`), scripts, `e2e/import-lifecycle.html` và URL `/src/...` trong E2E.

## Điểm vào và môi trường chạy

| Phần | File/thư mục | Vai trò |
|---|---|---|
| Khởi động | [main.tsx](main.tsx) | Khởi tạo kết nối thiết bị, mount React và nạp CSS |
| Điều hướng, tủ sách, cài đặt | [App.tsx](App.tsx), [features/reader/services/reader-route.ts](features/reader/services/reader-route.ts) | Nối các màn hình với dữ liệu local và đồng bộ |
| Trang đọc | [features/reader/components/Reader.tsx](features/reader/components/Reader.tsx) | Điều phối chương, Convert/AI/TTS, panel và tiến độ |
| Kiểu dữ liệu và IndexedDB | [core/domain.ts](core/domain.ts), [core/db.ts](core/db.ts) | Hợp đồng Book/Chapter/settings và cơ sở dữ liệu Dexie |
| Web Worker trình duyệt | [workers/import.worker.ts](workers/import.worker.ts), [workers/language.worker.ts](workers/language.worker.ts) | Nhập và Convert ngoài luồng UI |
| HTTP trên Pages | [functions/](../functions/) | Điểm vào request; dùng các handler phía server |
| Cloudflare Worker AI | [server/ai-worker.ts](../server/ai-worker.ts) | Định tuyến dịch và quản lý key ở server |
| Convert cụm trên server | [server/convert-worker.ts](../server/convert-worker.ts), [functions/api/convert/name.ts](../functions/api/convert/name.ts) | Worker service binding, corpus pin SHA, cache client và local fallback |
| Gateway nghe sách | [server/capcut-tts.ts](../server/capcut-tts.ts), [server/capcut-session.ts](../server/capcut-session.ts) | Giọng CapCut, hạn mức và cookie server mã hóa; không đưa phiên vào frontend |
| URL Reader số | [server/reader-route-registry.ts](../server/reader-route-registry.ts), [functions/api/reader-route.ts](../functions/api/reader-route.ts) | Alias truyện ổn định; client lấy chương theo vị trí mục lục |

## Module theo nghiệp vụ

| Cần sửa | Đọc trước | Các module cùng nhóm |
|---|---|---|
| Thẻ truyện, album, trang thông tin | [features/library/components/LibraryBookCard.tsx](features/library/components/LibraryBookCard.tsx), [features/library/components/BookActions.tsx](features/library/components/BookActions.tsx), [features/library/components/StoryDetail.tsx](features/library/components/StoryDetail.tsx) | `features/library/services/{albums,album-registry,album-tree,album-removal,book-removal,book-lock,library-search,fuzzy-library-search,title-resolver}.ts`; `features/library/components/AlbumPanel.tsx`, `AlbumShelf.tsx`, `useChapterSearch.ts`, `useFuzzyLibrarySearch.ts`; fuzzy worker riêng |
| Nhập/chia TXT, cập nhật chương | [features/import-export/services/importer.ts](features/import-export/services/importer.ts), [features/import-export/services/splitter.ts](features/import-export/services/splitter.ts), [features/import-export/services/chapter-append.ts](features/import-export/services/chapter-append.ts) | `features/import-export/services/{batch-import,folder-*,anthology,backup,original-parts,source-data}.ts`, `features/import-export/components/*ImportDialog.tsx`, `UpdateTxt.tsx`, `ChapterSplitPreview.tsx` |
| EPUB | [features/import-export/services/epub-import.ts](features/import-export/services/epub-import.ts), [features/reader/components/EpubFrame.tsx](features/reader/components/EpubFrame.tsx) | `features/import-export/services/epub-{model,package,zip,render,layout-schema,ai}.ts` |
| Convert, từ điển, sửa từ | [features/names-convert/services/language-client.ts](features/names-convert/services/language-client.ts), [features/names-convert/services/language.ts](features/names-convert/services/language.ts), [features/reader/components/WordPopup.tsx](features/reader/components/WordPopup.tsx) | `features/names-convert/services/convert-*.ts`, `dictionary-*.ts`, `features/reader/services/word-tools.ts`, `features/reader/services/reader-word-edit.ts`; `features/names-convert/components/DictionaryPanel.tsx` |
| Name và tên hiển thị | [features/names-convert/services/book-names.ts](features/names-convert/services/book-names.ts), [features/library/services/title-resolver.ts](features/library/services/title-resolver.ts), [features/names-convert/services/title-converter.ts](features/names-convert/services/title-converter.ts) | `features/names-convert/services/common-names.ts`, `name-*.ts`, `reference-convert.ts`; `features/names-convert/components/NameManager.tsx`, `ConvertedTitle.tsx`, `NameEditDialog.tsx`, `NameImageText.tsx` |
| Prompt và cài đặt AI | [features/ai/components/PromptStockPanel.tsx](features/ai/components/PromptStockPanel.tsx), [features/ai/components/PromptFields.tsx](features/ai/components/PromptFields.tsx) | `features/ai/prompt/prompt-*.ts`, `features/ai/types/ai-reader-settings.ts`, `features/ai/components/AiPanel.tsx`, `features/ai/components/AiKeySettings.tsx` |
| Dịch AI và retry | [features/ai/services/ai-reading.ts](features/ai/services/ai-reading.ts), [features/ai/services/ai-translate.ts](features/ai/services/ai-translate.ts) | `features/ai/services/ai-job/parts/hybrid/recovery/fallback/complete.ts`, `ai-stream-*.ts`, `ai-settings*.ts`, `ai-key-admin.ts`; server `ai-translate.ts`, `ai-upstream-stream.ts`, `ai-key-*.ts` |
| TTS, nghe nền và tiếp tục | [features/tts/services/tts.ts](features/tts/services/tts.ts), [features/tts/services/tts-cursor.ts](features/tts/services/tts-cursor.ts), [features/tts/services/tts-media-keepalive.ts](features/tts/services/tts-media-keepalive.ts) | `features/tts/services/tts-continuous.ts` là phương án có riêng tài liệu; không mặc định coi là luồng phát hiện hành |
| Audio cache và lỗi gateway | [features/tts/services/tts-audio-cache.ts](features/tts/services/tts-audio-cache.ts), [features/tts/services/tts-gateway.ts](features/tts/services/tts-gateway.ts) | Cache IndexedDB riêng, không thay cursor; catalog chung `shared/constants/capcut-voices.ts` |
| Panel Reader và mục lục | [features/reader/components/ReaderToc.tsx](features/reader/components/ReaderToc.tsx), [features/reader/components/ReaderFloatingTools.tsx](features/reader/components/ReaderFloatingTools.tsx) | `ChapterNavigation.tsx`, `ReaderAiProgress.tsx`, `AiNameSource.tsx`; Reader giữ phần điều phối |
| URL ngắn và vị trí chương | [features/reader/services/numeric-reader-route.ts](features/reader/services/numeric-reader-route.ts), [features/reader/services/chapter-route-number.ts](features/reader/services/chapter-route-number.ts) | `/r/<mã-truyện>/<vị-trí>` từ 1 trong mục lục hiện hành; vẫn đọc link UUID/mã cũ |
| Kho Name theo Album và đối chiếu AI | [features/names-convert/services/scoped-names.ts](features/names-convert/services/scoped-names.ts), [features/reader/services/ai-name-paragraph.ts](features/reader/services/ai-name-paragraph.ts) | `album-name-schema.ts`, `EffectiveNamesContext.ts`, `name-server-client.ts`, `ai-name-snapshot.ts`; mốc AI ở `features/ai/services/ai-text-map.ts` |
| Trạng thái dịch chia phần | [features/ai/services/ai-division.ts](features/ai/services/ai-division.ts), [features/ai/services/ai-leaf-progress.ts](features/ai/services/ai-leaf-progress.ts) | `ai-result-facts.ts`, `types/ai-chapter-view.ts`; nội dung cache và trạng thái tác vụ có vai trò riêng |
| Vị trí đọc | [features/reader/services/reading-progress.ts](features/reader/services/reading-progress.ts), [features/reader/services/reader-scroll-anchor.ts](features/reader/services/reader-scroll-anchor.ts) | `features/ai/services/ai-reading-cache.ts`, `tts-cursor.ts`, Reader và đồng bộ trạng thái |
| Đồng bộ chỉnh sửa | [features/sync-cloud/services/shared-state-sync.ts](features/sync-cloud/services/shared-state-sync.ts), [features/sync-cloud/services/shared-state-schema.ts](features/sync-cloud/services/shared-state-schema.ts) | `features/sync-cloud/services/shared-*.ts`, `features/ai/prompt/prompt-sync.ts`; `features/sync-cloud/components/SharedSyncPanel.tsx`; server `shared-state.ts`, `shared-state-files.ts`, `shared-prompts.ts` |
| File nguồn/cloud/backup | [features/sync-cloud/services/cloud-client.ts](features/sync-cloud/services/cloud-client.ts), [features/import-export/services/backup.ts](features/import-export/services/backup.ts) | `features/sync-cloud/services/cloud-*.ts`, `original-sync-index.ts`, `features/import-export/services/original-parts.ts`, `features/import-export/components/BackupPanel.tsx`, `features/sync-cloud/components/CloudPanel.tsx`, `OriginalFiles.tsx`; server `cloud-library.ts`, `cloud-originals.ts`, `r2-stream.ts` |
| Giao diện và theme | [shared/styles/style.css](shared/styles/style.css), [features/reader/styles/stv-layout.css](features/reader/styles/stv-layout.css) | CSS theo tính năng và component (Reader: `features/reader/styles/word-popup.css`; names-convert: `features/names-convert/styles/name-manager.css`, `name-edit-dialog.css`, `convert-panel.css`; library: `features/library/styles/library.css`, `story-detail.css`); component dùng chung `shared/components/common.tsx`, `SharedImage.tsx`; mở file thực sự chứa selector trước khi sửa |

Các tên có dấu `/` trong cột module là cách liệt kê hậu tố cùng tiền tố, không phải đường dẫn thư mục mới.

## Chọn phạm vi kiểm chứng

- Logic: tìm tên module hoặc hành vi bằng `rg` trong `../tests/`; chạy targeted test và build theo [AGENTS](../../AGENTS.md).
- Luồng giao diện: tìm spec tương ứng trong `../e2e/`; cấu hình có Edge desktop và layout Pixel 7.
- Database, import, backup, auth, cloud-delete và migration: review độc lập + regression/full unit/E2E liên quan theo quy tắc dự án.
- Schema server nằm trong [migrations/](../migrations/); đổi vị trí file không phải lý do để tạo migration.

[Tài liệu tính năng](../docs/README.md) · [Scripts vận hành](../scripts/README.md)

## Cấu trúc AI hiện hành

Xem [bản đồ dịch chia phần](../docs/AI-PARALLEL-PLAN.md). Toàn bộ tính năng AI & Prompt nằm trong `features/ai/`: [`components/`](features/ai/components/), [`prompt/`](features/ai/prompt/), [`services/`](features/ai/services/), [`types/`](features/ai/types/). Cấu hình thuần: `types/ai-settings-type.ts`/`services/ai-settings.ts`; chính sách truyện: `types/ai-reader-settings.ts`; điều phối slot: `services/ai-scheduler.ts`; ghép phần: `services/ai-parts.ts`; TXT/EPUB: `services/ai-reading.ts`/`features/import-export/services/epub-ai.ts`; form chung: `components/PromptFields.tsx`. Hybrid được giữ cho dữ liệu cũ và regression, không phải chế độ Reader mới. Không thêm nhánh UI nửa sau riêng vào form chung.

## Gốc `src/`

Chỉ còn `App.tsx`, `main.tsx` (entry point) và `README.md`; toàn bộ module còn lại đã vào `core/`, `shared/`, `features/` hoặc `workers/`. Không còn module nghiệp vụ nằm phẳng ở gốc.
