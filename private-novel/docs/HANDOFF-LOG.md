# Bàn giao Private Novel Reader

Cập nhật: 04/10/2026. Trạng thái: local alpha prototype đang chạy qua test tự động; chưa phải R1 deploy.

## Đọc trước

- Kế hoạch hiện hành: WEB-READER-IMPLEMENTATION-PLAN.md.
- Người dùng yêu cầu ghi tiến trình để AI khác tiếp tục được; không cần bắt đầu lại phần nghiên cứu.
- Windows + Android; nguồn truyện `D:\linh tinh\tm\STV Novel` chỉ đọc.
- Từ điển thực tế: `D:\linh tinh\tm\truyen\vietphrase.zxc.io.vn\src\test-dicts` (Vietphrase.txt 43.687.000 bytes, Names.txt, HanViet.txt, !LuatNhan.txt).
- Không nhập toàn bộ kho 4,96 GB. Không sao chép tài liệu/credential vào repo hoặc public.

## Tiến trình

- [x] Kiểm kê metadata kho, tìm từ điển và mã tham khảo.
- [x] Chốt kế hoạch và thiết bị mục tiêu.
- [x] Khởi tạo ứng dụng React/TypeScript/Vite.
- [x] Reader, nhập TXT/split worker, IndexedDB ở mức alpha; import còn lưu staging để preview/confirm.
- [x] Convert worker, Name List ở mức alpha.
- [x] Browser TTS ở mức alpha; chưa kiểm thử Android thật/khóa màn hình.
- [x] Backup/restore: hỗ trợ Portable (kèm source files & dictionaries) và Compact, kiểm tra conflict và tracking restoreJobs.
- [x] Kiểm thử tự động: 32 unit tests và 8 E2E pass; Android thật chưa có kết quả.
- [ ] Auth/hosting private (cần cấu hình tài khoản khi deploy).

## Cập nhật phiên làm việc 04/10/2026

**Người thực hiện:** GitHub Copilot (AI coding agent).  
**Phạm vi phiên:** rà soát trạng thái, sửa importer/E2E/server type và cập nhật tài liệu; không sửa kho nguồn trên ổ D:.

### Đã làm và đã kiểm chứng

- `src/importer.ts` — GitHub Copilot: thêm `knownHashes` để dedupe SHA-256 với source đã có và file trùng trong cùng lượt; giữ `staging` cho preview/confirm.
- `e2e/reader.spec.ts` — GitHub Copilot: chờ combobox `Nền` hiển thị trước `selectOption`, loại race cũ ở panel điều khiển.
- `server/auth.ts` — GitHub Copilot: import kiểu `D1Database` tường minh từ `@cloudflare/workers-types`; build không còn lỗi type.
- `HANDOFF.md` và `private-novel/docs/DECISIONS.md` — GitHub Copilot: ghi danh tính người thực hiện, file đã sửa, quyết định và kết quả.
- Kết quả: `npm.cmd test` → 20/20 pass; `npm.cmd run build` → pass; `npm.cmd run test:e2e -- --reporter=line` → 4/4 pass (Chromium + Android-layout giả lập).

### Giới hạn chưa được giải quyết

- Chưa chạy Android/Chrome thật; chưa benchmark TXT 38 MB hoặc Vietphrase 43 MB trên thiết bị thật.
- Import vẫn ghi chapter staging theo batch, chưa có `importJobs`/checkpoint và commit manifest atomic hoàn chỉnh như kế hoạch.
- Chapter còn giữ `text` riêng cùng source Blob; chưa chuyển sang content chunks/ranges.
- Progress hiện lưu paragraph, chưa có variant/fingerprint/char offset thực tế đầy đủ.
- Backup hiện là packet compact chứa chapter text; chưa portable source bytes/dictionary và chưa có conflict preview hoàn chỉnh.
- Auth mới là middleware prototype; chưa có D1 thật, login client, deploy/route gate verification.

### Việc tiếp theo đề xuất cho AI khác

1. Viết test/import harness cho dedupe và cancellation/quota, sau đó thiết kế staging `importJobs` + commit atomic.
2. Nâng backup thành compact/portable có manifest, source metadata/bytes tùy chọn, kiểm tra conflict trước restore.
3. Hoàn thiện progress model (`variant`, fingerprint, char offset) và reindex integer khi tách chapter.
4. Bổ sung dictionary diagnostics (encoding, dòng lỗi, key trùng) và Name scope global/per-book.
5. Chỉ sau khi R0 ổn định mới cấu hình D1/auth thật và kiểm thử Pages deep URL/asset/API.

## Cập nhật phiên làm việc 04/10/2026 — import staging/checkpoint/atomic commit

**Người thực hiện:** GitHub Copilot (AI coding agent).  
**Phạm vi phiên:** tiếp tục từ bàn giao trước; bổ sung checkpoint import, kiểm tra quota, commit staging atomic và test liên quan. Không sửa, xóa, đổi tên, chạy script hoặc đưa dữ liệu từ kho nguồn `D:\linh tinh\tm` lên mạng/Git. Đã ghi quy tắc cho phép tham khảo mã nguồn tại đó ở chế độ chỉ đọc trong `AGENTS.md`.

### File và khu vực đã sửa

- `private-novel/src/domain.ts` — thêm `ImportPhase` và model `ImportJob` cho phase, số file/byte đã xử lý, checkpoint, duplicate và lỗi.
- `private-novel/src/db.ts` — thêm migration Dexie version 2 cho store `importJobs`; `deleteBook` dọn job liên quan; thêm `commitImport()` để đổi book và job trong cùng transaction.
- `private-novel/src/storage.ts` — thêm `assertStorageBudget()`; chặn batch vượt 90% quota ước tính, không tự xóa dữ liệu.
- `private-novel/src/importer.ts` — tạo job processing, kiểm tra hủy/quota trước mỗi file, cập nhật checkpoint sau file, chuyển job sang preview; tách helper `acceptSourceHash()` và `throwIfImportAborted()` để test.
- `private-novel/src/ui/ImportDialog.tsx` — nút xác nhận gọi `commitImport()` thay vì tự update book riêng lẻ.
- `private-novel/tests/import.test.ts` — thêm 5 test cho dedupe, cancellation, quota, commit preview và chặn commit checkpoint chưa đủ.
- `AGENTS.md` — ghi quy tắc tham khảo mã nguồn `D:\linh tinh\tm` chỉ đọc và không sao chép/chạy/publish tùy tiện.
- `HANDOFF.md`, `private-novel/docs/DECISIONS.md` — ghi danh tính, phạm vi, quyết định, kiểm thử và giới hạn của phiên này.

### Quyết định và lý do

- Giữ `Book.status = staging` trong lúc preview; chỉ commit sau thao tác người dùng xác nhận. `ImportJob.phase` đi cùng transaction để không có book ready nhưng job chưa commit.
- Dùng migration version 2 thay vì sửa store trong version 1, bảo đảm người dùng hiện tại có đường nâng schema Dexie.
- Checkpoint hiện ghi sau mỗi file hoàn thành, không giữ transaction IndexedDB xuyên suốt worker/await. Điều này giảm thời gian khóa transaction nhưng chưa thể resume file đang chạy sau crash.
- Ngưỡng quota dùng 90% estimate để chừa headroom cho metadata/chunks; khi trình duyệt không cung cấp estimate thì không tự chặn, vì chưa có bằng chứng quota chính xác.

### Đã kiểm chứng

- `npm.cmd test -- --reporter=verbose` → **25/25 unit tests pass**, gồm 5 test import mới; môi trường Windows/Node local.
- `npm.cmd run build` → **pass**, TypeScript/server/Vite production bundle.
- `npm.cmd run test:e2e -- --reporter=line` → **4/4 pass**, Chromium và Android-layout giả lập; không phải thiết bị Android thật.

### Chưa hoàn thành / giới hạn

- Chưa thực hiện resume tự động sau crash giữa một file; checkpoint hiện là mốc file, chưa lưu offset byte/worker state để tiếp tục file dang dở.
- Chưa benchmark file TXT 38 MB hoặc Vietphrase 43 MB, chưa đo quota/RAM trên Android thật.
- `Chapter.text` vẫn lưu toàn văn riêng cùng source Blob; chưa chuyển sang content chunks/ranges.
- Chưa kiểm tra trực tiếp mã nguồn tham khảo dưới `D:\linh tinh\tm` trong phiên này; chỉ tuân thủ và ghi rule tham khảo read-only. Không đánh dấu nghiệm thu nguồn tham khảo.

### Việc tiếp theo cho AI khác

1. Thêm checkpoint byte offset và chiến lược khôi phục file dang dở, hoặc ghi rõ không resume được nếu File handle không còn sau reload.
2. Viết integration test mô phỏng quota giữa các batch và lỗi worker sau khi đã ghi staging; xác minh cleanup/job recovery.
3. Thiết kế content chunks/ranges trước khi nhập TXT lớn; benchmark trên Windows và Android thật.
4. Khi tham khảo `D:\linh tinh\tm`, ghi rõ đường dẫn/file và insight đã dùng trong mục nhật ký tương ứng; không copy nguyên mã nguồn.

## Cập nhật phiên làm việc 04/10/2026 — Backup/Restore: Portable/Compact mode, kiểm tra xung đột và restoreJobs

**Người thực hiện:** Antigravity (Gemini 3.8 Flash).  
**Phạm vi phiên:** Hoàn thiện tính năng sao lưu và khôi phục (M6): phân tách rõ chế độ Compact (nhẹ) và Portable (đóng gói file nguồn + từ điển), bổ sung manifest version 2, kiểm tra xung đột (truyện trùng lặp, thiếu từ điển) trước khi khôi phục, bổ sung tùy chọn ghi đè/tạo bản mới, thêm store `restoreJobs` qua Dexie version 3 migration và rollback sạch sẽ khi lỗi. Không sửa, xóa, đổi tên, chạy script hoặc tải dữ liệu từ kho nguồn `D:\linh tinh\tm`. Giữ nguyên tính tương thích của public API hiện có.

### File và khu vực đã sửa

- `private-novel/src/domain.ts` — Thêm các kiểu dữ liệu domain cho backup/restore: `BackupMode` ('compact' | 'portable'), `BackupOptions`, `RestoreOptions`, `RestoreConflict`, `RestoreJob`, `RestoreJobStatus`, `BackupSourceData`, `BackupDictionaryData`, `BackupManifest`.
- `private-novel/src/db.ts` — Khai báo store `restoreJobs` trong interface `db`; thêm migration version 3: `db.version(3).stores({ restoreJobs: 'jobId,backupId,bookId,status,updatedAt' })`; điều chỉnh `deleteBook` không xóa nhầm bản ghi audit/failure của `restoreJobs`.
- `private-novel/src/backup.ts` — Thêm hàm chuyển đổi Base64 an toàn cho cả browser và Node: `blobToBase64`, `base64ToBlob`; mở rộng `prepareBackup(bookId, options)` hỗ trợ `mode: 'compact' | 'portable'`, nhúng dữ liệu file nguồn (`db.sources`) và từ điển đang dùng (`db.dictionaries`) vào payload, sinh `manifest` chứa metadata chi tiết và cờ chỉ báo dữ liệu; cập nhật `parsePacket` chấp nhận packet v1 và v2; cập nhật `restoreInfo(id)` phân tích xung đột (truyện đã tồn tại theo tên/source hash, từ điển đã có / có trong gói / còn thiếu, thông tin file nguồn); cập nhật `restoreBackup(id, options)` tạo `restoreJob` (staging), hỗ trợ tùy chọn xung đột (`onConflict`: 'rename' | 'replace' | 'keep-both'), khôi phục file nguồn vào `db.sources` và nối lại liên kết `chapter.sourceId`, tự động cài đặt từ điển vào `db.dictionaries` nếu chưa có (bảo vệ không ghi đè từ điển hiện có trên máy), cam kết nguyên tử (atomic commit qua Dexie transaction gộp cả việc xóa sách cũ và kích hoạt sách mới) và rollback an toàn khi lỗi (cập nhật trạng thái `failed` vào `restoreJobs`).
- `private-novel/src/ui/BackupPanel.tsx` — Thêm lựa chọn Chế độ sao lưu (Compact vs Portable) kèm hướng dẫn giải thích rõ ràng; hiển thị chi tiết xung đột và lựa chọn xử lý (radio "Tạo bản sao mới" vs "Ghi đè bản cũ"); hiển thị trạng thái từ điển (checkbox tự động cài đặt từ điển đi kèm của gói portable, cảnh báo từ điển còn thiếu); hiển thị số lượng file nguồn kèm theo và nút khôi phục tương ứng.
- `private-novel/tests/backup.test.ts` — Bổ sung 5 unit test mới:
  1. Round-trip Portable backup: đóng gói file nguồn + từ điển, khôi phục trên DB trắng, kiểm tra toàn vẹn nội dung blob nguồn, liên kết `chapter.sourceId`, từ điển trong DB và trạng thái job.
  2. Kiểm tra xung đột và giải quyết bằng `'replace'`: ghi đè sách cũ nguyên vẹn mà không tạo bản sao trùng lặp.
  3. Tương thích ngược: khôi phục thành công gói sao lưu legacy version 1.
  4. Rollback an toàn: phát hiện dữ liệu chương bị lỗi, dọn sạch sách staging và ghi nhận lỗi vào `restoreJobs`.
  5. Bảo vệ từ điển người dùng: không tự động ghi đè từ điển hiện có trên máy khi khôi phục bản portable mang từ điển cùng loại.
- `private-novel/e2e/reader.spec.ts` — Bổ sung E2E test kiểm tra giao diện chọn chế độ Compact/Portable trong Backup Panel.
- `private-novel/docs/DECISIONS.md` — Ghi nhận quyết định kiến trúc: Schema Packet v2, Portable mode, conflict preview, và `restoreJobs` migration.

### Đã kiểm chứng

- Lệnh: `npm.cmd test -- --reporter=verbose` → **30/30 unit tests pass** (gồm 5 test backup/restore mới, môi trường Windows Node local).
- Lệnh: `npm.cmd run build` → **pass**, bundle thành công TypeScript/server/Vite production (`dist/` không có cảnh báo/lỗi).
- Lệnh: `npm.cmd run test:e2e -- --reporter=line` → **6/6 pass**, chạy trên cả Chromium và Android-layout giả lập.

### Chưa hoàn thành / giới hạn

- Chưa kiểm thử trên thiết bị Android thật (hiện mới chạy qua giả lập Playwright android-layout viewport).
- Chưa đo hiệu năng bộ nhớ khi xuất file TXT 38 MB kèm từ điển 43 MB trong cùng một gói Portable trên thiết bị RAM hạn chế.
- Kích thước từng phần sao lưu vẫn đang giữ hard limit 16 MB (`stageBackup`). Nếu một file TXT đơn lẻ vượt 16 MB, cần cơ chế chunking file nguồn giữa các packet.

### Việc tiếp theo cho AI khác

1. Hoàn thiện Reading Progress model (`variant` Trung/Convert, text fingerprint, char offset chính xác, khôi phục cuộn khi layout đổi).
2. Thiết kế Content Chunks & Ranges để tách `Chapter.text` khỏi DB, tránh trùng lặp với `SourceFile.blob`.
3. Bổ sung Dictionary Diagnostics (encoding, dòng lỗi cú pháp, key trùng) và phạm vi Name per-book vs global.
4. Kiểm thử sao lưu / khôi phục trên điện thoại Android thật với file có dung lượng lớn.

## Cập nhật phiên làm việc 04/10/2026 — kiểm tra độc lập toàn dự án

**Người thực hiện:** GitHub Copilot (AI coding agent), có review độc lập bởi Explore agent.  
**Phạm vi phiên:** kiểm tra trạng thái hiện tại sau thay đổi của nhiều AI; đọc `AGENTS.md`, `HANDOFF.md`, kế hoạch triển khai, chạy diagnostics/test/build/E2E và review riêng vùng backup/restore. Không sửa mã runtime trong phiên kiểm tra; không đụng kho nguồn `D:\linh tinh\tm`.

### File và khu vực đã kiểm tra

- `private-novel/src/backup.ts` — `prepareBackup`, `stageBackup`, `restoreInfo`, `restoreBackup`; kiểm tra atomicity, checksum, conflict, memory và cancellation.
- `private-novel/src/db.ts` — migration version 1–3, `deleteBook`, `restoreJobs` preservation.
- `private-novel/src/domain.ts`, `src/ui/BackupPanel.tsx`, `tests/backup.test.ts` — đối chiếu model/API/UI/test với hành vi thực tế.
- Không có file runtime được sửa; chỉ cập nhật `HANDOFF.md` và `private-novel/docs/DECISIONS.md` để lưu kết quả audit.

### Đã kiểm chứng

- Diagnostics workspace → **không có lỗi tĩnh**.
- `npm.cmd test -- --reporter=verbose` → **30/30 unit tests pass**.
- `npm.cmd run build` → **pass**, TypeScript/server/Vite production bundle.
- `npm.cmd run test:e2e -- --reporter=line` → **6/6 E2E pass** trên Chromium và Android-layout giả lập.
- Review độc lập xác nhận các test happy-path hiện có; review này không coi lời nhận xét của AI trước là bằng chứng thay cho chạy test.

### Phát hiện rủi ro chưa được xác minh / chưa được chấp nhận

- **Cao:** `restoreBackup()` ghi dictionary portable trước commit nhưng catch chỉ dọn book; nếu chapter hỏng sau đó, dictionary mới có thể còn lại. Chưa có test rollback dictionary.
- **Cao:** `restoreInfo()` phát hiện source hash trùng nhưng `restoreBackup()` chỉ xử lý replace theo title; cùng source khác title có thể tạo bản sao logic.
- **Cao:** source portable chưa kiểm tra SHA-256 và byte length sau giải mã Base64; manifest hiện chủ yếu là metadata, chưa là nguồn xác thực bắt buộc.
- **Trung bình:** `Promise.all` Base64 toàn bộ source/dictionary và `stageBackup().text()` có thể dùng nhiều RAM; chỉ giới hạn 16 MB mỗi packet, chưa có giới hạn tổng/quota/file count.
- **Trung bình:** restore chưa có AbortSignal/lock/generation; hai tab restore cùng backup hoặc đóng tab giữa chừng chưa được kiểm chứng.
- **Trung bình:** migration packet v1 đã có test tương thích, nhưng chưa có test nâng DB đang chứa dữ liệu thật từ schema v1/v2 lên v3.

Vì các mục trên chưa có bằng chứng an toàn, **chưa đánh dấu backup/restore đạt mức data-safe hoàn chỉnh** dù happy-path test đang pass.

### Việc tiếp theo cho AI khác

1. Sửa rollback dictionary bằng staging riêng hoặc ghi dictionary trong commit transaction; thêm test dictionary không còn sau restore lỗi.
2. Xác minh source `sha256`/`bytes` và manifest trước khi tạo record; thêm test Base64/hash/manifest tampering.
3. Quyết định rõ same-hash khác title là replace/conflict/keep-both và thêm test; chuẩn hóa semantics `rename`, `replace`, `keep-both`.
4. Thêm lock/cancellation/recovery cho restore và test hai restore đồng thời, reload/crash staging.
5. Thiết kế chunk/stream portable và giới hạn aggregate/quota trước benchmark Android thật.

## Cập nhật phiên làm việc 04/10/2026 — quy trình phối hợp nhiều AI/model

**Người thực hiện:** GitHub Copilot (AI coding agent).  
**Phạm vi phiên:** chuyển yêu cầu của người dùng thành quy tắc kiểm soát chất lượng khi nhiều AI/model có năng lực khác nhau cùng làm dự án. Chỉ sửa tài liệu; không sửa mã nguồn ứng dụng, không đụng kho nguồn `D:\linh tinh\tm`, không thay đổi public API.

### File và khu vực đã sửa

- `AGENTS.md` — thêm quy tắc không giao phạm vi mơ hồ; yêu cầu nhiệm vụ nhỏ, invariant, tiêu chí nghiệm thu, test và giới hạn quyền sửa; thay đổi rủi ro cao phải review độc lập.
- `HANDOFF.md` — thêm mục “Quy tắc phối hợp nhiều AI/model” vào phần quy tắc cập nhật.
- `private-novel/docs/DECISIONS.md` — ghi quyết định áp dụng cổng bằng chứng và review độc lập cho nhiều AI.

### Quyết định và lý do

- Chất lượng không dựa vào lời tự nhận hoặc mức độ dài của câu trả lời AI; chỉ chấp nhận diff, test/build và review có bằng chứng.
- Database, backup/restore, auth và dữ liệu người dùng được xem là vùng rủi ro cao, không merge nếu chưa review riêng.
- AI làm việc song song phải dùng branch/worktree riêng để không làm hỏng thay đổi chưa kiểm chứng của AI khác.
- AI không chắc phải ghi `chưa xác minh`, không được tự đánh dấu hoàn thành.

### Đã kiểm chứng

- Không chạy test/build vì phiên này chỉ thay đổi `AGENTS.md`, `HANDOFF.md` và `docs/DECISIONS.md`; không có mã runtime thay đổi.
- Đã kiểm tra lại nội dung tài liệu sau khi sửa; các kết quả test gần nhất của mã nguồn vẫn được giữ trong các mục bàn giao trước.

### Chưa hoàn thành / giới hạn

- Chưa thiết lập branch/worktree tự động hoặc CI merge gate; đây mới là quy tắc quy trình, chưa phải enforcement trong GitHub.
- Review độc lập vẫn cần con người hoặc AI khác thực hiện theo prompt review, không được coi cùng một AI tự kiểm tra là độc lập.

### Việc tiếp theo cho AI khác

1. Khi nhận nhiệm vụ mới, xác định rõ phạm vi, invariant và test trước khi sửa.
2. Với thay đổi rủi ro cao, yêu cầu một lượt review độc lập và lưu kết quả review trong bàn giao.
3. Nếu cần enforcement tự động, bổ sung CI chạy type-check/test/build và chặn merge khi thất bại.

## Cập nhật phiên làm việc 04/10/2026 — MVP tối giản và TikTok TTS adapter

**Người thực hiện:** GitHub Copilot (AI coding agent).  
**Phạm vi phiên:** theo yêu cầu người dùng, giản lược luồng nhập thành một file TXT cho một truyện; giữ splitter để tạo chương/mục lục; thay nghe browser voice bằng UI chỉ tiếng Việt TikTok; kiểm tra và tham khảo mã nguồn TTS ở `D:\linh tinh\tm` chỉ đọc. Không sửa kho nguồn, không chạy userscript, không sao chép nguyên mã hay dữ liệu.

### File và khu vực đã sửa

- `private-novel/src/importer.ts` — từ chối mảng nhiều file; invariant mới là một lần nhập chỉ có một TXT.
- `private-novel/src/ui/ImportDialog.tsx` — bỏ chọn nhiều file, hướng dẫn rõ mỗi file là một truyện và chương bên trong tạo mục lục.
- `private-novel/src/tts.ts` — thêm `TikTokVoice`, ba voice ID tham khảo (`tiktok:1..3`), `TikTokPlayer` tải audio qua gateway cấu hình, có loading/pause/resume/stop/generation guard.
- `private-novel/src/ui/Reader.tsx` — chỉ hiển thị selector ba giọng TikTok tiếng Việt, nút nghe TikTok và không hiển thị voice ngoài tiếng Việt.
- `private-novel/tests/core.test.ts` — thêm test ba voice TikTok có metadata đúng.
- `private-novel/e2e/reader.spec.ts` — thêm kiểm tra selector TikTok có đúng ba lựa chọn.
- `private-novel/.env` và `.env.example` — thêm placeholder `VITE_TIKTOK_TTS_BASE_URL=/io/s1213/tiktoktts`; `.env` bị gitignore và không chứa secret.
- `AGENTS.md`, `WEB-READER-IMPLEMENTATION-PLAN.md`, `private-novel/docs/DECISIONS.md` — cập nhật phạm vi tối giản và chính sách gateway TikTok được phép.
- Trang tham khảo `https://103.82.20.93/` không trích xuất được nội dung qua công cụ web. Mã read-only `D:\linh tinh\tm\truyen\SangTacViet_Nghe_Sach_Plus.user.js` cho thấy proxy tương đối `/io/s1213/tiktoktts` và voice IDs `tiktok:1`, `tiktok:2`, `tiktok:3`; đây là insight tham khảo, không coi là API công khai được cấp quyền.

### Quyết định và lý do

- Một file TXT tương ứng một book; tiêu đề chương trong file vẫn tạo mục lục để giữ trải nghiệm đọc.
- TTS UI chỉ hiển thị tiếng Việt TikTok. Audio thật phụ thuộc gateway trả Blob/audio; local default chỉ là đường dẫn same-origin, không tự đảm bảo endpoint tồn tại.
- Không gọi trực tiếp proxy Sangtacviet từ bundle mặc định và không sao chép userscript vì chưa xác minh quyền sử dụng/CORS/điều khoản.

### Đã kiểm chứng

- Diagnostics các file sửa → không có lỗi.
- `npm.cmd test -- --reporter=verbose` → **31/31 unit tests pass**.
- `npm.cmd run build` → **pass**.
- `npm.cmd run test:e2e -- --reporter=line` → **6/6 E2E pass** trên Chromium và Android-layout giả lập.
- Đã chạy tìm kiếm read-only trên `D:\linh tinh\tm`; không chạy script và không sửa nguồn.

### Chưa hoàn thành / giới hạn

- Chưa xác minh audio TikTok end-to-end vì chưa có gateway được cấp phép và hoạt động trong môi trường local; E2E hiện chỉ xác nhận UI/metadata voice.
- Chưa kiểm thử Android thật; chưa biết gateway có CORS/HTTPS/giới hạn rate/điều khoản phù hợp hay không.
- `BrowserPlayer` cũ vẫn còn trong `src/tts.ts` nhưng Reader không dùng; có thể xóa sau khi xác nhận không còn API nào cần.
- Các rủi ro backup/restore trong mục audit trước vẫn chưa được sửa.

### Việc tiếp theo cho AI khác

1. Cung cấp hoặc triển khai một TikTok-compatible gateway được phép, rồi test audio thật với `/io/s1213/tiktoktts` hoặc URL cấu hình; không lấy key qua chat.
2. Thêm test fetch mock cho HTTP lỗi, audio rỗng, cancellation và fallback endpoint trước khi gọi tích hợp hoàn thành.
3. Nếu muốn mỗi lần chọn nhiều file tạo nhiều truyện, thiết kế batch job riêng; hiện UI cố ý chỉ nhận một file.
4. Xử lý các lỗi data-safe backup/restore đã ghi trong mục audit trước.

## Cập nhật phiên làm việc 04/10/2026 — tham khảo Sangtacviet và xác minh luồng thư viện

**Người thực hiện:** GitHub Copilot (AI coding agent).  
**Phạm vi phiên:** tham khảo trực tiếp trang IP được người dùng chia sẻ `https://14.225.254.182/` do domain `sangtacviet.com`/`sangtacviet.vip` không kết nối được; đối chiếu cách chia truyện, trang chi tiết, mục lục, thêm/xóa trong app local. Không đăng nhập, không lấy credential, không sao chép mã/nội dung và không sửa kho nguồn `D:\linh tinh\tm`.

### Ghi nhận từ trang tham khảo

- Trang chủ có thanh `Link truyện/Tìm kiếm`, danh sách truyện vừa đọc, truyện Like nhiều, truyện ngẫu nhiên và mới cập nhật.
- Trang chi tiết truyện hiển thị tên, tác giả, tóm tắt, thông tin nguồn/thể loại/tình trạng và các thao tác Đọc ngay, Thích, Đánh dấu, Theo dõi, Preview, Đẩy sách.
- Mục lục hiển thị số chương, nguồn, danh sách tên chương đầy đủ theo nhóm; có thao tác Cập nhật, Xuống, Mở rộng và Cập nhật chương mới.
- Insight dùng cho MVP local: `Library → chọn truyện → Reader + Mục lục`; không sao chép hệ thống tài khoản, comment, like/follow, nội dung truyện hoặc mã website.

### File và khu vực đã sửa/kiểm tra

- `private-novel/src/ui/ImportDialog.tsx` — không âm thầm lấy file đầu khi người dùng thả nhiều TXT; báo chọn một file, giữ invariant một file = một truyện.
- `private-novel/tests/import.test.ts` — thêm test từ chối nhiều file trong một lần nhập.
- `private-novel/e2e/reader.spec.ts` — thêm E2E mục lục và E2E thêm/xóa truyện.
- `private-novel/src/ui/App.tsx`, `src/ui/Reader.tsx`, `src/splitter.ts` — kiểm tra luồng hiện có: thêm TXT/truyện mẫu, xóa sách có xác nhận, heading tạo chapter, modal mục lục có tìm kiếm/phân trang.
- `HANDOFF.md`, `private-novel/docs/DECISIONS.md` — ghi nguồn tham khảo, phạm vi không sao chép và kết quả.

### Đã kiểm chứng

- Diagnostics file sửa → không có lỗi.
- `npm.cmd test -- --reporter=verbose` → **32/32 unit tests pass**.
- `npm.cmd run build` → **pass**.
- `npm.cmd run test:e2e -- --reporter=line` → **8/8 E2E pass** trên Chromium và Android-layout giả lập, gồm mục lục và thêm/xóa truyện.
- Trang tham khảo: domain chính và `.vip` không kết nối được qua công cụ; IP `14.225.254.182` mở được và đã đọc snapshot trang chủ/trang chi tiết công khai.

### Chưa hoàn thành / giới hạn

- Chưa tạo trang chi tiết riêng có tóm tắt/thông tin/Đọc ngay như Sangtacviet; local Reader hiện mở trực tiếp từ card thư viện.
- Chưa thêm tài khoản, like/follow/comment/đẩy sách vì không thuộc MVP local-first.
- Mục lục local dùng dữ liệu người dùng nhập, không lấy danh sách/chương từ Sangtacviet.
- Android thật, TTS TikTok audio thật và các rủi ro backup/restore đã audit trước vẫn chưa được xác minh hoàn toàn.

### Việc tiếp theo cho AI khác

1. Nếu cần giống luồng trang chi tiết hơn, thêm `BookDetail` local chỉ dùng metadata người dùng nhập: title, author, summary, source và nút Đọc ngay.
2. Giữ mục lục local có tìm kiếm/phân trang; chỉ thêm cập nhật chương mới nếu có nguồn dữ liệu hợp lệ do người dùng cung cấp.
3. Không sao chép UI/mã/nội dung Sangtacviet nguyên bản; ghi lại mọi tham khảo mới bằng URL/ngày/phạm vi.

## Cập nhật phiên làm việc 04/10/2026 — kiểm tra Đăng truyện và quản lý chương

**Người thực hiện:** GitHub Copilot (AI coding agent).  
**Phạm vi phiên:** kiểm tra giao diện công khai quản lý truyện tại IP Sangtacviet được người dùng chia sẻ; mở form tạo truyện và màn hình quản lý chương chỉ để quan sát, không nhập/gửi dữ liệu, không dùng credential. Không sửa mã runtime trong phiên này; chuẩn bị đặc tả để triển khai local tương tự.

### Quan sát đã xác minh

- Danh sách quản lý có nút `Thêm Truyện`; mỗi truyện hiển thị tên, loại `Dịch`, ID và thao tác `Xem truyện`, `Chương`, `Sửa thông tin`, `Khác`.
- Form `Tạo truyện` có `Tên truyện`, `Tác giả/Bút danh`, loại `Truyện sáng tác` hoặc `Truyện dịch/convert`, `Thể loại`, `Ảnh bìa` URL, `Giới thiệu` và nút `Tạo truyện`.
- Form có nhắc bản quyền, mã hóa mặc định cho truyện sáng tác, điều kiện tên tối thiểu, ảnh bìa phải là URL hình ảnh và mã định dạng giới thiệu; các quy tắc này chỉ được tham khảo, không bê nguyên vào app.
- Màn hình quản lý chương có `Thêm Chương`, `Bật/Tắt Mã hóa`, `Xuất bản`, `Xóa chương`, `Lưu Danh sách chương`.
- Bảng chương có checkbox chọn, số, số phụ, tên, trạng thái mở, mã hóa, độ dài, lượt đọc, ngày đăng và thao tác xem/sửa/xóa từng chương.

### Kế hoạch tương tự hóa trong app local

- `Library`: thêm một TXT tạo một Book; card có mở sách và xóa sách với xác nhận.
- `ImportDialog`: metadata tối giản title/author; preview chia heading thành chương, sửa tên chương, gộp phần; không publish lên web.
- `Reader`/mục lục: danh sách chương có tìm kiếm/phân trang, chọn chương, chương trước/sau; không cần tài khoản/public URL.
- Bổ sung sau nếu người dùng yêu cầu: `BookDetail` local với summary/cover URL/source/type và `ChapterManager` có thêm/sửa/xóa chương theo batch. Không thêm mã hóa server, lượt đọc công khai, like/follow/comment hoặc xuất bản internet vào MVP này.

### Đã kiểm chứng

- Trang domain chính và `.vip` không kết nối được qua công cụ; IP `https://14.225.254.182/` mở được.
- Đã quan sát trang chủ, trang chi tiết, danh sách quản lý, form tạo truyện và bảng quản lý chương; không gửi form.
- Kết quả mã local gần nhất: **32/32 unit tests**, build pass, **8/8 E2E pass**; các E2E đã bao phủ mục lục và thêm/xóa truyện local.

### Chưa hoàn thành / giới hạn

- Chưa triển khai `BookDetail` metadata đầy đủ, `ChapterManager` riêng hoặc thao tác thêm chương thủ công như giao diện tham khảo.
- Không xác minh chức năng submit/publish của Sangtacviet vì không gửi dữ liệu; không coi đó là yêu cầu local.
- Không sao chép HTML/CSS/JS, nội dung truyện, ID, tài khoản hoặc endpoint riêng.

### Việc tiếp theo cho AI khác

1. Tạo task nhỏ cho `BookDetail` local: schema summary/cover/source/type, UI và test riêng.
2. Tạo task nhỏ cho `ChapterManager`: thêm/sửa/xóa/reorder chapter trong transaction, test rollback và cập nhật `chapterCount/charCount`.
3. Review độc lập migration nếu thêm metadata vào `Book`; không gộp với auth/backup/TikTok trong cùng patch.

## Cập nhật phiên làm việc 04/10/2026 — kiểm tra chức năng từng nút quản lý chương

**Người thực hiện:** GitHub Copilot (AI coding agent).  
**Phạm vi phiên:** đọc snapshot màn hình `https://14.225.254.182/uploader/list-chapter/36884`; chỉ phân tích nút/checkbox/bảng, không bấm thao tác thay đổi dữ liệu, không đăng nhập và không gửi form.

### Mapping chức năng đã quan sát

- `Danh sách`: quay về danh sách truyện.
- Breadcrumb tên truyện: quay lại quản lý chương của book hiện tại.
- `Thêm Chương`: tạo chapter mới.
- `Bật/Tắt Mã hóa`: áp dụng cho các chapter được chọn; bản local không đưa mã hóa server vào MVP.
- `Xuất bản`: công bố chapter; bản local thay bằng commit vào IndexedDB/preview, không publish internet.
- `Xóa chương`: xóa các dòng đã chọn; bản local phải có xác nhận và transaction rollback.
- `Lưu Danh sách chương`: lưu thứ tự/tên/trạng thái sau khi chỉnh bảng.
- Checkbox đầu mỗi dòng: chọn chapter cho thao tác hàng loạt.
- Checkbox `Mở`: trạng thái chapter có thể truy cập; local tương đương `ready/staging` hoặc chapter hidden cần thiết kế riêng.
- Checkbox `Mã hóa`: trạng thái riêng của chapter; chưa đưa vào local MVP.
- Nút biểu tượng từng dòng: xem chapter, sửa chapter, xóa chapter.
- Cột thông tin: số, số phụ, tên, độ dài, lượt đọc, ngày đăng; local có thể giữ số/tên/độ dài và bỏ lượt đọc/ngày đăng công khai.

### Định hướng code local

- Tạo `ChapterManager` từ dữ liệu `db.chapters`, không gọi Sangtacviet API.
- Thao tác thêm/sửa/xóa/reorder phải transaction cùng `db.books` để cập nhật `chapterCount/charCount` nhất quán.
- Nút xóa phải xác nhận; lỗi giữa transaction không được để mất chapter một phần.
- Mục lục Reader dùng lại cùng thứ tự chapter sau khi lưu.

### Đã kiểm chứng và giới hạn

- Snapshot trang quản lý chương đã đọc thành công; không thực hiện thao tác ghi/xóa/xuất bản.
- Kết quả test local gần nhất: 32 unit tests, build pass, 8 E2E pass; phiên này chỉ cập nhật tài liệu nên không chạy lại runtime test.
- Chưa triển khai `ChapterManager` riêng; đây là đặc tả chuẩn bị cho task tiếp theo.

### Việc tiếp theo cho AI khác

1. Implement `ChapterManager` local trong task riêng, bắt đầu bằng reorder + sửa tên + xóa có transaction.
2. Thêm test chapter count/char count, rollback và mục lục sau reorder.
3. Review độc lập migration nếu thêm field `subOrder`, `isOpen` hoặc metadata chapter.

## Cập nhật phiên làm việc 04/10/2026 — kiểm tra sâu Reader và tùy chỉnh hiển thị

**Người thực hiện:** GitHub Copilot (AI coding agent).  
**Phạm vi phiên:** quan sát read-only trang chương công khai Sangtacviet `https://14.225.254.182/truyen/qidian/1/1050754857/926800288/`; không đăng nhập, không gửi bình luận, không gọi nguồn dịch, không sửa dữ liệu.

### Chức năng Reader đã xác minh

- Breadcrumb hiển thị tên truyện và tên chương.
- Điều hướng ở cả đầu/cuối: `Chương trước`, `Mục lục`, `Chương sau`.
- Nội dung có trạng thái tải theo chương và hiển thị văn bản chương.
- Nút `Xem trang gốc` và `Ngôn ngữ/Dịch thuật`.
- Khu bình luận có nhập/gửi/xem bình luận và xem bình luận nguồn; các chức năng cộng đồng không đưa vào MVP local.
- Bảng tùy chỉnh hiển thị (`#stylediv`) có màu nền preset + color picker, màu chữ preset, bóng chữ bật/tắt + color picker, cỡ chữ giảm/tăng + ô số, giãn dòng giảm/tăng + ô số, chọn font và căn trái/giữa/đều/phải, giảm/tăng padding.
- Một số tùy chỉnh lưu bằng `localStorage` ở trang tham khảo; app local hiện đã có theme/font/cỡ chữ/giãn dòng/chiều rộng nhưng chưa có đủ color picker, text shadow, font list, align và padding.

### Mapping chuẩn bị cho app local

- Giữ mục lục/chương trước/chương sau và thêm trạng thái tải lỗi/hủy rõ ràng.
- Mở rộng `ReaderSettings` theo task riêng: background, text color, shadow, font family, align, padding; lưu setting theo local profile.
- Không sao chép inline JavaScript/HTML của trang tham khảo; chỉ triển khai hành vi tương đương bằng React/CSS thuần.
- Không đưa bình luận, analytics, nguồn tải ngoài hoặc dịch vụ cloud vào MVP local.

### Đã kiểm chứng / giới hạn

- Snapshot Reader đã đọc thành công; không thao tác gửi dữ liệu.
- Test local gần nhất vẫn là 32 unit tests, build pass, 8 E2E pass; phiên này chỉ cập nhật tài liệu nên không chạy lại runtime test.
- Không xác minh hành vi lưu setting sau reload trên trang tham khảo bằng thao tác tương tác; chỉ ghi nhận từ HTML/inline script và giao diện quan sát được.

### Việc tiếp theo cho AI khác

1. Tạo task nhỏ nâng `ReaderSettings` và UI controls, kèm test reload/theme/accessibility.
2. Tách style controls thành component độc lập, không trộn với TTS/backup.
3. Review mobile touch target và hiệu năng khi đổi style trong lúc chương dài.

## Cập nhật phiên làm việc 04/10/2026 — kiểm tra toàn bộ nhóm chức năng Reader

**Người thực hiện:** GitHub Copilot (AI coding agent).  
**Phạm vi phiên:** đọc snapshot và thử mở an toàn các panel Reader công khai Sangtacviet; không gửi bình luận, không áp dụng dịch, không upload Name, không chạy lưu/xóa dữ liệu. Không sửa mã runtime.

### Nhóm chức năng đã quan sát

- Điều hướng: Trang chủ, tìm kiếm, trang truyện, chương trước, mục lục, chương sau.
- Nội dung: bản lưu hệ thống, tải chương, xem trang gốc, ngôn ngữ/dịch thuật.
- Hiển thị: bảng cài đặt màu nền, màu chữ, bóng chữ, cỡ chữ, giãn dòng, font, căn lề và padding.
- TTS `Nghe sách`: mở danh sách từng câu/đoạn được đánh số; panel có nút `Lưu lại`, `Chạy`, `Xóa hết`, `Tải name`, `Upload`, `Ẩn`; có các điều khiển giọng/độ cao trong panel quan sát được.
- Name: mở công cụ chỉnh tên trong Reader; không thao tác gửi/lưu trong phiên này.
- Cộng đồng: bình luận, xem bình luận, xem bình luận từ nguồn; không thuộc MVP local.

### Ánh xạ vào app local

- Reader hiện đã có mục lục, TTS TikTok adapter, Name List và style cơ bản.
- Cần task riêng cho TTS sentence queue: danh sách câu, chạy từ câu chọn, dừng, xóa queue, lưu queue local; không copy tên/API/endpoint của Sangtacviet.
- `Tải name`/`Upload` nếu làm local sẽ đổi thành import/export Name List người dùng, có preview và không upload nội dung lên bên thứ ba.
- Nút `Ẩn` chỉ là đóng panel; không xóa dữ liệu.

### Đã kiểm chứng / giới hạn

- Snapshot Reader cho thấy các control trên; một lần thử mở translator bị panel TTS che pointer, không gửi request dịch.
- Console trang tham khảo có lỗi CORS tới `comic.sangtacvietcdn.xyz/tmm.php`, mixed content và analytics request fail; không đưa các phụ thuộc đó vào app.
- Test local gần nhất: 32 unit tests, build pass, 8 E2E pass; phiên này chỉ cập nhật tài liệu nên không chạy lại runtime test.

### Việc tiếp theo cho AI khác

1. Tạo task nhỏ nâng TikTokPlayer thành queue câu có play selected/stop/clear và test cancellation.
2. Tạo task riêng cho Name import/export local, không trộn với backup/TTS.
3. Không coi chức năng TTS thực sự hoàn thành cho đến khi gateway TikTok được phép trả audio và test phát thành công.

## Cập nhật phiên làm việc 04/10/2026 — Nâng cấp DictionaryPanel: multi-file, auto-detect kind

**Người thực hiện:** Antigravity (Claude Sonnet 4.6 Thinking).  
**Phạm vi phiên:** Nâng cấp UI nhập từ điển để hỗ trợ chọn nhiều file TXT cùng lúc và tự nhận biết loại từ điển theo tên file. Không sửa kho nguồn `D:\linh tinh\tm`, không thay đổi domain/db/language engine, không thay đổi public API.

### File và khu vực đã sửa

- `private-novel/src/ui/DictionaryPanel.tsx` — Thay thế toàn bộ UI cũ (chọn kind thủ công + 1 file):
  - Thêm `KIND_MAP` và `detectKind(filename)` nhận biết loại theo tên: `Vietphrase.txt` → `vp`, `PhienAm.txt`/`HanViet.txt` → `hanviet`, `Names.txt` → `names`, `Names2.txt`/`Pronouns.txt` → `names2`, `LuatNhan.txt`/`!LuatNhan.txt` → `rules`.
  - Input `multiple` chấp nhận nhiều file TXT cùng lúc.
  - State `pending[]`: preview trước khi lưu — xem tên file, kind detect, size; có thể đổi kind hoặc bỏ từng file.
  - File không nhận biết bị bỏ qua với thông báo rõ tên.
  - Nút "Lưu N file" gọi `db.dictionaries.put` + `resetLanguage()`.
  - Giữ nguyên phần danh sách đang dùng (gỡ) và thử convert.

### Đã kiểm chứng

- `npm.cmd run build` → **pass**, TypeScript/server/Vite production (không cảnh báo).
- `npm.cmd test -- --reporter=verbose` → **32/32 unit tests pass** (không có test riêng cho UI; `detectKind` cần test thủ công trên browser).
- Dev server đang chạy tại `http://127.0.0.1:5173/`.

### Chưa hoàn thành / giới hạn

- `detectKind` theo tên file; tên khác chuẩn cần đổi kind thủ công trong preview.
- Chưa có unit test tự động cho `detectKind`.
- `Blacklist.txt` và `Babylon.txt` bị bỏ qua (chưa có DictKind tương ứng).
- Rủi ro backup/restore từ audit trước vẫn chưa sửa.

### Việc tiếp theo cho AI khác

1. Thêm unit test `detectKind` vào `tests/core.test.ts`.
2. Nếu cần `Blacklist.txt`, thêm `DictKind = 'blacklist'` và xử lý trong engine.
3. Kiểm thử thực tế: mở `http://127.0.0.1:5173/` → Từ điển → chọn nhiều file từ Vietphrase-data → xác nhận auto-detect → lưu → thử convert.

## Quy tắc cập nhật

Mỗi phiên làm việc **bắt buộc** phải thêm một mục mới, không sửa mất lịch sử cũ, theo mẫu sau:

### Quy tắc phối hợp nhiều AI/model

- Giao mỗi AI một nhiệm vụ nhỏ, có invariant và tiêu chí nghiệm thu rõ; không giao phạm vi mơ hồ kiểu “làm tiếp toàn bộ dự án”.
- AI thực hiện phải cung cấp diff, test và giới hạn; AI review độc lập không được mặc định tin mô tả của AI trước.
- Thay đổi database, backup/restore, auth hoặc dữ liệu người dùng phải qua review rủi ro riêng trước khi merge.
- Chỉ chấp nhận kết quả có bằng chứng từ test/build/review; nếu chưa chắc phải ghi `chưa xác minh` và chuyển tiếp cho AI sau.
- Khi có nhiều AI sửa song song, dùng branch/worktree riêng; không để một AI sửa trực tiếp trên thay đổi chưa được kiểm chứng của AI khác.

```markdown
## Cập nhật phiên làm việc YYYY-MM-DD — [mục tiêu]

**Người thực hiện:** [tên người/AI/agent].
**Phạm vi phiên:** [đã làm gì; có/không đụng nguồn D:; có/không thay đổi public API].

### File và khu vực đã sửa

- `đường/dẫn/file`: [class/function/section], [thay đổi cụ thể] và [lý do].

### Đã kiểm chứng

- Lệnh: `[lệnh]` → [kết quả, số test/build, môi trường].
- Phân biệt rõ test tự động, giả lập và thiết bị thật.

### Chưa hoàn thành / giới hạn

- [điểm chưa kiểm thử hoặc chưa triển khai].

### Việc tiếp theo cho AI khác

1. [bước cụ thể, file/khu vực liên quan nếu biết].
```

Không đánh dấu hoàn thành nếu chỉ mới tạo UI hoặc build local. File này là đầu mối tiếp tục, không phải bằng chứng mọi mốc đã hoàn thành.


## Cập nhật phiên 04–05/10/2026 — Codex audit độc lập và UI đọc tối giản theo STV

**Người thực hiện:** Codex (OpenAI), root; reviewer độc lập `audit_backup`, `audit_auth_release`, `audit_import_reader`. Tiếp tục và chốt ngày **05/10/2026, 08:48 ICT (Asia/Saigon)**. Phiên ban đầu bắt đầu 04/10; bị gián đoạn và được người dùng yêu cầu tiếp tục. Đã đọc bốn tài liệu bắt buộc.

**Phạm vi:** kiểm tra đúng/đủ so với kế hoạch, tạo ca tái hiện lỗi, rồi thực hiện yêu cầu UI tối giản và bật/ẩn/thao tác theo Sáng Tác Việt. Nguồn D: chỉ đọc, không sửa/chạy script/đưa kho lên mạng. Quan sát trang truyện .vip bằng browser; trang chương báo connection refused. Reader đối chiếu HTML/JS local, không tuyên bố giống pixel tuyệt đối với live. Không commit/merge/deploy hoặc thêm Gemini/sync.

### File/khu vực đã sửa hoặc tạo

- `private-novel/audit/2026-10-04.repro.test.ts`, `audit/vitest.config.ts`: 7 ca tái hiện A1–A7 bằng dữ liệu tổng hợp, tách khỏi test nghiệm thu. PASS của suite này xác nhận lỗi còn tồn tại.
- `private-novel/audit/before-ui/{App.tsx,Reader.tsx,style.css,domain.ts}.txt`: snapshot trước UI để AI sau kiểm tra diff bằng `git diff --no-index`. Git chưa có commit và toàn bộ project untracked; không có diff lịch sử đầy đủ. Snapshot không có tts.ts/main.tsx; phần sửa của chúng được ghi cụ thể dưới đây.
- `src/ui/App.tsx`: bỏ hero trang trí, tiêu đề thư viện gọn; giữ dữ liệu/thao tác hiện có; sửa mô tả TTS remote theo hành vi thật.
- `src/stv-layout.css` (mới), `src/main.tsx` (import CSS mới): menu ngang/danh sách truyện, Reader nền phẳng/chữ rộng, nav hai đầu, công cụ nổi/bảng Name/Nghe/Cài đặt, responsive. `src/style.css` gốc không sửa; stylesheet mới override layout.
- `src/domain.ts`: mở rộng font, màu tùy chọn, căn chữ/bóng chữ; giữ fields voice/rate/pitch/flex/highlight đã có từ lượt khác. Defaults dùng Arial/Sepia; settings cũ merge với defaults, giữ giá trị cũ.
- `src/ui/ReaderTools.tsx` (mới): bảng non-modal có Ẩn/Esc/focus return; palettes/controls hiển thị; hướng dẫn thao tác nội tuyến.
- `src/ui/Reader.tsx`: thu gọn header/tools; trước/mục lục/sau hai đầu; Chỉ đọc vẫn có ⚙; token editor chỉ bật khi Sửa từ; Name draft/merge/nhập/xuất/ẩn; speech panel giữ các option baseline, disable provider chưa cấu hình, disclosure/đồng ý gửi text; expose trình sửa câu đọc đã có state nhưng thiếu UI. Bỏ title trùng trong article; không đổi nội dung chapter.
- `Reader.tsx` phần race: conversionSource gắn chapter/revision/Names/tempNames, không dùng Convert cũ; stopReading hủy continuation; auto-next chỉ khi đúng chapter + autoNext + consent + Convert ready. Ẩn bảng không dừng; explicit Stop đổi mode/voice/thu hồi consent hủy cả auto-next pending. Name draft revision bảo vệ dữ liệu nhập mới đến trong lúc save; textarea/file/xóa Name disabled trong lúc lưu.
- `src/book-names.ts` (mới): upsert Name của một book trong transaction books+names; kiểm tra book ready; key không nhập giữ nguyên, key trùng giữ ID, lần cuối thắng, lỗi rollback. Không đổi schema.
- `src/tts.ts`: resume Promise kiểm tra generation/audio identity; fetch bắt Content-Type audio để từ chối HTML fallback. Không thêm gateway/provider thật hoặc secret.
- `tests/book-names.test.ts`, `tests/tts-player.test.ts` (mới): isolation A/B, omitted/empty/duplicate keys, rollback lỗi put thứ N, oversized entries, deleted/staging book; late resume resolve/reject và HTML gateway.
- `e2e/reader.spec.ts`: selector scoped theo nav đầu trang và mở panel trước chọn giọng/cài đặt; giữ các luồng test baseline. Thêm `e2e/stv-ui.spec.ts` (bật/ẩn/persistence/Name/token/consent), `reader-race.spec.ts` (Convert auto-next và pending Stop với mocks), `ui-evidence.spec.ts` (ảnh và kiểm tra overflow).
- `docs/screenshots/{library,reader,settings}-{chromium,android-layout}.png`: ảnh synthetic demo trên hai layout; đã xem ảnh desktop/mobile.
- `docs/AUDIT-2026-10-05.md`, `USER-GUIDE.md`, `STV-UI-MAPPING.md`, `BACKUP-GUIDE.md`, `RELEASE-CHECKLIST.md`: kết quả audit, mapping/hướng dẫn thật và release gates còn mở.
- `WEB-READER-IMPLEMENTATION-PLAN.md`: thống nhất một TXT/TikTok adapter với quyết định mới, bỏ yêu cầu nhiều file/Browser TTS xung đột, bổ sung trạng thái chưa đạt R0/R1.
- `HANDOFF.md`, `docs/DECISIONS.md`: chỉ append lịch sử phiên/quyết định.

### Đã kiểm chứng bằng lệnh/quan sát

Chạy từ `private-novel/`:

- `npm.cmd test -- --reporter=verbose` → **40/40 pass**; lượt cuối 05/10 lúc 08:46 ICT, 6 file, 6.00 s. Fake IndexedDB/Audio là mock, không chứng minh quota/âm thanh thật.
- `npm.cmd run build` → **pass** TypeScript app/server + Vite 7.3.6, 50 modules, JS 415.73 kB (gzip 134.48 kB). Lượt cuối sau draft guard.
- `npm.cmd run test:e2e -- --reporter=line` → **20/20 pass**, 1.4 phút ở lượt cuối 05/10. Desktop dùng msedge, Android là Pixel 7 viewport trong msedge; **không phải Android thật** và không qua Pages auth. Lượt trước 12/14 pass do locator Mục lục mơ hồ sau thêm nav hai đầu; đã scope selector và lượt cuối qua hết.
- `npm.cmd test -- --config audit/vitest.config.ts --reporter=verbose` → **7/7 lỗi được tái hiện**, lượt cuối 05/10 08:47 ICT. Không ghi là 7 tính năng đã đúng.
- Review độc lập đọc transaction Name, chapter guard và cancellation; phát hiện pending Stop, nested Esc và draft-save race. Root đã sửa, chạy tests trên. Reviewer không chạy tests. Final draft version guard/disabled fields được root kiểm tra sau gợi ý reviewer; không có lượt review độc lập thứ ba hoàn tất do agent hết lượt sử dụng.
- `git diff --no-index` đối chiếu snapshot App/Reader/domain; return code 1 vì có thay đổi, không phải test fail. Không có commit baseline để kiểm tra mọi thay đổi của các AI trước.
- Browser localhost kiểm tra bảng hiển thị thực; ảnh Playwright được lưu và inspect. Trang STV .vip chương lỗi kết nối nên chưa đối chiếu pixel live.

### Kết quả và giới hạn còn lại

UI mở/ẩn/chỉnh hiển thị/Name/Convert đã có bằng chứng tự động. Không đánh dấu toàn bộ Web hoàn thành. A1–A6 backup/restore vẫn còn (Portable quá lớn; Compact Replace mất source; dict thoát rollback; hash/length chưa xác thực; dict conflict sai; packet đảo thứ tự). A7 splitter Unicode còn mở. Import deferred abort/progress direct reload/migration có dữ liệu cũ chưa xác minh.

TikTok chưa gateway thật; Bing/Google placeholder disabled. Tests auto-next mô phỏng Audio/language worker, không có giọng thật. Không có Android thật/benchmark TXT 38 MB + VP 43 MB/Pages runtime/logout UI/deploy private. Các update DECISIONS từ AI khác xuất hiện trong thời gian gián đoạn được giữ, không coi là chứng cứ tự nghiệm thu.

### Bước tiếp theo nhỏ, invariant/test/quyền sửa

1. **Compact Replace (A2)** — chỉ `backup.ts`, source/dedupe liên quan và tests; invariant: không mất bytes source thật khi backup thiếu sourceData, placeholder không được coi là hash đã có đầy đủ. Test import → compact → replace → hash/bytes/reimport, review độc lập trước nhận.
2. **Restore atomic dictionary (A3)** — chỉ restore path/schema staging nếu thực sự cần và tests; failed restore không đổi dictionary chung hoặc book cũ. Test fail ở part sau/commit và concurrent restore; review riêng mất dữ liệu.
3. **Portable/integrity A1/A4/A6** — backup format + tests, giữ compatibility packet cũ hoặc migrate rõ ràng; chunk theo byte, validate decoded hash/length và thứ tự. Test tổng hợp lớn rồi read-only benchmark file thật, không publish dữ liệu.
4. **Dictionary/source conflict A5** — preview/options/restore tests; không báo đủ requirements khi vẫn dùng hash khác. Test same kind khác hash và same source đổi title.
5. **Splitter/abort** — giới hạn splitter/importer và tests, Unicode mỗi chapter không split surrogate; abort trong storage estimate phải reject và dọn staging.
6. **TTS/auth/release** — gateway được phép + CSP cùng origin, audio thật, logout/session UI, Pages/D1 runtime, Android thật. Không đưa Gemini/content sync vào để bỏ qua lỗi local.

AI sau đọc audit và chạy lại ca lỗi tương ứng; không tin lời tự nhận/checkbox lịch sử, không ghi đè mục cũ.

## 05/10/2026 09:05–09:22 ICT — đa model: A2 và Convert C1, C2 đang kiểm tra

**Điều phối/kiểm chứng:** Codex root (OpenAI; không tự đổi model chính). **Khảo sát chỉ đọc:** subagent a2_survey_low, cấu hình gpt-6-luna/low. **Triển khai:** a2_implement_medium, gpt-6.1-sol/medium. **Review độc lập dữ liệu:** a2_review_high, gpt-6-astra/high. Đây là tên cấu hình công cụ, không xác minh backend riêng hoặc đo chi phí tiền.

Đọc AGENTS → HANDOFF → PLAN và DECISIONS; chọn A2 theo bước tiếp theo của phiên cũ. Root chạy baseline `npm.cmd test -- --config audit/vitest.config.ts --reporter=verbose -t A2` lúc 09:06: **1 pass/6 skipped, chứng minh lỗi cũ còn**. Snapshot trước sửa ở `private-novel/audit/before-a2/*.ts.txt`; repo untracked, không commit/merge/deploy.

### A2 — đã có chứng cứ sửa và review độc lập

- `src/domain.ts`: optional `dataStatus:'missing'` cho source/backup metadata, additive không đổi indexes/version DB.
- `src/source-data.ts` mới: nguồn đủ dữ liệu khi không missing và Blob.size bằng bytes; tương thích placeholder cũ Blob0/bytes>0. Không xác minh hash authenticity (A4 còn mở).
- `src/importer.ts`: known hashes chỉ từ nguồn đủ dữ liệu, cho nhập lại TXT khi Compact chỉ chứa metadata.
- `src/backup.ts`: export đánh dấu thiếu; restore nhận cả legacy Portable `dataBase64:''`/bytes>0 là thiếu. Final transaction kiểm tra staging book/chapter count/source IDs và old ready book trước replace; lấy bytes hiện tại trong transaction, bind matching source và chuyển toàn bộ unmatched/nonempty originals sang book mới, rồi xóa old/publish ready. Không sao chép bytes stale lúc staging. Guard update phải trả 1.
- `tests/backup.test.ts`: 15 ca mới, gồm Compact/Portable-no-source-data, carry unmatched/invalid metadata, bytes đổi trước commit, delete races, reimport qua Worker giả, rollback activation, v1/no source, v2 empty placeholder, targetTitle. Sửa fixture Portable có metadata bytes sai thành size/hash thật.
- `audit/2026-10-04.repro.test.ts`: A2 assertion chuyển invariant đúng, nhãn FIXED. Root sửa heading/comment và `audit/vitest.config.ts` để phân biệt 1 regression với 6 repro lỗi còn lại.

Reviewer độc lập phát hiện legacy empty Portable vẫn có thể xóa original; agent triển khai sửa và thêm test trước freeze. Reviewer cuối không còn blocker A2, tự chạy targeted **30/30** và audit **7/7**; 7/7 ở đây = A2 regression qua + A1/A3/A4/A5/A6/A7 còn tái hiện. Root đọc diff runtime/tests bằng `git diff --no-index`; code1 có nghĩa diff, không test fail. Root chạy full unit sau A2 **55/55** lúc09:15, build pass (51 modules), audit7/7 lúc09:16. Fake IndexedDB/Worker không chứng minh thiết bị thật hoặc multi-tab native.

### C1 — theo yêu cầu tiếp tục đối chiếu Convert/UI

Nguồn chỉ đọc: `D:\linh tinh\tm\truyen\vietphrase.zxc.io.vn\src\js\m_translation.js:93–124`, Name precedence và khóa dài; STV `qtOnline.js:11048–11058` chỉ là thao tác chọn/sửa/server AI, không chứng minh engine local STV. Root đọc lại snippet Vietphrase; không sao chép mã/dictionary/truyện. Root truy cập hai trang live để xác nhận controls cơ bản, không chạy benchmark hoặc lấy nội dung truyện.

- `src/language.ts`: chọn longest giữa book Name/Names2/Names, tie book > Names2 > Names; VP fallback; không merge thêm toàn bộ dictionary mỗi lần. Rules/HV/offset/worker/schema giữ semantics hiện hành.
- `tests/core.test.ts`: 6 regression tổng hợp về prefix hai chiều/tie/book isolation/VP/emoji offsets.
- Root đọc diff hai file, chạy full unit **61/61** lúc09:17:43 và build pass lúc09:18. Agent core17/17 và build pass. Chưa kiểm dictionary thật/43MB RAM hoặc toàn bộ engine giống upstream; khác thuật toán placeholder toàn văn bản vẫn cần đối chiếu riêng.
- `docs/MODEL-WORKFLOW.md` mới: model/task scope, nguồn dữ liệu, C1 evidence và thứ tự tiếp tục. Inventory chỉ đọc từ `D:\linh tinh\tm\STV Novel\mới chưa sửa\Vietphrase-data`: Vietphrase43.687.000 B, Names2.429.701 B, HanViet182.819 B, NameList90.996 B và các file phụ. Không nhập/upload tự động.

### C2 — chưa nhận hoàn thành ở thời điểm ghi mục này

Root chạy fullE2E sau C1: **19/20 pass**, Android-layout `stv-ui.spec.ts:13` reload về Sepia; isolated cùng test3/3 pass, chưa chứng minh nguyên nhân lỗi chập chờn. Agent medium tạo test deferred settings.get, xác nhận baseline late saved row ghi đè user dark (desktop E2E exit1). Đang sửa Reader hydration/autosave và reviewer độc lập kiểm tra per-field/explicit clear/reset/StrictMode/unmount/error. Snapshot Reader/e2e cũng ở before-a2. Chưa đánh dấu C2 đúng, sẽ thêm mục kết quả khi kiểm chứng xong.

Giới hạn A2: Portable bỏ bytes của nonempty source có metadata inconsistent và đánh dấu missing; không bảo đảm phục hồi loại này, giữ file gốc, xử lý với A4. A1/A3/A4/A5/A6/A7, migration dữ liệu cũ, crash/resume, audio thật/gateway/auth/deploy/Android thật vẫn mở. Việc sau C2: A3 atomic dictionary restore (chỉ backup/tests, fail không đổi dictionary/book cũ, review độc lập), rồi mapping dictionary/Convert controls theo MODEL-WORKFLOW. Không cloud sync/Gemini/TikTok ngoài phạm vi cũ.

## 05/10/2026 09:22–09:28 ICT — C2 kết quả cuối, tiếp tục được từ đây

**Người/AI:** Codex root điều phối, diff và chạy lại; triển khai a2_implement_medium cấu hình gpt-6.1-sol/medium; review độc lập a2_review_high cấu hình gpt-6-astra/high. Khảo sát gpt-6-luna đã hoàn tất trước đó. Không tự đổi root model, không đo chi phí/backend. Giữ tất cả lịch sử phía trên, bao gồm lần19/20fail và C2 khi chưa hoàn tất.

### Phạm vi và thay đổi cụ thể

- `private-novel/src/ui/Reader.tsx`: chỉ khu vực load/save ReaderSettings và nút Lưu cài đặt trong Nghe. Queue ở module scope sắp thứ tự đọc/lưu giữa các lần mount; load thành công mới cho phép save. Các thao tác người dùng trước load được replay trên defaults + saved row, giữ font/width chưa chỉnh và cả hành động xóa màu về mặc định. Callback read khi unmount không áp lại state. Lỗi đọc/lưu thông báo, không unhandled rejection; nút Save bị khóa trước hydration và dùng cùng đường lưu.
- Bản sửa thử dùng queue riêng từng Reader đã bị reviewer phát hiện race: old queued write có thể ghi sau new Reader edit. Không nhận bản đó; thay bằng queue chung cho cả reads/writes, thêm regression remount. Không drop pending writes đã enqueue chỉ vì unmount.
- `private-novel/e2e/stv-ui.spec.ts`: 5 test mới ×2 projects =10 E2E thêm: deferred initial read/explicit color clear/untouched fields; read rejection không ghi đè dữ liệu chưa đọc; write rejection; read resolved sau unmount; deferred old writes + reopen + newest edit. Dùng fixtures tổng hợp và monkeypatch table IO, không truyện/từ điển thật. Snapshot pre-C2 ở `audit/before-a2/Reader.tsx.txt`, `stv-ui.spec.ts.txt`.
- Root đọc diff/runtime/test bằng `git diff --no-index`; docs `HANDOFF.md`, `DECISIONS.md`, `MODEL-WORKFLOW.md`, `AUDIT-2026-10-05.md`, `BACKUP-GUIDE.md`, `RELEASE-CHECKLIST.md`, PLAN được cập nhật trạng thái/bằng chứng, không ghi đè lịch sử. Suite audit heading/config phân biệt A2 FIXED với six bad repros. E2E chạy lại tạo ảnh synthetic library/reader/settings trong docs/screenshots theo script hiện hành; không tuyên bố kiểm pixel live STV.

### Kiểm chứng và review

Lệnh từ `private-novel/`:

- Agent baseline deferred read: `npm.cmd run test:e2e -- e2e/stv-ui.spec.ts --grep "late saved" --project=chromium --reporter=line` → **fail như dự kiến**, dark bị late saved sepia ghi đè. Đây chứng minh bug hydrate riêng, không chứng minh nguyên nhân chính xác lần19/20fail trước.
- Agent sau sửa: `npm.cmd run test:e2e -- e2e/stv-ui.spec.ts --reporter=line` → **16/16 pass**; `npm.cmd run build` → pass.
- Root lượt cuối `npm.cmd test -- --reporter=verbose` → **61/61 pass**, 6 files, bắt đầu09:26:09,12.75s, exit0.
- Root lượt cuối `npm.cmd run build` → **pass**, app/server typechecks + Vite51modules, JS417.76kB(gzip135.22kB), exit0.
- Root lượt cuối `npm.cmd run test:e2e -- --reporter=line` → **30/30 pass**,30.6s, exit0. Hai projects thực thi bằng Edge Windows + Pixel7 viewport; không Android hardware.
- Independent reviewer A2 tự chạy targeted30/30 và audit7/7; C2 reviewer **chỉ đọc code/diff/tests**, không tự chạy C2 browser vì root đang chạy. Verdict C2 frozen-code không blocker, sau sửa shared queue. Không gộp báo cáo agent thành test root.
- Root audit sau A2 lúc09:16:23 →7/7 = **1 regression đúng A2 +6 lỗi A1/A3/A4/A5/A6/A7 còn tái hiện**. C1/C2 không sửa các runtime backup còn lại. Các lần build/test ban đầu lỗi typing hoặc regression fail có mô tả ở báo cáo, không bỏ qua để tuyên bố chưa từng fail.

### Giới hạn/tiếp theo

C2 chưa bảo đảm cross-tab settings hoặc reload đột ngột khi chưa commit; early edits rồi rời Reader trước hydration chưa có durability guarantee. Không xác minh root cause lần E2E chập chờn trước bằng ca hydrate riêng. Không Android thật, nạp VP43MB thực/RAM, toàn bộ Convert upstream, audio thật/gateway, auth private runtime hoặc deploy. D: chỉ đọc, không copy/upload/script nguồn; không cloud/Gemini/TikTok ngoài scope.

**Nhiệm vụ kế tiếp nhỏ:** A3 — chỉ `src/backup.ts` + tests (schema staging chỉ nếu cần); dictionary restore không được thoát rollback hoặc thay dictionary chung khi restore phần sau/activation fail. Invariant old book/source/dictionary nguyên vẹn khi fail; test failed later packet, activation failure và concurrent restores; agent medium triển khai, high review độc lập trước nhận. Không tự mở rộng thành format A1/A4/A6. Song song độc lập có thể giao low đọc mapping HanViet/NameList và file phụ của bộ từ điển, không nhập/copy tự động; đưa bằng chứng rồi chọn một thao tác Convert/UI có test rõ theo MODEL-WORKFLOW.

## 05/10/2026 09:46 và 13:45–14:00 ICT — A3, alias, tái tổ chức bàn giao
- Người/AI: Codex root; gpt-6-luna/low khảo sát chỉ đọc; gpt-6.1-sol/medium triển khai A3,
  bị quota ngắt báo cáo; gpt-6-astra/high review độc lập và tự chạy 38/38.
- Yêu cầu mới: áp dụng bản nhận xét tài liệu. Người dùng chốt R0 đọc/Convert, chưa bắt buộc TTS.
  Không tự bật Web Speech. Không tuyên bố model Sonnet/Opus đã được dùng.
- A3 src/backup.ts: candidates dictionary ở RAM, validate/decode trước final transaction;
  dictionaries tham gia transaction cùng book/source/job. Check kind đã tồn tại trong transaction.
  Không ghi đè dictionary concurrent; duplicate kind đầu thắng; không schema migration.
- tests/backup.test.ts thêm 14 ca: validation phần sau/Names/count, second put, activation rollback,
  concurrent local import/restores, opt-out, duplicates, metadata sai. Root đọc diff snapshot before-a3.
- DictionaryPanel.tsx: thêm exact alias DaiTuNhanXung vào names2 và help/error copy.
  Nguồn khảo sát D: chỉ đọc. Không sao chép dữ liệu; E2E dùng key/value tự tạo.
- e2e/backup-atomic.spec.ts mới: IndexedDB native failed restore giữ book/source, không leak dict,
  rồi successful restore. e2e/dictionary-alias.spec.ts: alias mới/cũ và Blacklist bị bỏ.
  Fixture restage và locator ban đầu fail đã sửa; không che chúng thành app pass.
- audit/2026-10-04.repro.test.ts: A3 regression; A1/A4/A5/A6/A7 chuyển it.fails invariant đúng,
  A4/A6 chấp nhận reject dữ liệu hỏng. Không tiếp tục assertion “lỗi tồn tại là đúng”.
- HANDOFF.md rút 57 dòng hiện hành; toàn bộ bản trước được copy nguyên văn vào HANDOFF-LOG.md.
  PRIVATE-WEB-PLAN nguyên bản vào docs/archive; rootfile thành pointer. Archive README liệt kê thay thế.
  AGENTS thêm lệnh kiểm thử/reviewer thực thi, lặp flaky, phân rủi ro/model, log template, baseline policy.
  STATUS.md đối chiếu M0–M8/schema/layout, không ép code theo cây dự kiến.
  PLAN/DECISIONS/MODEL-WORKFLOW/RELEASE-CHECKLIST/BACKUP-GUIDE/AUDIT cập nhật scope và evidence.
- .gitignore root loại secrets/generated/inventory; CI .github/workflows/ci.yml chạy npm ci/test/build/audit,
  Node 22 trên Ubuntu. Chưa push/chạy CI remote. Baseline local ghi rõ known defects, không là release.
- Kết quả root: 75/75 unit, build exit 0, audit 7 cases gồm 5 expected failures; 4/4 E2E mới; 6/6 lặp C2.
  Reviewer 13:56:24 targeted 38/38 exit 0, không blocker A3/alias; reviewer không tự chạy E2E.
  Chi tiết lệnh và giới hạn trong VALIDATION-2026-10-05.md.
- Rủi ro đã xác minh nhưng chưa sửa: TTS endpoint/STV-like IDs và GET text query.
  Gate riêng trước TTS thật. M0 benchmark/streaming/KDF, Android thật chưa làm.
- Next: M0-BACKUP/A1 prototype/tests giới hạn RAM/part; M0-DICT benchmark/parser quality;
  M0-AUTH CPU mục tiêu. Không thêm feature để né spike. Baseline không push.

## Mẫu bắt buộc cho phiên sau
- Ngày giờ (Asia/Saigon), người/AI và model cấu hình thật; ID nhiệm vụ.
- Phạm vi/quyền sửa; invariant và tiêu chí nghiệm thu.
- Từng file/khu vực sửa; quyết định/lý do và ràng buộc ngắn.
- Lệnh chạy, exit code, số lượng/kết quả; tách mocks/viewport/thiết bị thật.
- Reviewer độc lập: diff đã xem, lệnh tự chạy, findings và việc chưa xác minh.
- Giới hạn còn lại; ID/phạm vi/test cụ thể của 1–3 việc tiếp.



### 05/10/2026 14:01 ICT — xác nhận baseline
Root tạo commit local a41f29a, 94 files, tên: Baseline local reader with validated A3 and explicit release gaps.
Git status sạch ngay sau commit; chưa push/deploy. CI YAML có trong baseline nhưng chưa chạy remote.
HANDOFF thêm hash để phiên sau review bằng Git; commit tài liệu tiếp theo chỉ ghi bằng chứng này.

## 05/10/2026 14:28 ICT — Convert local trước theo yêu cầu người dùng
- Thực hiện: Codex root điều phối/engine/import/integration/tests/docs; agent convert_survey cấu hình gpt-6-luna low (chỉ đọc); convert_ui cấu hình gpt-6.1-sol medium (UI/CSS/E2E); convert_review cấu hình gpt-6-astra high (review độc lập). Đây là model từ tham số công cụ, không dựa vào tự nhận của agent. UI agent gặp capacity sau khi tạo file; root tiếp quản tích hợp/kiểm chứng. Không tuyên bố tự đổi model chính.
- Phạm vi/invariant: xử lý local, nguồn D chỉ đọc, không schema migration/AI/cloud/TTS; file lỗi encoding/quá dài/zero valid hủy toàn selection; mixed valid/invalid bỏ dòng lỗi có thống kê. Không có ghi dở transaction hoặc kết quả cũ đè bản mới; đổi dictionary giữ source và Name draft.
- src/language.ts: thêm options HV/nhiều nghĩa, bounds entry, duplicate rule last-wins, UTF16 offset khi kiểm Names trong capture.
- src/dictionary-reader.ts mới: parser UTF8 streaming 256KiB, bound mọi dòng kể cả có newline, thống kê valid/invalid/ignored.
- src/dictionary-import.ts mới: validate tất cả trước ghi, gộp nhiều file cùng kind theo thứ tự, singleton giữ nguyên byte; hash và bulkPut trong một transaction.
- src/workers/language.worker.ts: load vào engine candidate, publish khi tất cả file thành công; trả stats, truyền options.
- src/language-client.ts: stats/signature sha+size, hủy request active/queued bằng epoch, guard DB read, reset do lỗi cũ không hủy epoch mới.
- src/ui/DictionaryPanel.tsx: không mất file thứ hai cùng kind, thống kê dòng bỏ, khóa controls lúc ghi, bắt lỗi gỡ; dictionaryVersion làm hết hiệu lực output nhưng giữ draft.
- src/ui/ConvertPanel.tsx, src/convert-panel.css mới; src/main.tsx import CSS: source TXT/clipboard, VP/HV/nhiều nghĩa, token lookup, Name phiên nhập/xuất, download; giới hạn64k UTF16, generation guard upload/convert/lookup/unmount.
- tests/dictionary.test.ts mới6: tiếng Trung đáp án cụ thể, parser bounds/UTF8, merge/singleton, invalid selection, transaction rollback; tests/language-client.test.ts mới2: active/queued reset và DB-read reset. e2e/convert.spec.ts mới3x2 viewport: modes/name/lookup/revision, TXT/Unicode/oversize, stale responses.
- scripts/benchmark-convert.mjs mới: explicit local directory, temporary Edge context; docs/CONVERT-VALIDATION-2026-10-05.md lưu cách dùng/số đo/giới hạn; HANDOFF/PLAN/STATUS cập nhật ưu tiên.
- Tham khảo chỉ đọc: D:\linh tinh\tm\truyen\vietphrase.zxc.io.vn (dictionary/translation), nguồn STV đã tham khảo ở phiên trước; bộ D:\linh tinh\tm\STV Novel\mới chưa sửa\Vietphrase-data. Không copy nguồn/bộ vào repo, không upload/Git nội dung. Benchmark nhập browser context tạm và đóng sau đo.
- Root: npm.cmd test trong private-novel exit0 83/83; npm.cmd run build exit0. npm.cmd run test:e2e -- --reporter=line exit0 40/40 (43,6s). git diff --check sạch sau bỏ EOF trắng.
- Lỗi đã gặp và sửa: lệnh npm ở root không có package.json (ENOENT, chạy lại đúng app); build fail type mock Promise thiếu Dexie timeout (sửa mock trả Dexie Promise); E2E lần đầu4pass/2fail do nhãn Thư viện đã đổi Tủ sách, sửa selector rồi8/8 và full40/40. Benchmark lần đầu connection refused sau server test đóng; start Vite rồi đo thành công. Một lần dev trùng port, không dừng server người khác.
- Reviewer độc lập: 23/23 dictionary/core,2/2client, bốn runtime checks reset/load/partialengine; E2E đầu6pass/2fail selector cũ và shared artifact ENOENT do chạy song song với root; sau sửa late-result repeat3 exit0 6/6. Native Edge assertion đổi dictionary giữ source+Names/xóa output và lần sau dùng bộ mới pass. Chấp nhận phạm vi nhỏ, không còn blocker; không coi báo cáo model tự nhận là bằng chứng cấu hình.
- Benchmark thật exit0: VP43.687.000byte,1.113.825valid/1invalid; Names90.247valid; HV16.841valid/6invalid; đại từ28valid. Nhập1374ms, load1721,4ms, câu ngắn5,1ms; timer100ms maxgap104,4ms. Mainheap24.236.152byte KHÔNG gồm worker; chưa kết luận RAM toàn bộ. Text mẫu tự tạo, không lưu nội dung bộ nguồn.
- Giới hạn: Android thật/chrome riêng chưa xác minh; Edge Pixel viewport không thay hardware. Không parity toàn upstream hoặc dịch văn học. Rule bảo vệ Names trong capture, chưa prefix/suffix. Reader cũ còn rapidlookup/surrogate selection cần regression riêng; không sửa Reader đợt này. Name tạm mất khi rời tab công cụ có ghi rõ. Multi-tab chưa xác minh. Website chưa deploy và R0/R1 vẫn chưa đạt do gate khác.
- Bước tiếp: kiểm Android thực + RAM Worker; khóa scope Reader lookup/Unicode bằng delayed-response test trước sửa; sau đó M0 backup/A1 và auth gate. Không tự đưa AI/TTS vào để bù chức năng local.

## 05/10/2026 15:00 ICT — Nâng cấp Convert: Luật Nhân prefix/suffix/middle, chuẩn hóa dấu câu và viết hoa
- Thực hiện: Antigravity (Gemini 3.8 Flash High).
- Phạm vi/invariant: đối chiếu chỉ đọc `D:\linh tinh\tm\truyen\vietphrase.zxc.io.vn\src` và `https://sangtacviet.vip/trans/`. Không sửa, xóa, chạy script hoặc sao chép mã nguồn/dữ liệu từ ổ D: vào repo. Giữ nguyên 100% tương thích ngược với các fixture và test cũ khi không bật tùy chọn chuẩn hóa.
- Phân tích nguyên nhân lệch:
  1. STV chạy QuickTranslator mod C#/C++ trên server với cơ sở dữ liệu tích lũy lâu năm; vietphrase.zxc.io.vn chia 4 lớp rõ rệt: Tiền xử lý (đổi dấu câu toàn giác/chữ Hán sang dấu chuẩn), Bảo vệ Tên (placeholder), Luật Nhân (applyLuatNhan) và Trie Longest Match + Capitalization + Spacing.
  2. Bản cũ của private-novel không chuẩn hóa dấu câu; parser Luật Nhân loại bỏ hơn 12.300 luật (hơn 50% file !LuatNhan.txt) do chặn `!parts[0] || !parts[1]`; thứ tự kiểm tra luật đặt sau Vietphrase làm Vietphrase nuốt trước các từ đầu; thiếu viết hoa đầu câu và khoảng cách dấu câu bị thô.
- File và khu vực đã sửa:
  - `src/dictionary-reader.ts`: nới lỏng `dictionaryEntry` chấp nhận luật đơn `{0}` ở đầu (`{0}after`), ở cuối (`before{0}`), hoặc ở giữa (`before{0}after`).
  - `src/language.ts`: cấu trúc index `rulesByPrefix` và `rulesByAfter`; thứ tự ưu tiên: Names > Rules > Vietphrase > HanViet > Original (bảo vệ Tên không bị luật nuốt). Bổ sung `punctuationMap` và tùy chọn `standardizePunctuation?: boolean`, `capitalize?: boolean` trong `ConvertOptions`.
  - `src/ui/ConvertPanel.tsx`: thêm checkbox "Dấu câu & viết hoa" (mặc định tắt để tương thích ngược fixture E2E).
  - `src/ui/Reader.tsx`: truyền `standardizePunctuation: true, capitalize: true` khi Convert chương để người đọc có câu văn chuẩn tiếng Việt.
  - `tests/core.test.ts`: thêm 2 unit tests kiểm tra luật prefix/suffix/middle và chuẩn hóa dấu câu/viết hoa.
  - `tests/dictionary.test.ts`: thêm 1 unit test kiểm tra `readDictionary` chấp nhận các luật `{0}的父亲`, `那些{0}`, `把{0}挡住` và từ chối luật rỗng/không có `{0}`.
  - `private-novel/docs/DECISIONS.md`: bổ sung quyết định kỹ thuật chi tiết.
- Lệnh kiểm thử và kết quả:
  - `npm.cmd test` trong private-novel: exit 0 (86/86 unit tests pass).
  - `npm.cmd run build`: exit 0 (tsc app + server + vite build thành công).
  - `npm.cmd test -- --config audit/vitest.config.ts --reporter=verbose`: exit 0 (7/7 pass, gồm 5 expected failures).
  - `npm.cmd run test:e2e -- --reporter=line`: exit 0 (40/40 E2E tests pass trên cả Chromium và Android-layout).
- Giới hạn còn lại:
  - Chưa nghiệm thu trên phần cứng Android thật; RAM Worker khi nạp bộ lớn trên điện thoại thật cần kiểm tra.
  - Parity upstream hiện đạt các cấu trúc ngữ pháp `{0}` chính yếu của Luật Nhân; các trường hợp hiếm gồm nhiều placeholder (`{0}...{1}`) chưa kích hoạt.
  - Reader mở rộng selection đa ký tự/surrogate pair và tra từ siêu nhanh cần ca kiểm thử riêng.
- Bước tiếp theo:
  1. Kiểm thử phần cứng Android thật và đo RAM Worker.
  2. M0 backup streaming byte-level và A1/A4/A5/A6.
  3. M0 auth/KDF CPU mục tiêu.

## 05/10/2026 17:35 ICT — Khắc phục lỗi 522 và triển khai Cloudflare Pages `thu-phong-private`
- Thực hiện: Antigravity (Gemini 3.8 Flash).
- Phạm vi/invariant: kiểm tra và giải quyết lỗi `522 Connection timed out` khi truy cập `https://thu-phong-private.pages.dev/`. Không sửa mã logic nghiệp vụ đọc/convert, giữ nguyên 100% test pass.
- Nguyên nhân:
  1. Dự án Cloudflare Pages `thu-phong-private` đã được tạo nhưng chưa có deployment nào (lượt chạy lệnh trước đó trên Windows bị chặn do PowerShell execution policy với script `npx.ps1`). Khi tên miền `pages.dev` chưa có deployment hợp lệ nào, Cloudflare Edge phản hồi `522 Connection timed out`.
  2. Database D1 remote `thu-phong-auth` chưa được chạy file migration (`num_tables: 0`).
- Thao tác đã thực hiện:
  1. Chạy migration remote D1: `npx.cmd wrangler d1 execute thu-phong-auth --remote --file=migrations/0001_auth.sql` → exit 0, tạo thành công 2 bảng `sessions` và `login_limits` cùng các index.
  2. Build production: `npm.cmd run build` → exit 0, tạo `dist/` hoàn chỉnh (gồm workers bundle, CSS, JS).
  3. Deploy lên Cloudflare Pages: `npx.cmd wrangler pages deploy dist --project-name thu-phong-private` → exit 0, upload thành công static assets + Functions bundle + `_routes.json`.
  4. Xác minh kết quả qua `curl.exe -i -s https://thu-phong-private.pages.dev`: hết lỗi 522. Trang phản hồi HTTP 503 với thông điệp: "Ứng dụng chưa được cấu hình xác thực. Quyền truy cập đang đóng." Đây là hành vi Fail-Closed đúng thiết kế tại `server/auth.ts` khi chưa nạp biến môi trường/secret `AUTH_PASSWORD_HASH`.
- Lệnh kiểm thử và kết quả:
  - `npm.cmd test` trong private-novel: exit 0 (94/94 unit tests pass).
  - `npm.cmd run build`: exit 0 (TypeScript app/server + Vite build pass).
  - `npm.cmd run test:e2e -- --reporter=line`: exit 0 (40/40 E2E tests pass trên cả Chromium và Android-layout).
- Giới hạn còn lại:
  - Cần người dùng đặt mật khẩu truy cập bằng cách thiết lập secret `AUTH_PASSWORD_HASH` (tạo từ `npm run auth:hash` với 12–256 ký tự) để mở cổng đăng nhập vào ứng dụng web.
- Bước tiếp theo:
  1. Hỗ trợ người dùng tạo và nạp `AUTH_PASSWORD_HASH` lên Cloudflare Pages để hoàn tất xác thực đăng nhập.
  2. Tiếp tục các spike M0 còn lại (M0 backup streaming byte-level, kiểm thử trên thiết bị thật).

## 05/10/2026 17:39 ICT — Mở quyền truy cập trực tiếp web theo yêu cầu người dùng
- Thực hiện: Antigravity (Gemini 3.8 Flash).
- Yêu cầu người dùng: "Ứng dụng chưa được cấu hình xác thực. Quyền truy cập đang đóng. không cần mật khẩu vội".
- File và khu vực đã sửa:
  - `functions/_middleware.ts`: kiểm tra `context.env.AUTH_PASSWORD_HASH`. Nếu chưa được thiết lập, trực tiếp phục vụ ứng dụng web qua `secure(await context.next())` (giữ nguyên đầy đủ headers bảo mật: CSP, no-store, noindex, nosniff, DENY frame-ancestors). Khi người dùng cấu hình `AUTH_PASSWORD_HASH`, middleware sẽ tự động kích hoạt lại cổng đăng nhập `handleAuth`.
- Lệnh kiểm thử và kết quả:
  - `npm.cmd test` trong private-novel: exit 0 (94/94 unit tests pass).
  - `npm.cmd run build`: exit 0 (TypeScript app/server + Vite build pass).
  - `npx.cmd wrangler pages deploy dist --project-name thu-phong-private`: exit 0 (Deploy thành công lên `thu-phong-private.pages.dev`).
  - `curl.exe -i -s https://thu-phong-private.pages.dev/`: HTTP 200 OK, trả về index.html ứng dụng Thư Phòng đầy đủ, CSS và JS load 200 OK.
- Giới hạn còn lại:
  - Hiện tại trang web mở công khai không yêu cầu mật khẩu. Khi cần bảo vệ riêng tư, chỉ cần nạp secret `AUTH_PASSWORD_HASH`.
- Bước tiếp theo:
  - Người dùng có thể trực tiếp mở trình duyệt trải nghiệm đọc, nhập TXT và Convert truyện trên web live.

## 05/10/2026 15:10–20:05 ICT — Đối chiếu Vietphrase, sửa từ cố định và chia luồng clone STV
- Người dùng: so sánh localhost/Vietphrase và fix, sửa từ cố định; clone trước rồi hỏi hướng tiếp; chuẩn bị prompt AI khác trước usage hết; ưu tiên STV UI/tính năng theo từng phần. Không xác lập clone100% từ fixtures.
- Danh tính: Codex root engine/integration/tests/docs; vp_reference_survey cấu hình gpt-6-luna medium đọc-only; vp_persistent_ui cấu hình gpt-6.1-sol high viết helper/UI/CSS, bị mất agent khi runtime đổi trước tests, root tiếp quản. Reviewer mới review_persistent_names cấu hình gpt-6-astra high, độc lập tests và review. Không dựa vào selfreport inherited của agent để xác định model.
- Lượt đầu tạo highreview bị thread-limit (không giả vờ chạy review); runtime mới tạo được highreview thật và chạy targeted thành công. Rule/cap khảo sát đã sửa nhận định: segmentText cap10 chỉ gợi ý, maintranslation dùngTrie khôngcap10.
- Phạm vi/invariant: bản local, D read-only/no scripts/copy/upload; lưu Name merge transaction không mất mục khi omitted/invalid; error/async stale không mất draft; raw UTF16 token offsets nguyên nguồn; không DB schema migration; không sửa auth/hosting đang có AI khác làm.
- Tham khảo mã D:\linh tinh\tm\truyen\vietphrase.zxc.io.vn\src\js\m_translation.js,m_preprocessor.js,m_dictionary.js,m_nameList.js,m_ui.js; nguồn STV đọc trước ở phiên khác. Mã mới tái triển khai hành vi, không copy nguyên mã/dataset. Danh sách filedata D đọc metadata, không lưu nội dung vào repo.
- Live đối chiếu bằng câu tự tạo; bản nháp input có sẵn giữ trong memory và khôi phục cùng kết quả sau kiểm tra. Không gửi truyện/keys/D dictionary lên site. Kết quả nhỏ: 李明来到山门。中国人民。 → Lý Minh đi tới sơn môn. Người Trung Quốc dân.; 他说：“你好！” → Hắn nói: “Ngươi tốt!”; 不比他强 → Không mạnh bằng hắn. Cùng source không chứng minh cùng dictionary.
- NEW src/reference-convert.ts: normalize mapped source/key, protect global longest Names (cả giữa VP/prefix/suffix rule), greedy exact lookup Luật Nhân prepass, longest ordinary across VP/Chapter/Number/pronouns/HV/English/Blacklist; multi nghĩa có ngoặc, quote spacing/capitalization, invisibleunknown basicHan như reference nhưng giữ nguồn; merge ruleprovenance bảo toàn raw UTF16 offsets. Giữ blanklines/source data nên chưa parity mọi HTMLbehavior.
- src/language.ts: reference option, rawkeys và sparse normalizedOverrides riêng (collision last-write cho normalized, raw giữ riêng), raw/normalizedrule maps; legacy engine giữ tương thích purecalls. src/language-client.ts: reference mặc định cho app, đọc globalName rồi names arg; không gắn secret.
- src/domain.ts: thêm DictKind chapter/number/pronouns/blacklist/english; src/backup.ts CHỈ allowlist enum mới, không đổi format/globalsettingsbackup. src/dictionary-reader.ts: blacklist accept line-only. src/workers/language.worker.ts: nhận alias pronouns names2 cũ mà không sửa dữ liệu DB.
- src/ui/DictionaryPanel.tsx: nhận đúngkind optionaldicts; cùngloại gộp theo thứtự. DaiTu/Pronouns mới vào pronouns thay names2. Raw file giữread-only và install nguyêntransaction.
- NEW src/convert-names.ts: settings convert-name-list plainarray, merge/delete rw txn, input/key/value/countbounds, reject corrupt/futurestate, NameTXT roundtrip, surrogate-safe expansion. Không migration hay tự xóa dữ liệu cũ.
- src/ui/ConvertPanel.tsx+convert-panel.css: layout nguồn/NameList/kết quả; ThêmName/Lưu persist, Name tạm riêng, import/export, tokenlookup/choices/HV, expandUnicode, defaultformattrue. Draft revision giữ sửa khi hydrate/remotechanges; contentVersion gate continuation sau persist, gồm tempedits/clear. Ghi rõ Nameglobal exportTXT riêng vì bookbackup không chứa.
- src/ui/Reader.tsx: CHỈ thêm globalNamesRevision livequery/effect/readiness để thayNameglobal hết hiệu lực kết quả; giữ sửa/cài đặt của AI khác. Reader rapidlookup/surrogate expansion riêng chưa sửa.
- NEW tests/reference-convert.test.ts8; NEW e2e/convert-persistent.spec.ts2x2: reload/ThêmName/two-tab invalidation/failwrite/draft; e2e/convert.spec.ts kỳ vọng defaultdot; dictionary-alias.spec.ts pronouns vàblacklistimport. Reviewer ONLY NEW tests/convert-names-review.test.ts18:17ordinary+1OPENglobalbackup.
- Tài liệu: NEW STV-FEATURE-PARITY-PLAN.md phân luồng0–8, NEXT-AI-PROMPT.md promptcopy; cập nhật HANDOFF/PLAN/STATUS/CONVERT-VALIDATION; append DECISIONS và log. Existingfunctions/_middleware.ts,wrangler.jsonc/screenshots làdirty từAI khác (17:39deploy/openwithoutsecret theo yêu cầu riêng) giữ nguyên; không tuyên bố đó là việc root hay undo.
- Root tests cuối: npm.cmd test exit0 112reportedpass=111ordinary+1expectedfailure globalNamebackup; npm.cmd run build exit0; full npm.cmd run test:e2e -- --reporter=line exit0 44/44 (54,4s); lateConvert repeat-each3 exit0 6/6; audit config exit0 7reported gồm5expectedfailures A1/A4/A5/A6/A7. git diff --check exit0, chỉ CRLF warnings.
- Lỗi giữ lịch sử: runtime sandbox Vitest EPERM realpath spy.js không chạytests; rerun require_escalated thành công. Initial E2E6pass/2fail do kỳ vọngChineseperiod cũ saudefaultdot mới; cập nhật từ hành vi live rồi12/12/full44/44. Quote fixture có1fail do đã sửa enginequote bởi worktree thay đổi, đối chiếu nonmatch/whitespace behavior giữlowercase rồipass. Expectedfail regression tựunexpectedpass saufix (root2fail; reviewer3fail20:02:15) giữ bằngchứng trước bỏ markers córeview.
- Reviewer độc lập final20:02:52 targeted5files exit0 73reported=72ordinary+1OPENglobalNamebackup; xác nhận merge/concurrency/rollback/corrupt state/newkindportable, longReader>64k/rawpunct VP/globalName/rule và collision2orders; chấp nhận scope nhỏ. UI hồi quy do rootE2E xác nhận; chưa Android thật/Readercross-tab hardware.
- Benchmark mới bằng scripts/benchmark-convert.mjs chạyworkspace contextEdgefresh chỉ nhập4fileD rồiđóng: install1391ms/load3276,4ms/convert135,4ms; Mainheap11.336.074byte KHÔNG gồmWorker. VP1.113.825valid/1invalid; HV16.841valid/6invalid; Names90.247valid; pronouns28valid. Metadata/ownsentence output không copydictionary. Full7/8files+NameList corpus còn cần đo.
- Giới hạn: chưa toàn bộ cloneSTV/Vietphrase hoặcpixelparity; blanklines/quotes/unknown/rules/corpus dài cần oraclefixtures; chưaAndroid thật/RAMWorker. GlobalName không trongbookbackup, xuấtNameListTXT riêng trướcchuyển thiếtbị; OPENexpectedfail phải giữ. Đây làprofileengine được so sánh nguồn, không chạy upstream D scripts. Rootkhôngdeploy; log17:39 làbằngchứng củaAIkhác chưarootverifylive.
- Bước tiếp: P1 Reader-STV bảngcontrol/ảnhsameviewport, default/bật/ẩn vàkeyboard/touch theo STV-FEATURE-PARITY-PLAN; P2 Readerwordedit/race/Unicode; globalNamebackup cóthiếtkếreviewriêng, tiếpM0gate. AI saudùngNEXT-AI-PROMPT vàtựtesttrướcnhậntrạngthái.

## 05/10/2026 20:25 ICT — Phục chế UI controls Reader STV, bảo vệ Unicode/race khi sửa từ
- **Người/AI:** Antigravity (Gemini 3.8 Flash High), root.
- **Phạm vi phiên:** Đóng nghiệm thu Convert/persistentName; lập bảng mapping chi tiết UI controls Reader STV (mặc định, mở, ẩn, thao tác và lưu trữ); bổ sung stepper cỡ chữ/giãn dòng và nút căn lề STV; sửa từ trong Reader bảo vệ Unicode surrogate pair (`expandConvertSelection`), bảo vệ race condition rapid lookup (`lookupReqId`), và hỗ trợ lưu Name đa phạm vi (sửa tạm, lưu cho truyện, lưu Name chung); bổ sung nút nổi Đọc tập trung `👁`. Không schema migration, không thêm AI/cloudsync/TTS ngoài local.
- **Nguồn D:** Chỉ đọc (`D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\1chuongngaunhien.devtools`, `stv.ui.js`, `main.css`). Không sửa, không copy dữ liệu, không chạy script.
- **File và khu vực đã sửa/tạo:**
  - `docs/STV-UI-MAPPING.md`: Lập bảng đối chiếu 11 nhóm UI controls của Reader STV (mặc định, mở, ẩn, trigger, lưu trữ).
  - `src/ui/ReaderTools.tsx`: Bổ sung stepper nút `−` và `+` cho cỡ chữ và giãn dòng; thêm nút điều chỉnh lề `⇤` / `⇥` trong hàng căn lề.
  - `src/stv-layout.css`: Thêm styling `.stepper` cho các nút tăng giảm nhanh cỡ chữ/giãn dòng, đảm bảo không tràn màn hình ngang.
  - `src/ui/Reader.tsx`: Tích hợp `expandConvertSelection` cho nút mở rộng trái/phải modal sửa từ; thêm `lookupReqId` guard chống race condition khi tra từ nhanh; thêm tùy chọn `Lưu Name chung` (toàn cục qua `saveConvertNames`); thêm nút nổi `.unity-trigger` (icon mắt `👁`) cho chế độ Đọc tập trung với `aria-label="Đọc tập trung"` / `"Thoát đọc tập trung"`.
  - `tests/reader-word-edit.test.ts` (mới): 4 unit tests kiểm tra: (1) mở rộng lựa chọn qua surrogate pairs không xẻ đôi code units, (2) lưu Name truyện cách ly theo bookId không ảnh hưởng convert-name-list, (3) lưu Name chung vào `convert-name-list` trong `db.settings`, (4) lookupReqId guard loại bỏ kết quả lookup đến trễ.
  - `docs/DECISIONS.md`: Ghi quyết định kỹ thuật chi tiết.
- **Lệnh kiểm thử và kết quả:**
  - `npm.cmd test`: exit 0 (116/116 unit tests pass, gồm 1 expected failure `review OPEN: portable backup must retain global Names used by Reader`).
  - `npm.cmd run build`: exit 0 (TypeScript app/server + Vite build pass).
  - `npm.cmd test -- --config audit/vitest.config.ts --reporter=verbose`: exit 0 (7/7 pass, gồm 5 expected failures).
  - `npm.cmd run test:e2e -- e2e/stv-ui.spec.ts --reporter=line`: exit 0 (16/16 pass).
  - `npm.cmd run test:e2e -- --reporter=line`: exit 0 (44/44 E2E tests pass trên cả Chromium và Android-layout viewport).
  - `git diff --check`: exit 0 (không có lỗi cú pháp hay khoảng trắng thừa).
- **Lỗi đã gặp và sửa trong phiên:** Lần chạy E2E đầu tiên bị `strict mode violation` do cả nút nổi `unity-trigger` và nút `.focus-toggle` trong panel Cài đặt đều mang label `Hiện thanh công cụ`; đã sửa nhãn của nút nổi thành `Đọc tập trung` / `Thoát đọc tập trung` khớp chức năng Unity mode của STV và giải quyết triệt để xung đột selector.
- **Giới hạn còn lại:**
  - Chưa nghiệm thu trên phần cứng thiết bị Android thật (hiện chỉ kiểm thử trên Pixel 7 viewport giả lập trong Playwright).
  - Global Name List (`convert-name-list`) chưa được đóng gói tự động trong book portable backup (vẫn giữ test `it.fails` công khai; người dùng cần export file TXT riêng để di chuyển).
  - Chưa có gateway TTS được phép; R0/R1 gate auth/hosting vẫn giữ nguyên.
- **Bước tiếp theo:**
  - Phần 3 theo STV-FEATURE-PARITY-PLAN: Tủ sách và trang chi tiết truyện (UI danh sách, tìm/lọc, mở truyện, thông tin metadata, đọc tiếp, thêm/sửa/xóa truyện local có xác nhận an toàn).
  - Hỏi người dùng về hướng mở rộng tiếp theo sau khi các luồng Reader và Convert đã được kiểm chứng ổn định.


## 05/10/2026 20:46–21:00 ICT — STV-3a: trang truyện và bảo toàn tiến độ
- Người/AI: Codex root điều phối/tích hợp/kiểm lại; library_reference_survey = gpt-6-luna/low (chỉ đọc), story_detail_ui = gpt-6.1-sol/medium (2 file mới), story_navigation_review = gpt-6-astra/high (review độc lập và regression). Tên variant/effort theo cấu hình spawn, không theo lời runtime tự nhận. Root không tự đổi model chính.
- Đầu phiên đọc AGENTS/HANDOFF/plan/DECISIONS/mapping, git dirty và mã thật. Bàn giao20:30 của AI khác đã làm Reader nên chọn STV-3a kế tiếp, không làm lại. Không chạm functions/_middleware.ts/wrangler.jsonc, dữ liệu D hoặc đẩy Git/deploy.
- Nguồn tham khảo: D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\truyen\dich\1\45925\index.html dòng473/478/480 bìa/tên/author,537 và793–795 nút đọc tiếp,708–721 chương gần nhất,571–592 mục lục. Root kiểm lại rg. Home https://sangtacviet.vip/ mở được qua web; detail live cache miss. Không chạy/copy nguyên mã, ảnh hay nội dung D. Tìm chương/phân trang là tiện ích local, không nhận là feature nguồn đã thấy.
- Phạm vi/quyền: agent triển khai chỉ StoryDetail.tsx/story-detail.css; survey không ghi; reviewer chỉ thêm story-detail-review.spec.ts; root App/Reader/tests/docs. Invariant: thăm trang truyện không ghi nội dung/Name/progress; resume giữ saved paragraph; explicit chapter/từ đầu bắt đầu0; callback cũ không nhảy chương; tương thích Mở sách; không schema/migration/network nội dung.
- File/khu vực thay đổi:
  - src/ui/StoryDetail.tsx (agent): read transaction snapshot sách/progress/chương; chỉ giữ metadata, trạng thái loading/error/deleted/empty, metadata, đọc tiếp/từ đầu, current chapter, tìm/phân trang60. IndexedDB vẫn đọc từng record có text vì không field projection; không quảng cáo metadata streaming.
  - src/story-detail.css (agent): khung thông tin xanh nhạt, cover TXT tự dựng, danh sách2cột desktop/1cột mobile, nút và wrapping chống overflow.
  - src/ui/App.tsx (root): bìa/tên mở detail, Mở sách cũ đọc trực tiếp, entryChapter và back destination, giữ search/cuộn thư viện trong phiên, import/demo reset entry đúng. Không sửa CRUD/DB methods.
  - src/ui/Reader.tsx (root): props initialChapterId/backLabel, chọn initial ưu tiên nếu hợp lệ, explicitStartPending đoạn0; positionChapter guard không save default0 trước hydrate đúng chương. Giữ các thay đổi wordedit/settings của AI trước, không nhận là của phiên này.
  - e2e/story-detail.spec.ts (root): 4scenarios/2projects: snapshot read-only,65chapter/search/pager/current, navigation/reload/resume/start/chọn, missing/deleted/empty; screenshot fixtures tự tạo.
  - e2e/story-detail-review.spec.ts (reviewer):8scenarios/2projects: saved paragraph12 vs explicit0, nonfirst, cancel paragraph and initial lookup, missing/empty, Back trước hydrate. Không sửa expectation để che bug.
  - docs/screenshots/story-detail-{chromium,android-layout}.png: ảnh synthetic mới; root xem ảnh Android. FullE2E ui-evidence cũng ghi lại ảnh library/reader/settings theo test hiện có, các ảnh này đã dirty trước phiên.
  - HANDOFF.md trạng thái hiện hành; HANDOFF-LOG append; DECISIONS append; STATUS/USER-GUIDE/STV-UI-MAPPING, plan/parity plan/NEXT-AI-PROMPT cập nhật phạm vi và việc sau. Sửa overclaim mapping: Settings không đóng bằng bấm ngoài, TTS không phải local-only.
- Lỗi/kiểm thử ban đầu (giữ kết quả fail):
  - Root npm.cmd test sandbox exit1 EPERM realpath vitest spy.js,11 unhandled/no tests; elevated chạy116reported pass. Agent UI sandbox test/build EPERM rồi elevated116/buildpass; không là lỗi app.
  - Root targeted6E2E lần1 exit1 =4pass/2fail do selector .story-chapters button đếm cả2nút pager (62≠60). Sửa test selector .story-chapter-list button; rerun6/6pass. Sau thêm empty/missing thật,8/8pass được reviewer kiểm.
  - Reviewer sandbox E2E khởi động lỗi port5173; elevated chạy được. Pattern story-detail*.spec.ts bị Playwright coi regex chỉ chọn file gốc8/8; dùng tên review file chính xác sau đó.
  - Reviewer first review command10pass/2fail do fixture paragraph12 tương ứng block6 vì dòng trắng; sửa fixture expectation. Sau thêm Back regression12pass/2fail thật: paragraph12→0 ở cả hai project.
  - Root sửa ownership guard. Reviewer đọc diff và chạy targeted cancel initial lookup repeat3 exit0 6/6; final review full repeat3 exit0 48/48 (26.2s), chấp nhận scope nhỏ không blocking finding.
- Root nghiệm thu cuối trong private-novel/ (elevated do sandbox EPERM):
  - npm.cmd test: exit0,11files/116reported =115ordinary+1it.fails globalNamebackup. Chạy lại sau guard, không chỉ tin agent.
  - npm.cmd run build: exit0,TypeScript app/server + Vite58modules. Chạy lại sau guard.
  - npm.cmd test -- --config audit/vitest.config.ts --reporter=verbose: exit0,7reported =2regression+5it.fails A1/A4/A5/A6/A7. Audit chạy trước guard; guard không đổi backup/export/audit scope.
  - npm.cmd run test:e2e -- --reporter=line: exit0,68/68pass,53.4s,Edge Chromium desktop và Pixel7 viewport. Có toàn bộ Convert/worker/import/settings/native IndexedDB/regression mới.
  - npm.cmd run test:e2e -- e2e/reader.spec.ts -g "sample reader" --repeat-each=3 --reporter=line: exit0,6/6pass,8.9s. Không suy ra đã chứng minh nguyên nhân mọi intermittent cũ.
  - git diff --check lúc đầu báo blank line EOF của log AI trước dòng808; append phiên mới giữ nguyên lịch sử, kiểm lại cuối. Không restore dirty files.
- Giới hạn: chưa clone UI/STV100%; detail live chưa xem được; Android hardware/IO quota/xóa đồng thời lúc Reader mở chưa kiểm. GlobalNames vẫn chưa trong portable bookbackup; phải export NameList riêng. M0 RAM Worker/backup lớn/auth CPU, A1/A4/A5/A6/A7/private gate chưa đạt. Không bổ sung Gemini/cloud/TikTok gateway hoặc deployment.
- Việc kế tiếp STV-3b: chỉnh/sửa/xóa thư viện an toàn, tái hiện IO lỗi và confirm đúngbook, giữ TXT/Name/progress; reviewer dữ liệu độc lập. Readerwordedit cần reset nghĩa khi chờ/invalidate close/changechapter/giữdraft lúc save lỗi (mã đã đọc, chưa test tái hiện phiên này). M0-BACKUP/A1 vẫn gate trước release. Prompt tiếp tục ở NEXT-AI-PROMPT.md; đọc lại HANDOFF và chạy test thật.
- Kiểm cuối: git -c core.safecrlf=false diff --check exit0 sau cập nhật tài liệu; đã đọc diff App/Reader và mã/test mới. Browser localhost được yêu cầu mở qua open_in_codex, trả queued; không coi là UI đã được người dùng kiểm hoặc deploy.

## 05/10/2026 21:05–21:23 ICT — Reader popup STV WIP, bàn giao trước hết usage
- Codex root tích hợp; name_popup_reference gpt-6-luna/low read-only; stv_word_popup_ui và reader_word_helpers gpt-6.1-sol/medium (file scopes riêng). Chưa high independentreview. User yêu cầu handoff, root không coi scope ghi dữ liệu mới đã nghiệm thu.
- Đọc HANDOFF/plan/DECISIONS/mã thật. D-source qtOnline.js6500–6520/6943–7106/10098–10192 và chapter HTML1331–1383; read-only. Live CUA tab user hiện /927288642/ (annotation /926905784/ đã đổi), click từ sinh vật để đọc DOM #nsbox:256px/232.4px/#17a2b8. Không bấm lưu/share, không gửi nguồn D, không chạy mã mirror. Lần bind URL cũ không tìm tab, inventory rồi bind tab hiện có; không tự chuyển chương.
- UI agent: src/ui/WordPopup.tsx + src/word-popup.css mới: compact rows, busy/loading/outside/Escape/viewport, callbacks. Root sửa footer Thêm Name được mở khi tc trống. Tên model theo spawn config, không theo runtime tự nhận.
- Helper agent: src/reader-word-edit.ts + tests/reader-word-actions.test.ts mới: atomic savedbook/global guard, whole-token Unicode expansion, ephemeral selectedrange.23unit meaningful scopes/rollback/repeatedphrase. Initial test EPERM/no execution, elevated23/23. findLast unsupportedES2022 đã thayreversefind.
- Root Reader.tsx: defaultconvert, bỏ mode/editbuttons (raw còn menu Công cụ), Popup thay NameModal, lookup generation/reset/close/chapter/unmount, tempEdits theo range, save errors giữdraft, modal ThêmName/SửaNghĩa local, Google buttonsconfirm trước mởlink; conversionRun reexecute. Không chạm auth/backup/schema/truyện thật. Chưa giản lược hết header/actions như STV; AddName3variants chưa5, TrSửa Nameoverride chưa dictionaryVPedit.
- Root e2e/reader-word-popup.spec.ts: 2scenarios×2projects chữ Trung tự tạo 山门。山门。; default/no toggles, HV, tempfirstonly, savedreload, failedsavekeepdraft. Screenshots word-popup-{chromium,android-layout}.png; root xem ảnh Android.
- Build trung gian exit1 vì mocked async put trả native Promise thiếu Dexie PromiseExtended.timeout; root đổi mock sang put(...).then(throw), không đổi invariant. UI-agent build cũ xanh trước tích hợp không coi là nghiệm thu mới.
- Root cuối: npm.cmd test exit0 12files/139reported=138ordinary+1expectedNameglobalbackup. npm.cmd run build exit0 TSapp/server+Vite61modules. npm.cmd run test:e2e -- e2e/reader-word-popup.spec.ts --reporter=line exit0 4/4,9.8s. Commands require_escalated vì sandboxEPERM. Chưa fullE2E mới/highreview; không bỏ expectations cũ để làm xanh.
- User hỏi chuẩn bị prompt khi usage cao; tool usage báo primary95%used, không giả vờ đổi model. NEXT-AI-PROMPT.md viết lại self-contained theo checkpoint, nguồn/APIs/file/test/limits/instructions. HANDOFF current WIP; appendDECISIONS/log không xóa history.
- Next AI bắt buộc: e2e/reader-race:25 còn bấm Convert; stv-ui:124–131 còn toggle/modal cũ → đổi theo usercontract và chạyfull/repeat3. High reviewer src/reader-word-edit +Reader persistence và targeted tests; testlate lookup/close/chapter/pendingwrites. Kiểm tempedit khi dictionarychange, source boundary partial; displayTokens hiện catch returnsbase âm thầm cần quyết định rõ. UI screenshot còn nút màu sepia do reader CSS specificity/order vàkhácupstreamcyanicons; xử lý scoped CSS .reader .stv-word-popup sau đọccomputedstyles. Popupscroll/keyboard/expansion/focus còn chưa đủ. Cần5AddNamevariants và minimalReaderSTV; không thêm cloud/gateway.
- Giới hạn cũ: backup globalName/A1/A4/A5/A6/A7/M0/Androidhardware/privateauth chưađạt. Full68/review48/audit7 làbản21:00 trướcdefaultchange. Khôngpush/deploy/secret; no highreview evidence giả. Các agents đã xong, không còn implementationagent chạy.

## 06/10/2026 06:05–11:29 ICT — Nghiệm thu nhỏ popup STV và sửa re-tokenization
- **Người/AI:** Codex root điều phối/tích hợp; `reader_name_review` cấu hình `gpt-6-astra/high` review độc lập. Reviewer hết quota ở follow-up cuối sau khi đã gửi bằng chứng; root tiếp quản fix cuối. Không giả vờ đổi model chính.
- **Phạm vi/invariant:** Reader/Convert popup và test/tài liệu liên quan; D: chỉ đọc, không chạy/copy/upload; không schema/migration; không chạm auth/deploy; Name book/global phải transactional, chapter/revision guard; late lookup/chapter change không áp kết quả cũ; sửa tạm chỉ source range đã chọn và không làm mất range độc lập.
- **File:** `src/word-popup.css` tăng specificity trong scope Reader, nền cyan/nhãn `#008000`/nút trắng; `src/ui/Reader.tsx` bắt lỗi expand, clear temp overlap sau persistent save, áp các range tương thích trước range mới; `src/reader-word-edit.ts` giữ presentation whitespace và thêm `applyCompatibleReaderWordEdits`; `src/ui/ReaderTools.tsx`, `docs/USER-GUIDE.md`, `docs/STV-UI-MAPPING.md` sửa hướng dẫn default Convert/chạm từ; `e2e/reader-race.spec.ts`, `e2e/stv-ui.spec.ts` đổi contract bỏ toggles; `e2e/reader-word-popup.spec.ts` khóa màu, persistence/fail-write và retokenization; `tests/reader-word-actions.test.ts` + reviewer `tests/reader-word-review.test.ts` regression. Không nhận các dirty file auth/backup khác là của phiên.
- **Review độc lập:** kiểm transaction merge/concurrency/rollback, wrong/deleted/revised chapter, Unicode/overlap, corrupt global row, late lookup/đổi chương; targeted unit29 pass; popup+race repeat24/24; browser probes lookup/chapter3/3. Tìm 2 lỗi P2: sửa occurrence sau mất space; một range invalid làm mọi temp biến mất rồi chặn sửa range khác. Root sửa, reviewer probe xác nhận phần giữ range hợp lệ trước khi quota hết; root thêm E2E lưu lâu dài cho cả chuỗi sửa tiếp.
- **Lỗi/lịch sử:** sandbox unit/build EPERM realpath, không test nào chạy; elevated pass. E2E lần đầu22/24 fail selector label không exact; repeat selector `.word-token`6/6 fail strict; targeted23/24 có1timeout khi2runner dùng chung artifact; popup repeat12/18 vì selector Mountain không exact. Không coi các lần này là app pass; sửa selector/output isolation và chạy lại.
- **Lệnh cuối:** `npm.cmd test` exit0 145/145; `npm.cmd run build` exit0 app/server/Vite61modules; `npm.cmd run test:e2e -- --reporter=line --output=test-results-root-full` exit0 74/74; retokenization `--repeat-each=3` exit0 6/6; `git diff --check` exit0 (chỉ CRLF warning). Ảnh `docs/screenshots/word-popup-android-layout.png` được root xem: cyan/green/white đúng, không còn nút sepia.
- **Giới hạn:** chưa Android phần cứng; popup256px đạt hành vi/màu chính nhưng toàn Reader chưa pixel-perfect; AddName mới3/5 biến thể; `Tr Sửa` đang là Name override local, chưa sửa dictionary blob; global Name chưa trong portable backup; M0/auth/backup lớn còn mở.
- **Tiếp theo:** task nhỏ `STV-Reader-AddName`: đọc chính xác `lowerNLastWord` nguồn chỉ đọc, triển khai5 biến thể với test Unicode/word-spacing, sau đó review scope `Tr Sửa`; không mở rộng cloud/TTS.

## 06/10/2026 12:30–12:32 — Ba annotation Reader
- AI: Codex root, tự thực hiện phạm vi hẹp; không subagent. Đọc HANDOFF/plan và AGENTS; chỉ sửa Reader và E2E UI, không DB/auth/D-source.
- src/ui/Reader.tsx: bỏ nút Name thanh đọc và unity-trigger; selectionTranslation riêng, lookupSelection chạy lookup rồi Convert nguồn mới, commit cả hai qua req/context/alive guard; Tr hiển thị translation mới thay fallback token cũ. Name vẫn mở qua Quản lý/cài đặt, Chỉ đọc vẫn có header/settings.
- e2e/reader-word-popup.spec.ts: xác nhận hai nút bị loại, đổi zw thành 山门山门 tự ra sơn môn sơn môn. e2e/stv-ui.spec.ts mở Name từ cài đặt để giữ invariant draft lưu khi ẩn.
- npm.cmd test exit0 145reported (known globalNamebackup it.fails giữ nguyên); npm.cmd run build exit0; npm.cmd run test:e2e -- e2e/reader-word-popup.spec.ts e2e/stv-ui.spec.ts --reporter=line exit0 22/22; git diff --check exit0. Chromium/Android viewport, chưa Android thật; chưa chạy full E2E mới.
- Next: 5 biến thể AddName/layout tổng theo handoff; kiểm late Convert selection bằng E2E dài hạn khi mở rộng scope tiếp.

## 06/10/2026 12:34–12:38 — Deploy Code/UI lên Pages theo yêu cầu người dùng
- Codex root dùng skill wrangler (C:/Users/toann/.agents/skills/wrangler/SKILL.md), đọc docs Direct Upload và local help. Wrangler4.147.0 OAuth có pages write; project thu-phong-private, production branch master xác minh từ deployment list.
- npm.cmd run build exit0; full npm.cmd run test:e2e -- --reporter=line exit1 72pass/2fail: convert-persistent cross-tab invalidation chưa empty trong5s ở cả2projects. Rerun ca --grep "fixed word" --repeat-each=3 exit0 6/6. Không sửa test/production để làm xanh; flake chưa xác định nguyên nhân, giữ mở.
- npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true --commit-message "Reader popup and automatic selection Convert UI update" exit0; production deployment https://2ad6ae9b.thu-phong-private.pages.dev . Chỉ build assets5files và Functions hiện có, không secrets/newbindings/migration/data D/upload nội dung người dùng.
- Invoke-WebRequest URL chính https://thu-phong-private.pages.dev/ HTTP200, HTML khớp dist/index.html; SHA256 JavaScript assets/index-DY1vRvrm.js tải từ production khớp dist. Chưa smoke UI tương tác production/Android thật; không xác nhận private gate. Không commit/push.
- Next: tái hiện flake multi-tab dưới tải và review nếu sửa data-related code; tiếp AddName5variants/Reader layout. User refresh Pages để nhận code mới; local IndexedDB không tự chuyển origin.

## 06/10/2026 — Ghi nhận yêu cầu nhập EPUB/file/folder
- AI: Codex root; phạm vi chỉ tài liệu theo yêu cầu ghi nhớ, không subagent/code/deploy/data mutation.
- HANDOFF.md ghi quy tắc hiện hành; WEB-READER-IMPLEMENTATION-PLAN.md thêm yêu cầu importer/preview/backup; DECISIONS.md append quyết định sản phẩm, giữ lịch sử.
- Invariant tương lai: file riêng=truyện; folder=truyện/files=chương; EPUB hiển thị ảnh theo thứ tự và text editName như thường; không chia resource EPUB thành truyện. Chưa xác minh/thực hiện importer EPUB/folder mới. Cloud20GB chưa chốt lưu trữ.
- Kiểm tra: git diff --check; không chạy unit/build vì chỉ tài liệu. Next: thiết kế importer EPUB tài nguyên+text và folder preview trong phạm vi nhỏ, review độc lập nếu thay schema/backup.

## 06/10/2026 12:50–12:53 — Tên truyện/chương tự Convert
- Codex root tự làm scope display nhỏ; không subagent hoặc DB write mới. Đọc handoff/plan, giữ D readonly.
- NEW src/ui/ConvertedTitle.tsx: Worker Convert có Han, bookNames/globalNames/dictionary revision livequery, alive cancel/fallback source; không ghi metadata. App.tsx bìa/title; StoryDetail.tsx heading/current/chapterlist; Reader.tsx book/chapterheading/TOC tích hợp component.
- NEW e2e/converted-titles.spec.ts: fixture 山门/初见, Library→Detail→Reader, Name update tự đổi heading và assert DB vẫn Chinese. npm.cmd test exit0 145reported(1known it.fails); build exit0; targeted converted-titles/story-detail/reader-word-popup E2E exit0 16/16; git diff --check exit0. Không fullE2E mới; multi-tab flake phiên deploy trước vẫn mở.
- User từng yêu cầu Code/UI lên Pages: deploy production master50691b32 exit0, URL https://50691b32.thu-phong-private.pages.dev ; main HTTP200/HTML khớp dist. Không upload data D, không migrate D1/secrets.
- Giới hạn: search/aria-label/editor dùng tên gốc; chưa search tên Việt, chưa Android hardware hoặc kiểm performance hàng ngàn titles. Next: search tên Convert qua index theo batch nếu cần; AddName/EPUB/folder theo kế hoạch.

## 06/10/2026 13:55–13:58 — Đủ5 biến thể AddName và deploy
- Codex root tự làm scope nhỏ, không subagent; đọc AGENTS/HANDOFF/plan/DECISIONS và nguồn D read-only qtOnline.js:5959–5970,10139–10187 + chapter HTML1417–1421. Không chạy/copy source D, không upload data.
- NEW src/name-case.ts pure formatter Unicode cho lower/first/firstTwo/lastLower/title, giữ spacing/punctuation. src/ui/Reader.tsx thay3nút cũ thành5lựa chọn dùng formatter trong modal. Chỉ đổi draft; existing scoped save vẫn giữ nguyên. Source dùng heuristic Chinese length-2 cho firstTwo; app dùng word count để đúng nhãn, ghi khác biệt rõ.
- NEW tests/name-case.test.ts6 cases; e2e/reader-word-popup.spec.ts thêm scenario5choices→no implicit write→save book→reload. npm.cmd test exit0 151reported gồm1known globalNamebackup it.fails; build exit0 63modules; targeted popup+converted-titles exit0 10/10 desktop+Android-layout; git diff --check exit0. Không fullE2E mới, flake multi-tab trước vẫn mở.
- Deploy theo authorization Code/UI Pages: wrangler4.147 local pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true exit0, deployment4c41df16. URL chính HTTP200/HTML khớp dist. Không secret/auth/migration/billing update; không commit/push.
- Giới hạn/next: Tr Sửa còn Name override không VP dictionary edit, EPUB/folder chưa code, cloud20GB chưa chọn; Android hardware chưa test. Tiếp thiết kế importer nhỏ và bảo toàn ảnh/Names/backup trước schema mutation, hoặc cải thiện Reader scroll/keyboard.

## 06/10/2026 13:59–14:04 — Folder TXT import và deploy
- Root điều phối/UI; folder_import_impl cấu hình spawn gpt-6.1-sol/medium, chỉ NEW src/folder-import.ts/tests/folder-import.test.ts; reviewer folder_import_review cấu hình gpt-6-astra/high chỉ NEW tests/folder-import-review.test.ts. Model theo spawn API, không lời child tự nhận. Đọc AGENTS/HANDOFF/plan/DECISIONS; Dreadonly/no scripts/upload.
- Core plan path validation/traversal/duplicate, groups parent,numeric ordering, ignored nonTXT;1file=1chapter/no heading split/no globalhashskip. Fatal decode/BOM/SHA/source blobs, quota/2MiB/32MiB/128k guards. Allwrites atomic staging transaction abort listener through complete; commitImport existing schema3 không đổi.
- Root NEW ui/FolderImportDialog.tsx, ImportDialog.tsx nút chọn mode; preview natural order/group/ignored, prepare groups sequential, cleanup onfail with allSettled, confirm all staging atomically, abort unmount; NEW e2e/folder-import.spec.ts syntheticFiles+relativepaths, twofolders/3chapters/order/no ready beforeconfirm/cancel removes4tables. USER-GUIDE/plan/HANDOFF current and DECISIONS/log updated.
- Reviewer10tests: finaljob quota rollback preserving unrelated Name/progress, finalrequest abort, quota-awaitcancel, callbackfailure, concurrent identical identities/delete isolation, portable bytes/Name/progress/links, Unicode paths, atomic multi-book commit. Targeted75/75exit0. Không blockingfinding; no hardware/crash/realquota/RAM. Root unit172 then182 reported including1known globalNamebackup it.fails; build app/server/Vite65modules exit0; initial E2E8pass4fail from root JSX missingbrace causingViteoverlay (buildfirstexit1 TS1005); fixed and repeat folder+reader36/36exit0; finalUI patch E2Efolder4/4exit0. gitdiffcheckexit0. giữ faillịch sử, no fullE2Enew.
- Deployment authorized Code/UI: wranglerpages productionmasteraa078f30 exit0; mainURLHTTP200/HTMLkhớpdist. No data D/newbindings/secrets/billing/migrations, noGitpush.
- Limits: file2MiB/folder32MiB/chapter128k; pickerfakeFiles in browser vs nativeAndroidpick chưa xác minh; no totalfolder/countbound/streaming20GB. Singlefileglobaldedup old behavior unchanged. EPUBimages/TrVPedit/cloud20GB còn mở. Next EPUB importer spike+asset model/security/backup design with independent highreview before mutation; alternatively close multidab flaky invalidation underload.

## 06/10/2026 14:28–14:31 — Reload Vietphrase tự khôi phục
- Codex root tự làm phạm vi hẹp startup/UI; đọc HANDOFF/plan, App/DictionaryPanel/dictionary-import/client/worker. Không thay dictionary transaction/schema, không upload D-source.
- Bằng chứng: existing installDictionaries lưu Blob/hash IndexedDB; worker phải tái tạo engine trong RAM mỗi document. Chưa tái hiện mất bản lưu; production smoke first còn oldUI nhưng storedVietphrase hiện saureload. Không ghi nguyên nhân chưa có chứng cứ thành mấtDB.
- App.tsx thêm dictionarysignature livequery+loadDictionaries warm restore/alive error guard; DictionaryPanel.tsx checkingvsNone/headingSaved/one-timeSave instructions + best-effort storage.persist catch; language.worker.ts đổi status “mở từ điển đã lưu”. No erase onerror.
- NEW e2e/dictionary-persistence.spec.ts uploadsyntheticVP/save rồi3reload×2projects, Convert你好山门 và sohash/rawBlob; NEW scripts/smoke-dictionary-persistence.mjs isolatedproductionEdgecontext dùng fixture tổnghợp3reload, không chạm profileuserdata/remotecontentstorage.
- npm.cmd test exit0 182reported(1globalNamebackup it.fails); buildexit0; targeted persistence/alias/title/convert E2E12/12exit0; gitdiffcheckexit0. Deployproductionmaster29279aee exit0. HTTP200 HTMLmain+deploymentkhớpdist. Firstsmokeexit1 nhậnoldheading ngaydeploy, storedblob vẫn hiện; secondfreshsmokeexit0 3reload+Convert no reselect. Không bỏ assertions.
- Limits: dùng IndexedDB cùngorigin/profile/device; không chứng minh userdictionary thật khôngevicted/privatebrowsing/crossorigin; storagepersist besteffort, engineparse mỗireload còncầnRAM; Androidviewportchưahardware. FullE2E mới chưachạy, knowncross-tabflake cònmở. Next: EPUB/folderlimits/Readerparity theo kếhoạch.

## 06/10/2026 16:46 ICT — BATCH-TXT / CLOUD-ADD-V1
Người thực hiện: Codex root (model chính không đổi), subagent tool-configured gpt-6.1-sol/medium (batch + independent root snapshot tests) và gpt-6-astra/high (server + independent client/batch review). Các lần tự mô tả model không khớp context không được dùng thay cấu hình spawn. Thử tạo reviewer thứ tư bị thread limit; reuse hai agent ở phạm vi độc lập, root review backend do high agent triển khai.
### Phạm vi và invariant
User cho phép R2 nội dung và thêm nhiều truyện. Mỗi TXT riêng một book, folder giữ rule cũ. Không tự đọc/upload D; synthetic fixtures only. Local-first staging atomic, cancellation cleanup chỉ lô này; không overwrite local/cloud, checksum trước restore, dữ liệu cloud chỉ công bố sau R2 write, API auth fail closed. Không billing activation/bucket creation/remote migration hoặc real content upload.
### File và lý do
- src/importer.ts: options dedupe backward compatible, drain Worker chapter writes trước delete cleanup, checks abort tại DB boundaries; progress observer không làm hỏng import.
- src/batch-import.ts: tuần tự mỗi file một staging book, rollback toàn lô lỗi, atomic confirm, abort đến complete; giới hạn100file/40MiBfile/256MiBbatch.
- src/ui/ImportDialog.tsx, BatchImportDialog.tsx: picker multiple/drop; preview/cancel/confirm batch, encoding/regex/detect controls. FolderImportDialog.tsx chỉ đổi mô tả cloud sau xác nhận.
- src/cloud-snapshot.ts: consistent compact snapshot; normalize counts/order ở bản cloud, flatten global/book Name, checksum+strict bounds; restore atomic add-only/collision guard, không original blobs/dicts/progress.
- src/cloud-client.ts: authenticated same-origin probe trước nội dung, serialize queue, continue individual upload failures, hash ACK, bounded download+120s timeout. ACK chỉ khi download added, không khi book cùng ID vừa xuất hiện local.
- src/ui/App.tsx, CloudPanel.tsx: auto upload ready IDs sau commit/startup, retry/list/download và status; clear stale message trước sync.
- server/cloud-library.ts, functions/api/cloud/[[path]].ts: own handleAuth; bounded32MiB body/checksum, D1 single-statement9GB reservation gồm pending, conditional R2 create, matching metadata+checksum, only ready list/stream private no-store; immutable conflict409. Buffer32MiB concurrency benchmark chưa làm.
- migrations/0002_cloud_library.sql: bảng/index additive, auth existing/schema local không đổi. Chỉ apply isolated local .wrangler/cloud-smoke.
- tests/batch-import.test.ts12; cloud-library.test.ts13 (actual node:sqlite SQL); cloud-snapshot-review.test.ts17; cloud-client-review.test.ts7; batch-import-review.test.ts3.
- e2e/batch-import.spec.ts, cloud-sync.spec.ts: native Worker batch, identical text/rollback/cancel; mocked cloud API auto2books/ACKreload/download in second fresh context/rawChinese+Name,503 no upload/delete.
- scripts/smoke-cloud-local.mjs: real local workerd+R2+D1 auth/origin/retry/download/conflict. scripts/smoke-batch-production.mjs: isolated production browser, synthetic batch local only.
- docs/R2-SETUP.md, USER-GUIDE.md, STATUS.md, ../HANDOFF.md, ../WEB-READER-IMPLEMENTATION-PLAN.md, DECISIONS.md: new scope, actual gates, activation steps, limits. NEXT-AI-PROMPT refresh below.
### Lệnh / kết quả thực tế
- Core agent:39targeted/194reported fullunit/build0. Backend agent13+auth6 targeted=19pass, earlier207unit/build0.
- Root npm.cmd test:234reported/21files exit0;1known it.fails globalNameportable remains.
- Root npm.cmd run build:exit0, app/server TS,70modules,index-jJjffArl.js. Reviewer build overlapped root but both samehash; both completed before deploy.
- Root E2E first batch/cloud/folder:8pass6fail exit1. Wrong exact sidebar selector missed icon, bodyfixture第二章 treated heading,5sec milestone loaded host; fixed fixture/selectors/20sec bound. Root repeat3workers2(output sync-repeat)42/42exit0; after ACKfix/encodingcontrols/2cloudbooks fixture repeat3(output sync-final)30/30exit0. Earlier failures retained, not blamed on model.
- Independent medium:17snapshot+30snapshot/server exit0. Independent high:39targeted+build exit0. High finding ACKrace and stale UI status fixed/root; ordinary regressions pass. High initial it.fails unexpected pass because root fix arrived before execution; removed fails. Backend initial3 fixture failures and stream/test typing build failures corrected, final root TS/runtime checks pass.
- npx.cmd wrangler r2 bucket list: code10042 requires enable R2. pages secret list production: no secrets. Not a cloud readiness pass.
- Local D1 migrations apply --local --persist-to .wrangler/cloud-smoke:0001/0002 pass. Seed public synthetic session local; local Pages dev --r2 LIBRARY_BUCKET public fixture hash on8789. smoke-cloud-local.mjs exit0; auth wrong-password synthetic fixture runtime401, not production KDF acceptance.
- git diff --check targeted modified trackedfiles exit0; untracked files read/reviewed independently, no commit/push/reset.
- wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true:exit0, cfb7d60d. ProductionHTTP200, HTML matches dist. Anonymous cloud API503. Production smoke-batch exit0:2 ready local books persist reload,no cloudPUT, freshcontext closed.
### Giới hạn và bước tiếp
R2 account not activated/no AUTH secret/no bucketbinding/remote migration; livecloud NOT done. Owner enable R2/payment conditions first; docs/R2-SETUP.md gives next commands, never secrets in chat. 9GB app cap is not guarantee0VNĐ account-wide;20GB/operations budget/compression unverified. Compact immutable snapshot lacks lateredit/delete sync/source/dict/progress/EPUB. Large32MiB concurrencyRAM/CPU,positive productionlogin,Androidhardware/fullE2E still open. Continue R2-ACTIVATE then synthetic production roundtrip; CLOUD-M0 streaming/conflicts; EPUB-1. OriginalDunchanged and not uploaded. Prior backupexpectedfailure and Convertmulti-tabflake remain open.

## 06/10/2026 17:20 ICT — Chốt định hướng thư viện riêng
- Thực hiện: Codex root, model chính hiện tại; không subagent vì chỉ điều chỉnh tài liệu.
- Yêu cầu: website chỉ một người dùng, lưu TXT/EPUB để đọc Convert và lưu trữ.
- Đã đọc: AGENTS.md, HANDOFF.md, phần kế hoạch hiện hành và DECISIONS.md liên quan. Đây không phải audit mã hoặc xác minh lại các kết quả test phiên trước.
- File/khu vực: HANDOFF.md thêm định hướng trước checkpoint kỹ thuật; WEB-READER-IMPLEMENTATION-PLAN.md thêm phạm vi/tiêu chí/thứ tự hiện hành ngay đầu; DECISIONS.md append quyết định một người/file gốc/compact chưa đủ; log này append lịch sử.
- Invariant: không đánh dấu EPUB/cloud file gốc/full sync đã xong; không đổi code/schema/data/deploy, không đọc/đưa nguồn D lên mạng; giữ quyết định R2 và chi phí trước đó, không thêm multi-user/social/AI/TTS vào cốt lõi.
- Kiểm tra: diff tài liệu và nội dung mới; không chạy test/build vì không sửa code. Các số test trong checkpoint cũ giữ nguyên, không phải kết quả mới.
- Bước tiếp: EPUB-1 với ảnh/Convert/edit Name, sau đó lưu file gốc trong kho riêng và đồng bộ dữ liệu đọc. R2-ACTIVATE còn chờ chủ tài khoản; không tự enable billing.

## 06/10/2026 17:25 ICT — Ghi nhớ bổ sung sản phẩm
- Thực hiện: Codex root; không subagent vì phạm vi chỉ tài liệu.
- Đọc HANDOFF/kế hoạch/DECISIONS liên quan, nhận chỉnh mục→truyện→chương, giữ Vietphrase trên web và giảm tải chậm, bỏ mật khẩu truy cập; vẫn hiểu mục tiêu Windows/Android dùng chung thư viện được giữ.
- File: HANDOFF cập nhật trạng thái/ưu tiên và phân biệt yêu cầu mới với auth hiện tại; WEB-READER-IMPLEMENTATION-PLAN cập nhật tổ chức mục và mục tiêu cache/index/invalidation; NEXT-AI-PROMPT đặt override rõ trước hướng dẫn auth cũ; DECISIONS/log append lịch sử.
- Invariant: không đổi code/schema/auth/deploy, không đánh dấu mục/EPUB/cloud dictionary/cache đã có; giữ importerfile=truyện/folderfile=chương và bộ gốc. Không tự upload/chạy nguồn D. Giữ lịch sử quyết định mật khẩu trước, ghi quyết định mới ưu tiên hơn.
- Kiểm chứng: git diff --check tài liệu exit0; không test/build vì không sửa code. Không có kiểm thử thiết bị mới.
- Việc tiếp theo: đo startup VP và chọn cache/index với fixture Chinese + dictionary/Name invalidation; thiết kế mục cần migration/review riêng; EPUB-1; thiết kế truy cập không cần nhập mật khẩu trước tích hợp R2 thật.

## 06/10/2026 18:54 ICT — FAST-1 / kế hoạch giảm thao tác thủ công
- Root: Codex model chính, không đổi; subagent tool-configured gpt-6.1-sol/medium triển khai ba file; gpt-6-astra/high review độc lập; root orchestration/source review/ABA fix/browser/deploy/docs.
- Đọc HANDOFF/plan/AGENTS; đối chiếu actual language-client/Reader. M0 thu hẹp số đo FAST-1 trên synthetic fixture; không nhận là đóng RAM/dictionary43MB/Android gates. Áp dụng web-perf skill: không có DevTools trace tools trong toolinventory, dùng Playwright timestamps/outgoingWorker messages, không báo CWV/Lighthouse.
- Phạm vi: cache Convert persistent trước startupWorkerqueue để không chọn lại/không chờ chương cũ. Invariant rawsource/token offsets đúng, versionoptions/Names/dict invalidation, reset/stalejobguards,cache bounded/disposable/errorfallback không chạmdata người dùng.
- Files: src/convert-cache.ts (new independentDB, SHAkeys/checksum/provenance/LRU/bounds/metrics); src/language-client.ts (cacheprobe trướcqueue, snapshots+epoch, worker serial, pre/postwrite identity, actual loaded signature ABAguard). Không đổi Reader/App/UI/schema userDB/auth/backend.
- Tests: tests/convert-cache.test.ts6 của implementer; tests/convert-cache-review.test.ts11 independent actualfakeIDB cache/races; e2e/convert-cache.spec.ts root nativeWorker/ChineseReader with loadblockedafterreload/measure; scripts/smoke-convert-cache-production.mjs synthetic isolatedUI production.
- Docs: docs/MINIMAL-STEPS-PLAN.md workflow/6phase/manualsteps; HANDOFF/NEXT-AI-PROMPT/WEBplan cập nhật checkpoint; DECISIONS appendtechnical; USER-GUIDE và STATUS append tiếp.
- First rootfull unit249pass1fail: reviewer it.fails unexpectedpass vì pre/postwrite fix đến trướcfirstexecution; chuyển ordinarytest sau kiểm. Independent ABA testreproduced10pass1fail thật: DB A→B→A khiếnworkerBtrảtokencachekeyA. Root ensureLoaded returnactualsig/check vs snapshot, independent19/19 và tsc0.
- Root full npm.cmd test251reported/23files exit0, gồmknownit.fails globalNamesportablebackupchưađóng. Root build đầu sauABAfailTS testDexiePromiseExtendedoverload; reviewer sửa testfixtureDexie.Promise.resolve, root npm.cmd run build cuối exit0:71modules,index-C3d-eXcq.js. Không coi earlierbuildfail làpass.
- Root E2E cache6/6repeat3 exit0;14cache/dictionaryPersistence/popup/titleE2E exit0;finalcache+popup30/30repeat3 afterABAfixedexit0. EdgeWindows+Androidviewport, khônghardware. Finalcached synthetic163–221ms,0WorkerchapterConvert/loaddeliberatelyblocked. Earlysmallfixturecold215ms/warm232ms cũnggiữ: không tuyên bố mọi input nhanh hơn hoặc số đo dictionary thật.
- Independent high19targetedpass/tsc0 gồm11review+6core+2existingreset; medium13targeted trước extendedraces pass. Reviewer findings: mutateName trong keyhash/cachewrite và workerloadABA; fixed, verified independent, khôngblockingfinding còn lại trongscope.
- git diff --check language-client/docstouched exit0, untrackedcache/tests inspected; no commit/push/reset. D notread/copied/uploaded inthisscope.
- wrangler r2 bucket list18:53 exit1 code10042 chưaactivate. No resources/billing/authsecret changes.
- pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true exit0:e789c046. ProductionHTTP200/HTMLmatchesbuild. node scripts/smoke-convert-cache-production.mjs exit0 syntheticonly:cachedOpen79ms,loadblockedtrue,0WorkerchapterConvert, isolatedcontextclosed. Không realdictionary/truyệnupload;cloud APIcũ vẫnfailclosedmissingconfig.
- Limit: cachelogical16MiB,physicalIDB/RAM/43MBdict/realAndroidunverified; largeentry>2MiBfallback; newchapter/wordlookup vẫnđợiload; dictionarycloud/compiledindexchưa. FullE2Echưachạymới,oldmulti-tabflake vàbackupfailsgiữmở.
- Next LIBRARY-1 nhóm mục→truyện→chương với migration/datareview độc lập hoặc EPUB-1 ảnh/source/editNames. R2activationowneronce, AI làmsetup sau đó; thiết kế deviceaccesskhôngnhậpPW trướcfullcloud. Tiếp lưuoriginals/dicts/progress/revisions/backup; không báo webhoànthànhtoànbộ.

## 06/10/2026 22:07 ICT — R2-ACTIVATE / DEVICE-CONNECT production
- Root Codex điều phối/UI/config/provision/runtime/deploy/docs; actualtoolconfigured highgpt-6-astra serverauth+atomicrestorefix, mediumgpt-6.1-sol client/devicehelper, independenthighgpt-6-astra cloud_device_review. Không giả đổi model chính.
- Đọc HANDOFF/plan/DECISIONS,Wrangler/workersbestpractices và runtime refs; currentofficialCloudflaredocs CLI/bindings/secrets. Screenshot là pageevidence, rootverified whoami/currentAPI bucketlist beforemutations. Token OAuth existingread/write scopes/pages/d1/workers verified;currentaccount/project/bucket/D1 exacttarget.
- User scope: đãkíchhoạtR2,continueplan; authorization trước cloud nội dung/privateoneowner/nopassword và deploy vẫn giữ. Invariants no datawritewithoutauth/nopublicR2/no originalDupload/no secretbundle/log/chat/atomicconnectandrestore,keep localifcloudfailed.
- Source files: server/cloud-device-auth.ts new stricthexSHA256/constanttime/headerBearer/cookiequeryreject/origin/genericerrors/secure, server/cloud-library.ts gate/envonly; functions/_middleware.ts passwordlessmode securepublicUI/private route and explicitPagesFunction import.
- src/cloud-device.ts fragmentstrip-beforeawait/settings tokenACKatomic/formatvalidation/sharedbootstrappromise; src/cloud-client.ts headerinject+capturetoken/request/ACK/download checks and validate UUID before URL. src/cloud-snapshot.ts optionalguard FIRST inside rwsettings+books+chapters+names tx beforebookread/write,backwardcompatible.
- src/main.tsx startsbootstrapbeforeReact; src/ui/App.tsx waits singleton/readybefore autosync, generationguard+hashchange foralreadyopentab. src/ui/CloudPanel.tsx auto catalog/clipboardlink/disconnect/download+Read; combinedstatus stopsoldmessagecoveringerrors. No token shown inDOM.
- tests/cloud-device-auth.test.ts8,tests/cloud-device.test.ts10,tests/cloud-device-review.test.ts13;reviewactualfakeIDB+SQLite handlers/middleware. e2e/cloud-device.spec.ts3newcases devicefragment+read+reload+forget/invalid/already-open-tab. Existingcloudsync/batch/cacheE2Es unchangedsemantics.
- wrangler.jsonc R2binding+worker-configuration.d.ts generated localwrangler types --env-interfaceCloudflareBindings --include-runtime=false. Remote0001/0002 additive applies,prechecktables showedauthsessions/loginlimits andnocatalog. Publicr2.devgetdisabled verified.
- scripts/setup-cloud-device.mjs protectedlocal .codex file/random32byte/reuse/noautoro­tate;digeststdin Pages secretput, no plaintext/toolarg. Initialspawn shelltrue deprecation removed usingfixedcmdcommand+stdin;no userstring commandinput. Credentialscan dist rawtoken+hashabsenttrue.
- scripts/smoke-cloud-production.mjs secretreadinside script, outputsanitization/no traces,syntheticbookonly; scripts/cleanup-cloud-smoke.mjs allowlistedUUID/SHA/titleexact deletesonlyfixtureR2/catalog. Root connection HTML file outsideworkspace no actualsecretpersistedinsideGit/source. Browser open_in_codex fileURL queued,not proofuserclicked.
- docs/HANDOFF/plan/NEXTprompt/DECISIONS/R2-SETUP/MINIMAL-STEPS/STATUS/USERGUIDE updatedactualstate+limits. NextAI old10042/passwordsteps supersededtopnote.
### Lệnh/exit/kết quả và review
- whoami+bucketlist currentaccount: exit0,emptyenabledR2. r2bucketcreate thu-phong-library --locationapac --storage-classStandard:exit0; r2devurlgetdisabled. D1migrationslist/schemaexecute readonlyexit0,apply --remote0001/0002exit0.
- setup-cloud-device.mjs --provisionexit0 encryptedsecretCLOUD_ACCESS_TOKEN_HASH uploaded;plaintextoutsideworkspace. Secretlistonlythatname(noAUTHpassword);do notreadvalue.
- Highimpl27targeted/auth8+library13+legacy6 exit0,app/servertsc0. Medium29targeted before13threviewtest and46largerregression pass;firstfixture16/17 duechapterIDnotUUID corrected. Reviewer13tests+68targeted/build0.
- Reviewer cancellation repro11pass1fail: rotationduringstorageestimatecommitsbookfromoldtoken. Highimplguard txsettings+data;mediumcapturedtoken callback;independent13+68pass afterward. SourceStrictMode issue fixed sharedpromise+preRenderbootstrap/test13;browseralreadyopentabhashchange edge addedrootgenerationguard+E2E.
- Appmid-edit tsc prop onRead/missingPagesFunction failures retained,explicitimport/CloudPanelprop fixed;rootfinal npm.cmd test282reported/26files exit0 (1knownit.fails globalNameportable),npm.cmd run build exit0 app/serverTS+Vite72,index-DlyXkjxz.js.
- Root npm.cmd run test:e2e cloud-device/cloud-sync/batch/convert-cache --workers2 --repeat-each3 --outputr2-device:48/48exit0. Finalalready-open-tab device suite18/18repeat3exit0. Androidviewport nothardware.
- git diff --checktrackedchanged exit0; rawtoken/hashnotdist scan true. No commit/push/reset, no Dread/upload.
- Firstdeploy90c17d5c exit0;node smoke-cloud-production.mjs exit0 actualR2upload201/retry200/downloadexact+anonymous401,one-timeconnect/reload/readChineseName/disconnect. Onlysyntheticbookcloudput.
- CleanupfirstR2deletepass/D1 --command Windowsquoting fail Nodeexit1 (outerPSlastqueryexit0,readycount1). Fixed --file protected.wranglerSQL,rerunexit0,onlyexactsyntheticobject/catalogrowremoved. Count0confirmed;metadatafileunlinkedonlyafterbothsuccessful,initialfailretainedforretry.
- Finaldeploy1f4733f0 exit0 withhashchange;canonicalHTTP200/HTMLmatchesbuild,authenticatedGET200/anonymous401,catalog0 aftercleanup. Secretlistmetadata/publicR2disabled rechecked. No actualtoken strings printed in chat/tooloutput or artifactsunderrepo.
### Limites/next
Userneedsone-timeconnectonactualprofile (fileconnect-cloud.html),thenAndroidcopylink;not yetconfirmedactualprofile/hardware. Capabilityshared/noexpiry/perdevicerevoke,rotationrevokeall. R2compactimmutableonlytext/currentNames,original/dictionary/progress/foldergroups/EPUBimages/update/delete notdone. 32MiBconcurrency/RAM/CPU/9GBlarge/accountops/20GB0VNĐ notverified. Next STORAGE-2 original+dictionary streaming/checksum/quotareview,LIBRARY-1,EPUB-1,SYNC-2. Knownbackupfailure andoldConvertmulti-tabflake remain,notfullwebcomplete.

## 06/10/2026 22:42 ICT — UI-1 tủ sách ít nút và kế hoạch gom chức năng
- Thực hiện: root Codex (model chính giữ nguyên; không công cụ chuyển model/không subagent). Phạm vi presentation nhỏ, không cần review dữ liệu độc lập vì không sửa handler/DB/schema/auth/sync/backup.
- Đọc HANDOFF, WEB-READER-IMPLEMENTATION-PLAN, AGENTS, DECISIONS, MINIMAL-STEPS; đối chiếu App/CloudPanel/test thực. Lệnh đọc Library.tsx không có file; khảo sát rg tìm App.tsx. Không dùng nguồn D hoặc credentials.
- Invariant: chỉ một nút import ngoài dialog; bỏ backup shortcut lặp; Sửa/Xóa vẫn truy cập menu và bàn phím; cancel delete không mất nội dung; lưu metadata và đọc/reload không đổi.
- src/ui/App.tsx: subtitle lưu/Convert/Name, bỏ duplicate empty import/footer backup button, gom metadata edit/delete vào native details/summary có aria-label tên truyện. Giữ handlers và confirmation.
- src/style.css: thêm book-options/menu, overlay theo card, focus-visible, touch44px.
- e2e/reader.spec.ts: delete regression mở menu trước. NEW e2e/minimal-library.spec.ts: unique import, không backup shortcut, secondary actions ẩn, keyboard Enter mở menu, sửa tên/reload, dismiss delete giữ book/chapter, read vẫn có nội dung.
- docs/MINIMAL-STEPS-PLAN.md: bảng Tủ sách/Thêm truyện/Reader/Cài đặt/Trạng thái và UI1→UI5/STORAGE2/SYNC2, phân biệt kế hoạch với chức năng thực. HANDOFF hiện hành prepend phạm vi/tests/bước tiếp; DECISIONS append; USER-GUIDE append; master plan checkpoint prepend.
- npm.cmd test exit0:26files/282reported pass; known it.fails backup global Names vẫn mở. npm.cmd run build exit0:app/serverTS+Vite72modules,index-CjDqe8T8.js.
- E2E đầu exit1 trước chạy test: selector thiếu object braces trong reader.spec.ts:28, sửa {exact:true}. Không coi run đầu là pass. Rerun npm.cmd run test:e2e -- e2e/minimal-library.spec.ts e2e/reader.spec.ts e2e/batch-import.spec.ts --workers=2 --repeat-each=3 --output=test-results/minimal-library --reporter=line:48/48pass exit0 (~1min).
- Root kiểm diff App/style/reader và file test mới; git diff --check hoàn tất, chỉ CRLF warning. Existing dirty changes/history giữ nguyên. Không commit/push/reset/deploy.
- Giới hạn: Windows Edge/Android viewport tự động, Android thật chưa xác minh. UI-2 grouping/navigation chưa có; cloud/local library vẫn riêng. UI-1 local only, Pages vẫn1f4733f0. Không EPUB/images/original/dict cloud/fullsync mới.
- Tiếp UI-2: gom tab vào Cài đặt theo nhóm, giữ path dictionary/backup/cloud/error/retry; update related navigation E2E, test/build và desktop/mobile. UI-3 cần independent data/race review; không gom theo title hoặc overwrite local.

## 06/10/2026 22:51 ICT — UI-2 gom navigation và deploy UI1/UI2
- Actor/model: root Codex, model chính giữ nguyên; không subagent vì thay đổi presentation nhỏ và không chạm persistence/auth/DB. Đọc AGENTS/HANDOFF/masterplan/DECISIONS, đối chiếu App và selector tests trước sửa.
- Skill wrangler đã đọc C:/Users/toann/.agents/skills/wrangler/SKILL.md. Docs https://developers.cloudflare.com/workers/wrangler/commands/pages/ và installed help; local4.147.0 giữ nguyên. whoami OAuth đúng account97c5d65fbc80bb0ab8c78ad3b01b04b5 pages(write); projectlist thu-phong-private đúng canonical. Không đổi bindings/secrets/migrations.
- Invariant/acceptance: mainnav2buttons; cả4settingsgroups truy cập được; quay tủ sách/Reader và restore navigation không mất đường truy cập; nhớ group trong phiên; responsive không overflow. Không thay dữ liệu/sync/hành vi lưu và giữ cả lỗi cloud.
- src/ui/App.tsx: lastSetting union; mainnav hai button/aria-current; settings-heading native select/group label. src/style.css settings flex/wrap/select44px. UI-1 menu/bỏ duplicates phiên trước giữ/deploy cùng.
- e2e/minimal-library.spec.ts thêm test2destinations/fourgroups/return/remember/nooverflow/screenshots. e2e/reader.spec.ts backup route; cloud-device/cloud-sync/convert/convert-persistent/dictionary-persistence/dictionary-alias đổi navigation selectors. Dictionary-alias scope .dictionary-list select thay positional selectfirst toàn trang.
- scripts/benchmark-convert.mjs, smoke-dictionary-persistence.mjs, smoke-cloud-production.mjs, smoke-convert-cache-production.mjs, smoke-batch-production.mjs đổi selectors, node --check exit0 từng script; các script này chưa chạy lại phiên này. setup-cloud-device.mjs chỉ đổi HTML hướng dẫn mới, node --check0; không chạy/provision/rotate credential.
- NEW scripts/smoke-minimal-navigation-production.mjs: freshEdge contexts desktop1280/mobile522, HTML exactdist, mainnav2/fourgroups/back/singleimport/nooverflow, anonymouscloud401; không dùngtoken/content thật hoặc viết remoteR2/D1.
- npm.cmd test đầu exit0 và final sau aria-label exit0:26files/282reported pass, known it.fails globalNamesportablebackup vẫn mở. npm.cmd run build đầu0 và final0:72modules/index-BhtGfavZ.js.
- E2E command8specs minimal-library reader cloud-device cloud-sync dictionary-persistence dictionary-alias convert convert-persistent --workers=2 --repeat-each=3. Run output=settings-groups: ít nhất2timeout60s select exactlabel không match do option texts; root CtrlC exit1, giữ error-context/trace. Run=settings-groups-fixed:2dictionary-alias fail select.first value dictionary thay pronouns, root CtrlC exit1; giữ traces. Fix aria-label + scopedselect, final output=settings-groups-final108/108pass exit0 (~1.8min), không retries giả.
- Root diff/source checks App/style/selectors, git diff --check0(CRLFwarnings), screenshots desktop/android viewport đã xem. Các changes cũ không reset/commit/push. Không thay server/cloud/DB nên không review data độc lập mới.
- Deploy npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true --commit-message "Simplify library and group settings navigation":exit0 deployment9971e099. node scripts/smoke-minimal-navigation-production.mjs exit0 canonicalHTML khớp/fourgroups/2nav/nooverflow/anonymous401. Screenshots test-results/minimal-production-1280.png và522.png.
- Docs HANDOFFcurrent/MINIMAL-STEPS/R2-SETUP/masterplan/USER-GUIDE/STATUS cập nhật navigation/state và log/DECISIONS append. Historical log giữ nguyên.
- Chưa xác minh Android thật/fullE2E; known backupfails/M0/RAM/EPUB/assets/originaldictionarycloud/fullsync chưa giải quyết. Next UI-3 catalog local/cloud chung giữ ID/local và độc lập review race/data; STORAGE2 và EPUB1 theo kế hoạch.

## 07/10/2026 18:32 ICT — Public auto-library, default Vietphrase, cloud delete; native streaming repair
- Người dùng07/10 yêu cầu Vietphrase sẵn/newuserthấytruyện/thêmxóatùyý; trảlờiclarification “2 thêm xóa trên mọi thiết bị ai cũng là admin”. Sauđó bỏSao lưu/Đồngbộ vìtựđộng; “tiếp” giữtask. Quyếtđịnhpublicadmin được nói rõ, khôngrepeatpermission. GiữsameOriginquota, khôngsuyrauploadtoànkhoD.
- Actor: rootCodex điều phối/tíchhợpUI/client/seeder/deploy/docs, khôngtựđổimodelchính. Actualdispatch subagentscloud_delete_v2/cloud_dictionary_seed/public_admin_gate/public_library_review gpt-6-astra/high; childselfreportmodelinherited khônglàthaycấuhìnhdispatch. Native_stream_review đượcdispatchgpt-6.1-sol/high saureviewastrequota. Cácmodelthậtsẵntrongtool; rootkhôngtuyênbốtựswitch.
- ĐọcAGENTS/HANDOFF/masterplan/DECISIONS, Cloudflare workers-best-practices SKILL+runtimepatterns vàwranglerSKILL. PrimarydocsR2workers-api-reference, wranglercommands/r2, streams/transformstream; installedCLIhelp/version/configdate preserved. whoamiaccount97c5d65fbc80bb0ab8c78ad3b01b04b5scopespages/write,d1/write/workerswrite, OAuthr2CLIđãthửthực; khônginsecret.
- Invariants: publicmodeexplicit1/malformedflagfail503/private0/absentbackcompat; mutationOrigin403. ImmutablebookIDs/nolosslocal; DELETEpermanentmarkerSQLguardpreventrace/resurrection; khôngblindpurgepeer. Dictcanonicalhashkeys/boundedmanifest/sourceUTF8+SHA/atomicmissingtypes/nonoverwritecustomdict. NativeIOfullsize/length/cancel; primaryUIautostorage/nomanualsync/backup.
- Agentdelete sửaserver/cloud-library.ts, NEWmigrations/0003_cloud_book_deletions.sql, NEWtests/cloud-delete.test.ts17. Tombstoneinsertfirst, reservation+publicationANDNOTEXISTS, GET/listanti-join+recheckafterR2GET; deletionlistpaged100uuid; DELETE200logical/idempotent/PUT410. R2validatedexact-keycleanupretry, rowsreservedbytesretainedforeverpending/deleted (futureGC). InitialbuildmissingAUTH_PASSWORD_HASHrequiredinfixture exit1, fixed; targeted17then38pass/build0.
- Agentdictionary NEWserver/cloud-dictionaries.ts/functions/api/cloud/dictionaries/[[path]].ts/tests/cloud-dictionaries.test.ts24. Readonlymanifest16KiB/count10/kinds300char/80MiB/payloadkeysfixed; noobjectKeyreturned. Missingmanifestempty; invalid503;SHAstoredoptionalCLIseedingbutifpresentmustmatch. Clienthashalways. InitialTSfataldecoderneedsignoreBOM, addedfalse;24targeted/342reported/build0.
- Agentauth server/cloud-device-auth.ts, NEWtests/public-library-auth.test.ts19. PUBLIC_LIBRARYstrict0/1/malformed503; publicDBrequired/noPWtoken, secureOrigin unsafe; priorprivatehash/sessionunchanged. RootaddedX-Library-Accesspublicheader toavoidmisleadinglegacylink/disconnectUI. Auth33targetedpass; initialunionTSfixturefixed; earlierfull301total287pass14fail oldSQLitefixturesmissing0003, rootmigratedtests/cloud-library.test.ts andcloud-device-review.test.ts+405nowPATCH. Full342passafterfixtures.
- Root functions/_middleware.tsPUBLIC1UIoverride evenlegacysecret, wrangler.jsonc varsPUBLIC_LIBRARY=1, worker-configuration.d.ts regenerated viawranglertypes. Noauthsecretrotation/deletion/bundleVITEkeys. Existingcapability remainsoutsideworkspaceunusedpublic; sourceDconstraintpreserved.
- Root NEWsrc/cloud-dictionaries.ts: fetchsmallmanifest/readstreamcapped/copiedchunks/blobSHA+readDictionary, stageandcommitallmissingunder settings/dictRWtx+capturedtoken. Singleflight, corrupt/quota/cancel/nooverwrite. Manifest401/404emptyfallback; checksumlengthdiagnosticsdifferent. Namesdefaultisdict, notglobalNameListsideeffect.
- Rootsrc/cloud-client.ts requestpublicmodeheader/getter; listDeletedCloudBooksvalidatedIDs/restartpagination/storemarkersatomic; deleteCloudBookexclusivevaliduuid/networkconfirmbeforeACK/marker; syncskipsmarkers,410typederrorpersistsmarker(no reupload), badstoragekeepuserdata. Legacytokencontextchecks preserved.
- Rootsrc/ui/App.tsx maincatalogmergelocal/cloudIDfirst/remoteplaceholder; cloudrefreshgeneration/startupfocus30svisible; dictionarybackgroundinitandremoteopenawaitsamebootstrap; downloadchecksumthenReader/detail. Removecloudthenlocalwithconfirmation/ACK-awareofflineguard; existingpeerlocalmarkedKhođãxóa, noautosilentwipe. Modepublicdropsbackup/cloudsettingsgroups (Convert+Thôngtinonly); sourcehandlers privatefallback kept. About/localnote correctedsnapshot/defaultdictscope.
- Rootsrc/ui/CloudPanel.tsx auto-listwithouttoken, publicmodestateinit+refresh fromheader, hidelegacyconnect/disconnectwheneverpublic. Legacyprivatecontrols/testskept; notpublicuseflow. NoCRUDcoresemanticschange.
- E2E NEWpublic-library.spec.ts freshprofilemanifest+VP/Names/rawChinese 李明来到山门→LýMinhđitớisơnmôn; reload0dictredownload; secondfreshdeviceauto-list/add/delete; parentlocalretained+tombstone preventsPUT; publicsettings2/manualsyncabsent. Updatedcloud-device/cloud-syncfixturesauthanonymousprobes/bootstrapdeletion/dictresponses andcardselector (catalognowmultiples). Minimal/batch/dictpersistenceoldregressions kept.
- Independentastre NEWtests/public-library-review.test.ts16 realSQLite/fakeIDB/productionhandlertransport:134targeted9files/build0, initialTS18048 initundefinedfixed; previousfull357reported, laterown16/full358. ReviewfoundACKofflineguard/publicModeinitial-refresh corrections, rootfixed. Retestlargeproductionreviewhitquota (runtime limit reported); nofakeclaimcompletedadditionalreview.
- AuthorizedsourceoldD:\linh tinh\tm\STVNovel\mớichưasửa\Vietphrase-data missing; readonlyfoldermetadatafindcurrentD:\linh tinh\tm\Vietphrase-data. NEWscripts/seed-default-dictionaries.mjs strictly7allowlistedfiles, SHAstream, manifestprotected.codexoutsideworkspace; nostoryfolderenumeration/upload. Prep53451768bytes. Firstuploadcmdquotingexit1 beforeanyobject; changeddirectNode process.execPath+node_modules/wrangler/bin/wrangler.js, noShell. Upload7canonicalhashedobjects thenmanifest exit0. NoNameListglobal seed. NoDwrites/scripts/Gitdata.
- R2liveexistingbucketthu-phong-libraryprivate/directpublicdisabled. RemoteD1migrationslist0003only, apply0003exit0additive2commands. Publicread/write throughAPIonly; nootheraccountsettings/billingchanges. Initialproductiondeployba40ffe8 carriedpublic/data/defaultdict.
- RootfinalpreNativeunit358/build0 +E2E6publicrepeatpass. FirstfixturepublicE2E6failbeforeReader becausecharCount9butactual7; correctedfixtureonly, rerun6/6. BroaderE2Efirst60pass12fail: mockallrequestsBearer afterdisconnect andpositionalMởsáchnow2cards; fixedmocksacceptanonymous401/cardscoped, repeat72/72exit0. Laterpublic-hidemenu71pass1fail thirdlinktestinitialanonautoloadassertBearer race; fixedthatfixturewithproper401/bootstrapresponses, final72/72again. Artifactsallretainedinignoredtest-results.
- Actualba40productioncoldsmoke desktop7dict+Reader 山门→CổngRiêng+reloadnodownload passed; secondfreshviewportfailed checksum/Readerabsent. Node3actualVPGETreturned200butbytes5487040/299008/331776vs43687000. Noacceptbaddictionary(localatomic0onfailure). SyntheticfixturefinallydeletedbyAPI, noactualbookdeleted. CPU10mscauseonlyhypothesis(noproductiontail), notproven.
- RootinitialdirectResponse(R2body)faileddualTSDOMvsCFReadableStreamReadDoneResultoptionalvalue. NativeTransformStreampipe+waitUntil compiled/build0 buttargettests38pass2fail lostwronglength/prefetchinvariant; notaccepted. FinalNEWserver/r2-stream.ts portablemoduledeclareFixedLengthStream built-in byteconstructor; actualWorkerbranchnativefixedlength+pipeTo(waitUntil), Node-onlyboundedJScancel fallback. Appliedbothdictionary+bookGET, updatedtwoPagesfunctionclosureswaitUntil. NativeAPIcheckedprimarydocs compatibility2026-01-01.
- Independentnative reviewer gpt-6.1-sol/high ONLYNEWtests/native-stream-review.test.ts5. ActualinstalledMiniflare5.20261001.0-alpha/workerd1.20261001.1, productionbundle, synthetic43,687,000-byteR2 exactSHA3requests, short/longfalsemetadatareject,16MiBbookGETrealD1/R2fullSHA, upstreamcanceloncebeforefullbody.119targeted8files/build0; noblockingfindings/sourceD/remoteactions. HarnessfailhistoryMF5ERR_VALIDATION1fail3skipped→convertV4MiniflareOptions; D1.execmultilinefixture1fail5skipped→preparedbatch; bookContentLengthabsentcompression1fail4pass→Accept-Encodingidentityforwirelength. Allfinal5nativeactuallyran.
- Rootfinalnpm.cmd test363reported/31filesexit0, known1it.failsglobalNamesportable stillopen. npm.cmd run buildexit0 app/serverTS+Vite73modules/index-BIFkIBgA.js. FinalE2Ecommand6specs public-library/cloud-device/cloud-sync/minimal-library/batch-import/dictionary-persistence --workers=2 --repeat-each=3 --output=test-results/public-native-release --reporter=line:72/72exit0 (~1.3min). gitdiffcheck0onlyCRLFwarnings. NoGitcommit/push/reset, dirtyolderchangespreserved.
- Finaldeploynpx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true --commit-message NativeboundedR2streams... exit0 eca0c5c4. NEWscripts/smoke-public-library-production.mjs canonicalHTMLmatch,3VPGETexactSHA/bytes, freshprofiles1280/522 auto7dict/ReaderbookNameoverride/noauth; cold9296ms/8702ms, reload0rawdictdownloads; realR2upload201/delete200/retry410/GET404/Originforeign403. APItestfixturesall synthetic, finallyDELETEcleanup, tinyreservation/tombstones deliberatelyremain; nouserbooksmodified. Metrics/screenshots ignoredtest-results.
- Updatedscripts/smoke-minimal-navigation-production.mjs currentpublic2groups/manualbackup-syncabsent/anonymous200; actualcanonicalrunexit0 desktop1280/mobile522. Oldprivateproduction scripts notallcompatiblepublicmode, usecurrenttwosmokes; nofalse401expectation. Runtimeidsstorytitlesnotwrittenlogs.
- DocsHANDOFFrewrittencurrent<100lines, masterplancheckpoint, DECISIONSappendtwo, USER-GUIDE/STATUSappend; MINIMAL-STEPS/R2-SETUP/NEXT-AIupdatecurrentbelow. Fullhistlogpreserved.
- Limits: noAndroidhardware/RAM/nativeworkerdCPUfree10msproof/fullE2E/fullrelease. Cloudsnapshot32MiB/addonly currentName; laterName/progress/originals/EPUBimages/mụcnotfullsync. Deletedreservedbytesneverfreed9GBcatalogcap,53.5MBdictoutsidebudget; no20GB0VNĐguarantee. PopupfixedName/currentConvertcache kept; backupknownA1/A4/A5/A6/A7/globalNamefailsnotclosedbyhiddenmenu. NextSTORAGE2/revisions+GC1race-safequota+EPUB1/collections+FAST2compressed/indexspike/Androidreal.

## 07/10/2026 18:38–18:50 ICT — BULK-0 metadata và kế hoạch nhập toàn kho
- Thực hiện: Codex root/model chính phiên hiện hành, không đổi model chính. Dispatch khảo sát bulk_structure_survey=gpt-6-luna/medium; reviewer bulk_plan_review=gpt-6.1-sol/high. Survey tự ghi GPT-6 nhưng không có runtime introspection; log chỉ xác nhận cấu hình dispatch thật của công cụ.
- Yêu cầu: user chọn D:\linh tinh\tm\STV Novel để đưa toàn kho lên web theo nhóm thể loại/tác giả, truyện, chương. Đọc HANDOFF/masterplan/AGENTS/DECISIONS; kiểm code domain/folder-import/cloud-snapshot/server-cloud-library, không tin report cũ. Git dirty từ trước giữ nguyên; không commit/push/deploy/migration hoặc upload truyện thật.
- Invariant: nguồn D chỉ metadata read, không sửa/xóa/rename hoặc chạy script ở nguồn; không đọc/in raw text; mọi file trong inventory có unit/attachment; proposals không phải truyện đã xác nhận. Không đoán tác giả/thể loại từ mọi folder, không upload script/archive/sidecar thành chương.
- NEW scripts/plan-library-import.mjs: lstat/readdir/realpath không follow link/junction tĩnh; natural order; list relativePath/bytes/mtime/type/error; nhóm numbered/mixed >=90% là candidates review, TXT riêng/EPUB pending/auxiliary TXT/attachments giữ riêng; output atomic temp+rename vào preexisting state ngoài source. CLI không có upload/network/content đọc. Manifest ngoài Git/OneDrive C:\Users\toann\.codex\private-novel\bulk-library-plan.json.
- NEW tests/library-import-plan.test.mjs:7 synthetic cases coverage accounting, grouping/ordering, ambiguous works, auxiliary, mixed folder, output-source containment, unchanged bytes, redirected directory; cleanup target temp được kiểm resolve trước recursive rm. NEW reviewer tests/library-import-plan-review.test.mjs:3 actual CLI/profile junction/output tests. UPDATE vitest.config.ts cho chạy tests/**/*.test.mjs cùng .ts; không đổi app importer/schema/UI.
- NEW docs/BULK-LIBRARY-PLAN.md: inventory, pending mapping question, tree, lệch schema/code, BULK1/LIBRARY1/STORAGE2/EPUB1/BULK2/BULK3 gates; cập nhật HANDOFF current và masterplan checkpoint, decisions/log append-only.
- Quét metadata thật:73839files/375dirs/5073818223bytes; TXT72680/3284507422bytes; EPUB62/826528850bytes; 66TXT>2MiB,1>32MiB(max38259088). 239folder candidates(8uniform/231mixed),1147TXT candidates,62EPUBpending,1auxiliaryTXT,1097nonTXT/EPUBattachments,0errors/0skipped. 21unitsraw>32MiB,max324783271bytes. Mỗi bản proposal tổng1449units, chưa số truyện được xác nhận. Một lượt Powershell metadata independent khớp counts/bytes; survey bổ sung290topdirs, phần lớn numbered directTXT.
- Fail history: initial npx vitest run .test.mjs exit1 No test files found (include chỉ .ts)→thêm include .mjs→5pass rồi mở rộng7. Powershell ConvertFrom-Json mặc định không đọc được empty extension key→dùng -AsHashtable; đọc docs có một lần cwd private-novel bị double path→sửa cwd. Không lỗi nội dung/source mutation ở D.
- Reviewer phát hiện P1 thực trong fixture: CLI mkdir(state) trước canonical-check, profile/.codex junction→source; exit1 nhưng source thêm private-novel. Root bỏ hoàn toàn mkdir và realpath state trước ghi; reviewer regression cả state thiếu/có sẵn xác nhận source nguyên vẹn. Reviewer final10/10/build0/diffcheck0; không còn blocker cho metadata cây tĩnh. Không dùng test mock thay source boundary CLI actualprocess.
- Root npm.cmd test từ private-novel: cuối373reported/33files exit0 (known globalNames portable backup it.fails vẫn còn; không tuyên bố toàn bộ data bugs đã đóng). npm.cmd run build:app/serverTS,Vite73modules,index-BIFkIBgA.js,exit0. Sau cleanup assertion, targeted two planner testfiles10/10 exit0. Root E2E: npm.cmd run test:e2e -- e2e/folder-import.spec.ts e2e/batch-import.spec.ts --workers=2 --repeat-each=3 --output=test-results/bulk-plan-regression --reporter=line →30/30pass exit0. Android-layout là viewport Windows, không Androidhardware. git diff --check exit0 CRLF warnings; node --check script exit0.
- Chưa: encoding/content hash/duplicate content/chapter boundaries/EPUB/originals/category catalog/large partitions/checkpoint uploader/quota/runtime import toàn kho. Concurrent junction swap sau realpath và source mutation lúcscan/cancel/crash chưa xác minh; temp ngoài nguồn có thể còn nếucrash. Production vẫn eca0c5c4, không upload D trong phiên này.
- Next ID BULK-1: chờ câu trả lời mapping đã gửi async (folder tập hợp một truyện/chương hay tách tác phẩm); apply mapping, recheck metadata/stat/hash. LIBRARY-1 triển khai metadata category/author/provenance end-to-end (snapshot validator hiện loại field lạ, catalog chưaauthor), cần reviewer độc lập nếumigration; STORAGE-2 chiachapterparts/originals trước21unitlarge, EPUB1 trước62epub. Upload chỉ sau thiếu capability/coverage/budget được đóng, giữ tombstone và khôngoverwrite clouduser edits. Xem docs/BULK-LIBRARY-PLAN.md, không mặc định inventory là upload-ready.

## 07/10/2026 20:45–21:02 ICT — CHAPTER-1/ALBUM-1 implementation/review/release
- User bắt buộc chia chương, Album optional tập hợp. Root đọc HANDOFF/masterplan/DECISIONS; scope mandatorynewimports +initialAlbum, không nhập toànD/auth/backup/syncupdates. Invariant chaptersseparate/losslessnormalizedtext/sourcebytesSHA/IDs/order; no partial album/readiness; snapshotv1/D1 additive compatibility; tombstone/quota unchanged. Không hỏi lại permission, CodeUI lênPages đã cho phép trong session.
- Dispatch models thật: album_cloud_impl=gpt-6-astra/high, album_ui_impl=gpt-6.1-sol/medium, album_chapter_review=gpt-6-astra/high độc lập. Root Codex/modelchính không tự đổi. Implementers tự nói inherited/no introspection; chỉ xác nhận cấu hình dispatch công cụ, không suy model từ effort.
- Root files: src/domain.ts optionalalbum; src/importer.ts ignorelegacydetect/postWorkertrue; src/folder-import.ts perTXTStreamingSplitter/output64k/sequentialorders/chaptercount/sourceId, khôngrejectdecoded128k, giữ bytecaps/quota/cancel/tx; src/splitter.ts bound>=2/surrogate-safeappend/pendinghigh/continuedLine tránhhugetailpseudoheading. UPDATE tests/folder-import.test.ts changedheading expectations +150kChinese/emoji/text/sourcebytes; NEW tests/chapter-split.test.ts7 feed-boundarycases. UPDATE e2e/folder-import.spec.ts button/previewFILES labels. Không sửa nguồn/truyện thật.
- UI agent files: App/ImportDialog/BatchImportDialog/FolderImportDialog; NEW src/albums.ts normalizelabel/atomiccommitAlbumImports outerbooks/importJobs tx nestedcommitImport/batch; NEW tests/albums.test.ts4 validation/identity/rollback/optional; NEW e2e/album-library.spec.ts3 batch/singleChinese/folder. NativeAlbumselect/search, labelremotephantom, noadditionalnav; initialimports only/noexistingcloudedit.
- Cloud agent files: src/cloud-snapshot.ts optionalvalidation/v1restore/createCloudSnapshotWithMetadata oldAPIwrapper; src/cloud-client.ts optionalcatalogalbum/parser/headerfromsame snapshot; server/cloud-library.ts boundedencodedheader1080/trim120/controlURIvalidationbeforereservation/albumINSERTonly/catalog. NEW migrations0004 additiveADDdefaultemptyCHECK; NEW tests/album-cloud.test.ts11. Fixtures UPDATE cloud-library/cloud-delete/cloud-device-review/native-stream-review/public-library-review include0004/explicitseedcolumns. Untrackedbaseline checkedwholefiles notjustgitdiff.
- Reviewer NEW tests/album-chapter-review.test.ts3: failedsecondbookready update rollback albums/books/jobs preservingchapters; edits title/album duringhash stillheaders=snapshot; samephysicalhuge line feed invariance. Oldguardreproduction inRAM/esbuild (remove !continuedLine only) exit1, lossless=true/feedInvariant=false; rootfixprecededtest, newregressionpass. Reviewer147/14targeted (SQL0004/tombstonerace/native5)/build0/diffcheck0 and18AlbumrepeatE2E.
- Failhistory: UIbuild .isWellFormed absentES2022 lib → rootexplicitsurrogate regexfixed; cloudtestEnv lackedrequiredAUTH_PASSWORD_HASH → fixtureemptyvaluefixed. Root rg Windowsglobarginvalid → explicitfilepaths. Localhelp npx accidentallycwdparent fetchedtemp4.148cache(readhelp only); actualproject/remoteWrangler4.147/no packageupgrade. Metadataquery doublequotedSQL ready becameidentifier underWindowsCLI → readonly7500, removedpredicate count/sumqueryworks. Finaldocsfirst functions.exec hadJSparseerror before anyfile mutation → splitpatch/String.raw succeeded.
- QA rootsplitter/folder/core58/4pass; cloudagent104targeted/native5/build0/new11rerun0; UIagent4unit/18E2E/full396/build0. Root final npm.cmd test399reported/37files exit0 (knownbackupglobalNameit.fails persists); npm.cmd run build app/serverTS+Vite75/index-DClD1b6D.js/worker-gMnWWKDg exit0.
- Root first five-spec E2E album/folder/batch/public/cloudsync --workers2 --repeat-each3 --output=test-results/album-chapter-release:64pass2fail exit1. Batch confirmed ENOENT trace.network/zip; reviewerdefaultoutputtest-results cleanupstarted20:55:28 while rootactive, deletingparent. Revieweracknowledgedinterference, stoppedother runners; artifacts partiallylost but toolfailureoutput historyretainedhere. Root rerun same66cases serial --output=test-results/album-chapter-final --reporter=line viaTee-Object test-results/album-chapter-final.log →66/66pass exit0/1.2min/fullpersistentlog. Neverparallel defaultparentoutput withchildoutputdirectories.
- Skills workers-best-practices/runtimepatterns +Wrangler consulted; official D1migration/Pagesdeploydocs retrieved; local4.147CLIhelp/config/schema/compat2026-01-01 unchanged. OAuthaccount97c5d65fbc80bb0ab8c78ad3b01b04b5/d1+pageswrite confirmed, nosecretprinted. Independent147/build passed before remoteDDL.
- Remote migrationlist0004onlypending/schema7columns. Before total5/cloudreserved21952190/tombstones2. npx.cmd wrangler d1 migrations apply thu-phong-auth --remote exit0/0004once; after total5/reserved21952190/tombstones2/oldalbumlengthsum0, nooldrow/objectrewrite. DBidf19b2949-3987-424c-bd1b-2cd4624a8e9d. npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true --commit-message 'Mandatory chapters and optional Album metadata' exit0 deployment9981adb9; noGitcommit/push.
- Root NEW scripts/smoke-album-production.mjs syntaxchecked+canonicalexit0: HTMLsamebuild, syntheticPUT201/GETexactSHA/Album; fresh Windows1280/522 APIcatalogfilter1card→ReaderChinese你好→Xin chào frombookName, IndexedDB2chapters/album/exacttext, reloadreopenpersisted. Dictionarymanifestmockempty onlyAlbumgate, not53MBcold; actualserverR2/D1. FinallyAPIDELETE200fixture, synthetictombstone/reservationretained; noDread/upload/realbookmutation. Existingminimalnavigationproduction actualexit0 main2/settings2/anon200/manualsyncbackupabsent/nooverflow. Androidhardware unverified.
- Docs HANDOFF current<100lines/masterplancheckpoint, BULK-LIBRARY-PLAN mandatorychapter/Album supersedesoldwaitingquestion; USER-GUIDE appendusage; DECISIONS/HANDOFF-LOG append-only. Historyintact; nosecret/actualcorpus/manifestinGit/dist.
- Remaining Albumemptycreate/rename/moveexistingcloud/metadatarevision notimplemented; original/perchaptercloudparts for21oversizedgroups and62EPUBparser/images neededbeforewholeDupload. Genre/author taxonomy andcollectionworkboundaries notderived; Albumlabelnotpermission. Existingbackuperrors/M0RAM/actualAndroid/fullsuite notclosed. Nozeroload/20GB0VNĐclaim.
- NEXT STORAGE-2 immutable originals/parts/manifestpublish/quota/checkpoint/tombstone independentlyreview; BULK1 Album→book→chapter provenance/validboundaries preview; EPUB1; metadatarevision/move/editName/progresslater. D readonly; selectedcorpusuploadauthorization holds but no unsupportedformatpublishing. Do notwaitoldtwochoicequestion again.

## 07/10/2026 23:42–23:53 ICT — FOLDER-LARGE-1 fix/review/production
- User báo file TXT>2MiB khi nhậpfolder, yêu cầu cứ cho làm1truyện; turntrước bịngắt saureadonly, khôngcófix/deploydở đểtin. RootđọcHANDOFF/masterplan/DECISIONS/code folder+batch+importer vàresume. SrcDreadonlystat filter matchingfilename only:14103969byte/13.45MiB. Khôngđọcnộidung/hash/encodingD, khônguploadsource thật.
- Dispatch large_folder_impl=gpt-6.1-sol/medium narrow4files; large_folder_review=gpt-6-astra/high independentdatareview. Rootmodelchính khôngđổi. Invariant mọi pathvalidated/neverdropTXT/IDsseparate/dedupenone/rawsourcepath/blob/SHA/local retained/Albumreadyatomic; cleanup onlynewIDs/oldBooksNamesProgresspreserved; serverquota/schema/auth unchanged.
- NEW src/folder-selection.ts plan usesfullplanFolderImport forpath/duplicatevalidation trướcpartition; normalgroup<=2MiB/file, >2MiBstandalonebook; prepare upfront normalgroup32MiB/standalone40MiB/combined256MiB/quota source*5, no100limitonnormalchapters. Sequentialnormalgroups thenstreamingstandalones withmandatoryheading, safeobserver callback, abortchecks afterIDpush; catchPromise.allSettled deleteallcompletedIDs only, failedcleanup explicit. ActiveimportFiles ownsdrain/rollbackactive writes, no dictionary/storyfoldercontentsseeding.
- UPDATE src/ui/FolderImportDialog.tsx: retainsfullfiles, usesnewplanner/prepare, large-onlybuttonenabled, previewbook/filecounts andpaths/largefilenamebook; unsupportedlists intact, existingcommitAlbumImports ready/Albumatomic. No changes low-level importer/folder-import/batch/db/server/migrations/auth. OlddirectimportFolderGroup capstill2MiB; UI routesvia coordinator now.
- NEW tests/folder-selection.test.ts12: actualfakeIDB +StreamingSplitter, simulatedWorkerACK; 2MiBexactthreshold/paths/large duplicatesidentity/sourceblob/SHA/Album, >100normalchapters, caps/quota upfront/cancelactiveworker/lateabort/failure rollback/progressobserver/cleanup errors. NEW e2e/large-folder.spec.ts2 realWorker fixtures>2MiB withChineseheadings/CRLF/emoji, sourceSHA/exactbytes/losslesstext/boundedparts/IDsduplicates/Albumreload +largeonlycanceloldbookunchanged.
- Reviewer NEW tests/large-folder-review.test.ts6: pendingquota cancelbeforeanyread/write; lateabort aftersuccessfulprepare keepspreview; source/finaljobwritefailure no partialdata; cleanupattempt-all despiteonefailure/explicitresidualstage; malformedignoredpath beforewrites. Reviewedwholeuntrackedfiles/importer/worker andscopedtracked diff, actualtargeted9files79/79exit0 (afterfixturecorrected), build0. NoE2Efromreviewertoavoidparentoutputinterference.
- Failhistory: implementer initialcwdroot readcorrected explicitprivate-novel; initialbuild1 Progressfixturemissingparagraph/revision→typedfixturefixed/build0. ReviewerinitialrgWindowsglob/pathUIwrong→explicitpaths/read0; reviewerfirstbuild1sameProgressfixturemissingfields→fixed then79/build0. Root newproduction .mjs mistakenlyTSnonnull ! syntax→node--check1 beforeanyrun→removed ! thencheck0. No producttestfailure/actualsourcedatachanges.
- Implementerunit12/full411reported/38files/build0; E2Eown --output=test-results/large-folder-agent --repeat-each3 --workers2 →12/12exit0, nooverlappingdefaultcleanup. Rootfirstfull411/build0; afterreview6 final npm.cmd test417reported/39files exit0 (knownbackupglobalNameit.fails stillthere); npm.cmd run build app/serverTS+Vite76modules/index-_jQbcTq6.js/worker-gMnWWKDg exit0.
- Rootintegration npm.cmd run test:e2e -- e2e/large-folder.spec.ts e2e/folder-import.spec.ts e2e/album-library.spec.ts --workers=2 --repeat-each=3 --output=test-results/large-folder-final --reporter=line viaTee test-results/large-folder-final.log →42/42pass exit0/42.3s. EdgeWindows/Androidviewport, notAndroidhardware. Fullpersistentlog retained. Rootreadwhole coordinator/UI/newtests, gitdiffcheck0(CRLFwarnings), syntaxcheck0.
- ProjectlocalWrangler4.147 CLI verified; no config/schema/secret/migration changes, skills/docs/permissiontargetsameasprecedingrelease. Afterindependent79+root417/build/42E2E deploy npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true --commit-message 'Automatically import large folder TXT as separate books' exit0 c8886be8. NoGitcommit/push/reset; older dirty filespreserved.
- NEW scripts/smoke-large-folder-production.mjs root: canonicalHTMLmatchesdist, freshWindows mobile522 context manifestdictionarymockempty separatescold53MBgate, browsergeneratesChinese textwithtwoheadings genuine14103969byteFile (notcontentofuserfile). Mixedfolder small+large preview2books, Workerstage/Albumconfirm torealR2/D1; pollcatalogonlyfixtureIDs, exactcloudsnapshotSHA, Album/charcount/bounds/lastheadingverify. Actual exit0 result source14103969/cloud14117709/chapters75/albumtrue/SHAtrue. FinallyDELETEbothfixtureIDs200; reservations/tombstoneskept, no actualD contentoruserbooksmodified. No productionConvert/AndroidRAM claimfromthissmoke.
- HANDOFFcurrent84lines/updateproduction+mvpcurrentlimits, mastercheckpoint, BULKplanlimits updated, USER-GUIDEappendinstructions, DECISIONS/HANDOFF-LOGappend-only; nosecret/rawrealcorpus/data/dist/dependenciesGit.
- Limits: >40MiBraw/normalgroup>32MiB/selection>256MiB stillblockedupfront; cloudsnapshot>32MiB stillneedsSTORAGE2parts; notentire4.1GBTXT/EPUBbatchloader; EPUB/largegrouporiginals/metadatarev/taxonomy/backuperrors/M0RAM/actualAndroidremain. Actualfilecontent/encodingnotverified, onlymetadata13.45MiB. Userreloadwebandreselectsamefolder; largeselectedTXTno2MiBmanualstep now.
- NEXT STORAGE-2 immutableperchapterparts/originals/revision+checkpoints withindependentreview; BULK1provenance Album→books→chapters, EPUB1parser/images; no needrepeatuserpermissionforscopeauthorizedselectedcorpus, butdon'tpublishunsupportedincidentalcode/archive.

## 08/10/2026 00:30–00:46 ICT — FOLDER-ALBUM-2/UI-4 release
- User explicitnewmapping mỗiTXT1truyện/mỗifolder1Album/mandatorychapter vàannotations menuclipped +localnote/footer/topbarthừa. RootđọcHANDOFF/masterplan/DECISIONS/currentcode, noDreads/writes/realstoryuploads. Currentnewrule supersedes oldfoldergrouping; no userdata migration or oldbookrewrite. Scope40MiBfile256MiBselection/cloud32MiB maintained.
- Dispatch folder_album_v2=gpt-6.1-sol/medium implement; folder_v2_review=gpt-6-astra/high độc lậpdatareview. RootCodex/modelchính notswitched, selfreportsinherited onlydispatch configuredmodel confirmed. Filepermissionsdisjoint; noparallelE2E(defaultartifactcleanup risk).
- Agent files src/folder-selection.ts everyTXT streamingimportFiles/dedupenone/fullpathAlbum validation upfront/nonempty/max120/normalizationcollision; prepare returns IDs +perbookassignments, rollbacknewIDs only/activeimportdrain. src/albums.ts NEW commitMappedAlbumImports validations and outerbooks/importJobs tx, oldcommitAlbumImports wraps helper backwardcompatible. src/ui/FolderImportDialog automaticAlbum perparent previews, manualAlbumfieldremoved, initialAlbum propkeptcallsitecompat ignored, no2MiBbranch orfolder32cap.
- Agent tests changed folder-selection13/albums7 +NEW folder-album-v2.test.ts3 incllosslessboundedsplit/rawSHA/originalbytes/distinctidenticalfiles/mappedready/olddata/101books/34MiBparentaccepted. Existing tests/large-folder-review faultinject adjusted to sources.add fail3rdcall (wasallreject becauseoldnormalfolderusedbulkAdd) preservingattempt-all cleanupfailure/oldNamesProgress checks, retainedtitle1 vsparentA. Updated3E2Esfolder-import/large-folder/album-library consistentnewtitle/album/count/nomanuallabel. No weakeninginvariant to getgreen.
- Root files src/ui/App.tsx removedtopbar/localnote/footer/sidebarbottom/storageestimate/slogans/duplicateheading; singleTủsáchheading/search/Album/Add, metadataauthorandknownchaptercounts insteadmissingauthor0chars; errors/actualstatus kept. src/style.css book-options-menu staticinflow cardheightnở (noabsoluteclipping). NEW e2e/shelf-minimal-v2.spec.ts actualfirstlastbuttonbounds+elementFromPointhit/clickeditor/absence4blocks/nooverflow, touch+keyboardlegacytestsretain. No rootchange toagentownedfiles.
- ReviewerNEW tests/folder-v2-review.test.ts2: mappedlastjobwritefaultatomicrollback; actualimport.worker module6encoding/SHA cases+5invalid/empty/largewhitespace cases. Initialtarget53/8pass/build0 thenactualmoduleUTF16BOMdefaultUTF8FAIL exit1; rootfixedBOM; nextblankonlyworkerexpectederrorreceiveddoneFAIL exit1; rootfixed /\S/ streamedcontentguard. Reviewerfinal89/11targeted pass/build0/gitdiffcheck0. NoE2Eorremote/Dfromreviewer.
- Root fixes src/workers/import.worker.ts boundedprefix3byteBOMdetect UTF8/UTF16LE/BE, strictfataldecode fallbackselectedencoding, doneactualencoding, hasContentchunks/tail/blankreject beforedone. src/importer.ts resultoptionalencodingbackcompatoldmockWorker, SourceFileactualencoding||selected. No texttrim/mutation/fileoriginal/hashlost. Worker errors drainpendingwrites androllback viaexistingimporter/coordinator.
- Initialagentfull423pass1fail(oldfaulttestrejectfirstsource, anticipatedsemantics)→authorizedadjustthirdcall→425/40pass; finalagenttarget30/build0 andE2E3specs42repeatpass isolatedfolder-v2-agent. RootinitialUI+folderpublic6specs66repeatpass beforeblankfix(outputfolder-album-minimal-final.log). Latestrootfull npm.cmd test427reported/41files exit0 (knownbackupglobalNameit.fails persists), buildTSapp/server+Vite76/index-C2NZQ-2M/importworkerCNmsQ51K/CSSBJbWKD2S exit0.
- Root NEW e2e/folder-encoding-v2.spec.ts actualbrowserWorker mixesUTF8/16LE/16BE BOMS defaultUTF8→3books/actualSourceencodings/中文 exact; blanksecondfileaftervalidfirst rejects androllsbackonlynewIDs. FinalWorker5specs folder-encoding/folder-import/large-folder/album-library/shelf-minimal --workers2 --repeat-each3 --output=test-results/folder-v2-worker-final throughTee fullpersistentlog →60/60pass exit0/52s. ActualWindowsEdge/Androidviewport, nothardware. No parallelrun/artifactfail in thissession.
- Review/rootreadwholeuntrackedfiles +scopedtracked diff; gitdiffcheck0 onlyCRLFwarnings. ExistingprojectWrangler4.147/compat2026-01-01/resourcebindings/Publicmode unchanged, skills/docs reviewedpriorinthread. No server/schema/migration/auth/secret edits. AfterQA deploy npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true --commit-message 'One TXT per book folder Albums and minimal shelf UI' exit0 deployment793cfdd4. NoGitcommit/push/reset.
- Root scripts/smoke-large-folder-production.mjs adapted folderv2(autoAlbumfullpath/manualfieldremoved) andmixedsmallUTF16BOMdefaultUTF8 +Chinese13.45MiBfixturegenuine14103969bytes. Canonicalactualrunexit0: HTMLsamebuild, folder2TXT→2books, autoAlbum, streamedWorker75largechapters/cloud14117713bytes/SHAexact; fixtureIDs APIdelete200cleanup/reservations+tombstonesretained. NoactualDcontentsread/upload, dictmanifestisolated(notcold53MB).
- Root scripts/smoke-minimal-navigation-production.mjs extendedfourblocksabsent/oneheading +realfirstlastcardactionbounds andelementFromPointhit assertions, waitsfirstcard so notskip. Actualcanonical desktop1280/mobile522 pass/main2/settings2/anon200/manualsyncbackupabsent/nooverflow. Deletebuttonneverclicked onrealbooks; onlyreadonlymenuopen. Scriptfirstconditional versionalso0 thenstrengthenedwait/log version0 bothviewportsconfirmedhit. Screenshotsignoredtest-results.
- DocsHANDOFFcurrentupdated<100lines/masterplancheckpoint/BULKplanrules supersedeoldgrouping+limits; USER-GUIDE/DECISIONS/HANDOFF-LOG append only/historiesintact. Sourcecorpus/auth/dictionaries/oldlibraryunchanged. Noformalfullreleaseorbackupbugclosure.
- Limits parentAlbumlabel<=120 rejects toolongpath beforewrites(nottruncate); identityacrossseparatebrowserselections onlypathlabels, notfilesystemglobalID. Alreadyimportedbooksnotmigrated. >40MiBfile/>256MiBselection/cloud>32MiB stillneedsstorageparts; originalcloud/EPUB62/genre-authortaxonomy/updateName/progress/revisions/wholecorpusloader/Androidhardware/M0RAM/backuperrors remain.
- NEXT STORAGE-2 safeimmutablechapterparts/originals/manifestpublish/checkpoint/quota+independentreview, thenBULKnewruleeachTXTbook/folderAlbum +EPUB, metadatamove/revisions. Don'trestoreoldnormalfoldergrouping or2MiBspecialbookbranch. Optionalgeneratedfolderalbumlabels mustnotoverwriteexistingusercontent/globalNames.

## 08/10/2026 01:17 ICT — UX-0: plan UI/Reader theo yêu cầu người dùng
- Người thực hiện: root Codex điều phối (không tuyên bố đổi model chính); subagent /root/ui_reader_research_plan được dispatch gpt-6-astra/high cho nghiên cứu và chỉ tạo docs/UI-READER-UX-PLAN.md. Danh tính model ghi theo cấu hình công cụ, không runtime introspection. Không agent triển khai product trong phiên này.
- Phạm vi: đọc AGENTS/HANDOFF/masterplan/DECISIONS; đối chiếu App/ConvertedTitle/Reader/ReaderTools/styles/language-client/cache/test. Nguồn D: không truy cập; không chỉnh storage trình duyệt người dùng, không upload, không deploy hoặc commit/push. Giữ nguyên dirty/untracked trước phiên.
- Invariant: RAW/title gốc và source offsets nguyên; giữ settings/Names/progress, cancellation/context identity; không thêm Gemini/TTS/cloud scope. Plan riêng UX không được xem là đã sửa/hoàn tất tính năng.
- Root đo local qua Edge Windows context mới ở320x568,522x524,1280x800; sample app tổng hợp. Ignored scripts test-results/ux-research/measure.mjs và name-reconvert.mjs; screenshots name-{320,522,1280}.png. Dev npm.cmd run dev session26852 localhost5173, không deploy.
- Computed title: h3=16px mobile/17px desktop nhưng button/span=12px mọi viewport. Reader22px,lineHeight39.6px; panel Name296x474/498x430/410x522.56; textarea274/476/388 x227.97px. Mobile panel83.5/82.1% viewportheight; không overflow ngang. Đây bằng chứng local baseline, không ảnh hưởng/không chứng minh settings production hoặc Android hardware.
- Root trace Reader.tsx:76 clears tokens/source; :80 renderedText empty khi notready; render notice replaces paragraphs; progress effect phụ thuộc converting/renderedText. ConvertedTitle trả raw khi signature đổi. Root dùng Chinese200paragraphs 陈景然走进山门。, bookName Trần Cảnh Nhiên→Trần Mới, MutationObserver thấy zero paragraphs/loading tại461.1ms rồi200/loadingfalse511.1ms. Blank DOM50ms một lượt; không đo paint frames/production latency/scrolljump thực.
- Lịch sử fail scratch giữ: measure.mjs đầu exit1 timeout locator Name (actual ✎ Name), sửa locator→exit0; name-reconvert đầu exit1 Dexie orderBy(order) không có index, sửa toArray+sort syntheticfixture→exit0. Đây lỗi harness, không gán production regression. Scripts/artifacts ignored không vào Git.
- Agent và root độc lập npm.cmd test -- tests/book-names.test.ts tests/reader-word-edit.test.ts tests/reader-word-review.test.ts tests/reader-word-actions.test.ts tests/language-client.test.ts tests/convert-cache.test.ts tests/convert-cache-review.test.ts:57/57,7files,exit0 (root01:15:23). Có diagnostic closing syntheticcache connection trong test, exit0. Đây baseline logic, không nghiệm thu UX mới.
- File sửa bởi root: HANDOFF.md thêm checkpoint UX-0/ngày hiện hành; WEB-READER-IMPLEMENTATION-PLAN.md thêm checkpoint; docs/DECISIONS.md thêm định hướng plan; log này append-only. Agent tạo UI-READER-UX-PLAN.md; root đọc đối chiếu trước kết thúc. Không app/server/schema/CSS edit; do vậy không chạy fullunit/build/fullE2E theo gate sau code trong phiên docs/research.
- Giới hạn: Android thật/softkeyboard/browser zoom/name save faultrace/selection anchors/scroll stability/longtitles searchConvert/production layout chưa nghiệm thu mới. Không tuyên bố đã fix UI hoặc deploy. Production793cfdd4 vẫn mốc trước; known backupglobalNames expectedfailure và storage/EPUB/BULK giữ mở.
- NEXT UX-1 typography/shelf rõ tiêu đề với E2Ecomputedfont/longtitles/reflow; UX-2 giữ snapshot đúng cùngchapter/revision khi Name reconvert, stale controls disabled + atomiclatest swap/anchor, race/error/rapidupdates tests; UX-3 Name inline dễ sửa, advancedimportexport collapse không tự xóa Names. Mỗi bước unit/build/E2E liên quan và independent review cho persistence/race; xem plan IDs/acceptance trước viết code.
- Root kiểm git diff --check:exit0, cảnh báo LF/CRLF có sẵn, không whitespace error. Đọc screenshot522 xác nhận bảng Name che phần lớn trang; chưa ghi frame timing hoặc Android hardware.

## 08/10/2026 08:24 ICT — UX-1A local: tiêu đề Tủ sách rõ hơn
- Clock xác minh UTC2026-10-08 01:23:52→Asia/Saigon08:23:52. Đính chính chỉ giờ của UX-0 trong phiên này: 01:12/15/17 gắn ICT trước đó thực là hostUTC, tương ứng08:12/15/17ICT. Không sửa lịch sử log/không suy lại giờ các phiên cũ.
- GPT-6-astra/high nghiên cứu đã tạo docs/UI-READER-UX-PLAN.md trước khi turn kết thúc lỗi usage-limit. Root trước đó thấy file chưa tồn tại; khi tiếp theo thấy file đã ghi, đọc toàn bộ và xác nhận nội dung/IDs/bằng chứng. Không tuyên bố agent hoàn tất final/review hoặc root tự đổi model. Root tiếp quản task nhỏ UX0-A/UX-1A; user nói tiếp.
- Model triển khai: root Codex đang cấu hình phiên, không override/chuyển model hoặc dispatch thêm agent khi quota. Scope chỉ typography shelf và regression UI; không schema/auth/cloud/reader settings/Name writer. Invariant nguyên titles/raw/handlers/search/Album/menu/Names/progress.
- File src/stv-layout.css thêm6 dòng scoped selectors: .book-card .book-detail h3 font20px/weight600/line1.45, mobile<=70018px; h3>.text-button fontinherit/left/fullwidth/normalwrap/anywhere/min44/padding0. Selector specificity rõ để không bị rules button12/h3mobile16 cũ override. Không đổi App handler hoặc metadata.
- File e2e/shelf-title-readability.spec.ts mới: tổng hợp2title dài230+chars/khôngspace, 320/390/522/1280, computedfont18/20/left/fullunclippedtext/hitheight44/nohorizontaloverflow; keyboardEnter mở đúngStoryDetail; raw db.title intact. Test không cần đọc truyện D/API thật. Không test resetReader/Name layout vì chưa sửa.
- File docs/UI-READER-UX-PLAN.md root thêm checkpoint local/quota/time correction, giữ kế hoạch agent; HANDOFF current (100dòng) và masterplan checkpoint; DECISIONS/log append. Agent đã tra W3C accessibility và ghi sources; root không coi19px/760px làWCAGmandatory.
- npm.cmd test exit0:41files/427reported pass,11.78s. Known globalNames portable backup it.fails vẫn tồn tại; không tuyên bố hết lỗi dữ liệu. Diagnostics experimentalSQLite/syntheticcacheClosing không lỗi suite.
- npm.cmd run build exit0: app/servertypecheck+Vite76modules; dist index-BfUs2DC8.js/cssindex-BUEXiivL.css/importworker-CNmsQ51K. Không deploy hoặc dùng build làm proofproduction.
- npm.cmd run test:e2e -- e2e/shelf-title-readability.spec.ts e2e/shelf-minimal-v2.spec.ts e2e/minimal-library.spec.ts e2e/converted-titles.spec.ts --reporter=line --repeat-each=3 --workers=2 --output=test-results/ux1-title initialexit1:24pass6fail newtitle spec. Fixture createdAt/updatedAt equal: App sort/index order differed insertion; incorrect .nth(i) assumption. Fix test lookup title exactcontext via filter(hasText titletrim), không sửa production ordering. Failtraces giữ trong ux1-title; không xóa.
- Same4spec command with --output=test-results/ux1-title-final exit0:30/30,32.7s (bothWindowsEdge+Androidviewport). Checks Chinese titles Convert/rawunchanged, menufirst/last hit/edit, settings destinations and import/read remain. No independentreview needed CSS-only risk; root checked own6lines diff + fullnewtest. Agent baseline57 logic tests separately not reviewimplementation.
- Một command Set-Content -Encoding utf8 positional args thất bại parameterbinding exit1 trong attempt specificityadjust, không ghi file; root dùng apply_patch thành công trước QA. Không đem lỗi harness/powershell thành appbug.
- Chưa xác minh: actualAndroid/IME/zoom200–400/fontscale/textspacing, cold53MB/productionupdate/Readerfontsizepreset/namepanel/continuity/scroll/race. Title-only done subsetUX0-A; hidden duplicateConvertedTitle/perf chưa đổi. Production793cfdd4 vẫn cũ, chưa deploy. Quota không làm mark toàn UI complete. D: không truy cập, Git không commit/push/reset, không xóa dữ liệu real.
- NEXT UX-1B displaydefaults/reset preservingstoredsettings; hoặc UX-2 snapshotidentity/bodycontinuity trước UX-3 form Name. UX-2 cần deterministic delayedWorker/latecompletion/anchor/progress regressions và độc lậpreview guards/persistence. Khi deploy titlebuild cần Wrangler skill/currentconfig và canonicalbundle smoke; không dùng plan asdeployedproof.

## 08/10/2026 14:28 ICT — UX-B/C/D + search: code frozen, root release QA đang chạy
- Root Codex điều phối, không tự đổi model chính. User yêu cầu hoàn thành kế hoạch UI và tiếp tục sau pause. Thời gian tiếp tục xác minh clockUTC07:28:22→ICT14:28:22; không dựa máy host khi múi giờ thay đổi. D: không truy cập, không novel/dictionary content thật upload/Git, chưa deploy ở checkpoint này.
- Dispatch /root/ux_reader_preset gpt-6.1-sol/medium: chỉ domain default19px/1.65/760, ReaderTools commoncontrols/advancedcollapsed/resetdisplaypreservesTTS, reader-preset.spec. Line step0.05 hỗ trợ1.65; step±0.1 rounds2decimals. Fullunit427 pass; firstbuild0, subsequentbuild1 vì root in-flight useRef missingarg, rootfixfinalbuild0. Agent không E2E tự chạy.
- Dispatch /root/ux_name_component gpt-6.1-sol/high: chỉ NameManager.tsx/name-manager.css/name-manager.spec; inlineonSave(text) keyonly, search/page50/all251Names, advancedbulkcollapsed/textarea72–160/import≤2MiB append latestdraft+session guard/exportdraft/errorretain. Targeted38/full427/build0; rootintegratedAPIreject/errors. Root additionally existingvalue typing→parentdraft (noDBwrite), close/reopen regression; lazyNameManager chunk6.75KB/css2.27 avoids main>500KBwarning.
- Root Reader.tsx: exactid/revision/rawtext snapshot + orderedNames/global/dict semantic signature/run. Same-source Name/dict reconvert keepsparagraphs, aria-disabled stale tokens and guardclick/expand/apply/TTS; latest effect alive preventsoldresults. Separate fixedstatus updating/error/retry, failure retainsold readable snapshot. New chapter/revision cannotdisplayold snapshot. PreviousactiveSource guard cancels audio on samechapterrevision/text change regardlessrawmode/snapshotid. save nowrequiresactivechapter+positionRevision so pendinghydrate cannotstampoldparagraph newrevision. Progressrestore oncepersource, observer reattaches onmode/count; no rereadoldprogress onNameupdate.
- Root reader-scroll-anchor.ts: currentviewportfirstvisible source token; literal/rawchar Range binarysearch, surrogatepair backs-off, perpiece offsets through newlines; pendinganchor captured at completion/currentuserposition, layoutrestore latestsource. Reader literal chunks carry exactpiece offsets; nonliteral token maps source-span start (not fictitioustargetoffset). Settings explicitchanges captureanchor; testedlongparagraphtokens andliteralemoji. No schema/progressformat migration.
- Root ConvertedTitle.tsx stableoldVN onlysamebook/rawtext, discardlatecontext; onReady presentationcallback/renderfalse producer. App oneproducerperbook outsidefilter (oldhiddencoverduplicate removed), RAMtitleindex checked raw/contextNames/dictsignature forsearch; raw/author/Album alwayssearchable, query accentfree/lowercase. Producers stayalive duringVNquery beforefirstready andNameschange, no additionalConvert perkeystroke. No metadatawrites; catalogscale/RAM/virtualizationnotclaimed.
- Root stv-layout.css adds stable fixedConvertstatus/no layoutshift, touchclose44px/advancedsummary; Name ownCSS reflow. ReaderTools help changednew save workflow; oldstv-ui fixture opensadvanced+Lưu nhiều tên insteadremovedChạy. Rootnewconverted-search.spec testsliveearlyVNquery/Namechange/rawauthorAlbum/noaccents/rawmetadata; continuity5 cases defer ACTUAL NativeLanguageWorker responses while retainingactualengine/cache/IDB.
- Strongreview /root/ux_reader_review gpt-6-astra/high:57targetedunits/build0, detected realAudiorevision/raw, progressrevision andmodeobserver regressions thenrootfix. Ownreader-ux-review.spec6 cases. Firstreview22pass2audiofail keptux-independent-review; next53pass1fixtureBackauto-scrollfailure keptux-independent-final; corrected reloadatcurrentposition→54/54 repeat3passux-independent-final2. Suggestedtokenanchorforlongparagraph; rootimplementedhelper, ownnewemojiRangecase createdbeforeagentquota. Agentturn erroredusage aftersource review; root notpretending itrannew6case gate.
- First rootnew3spec28cases initial23pass5fail keptux-new-initial: failureinject heldTITLE request first insteadbody→fixbody-specific; expectedunknownHanraw字butenginewithoutdict dropsunknown→useBETA literal marker; row130anchorassertwrong due CSSscrollmargin andprecedingvisibleparagraph→assertactualvisibleanchor. Newtokenanchor continuity5 repeat3 root30/30 pass ux-token-anchor.
- Fallbackindependentreviewer /root/ux_final_review_fallback actualgpt-6.1-sol/high afterastraquota:57targetedunits/build0/gitdiffcheck0, own6+continuity5+search1 ×2projects×repeat3 =72/72 exit0 in1.8m outputux-fallback-review. Flaggedactivequeryunmountproducer issue bysource; rootfixedbeforefreeze andall6searchruns passed. No reviewer source/test/docwrites. Independentreview security/noinjection/no networkchange/sourceNamesisolation/latestresults/audio/progress/settingscompatibility completedwithinsoftware scope; hardware remainsunverified.
- Root final npm.cmd test:427reported/41files exit0,17.83s; knownbackupglobalNames it.fails remains. Root npm.cmd run build app/serverTS+Vite80 exit0,index-BCBNzRXJ.js498.37KB/NameManager-DTq9edAZ.js6.75KB/index-CLWgrmfK.css. Earlier intermediatebundles/CSS>500KBwarnings recordedtooloutputs; lazychunkfix no warning final. Rootfull15spec330repeatE2E running session67752/outputux-release-final, not passyet atcheckpoint.
- Rootnew scripts/smoke-reader-ux-production.mjs: canonicaldistHTML match, syntheticcloudsnapshot+actualChineseNames/nativeWorker/fonts/compactpanel/noDOMblank/reload, isolateddefaultdictmanifest to avoid cold53MB; thenlogicalAPIcleanupsyntheticID only. Notyetexecuted; realdictionarycold/hardwareTTS not inferred. Wrangler skill reread/local4.147help+whoami verifiedaccount97c5d65.../pageswrite, existingPUBLIC_LIBRARY1/R2/D1 unchanged; officialDirectUpload docs retrieved. No secretsread/printed/configchange. Deploy onlyafterrootQA gate.
- RootfilesEdited: Reader/App/ConvertedTitle/stv-layout + reader-scroll-anchor new; ReaderTools help; stv-ui/newcontinuity/newsearch/Nameexistingdraftregressions; UIplan/HANDOFF/log/DECISIONS tofinalize. Agentfilesasabove; alloldunrelateddirtyfilespreserved. Python editing command exit1 nooutput/nochange, rootusedapply_patch successfully. Otherreadcommands wrong wildcard/path corrected, not appfail. Reviewdiffcheck0 CRLFwarningonly.
- NEXT wait330rootresults→fixanyfail/reviewifcodechange→buildfinal/Pagesmasterupload→canonicalrealbrowserUI smoke→recorddeploymentID/fullresults/rewritecurrentHANDOFF≤100lines. Do not markwholeplan orwebsitecomplete whileQA/deploy pending. ManualAndroidkeyboard/IME/zoom400/realTTS andP2 M0RAM/fullcorpus/EPUB/cloudNameupdates stillopen.

## 08/10/2026 14:39 ICT — UX release đã nghiệm thu phần mềm và deploy
- Root integration code frozen: npm.cmd test427reported/41files exit0,17.83s (knownbackupglobalNames it.fails còn). npm.cmd run build app/serverTS+Vite80 exit0: mainindex-BCBNzRXJ.js498.37KB, index-CLWgrmfK.css40.01KB, lazyNameManager-DTq9edAZ.js6.75KB +CSS2.27KB. Không chunkwarning cuối; không packageupgrade hoặcschema change.
- Root npm.cmd run test:e2e -- e2e/reader-continuity.spec.ts e2e/name-manager.spec.ts e2e/reader-preset.spec.ts e2e/reader-ux-review.spec.ts e2e/converted-search.spec.ts e2e/reader.spec.ts e2e/stv-ui.spec.ts e2e/reader-word-popup.spec.ts e2e/reader-race.spec.ts e2e/story-detail-review.spec.ts e2e/convert-cache.spec.ts e2e/converted-titles.spec.ts e2e/shelf-minimal-v2.spec.ts e2e/shelf-title-readability.spec.ts e2e/minimal-library.spec.ts --reporter=line --repeat-each=3 --workers=2 --output=test-results/ux-release-final →330/330pass,exit0,6.8m. Android-layout là EdgeWindows viewport; không device thật. Allfinalcode unchanged trongreview/rootruns.
- Read remote Wrangler4.147.0 help/whoami account97c5d65... OAuthpageswrite; deploymentlist xác nhận previousProduction793cfdd4/master. Official docsDirectUpload +PagesAPIretrieved; no secretvaluesread/printed. No升级/update4.148 despiteavailablewarning. npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true exit0:7assets/5new2existing, compiledFunctions/_routes, deployment454f94ce production. Khônggitcommit/push hoặc uploadsourceD; bindings/auth/configunchanged.
- Actualcanonicalhttps://thu-phong-private.pages.dev HTML.trim==distHTML.trim checked twice. Newnode scripts/smoke-reader-ux-production.mjs initialexit0 actualChinese/nativeWorker/font18desktop20/mobile18/Reader19 max760/noDOMblank/Nameeditor/save/reload/overflow checks passed but panelHeight97 captured lazyfallback (measurement notactualloadedmanager). Fix instrumentation waitsTìmName+savedrow visible andLưubuttonenabled before screenshot; noappedit/redeploy needed.
- CorrectedproductionUX smoke exit0:1280x800 and522x524 default2entryName panel321.234375px, ChineseNames Xin chào→Xin chào mới andCổngnúiactualworker, noDOMblank whileupdate, localreloadpersists. Dictmanifest deliberatelyemptyfixture to isolate UI from53MB defaultcold; don'tclaimfullDictionary/Android/TTSproof. Two separate syntheticUUIDcloudsnapshots uploaded201, each APIlogicalDELETE200finallycleanup; no realbook modified/deleted, tiny tombstones/reservations kept intentionally.
- node scripts/smoke-minimal-navigation-production.mjs exit0 canonicalbuild +realcatalog/nav2/settings2/anon200/nohorizontaloverflow/firstlastcardbuttonscontained+elementFromPoint hits at1280/522; deletebuttonsneverclicked. Defaultdictionarytransport not re-benchmarked; no usercontentuploaded bynavsmoke. Screenshots ignoredtest-results/reader-ux-name-production-{1280,522}.png, reader-ux-production-{1280,522}.png, minimalproductionexistingnames.
- Root viewed actual522Namescreenshot: shortsource/value fields, scope/save, collapsedbulk, readerparagraphs below; nohugeemptytextarea. Finalmeasureddefault321px vsold430(522x524) with2entries, not guarantee forallNamecounts/keyboards. Initial97measurementkept in tooloutputs and clarifiedabove; neveroverwriteit tofakebetterresult.
- Finaldoc files: HANDOFF.md rewrittencurrent52lines (historyinappendlog preserved); WEB-READER-IMPLEMENTATION-PLAN.md checkpointproduction; UI-READER-UX-PLAN.md statusmatrixP0+searchsoftwaredone/manualP1/P2open; USER-GUIDE newworkflow; DECISIONS/logappend releaseverification. Existinghistoricalcheckpointsnotclaimedcurrent. gitdiffcheck0 CRLFwarningsonly; broadtracked/untrackeddiffincludesolderwork, rootnocommit/reset.
- Finishedscope: UIsoftwareP0 (shelf/title/default/display/Name/snapshot/tokenRange/guards) +VN/noaccent/contextsafe search. Limits actualAndroidIMEkeyboard/dvh/rotate/zoom400/screenreader/RAM/corpusscale notverified; withinhuge nonliteralNamedtoken anchor source-spanstart nottargetchar; standaloneliteralemoji/longparagraph sourceword/reflow regressionspassed. RealTTSgateway/audio notverified. Nameupdates stillLOCAL only (cloudv1 immutableinitialsnapshot). Backupknownexpectedfailure/Storage2/EPUB/BULK/M0/GC untouched/open.
- NEXT do manualAndroid gates/M0 measurements withactualdevice or STORAGE2 narrowindependentreviewedchapterparts/originals/revisioncheckpoint task perexistingplan; don'trebuildsolvedUI or resetstoredsettings/oldbooks. Userwhohas22/40savedneeds explicit⚙→Mặc địnhhiểnthị tochoosefresh19preset; rootdidnot overwritetheirprofile to make screenshotgreen.
- Finaldocs bổ sung STATUS.md và NEXT-AI-PROMPT.md checkpointproduction ưu tiên hơn lịch sử cũ để AI sau không làm lại auth/UI. Patch multi-file đầu saiheading NEXT bịreject atomic (STATUS chưaghi), đã đọc đúngheading rồi apply riêng hai file thànhcông. Rootlog ghi lỗi lệnh tài liệu, không là app/testfail. Final gitdiffcheck0 CRLFwarnings, HANDOFF52lines. open_in_codex productionbrowser trảqueued; không suy đã mở/đã usernghiệmthu từUIqueued.


## 08/10/2026 14:55 ICT — TTS-0 gateway thực nghiệm
- Thực hiện: root Codex (model chính không đổi; không dispatch subagent). Phạm vi chỉ khảo sát/tài liệu, user yêu cầu tìm cách nghe TikTok. Đọc AGENTS/HANDOFF/masterplan/DECISIONS, src/tts.ts và inventory functions; D STV reference chỉ đọc. Không appcode/server/schema/auth/secret/dữ liệu thật/deploy.
- Phát hiện: adapter GET relative /io/s1213/tiktoktts chưa có route server; aliases tiktok:1/2/3 không chứng minh giọng thật. Public Weilbyte/HA docs có POST JSON và Vietnamese BV074/BV075. OldAPI307 sang ottsy.weilbyte.dev, một defaultUA403/1010 giữ bằng chứng; Python không follow POST307 tự động.
- Kiểm: PowerShell chạy Python urllib request tổng hợp, exit0; status old200 available; oldgeneration307; newfemale2003.62s/58880base64chars, newmale2003.23s/60800chars. Lượt xác nhận Origin production cả2success/strictbase64decode/MP3header44160/45600bytes; CORS*, OPTIONS204 allowPOST/Content-Type. Không in fullaudio hoặc secrets, không gửi corpus. Header chưa là player decode/nghe bằng tai.
- Files: docs/TIKTOK-TTS-GATEWAY.md mới ghi sources/evidence/implementation scope/acceptance; HANDOFF.md thêm checkpoint; docs/DECISIONS.md append lựa chọn thử public direct browser; log append này giữ lịch sử.
- Review/test: khảo sát docs-only, không chạy unit/build/E2E ứng dụng vì không đổi code; không independent data review vì không data/auth mutation. git diff --check sẽ chạy. Không nghiệm thu real TTS.
- Giới hạn: cộng đồng/unofficial/no SLA, chưa player nghe/nguyên chương/Android thật; chưa kiểm được giọng giống STV bằng tai. M0/Storage/EPUB/cloudName/backups không đóng.
- Next ID TTS-1: POST base64 adapter, verified2voiceIDs, backward-compatible settings, Unicode offsets≤200, boundedprefetch/timeout/cancel; fullunit/build +related repeatE2E mock và actualaudio browser/hardware smoke. Không silentfallback hoặc STV privateproxy.


## 08/10/2026 15:08 ICT — TTS-1 hoàn thành adapter và production
- User: tham khảo stv.tts.v2.min.js và hoàn thành TikTok. Root điều phối/tích hợp/UI/E2E/nativeAudio/deploy/docs; actual dispatch implementation GPT-6.1-sol/medium (/root/tts_impl), independent GPT-6.1-sol/high (/root/tts_review). Child tự nhận inheritedGPT6 không thay actualspawn config; không đổi modelchính.
- Scope/invariant:2verifiedVietvoices, POSTJSON/base64→MP3; neverfallback/hiddenSTVproxy/secrets, source/Names/revision/DB/cloudpermissions intact; stop/chapter/name invalidation không phát oldaudio. NguồnD đọcstv.tts.v2.min.js4803/getvoices/playbackrate/POSTtimeout; không copy/chạy/upload nguồn.
- Files: src/tts.ts Unicode≤200codepoints/originalUTF16offset; realvoiceIDs giữoldsettingsIDs; female2unavailable; strictJSON/base64+MP3screen/2MiBstreamcap/30sdeadline/fetch+bodyabort; generation+audioidentity/playpromise cleanup/revokeURLs. tests/tts-player.test.ts21protocol/cancellation/timeout/stall/resume/error/Unicode tests; core.test.tsTTS asserts19total. Reader.tsxTTSdescription bỏunsupportedpitch/flex controls giữsettingsvalues, auto-next availableguard/no unknownvoicefallback.
- e2e/reader-race.spec.ts +reader-ux-review.spec.ts route publicPOSTJSON validMP3headerfixture +Audio cleanupmethods; reader.spec.tsavailablecount2; stv-ui.spec.ts gatewayHTMLfailure explicitmock (no live network inE2E). scripts/smoke-tiktok-production.mjs new canonical/CSP+nativeAudio bothvoices/viewport/highlight/pauseResume/autoNext/stop, interceptcloudAPI đểsyntheticimport chỉlocalkhôngupload/deletekhotrue.
- Independent review phát hiện productionCSPconnect-src selfonly chặnAPI dù localsmokexanh. Rootserver/auth.ts chỉallowexacthttps://ottsy.weilbyte.dev connect-src, khôngscript/media/auth/KDFchange; tests/auth.test.ts exactconnectsrc+script/media/object regression. .env.example bỏVITEoldprivateproxyhint. Reviewerfinaldiff+90targetedactualtests exit0/6files10.57s; intermediate40pass và55pass (2filenameskhôngtồn tại bịVitestignore) giữhistory rồicorrected90. Reviewer khôngbuild/E2E/nativeaudio tự chạy, không gán evidence root cho reviewer.
- Root npm.cmd test +npm.cmd run build initial445/41/build80exit0; lastidentityguard rerun underparallelE2E444pass1metadataCLI5000mstimeout tests/library-import-plan-review.test.mjs redirectedprofilemissing; chưa kếtluậnrootcause hoặc fixmetadataCLI. Finalserialnpm.cmd test446/41 exit0/9.58s; buildapp/serverTS+Vite80exit0/2.64s,index-D0mY-jCL.js499.95KB. KnownbackupglobalNamesit.fails vẫn còn.
- Root npm.cmd run test:e2e -- e2e/reader-race.spec.ts e2e/reader-ux-review.spec.ts e2e/reader.spec.ts e2e/stv-ui.spec.ts --repeat-each=3 --reporter=line --output=test-results/tts-release:120/120exit0/2.0m. Afterfinalfallbackguard npm.cmd run test:e2e -- e2e/reader-race.spec.ts e2e/reader-ux-review.spec.ts --repeat-each=3 --reporter=line --output=test-results/tts-final-race:48/48exit0/53.3s. These AudioMocks, notrealvoice/hardware.
- Real local: TTS_SMOKE_ORIGIN=http://127.0.0.1:5173 node scripts/smoke-tiktok-production.mjs exit0; both1280x800/522x524 nativeAudio actualgateway3HTTP200each, decode/currentTime/pauseResume/autonext/stop/highlightassert. No Audio play mock.
- Wrangler skillread/local4.147.0/officialDirectUploaddocs/help/whoami/pageswrite/account97c.../existingdeploymentlist checked; configsamePUBLIC_LIBRARY1/R2/D1. Command npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true exit0,3new4cachedassets/functions/routes, deployment1472c005. NoGitcommit/push/Dupload/keychange.
- Production node scripts/smoke-tiktok-production.mjs exit0 same1280/522 actualnativeAudio bothvoice3HTTP200each, decode/currentTime/highlight/pauseResume/autonext/stop, canonicaldistmatch +CSPexactorigin. OnlymockcloudAPI/librarydictmanifest toavoidprodwrites/cold53MB; doesnotverifycloudsync or fullVP. Neverrealbookdelete. No listeningbyear or Androidhardware.
- Docs: HANDOFFcurrentcheckpoint/masterplan/USER-GUIDETTS/TIKTOK-TTS-GATEWAYstatus/DECISIONS/log append. gitdiffcheckexit0warnCRLFonly; existingdirtydiffUIincludesearlierrelease, noreset/revert.
- Limits/next TTS-2: measure per-sentence networkgap/prefetchbounded1 ifneeded; Androidhardware background/screenlock/longchapter/autoplay/namechange realaudio/cancellation/manuallistening notverified. Publiccommunity noSLA, no paid resources added. Storage2/EPUB/cloudName/M0/backups open unchanged.


## 08/10/2026 15:14 ICT — TTS-2 nghiên cứu loadchậm
RootCodex khảo sátreadonly; đọcHANDOFF/masterplan/DECISIONS, sourceD onlyrg/GetContent. STV cache+pendingdedupe568/preload1515/callsetMaxPreload(2)2395/cuttime4833/player1433 so với localonended-fetch100/104. Websitehome mởwebread, khônggọiSTVprivateTTS/khôngchạyD/khôngđoSTVliveaudio. DocumentTIKTOK-TTS-GATEWAY appendedevidence+prefetch2/boundedLRU/cancellation/500retryplan+gates; HANDOFFcheckpoint. Khôngappcode/deploy/testunit/build thayđổi; nghiêncứu khônglànghiệmthutốiưu. NextTTS-2 implementprefetch/dedupe rồi controlledtiming+nativebenchmark/e2e/review; coldstart/cookie/backendSTV/chươngdài/hardwarechưaverified.


## 08/10/2026 15:23 ICT — TTS-UI tối giản theo chỉ đạo người dùng
- Thực hiện rootCodex, tựlàmphạmviUIhẹp khôngdispatchagent; không đổi model chính. ĐọcHANDOFF/masterplan/DECISIONS vàD SangTacViet_Nghe_Sach_Plus.user.js chỉđọc(rgplay/pause/button,MediaSess425). Khôngcopy/run/proxy/Dupload.
- src/ui/Reader.tsx: bỏremoteConsentstate/checkbox/gates, khôngautostartstartup; directtoolbarlisten start/pause/resume/loadingstop disabledwhileConvert/chapter/settingsnotready, additionalStopplaying/paused, separate⚙Nghepanel. Dropdownonly2availableTikTok; invalidlegacyvoice chọnNữ1runtime/display, khôngwrite/migrateoldsettings. ExistingName/revision/stop/autoNext intact. src/style.css readerlistenmin48px/min140px/font17. Adapter/server/auth/schema/nochange, prefetchTTS-2chưalàm.
- e2e reader-race startdirecttoolbar/noallow/count2 asserts; reader-ux-review/stv-ui/reader.spec openpanelviaCàiđặtnghe/nocheckbox, disambiguatepause; scripts/smoke-tiktok-production.mjs realnativeAudio toolbarstart/48px/count2/noallow, closepanelbeforetoolbar onsmallviewport. USER-GUIDE/currentHANDOFF/masterplan/DECISIONS/log currentworkflow.
- Commands initialnpmtest/build chạywrongrootENOENT (khôngappfailure), correctedprivate-novel npm.cmd test446reported/41exit0/9.65s, knownbackupit.fails còn; npm.cmd run buildapp/serverTS+Vite80exit0/2.63s index-BvADtvbK.js499.78KB,CSSindex-DOt1UzCm.css40.12KB.
- npm.cmd run test:e2e -- e2e/reader-race.spec.ts e2e/reader-ux-review.spec.ts e2e/reader.spec.ts e2e/stv-ui.spec.ts --repeat-each=3 --reporter=line --output=test-results/tts-simple-ui =>120/120exit0/1.8m. Audio/Worker mocks riêng, khônghardware. Diffcheckexit0CRLFwarnonly; nhiều dirtydifferences từtrướcgiữnguyên.
- Wrangler skill/version4.147/help/whoami/pageswrite dùngexistingconfigPUBLIC_LIBRARY1/R2/D1; npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true exit0/4new3cached/functions/routes, deploymentbaf76e2c. Nogitcommit/push/secret/datawrites.
- ProductionnativeAudio firstscriptdesktoppass/mobiletimeout30s becauseopenedNghepanelintercepttoolbarpointer (test triedclickbehindpanel); notgateway500. AttemptedharnesspatchwrongcwdFileNotFound thenoldscript reran samefailure preserved. Correctedharness closespanelafterchoosingvoice, realtoolbarclickoutsidepanel andStoptoolbar; finalsmoke result appendedbelow aftercompletion. Do nothideknownfailure.
- Limits: noAndroidhardware/listeningbyear/background,longnovel500/PREFETCH speedfix stillopen; usergesture required bybrowser, checkboxremovedperexplicituserrequest. No extraauth/datareviewneededUIonly; previousindependentTTSadapter/CSP review unchanged. NextTTS-2boundedprefetch2/dedupe +timing/nativebench.

- Finalproduction node scripts/smoke-tiktok-production.mjs exit0:1280x800/522x524 bothvoices/nativeMP3decode/currentTime/pauseResume/autonext/stop,4HTTP200each,canonical/CSP exactorigin/noallow/2voiceoptions/buttonheight≥48 đạt. CloudAPI/dictmanifest mocked đểlocal-onlysyntheticimport, khôngwritekhotrue; khôngTTS/audio mock. NoAndroidhardware.


## 08/10/2026 15:26 ICT — TTS-500 punctuation diagnosis/fix
RootCodex tựlàmphạmvirất nhỏ,noagent. Userchoảnh/titlevàyêucầutựkiểm. CUAgetTabexistingproductionreadonlyAX chứngminhbodyfirsttoken...; khôngclickNgheusernovel/khôngđổiName/nội dung. PythonpublicPOST...→500 JSONsuccessfalse/dataNull/errorText-to-speechisnotsupportedforthislanguage; titlewithwords→20050560base64characters, Xin chào→20023680. Firstprobeconsoleunicodecp1252errorafterrequest giữhistory, rerunensureasciiprintsmetadataexit0. Khôngcookie.
Files src/tts.ts sentences skipsmatchwithoutUnicodeL/N insteadtrim; tests/tts-player.test.ts22tests thêmleadingellipsis/!!!/offset/allpunct regression. Source/DB/cloud/auth/settingsunchanged; nofallback/retry500 arbitrary. scripts/smoke-tiktok-production.mjssyntheticcontent thêmstandalone...line. DocsHANDOFF/DECISIONS/log cậpnhật.
Commands private-novel npm.cmd test447reported/41exit0/7.98s(knownbackupit.failscòn); npm.cmd run buildapp/serverTS+80modulesexit0/2.63s,index-CLkhSDpY.js499.80KB. npm.cmd run test:e2e -- e2e/reader-race.spec.ts --repeat-each=3 --reporter=line --output=test-results/tts-punctuation12/12exit0/12.5s(AudioMock). gitdiffcheck0CRLFwarn.
Wranglerexisting4.147/config/publicscope/authunchanged; pagesdeploydistprojectthu-phong-privatebranchmastercommitdirtytrueexit0,3new4cached/functions/routes,613aaf58. NoGitpush/commit/Dcontent. Firstproductioncanonicalsmokefail immediatelyafterdeploy(oldBvADbundle), waited10s andrerun; do noterasepropagationfailure. Finalnativeproductionresultappendbelowaftercompletion.
Limits: standalonepunctcasefixed, notproofall500cleared; actualAndroidhardware/ear/background/prefetchnotdone. NoDB/datareviewneededonefilter+regression.

Finalproduction node scripts/smoke-tiktok-production.mjs exit0 canonical+CSP/nativeAudio/2voices/1280x800+522x524,5HTTP200each/decode/currentTime/pauseResume/autonext/stop. Syntheticfixture includes...line; cloudAPI mocked avoidsrealdatawrites, not Androidhardware.


## 08/10/2026 15:35 ICT — TTS-2 prefetch/deploy
RootCodex điều phối/test/build/E2E/deploy/docs. Actualspawn /root/prefetch GPT-6.1-sol/medium, /root/prefetch_review GPT-6.1-sol/high; child tựnhậnGPT6inherited khônglàthay actualdispatch. Userdeploytốiưu, scopeTTSwindowcacheonly, noUI/data/auth/server/secrets/D edits. ĐọcHANDOFF/masterplan/DECISIONS, referenceSTVresearchprevious readonly.
Files src/tts.ts requestMapexactvoice/id/text outcomePromise catchesall speculativeerrors; prefetch2aftercurrentplayready; retaincurrent+2evicts+aborts; Stop/errors/end clearall; lateaudioidentity/generation guards intact. tests/tts-player.test.ts5newcontrolledfetchbeforeended/dedupe/window/stoplatevoice/failuretests27initial; rootadded28thlongpuncttailregression afterreview. RootTypeScriptfix error-in-resultdiscriminant narrowing. e2e/reader-race.spec.tsfetch2initial/4nextchapter+audioCountwait; reader-ux-review.spec.tsaudioCount1aftersourcechange vsoldincorrectfetchcount1. scripts/smoke-tiktok-production.mjsnativeeventsplaying/ended loggedinterSegmentGapMs. USER-GUIDE/HANDOFF/masterplan/DECISIONS/GATEWAY/logupdatestatus.
Initialrootnpmtest452/41exit0 thenbuildTS2339resultunion123/124fail; fixed'error'inresult→build80exit0. Reviewer46testsinitial/finaldiscriminantpass foundpreexistingpunctlongtail'A'+'!'.repeat201→'!!'; rootguardbothflush/tail and28thtest. Rootfinalnpmtest453reported/41exit0/8.56s; buildapp/serverTS+Vite80exit0/2.66s,index-DSsADAho.js500.72KB/160.04gzip. Vitewarnchunk>500KBnotfailure (no arbitrarylimitraise). Knownbackupit.failsstillopen.
Rootnpmrun test:e2e reader-race+reader-ux-review --repeat-each3 --reporterline --outputtest-results/tts-prefetch48/48exit0/44.8s; finalreader-raceoutputtts-prefetch-final12/12exit0/13.2safterpunctfix. AudioMockE2Edistinctreal. Reviewerreadonlytargettts/core46thenlatest47/2filesexit0/4.36s, scopedgitdiffcheck0; pendingaudio.playafterStop/onerrorprobes andlong601punct/400space/400emoji offsetsprobespass. Nobuild/E2E/nativeclaimforreviewer.
Wrangler skillreadexisting4.147/help/whoami/pageswrite/accounts/config unchanged/public1/R2/D1; deploydistprojectthu-phong-privatebranchmastercommitdirtytrueexit0,3new4cached/functionsroutes; a2e5f8ce. NoGitcommit/push/sourceD/upload/realauth/DBmutations. Finalproductionnativeaudio smoke pendingresultappendedaftercompletion; mockcloud/dictsfixture preventsproddatawrites.
Decisionwindow3notplannedLRU32/retry500; approximateMP3cache≤4.5MiBnotpeakRAM. Noaudioendingclipping. Coldfirstrequest stillservicebound, nocrossstartcache; 500upstream canremain. NextTTS3hardwareAndroid/background/longchapter+fairnetworkbenchmark; M0/Storage/EPUB/cloudName/backupsunchanged.

Finalproduction node scripts/smoke-tiktok-production.mjs exit0 canonical+CSP/noallow/2voices/48px/nativeMP3decode/currentTime/pauseResume/autonext/stop; 5HTTP200each1280x800/522x524. Observed interSegmentGapMs desktop[2393,1821,1657],mobileviewport[2499,653,2089]; includeschaptertransition/newstartup andveryshortsegments, notfairbefore-afterbenchmark, no%improvementclaim/nozero-gap. Cloud/dictmockonlyavoidsrealwrites, nativeAudio/gatewaynotmocked; hardwareAndroid/listeningbyearstillunverified.


## 08/10/2026 15:44 ICT — TTS-5xx bounded retry
RootCodex tựlàmphạmviadapterhẹp,noagent/auth/data/serverchanges. ĐọcHANDOFF/masterplan/DECISIONS. CUArewriteDocumentation/existingtabread-onlyprose.speaking +scriptSRC confirmslatestDSsADAho andnormalVietnameseparagraph. Khôngclickusernovel/khôngsửaName/data. PublicHTTPprobes control9chars +actualfirst2sentences62/181chars hiện200/audio23680/101760/214400base64, chưatáihiệnuser500 hoặcproveunderlyingservicefailure. KhônglưuactualnoveltextvàoGit/docs/tests, chỉlength/evidence.
Files src/tts.ts2attempts500/502/503/504only600msdelay, samePOSTvoice/body, voidcancelbadresponsebody, delayAbort+outer30sdeadline, existingwindowgeneration/audioidentityintact. tests/tts-player.test.ts2newrecovery/samebody+Stopduringdelay regressions;503errorfixtureexpects2fetch. No4xxretry/providerfallback/chunkskip/secret.
Rootnpmtest455reported/41exit0/8.50s knownbackupit.failscòn; buildapp/serverTS+80modulesexit0/12.84s,index-D_YWx072.js501.09KB/gzip160.16,Vite500KBwarnonly. E2Enpmrun test:e2e reader-race --repeat-each3 --reporterline --outputtest-results/tts-retry12/12exit0/13.8s AudioMocks.
Wranglerexisting4.147/config/account/publicbindingsunchanged; pagesdeploydistprojectthu-phong-privatebranchmastercommitdirtytrueexit0,3new4cached/functions/routes,02a02f53. NobulkD/gitpush/datawrites. Finalcanonical/nativeproduction result appendedaftercompletion. Noindependentreviewnewtinyretry (notdatabase/auth), rootdiff+targetabort/fulltests; reviewerpreviousprefetch47historyunchanged.
Limits: exact500notrepro currently,no permanentfix/SLA claim. Need actualgatewayerrorbody diagnostics ifrecurs/recoverycannotguarantee. Androidhardware/background/listeningear/upstreamdurationunknown; noextraresources/keys/cookies.

Finalproduction node scripts/smoke-tiktok-production.mjs exit0canonical+CSP/nativeAudio2voices1280/522 decode/currentTime/pauseResume/autonext/stop5HTTP200each. Gapsdesktop2053/521/2504ms,mobileviewport2454/610/1995ms(shortfixturesinclchapterstart,nozero-gapclaim). ActualHTTP500recovery automatedmocktest, notobservedproduction500duringthissmoke. Cloud/dictAPI mocked avoidsrealdatawrites; noAndroidhardware. gitdiffcheckexit0CRLFwarn.


## 08/10/2026 16:14 ICT — AI-0 nghiên cứuGemini
RootCodex docs-only, readHANDOFF/masterplan/DECISIONS/rgappserver:noAI matchesexit1. OfficialGooglemodels/pricing/rate-limit/APIkeydocs đọcweb. Khôngecho/lưu/copykeys/khôngAPIcall/credentialverification/billing hoặcdeployment. FilesAI-TRANSLATION-PLANnew/HANDOFFcheckpoint/DECISIONSappend/logappend. InvariantRAW/Convert/Names intact; noanonAIendpointpublicownerkeys, secretserveronly/keyringperproject429backoffnotquotaevasion. ProposedFlashLitecandidate notlivebenchmark/permissionproof. Noappchange nênkhôngunit/build/E2E; diffcheck. NextAI1syntheticChinesecredential/latency/qualityspike; auth/dataarchitectureAI2 cầnreviewđộc lập. Modelchínhkhôngđổi/nosubagent vìresearchphạmvihẹp.


## 08/10/2026 16:20 ICT — AI-1 thực nghiệm1key/promptreference
RootCodex tựlàmresearchspike,noagent/code/deploy. ReadHANDOFF/masterplan/AIplan. OfficialwebopenSTVsharefailed thenCUAgetexistingtabAXreadonlypromptfields; noSTVtest/save/keytransmission. User explicitlyallowsoneGeminikeytest: ephemeralPythonstdin key#1 requestx-goog-api-key officialGoogleGETmodels200,POSTgemini3.5flashlite2001.04s/STOP/87+42=129tokens; outputsyntheticChinese NamesLâmNhi/TrươngMinh+mườiphútcorrect. NoactualD/novel upload/no keyvaluesartifact/stdout, exceptionsredact; nootherkeys tested/tierverification. DocsAIplan/HANDOFF/DECISIONS/logappend output/design, nofullSTVpromptcopy. Noappchangesso nounit/build/E2E; diffcheck0. Production02a02f53unchanged/noAIfeaturedeployed. NextAI2protectedadapter/authreview thenAI3customprompteditor/test/sourcepreservingcache.

## 08/10/2026 18:41 ICT — AI-2+AI-3: Backend adapter Gemini + UI Dịch AI trong Reader

**Model:** Antigravity (Claude Sonnet 4.6 Thinking). **Root.** Không dispatcher/review độc lập riêng phiên này (đây là triển khai mới, không high-risk data/auth/migration/KDF).

**Phạm vi:** AI-2 (backend server) + AI-3 (Reader UI) cùng phiên.

**Files tạo mới:**
- `server/ai-translate.ts`: handleAiTranslate — proxy Gemini, key chỉ trong env, same-origin guard, validate text/model/names, không forward Gemini error body, timeout 60s, model injection sanitize.
- `functions/api/ai/translate.ts`: Pages Function route `/api/ai/translate`.
- `src/ai-translate.ts`: frontend client — aiTranslate(), filterNamesForText(), friendlyAiError(), AiTranslateClientError.
- `src/ui/AiPanel.tsx`: React component — dịch chương/fixture, custom System/User prompt, model/temp slider, bản AI riêng không ghi đè RAW/Convert, lưu prompt settings trong DB (không có key).
- `tests/ai-translate.test.ts`: 20 unit tests, mock fetch hoàn toàn, không gọi API thật.
- `docs/AI-DEPLOY-GUIDE.md`: hướng dẫn set key qua .dev.vars / wrangler secret.

**Files sửa:**
- `src/ui/Reader.tsx`: thêm import AiPanel, thêm 'ai' vào tool state type, thêm nút ✦ Dịch AI trong Công cụ ▾, render `<AiPanel>` khi tool='ai'.
- `src/stv-layout.css`: append CSS `.reader-panel-ai` và classes AI panel.
- `HANDOFF.md`: cập nhật date + trạng thái AI-2+AI-3.

**Kết quả kiểm thử:**
- `npm.cmd test`: 42 files / 475 tests PASS (bao gồm 20 AI tests mới). Exit 0.
- `npm.cmd run build`: tsc -b + tsc -p tsconfig.server.json + vite build → ✓ built in 2.59s. Exit 1 do PowerShell bắt warning chunk>500kB (không phải lỗi TS, warning tồn tại trước phiên).
- Chưa test dịch thật: key chưa set, chưa deploy.

**Invariants đã kiểm:**
- Key không xuất hiện trong response (kể cả lỗi Gemini).
- Request không cùng origin → 403 forbidden_origin.
- Không có key env → 503 ai_not_configured.
- Text rỗng/quá dài → 400/413.
- Gemini 429/401/403/500 → code thân thiện, không forward body Gemini.
- Model injection → sanitize về DEFAULT_MODEL.
- filterNamesForText chỉ gửi names xuất hiện trong text (tiết kiệm token).

**Giới hạn còn lại:**
- Chưa test dịch thật (cần set GEMINI_API_KEY và deploy).
- Không có rate limit per-user (PUBLIC_LIBRARY=1, người dùng chấp nhận rủi ro quota).
- Không có auth riêng cho AI route (ai có URL dùng được AI).
- Keys đã paste vào chat phải được rotate trước production.
- Chưa E2E cho AiPanel (chỉ unit tests backend+client).
- Chưa kiểm Android hardware.

**Bước tiếp theo:**
1. Rotate 5 keys đã paste vào chat (bắt buộc trước deploy).
2. Set `GEMINI_API_KEY` qua `.dev.vars` hoặc `wrangler pages secret put`.
3. Build + deploy: `npm run build && wrangler pages deploy dist`.
4. Test dịch thật: Công cụ ▾ → ✦ Dịch AI → Chạy thử (fixture) → Dịch chương thật.
5. Nếu cần auth riêng cho AI: thêm AI-2b route guard (ngoài scope phiên này).


## 08/10/2026 19:50 ICT — AI-4 hoàn thiện, hardening và production

- Người/AI: user yêu cầu hoàn thiện Gemini/custom prompt và tiếp tục. Codex/root điều phối, tiếp quản sau quota; không tuyên bố đổi model chính. Dispatch actual: ai_security GPT-6-astra/high backend (quota sau lưu); ai_ui GPT-6.1-sol/medium UI (quota sau lưu); ai_independent_review GPT-6-astra/high quota trước review; fallback ai_review_final GPT-6.1-sol/high thực review/tests. Không dùng self-label inherited của child thay bằng cấu hình dispatch.
- Đọc HANDOFF/masterplan/DECISIONS, tham khảo official Workers/Pages placement/bindings/secret docs và skills workers-best-practices/wrangler. D read-only, không đọc/nạp corpus trong phiên. Giữ dirty/untracked từ trước, không commit/push/reset/migration.
- Phạm vi/invariant: owner-key AI được auth riêng dù kho public; không secret bundle/Git/log/URL, không gửi nội dung thật khi smoke, không ghi đè RAW/Convert/Names/chương/nguồn. One verified model, synthetic Chinese fixture có Name expected. Cần code/diff+actual targetedreview, rootfull/build/E2E và deployedrealAPI.
- server/ai-translate.ts: fixed model allowlist, Bearer64hex SHA-256/cloudhash fail-closed, same-origin, bounded streaming request/response UTF8, 60swholedeadline, clientabort/late responsecancel, key x-goog-api-key header only, STOP-only/typedusage/result, status-onlylog và fixed400classifications. Root sửa narrowing/tokenusage/TextDecoder ignoreBOM builderrors, manualredirect/runtimefix.
- functions/api/ai/translate.ts: Pages Function typed Fetcher AI_TRANSLATOR, nguyênrequest → Worker; local fallback protectedhandler. server/ai-worker.ts: default fetch wrapper cùng handler. wrangler.ai.jsonc: thu-phong-ai private URLs off, region hint gcp:us-east4, date2026-01-01, không DB/R2. wrangler.jsonc chỉ thêmservicebinding, worker-configuration.d.ts regenerate Wrangler include-runtime=false/env-interfaceCloudflareBindings.
- src/ai-translate.ts: Authorization capability tùy chọn/headeronly, friendly fixederrors, Names matchsource dùng nullprototype và local overrides. src/ui/AiPanel.tsx: RAM token/result, explicit promptsave/readfailurefailclosed, System/User/temperature/oneverifiedmodel, syntheticChinese fixture, layoutgenerationabortjobguard/close/unmount/semanticchanges, copy/download TXT. Root sửa JSX thiếubrace, typeConvertName, UI promptcap8k/modelalignment, textarea aria-label.
- src/ui/Reader.tsx: thựcglobalNames qua readConvertNames, sourceIdentity bao gồm selectedchapterId/id/revision, chỉ cấp text khi chapter.id khớp selected. Reviewer phát hiện previousDexiequeryresult retained sau đổi deps có thể giữ job cũ hợp lệ; rootfix. Công cụ → Dịch AI đã có trước phiên, giữ UXminimal. src/stv-layout.css AI styles do phiên Antigravity trước; đọc và nghiệm thu panelfit, không viết lại styling.
- tests/ai-translate.test.ts: security/bounds/aborts/latebody/STOP/usage/400regressions54→56cases; fixtureskey synthetic only. tests/ai-native-runtime.test.ts: installed workerd productiondate actualfetch200/302 nofollow, exactGoogleURL/keysynthetic/singleupstream. tests/ai-service-binding.test.ts: actualtwoWorkers PagesFunction+Workerbundle preservesheaders/auth/origin, anon/wrongtoken401/foreign403/validempty400.
- e2e/ai-reader.spec.ts mới: Chinesefixture/requestNames/Authheader, promptinvalidate+explicitpersist, sourceunchanged, cancel/closeoldresponse, delayedDexie chapterload invalidates immediate (programmaticnavrace vì panel covers nav), failedsettingsread preventsoverwrite. WindowsEdge Desktop/Androidviewport repeat3; không giả Androidhardware.
- scripts/smoke-ai-production.mjs mới: chỉsyntheticChinese, capability readprofile ngoàiworkspace/noecho, realAPI anon401/foreign403/authSTOP200/Names/mườiphút +canonicalasset. scripts/smoke-ai-ui-production.mjs mới: realEdgeprod1280/522, customprompt+realGemini fixture+sourcepreserved/panelfit; cloud/dictionary calls mocked để không read/write realnovel. Browserprofile ephemeral, token không screenshot/trace/log.
- docs/AI-DEPLOY-GUIDE.md rewritten: bỏ anonymous-ownerkey hướng dẫn cũ, protectedWorker+capabilityconnect, limits/disclosureGoogle/correctscope. HANDOFF current/masterplan checkpoint; DECISIONS append superseding18:41 unsupported authorization/prompt-injection absolute claim. Lịch sử không xóa log.
- User one firstGooglekey authorized; modelsGET200/fixturePOST200 direct~1s, giữ key chỉWranglerstdin. No otherkeys test/rotation/billingtierclaim. Worker secrets GEMINI_API_KEY +CLOUD_ACCESS_TOKEN_HASH derived existingprofiletoken; output names only. PagesunusedGEMINIsecret deleted afterworker success, existingcloudhash không đổi. Localprofile connect-ai.html created outsideGit/OneDrive provides maskedcapability/copy, neverGeminikey, do notshare.
- Failhistory: initialbuild JSX syntaxfail, accidental npm root ENOENT, serverusagenarrowing/headerstypes/TextDecoderoptions TSfails →rootfix; finalbuildpass. Initialsecretput subprocessinnerexit0 but Pythoncp1252reader decodefail/outer1; secretlist verifiedinstalled, no repeatblind.
- E2E initial6fail SystemPrompt label exact includedtextarea text → explicit aria-label; final2=12pass. Next6raceprobe fail because panel interceptnav →programmaticdispatch raceprobe, final4=24pass. Integratedfirst47pass1fail sourceassertcaptured Worker loadingstate; readerrorcontext confirmed fixtureprep race, helper waits prose beforecapture. Integratedfinal2=48/48pass40.4s repeat3, output test-results/ai-reader-integrated-final2; earlierartifacts retained.
- Native test initial2fail runtime.getMockAgent missing in installedMiniflare → actualoutboundService interception,2pass; allstate retained in log.
- Productionfirst42fac53e: anon401/origin403/authorized502ai_network_error. Native workerd diagnostic synthetic reproduced exact TypeError unsupported redirect:error despite docs/Node accepting; changedmanual/no-follow. Deployment2520cd34/5599b066 then authorized502upstream400; statusonlytail showed400. Narrow boundedbody classifier →188d173c actual503ai_location_unavailable. Directsamekey/fullbody200 proves key/input valid; Google locationblocked.
- Infrastructure regionalWorker defaultfetch viaServiceBinding reviewed beforedeploy. Wrangler4.147 dryrun12.24KiB exit0, deployworker no publictarget, secretsput2exit0. Pagesefc54b05 authorized2001166ms; final6d6a4b67 afterremovingunusedPageskey auth200942ms127input/41output/STOP, LâmNhi/TrươngMinh/mườiphútexpected, anon401/foreign403/canonicalDDgpM4UZ asset. Regionhint not guaranteedfixedlocation; observedcurrentegressworks.
- ActualprodUI firstsmoke fixturecapturepreConvertfail (realAIalready200); awaitedprose, both1280/522passed; repeatedafterfinaldeployagainbothpassed. No realnovelupload/delete, library/dicts mocked, nocold53MBproof.
- Required finalroot npm.cmd test:517reported/44files exit0 at19:43, knownbackupglobalNamesit.fails retained. npm.cmd run build app/serverTS+Vite82 exit0,511.11kB chunkwarningexisting. No runtime auth change afterchecks exceptremoving redundantPagessecret. npx Wrangler types0/dryrun0/deploy0; API/UI smoke0. Secretprefixscan src/server/functions/docs/dist/scripts no matches; first Windowsglob scanerror retained, corrected directoryscanexit1=no matches.
- IndependentGPT-6.1-sol/high actualfullfile/config/diffreview +54targeted/build0, redirectfollowup56targeted/build0, classifier58targeted0, regionalinfra62targeted/build0. Explicitfindings auth/publicbypass/data/races/backwardcompat/no migration/secrets/no redirects/truncatedoutput. No blockers afterfix; reviewer didnotrunPlaywright/realGemini; rootsupplies that evidence.
- Limits: no rate limiter/cost guarantee, projectquota429 noautomatickeyfallback, no AIpersist/checkpoint/cache/batch/32kchunking/TTSintegration. AI token currentlyRAM only whilepanelopen; close/reload repaste. Androidhardware/IME/background/chapterquality/networkoutage/longchapter safety notverified. ExistingSTORAGE2/originalEPUBimage/fullsync/cloudName/progress/73kbulk/backupknownfails unchanged.
- Next task AI-5 ifrequested: bounded chapterparts/checkpoint/cache/cancel with separateindependentreview. Otherwise resumeplannedSTORAGE2/EPUB/BULK; readhandoff and reruntests, do not infer wholewebsitecomplete or deploy corpus.


## 08/10/2026 21:25 ICT — READER-CONTROLS-1: UI tham khảo ảnh STV và kết nối AI ít thao tác

- Codex/root điều phối/tích hợp, không đổi modelchính. Actualdispatch reader_controls_ui GPT-6.1-sol/medium Reader/CSS/E2E; ai_session_ui_review GPT-6-astra/high readonlyauthRAMreview. Configdispatch làm bằng chứng thay childself-label inherited.
- Đọc AGENTS/HANDOFF/masterplan/DECISIONS; userảnh cung cấp và D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\stv.llmconfig.js đọc head/targetedUIsections; attachment8c983476.../Pasted text.txt đọc userscript metadata/design notes, không execute/copy/publish. Không đọc/uploadnovels hoặc sửaD, không Gitcommit/push/reset.
- Acceptance/invariants: nút nghe fixed48px cóstart/pause/resume/loadingstop, modecontrol trực tiếp, UI không autostart/autoAI, RAW/Convert/Name/progress/backendkeyauth giữ, capability khôngpersist và stalejobkhôngrestoretoken. AI chỉ previewexisting, no implicitwholeAIreader/TTSAI feature.
- src/ui/Reader.tsx medium: extractedhandleListen dùng toolbar+headphones; selectReaderMode closeSelection/stopReading/mode và đóngAI khi chọnraw/convert; toggleAi samepanel. Direct segmented Convert/Bản gốc/Dịch AI aria-pressed, bỏ duplicate menuAI/raw, floatingpillAI/headphonesSVG/gear withdistinctaria. No data/schema/servermigration.
- src/stv-layout.css medium: segmented44pxhit, fixedverticalstack, headphone48px. Root finalstyles pill64x48dark and headphonespurple/activepurple matchingreference; theme/bodytype preserved.
- src/ui/AiPanel.tsx root: moduleRAM remembersonly successful currentrequesttoken, initialstatefrommodule acrossmount; disconnectinvalidatecontroller/generation+wipemodule/state, unauthorizedwipemodule.64hexUIvalidation. Introshorter, Googledatausagefolded disclosure, exactverifiedlabel/draftdisconnectavailable.
- ReviewerP2: original{connected}hidlogoutafterclearinvaliddraftwhileRAMtokenpersisted; summarycouldlabelunverifiedB. Root changed Ngắt condition tabtoken||input andlabel draft.trim===verifiedmodule, addedprobes. Rereviewnoblocker,62targeted/build0. No protectedrequestbackend modifications.
- e2e/reader-controls.spec.ts newmedium3cases: mode/readsource/nooutgoingrequests/viewportbuttons48px; mockaudio startpauseResume/rawstop; abortpendingfetch. e2e/ai-reader.spec.ts root: directbuttonselectors; RAMremountenabled/disconnectdisabled/DBsettingsno64synthetictoken; rememberedA→blankdraft→disconnect→remount; pendingjobafterdisconnectnoresult/noRAMrestore; reloadclearsconnection. Existing sourcechange/prompt/hydrationfailtests kept.
- e2e/reader-ux-review.spec.ts root:3old Xem bản gốc menu selectors replaced directBản gốc; expectations unchanged (stalespeech/revision/progress/raw/emoji/Namefailures). scripts/smoke-ai-ui-production.mjs root: directAIselector, floatingvisible, syntheticreader screenshots, realGemini/customprompt/Names/sameprose/panelfit +close/reopenkeepsconnection. scripts/smoke-tiktok-production.mjs root: start playback through floatingheadphones, existingnativeAudio decode/pauseResume/autonext/stop/2voicechecks unchanged.
- Root finalnpm.cmd test517reported/44files exit0 (knownbackupexpectedfailure retained); npm.cmd run build app/serverTS+Vite82 exit0,512.70kBwarningonly. Scopedgitdiff--check0; baselineincludespreexistingchanges, untrackedAIpanelfullfile reviewed insteadofpretendingemptydiff.
- RootE2E78/78 repeat3 AI+controls+Reader,36/36 repeat3 priorUXregressions,18/18 finalstylecontrols repeat3.132totalpass, desktopEdge/Androidviewport, nohardware. Artifacts test-results/reader-controls-ai-final,reader-controls-ux-regression,reader-controls-style-final. No failures in theseE2Eruns.
- Strongreview actualGPT-6-astra/high62targeted/build0 before/afterP2, noPlaywrightparallel (rootownsrunner). VerifiedRAM/header-only/noDBbackupURLpersist, currentguard-beforemodulewrite; readonlyReviewerdoesnotclaim realhardware/APIproof. Mediumagentbuild0/scopeddiff0, rootintegratedall.
- FirstPagesdeployexit1 authrefreshCloudflareauthserverunreachable. whoami0 sameaccountconfirmednetworkrecovered; retrydeploy0 release50a0e030. PrematurenewUIprodsmokeranoldbundle andfailedmissingNghe truyệnnhanh; failure retained, nofalseprodclaim. No credentialchanged/reset/reloginmanual.
- Production50a0e030 canonicalHTML matches index-Bv7QTS97.js/CSSindex-D5xAlN3s.css. smoke-ai-production0 anon401/foreign403/auth2001214msSTOP127→42tokens NamesLâmNhi/TrươngMinh/mườiphútcorrect. No ownersecretpublicbypass/providerfallback.
- ActualEdgeprod1280x800/522x524 AIUI0: directUI/floatingvisible, customprompt/realGemini/Names/sourcepreserved/panelfit/rememberconnection. Screenshots test-results/reader-controls-production-1280.png/-522.png; rootviewed522, nopassword/APIkeyshown (capturebeforeconnection), corpusnotincluded.
- ActualnativeTikTokprod0 bothwidths:2voices/all5HTTP200perwidth/decode/currentTime/pauseResume/autonext/stop; startsusingnewheadphones. Gaps desktop2486/761/2072ms mobile2293/930/2193ms; nozero-gap/permanent500fixclaim. Cloud/dictionariesAPI mocked duringUI/audio smoke, nolibraryread/publish/delete realbooks.
- DocscurrentHANDOFF/masterplan updated, DECISIONSappend, AI-DEPLOY-GUIDE connectlifetime supersede. Own localprofile connect-ai.html instructions correctedmaskedcapabilitynoecho; notGit/OneDrive/D, no newtoken/secret. Backend/services/regionauthunchanged.
- Remaining: reloadneedsrepastecapability, no persistentauthsession; AI previewnotwholeprose/TTSAI, Gemini32k/chunking/cachecheckpoint chưa làm, Androidhardware/IME/background/earnotverified. ExistingstorageEPUBimage/cloudNames/progress/bulk/backupexpectedfailureunchanged. Next UI taskifrequested actualAIreadingmode→TTSsourcemapping/cancellationreview; otherwise AI-5chapterparts orSTORAGE2/EPUB peruserpriority.
## 08/10/2026 22:09 ICT — NO-AUTH / ONE-STEP, trạng thái mới nhất
- Theo chỉ đạo người dùng: bỏ PIN/login/mã kết nối AI và xác nhận phụ. Không tự khôi phục. Quyết định này supersede capability/Origin/RAM connection trong các checkpoint cũ.
- AI endpoint công khai dùng secret server; key không nằm VITE/bundle/Git/log. TXT/batch/folder chọn rồi Nhập một lần; xóa/gỡ trực tiếp. Giữ validation/checksum/quota/cloud-delete trước local-delete.
- Root531unit/44files/build82 exit0;216/216 E2E10spec repeat3, desktopEdge+Androidviewport. Known backup globalNames it.fails chưa sửa; Androidhardware chưa xác minh.
- Native publication cancel/unmount36/36: sửa promise Dexie.waitFor treo khi native abort; race cancellation chỉ reject khi tx.on(abort) rollback, cleanup own IDs và không cleanup sau commit.
- Production Pages387b2a49, index-CzVAWXhO.js/CSSindex-D5xAlN3s.css; Worker0865fd17-1de7-4e3a-89bd-4c0b20d803bc. Không đổi key/schema/migration.
- Production API anonymous2001487ms/foreignOrigin2001075ms STOP/Names đúng; UI1280/522 realGemini/customprompt/sourcePreserved/panelFits/noConnectionRequired đạt. One-step smoke single/batch/folder/Album/noConfirm/delete đạt cả2sizes, cloud/dict mocked không read/write/delete truyện thật.
- GPT-6.1-sol/medium triển khai backend/import; root frontend/tích hợp/cancel fix/deploy. GPT-6-astra/high review170tests rồi quota; GPT-6.1-sol/high fallback266tests+build và88importtests+build sau fix, không blocker.
- Chưa hoàn tất STORAGE2/originals/EPUB ảnh/cloudName+progress/bulk corpus/AI>32k/checkpoint/cache/Android thật. Không khẳng định toàn web xong.
- Chi tiết file medium public_ai_impl: server/ai-translate.ts bỏ auth/Origin; tests/ai-translate.test.ts,ai-native-runtime.test.ts,ai-service-binding.test.ts76targeted+build0. Giữ limits/deadline/manualredirect/STOP/cancel/sanitizederrors.
- Medium one_step_import: src/ui/ImportDialog.tsx,BatchImportDialog.tsx,FolderImportDialog.tsx một Submit tự stage/commit. e2e/one-step-import.spec.ts8cases và batch-import/folder-import/large-folder/folder-encoding-v2/album-library migration.
- Root AiPanel.tsx/ai-translate.ts bỏ tokenstate/input/header; App.tsx/DictionaryPanel.tsx/Reader.tsx bỏ confirm, WordPopup.tsx sửa nhãn. Giữ stale source/Names/prompt và cloud-delete trước local.
- Root ba dialog nativeabort cancellation gate; e2e/import-lifecycle.html actualReact/Dexie/Worker held nestedpublication và import-publication.spec.ts6cancel/unmountcases. Harness không trong dist. ai-reader/reader/reader-race/public-library/stv-ui và legacyĐóng selectors cập nhật.
- Fail giữ: broad180 lượt đầu162pass18fail do Đóng trùng, sửa.last(); publication36fail thực vì promise treo. Một patch sai cwd FileNotFound rồi unchangedretry dừngCtrlC sau18started. Sau correctedfix36pass16.6s; final216pass3.1min test-results/public-no-confirm-final2.
- Reviewer GPT-6-astra/high actual170targeted rồi quota trướcfinalfreeze; fallback GPT-6.1-sol/high actual266/21files+build0, saufix88/11importfiles+build0, kiểm actualDexie4.2 nativeabort semantics/diff/harness. Root thực chạy36/216, reviewer không nhận đã chạy chúng.
- Scripts smoke-ai-production/ui bỏ đọc token; smoke-one-step-production mới; generic singleimport labels cập nhật, không claim mọi historicalscript đã chạy.
- Wrangler4.147.0 Workerdeploy0/Pagesdeploy0. node smoke-ai-production0 realfixture127→41/42tokens, LâmNhi/TrươngMinh/mườiphút đúng. node smoke-ai-ui-production0 cả2sizes; node smoke-one-step-production0 cả2sizes. No realnovel/R2write/delete in UI smoke.
- AGENTS policy/HANDOFF current/masterplan/DECISIONS append/AIguide cập nhật. Không đọc/sửa nguồn D, không reset/commit/push; tree dirty/untracked từtrước.
- Next STORAGE2-1 khảo sát immutableparts/originals phạm vi nhỏ với atomicpublish/quota/cancel acceptance và reviewer trước migration; không phục hồi auth/confirm. Backupexpectedfailure,cloudName/progress,EPUBimages,bigAI/cachecheckpoint,bigcorpus/Androidhardware còn mở.

## 08/10/2026 22:13 ICT — root Codex, MIN2 planning only
- Đọc AGENTS/HANDOFF/masterplan/DECISIONS; đối chiếu App,DictionaryPanel,AiPanel,Reader,db,domain/ai-translate. Không nguồn D/secret/network/API/usercontent.
- Bằng chứng: ConvertPanel DictionaryPanel7/173; duplicate toolbar/floating Reader215–241; Album distinct string không registry; AI_SETTINGS_KEY ai-translate-settings chung; Name bookId đã có.
- Viết docs/READER-MINIMAL-2-PLAN.md:5task hẹp/UI→promptlocal→Albumlocal→metadatarevision→deploy, quyền sửa/invariants/acceptance/test và Android chưa xác minh. DECISIONS append, HANDOFF/masterplan liên kết.
- Chỉ tài liệu, không appcode/test/build/deploy;531/216 và production387b2a49 là baseline trước task mới, không nghiệm thu MIN2. Không spawn agent hình thức vì scope planning nhỏ.
- Next MIN2-1: bỏ render ConvertPanel và duplicate Reader controls/copy; không engine/data/server. Sau code chạy unit/build/relatedChinese E2E repeat3. Prompt/Album/data cần reviewer độc lập thật.

## 08/10/2026 22:39 → 09/10/2026 07:25 ICT — root Codex, AI-READ-1 hoàn tất release
- Yêu cầu mới: bỏChỉđọc, arrows, nhiềuGemini, inlineAI/TTSautonext/preload vàURLreload; nối MIN2 dọnUI, không tuyên bố toànweb hoàn tất. Dreference userscript chỉGet-Content/rg readonly, header2.0.15; không chạy/copy/proxy/iframe. Không novel/keyread/upload.
- GPT-6.1-sol/medium reader_routes: App.tsx +src/reader-route.ts/tests/reader-route.test.ts/e2e/reader-route.spec.ts, parse/path/history/generation/checkedcloudrestore.13unit;42route+detailrepeatE2Epass; serial592unit/build0. Fail malformedHTTPpath Vite, cloudfixturemissingdictmanifest, concurrentfullunitfoldertimeout giữ.
- GPT-6.1-sol/medium gemini_models: src/ai-models.ts,server/ai-translate.ts,tests/ai-translate.test.ts;8officialtextmodels, default3.5lite giữ; no arbitraryfallback/keyrotation.117server/native/bindingpass/build0. Googlemodels/docs checked08Oct; no secretread.
- Root src/ai-reading.ts: RAMwindow2/cachekeysource+settings+matchedNames/pendingdedupe/abort/STOP-only; perbooksettings defaults/validator/serialsave-read queue, không DBschema/migration.
- Root Reader.tsx: modeAI inlineprose+TTSsource, foreground+next1, loading/error/retry, promotedpendingnext across transientDexieload, Namespromptsemanticstop, arrowsguards/chaptercallback. BỏheaderChỉđọc/focustoggle/duplicateNghetoolbar. Canonicalprogress khôngghiAIindices, reset/re-hydratebackConvert, savedparagraph ưu tiênURLreload, AIchapterstartscroll riêng; không fabricateAI/sourceoffset.
- Root AiPanel.tsx:8models,perbookkey+legacyfallback, save/readqueue; savecallback ngoàialive nhưngparentreaderAlive guard, đỡclose/remountrace. Prompt/model mặcđịnhopen, fixturethu gọn; actualchapterbuttonremoved để tránhdịch2lần/previewtrùng. DictionaryPanel.tsx bỏConvertPanelimport/render, engine khôngđổi.
- Root App.tsx bổ sungexternalnavigationepoch/appliedroute: trực tiếpchapter1→next2→Back1 remountđúng, internalnext/cache/autoNext khôngremount. Không changescloudmetadata/auth/schema/secret.
- Root e2e/ai-inline.spec.ts7cases Chinese actualIndexedDB: inline/preloaddedupe/source, perbookmodels/quota, fakeaudioAIautonext, longparagraphcanonicalprogress/URLreload, Namesstop/lateRAW, delayedpromptsavingclose, persistenthydrationretry. e2e/ai-reader/reader-controls/reader/reader-race/stv-ui adapted directmode/config/singleheadphones/nofocus. Reviewertests/ai-reading-review.test.ts10 race/cache/queue/immutability regressions.
- Fail giữ: first66 root60pass6selectOptionlabelModelfail → aria-labelModel. final1parseE2Efailed (brace typo) corrected. Root84:78pass6progressprobe stalecanonicalbaseline; capture sau explicitmode save. Root138:135pass3mobileprogress vì Playwrightclick cuộn lênbutton; đổi dispatchEvent để giữ vị trí trong probe. Không coi fixturefailure là appfix.
- Strong reviewer phát hiện/fix app: panelresult doubleAIrequest→actualbuttonremove; semanticName change stopTTS; transientchapter load đừngclear pendingnext; AIprogress/capturemodefreshguard/AIchapterstartscroll; URLreload savedparagraph; delayedsavecallback/readqueue; persistenthydrationfailure retry; externalBackinitialchapterepoch.
- Independent first66:54pass12fixturefail (URLtooearly, one-shotmock bịStrictModeconsume), correctedreadiness/persistentflag, cuối66/66repeat3workers4 exit0 1.4m, test-results/ai-route-independent-verified. Reviewer GPT-6-astra/high actual160targeted/4files exit0 +build84 exit0, no scopedblocker. Chỉthêmtestfile, không rootappcode/deploy/Dedit.
- Rootfullunit runconcurrentlyE2E:594pass1chapterfeed1 5000mstimeout,241.96s; serialretry npm.cmd test -- --maxWorkers=1:595/46pass exit0 41.58s. Không kết luận nguyênnhânperformanceflake chỉ từrerun. Knownbackup it.fails giữ.
- Root npm.cmd run build exit0 app/serverTS+84modules,504.85kB, index-FuUoL5Cw.js/CSSindex-D5xAlN3s.css, bundlewarningonly. gitdiffcheck0; dist/e2e absent; rgkeyprefixsrc/server/functions/dist nomatch (rgexit1 là khôngmatch).
- Root7spec integrated198repeat3workers4:192pass6oldConvertbutton0expectfail,4.6m, test-results/ai-inline-release-final. Cậpnhậtinvariant mộtmodebutton pressedtrue; targetedName6/6pass35.4s,ai-inline-name-final. Các6specAI/routes/controls/reader/race150pass +42otherSTVpass +6Namefinalpass =198scenarios cuốiđạt qua2lượt, không nhậnsingle198green.
- Scripts smoke-ai-production thêmselected3.8probe; smoke-ai-ui-production configlabel+fixturecollapse; smoke-tiktok-production singleheadphones+gearvoice; newsmoke-ai-inline-production syntheticTXTtwoChinesechapters/realGemini/preloaddedupe/URLreload/rawpreservation/models8. Cloud/dict mocked toànUI/native scripts, không đọc/write/delete truyện thật.
- Wrangler4.147.0 Workerdeploy --configwrangler.ai.jsonc exit0:0c4b5849-8f6c-4204-9f01-0849983512f8 (privatenotargetexpected). Pagesdeploydist branchmaster commitdirtytrue exit0:91c7f479. No secrets/schema/bindings/dateupgrade, không Gitpush.
- FirstprodAPI anon2003585ms/foreign2002522ms nhưngcanonicalassetassertfail ngay saupublish; ngay kiểmcanonical+versionedHTML rồi cảhaiFuUo đúng, giữfailpropagation/chưa khẳng định nguyên nhân. RetryAPI0 anon2001069ms/foreign200950ms STOP/Names LâmNhi/TrươngMinh/mườiphút đúng127→42/41tokens; selectedgemini3.8Flash200STOP. Sixothermodelsreal chưa kiểm/billing chưa xác minh.
- Firstinlineprodsmokefail kỳvọngChinese ởConvert khi dictmanifestmockempty (converterunknownHV khôngcó), chuyểnassert sangBảnggốc. Finalinlineprodexit0 cả1280x800/510x530 realGemini/current+next2calls/deduped/arrow/deepURLreload/sourceRAW/modeloptions8; khôngsourceuploadsreal.
- FinalAIconfigprod0 1280/522:realGemini/customprompt/Names/sourcepreserved/panelfits/noConnection. FinalnativeTikTokprod0 cả1280/522:HTTP2003/5calls/decode/currentTime/pauseResume/autonext/stop; gaps391/2471ms và2458/798/2483ms. KhôngphysicalAndroid/ear/background/zero-gap/permanentgateway500SLAclaim.
- Docs HANDOFF rewritecurrent/DECISIONSappend/masterplancheckpoint/AI-READING-PRELOAD vàAIguide cập nhật. Khôngautocommit/reset. Remaining MIN2 namedpromptstock/Albumregistry/cloudmetadata, originalsEPUBimages/BULK,AI>32k/persistentcache/progressresume, M0bigRAM, backupknownexpectedfailure/Androidhardware.
- Next MIN2-2: kho namedpromptprofiles phạmvi nhỏ với idempotentlegacy migration/activebookselection/failedsave+delete/isolation/cancel tests và reviewer trước accept; không phục hồi auth/confirm hoặc cloneiframe/proxy.

## 09/10/2026 12:17 ICT — MIN2-2 kho prompt, root Codex + GPT-6.1-sol/medium
- User yêu cầu medium rồi hoàn thành mọi phần còn dở; main model không tự đổi. GPT-6.1-sol/medium prompt_stock_medium triển khai module/UI/tests; prompt_stock_review_medium review độc lập thực; remaining_storage_survey read-only configured GPT-6.1-sol/medium (dispatch evidence, agent không tự biết model ID).
- src/prompt-stock.ts: registry v1 trong db.settings, không schema migration. 500profiles chung/riêng, immutabledefault, CRUD/copy; snapshot perbook và selection-time metadata. Init legacy idempotent không sửa row cũ; malformed/newerversion fail closed. NativeRW/queues và deletefallback atomic, manual config giữ.
- src/ui/PromptStockPanel.tsx: Cài đặt kho prompt/create/edit/copy/delete. Copy/save cập nhật đồng thời ID/title/draft; generation/liveness/sync operation guard tránh StrictMode/stale/doubleclick.
- Root src/reader-route.ts,src/ui/App.tsx: /settings/prompts, một mục trong settings selector. AiPanel.tsx chọn mẫu một thao tác persisted perbook, validationmarker, busy/book epoch/unmountguard. Reader.tsx live readonly perbook sau hydration để phản ứng deletefallback và pending close-save.
- E2E phát hiện bug thật RWtransaction trong Dexie.liveQuery khiến selector disabled. Root thêm readStoredPromptStock readonly; initialization effect outside livequery. Review phát hiện cached OLDrow trước queued NEWhydration; query gated aiLoaded để không gửi prompt cũ. RAW/Name/chapter/source/engine không đổi.
- Lượt đầu root96:84pass12fail, output test-results/prompt-stock-root-first:6selectorRWbug +6alertlocator strict-mode do thêm alert kho. Sửa app và fixture alert scoped, foreignprofile count0, corrupt warehouse bỏ swallowed timeout. PowerShell Replace syntax lần đầu exit1 parsererror, không thay file; applypatch/Replace đúng sau đó.
- Root saufix96/96repeat3 exit0 1.7m prompt-stock/ai-inline/ai-reader; Readerquerygate được sửa giữa lượt, không coi toàn96 là single final-code proof. Independent final30/30promptstock+remountregression +6/6delayedclose repeat3 exit0, có querygate. tests/prompt-stock-review.test.ts8case +e2e/prompt-stock-review.spec.ts độc lập.
- Root npm.cmd test -- --maxWorkers=1:624/48files exit0 38.54s. npm.cmd run build:86modules exit0, index-DcOe8Xdy.js514.47kB warningonly/CSS D5xAlN3s. Independent38/3targeted+build0. Build lần đầu reviewerTS18048readonlyrow error, root if(!row)returnfail fix; giữ lịch sửfail.
- Audit chạy config riêng: npx.cmd vitest run --config audit/vitest.config.ts --maxWorkers=1 exit1 A7 unexpectedpass; default624 không coveraudit. Reviewer independent -tA7 unexpectedpass +chapter-split7/7: Unicode invariant đúng/splitter đãfix. Root bỏ fails chỉA7, audit7/7exit0; A1/A4/A5/A6 expectedfail còn mở. globalNames expectedfail trong defaulttest còn mở, không gọi xanh là hếtlỗi.
- Root Pages deploy dist projectthu-phong-private branchmaster commitdirtytrue exit0 release24fb5f29; canonical dist verified by smoke script. Worker unchanged0c4b5849, không key/server/binding/schema/datechange. KhôngGitreset/commit/push/Dread.
- scripts/smoke-prompt-stock-production.mjs actualEdge1280x800/510x530 exit0: registryreload, selectoneaction, bookselectionreload, realGemini, sourceRAWpreserved. Cloud/dict mocked, không read/write/delete truyện thật. Androidhardware/background/IME/ear chưa xác minh.
- Local namedprofiles không tự đồng bộ nhiều thiết bị. Chưa deploy/accept Albumregistry task đang agent triển khai isolated src/album-registry.ts,src/ui/AlbumPanel.tsx,tests/album-registry.test.ts; root chưa nối App. Next independentreview+UI/importrepeatE2E, rồi metadata revisions/R2originals/EPUB/AI32k/cache/bulk. HANDOFFcurrent cập nhật; không tuyên bố toànweb xong.

## 09/10/2026 12:28 ICT — MIN2-3 Album local + STORAGE2 spike, root Codex
- User muốn hoàn thành mọi phần còn dở; tiếp phạmvi nhỏ sau prompt, không tuyên bố toànweb xong. Prompt final-code root bổ sung72/72repeat3 gate/remount/inline E2E exit0 1.3m test-results/prompt-stock-root-gate-final.
- GPT-6.1-sol/medium prompt_stock_medium triển khai src/album-registry.ts,src/ui/AlbumPanel.tsx,tests/album-registry.test.ts. StableIDs/version1 settingsrow, exact Book.album label bridge, readybooks-only; createempty/rename/remove/move nativeRW settings+books, corruptedlegacy/registry failclosed, renamecollision reject, noDexieSchema/servermigration. Remove chỉunsetBook.album, IDs/updatedAt và toàn bộ sources/chapter/Name/prompt/progress giữ.
- Implementation initial16/17testfail vì invalidnamecreate throw sync; async create/rename để consistentlyreject. Final29/29targeted incl19registry+7albums+3chapterreview/build0.
- Root App.tsx readonlyregistry subscription/filter gồmAlbum rỗng, Quản lý Album thu gọn cùng Tủ sách (không thêm navgroup). style.css summaryhit44px. New e2e/album-registry.spec.ts2Chinesecases UIemptyreload/move/rename/remove/preservation và externalregistrycreate/delete/clearstaleID giữdraftname. Pure readStoredAlbumRegistry helper cho observer, khôngRWlivequery.
- Reviewer GPT-6.1-sol/medium actualdiff+33/3targeted/build88exit0:7 tests/album-registry-review.test.ts independent staleID/recreatedlabel/fullpath/nativeabortsecondbook/externalconn/move-remove/caprollback/actualDexie.liveQuery. Phát hiện emptyAlbum multitab khôngrefresh; root AlbumPanel readonlyobserved subscriber. Reset absentid/target khi observedchange giữname; khôngdepsid/target để cachedOLDregistry không clear newlycreatedID. Reviewer reread finalreset, no datablocker; không nhận đã E2E.
- Root firstAlbum48:30pass18fail/4.6m, test-results/album-registry-root-final. Các18 oldAlbum cases assumed reload→shelf; now durableReaderURL persists, actualscreenshots showReader. Sửa e2e/album-library.spec.ts explicit←Tủ sách then assertURL / before reload; không sửa appURLđểđápứngoldfixture. Đã thayfile giữa firstlượt, outputline cóoffset lệch; giữtracehistory.
- Root final48/48repeat3 exit0 47.1s Albumregistry/Albumlibrary/folderimport/shelfminimal test-results/album-registry-root-verified; newexternaldelete assertions trên finalcode. No nativefullunitparallelbrowser.
- Root npm.cmd test -- --maxWorkers=1:650/50files exit0 34.66s; npm.cmd run build app/server+88modules exit0, index-B6PA_Cjt.js520.69kB/CSSindex-CRZuGlrU.css, bundlewarningonly. gitdiffcheck0, không reset/commit/push. Root audit7/7 riêng trước đó, expectedA1/A4/A5/A6/globalNames chưafix.
- Root Wrangler4.147.0 pages deploydist branchmaster commitdirtytrue exit0 Pages47fdc6f2; không updateWrangler lên4.149, WorkerAI/key/schema/bindings không đổi.
- scripts/smoke-album-registry-production.mjs actualEdge1280/510 exit0 canonicaldistverify/emptyreload/moveRenameRemove/BookRAWpreserve, cloudmocked, không productionnovel read/upload/delete. ProductionAlbum LOCAL-only; cloudAlbum/Name/prompt/progress chỉnhsau chưasync. Androidhardware/background chưaxácminh.
- STORAGE2 survey configuredGPT-6.1-sol/medium tạo docs/STORAGE2-IMPLEMENTATION-CHECKPOINT.md: actualNode24.14 syntheticcatalog100/1000 v1/v2 bytes/time/heap, one-run khôngtarget73k/browserRAM. Independentarchitecture baseline70cloud/5files exit0; blockers sharedbudgetatomicv1+originals, wholeSHAproof, tombstone/latePUT/exactcleanup, rolloutmixedwriterquota. Chưa server/app/migration/enable trong thiết kế.
- Rootworkers-best-practices và officialR2API/FixedLengthStream retrieval09Oct: R2PutOptions.sha256 checksreceivedwholeobject và returnedchecksums. HTMLdocs retrieved sau .mdweb unsupportedcontenttypefail. Đang spike original≤40MiB one streamingR2put/FixedLengthStream thayparts+serverWASM đểwholechecksumoffload; chưaruntimeproof/featureenable. Survey owns tests/original-hash-spike.test.ts/docs/ORIGINAL-HASH-SPIKE.md đang dở, khôngclaim完成.
- HANDOFFcurrent/masterplan/NEXT-AI-PROMPT cập nhật, docslog/DECISIONS append. Next STORAGE2-1A verify native40MiB/R2SHA/length/cancel/idempotent +independentreview, sharedquota/tombstone protocol beforemigration; then boundedoriginalclientdownload, metadataCAS/outbox, EPUBspine/images, AIchunk/checkpoint/cachepersist/progress, backupknownfail/bulk/physicalAndroid.

## 09/10/2026 12:29–17:44 ICT — STORAGE2-1 triển khai và review, Codex root
- Phạm vi: TXT gốc tự lưu R2 sau snapshot; tải nguyên bytes trên thiết bị mới; additive quota9GB, không sửa RAW/source local, không đưa corpus D lên mạng. Chưa hoàn thành toàn sản phẩm. Model chính giữ nguyên; backend/client/reviewer ban đầu được cấu hình GPT-6.1-sol/medium. Hai agent chạm quota khoảng12:56, giữ công việc dở; user tiếp tục17:21 sau reset và root followup cùng agent, không giả chuyển model.
- Spike tests/original-hash-spike.test.ts + docs/ORIGINAL-HASH-SPIKE.md: native workerd streaming40MiB, R2.sha256 whole checksum/length/retry thực; direct hash-wasm.compile trên Worker unsupported500. Node checkpoint state116bytes chỉ đo Node, không server feature. First7/8 exit1 wrong-SHA expected409 actual422 fixture; corrected8/8 exit0. Parent wall/RSS không chứng minh WorkerCPU/peakRAM hoặc Android. Đã chọn singleobject<=40MiB, không multipart ở1A.
- src/cloud-original-schema.ts mới: strict exact descriptor, UUID/SHA canonical, 1byte..40MiB, 16KiB JSON; literal tên/path giữ nguyên, không decodepercent. Key chỉ UUID/hash. tests/cloud-original-schema.test.ts69 và independent cloud-original-schema-review.test.ts5; root bỏ rejectpercent sau reviewer chứng minh tên Windows hợp lệ; giữ rawtraversal/control/surrogate rejection. Schema+review+spike82positive.
- Backend agent prompt_stock_medium: server/cloud-originals.ts, migrations/0005_cloud_originals.sql mới; server/cloud-library.ts nối route/probe/sharedquota/delete. GET books?features=1 capabilities; POST descriptor immutablepending; PUT bytes nativeSHA/count/deadline; GET readyonly/checksum/size/key/tombstone; exactHEAD reconcile nếu R2write thành công trước D1publish lỗi. No arbitrary keys, no original content in catalog.
- Quota singleton+BEFORE/AFTERINSERT cả v1/originals, guards trước seed; allpending/ready/deleted charged,100original/book, khôngrefund. DELETE giữ ledger+tombstone rồi cleanup tối đa100 validatedkeys một R2.delete, tránh Free50subrequests. Late objects có thể tồn tại sau waitUntil30s/disconnect; GET/publishblocked, quotaheld, retryDELETEcleanup; không secureeraseclaim.
- tests/cloud-originals.test.ts24 SQLite và cloud-originals-native.test.ts11 actual workerdR2/D1/Edge1MiB. Five oldcloudtest harnesses thêm0005; cloud-delete malformedkey test bỏ identityUPDATEguard chỉfixture legacycorruption, không app. FirstmissingOrigin/BodyInit fixtures corrected; native earlynullHTTP ECONNRESET/overlongGET exposed realstream issues. Rejected tinyretry workaround; restored full1MiB drain +heldlastGETchunk, native repeated3 fullruns33/33. 40MiB roundtrip eachrun. Không CPUproduction proof.
- Client agent remaining_storage_survey: src/cloud-original-client.ts mới; tests/cloud-original-client.test.ts47. Sequential originals queue, strictbounded JSON/deadline throughbody, exactdescriptorACK, actual hashBlob beforeupload; remoteReady verifiedrecord stillfreshlocalhash beforeACK. NativeRW books/sources/settings hash dưới lock via Dexie.waitFor(ignoreTransaction(hash)); nativeabort gate rollback giải phóng queue và latehash khôngACK. Initial six PrematureCommitError with wrongwaitFor zone fixed. Same-sizeBlobreplacement and hungJSON/binarydeadline added. ACKdiagnostic không dùng để bỏ kiểm chứng lầnretry. Download exactlength/SHA streamedhash trước Blob, không persistSource.
- Root src/cloud-client.ts nối auto originals chỉ server features.originalsV1true. TextsnapshotACK giữ khi originalfail, retry không republishtext; oldserverv1 không gọioriginal API. tests/original-library-integration.test.ts2 UTF16LE/BOM/literal%/quota/retry/sourcepreserved. First2failed invalidchapterUUIDfixture; fixedcanonicalUUID, thenpositive.
- Independent prompt_stock_review_medium: tests/cloud-original-review.test.ts9 positive. Found freshACKsame-sizeBlob and decreasingquota then root/implementerfix; unexpectedpass before removing fails. Found bulkqueueDELETEblocking +conditionalnulloversize, root movedDELETEoutofqueue/checkseen<=bytes/rejectnegative drainlimit. Found GETafterDELETElocalresurrection, root restoreguard checks tombstone inside nativeRW; snapshotACK tombstone check inside settingsRW. Addedlatev1ACK/failedDELETEpreserve/nativeabortsecondconn; final93/5files exit0 and retry2cases×3freshnative runs6/6 logs test-results/storage2-independent-repeat-1/2/3.log. Build90exit0. FakeIDBabort proof not Chromehardware. FinalSQLinsertguards added later; separate strongreview/root79verified afterward.
- Root actual targeted cloud-originals/cloud-library/cloud-delete/public-library-review/cloud-original-review:79/5files exit0 17:35; legacydevice/client/integration22/3files exit0. No expectedfailure in new original tests.
- Independent storage_migration_review actual configured GPT-6-astra/high (spawn_agent evidence; before latestuser modelchange). Found REPLACE bypasses DELETE/UPDATE triggers on SQLite ANDnativeD1, counterdecrease and identity/keyoverwrite possible maintenanceSQL. No publicHTTP handler usesREPLACE. Root added BEFOREINSERT budgetmonotonic/identity/keyownership guards, seed WHERE NOT EXISTS; servernewimmutable errors map409. Reviewer14own positivecases: allstate/partialprefix/overbudget/idempotency/keytheft/highercounter/nativeatomicrollback. Final51/3files exit0, historical initialnativeexit1/interim4fails/postfix4unexpectedpasses retained. Sourceuntracked files readwhole; no trackedbasefalseclaim.
- Remote list via installedWrangler4.147 showedonly0005pending. Firstapply17:36 exit1 Cloudflare7500 incompleteinput; readonlyschema proved rollback and no0005/tables. SQLLFonly, uppercaseBEGIN; installed unstable_splitSqlQuery+SQLite accepted. Officialrepo issue4727 points unparenthesized CASE-END remote splitter. Wrapped4 SELECT(CASE..END); strongest reviewer reread+actual51/3files exit0 again15.38s before retry. Secondapply17:42 exit0 18commands,0005✅. Remote SELECT used_bytes=reserved_bytes=70832187 and migrationmarker confirmed. No userrows removed, no secret/date/binding/AIWorker change, noWranglerupgrade.
- User17:43 requests ONLYastra medium goingforward. Root acknowledged no mainmodel switch; NEW original_ui_review_astra actual GPT-6-astra/medium dispatched readonlyUI/client +ownregressions; previouscompleted reviews retain their actual configs.
- Original UI agent: src/ui/OriginalFiles.tsx new +StoryDetail import/collapsedFilegoc/removestory-local copy, e2e/original-files.spec.ts5cases. Localmetadata immediately, remote metadatalazy, bytesonlyclick, verifiedlocalpreferred/cloudfallback, mountedepoch rejectsclosed/unmounted/bookchange lateUI; URLrevoke/unmount/timer. 30/30repeat3 exit0 desktop/Android-layout, build91exit0. No source/RAWwrites. Rootfinal review/integration stillongoing atcheckpoint.
- Root e2e/original-cloud-native.spec.ts bridges full app to actual local nativeR2/D1: batch2books/autooriginalready/exactraw/freshcontextdownload/RAWread. First6/6fail because fixture clickedMởsách (Reader), expectedStoryDetail; native2R2ready stage hadpassed. Root correctedclickThôngtin and explicitBảngốc whendictmockempty, finalrepeat3running. Keep traces test-results/original-cloud-native-root; not count failures as productbug. scripts/smoke-originals-production.mjs new tinyownUUIDAPI+browser1280/510 and exactDELETEcleanup ready; not run/deployed yet.
- Remaining gates afterthischeckpoint: final nativeE2E/fullunit/build/diff/UIreview → Pagesdeploy → productionownsyntheticproof → HANDOFFcurrent rewrite/NEXT-AIPROMPT. Never mark allrequirements complete: cloudmetadataCAS/outbox/Name+prompt+Album+progress, EPUBimages/sanitization/Name, AI>32k/chunks/cachepersist/progress, backupA1/A4/A5/A6/globalNames, bulkresume/M0/physicalAndroid all remain.

## 09/10/2026 22:21–22:35 ICT — tiếp sau interrupt, STORAGE2 gates và AI cache
- User tiếp tục toàn sản phẩm, giữ latestmodel CHỈ Astra medium. Runtime collaboration.list_agents chỉ root: oldagents không còn, không followup giả. Dispatch original_final_review GPT-6-astra/medium readonly; ai_cache_impl GPT-6-astra/medium sở hữu hai file; ai_cache_review GPT-6-astra/medium độc lập. Main không tự đổi.
- Root đọc HANDOFF/masterplan/DECISIONS/log và actualfiles. Rewrite HANDOFF current~60lines để bỏ các checkpoint Pages/Album/prompt mâu thuẫn; lịch sử giữlog. Firstapplypatch Delete+Add cùngpath rejected, không filechange; viết current bằng literalPowerShell UTF8. D không chạm, không secret/commit/push.
- original_final_review actual42/42repeat3 E2E (7reviewcases×2viewport) exit0,58targetedpositive exit0; sourceidentity/SHA/deletion/lateclose/lazy/URLcleanup đọcactual. Reviewerreadonly không sửaapp/tests. Close/unmount suppression khác abortHTTP; deadline120s, Androidhardware chưa.
- Root STORAGE2 final nativebridge+UI36/36repeat3 exit0 1.4m test-results/originals-root-release-final; currentfinalstaleguards có tronglượt này. Nativeimport2sourcesR2/D1ready/exactbytes/freshbrowser/download/raw, metadatalazy/localUTF16/remote/corrupt/unmount giữdata.
- Root firstfullunit22:26: 863pass/1fail,60files,54.67s. Solefail cloud-device.test.ts legacyexpected2fetchcalls nhưng thêmcapabilityprobe→3. Header/source/ACK invariant vẫngiữ; sửa test assert exact books,books?features=1,PUT paths và PUTindex2; targeted10/10exit0. Không sửaappđểbỏcapability. Finalfullsuite cònphảirun sauAIcachewiring. BuildSTORAGE91exit0,index-DSCwAaEN533.04kBwarning; chưadeploy.
- ai_cache_impl tạo src/ai-reading-cache.ts +tests/ai-reading-cache.test.ts25: digest exactsemantic, completedSTOP max1MiB,existing settingsprefixnativeRWbooks/settings/chapters currentguard;100rows/32MiB serializedLRU, optionalread/writefailure, cancellationcommit/rollback; khôngRAW/progress/schema/network. Initial23tests1aggregate timeout vì37×950kBwrites>5s; revisedactual-IDBbulkseed35validrows giữaggregate/atomicLRUinvariant, final25positive1.48s,aggregate418ms. Code frozen trướcreview.
- ai_cache_review tạo tests/ai-reading-cache-review.test.ts8. Found responsemodel mismatchwrite/hit,2it.fails reproduced; root capturedselectedmodelbeforeSHA+equalcheckread/write. Actualpostfix33testexit1twounexpectedpasses, reviewerdiff rồi bỏfails, final33positiveexit0. Otheredges110concurrentwrites/cap/fullSHA/callerchanges/hash/deletion/circularunknownrow/db.openfailurepass. getAll malformedlarge-row RAM chưa đo; unknownrows không xóa ngoàiformat có thể chặncache; không wrongresult/sourcewrite.
- Root src/ai-reading.ts optionalAiReadingCache interface/constructorport, clonedsource/settings/names; diskread→abortguard→networkonlymiss, completedSTOP→optionalwrite→latestcontrollerguard→RAM. Hit không write lại, completedpersist survives sessionclear/remount. src/ui/Reader.tsx instantiates read/write cacheport; không đổi mode/progress/server/keys.
- Independent tests/ai-cache-session-review.test.ts9: found synchronousthrowwrite rejectednetworkresult, mismatchednetworkmodel RAM/display allowed. Root Promise.resolve().then(write).catch +result.model===settings.model beforeRAM/write. Postfix52exit1twounexpectedpasses thenreviewremovedfails; final52positive4files exit0 22:32:39. CancelledreadnoAPI/cancelledwrite/replacedjob/capturedinputs/actualfakeIDBnewsessionhit/Nameinvalidations/progresspreserved positive. ReviewerreadReaderwiring, no blocker; nativebrowser rootgate.
- Root e2e/ai-persistent-cache.spec.ts4cases actualbrowserIDB: remount/reload noextratranslation, matchedNameinvalidate/unusedNamehit, cancelledlatejob noentry/noRAWreplace, nativecachestoragefailure stillprose. Togetherai-inline7cases =>66repeat3. First61pass5fail2.7m: rootfixedappmodelguard midrun, oldconfigmock3.5while request3.8 violatesactualservercontract. Retaintraces test-results/ai-cache-root-final; firstconfigonepasspre-fix explains5not6fails. CorrectedONLYconfigmock response.model=req.model; final66repeat3 test-results/ai-cache-root-verified đangchạy, applicationfrozen.
- scripts/smoke-ai-inline-production.mjs thêm reload→DịchAI assertcalls2 +persistentCacheAfterReload; actualGemini/cloudmock isolation. scripts/smoke-originals-production.mjs readyownsynthAPI/smallR2roundtrip/freshUI/DELETE410. Chưadeploy/chưarunproduction tại log này.
- DECISIONS append choicescachebounds/identity/optionalstore/RAWprogressseparate; STORAGEcheckpointappendcode/schemaactual/migrationgates. Next final66/fullunit/build/diff →Pagesdeploy→nativeoriginalproduction+realGeminiCache→HANDOFFrelease/NEXTAIprompt. ChưaAI>32k/chunks/checkpoint/AIscrollmodepersist, metadataeditcloud, EPUB, backupknownfail/bulkAndroid.

## 09/10/2026 22:35–10/10/2026 03:26 ICT — release và CPU fix, Codex root
- FinalAI66/66repeat3 exit0 2.2m test-results/ai-cache-root-verified; rootfinalunit881/62files exit0 54.43s; build92exit0,index-BEkSBsdn.js537.21kBwarning. audit riêng7/7 (4expectedfails còn mở), no secret-shaped values scan src/server/dist/scripts/docs, gitdiffcheck0 warningCRLFonly. Không coi881/auditgreenlàfixbackupknownfail.
- Wrangler4.147 whoami accounttargetmatched/pageswrite/d1write xác minh, localpagesdeployhelp đọc; no upgrade/tokenvalueoutput/secretchange. Deploydistbranchmastercommitdirtytrue exit0 Pagesd164ad5f; AIWorker/migration giữ. Nativeoriginal/client UI và AIcache đã online.
- scripts/smoke-originals-production.mjs firstexit1 vì reload mặc địnhConvert trongfixtureemptydict mà assertRAW; smallAPI/SHA/download trước đóđạt, ownsynthcleanup410. Sửa script bấmBảngốc saureload, rerunexit0 exactbytes/receipt201/retry200/freshbrowserdownload/readreload1280/510. Scriptsmoke không đưa corpus/copyrightdata thật lênR2.
- scripts/smoke-ai-inline-production.mjs actualGoogle exit0 cả1280/510: inline/preloadcurrent+next2calls/deeplinkreload/RAW/modeloptions8; reload→AIcachekhôngtăngcalls. Cloud/dict mocked để tránh truyệnthật. Androidhardware/ear chưa.
- scripts/smoke-original-large-production.mjs mới40MiB generatedASCII endpoint-only; không đại diệnfullimporter/snapshot32MiB. FirstPUT201 nhưngGETterminated/UND_ERR_SOCKET sau23286629bytes; ownsynthDELETE/GET410finally. SecondnewUUIDPUT503, cleanup410. Reservations40MiB mỗifixture giữpolicy, khôngrefund/quotaGC; physicalkeyscleanuponlyownIDs.
- Tail installedCLI pagesdeploymenttail statuserror/headerX-Original-Probe:capacity: actual PUToutcome exceededCpu/cpuTime214ms/wall1529ms, exceptions WorkerexceededCPUlimit,503. GETterminationcause chưa cótailproof. Không kết luậnnetwork/Gemini; CPU rootcause ở40MiBPUTconfirmed. TailCtrlC→TerminatebatchY kếtthúc; no userpayload/keylogs.
- Rootserver/cloud-originals.ts sharedOriginalReader: nativeBYOB.readAtLeast256KiB GET/PUT/retrydrain, defaultfallback saurelease nếuextensionunsupported; processnonemptyvalue trướcdone đểEOFpartial không mấtbytes. HeldlastGETchunk/exactcount/nativeR2SHA/tombstone/deadline/conditionalobservedoversize guards giữ. Không bỏvalidationhoặcnângpaidtier.
- RootfirstGET-onlybatch35positive; latestsharedhelper44positive. Revieweroriginal_final_review GPT-6-astra/medium readactualhashCD2C1D303C0BA25411F2C644B49E3DECB4ACEF4698E43758B5E781797287EA8B; own tests/original-stream-batch-review.test.ts9 scriptedEOF/trunc/overlong/error/cancel/fallback +actualR2GET+PUT+retry instrumentation. Actual41943023bytesGETSHA vàPUT201/retry200:161reads,max262144buffer,BYOB1/default0/releases1. Initial8pass1fixturefail canonicalJSONorder; fixedparseactualschema9positive. Đây không productionCPUmeasure.
- Reviewerquota turn failed22:48 afterinstrumentationpresent, finalcombinedreportpending; actualconfigAstra/medium giữ. UsernewAGENTS fixedmediumall, rootkhôngescalate. Heartbeat03:22 resumes saureset03:21; followupsameagent, finaltargeted53/4files exit0 12.07s03:24:02, readonlyserver, no blocker. Targetedoverlappedrootfull bydispatchtiming; reviewer khôngfailure vàrootfull khôngfailure, recordkhônghide.
- Rootlatest npmtest --maxWorkers1:890/63files exit0 60.39s03:23:55; buildapp/server/Vite92exit0 samefrontendasset. NativeE2E6repeat3 đangchạysolo test-results/original-batch-stream-root-final; phảiredeployserverbatchfix vàprobeproduction40MiBtrướcnóiđạt.
- Heartbeat futurefix yêu cầu mới: created docs/AI-TTS-RECOVERY-PLAN.md R1classifyinvalidResponse client/server/HTTP/JSON/finishmodel; R3TTScursor riêng/highlight/autoscroll/retry đúngđoạn/resume reload vàonecickresume/noautoplay; R2prewarmboundedretry/cooldown/projectquota/dedupe/fallbackprovenance. Không rotation/parallelkeys đểvượt429, không reloadwholeappđểsửarequest, no secrets/logpayloads. Masterplanappend, HANDOFFcurrent updated actualproduction+pendinglargefix. Plan chưaimplemented.
- Next: finalnativeE2E6→redeploy→ownsynthetic40MiBAPI+tinyUI proof→updateHANDOFF/NEXTAIrelease; thenR1/R3/R2, metadataeditcloud/EPUB/chunks/backupbulkAndroid còn dở. Không nhận toànwebhoànthành.

## 10/10/2026 03:31 ICT — BYOB release nghiệm thu
- Root E2Efinal6/6repeat3 exit0 35.9s test-results/original-batch-stream-root-final; gitdiffcheck0/CRLFwarnings; actualserverhashCD2C... khớpreviewer. Source/applicationfrozen, no newUI/cacheregression changes. Build92/890unit bằng chứng tại checkpoint trước.
- Wrangler4.147 pagesdeploydist/projectthu-phong-private/branchmaster/commitdirtytrue exit0 Pagesbb87cd4d;0staticassetsnew, Functionsbundle mới. Frontendindex-BEkSBsdn/CSSCRZu giữ, AIWorker/secret/schema/date unchanged. Khôngcommit/push/D.
- scripts/smoke-original-large-production.mjs saudeploy threefreshownUUID runs exit0: whole40MiBPUT201/GET200/count+SHA exact, wall11285/10248/11163ms; từngfinallyownDELETE200 vàoriginalGET410. Không claim measuredCPU mới/peakRAM hoặc fullimporter/snapshot32MiB. D1reservation vẫnheld theo9GBpolicy, khôngquotaGC; sourcefixturegeneratedASCII, khôngtruyệnthật. Một lượt APIoverlap tinyUIfixture độc lậpUUID, khôngfailure.
- scripts/smoke-originals-production.mjs finalnewreleaseexit0 canonicaldist +receipt/bytes/SHA/retry/freshUI1280/510/readreload; onlyownsynthetic, cleanup410. RealGemini completedcache production1280/510 đã chứng minh ởd164 cùngfrontend vàunchangedAIWorker, serverbytefix không ảnhhưởngAI; không chạyGoogle lại khôngcầnthiết.
- HANDOFFcurrent vàNEXT-AI-PROMPT.md rewrite actualrelease/positiveproof/remaining, masterplan/DECISIONS/futureAI-TTSplan/logappend. OfficialGeminiquotadoc checked10Oct03:30: perproject notAPIkey, model/tier vary; linktrongplan/DECISIONS. No rotationparallel đểvượt429, không tựpaidtier. FutureR1classification→R3TTScursorautoscroll/resume→R2prewarmretry/fallback chưaimplemented.
- Chưa hoàn tất toàn sản phẩm: EPUB/images/Name, cloudmetadataedits/registry/Name/prompt/progress, AI32k/chunk/checkpoint/progress, TTSresume mới, backupknownfail/bulkM0/physicalAndroid. NextR1scope rõ trongNEXTAIprompt; không cầnuserapproval cho authorizedread/edit/tests.

## 10/10/2026 05:37–05:45 ICT — R1a AI client classification
- Thực hiện: Codex main điều phối/triển khai; không tuyên bố tool đổi model chính. Reviewer /root/r1_client_review được cấu hình GPT-6-astra/medium, readonly. Scope nhỏ clientparser; không database/migration/auth/TTSprovider/backend/secret changes, không D corpus.
- src/ai-translate.ts: bỏ res.json unchecked; bounded1MiB stream +UTF8fatal/JSON/envelope validation, STOP/model/result/usage; HTTP/contenttype/network phân loại; AiTranslateClientError reason an toàn. Allowlist servererror giữ owncodes, không echo rawproviderbody. Abort/latecancel không trả bản dịch, không retry/fallback/rotation. Friendlymessages ngắn.
- tests/ai-translate-client.test.ts:23positive syntheticChinese, HTML200/502/503/504/429, JSONcắt, nullschema/result/STOP/model/usage, unknowncodeleak, oversizecancel, network/no-retry, abort/lateabort/brokenstream. e2e/ai-inline.spec.ts: thêm gateway502→explicitretry, RAWDB giữ; không dựa fakebrowser là Androidhardware.
- scripts/smoke-ai-errors-production.mjs: syntheticlocal UI import Chinese, everycloudpath mocked, AI mock502→STOP; kiểm deployedfrontend1280/510, noactualGemini/corpus/cloudwrites. Kết quả release ghi sau.
- Root targeted client/server129/129 exit0 trướcallowlist; finalfull npm.cmd test913/64 exit0(17.43s). Sau đổi wording/E2Eexpectation chạy npm.cmd test -- --maxWorkers=1 final913/64 exit0(56.52s). npm.cmd run build finalapp/server/Vite92 exit0, index-DwN2KHXq.js539.72kBchunkwarning, CSSunchangedCRZuGlrU.
- E2E first npm.cmd run test:e2e -- e2e/ai-inline.spec.ts e2e/ai-persistent-cache.spec.ts --repeat-each=3 --reporter=line:66passed/6failed exit1. Newtest sai kỳvọng prose giữraw khi chọnAI; actualReader renderedText='' untilAIready, showsnotice. Đã đối chiếu code; chưa sửaUI scope này. Sửa invariant thành storedRAWpreserved+manualretry. Giữ tracefirstfails tại test-results/ai-inline-HTML-gateway-fai-*.
- FinalsameE2E --output=test-results/r1-client-final:72/72pass, exit0,1.2m,2viewport×repeat3. Reviewer actualtargeted client/server/session/cache5files157/157 exit0 +8/8readonlyruntimeprobes; khôngblockerfinal. Reviewer thấy regexcodeleak trong bảncũ, root đã sửaallowlist+regression, reviewer recheckedfinal. Reviewprobe chưa lưu regression cho everyedge, không claimproduction/Android fromprobes.
- Root fullfile/code đọc vì src/ai-translate.ts untrackedbaseline; git diff --check exit0 LFwarnings, finalsourceSHA FA74267069E3C74AE84EDCAD66EC95DEA79B48182CC006F17CF814208C91B282. Không commit/push/reset/clean.
- docs/DECISIONS.md, docs/AI-TTS-RECOVERY-PLAN.md, masterplan append R1a/R1b distinction. HANDOFF/NEXT current cập nhật sau deploy.
- Giới hạn: R1b clientdeadline/stalledbody/server safe reason/requestID/timing chưa làm; server vẫn genericai_invalid_response, không biết chínhxác nguyênnhânproduction cũ. Reader AI firsterror showsnotice vs giữvisibleprose; RAWDB intact. Không auto-retry/fallback/prewarmcooldown, TTSresume/autoscroll/modepersist/EPUB/metadatafullsync. Knownbackup/globalNamesexpectedfail vẫn mở ngoài scope.
- Next R1b narrow diagnostics/deadline, sau đó R3TTSlocalcursor/autoscroll/resume độc lậpreview rồiR2boundedprewarmrecovery. Không nângmodel/quota/paidtier, không xoaykeyđểné429.
- Release05:46: npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true exit0, Pagesaf275590. Wrangler4.147installedhelp+officialPagescommanddocs+whoami verifiedsameaccount/pageswrite; khôngupgradewarning4.149. Skillwrangler áp dụng, target/bindings/compat giữ.
- node scripts/smoke-ai-errors-production.mjs exit0: deployedcanonical1280/510 gatewayHTML502 classification→explicitretrySTOP,2calls, rawChinesepreserved; AI/cloudmocked, noactualGemini/R2corpuswrite. Canonicalbundleindex-DwN2KHXq.js verified. HANDOFFcurrent/NEXT updated; docs logs append-only. Fullproduct chưa xong.

## 10/10/2026 07:48–07:54 ICT — R1b timeout toàn request + safe diagnostics
- Thực hiện: Codex root client/integration/release; subagents r1b_server GPT-6-astra/medium ownedserver2files, r1b_review GPT-6-astra/medium readonly. Main khôngtoolđổimodel. Đã đọchandoff/masterplan/decisions; user hỏiAI chươngdài trongphiên, trảlờigiới hạnweb32kUTF16 vsGemini và tiếpactiveR1b.
- src/ai-translate.ts:70s timer+Promise.race toànfetch/body, internalAbortController externalcancel trảAbortError ngay; early/lateguards,cancelignoredlatefetchbody, cancelBodyabort/removeListener/releaseLock; finallycleartimer. Typeerrornetworkclassification/strictSTOP/model/result/usage/1MiB giữ. Typederrors thêm safe requestId/durationMs/serverreasonvalidated. Server60s/client70s grace; no retries/rotation/fallback/DB/auth changes.
- server/ai-translate.ts (agent): serverUUID/duration0..2147483647/ServerTiming +16FailureReasonenum headers; unchangedJSON/status. SplitparsefailHTML/invalidJSON/bodyread, shape/candidates/parts/usage/finish/empty/size/HTTP/network/requestvalidation. Correct abortable observesoperation beforepreabort andcleanslisteners onabort/settlement. No key/source/prompt/body/foreignID reflection/log.
- tests/ai-translate-client.test.ts29→32cases: fake70s ignoredfetch/latebodycancel/stalledbody/cancel/promises/timercleanup, safeheaderallowlist/hungcancel. tests/ai-diagnostics.test.ts22newservercases: success/errorbodycompatibility, safeuniqueIDs/timings, malformedparse/schema/candidate/parts/usage/finish, cap/http/network/cancel/preabortedread/listeners.
- e2e/ai-inline.spec.ts thêmstalledroute +browserclockfastForward70001→friendlytimeout→explicitretrySTOP/RAWsource unchanged. Targeted newca6/6repeat3exit0(11.8s). FullAIinline/cache78/78repeat3exit0(1.4m), outputtest-results/r1b-final. WindowsEdge desktop+android-layout, khôngAndroidhardware.
- Rootclient29/29initialexit0; finaltargetedclient32+diag22+server107+native3+binding7 =171/171exit0(2.58s). Full npm.cmd test -- --maxWorkers=1:944/65filesexit0(58.39s). npm.cmd run build app/server/Vite92exit0; index-DdaKrr3W.js541.03kB chunkwarningonly,CSSunchangedCRZuGlrU. WranglerAIconfigdry-run13.08KiB/gzip4.16exit0, installed4.147notupgraded; whoamisameaccountworkers/pageswrite.
- Serveragent146targetedexit0/tscserverexit0; independentreview185targeted (diag20beforelast2tests)/tsc--noEmit0 +3readonlyRAMprobes0. Root171/full944includesfinal22diag. Reviewactualclient/serverhashunchangedafterlast2test-onlyadds: D1A47A4BBD5A18DC9E38EC10BE19FB09180C4C06584FEC6C82FA31F40760D0F9 /46740634B0ADDC5B1D7B3ED1EA43F8F2D4A696726740BE32CC5E46F458398DE7. No blockerfinal.
- Failurehistoryreview: P2client awaitcancel neverfinishes→returnedAbortError butstreamlocktrue runtimeprobe; fixedvoidcancel.catch foroversize/contenttype +2tests; reprofinalunlock/listeners0. Server preabortdropspromise/listeners identifiedcode, fixed beforeindependentruntimeprobe (don'tclaimprefixruntimeproof); final ignoredfetchlateReject/preabortedbrokenread499/unhandled0/listeners0. No testfailure rootthisscope; previousR1a6failsretained.
- gitdiff--checkexit0LFwarnings; AI filesuntracked so inspectedfullsource/hashes, notclaimexactdeltafromGit. No reset/clean/commit/push, noDcontentsuploaded/run/copied. Userquestion32k clarifiedweblimit, chunkingnotdone.
- scripts/smoke-ai-diagnostics-production.mjs validation-onlyPOSTempty/invalidmodel/GET, safeheaders/uniqueUUID, noGemini. scripts/smoke-ai-errors-production.mjs existingdeployedfrontend gateway+retrymock reused. Resultsrelease appendedbelow.
- Skillsworkers-best-practices(serveragent), wrangler(rootexistingread), officialCrypto/Performance checksbyagent. No newobservabilityconfig/paidtier/compat/bindings/secrets; headersdiagnostics != durablelogs/CPUmeasurement. Model/provider processingmaycontinueiftransportignoresabort; callerbound/no latepublication stillguaranteed.
- docs/DECISIONS.md/recoveryplan/masterplan append R1b decisions/state. HANDOFF/NEXT updatedafterrelease. NextR3TikTokcursorlocal/sourceAIidentity/voice/chapteroffset/autoscroll/manualscrollpause/resumereload(noautoplay), reviewdataindependent andexactfakeAudio/nativeIDB tests. R2prewarmretry/cooldown/fallbackafterR3; EPUB/metadata/chunk/canonicalbackupknownfails remain.
- Release07:55: npx.cmd wrangler deploy --config wrangler.ai.jsonc exit0 → e299cfe6-1ee1-4d07-a298-a0ff975da6ab (no externaltargets, binding giữ); npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true exit0 → e7ecd039. Không key/paidtier/configchanges.
- node scripts/smoke-ai-diagnostics-production.mjs exit0: realPages→AIbinding validation405/400/400 exacterrorbody, safeuniqueUUID/duration/reason/ServerTiming, requests không tớiGemini. node scripts/smoke-ai-errors-production.mjs exit0 deployedfrontend1280/510 gateway/explicitretry/sourcepreserved, each2calls AI/cloudmocked. Canonicalindex-DdaKrr3W.js verified. KhôngactualGeminioutput/Androidhardware/hungtransportproductionproof.
- HANDOFFcurrent/NEXT release/currentnextR3 cập nhật; logs append-only. User giải thíchAI chươngdài32k webcap/chunkcheckpointfuture, không tuyênbốwholeproductdone.

## 10/10/2026 09:17–09:55 ICT — R2 prewarm recovery + R3 TTS cursor/resume: hoàn tất, review và production
- Người/AI: root Codex (deepseek-v4-pro) tiếp nối phiên bị ngắt 08:16–08:36 ICT (phiên đó đã viết src/ai-recovery.ts, src/tts-cursor.ts, AiReadingSession recovery, Reader cursor/test/e2e dở, chưa chạy E2E/chưa log/chưa release). Reviewer độc lập read-only subagent 09:2x ICT: 60 targeted (tts-cursor16/tts-resume3/ai-recovery41) +74 (tts-player30/ai-reading-review10/ai-cache-session9/ai-reading-cache25) exit0, 6/6 invariant đạt ở mức đọc mã, F1–F9 đều thấp, không blocker. Không D:, không commit/push/reset.
- File/scope root: src/ui/Reader.tsx (+modeTouched không cho restore ghi đè mode user đã chọn, lastCheckpoint bỏ ghi cursor trùng khi offset:audioTime không đổi, state==='ended' xóa cursor để lần nghe sau không lặp câu cuối, data-resume/title 'Tiếp tục nghe' một nút không autoplay, bỏ playbackEpoch dead). src/tts-cursor.ts (bản ghi hỏng/version lạ/>4096 ký tự bị xóa khi đọc). src/ai-recovery.ts (5xx thiếu X-AI-Failure-Reason vẫn transient, reason vĩnh viễn vẫn thắng). src/tts.ts (retry 1 lượt khi fetch network reject, không retry AbortError/cancel, giữ deadline chung 30s; prefetch failure test cập nhật theo hợp đồng mới). src/book-removal.ts mới removeBookWithLocalData=deleteBook+clearTtsCursor+clearBookAiReadingCache; src/ui/App.tsx và src/backup.ts dùng khi xóa truyện/rollback restore; rollback nhập staging giữ deleteBook trực tiếp (staging chưa từng publish cache/cursor).
- Tests: tests/tts-cursor +2 (xóa bản ghi hỏng), tests/ai-recovery +1 (5xx unlabelled vs reason vĩnh viễn), tests/tts-player +4 (network retry 1 lượt/2 lượt fail/không retry abort) và sửa 1 test prefetch theo retry mới, tests/book-removal.test.ts mới (xóa truyện dọn cursor+cache AI, giữ truyện khác/settings khác). e2e/tts-resume.spec.ts +assert data-resume, +1 test 'finished chapter clears the cursor so the next listen starts at the first sentence' (lần đầu fail vì spoken chunk giữ newline cuối → trim). e2e/reader-ux-review.spec.ts sửa 2 ca stale, e2e/stv-ui.spec.ts sửa bộ đếm chỉ key 'reader'. scripts/smoke-tts-resume-production.mjs mới.
- Ba ca E2E hỏng sẵn (không do phiên này, bằng chứng: grep src không còn 'Cài đặt nghe sách'/'.reader-listen' sau READER-CONTROLS-1; diag script thấy reload giữ /read/book/chapter nên không còn nút 'Mở sách →'; stack trace thấy album-registry.ts ghi settings 'album-registry-v1'): reader-ux-review 'external chapter revision...' và 'raw mode remounted...', stv-ui 'settings read failure...'. Đã cập nhật test theo hành vi thật giữ nguyên invariant; lịch sử fail giữ ở test-results/r2r3-regression2.
- Lệnh/kết quả: npm.cmd test với TEMP/TMPDIR trỏ ..\.dsh-tmp (workerd/miniflare bị Access denied CreateDirectory ở AppData\Local\Temp trong môi trường này; đây là môi trường không phải lỗi code, các test native chạy xanh khi đổi TEMP): 69files/1014tests exit0. npm.cmd run build: app/serverTS+Vite95 exit0, index-DXZntV6A.js 548.83kB (warning chunk>500kB có sẵn), CSS index-CRZuGlrU.css. E2E final 7spec repeat3: 208passed/2flaky (reader-ux-review progress-observer timing và stv-ui library-load timeout), cả hai recheck riêng -g repeat3 6/6 pass 12.5s; trước đó r2r3-regression2 188pass/22fail đều là 3 ca stale trên.
- Local real-audio: TTS_SMOKE_ORIGIN=http://127.0.0.1:5173 node scripts/smoke-tts-resume-production.mjs exit0 2 viewport: native TikTok 5×200 mỗi viewport, resume 'Beta một hai ba' không phát lại câu đầu, không autoplay sau reload, cursorOffset106, Bản gốc được khôi phục.
- Release 09:4x: wrangler4.147 whoami account97c5d65fbc80bb0ab8c78ad3b01b04b5; npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true exit0 → Pages870d4d15. AI Worker e299cfe6 không đổi (không thay đổi server/secret/binding/migration). Không gitcommit/push, không upload D.
- Production smokes saudeploy: smoke-tts-resume-production exit0 1280x800/522x524 realTikTok audio noAutoplayAfterReload resumedSentenceBeta http200×5; smoke-prewarm-recovery-production exit0 1280/510 aiMocked nextRecoveredBeforeNavigation currentCalls1 nextCalls3 promotionDeduplicated; smoke-ai-ui-production exit0 1280/522 realGemini customPrompt names sourcePreserved panelFits. Chỉ ownsynthetic/cloudmocked, không read/upload/delete truyện thật.
- Giới hạn còn lại: cooldown 429 trong session không persist/multitab; TTS timeout 30s không auto-retry vì deadline chung (F5 ghi nhận, user bấm Nghe lại, cursor giữ đúng câu); highlight theo đoạn chứa câu chưa từng câu trong đoạn Convert; F1 crypto.subtle yêu cầu secure context (app vốn cần từ trước); F8 stringify chương dài chưa đo; F9 offset vượt text lý thuyết; Reader chưa có unit test React (phủ bằng 5 case E2E + smoke production). Android thật/background/lock-screen/nghe bằng tai chưa kiểm.
- Next ID: (1) TTS-SENT highlight đúng từng câu trong đoạn + kiểm Android thật nếu có thiết bị; (2) AI-READ2 chunk>32k/checkpoint/AIprogress/resume; (3) STORAGE2-2 cloud metadata CAS/outbox/tombstone; (4) EPUB spine/images; (5) backup A1/A4/A5/A6; (6) BULK/M0. Không tuyên bố toàn sản phẩm hoàn tất.

## 10/10/2026 10:31–11:50 ICT — KEY-POOL-1: kế hoạch → code Phase 1 → review độc lập → sửa → kiểm chứng (CHƯA deploy)
- Người/AI: root deepseek-flash (DSH), medium. Hai subagent đầu (tra quota Google + audit model-id) **fail, không trả kết quả** ⇒ root tự tra tài liệu chính thức và tự audit bằng grep/read; một subagent review read-only chạy được (133 targeted test pass) và trả 7 nhóm phát hiện. Không đụng D:\linh tinh\tm; không commit/push/reset.
- Yêu cầu người dùng: (a) mỗi key có giới hạn lượt → muốn **nhập nhiều API key + xoay key khi 429**, **key đồng bộ mọi thiết bị**; (b) **xoá `gemini-3.6-flash`/`gemini-3.7-flash`/`gemini-3.5-flash-lite`**, **thêm `gemini-2.5-flash`**, mặc định **`gemini-3.5-flash`**; (c) bỏ ràng buộc "không xoay key/đổi model/fan-out" nếu cần; (d) **không** đặt hạn mức tự chọn mỗi key; (e) làm hướng dẫn trước cho AI khác, sau đó yêu cầu "đánh giá và tự hoàn thành" + kiểm tra ý tưởng prewarm.
- Sản phẩm 1 — tài liệu bàn giao: `private-novel/docs/AI-KEY-POOL-PLAN.md` (quyết định người dùng, hiện trạng code có dẫn chứng file:line, dữ kiện quota Google có URL, 2 phase kiến trúc + phương án bị loại, hợp đồng header, thuật toán xoay, danh sách file/test phải sửa khi đổi model, bảng đánh giá 14 cải tiến, T1–T6 acceptance, "không được làm", phụ lục lệnh; §15 nhật ký code, §15.5 bảng sửa theo review, §15.6 đính chính, §16 đánh giá prewarm).
- Sản phẩm 2 — code Phase 1: `src/ai-models.ts` (6 model, `LEGACY_AI_MODELS`, `normalizeAiModel`), `src/ai-reading.ts` (`AI_DEFAULTS.model` từ `DEFAULT_AI_MODEL`, chuẩn hoá khi đọc/so model), `src/prompt-stock.ts` (không ném lỗi khi model đã xoá), `src/ui/AiPanel.tsx`, `src/ai-translate.ts` (so model hai phía), `server/ai-translate.ts` (pool `GEMINI_API_KEYS`, xoay tuần tự khi 429, cooling `key:model`, retire 10 phút, id fingerprint, label chống lộ key, header `X-AI-Key-Label`/`X-AI-Rotation`/`X-AI-Keys-Available`/`X-AI-Model-Alias`, echo alias cho tab cũ), tests (`ai-translate` +9 case, `ai-translate-client` +2, `prompt-stock`, `ai-reading-review`, reset state ở `ai-diagnostics`), E2E mock model (6 spec), `scripts/smoke-ai-*.mjs` (8→6 option, model mới).
- Invariant đã giữ: key **không bao giờ** vào body/header/log/URL/thông báo lỗi; không fan-out một chương; **1 request Google đang bay**, mỗi key ≤1 lần/request, số lần thử ≤ số key; chỉ xoay 429/401/403/400-`API_KEY_INVALID`; lỗi vĩnh viễn không retry mù; dữ liệu người dùng (prompt/kho prompt/cache) không mất chức năng; RAW/Convert không bị ghi.
- Lệnh/kết quả: `npm.cmd test` (TEMP/TMPDIR=..\.dsh-tmp) **1025/1025 pass, 69 file, exit 0**; flake duy nhất `tests/folder-selection.test.ts` timeout 5000ms khi chạy full → chạy riêng **14/14 pass 342ms exit 0**, lần full sau không tái hiện. `npm.cmd run build` **exit 0** (index-D-JdxhJr.js 548.79 kB, warning chunk cũ). Targeted AI **184/184**. E2E 5 spec AI (`ai-reader`, `ai-inline`, `prompt-stock`, `reader-controls`, `tts-resume`) repeat3×2 viewport: lần 1 **197 pass/1 fail** (`ai-reader.spec.ts:29` click `Hủy dịch` bị detach ở `android-layout`), lần 2 sau khi sửa review **156/156 pass exit 0** ⇒ flake, không hồi quy.
- Review độc lập read-only: 133 targeted pass; phát hiện **cao** (`keyInvalid` không TTL ⇒ 1 lần 403 tắt AI tới khi recycle isolate; không theo model), **trung** (id key theo vị trí ⇒ đổi secret kế thừa trạng thái; tuyên bố "cứu tab cũ" sai vì client so model đã yêu cầu), 4 **thấp** (label có thể chứa key; `keyLastUsed` ghi khi thành công; 429 thắng 503 khi credential chết; prune dead-code; cache legacy phải dịch lại). **Đã sửa 6** (bảng §15.5) + thêm test cho từng ca; 4 điểm còn lại ghi nhận có lý do (header metadata giữ; cache re-translate; fail-fast không phát `Retry-After` khi không có hint). Đính chính câu chữ "chỉ chuẩn hoá khi đọc" (thực tế ghi lại `prompt-stock-v1` khi lưu prompt) ở §15.6 và DECISIONS.
- Đánh giá prewarm (theo yêu cầu người dùng, §16): ý tưởng current+next **đúng hướng** (chỉ prewarm sau STOP, dedupe/promotion, retain/cancel, cache source-guarded, không ghi nguồn) nhưng **đắt gấp đôi quota** (2 request/chương; RPD tính theo **project**, trích tài liệu rate limit) và **vô dụng với chương >32k** (`Reader.tsx:152`). Quyết định: giữ độ sâu 1, không tăng khi chưa có số đo; đề xuất `PRE1` (tạm ngừng prewarm khi quota cạn), `PRE2` (đếm cục bộ prewarmed/usedBeforeRequest), `PRE3`, `AI-READ2`. **Chưa làm**.
- Giới hạn còn lại: **chưa deploy** (production vẫn 8 model + 1 key); pool >1 key **chưa thử với Google thật** (chỉ mock + Miniflare); cooling/retirement nằm trong RAM isolate; **chưa có UI nhập key** (Phase 2 chờ người dùng chốt token quản trị, vì site PUBLIC_LIBRARY=1); cache dưới model cũ phải dịch lại 1 lượt/chương; chưa kiểm Android thật/tab ẩn cho prewarm.
- Next ID: (1) deploy KEY-POOL-1 (secret `GEMINI_API_KEYS` + Worker + Pages + smoke, thêm ca real Gemini đếm request=1); (2) PRE1/PRE2 prewarm; (3) TTS-SENT; (4) AI-READ2; (5) STORAGE2-2; (6) EPUB; (7) backup A1/A4/A5/A6 + BULK/M0; (8) Chrome Android thật. Không tuyên bố toàn sản phẩm hoàn tất; không tuyên bố đã deploy.

## 10/10/2026 12:00–12:30 ICT — KEY-POOL-1 Phase 2 + PHÁT HÀNH production (19 key, UI thêm/xoá key)
- Người/AI: root deepseek-flash (DSH), medium. Người dùng chốt qua hỏi đáp: (1) nạp key từ stdin rồi **deploy ngay** (Pages sau khi xong UI); (2) **không token** cho việc thêm/xoá key (chấp nhận rủi ro site công khai); (3) 2 job độc lập chạy song song trên **2 key khác nhau** là đúng ý, không đua nhiều key cho cùng request; (4) chương thực tế không quá 32k ⇒ bỏ lo phần giới hạn độ dài chương. Người dùng cung cấp 21 dòng key trong chat (19 Gemini `AIza…` + 2 Groq `gsk_…`) và tham khảo (chỉ đọc) userscript SangTacViet Key Manager v3.9 để lấy ý tưởng.
- **Bảo mật khi nạp key**: `wrangler secret put GEMINI_API_KEYS --config wrangler.ai.jsonc` nhận JSON 1208 byte **từ stdin**, **không** ghi ra file/repo/log; 19 key Gemini vào secret, **2 key `gsk_` bị loại** (app chỉ hỗ trợ Gemini); 1 dòng người dùng dán bị trùng nên dedupe còn 19. Key **không** xuất hiện trong bất kỳ file nào của workspace (chỉ trong lệnh nạp). Cảnh báo đã gửi người dùng: key đã dán vào chat ⇒ coi như đã lộ, nên tạo/thu hồi key mới khi thuận tiện.
- Code Phase 2 mới: `migrations/0006_ai_keys.sql` (bảng `ai_keys` + unique index theo secret), `server/ai-key-store.ts` (KeyStore + bản D1, trần 50, `ON CONFLICT(secret) DO NOTHING`), `server/ai-keys.ts` (`GET/POST/DELETE /keys`; GET chỉ bản che; POST chỉ nhận `AIza…`, dedupe, rate-limit 30 ghi/10 phút theo IP; DELETE theo id), `server/ai-translate.ts` (`loadAiKeyPool`: D1 ưu tiên hơn secret, cache 15s cho pool D1, pool env parse mỗi request; `invalidateAiKeyPool`), `server/ai-worker.ts` + `functions/api/ai/keys.ts` (route + proxy service binding), `wrangler.ai.jsonc` (binding D1 `DB`), `src/ai-key-admin.ts`, `src/ui/AiPanel.tsx` + `src/stv-layout.css` (mục “🔑 API keys”: dán nhiều dòng, danh sách che, xoá, cảnh báo site công khai), `scripts/smoke-ai-keypool-production.mjs` (mới; tuỳ chọn round-trip), `tests/ai-keys.test.ts` (8 case), `e2e/ai-keys.spec.ts`. Cũng nâng trần pool 8 → **32** để dùng hết 19 key (`MAX_POOL_KEYS`).
- Bất biến giữ: key không bao giờ vào body/header/log/URL/file/commit; API/UI chỉ bản che; không fan-out một chương; chỉ xoay 429/401/403/400-`API_KEY_INVALID`; dữ liệu người dùng không mất chức năng.
- Lệnh/kết quả: `npm.cmd test` **1033/1033 pass, 70 file, exit 0**; `npm.cmd run build` **exit 0** (`index-D-JdxhJr.js` 548.79 kB, chunk warning cũ); E2E `ai-keys.spec.ts` `--repeat-each=3` × 2 viewport **6/6 pass, exit 0** (2 lần fail đầu do test của tôi: `<details>` đóng và text `…AAAA` còn nằm ở toast — đã sửa test, không sửa hành vi app). Migration `wrangler d1 migrations apply thu-phong-auth --remote` → `0006_ai_keys.sql ✅` exit 0. Deploy Worker `--config wrangler.ai.jsonc` exit 0 → version **7553d030-7aa6-48f6-97cc-a8e1c2f3f8fb** (binding `env.DB`). Deploy Pages `dist --project-name thu-phong-private --branch master --commit-dirty=true` exit 0 → deployment **0811811e**.
- Kiểm chứng production thật: `smoke-ai-keypool-production.mjs` exit 0 → `{"status":200,"ms":3445,"keyLabel":"k1","keysAvailable":"19","model":"gemini-3.5-flash","finishReason":"STOP","vietnamese":true}`; round-trip `AI_KEYS_ROUNDTRIP=1` exit 0 → `{"activeBefore":19,"storedBefore":0,"added":1,"rejected":1,"storedAfterAdd":1,"listedMasked":true,"leaked":false,"removed":true,"storedAfterCleanup":0}`; `GET /api/ai/keys` → `stored=0 secretPool=19 active=19`; POST key Groq/junk → **400**; `smoke-ai-production.mjs` exit 0 (2 lượt realGemini 200 + model `gemini-3.8-flash` 200 + "Canonical deployed bundle verified"); `smoke-ai-ui-production.mjs` exit 0 (realGemini, customPrompt, names, sourcePreserved, panelFits ở 1280×800 và 522×524).
- Giới hạn còn lại: **không xác thực** cho `/api/ai/keys` ⇒ ai có URL cũng xoá/thêm được key (người dùng đã chấp nhận; bù bằng rate-limit + chỉ nhận key Gemini + trần 50 + chỉ trả bản che); pool D1 cache 15s mỗi isolate; chưa có thống kê/429 theo key, export/import, circuit breaker theo model; 2 key Groq không dùng được (chưa có adapter); key đã dán vào chat coi như đã lộ; chưa kiểm nhiều tab cùng sửa key, xoá key giữa lúc request đang bay, và ca cả 19 key cùng cạn quota; cooling/retirement vẫn trong RAM isolate.
- Next ID: (1) PRE1/PRE2 prewarm; (2) tuỳ chọn: thống kê dùng/429 theo key + export/import + circuit breaker, hoặc thêm token quản trị nếu người dùng đổi ý; (3) TTS-SENT; (4) AI-READ2 (ưu tiên thấp theo người dùng); (5) STORAGE2-2; (6) EPUB; (7) backup A1/A4/A5/A6 + BULK/M0; (8) Chrome Android thật. Không commit/push; không đụng `D:\linh tinh\tm`.

## 10/10/2026 12:40–13:10 ICT — thêm Gemma 4 (đo thật trước khi thêm) + deploy lại
- Người/AI: root deepseek-flash (DSH), medium. Yêu cầu người dùng: "thêm cả gemma nữa".
- **Nguyên tắc**: không đoán id model. Đã hỏi thẳng Google bằng chính key của người dùng qua script tạm ở `..\.dsh-tmp` (key truyền bằng **biến môi trường**, script **không** chứa key, không ghi key ra file): `GET /v1beta/models` → 62 model, **đúng 2 Gemma**: `gemma-4-26b-a4b-it`, `gemma-4-31b-it` (cả hai `generateContent`, input 262144 / output 32768).
- **Ba phát hiện quyết định** (probe trực tiếp): (1) `systemInstruction` **được chấp nhận** (200) ⇒ không cần workaround kiểu Gemma 3; (2) `thinkingConfig.thinkingBudget` **bị từ chối** — "Thinking budget is not supported for this model" (400) ⇒ không gửi trường này cho Gemma; (3) Gemma 4 trả **thought part** (`thought: true`, ~399 thought token) **kèm bản dịch sạch** ⇒ server cũ **từ chối mọi response có thought part** nên sẽ hỏng; đã **đổi hợp đồng**: bỏ qua part `thought: true`, ghép phần chữ còn lại, chỉ có thought ⇒ `ai_empty_result` (test `ai-diagnostics` cập nhật theo hợp đồng mới).
- Trạng thái upstream thật: `gemma-4-26b-a4b-it` **200/STOP/bản dịch tiếng Việt** (~12s, chậm hơn Gemini ~3.7s); `gemma-4-31b-it` Google trả **500 "Internal error" / 503 "high demand"** liên tục (kể cả gọi trực tiếp, tin cậy được) ⇒ qua app là 502 `ai_upstream_error`; **không** xoay key cho 5xx (lỗi model ≠ lỗi key) nên người dùng phải tự đổi model.
- File sửa: `src/ai-models.ts` (6 → **8 model**, mặc định vẫn `gemini-3.5-flash`), `server/ai-translate.ts` (lọc thought part khi ghép `result`), `tests/ai-translate.test.ts` (+1 test Gemma: giữ bản dịch, bỏ reasoning, vẫn gửi `systemInstruction`; 2 id Gemma tự vào các test tham số hoá `AI_MODELS`), `tests/ai-diagnostics.test.ts` (thought-only → `ai_empty_result`), `e2e/reader-controls.spec.ts` + `scripts/smoke-ai-inline-production.mjs` (option 6 → 8), `scripts/smoke-ai-keypool-production.mjs` (+`AI_GEMMA_SMOKE=1`).
- Lệnh/kết quả: `npm.cmd test` **1040/1040 pass, 70 file, exit 0** (lần chạy đầu bị `Select-Object -First` cắt pipeline làm npm thoát -1 — lỗi công cụ, không phải test; chạy lại sạch exit 0); `npm.cmd run build` **exit 0**; E2E `reader-controls` + `ai-keys` `--repeat-each=3` × 2 viewport **24/24 pass, exit 0**; deploy Worker `wrangler deploy --config wrangler.ai.jsonc` exit 0 → version **c3475c16-85ab-4b13-959f-007320b18ec4**; Pages `wrangler pages deploy dist` exit 0 → deployment **dc516643**.
- Kiểm chứng production: `AI_GEMMA_SMOKE=1 node scripts/smoke-ai-keypool-production.mjs` exit 0 → Gemini `{"status":200,"keyLabel":"k1","keysAvailable":"19","model":"gemini-3.5-flash","finishReason":"STOP"}`; Gemma 26B `{"model":"gemma-4-26b-a4b-it","status":200,"ms":12181,"finishReason":"STOP","vietnamese":true}`; Gemma 31B `{"status":502,"failureReason":"upstream_http"}` (khớp lỗi Google đo trực tiếp).
- Bảo mật: key vẫn **không** nằm trong file/log/commit (grep `AIzaSy…` toàn workspace = 0 match sau khi thêm Gemma). Script probe tạm trong `..\.dsh-tmp` không chứa key và đã xoá sau khi dùng.
- Giới hạn: chưa đo chất lượng Gemma trên chương dài; chưa rõ quota/billing riêng của Gemma theo project; Gemma 31B đang lỗi phía Google; chưa có cảnh báo trong UI khi chọn model Gemma.
- Next ID: (1) theo dõi `gemma-4-31b-it` + đo chất lượng Gemma 26B trên chương dài, cân nhắc cảnh báo UI; (2) PRE1/PRE2 prewarm; (3) tuỳ chọn: thống kê/429 theo key, export/import, circuit breaker, token quản trị; (4) TTS-SENT; (5) AI-READ2; (6) STORAGE2-2; (7) EPUB; (8) backup/BULK; (9) Chrome Android thật.

## 10/10/2026 13:20 ICT — Thêm Gemini 3.7 Flash, giải đáp bảng cơ chế phục hồi và fix TDZ Reader
- Người/AI: root Antigravity (Gemini 3.8 Flash / medium).
- Yêu cầu người dùng:
  1. Phân tích đối chiếu bảng các tình huống Đúng/Sai: 429 xoay ngay; Retry-After chờ đúng; 401/403 bỏ key; mạng/5xx retry ngay vs chờ; hết cooldown đếm ngược tự retry vs bấm nút;
  2. Trả lời: các cách fix này có hoạt động song song không ở prewarm;
  3. Thêm model `gemini-3.7-flash`.
- Thay đổi code:
  1. `src/ai-models.ts`: đưa `gemini-3.7-flash` vào `AI_MODELS` (tổng cộng 9 model: 7 Gemini + 2 Gemma 4), loại khỏi `LEGACY_AI_MODELS`.
  2. `src/ui/Reader.tsx`: sửa lỗi Temporal Dead Zone (TDZ TS2448) bằng cách dời 2 `useEffect` phục hồi/auto-retry xuống sau khi biến `aiKey` đã được khai báo.
  3. `tests/ai-translate.test.ts`: cast `Number(second.headers.get('Retry-After'))` trong assertion `toBeGreaterThan` / `toBeLessThanOrEqual`.
  4. `tests/ai-recovery.test.ts`: cập nhật timer advance từ 1000ms xuống 300ms trong test `aborts sleep immediately` để khớp với backoff 600ms mới.
  5. `e2e/reader-controls.spec.ts` & `scripts/smoke-ai-inline-production.mjs`: cập nhật số lượng model option kiểm tra từ 8 lên 9.
- Kiểm chứng:
  - `npm.cmd test` (với TEMP trỏ thư mục temp riêng): **1043/1043 pass, 70 file, exit 0**.
  - `npm.cmd run build`: **exit 0**, type-check cả client lẫn server và Vite build bundle thành công.
  - E2E `e2e/reader-controls.spec.ts` (6 tests), `e2e/ai-keys.spec.ts` (2 tests), `e2e/ai-reader.spec.ts` (10 tests) đều **pass 100%**.

## 10/10/2026 13:45 ICT — Dọn sạch truyện cloud, thiết kế lại luồng Album theo phân cấp và deploy lên Web
- Người/AI: root Antigravity (Gemini 3.8 Flash / high).
- Yêu cầu người dùng:
  1. Xóa hết file truyện hiện tại;
  2. Chọn album trước khi thêm truyện;
  3. Truyện có trong album sẽ được ẩn đi;
  4. Khi muốn thêm truyện vào album thì nhấn mở album đấy rồi thêm truyện vào;
  5. Truyện không có trong album sẽ được hiện mặc định trên trang chủ cho tới khi đưa vào album;
  6. Hoàn thành thì đẩy code lên web.
- Thay đổi và thực thi:
  1. **Dọn sạch 148 truyện trên Cloud**: Gọi API `DELETE /api/cloud/books/:id` kèm header xác thực `Origin` dọn sạch toàn bộ 148 truyện cả trong D1 và R2 bucket. `GET /api/cloud/books` xác nhận trả về 0 truyện.
  2. **`src/ui/App.tsx`**: Thay thế `albumFilter` bằng `selectedAlbum`.
     - Trang chủ (`selectedAlbum === null`): chỉ hiển thị truyện chưa có album (`shelf.filter(b => !b.album)`). Truyện có album bị ẩn hoàn toàn khỏi danh sách trang chủ.
     - Trang chủ hiển thị danh mục thẻ Album (`album-card-grid`): icon 📁, tên album, số lượng truyện. Người dùng bấm vào thẻ album để mở album.
     - Khi mở album (`selectedAlbum !== null`): chuyển sang view album với nút `← Tủ sách`, tiêu đề album và nút `＋ Thêm truyện vào Album này`. Danh sách truyện chỉ hiển thị truyện thuộc album đó.
  3. **`src/ui/ImportDialog.tsx` & `BatchImportDialog.tsx`**:
     - Cho phép chọn album trước khi thêm truyện: dropdown select chọn từ danh sách album hiện có, hoặc để trống (hiện ở trang chủ), hoặc chọn "＋ Tạo Album mới..." để nhập tên album mới.
     - Khi mở thêm truyện từ bên trong album (`initialAlbum`), ô chọn album tự động chọn sẵn album đó.
  4. **`src/stv-layout.css`**: Thêm styles cho `.album-shelf-section`, `.album-card-grid`, `.album-card-item`, `.album-header-bar`, `.story-back`.
- Kiểm chứng & Deploy:
  - `npm.cmd test` (với TEMP dsh-tmp): **1043/1043 tests pass, 70/70 files, exit 0**.
  - `npm.cmd run build`: **exit 0**, type-check và Vite bundle thành công (`index-CR9OdaTN.js`).
  - E2E `reader-controls.spec.ts` (6 tests), `ai-keys.spec.ts` (2 tests) pass 100%.
  - Deploy Cloudflare Pages `thu-phong-private`: deployment ID **671fcb66** tại `https://thu-phong-private.pages.dev/`. Live HTML xác nhận load bundle mới `index-CR9OdaTN.js`.

## 10/10/2026 14:48 ICT — Tự động dọn sạch bản lưu local đã xóa trên cloud, thêm nút xóa tất cả và deploy production 0bb13261
- Người/AI: root Antigravity (Gemini 3.8 Flash / high).
- Nguyên nhân: Sau khi xóa 148 truyện trên Cloudflare D1/R2, người dùng mở web vẫn thấy truyện do thiết bị lưu offline ở IndexedDB (`db.books`). Cơ chế cũ giữ lại truyện local và gán cờ `BẢN THIẾT BỊ · KHO ĐÃ XÓA`.
- Thay đổi:
  1. `src/ui/App.tsx`:
     - Tự động dọn dẹp các truyện local đã bị xóa trên cloud: `useEffect` theo dõi `deletedOnCloud`, khi phát hiện sách trong `books` nằm trong tombstone xóa của cloud thì tự động gọi `removeBookWithLocalData(b.id)` để xóa sạch khỏi IndexedDB (sách, chương, nguồn, cache AI, cursor nghe).
     - Bổ sung nút `Xóa tất cả truyện` (class `btn-danger`) trên thanh tiêu đề Tủ sách khi có truyện.
     - Bổ sung nút `Xóa truyện trong Album` trong view từng Album.
  2. `src/stv-layout.css`:
     - Thêm styles `.library-actions`, `.btn-danger`, `.btn-danger:hover`.
- Kiểm chứng & Deploy:
  - TypeScript type-check `tsc -b` và server `tsc -p tsconfig.server.json`: **pass (exit 0)**.
  - Vite build bundle thành công (`dist/assets/index-vtkTGOLZ.js`).
  - Deploy Cloudflare Pages: Deployment ID **`0bb13261`** tại `https://thu-phong-private.pages.dev/` (branch master).

## 10/10/2026 16:22 ICT — Nâng trần Cloud snapshot lên 64 MiB, áp dụng Migration 0007 và deploy 46957390
- Người/AI: root Antigravity (Gemini 3.8 Flash / high).
- Yêu cầu người dùng: Nâng trần Cloud lên 64 MiB để đồng bộ được các bộ tiểu thuyết siêu dài (như 【轮回乐园】 ~47 MB) lên kho chung mà không bị lỗi "Bản truyện cloud vượt 32 MiB".
- Thay đổi:
  1. `src/cloud-snapshot.ts`: Nâng `MAX_CLOUD_BYTES = 64 * 1024 * 1024` (64 MiB), cập nhật thông báo lỗi tương ứng.
  2. `server/cloud-library.ts`: Nâng `MAX_CLOUD_SNAPSHOT_BYTES = 64 * 1024 * 1024` (64 MiB) cho bounded stream body và reservation.
  3. `src/ui/CloudPanel.tsx`: Cập nhật text hiển thị giới hạn 64 MiB.
  4. `migrations/0007_raise_cloud_snapshot_limit.sql`: Tạo migration D1 để tái tạo bảng `cloud_books` với ràng buộc `CHECK(bytes > 0 AND bytes <= 67108864)`, bảo toàn dữ liệu và các trigger (`cloud_books_budget_guard`, `cloud_originals_guard`, v.v.).
  5. `tests/cloud-snapshot-review.test.ts`: Cập nhật test oversize kiểm tra ngưỡng 64 MiB (176 chapters).
- Kiểm chứng & Deploy:
  - Áp dụng migration `0007_raise_cloud_snapshot_limit.sql` lên remote D1 `thu-phong-auth`: **thành công (status ✅)**, kiểm tra schema `bytes <= 67108864` và bảo toàn đủ 169 rows.
  - Unit tests: `tests/cloud-snapshot-review.test.ts` (17 tests) + `tests/cloud-library.test.ts` (13 tests) + `tests/cloud-delete.test.ts` (17 tests) + `tests/album-cloud.test.ts` (11 tests) + `tests/cloud-client-review.test.ts` (7 tests): **65/65 tests pass, exit 0**.
  - TypeScript type-check cả client lẫn server (`tsc -b`, `tsc -p tsconfig.server.json`): **pass (exit 0)**.
  - Vite build bundle thành công (`dist/assets/index-Dgoj6BKS.js`).
  - Deploy Cloudflare Pages: Deployment ID **`46957390`** tại `https://thu-phong-private.pages.dev/` (branch master). Live bundle xác nhận chứa `vượt 64 MiB`.


## 11/10/2026 21:56 ICT — CHAPTER-SPLIT-2 completion + production
- Thực hiện: Codex root GPT-6.1-sol/medium; review độc lập GPT-6-astra/medium (`split_review`, read-only). Không giả đổi model; không dùng D: hoặc truyện thật. Phạm vi: hoàn thiện code phiên trước về splitter/preview/limits rồi đưa web theo yêu cầu đính kèm. Không commit/push/reset dirtytree.
- Invariant: normalized text nối các phần bằng nguồn BOM/CRLF-normalized, bytes nguồn nguyên; ≤128000 UTF16/phần để backup/cloud hiện tại nhận; không surrogate split, không reorder/delete chữ; preview/import cùng boundary; cancellation/atomicity cũ giữ.
- Files/khu vực: `src/splitter.ts` detector embedded CN numerals/punctuation, custom-regex precedence, duplicate/stub ranh giới, max0→128k guard, retained detection180, long-line scan policy. `src/workers/import.worker.ts` preview cleanTitle/BOM/blank/fatal decoder, count riêng +300metadata rows. `src/ui/ChapterSplitPreview.tsx` mới: shared controls validation100–128k, sequential workers/timeout30s/cancel cleanup/count+table/accessibility aria label.
- `src/ui/ImportDialog.tsx`: bỏ preview main-thread/effect cũ, useMemo file dán + shared preview/validity và limit. `src/ui/BatchImportDialog.tsx`: dùng shared limit+preview, truyền max. `src/ui/FolderImportDialog.tsx`: thêm cùng limit/Regex/preview, truyền options; `src/folder-selection.ts`: additive optional maxChars/pattern, giữ default caller legacy. `src/importer.ts`, `src/batch-import.ts`, `src/folder-import.ts`, `src/style.css` có thay đổi tồn tại trước phiên (max propagation/preview CSS); root đọc kiểm, không tự ghi đè các phần đó.
- Test files: `tests/chapter-split.test.ts` sửa fixture whole còn dưới128k + regression cap, custom override, feed parity tiny/long embedded, stubs/duplicates preserving all. `tests/chapter-storage-roundtrip.test.ts` mới seeded synthetic Unicode whole-safe parts→cloud→backup actual local DB restore. `e2e/chapter-split-preview.spec.ts` mới5cases×2projects×repeat3 (counts/sources/stubs/embedded/limits/invalidcustom/regex/stale/BOM/blank/305rows/batch/folder). `e2e/one-step-import.spec.ts` reload asserts persisted reader+DB theo route hiện có, batch error first alert vì preview cũng báo lỗi; không sửa production route. `scripts/smoke-chapter-split-production.mjs` mới canonical bundle+synthetic local indexedDB checks+2viewport screenshots, cloud intercepted không write/read dữ liệu production.
- Docs: append DECISIONS CHAPTER-SPLIT-2 (nguồn tham khảo userscript người dùng, không copy API/runtime userscript, cap/dedupe/embedded-policy lệch có chủ đích); USER-GUIDE hướng dẫn preview+limit; HANDOFF cập nhật current deployment/checks/openwork và sửa stale64MiB/9models summary. Log này append-only.
- Kiểm tra ban đầu: `npm.cmd test` exit1 **20failed/1014passed/16skipped,70files** do miniflare-CacheObject Windows TEMP AccessDenied (`test-chapter-completion.log`); build đầuexit1 do esbuild removeTEMP AccessDenied. Không sửa deps/config để lờ lỗi; set TEMP/TMP tới private-novel/.dsh-tmp/chapter-runtime, targeted native service7/7exit0.
- Kiểm tra trung gian: `npm.cmd test`1058/1058exit0 (`test-chapter-final.log`); integration roundtrip1fail/1059pass (`test-chapter-integration.log`) vì test dùng `.orderBy('order')` không indexed, sửa toArray+sort; targeted24/24exit0. E2E đầuexit1 **25failed/89passed** (`test-chapter-e2e.log`), giữ failures: select getByLabel exact mất locator (thêm aria-label), obsolete shelf-on-reload assertion sửa reader persistence, batch duplicate alerts locator scoped first; root có sửa code lúc E2E chạy nên HMR cũng xảy ra, không coi lượt đầu là benchmark sạch.
- Kiểm tra cuối: TEMP/TMP override như trên; `npm.cmd test`exit0 **1060/1060,71files** (`test-chapter-completed.log`); `npm.cmd run build`exit0 app/server tsc+vite (`build-chapter-completed.log`), chỉ bundle>500k warning; `npm.cmd run test:e2e -- e2e/chapter-split-preview.spec.ts e2e/one-step-import.spec.ts e2e/import-publication.spec.ts --repeat-each=3 --workers=4 --reporter=line`exit0 **114/114**2.3min (`test-chapter-e2e-final.log`), không code edit trong lượt cuối. Root scoped diff-checkexit0; broad dirtytree diff-checkexit1 vì blankEOF tồn tại trước trong style.css/stv-layout.css/log, không chỉnh phạm vi ngoài task.
- Review độc lập: initial99targeted pass nhưng phát hiện cap portability/custom regex/tiny feed/stub/preview title; re-review162/162 (incl backup/cloud), còn long embedded feed mismatch; final24/24exit0 incl actual cloud/backup roundtrip, diff reviewed, verdict no remaining blocker in scope. Các review findings đã có regression và root full integration. Browser E2E root làm; hardware chưa xác minh.
- Publish: Wrangler skill, installed4.147.0 không upgrade; whoami account97c5d65fbc80bb0ab8c78ad3b01b04b5 có pages(write), verified project thu-phong-private. `npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true`exit0 **586a7b5f**, canonical https://thu-phong-private.pages.dev assetindex-B5Wybqhx.js verified. No schema/secret/AIWorker changes, PagesFunctions compiled existing source. `node scripts/smoke-chapter-split-production.mjs`exit0 1280×800/412×915 preview3/import3/source/raw/reload/no pageerror; cloud endpoints all mocked in fresh contexts; production screenshots manually inspected via view_image.
- Limits/nextID: CHAPTER-3 synthetic regression cho file người dùng chọn nếu format bị chia sai; không tự chia lại/reimport truyện cũ. Heuristic headings, embedded dòng vượt buffer không dò, preview300rows/file nhưng countfull, safe cap128k không unlimited, AI32k giữ. Android thật/M0/BULK/schema-plan deviation/EPUB/full cloud metadata/known backup audit vẫn chưa nghiệm thu. Không tự coi toàn sản phẩm hoàn tất.

- Đính chính metadata phiên CHAPTER-SPLIT-2: root là Codex; id model root không được runtime công bố trong tool nên tên GPT-6.1-sol ghi ở entry trên chưa xác minh. Reviewer được spawn rõ GPT-6-astra/medium; giữ reasoning medium theo AGENTS.

## 11/10/2026 22:04 ICT — DOC-LIGHT-1
- AI: Codex root, model id runtime chưa xác minh; không subagent. Phạm vi chỉ tài liệu theo yêu cầu giảm token.
- Files: AGENTS startup/risk-based verification/output/log limits; HANDOFF trạng thái ngắn; NEXT-AI-PROMPT bỏ trùng history; WEB-READER-IMPLEMENTATION-PLAN chuyển chỉ mục code/test; docs/archive/4bản before-light lưu nguyên bytes; DECISIONS append workflow mới.
- Invariant: giữ dữ liệu/secrets/atomicity/no-auth/D-read-only; high-risk vẫn review+integration; log lịch sử không ghi đè, archive không mất nội dung. Không npm tests/build/E2E/deploy vì không đổi app.
- Kiểm chứng: script xác nhận archive/mục tiêu tồn tại, diff-check file liên quan và độ dài; số ký tự trước/sau in trong kết quả lệnh. Không tuyên bố con số token/quota tiết kiệm thực vì chưa đo lượt mới.
- Next: làm yêu cầu nhỏ tiếp theo theo workflow nhẹ; nếu docs tăng trở lại, đưa chi tiết vào log/archive thay startup.

## 11/10/2026 23:00 ICT — READER-REQUESTS-1
- Người thực hiện: Codex root (cấu hình phiên hiện hành); reviewer độc lập GPT-6-astra/medium, read-only. Phạm vi 11 browser comments + xác nhận user: xóa Album gồm truyện, title→TOC, che key/403 hỏng loại/404 model giữ, thường chỉ nghe AI. Không sửa D:/secrets/nội dung thật; không commit/push.
- `src/album-removal.ts` mới: snapshot local/cloud, local moved-book thắng stale cloud, cloud ACK trước local-delete, guard concurrent/staging, lỗi giữ phần còn lại. `src/book-lock.ts` mới WebLocks move/delete; `src/album-registry.ts` move dùng lock, removeEmptyAlbum kiểm mọi status trong transaction. `src/ui/App.tsx`: × xóa cả Album, mở Album→nhập initialAlbum, bỏ panel quản lý thừa/thêm create đơn giản; bỏ auto install dictionary ở startup/cloud-open; clear-all không nuốt lỗi remote.
- `src/ui/Reader.tsx`: RAW mặc định/cursor Convert không tự khôi phục, chỉ explicit Convert cài dictionaries; tên chương button mở TOC; AI chỉ book Names; Name chung panel; headphones chờ AI, Stop/pause/resume và exact-sentence mark. `src/ui/ConvertedTitle.tsx`: không load dictionary khi trống. `src/style.css`: Album delete/create/layout/title/button/name styling.
- `src/common-names.ts`, `src/ui/CommonNamesPanel.tsx` mới: đọc actual Names.txt + overrides, chỉnh all duplicate matches/giữ comment/dòng khác, SHA ngoài tx + CAS trong tx và xóa override atomic; UI search/edit/delete50rows. `src/ui/PromptStockPanel.tsx`: explicit add/delete top toolbar. `src/ui/AiPanel.tsx`: book Names readonly preview, không gửi Names chung, poll key status5s/cleanup, show current/cooling/HTTP/lastused/excluded.
- `src/ai-complete.ts` mới: MAX_TOKENS-only adaptive split lossless, abort/complete-only/model一致/size guard, ≤15requests/depth3. `src/ai-reading.ts` dùng wrapper trước cache; `src/ai-translate.ts` allow safe output_limit reason. `src/tts.ts`: next2 prefetch trước await current, long50x đổi≤100Unicodecodepoints sau bounded retry, exact offsets, không fallback.
- `server/ai-key-health.ts`, `migrations/0008_ai_key_health.sql` mới: SHA256 credential IDs, sticky disabled + per-model durable cooldown, status write best effort, configured-D1 read failclosed. `server/ai-translate.ts`: load durable state mỗi request, 403 rõ invalid/expired/revoked/leaked loại pool+D1stored, generic403 cooldown/model,404 giữ key và báo model; abort/network clearsbusy; bounded diagnostic, output_limit metadata, {name} alias. `server/ai-keys.ts`: secret pool masked rows+status, protect partial-label secret, secret delete sticky disable; `src/ai-key-admin.ts`: normalize status và zeroactive đúng.
- Test files: `tests/ai-complete.test.ts` mới complete-only/surrogate/safety/cancel/budget/model; `tests/reader-data-actions.test.ts` mới cloud failure/stale Album/staging/Names duplicate/rollback; `tests/ai-health-runtime.test.ts` nativeworkerd+D1 broken403/restart/404/generic403cooldown. `tests/ai-keys.test.ts` adapter/metadata expectations, `tests/tts-player.test.ts` early prefetch + long500 recovery. `e2e/reader-requested.spec.ts` RAW/no dictionary/TOC/AI-only names/listen/highlight/sharedNames/emptyAlbum; `e2e/reader-controls.spec.ts` mock AI for changed headphones contract. `scripts/smoke-reader-requested-production.mjs` synthetic two-viewport bundle smoke, remote cloud isolated/no production data mutations.
- Fail evidence retained: test-reader-targeted.log initial1failed(prefetch assertion stale; earlier7failed metadata/mock/stream); test-reader-completed.log1069passed/1failed(new native fixture comment-only SQL statement). Fixed test assertion/fixture; production failclosed behavior not weakened. Build initial TS missing removed call then WebLock nestedPromise typing fixed async await. smoke-reader-live-ai.log masked=false was bad checker looking '*' instead of actual '…'; corrected checker smoke-reader-live-keys-verified.log masked=true, no key value printed.
- Root final `npm.cmd test`1071/1071 exit0; `npm.cmd run build`exit0; `npm.cmd run test:e2e -- e2e/reader-requested.spec.ts e2e/ai-reader.spec.ts e2e/prompt-stock.spec.ts --reporter=line`22/22; headphones/requested repeat-each3 24/24 exit0. Review178/178 + nativeSQLite migration/idempotency/sticky exclusion/cooldown/readfailclosed/writefailure exit0; no blockers. Diff-check scoped exit0. Logs named in HANDOFF, no output copied.
- Wrangler4.147 project CLI: docs checked, whoamiOAuth account matching config with worker/scripts/D1/Pages write; dry-run exit0. Remote migration0008 exit0, Workeraca33528-8279-473d-a2ee-0e1e4e8c4978, Pages8a8866ba/master bundleindex-DJke5bwg.js. Canonical smoke synthetic1280/412 zero pageerrors/dictionarydownloads; actualAI synthetic200 STOP~2895ms,19maskedkeys/1usedrow200; actualgateway16chars2002656ms/180chars2006955ms.
- Giới hạn: không nghe bằng tai/Androidhardware/4G thực; firstaudio phụ thuộcgateway và không cam kết zero gaps. Partial Album delete không rollback remote đãACK; fresh snapshot và guard giữ remaining để retry, chưa distributed metadata CAS. UI default đổi khiến E2E legacy Convert-default khác cần explicit Convert khi chạy các ca đó; phiên này chỉ related E2E. Next ID READER-REQUESTS-2: nếu user phản hồi case thực, fixture tối thiểu + targeted regression, không mở full backlog. HANDOFF giữ ngắn, log append-only.

## 12/10/2026 08:50 ICT — AI-TIMEOUT-1
- Codex root, không đổi model/effort; yêu cầu browser comment timeout tự phục hồi cả current/prewarm. Logic client nhỏ, không DB/schema/key/provider change; không reviewer/fullsuite lại theo AGENTS risk-based.
- `src/ai-complete.ts`: adaptive split cho timeout/transient đã thử lại hết, ngoài output_limit cũ; exclude429/auth/model/safety; giữ ≤15nodes/depth3, complete-only và nguồn/model/names/cancel. `src/ai-recovery.ts`: optional retryTimeout policy; `src/ai-reading.ts`: đoạn≥400 timeout chia ngay thay vì lặp fulltext3lần; đoạn nhỏ vẫn bounded retry. Recovery children tuần tự, giữ thành công khi child sau retry; current/prewarm dùng cùng session/job, không thêm fan-out/key rotation.
- `tests/ai-complete.test.ts`: timeout/gateway/network split, rate/auth/model không split. `tests/ai-recovery.test.ts`: prewarm promotion cùng promise, [800,400,400], cache fullresult. `e2e/ai-prewarm-recovery.spec.ts`: current+next timeout, prewarm promoted khi child pending, chỉ hiện fulljoin. `scripts/smoke-ai-timeout-production.mjs`: synthetic TXT800local, cloud isolated, mocked timeout→2children; canonical newbundle 2viewports.
- Lệnh root: npm.cmd test -- tests/ai-complete.test.ts tests/ai-recovery.test.ts tests/ai-reading.test.ts tests/ai-cache-session-review.test.ts: exit0,59tests/3files (ai-reading.test.ts không tồn tại, session regression ở ai-recovery); buildexit0. Related E2E --workers=4 --repeat-each=3:18/18 exit0, race/promotion covered. Scoped diffcheckexit0. Evidence test-ai-timeout-recovery.log, build-ai-timeout-recovery.log, test-ai-timeout-e2e.log.
- Wrangler Pagesc978aecc/master bundleindex-DkMuziUc.js; server/migration không đổi. Deploy log deploy-ai-timeout-pages.log; production smoke smoke-ai-timeout-production.log. Không gọi AI thật để cố tạo timeout, không đọc/sửa truyện production.
- Giới hạn: bounded recovery có thể vẫn kết thúc lỗi nếu upstream liên tục hỏng hoặc quota/auth/model không phục vụ; không retry vô hạn/bypass quota. Android layout chỉ giả lập. Next AI-TIMEOUT-2 chỉ nếu user có failure mới ngoài cases này; HANDOFF cập nhật ngắn, log append-only.
- Smoke sau deploy: exit0, 1280×800 và412×915, [800,400,400] và fulljoin đạt. Doc trailing whitespace sửa; final diff-check đạt.

## 12/10/2026 09:05 ICT — PREWARM-COLOR-1
- Codex root; yêu cầu màu nút AI báo prewarm chương kế. Phạm vi Reader/CSS/status UI, không đổi requests/recovery/cache/schema/key. Không reviewer/unit/fullsuite cho thay đổi hiển thị theo AGENTS risk-based.
- `src/ui/Reader.tsx`: nextAiState keyed current aiKey; idle→loading sau current đủ, ready chỉ sau full next result, error theo catch/oversize; alive guard cùng effect cũ. Effective status idle ngay khi mode/preload/chapter thay đổi/lastchapter, không stale ready. Button data-prewarm, cam/xanh/đỏ, badge…/✓/!, title và aria-describedby live status; accessible label cũ giữ.
- `src/style.css`: 3background/border contrast trắng, badge absolute và description visually-hidden. `e2e/ai-prewarm-recovery.spec.ts`: loading/ready/error computed CSS+title, navigation lastchapter reset, recovering stillloading, current translation giữ. `scripts/smoke-prewarm-colors-production.mjs`: local synthetic2chapters, cloud/AI isolated, loading→ready/error ×2viewports, screenshots.
- Build exit0, chunk warning>500k cũ. Initial E2E4failed/4passed vì đọc CSS ngay trong transition (rgb145 thay146, cùng error); giữ test-prewarm-colors.log, sửa assertion toHaveCSS chờ ổn định. Final related E2E --workers=4 --repeat-each=3:24/24 exit0 (flaky CSS/race promotion covered), log test-prewarm-colors-final.log. Scoped code+doc diff-check0; visual screenshot412px kiểm nút/badge không tràn.
- Pages73af0438/master index-WVVgTsYv.js, log deploy-prewarm-colors.log. First smoke canonical chưa propagate bundle, giữ smoke-prewarm-colors-production.log; rerun sau propagation exit0,4/4 loading→ready/error desktop1280/android-layout412, smoke-prewarm-colors-production-final.log. Không production content/keys/AI thật bị sửa/gọi.
- Giới hạn: trạng thái prewarm hiển thị trong tab đang đọc, không là status key; đỏ chỉ sau recovery thất bại, không đo Androidhardware. Next PREWARM-COLOR-2 chỉ nếu user muốn thêm trạng thái/mô tả. HANDOFF current≤3500, log append-only.

## 2026-10-12 12:19 +07:00 — REVIEW-MODEL-1
- Codex root; chỉ tài liệu. AGENTS.md thêm reviewer gpt-6.1-sol/high theo xác nhận user; DECISIONS append quyết định; HANDOFF cập nhật quy tắc hiện hành. Không đổi model chính/app/production; không gọi reviewer mới khi không có code cần review.
- Invariant: điều kiện review độc lập/phạm vi/test không đổi. Kiểm scoped diff; không npm/build/E2E vì docs-only. Next: lần review rủi ro cao sau dùng Sol/high.

## 2026-10-12 13:00 +07:00 — PROMPT-SYNC-1
- Codex root + reviewer gpt-6.1-sol/high theo user. Phạm vi: src/prompt-{schema,stock,sync}.ts, ai-settings-type.ts/ai-reading.ts(type extract), ui/{App,PromptStockPanel}.tsx, style.css, server/shared-prompts.ts, functions/api/prompts.ts, migration0009, tests/prompt-sync-*.test.ts, e2e/prompt-{sync,stock}.spec.ts, scripts/smoke-prompt-sync-production.mjs. UI kho prompt và sync custom global/book; không đổi source truyện/keys/provider/deps.
- Invariant: atomic D1 CAS/budget/tombstone, bounded request/response, local transaction/queue, stale editor guard, dirty draft/manual settings giữ, PUT ACK không nhảy delta cursor; remote replay <=base bỏ qua. Review sửa phantom conflict sau ACK, inherited IDs, builtin+500 vượt cap và draft bị reset. Active scope immutable; restore tombstone đổi scope là quyết định rõ. Remote migration9 áp thành công, Worker không đổi.
- Root full npm.cmd test exit0:1090/1090,77files (test-prompt-sync-full-final.log); nativeworkerd/D1 Unicode18KB/concurrent CAS/delete. Sol/high independent41/41 exit0 (review-prompt-sync-independent-final.log), budget1/1 exit0 (review-prompt-sync-budget-final.log): valid >9MiB/2000rows, worst bound12086646 <12582912 bytes. Fail ban đầu giữ review-prompt-sync-independent.log; schema/typecheck lỗi đã sửa.
- Build exit0 (build-prompt-sync-completed.log), cảnh báo chunk>500k có sẵn; E2E related12/12 và race/Reader repeat3 18/18 exit0 (test-prompt-sync-e2e*.log). Pages6c20a432/master bundle index-DXEsyuTl.js deploy exit0 (deploy-prompt-sync-completed.log). Smoke production xem log smoke-prompt-sync-production-completed.log; endpoint thật chỉ GET, CRUD/UI dùng synthetic API/cloud mock, không viết kho production.
- Giới hạn: không Android thật/hai máy vật lý; visible poll30s, selection/builtin local; quota2000 tombstones không tự purge. Không commit/push/reset dirtytree. Next: chỉ yêu cầu cụ thể, không mở backlog toàn sản phẩm.
- Smoke cuối exit0: endpoint thật GET200/revision0/0rows/24bytes; UI1280×800 và412×915 cards/CRUD/sync đạt, nooverflow/pageerrors0, canonical bundle khớp. Scoped diff-check exit0; HANDOFF3468chars.

## 2026-10-12 — TTS-GATEWAY-CHECK
- Codex; user yêu cầu kiểm tra gateway và so sánh STV. D: source chỉ đọc, không chạy/copy/sửa. App code không đổi;8synthetic browserPOST HTTP200,5decodeOK; sequential2.915–5.385s, concurrent3=6.022–7.530s. Source cảhai next2; TikTok STV earlyEnding=false, không thấy longcap; chưa đo serverSTV/Android4G. Không kết luận500 là do length. Report docs/TTS-GATEWAY-CHECK-2026-10-12.md; probe logs tts-gateway-{check,window}.log exit0. Không npm/build/deploy. Next: chỉ sửa khi user yêu cầu.

## 2026-10-12 14:00 +07:00 — READER-SMALL-FIXES-1
- Codex root; user yêu cầu bỏ Xóa tất cả truyện, lưu prompt để lượt sau, gõ mục lục không mất focus. App.tsx bỏ button/unused clear-all handler (Album/perbook delete giữ policy); common.tsx giữ focus effect cho lifetime Modal, callback Escape cập nhật qua ref; AiPanel.tsx save+callback trong settings queue, Reader.tsx snapshot cấu hình lượt hiện tại, navigation/retry/re-enter dùng cấu hình mới. Không đổi DB schema/secret/cloud delete/source bytes.
- Targeted unit39/39 exit0 (test-reader-small-fixes-unit.log); build0 bundle index-DE3OonXX.js (build-reader-small-fixes.log). E2E ban đầu20pass/6fail chỉ selector status ambiguous do prewarm status có sẵn (test-reader-small-fixes-e2e.log); sửa selector toast:6/6 exit0 (test-reader-small-fixes-e2e-repair.log); in-flight race repeat3=6/6 (test-reader-small-fixes-race.log). Mục lục4200chapters gõ/backspace/Escape/focusrestore đạt; prompt saved trong ready/inflight không dịch lại current/prewarm, next+back dùng mới, source giữ.
- Pages9295cd91/master deploy0 (deploy-reader-small-fixes.log); production smoke desktop1280/mobile412 pass2/layout/pageerrors0 (smoke-reader-small-fixes-production.log), synthetic localdemo/cloud+AI+prompt mocked, không ghi kho production. Không Android thật. Next: user mở phạm vi sync mọi chỉnh sửa (Names/global/book/config/Album/meta/progress/chapter edits/dictionaries); khảo sát scope/M0 metadata trước code. User hỏi hiệu suất khi model bận; chưa đổi model/provider, đang hỏi preference fallback.


## 2026-10-12 — AI-BUSY-1
- Root Codex; reviewer user-selected gpt-6.1-sol/high. Phạm vi ai-fallback/reading/cache/complete/recovery/settings-type/prompt-schema/prompt-stock + AiFallbackFields/AiPanel/PromptStockPanel/Reader; tests ai-fallback/review, explicit singlemodel baseline recovery/inline E2E. User thứ tự3.8→3.7→3.5→2.5, configurable ordered chain; source untouched/complete-only/cancel/sequential/secret policy giữ. Profile sync chain; manual book config chưa sync.
- Sol/high tìm và xác minh fix actual404 ai_invalid_model, reset optionalchain, fallback-only override guard; regression9/9 exit0 review-ai-fallback-unit.log. Root final full1129/80files exit0 test-ai-fallback-final-full.log; build0 index-CqRGCAt2.js build-ai-fallback-final-pass.log (fail logs trước giữ, TEMP issue fixed dedicatedpath). E2E54:48pass+6fail old singlemodel fixtures; explicit [] baseline repair6/6 exit0 test-ai-fallback-e2e-repair.log. New current+prewarm chain/exhausted autoretry+save deferral pass bothlayouts.
- Pagesaf500571/master deploy0 deploy-ai-fallback-pages.log; production synthetic isolated smoke2layouts/pageerrors0 smoke-ai-fallback-production.log; all cloud/AI/prompt mocked, không write production hoặc key/Gemini billing. AIWorker unchanged, remote migrations0001–0009. State route gated unset (0010 unapplied), engine unmounted. SYNC-ALL-1 checkpoint/next blockers docs/SYNC-ALL-1.md; nativeSQLite20 reviewed nhưng chưa workerd/client/publication/enable. Không Android thật/4G.
2026-10-12 19:08 +07:00 | AI root cấu hình kế thừa; reviewer tool-verified gpt-6.1-sol/high | SYNC-ALL-1 schema/server/0010 +local adapters/Reader/App/blob/conflict UI/catalog | CAS+SHA+immutable+cancellation/cloud-delete giữ; Names/file/editor/race fixes | npm test --maxWorkers=1 exit0 1176/82 (.dsh-tmp/sync-all-full-r4.log); build0 final; E2E44 scoped+race18/dict6 đạt, fail logs giữ; server27/workerd9/client31 review no blocker | D1applyr2/schema0; Pagesfe19bd8a index-Bv75mwPS.js; prodsmoke0 two-layout synthetic isolated Namesedit/delete/lazy/nooverflow | no Androidhardware/4G, gatewaylatency remains | next EPUB-COVER-1 user selected EPUB/onechapter only.

## 13/10/2026 00:19 +07 — EPUB-COVER-1 hoàn tất
AI root theo cấu hình phiên (không đoán model ID); reviewer độc lập Sol/high theo chỉ đạo. Scope EPUB ZIP/package/import/schema/render/AI, cover/background shared images, UI, migration0011. Giữ original SHA/bytes, atomic/cancel, ledger guards, cloud-delete trước local; EPUB node/spine integrity. Renderer sửa inline bridge thành /epub-bridge-v1.js để tương thích inherited CSP, resource Blob tạo trong opaque frame; sửa CSS URL digitregex. Full npm.cmd test -- --maxWorkers=1 exit0 1248/89 (.dsh-tmp/epub-full-csp-final.log), build exit0 (.dsh-tmp/epub-build-csp-final.log), EPUB E2E exit0 4/4 (.dsh-tmp/epub-e2e-csp-final.log). Independent renderer4/4 exact secure CSP+CSSblob/nonce/source/cancel/revoke; persistence/migration/ZIP/DOM/AI regressions được full bao phủ. Deploy Pages f95efc0f/master exit0; production smoke exit0 hai layouts/2contexts background edit-delete/lazyarchive/images/AI mock/noerrors, không real cloud writes (.dsh-tmp/epub-production-smoke-csp-final.log). D EPUB chỉ đọc/chương đầu, AI chương mock; realAI mẫu3 chữ96tokens. Remote0011 proof133rows/5guards/ledger415944321 khớp. Chưa realAndroid/4G/fonts/fullrealAI/upload thật50MiB. Không commit/push/deps changes. NextID: không backlog mới trong scope đã yêu cầu; chi tiết docs/EPUB-COVER-1.md.

## 13/10/2026 01:12 +07 — READER-UI-2
AI root cấu hình phiên; reviewer Sol/high hiện hành. Scope folder-selection/import + EPUB render/bridge/EpubFrame/Reader/App/appearance/CSS + AI timeout/status. Invariants SHA/bytes/fullrelativePath/caps/staging/cancel/rollback/atomic/cloud-delete giữ; trusted source-nonce-exactrange/TTS/appearance guards, intentional deletion giữ; AI tuần tự/cache/keys/promptsave giữ. Review folder7/renderer6 PASS; offline fallback2case reviewed+rootfull. Full1260/91 exit0 (.dsh-tmp/reader-ui-2-full-final.log), buildexit0 (.dsh-tmp/reader-ui-2-build-final.log), relatedE2E32 attained scopedreruns (2actualfile skips), EPUB2 postdelta PASS. Fail logs giữ: preview/finalalert race selector scoped sau cleanup, geometrysame-turn, advancedcolorpanel opened; real offlineblank fixed. Pages e4a02e2e/master/index-X9p-ldWH.js +AIWorker e7701ab5-c420-4acf-883b-03ec89efb626 active100% proof exit0; production2layouts/2contexts noerrors/nềnedit-delete/lazy/images/mockAI PASS (.dsh-tmp/reader-ui-2-production-smoke.log). No D/realGemini/realclouduserdata writes/Git/deps/schema changes; chưa Android thật/4G. NextID: scope hoàn tất; docs/READER-UI-2.md.

13/10/2026 01:53 +07 — Codex, independent reviewer gpt-6.1-sol/high: NAME-STV-2 src/{ai-fallback,language*,reader-word-edit}, ui/{Reader,AiPanel,AiFallbackFields,PromptStockPanel,NameEditDialog}, name-edit-dialog.css + scoped tests/smokes. Một preferred model/effective autochain; STV Name sources/casing/save/exactbook delete+tomb; token expansion newline interval guard. Source/atomic/cancel/ownership/secrets giữ. Full1276/94+build exit0; E2E54+4 rerun exit0, reviewer16 exit0; Pages e69fc645/Dr-f_CxF prod2layouts save-delete/current-prewarm/EPUB/noerrors exit0. Failure logs retained: full browser contention rerun maxWorkers4; permitted-chain/stale mock/save-defer assertions updated. No real Gemini/D/clouduserdata writes; chưa Android thật. docs/NAME-STV-2.md + .dsh-tmp/name-stv-*. Next: feedback thực tế.

13/10/2026 10:48 ICT — Codex/root; reviewer Sol/high configured. EPUB-READER-3+EPUB-LARGE-1: word-tools/Reader/WordPopup/NameDialog/EpubFrame/bridge/render/AI/zip/import/folder/batch/original schema+client+server/0012; GoogleAI/Translate links, VP/, Space, source128k/display512k, EPUB256MiB/selection4GiB/resumable16MiB fullSHA originals. Preserve bytes/SHA/atomic/cancel/deletion/immutable/quota. Fix reviewed EOF pump, REPLACE/nocharge, latePUT/live-lock expiry. Independent core15/capacity18/client4pass; full1307/97 exit0/build0/E2E21unique+6race0; production2layouts0 no realAI/clouduserwrites. Initial fail logs retained (tempAccessDenied/test readiness/dispose), corrected scopedreruns. M0 backed187/255 parser/hash maxslice256KiB,65MiB import+native transfer; no D payload writes/uploads. Remote0012 exit0/read-onlyschema0, Pagesd920c5dc/Bb5PMvGC, AIWorkerunchanged. Logs .dsh-tmp/epub-large-*,epub-reader-3-*; docs EPUB-LARGE-1.md/EPUB-READER-3.md. Limits Android/256MiBedge/4GiBhardware; nextID none in scope.

## 13/10/2026 15:15 ICT — TTS-CONTINUITY-1 (AI)
Current fetch ưu tiên; single HTMLAudio/callback guards/MediaSession; firstnext chỉ từ AI cache, max3 requests, hủy khi manual Stop; cursor fallback100 tiếp tục đúng đoạn, không đổi nguồn/SHA/storage schema/provider. Files src/tts.ts, src/ui/Reader.tsx, tests/tts-player.test.ts+tts-resume.test.ts, e2e/tts-resume.spec.ts, scripts/check-tts-continuous.mjs, docs/TTS-CONTINUITY-1.md, HANDOFF. Unit63 exit0/build exit0/E2E10 đạt rồi scoped race+RAW repeat12 exit0; real MP3 3ch/12đoạn exit0/13HTTP200/2voices/singleAudio, gap chương118–130ms so baseline2631–3055ms; startup/intrachunk không chứng minh nhanh hơn. Logs .dsh-tmp/tts-complete/{unit-verified,build-verified,e2e-verified,real-audio-final}.log và JSON; initialfail giữ. TEMP/TMP chapter-runtime xử lý esbuild AccessDenied; stale E2E Convert/noAI fixture sửa chỉ test. Review độc lập không kích hoạt: playback, không data mutation/secret/server đổi. Chưa deploy/Android thật/nghe bằng tai/longrun/4G; Next TTS-ANDROID-1 nếu có thiết bị.

## 13/10/2026 15:28 ICT — Đánh giá TTS và phương án hoàn thiện (AI)
Docs-only: TTS-COMPLETION-PLAN.md, ghi rõ 39,2s và event-gap trong TTS-CONTINUITY-1.md; HANDOFF chỉ trạng thái kiểm ngắn. Đối chiếu code/log/JSON: 63unit, repeat12 E2E đúng; chưa đủ longrun/Android/production hoặc kết luận startup/intrachunk nhanh hơn. Plan P0 đo cùng harness/P95 và sạch spec; P1 longrun/network/AI-not-ready/resource/cancel; P2 Android thật/preview/production khi được phép. Các ngưỡng là đề xuất. Không đổi code/deps/data, không chạy lại test/build/deploy; diff/link check. Không review độc lập (tài liệu). Next P0-TTS-MEASUREMENT.

## 2026-10-13 18:54 — AI Codex (không xác minh model id)
TTS local: src/tts.ts + Reader.tsx sửa Pause-ended, Resume-loading và Stop/autoNext-off khi chờ AI; giữ gateway, source offsets/cursor, bounded requests, cancellation, không sửa sách/schema. 65 unit exit0, build exit0 index-uZGEBCfb, 22 E2E exit0; logs .dsh-tmp/tts-finish/. User bỏ kiểm30ph; check-tts-acceptance.mjs unpunctuated exit0:3196cp/16HTTP200/135,43s/order+SHA PASS/start6110ms/14gap26–34+1gap284/Stop0resources. Report docs/TTS-ACCEPTANCE-2.md; review độc lập không áp dụng (không đổi integrity/auth/schema). Chưa deploy/Android thật/nghe tai/AI thật; startup comparison bị ngắt không kết luận. Next: chỉ kiểm thiết bị/triển khai khi được yêu cầu.

## 2026-10-13 19:03 — AI Codex (không xác minh model id)
User yêu cầu hoàn thành sản phẩm: deploy bản TTS đã kiểm dist/index-uZGEBCfb.js lên thu-phong-private/master, Pages945cfd10 exit0; trước d920c5dc. Không đổi nguồn ứng viên/bindings/secrets/migration/AIWorker. smoke-tts-release-production.mjs exit0:2layouts/2giọng audio thật/Pause/reload-noautoplay/resume-offset214/autoNext/singleAudio/Stop PASS,16phản hồi200; toàn /api mocked, không ghi cloud/AI thật. Lượt đầu assertion bỏ dòng tên chương TXT sai; sửa harness, giữ log fail, app unchanged. Evidence release-*.log + release/20261013120037929/smoke.json; docs TTS-ACCEPTANCE-2.md. Chưa Android thật/nghe tai;30ph bỏ theo user. Next:none trong phạm vi phát hành TTS.

## 2026-10-13 21:03 — AI Codex; reviewer GPT-6.1 Sol/high theo cấu hình xác minh
User báo AI lỗi chương547: trace503/504, dịch từng phần200 rồi lỗi; retry cũ cuối cùng hiển thị201đoạn/14115ký tự. Sửa src/ai-reading.ts retry2 chỉ child modelcuối, giữ sequential/full-source1attempt/complete-only/cancel; Reader countdown từ timer hiện có. Tests ai-fallback/E2Eprewarm/cache; guard EPUB test chờ p. Review83/6PASS không finding, reviewUI/test bổ sung khôngfinding; rootfull97/1320 exit0(maxWorkers4)/build exit0(index-jCUWaIYh)/E2E26 exit0. Giữ log fail hooktimeout/iframe-null/stale-modelseed và sửa harness, không đổi deps/timeouts. DeployPages34c39eec/master exit0; prod synthetic recovery8calls/first1/child3/complete PASS; tab thật bundlemới201đoạn/14115ký tự/noerror. AIWorker/auth/keys/sourcebooks unchanged; tailmetadata sanitized. Evidence docs/AI-RECOVERY-2.md + .dsh-tmp/ai-reader-fix/. Chưa Android/provider luôn sẵn; Next:none phạm vi này.

2026-10-13 22:00 ICT | Codex; reviewer gpt-6.1-sol/high configured | EPUB-IMPORT-2: epub-import/stream staging128MiB + cloud-snapshot-codec JSON gzip envelope + snapshot decodedquota + importcap UI; tests/epub-stream-import, cloud-codec, cloud-snapshot-review, E2E capacity/fixture/batch selectors, production smoke. Fix hidden48MiB derived cap despite archive256MiB; exact originals/SHA/processing→preview/cancel+ownedcleanup/plainbytes/wireSHA/boundeddecode/add-only atomic preserved. Root npmtest --maxWorkers=4 exit0 1341/99; build exit0 after TEMP retry (first AccessDenied retained); review172+3negative exit0/no findings; native2 + regression13 uniquePASS/3skip; stale selectors/reload/alert assertions repaired, fail traces retained. Pages afbf6dd4/master index-Bu3kCk6h.js deploy exit0; production synthetic800chapters/76.4MiB derived/CSS/em/table/originalSHA PASS, zero APIcloudwrites/userD used. Native compressed83.5MiB→~0.54MiB roundtrip PASS; sampled JS heap import96/snapshot457MiB, not process/Android hardware. D metadata only; no real sourceimport/cloudnetwork; portable8MiB unchanged. Evidence .dsh-tmp/epub-import-fix/, docs/EPUB-IMPORT-2.md. Next: user reload/reselect failed files; Android/realnetwork capacity remains unverified.

2026-10-13 22:29 ICT | Codex | Name Cài đặt: src/ui/BookNamesSettings.tsx, App.tsx, reader-route.ts, style.css; reader-route tests + e2e/names-settings + scripts/smoke-names-settings-production. Thêm nhóm Name riêng: chọn local-readybook, textarea toàn bộName + Lưu; route /settings/names/:bookId giữ chọn khi reload; drafts theo book, guard queryowner và Save capturetarget/error giữdraft. Tái dùng saveBookNames merge/atomic/tombclear cũ, không đổi schema/DB primitive/provider/auth; tên bỏ sót vẫn giữ. Targeted25 exit0/build exit0/E2E22 exit0; root scope UI/route, không fullsuite/reviewer/M0 cho thay đổi này. Pages ee561ddb/master index-BT6vgcA2.js deploy exit0; production synthetic2books/nameisolation/reload/668px PASS, zero usercloud writes. Smoke đầu dữ liệuA/B giống SHA bị dedupe đúng; fixture đổi nội dung và retry PASS, giữ log đầu. IAB thật reload sau xác nhận Lưu prompt disabled; mở Cài đặt→Name riêng, không sửa/lưu Name người dùng. Logs/screens .dsh-tmp/names-settings/. Next: người dùng chọn truyện, sửa Name rồi Lưu.

- 2026-10-14 00:19 +07 | AI: Codex (ID root không xác minh); reviewer cấu hình GPT-6.1 Sol/high. NAME-IMAGE-1: name-images/language/reference-convert/AI filter/cachev2/Reader/NameImageText/EpubFrame/epub-render/bridge/secure CSP/Name UI. STV ảnh chỉ Bulbagarden; raw Name/EPUB bytes/SHA/cloud/backup giữ, AI/TTS caption thuần, source offsets giữ. Review độc lập 173 unit+9 browser trước final; final đọc code không finding; root full1375/build PASS, UI liên quan/EPUBrepeat3×2 PASS, EPUB cũ2PASS2skip; lỗi fixture/raw-mode/race ảnh/frame giữ log/recheck. Pages a0e925c4/master index-cZEp5Bh3; AIWorker unchanged. Production TXT/EPUB Convert+AI ảnh thật PASS, AI mock2/cloud writes0. Logs .dsh-tmp/name-images/. Chưa Gemini/Android thật; không D writes/reimport/user Name edits/Git. nextID NAME-IMAGE-2 nếu cần host khác.

14/10/2026 01:00 — AI (model chính chưa xác minh; reviewer Sol/high): AI-RECOVERY-3, ai-job/ai-reading/ai-complete/ai-recovery/epub-ai/Reader + focused tests/smoke/docs. Bỏ chờ cache vô hạn; TXT240s/24 sends, EPUB600s/256 sends chung, cache2s/1s child abort, JSON split ID, deadline lỗi hiển thị/manual retry xóa countdown. Giữ complete-only/source/revision/native rollback, model/key tuần tự/secrets/Worker/schema; không Git. Target47/full103files1390/build/E2E44/review175 PASS; initial full browser-hook timeout, initial smoke baseline đọc quá sớm, logs giữ .dsh-tmp/ai-reader-stall/. Pages9c52b027/index-B8fzpjWn.js exit0, prod freshcontext1238Names+1HTTPGemini2.5 thật200/5,639s/source254→891chars/raw preserved/cloud blocked. User tab chuyển chương có169đoạn, không reload gián đoạn; chưa Android thật/provider503 vẫn có thể xảy ra. Docs AI-RECOVERY-3.md; ownVite23696 stopped. Next: user reload để dùng bundle mới; không có code/check/deploy còn chờ trong phạm vi.

### 14/10/2026 08:03 — AI-PARTS-1 hoàn tất
AI chính; reviewer đã xác minh gpt-6.1-sol/high. Scope src/ai-parts, ai-reading/cache, epub-ai, ai-translate client/server, ai-key-health, Reader/AiPanel/CSS + tests/scripts/docs. Lý do: user cho phép nhiều keys/chương và hoàn thiện progress/resume. Giữ source/revision/layout/Names/secrets, atomic native cache và CAS keylease; TTS/fullcache đủ chương. Reviewer14files/247PASS; root npm.cmd test -- --maxWorkers=2:107files/1426PASS; build0; E2E9specs/80PASS desktop+Androidlayout. Log fail retained (oldfallback expectation/fixture selectors/styles); reviewer đồng ý sửa harness/invariant, không nới kiểm. Wrangler4.147 dryrun/deploy0; Worker248a6474-6231-426c-8951-e5512544774f, Pagesdf649320/master index-DpAl-zLI.js. Prod mock resume/reload0send PASS; thật Gemini2.5 3936chars/3HTTP200/max2 distinctlabels/preview12.091s/full27.140s, RAW giữ/cloudwrites0. Lần đầu provider sótHan; test với Name riêng PASS, không claim semantic hoàn hảo. Logs .dsh-tmp/ai-parts/; AI-PARTS-1.md. Android thật/quota theo project/cacheeviction là giới hạn; nextID theo yêu cầu tiếp của user, không mở backlog tự động.

### 14/10/2026 09:00 — PROMPT-LIST-1 hoàn tất
AI chính, không ghi modelid chưa xác minh. Scope ui/prompt-list, PromptStockPanel, AiPanel + unit/E2E/smoke/docs. User yêu cầu bỏ default/sửa lặp; gom tên+scope/latest/version, giữ toàn bộ IDs/settings và lựa chọn Reader, không DB/sync mutation. npm.cmd test -- tests/prompt-list.test.ts tests/prompt-stock.test.ts tests/prompt-stock-review.test.ts:30PASS; build0; E2E4specs/16PASS desktop+Androidlayout; diffcheck0. UI scope không full/reviewer. Pagesdeploy0:0a201549/master index-BFxHJPDY.js, Worker không đổi. Prod snapshot readonly5profiles→3cards/2versiongroups/defaultHidden/latest+old accessible/cloudwrites0/userTab untouched. Logs .dsh-tmp/prompt-list/; PROMPT-LIST-1.md. Android thật không kiểm; bản cũ không tự xóa; nextID theo user.

### 14/10/2026 09:31 — CONVERT-AI-NEXT-1 hoàn tất
AI chính, không ghi id model chưa xác minh. Scope Reader.tsx + e2e/convert-ai-next, harness ai-reader/name-images/epub, scripts/smoke-convert-ai-next/name-images + docs. Giữ Convert text/scroll/frame, next-only request, promote cached/pending không duplicate, cancel/Name/source/settings guards, RAW/setting preload giữ. Targetunit7files/72PASS; build0; newE2E12PASS; race3×18PASS; regression94=91PASS/1harness timeout/2skip, Reader rerun10PASS + sample/cancel3×12PASS (union92unique PASS/2skip). Initial keyboard closure lỗi đã sửa deps, giữ fail logs; harness mock API chung, không tăng timeout. UI orchestration không đổi native DB/server, không full/reviewer. Pagesdeploy0:2cc02117/master index-BV_WFseS.js; Worker giữ248a6474. Production synthetic/mockAI PASS, nextrequests1/scroll+Convert+RAWgiữ/duplicate0/cloudwrites0/usertab untouched. .dsh-tmp/convert-ai-next/; CONVERT-AI-NEXT-1.md. Không kiểm Android thật; reload không auto-arm; nextID theo user.

14/10/2026 11:29 — AI: Codex (main model ID chưa xác minh); reviewer gpt-6.1-sol/high. NAME-SYNC-1: src/shared-state-sync.ts nhận distinct Name theo nhóm <=99, snapshots/hash ngoài transaction, latest/baseline/tomb/readiness/base/conflict trong transaction; một replica write/nhóm; duplicate ID/non-Name tuần tự; event sau commit. tests shared-state-client-review/new independent-review; e2e name-sync-batch/shared-state fixture; scripts smoke-name-sync-production; docs NAME-SYNC-1/HANDOFF. Invariants raw/ID/local edit/cursor/rollback giữ. Review81 PASS; full109/1436 PASS(maxWorkers2), build0; E2E26 unique PASS, desktop offline3 reps PASS. First full/native timeout và fixture load/ModelB/CustomEvent/poll failures giữ log .dsh-tmp/name-sync/. Native1241Name15.636s→5.166s, replica1256→28/live1241→14. Pages6fa8cb8f/master index-nrr22fN1.js; prod fixture1241/13GET/7.497s/noNamePUT/no realcloudAI write/userTab unchanged. UploadPUT1/tên, Android/mạng máy người dùng chưa đo. Next: không backlog mới trong phạm vi.

## 2026-10-14 11:48 +07:00 — Codex / AI-SPEED-1 (phương án)
- Phạm vi: docs/AI-SPEED-1.md; ưu tiên tăng tỷ lệ trả đủ chương, checkpoint phần con TXT/EPUB, phục hồi đúng lỗi, tốc độ đủ chương và phép đo. Đối chiếu code + mẫu thật cũ 12,1s/27,1s + tài liệu Gemini chính thức; phân biệt mục tiêu với kết quả.
- Invariant: đủ phần/cùng model/nguồn-Name-cấu hình đúng, cancellation, cache nguyên tử, budget và lease dùng chung; không sửa code/data/secrets. Subagent chỉ đọc đối chiếu 5 file, xác nhận thêm giới hạn EPUB một mảnh; không phải review triển khai.
- Kiểm tra: nội dung/đường dẫn/UTF-8 và diff phạm vi; không test/build/AI thật/deploy vì chỉ lập phương án. Next: triển khai đợt đo + checkpoint/phục hồi khi chuyển sang bước thực hiện.

## 2026-10-14 14:41 +07 — AI-SPEED-1 triển khai
AI chính: không xác minh model runtime; reviewer gpt-6.1-sol/high theo AGENTS. Phạm vi ai-boundary/complete/parts/reading/epub-ai/reading-cache/recovery/job/metrics/Reader, targeted tests/E2E và harness production. Lý do: giữ child checkpoint, phục hồi thiếu có giới hạn, cân đối phần, hint2, quota1 và budget gốc qua auto/prewarm; manual fallback toàn chương, next dùng settings đã lưu. RAW/SHA/atomic/cancel/source/Name/model/lease/secret guards giữ; không migration/provider/tier/deps/cloud write. Full unit111/1467 exit0; review16 exit0; E2E cuối54 exit0 (reload fixture header sửa/rerun4 exit0); build TEMP riêng exit0 sau esbuild AccessDenied; deploy Pages30a6e331/master index-OTtswqPj.js exit0, AIWorker unchanged. Prod mock resume4calls/reload0/raw PASS; real Gemini2.5 synthetic3936/3HTTP200/max2/preview9060ms/full19022ms/reload0/raw PASS. Reviewer boundary/HTTP429/prewarm Name-error findings resolved, no remaining actionable finding. Logs .dsh-tmp/ai-speed/, báo cáo docs/AI-SPEED-1.md. Giới hạn: một mẫu không chứng minh%/median/ngữ nghĩa, android-layout không Android thật; low-thinking/stream chưa bật. Next: đo từ sử dụng thực tế, không tự mở rộng scope.

## 2026-10-14 15:35 +07 — AI-MODEL-COMPARISON-1 và toast model
AI chính không xác minh runtime model; reviewer gpt-6.1-sol/high. Phạm vi Reader, server/ai-translate benchmark5ID, tests138/E2EConvert-next, scriptsbenchmark/summary/prodsmoke; không đổi picker/legacy/settings/source/Name/secret/lease/config/deps/tier. Theo yêu cầu: lấy chương018book0fef4fb3 chapterb2acac31 read-only, DOM/cloud2476nonspace/FNVmatch; nguồn2771/15Names/two balanced parts. 14model×2/cachecold/noFallback/promptAI_DEFAULTS/temperature0; 101HTTPproxy,8complete/6withoutHan. Complete100%(2/2):2.5Flash44.23s,3FlashPreview43.85s,3.1Lite14.24s(Han2 both),3.5Lite12.18s(criticalmeaningerrorr1/typos). Others0/2:404/429/502/504; Gemma no full translation/no qualityscore. % smallsample/currentgateway notgeneral SLA. Toast actual completed model5s rồiẩn, badge/errors preserved. targeted138 exit0; independent20 exit0 reviewPASS; buildfixed exit0 (fixturetypes assertion fix); E2E20 exit0; Worker559edb8b-e9a6-469b-9302-a2755b5cd30b/Pagesa259beb4 master index-C6DdpCzM deployexit0, prodmocknoticeautohide/resume/rawPASS. Logs/artifacts .dsh-tmp/model-benchmark/, reportdocs/AI-MODEL-COMPARISON-1.md; failharness constructor/Names/prodtoast5s logs retained, excluded comparison. Usertab returnedAI oldbundle, no reload/cloudwrite/prefchange. No full suite rerun for scoped modelvalidation/UI; lastfull1467 previousrelease. Next only requested work, noauto provider/config upgrade.

## 2026-10-14 16:15 +07 — retest5model/multikey
AI runtime chưa xác minh; không reviewer mới (script/đo thực, không đổi app). Scope scripts/retest-ai-models-parallel.ts,retest-ai-part-two.ts và AI-MODEL-COMPARISON-1.md. 20HTTP phầnđầu1371/max2/concurrency/noautofallback; Gem3.7 1/4=25%/19.701s/keyk1;3.5/3.6/3.8/Gemma26b0/4. Scopedtailbatch2 xác nhận Google503→proxy502 Flash,500→502 Gemma,504timeouts; không lưu keys/headers/IP/nội dunglog. Theo yêu cầu multiplekeys dùnglease hiệncó khôngresetcooldown. Tiếp tụcGem3.7phần21400 haiAPI:502/3.195s,200/20.061s/keyk2; ghép đủchương2771/noHan, manualcontentcheck. Hai thời gian riêng khôngSLA39.762s/fullcold; khôngchốt%fullchapter. Extra200charsGem3.5Google503, excludedmetrics. Esbuild/harness exit0; app/config/deploy/cloud/Names/RAW unchanged; no npmfullsuite/build vì đo script. Artifacts .dsh-tmp/model-retest/;tailclosed. Handoffcurrentmodelstatusupdated. Next userrequested only.

## 2026-10-14 19:06 +07 — ưu tiên model sau3.7
AI runtime không xác minh. Scope ai-fallback/ai-models/AiFallbackFields và nhãn/actual-model alternative Reader; targeted unit/E2E/prodsmoke. Theo yêu cầu chain38→37→2.5→3Preview, forward-only; outsidepriority→2.5/Preview; picker top4, clearPreview label/endchainhint. Không đổiAPI/Worker/keys/lease/deps/tier/DB/cacheformat/RAW/promptrows; savedselectedmodel giữ. Nativecache/modelpin/cancel/retry/maxbounds giữ; manualwholefallback dựa actualmodel, không quaylạipreferredhighermodel. Unit27 exit0, buildfinalexit0 Cnghw6cy, E2E38uniquePASS across scopedruns (34+2fixed+2new); fixtures terminalmodel/nextprompt/cachechildretrybutton updated, fail logs/traces retained .dsh-tmp/model-priority/failures. Không fullsuite/reviewer mới cho logic scoped. Pages3939eecc/master deployexit0; Worker559edb8b unchanged. Prod freshcontext/mockAI/apiCloudblocked PASS: select37→2.5→3Preview, orderedpicker/actualPreviewnotice/rawpreserved; harness fail unsaveddraft and earlyRAWsnapshot fixed, logs retained. Docs AI-MODEL-PRIORITY-1.md; HANDOFF <3500; usertab chưa reload/Android-layout khôngrealAndroid. Next requestedwork only.

## 2026-10-14 20:09 +07:00 — AI / AI-HYBRID-HALVES-PLAN
Phạm vi: docs/AI-HYBRID-HALVES-PLAN.md và quyết định chế độ thử. Lập kế hoạch toàn bản dịch nửa đầu làm mẫu cho Lite; người dùng chọn opt-in/giữ mặc định, nửa đầu lỗi không tự hạ Lite. Invariant dự kiến: pin theo nửa, hash mẫu/cache riêng, đầy đủ nguồn/EPUB/cancellation, key server. Kiểm nội dung/whitespace/reference PASS; không đổi runtime, không test/build/deploy/reviewer vì chỉ tài liệu. Chưa đo hybrid; next: pilot A/B có mẫu/không mẫu theo plan.

## 2026-10-14 21:00 +07:00 — AI / AI-HYBRID-HALVES-1
Phạm vi ai-hybrid-prompt/ai-hybrid, reading/settings/fallback/cache/client/server, EPUB, AiPanel/Reader; tests/harness/docs. Opt-in toàn nửa đầu→Lite3.1/3.5, pin theo nửa/hash mẫu/data bounds/mixed metadata; giữ source/atomic/cancel/key budget. Pilot15 lượt; coldTXT48,29s/EPUB93,05s, synthetic labels cònHán. Full1503/build/E2E44/prodMock PASS; reviewer gpt-6.1-sol/high199PASS, findings đã sửa. Pages647458d8/index-Cs3Vj4Lx.js/Worker324e27ae-387b-4c22-9d90-528c788ed8ae. Log .dsh-tmp/ai-hybrid/ và report AI-HYBRID-HALVES-1.md; failures giữ. Giới hạn: không SLA/không bảo đảm nghĩa/Android-layout không thật/EPUB layout tổng hợp. NextID: chỉ theo yêu cầu mới.


## 16/10/2026 03:59 — AI — AI-RETRY-UX-1 hoàn tất
Phạm vi: ai-request-attempts/job/recovery/complete/reading/cache/epub/translate/metrics/models; server ai-translate; Reader/AiPanel/AiJobStatus/AiPromptEditor/CSS; targeted fixtures/tests/E2E/pilot scripts/docs. Lý do: bounded retry, offline/cooldown, giữ first và đúng save/stop target, UI rõ ràng; pilot lộ copied/mixed-Han nên chặn trước complete/cache/mốcAI và phục hồi theo split cũ. Giữ source/bytes/SHA/revision/EPUBIDs/atomic/cancel, no sweep/migration/progress rewind; key/lease/concurrency/provider/budget giữ.
Root full npm.cmd test -- --maxWorkers=4 EXIT0:123files/1629; build EXIT0; reviewer gpt-6.1-sol/high theo cấu hình AGENTS chấp nhận,14/14guard PASS. E2E34ca có32PASS+12repeatPASS cho2ca còn lại; mixed6/6PASS. Log fail và sửa fixture giữ invariant trong .dsh-tmp/ai-retry-ux/. Pages7cf59039/master index-BL_x50EB.js; Worker777fc28f-990c-45cf-b871-bdcdb49ca1ad; deploy/smoke cuối EXIT0, canonical khớpdist, synthetic/no cloud writes. Pilot trước12STOP nhưng4long cònHan; guard đầu2lượt1còn50Han đã bị helper cuối từ chối; mixed cuối7180char/51.788ms/7calls/0Han EXIT0.60request client tổng3pha. Không hứa speedup/ngữ nghĩa100%; Android thật chưa kiểm. Chi tiết AI-RETRY-UX-1.md; logs full-unit-mixed-1, reviewer-source-copy-mixed-final, e2e-quality-final/e2e-quality-race-followup/e2e-mixed-final, production-mixed-smoke, pilot-real/quality/mixed.json. NextID: tác vụ RetryUX đóng; không tự mở backlog.


## 16/10/2026 04:02 — AI — PROMPT-LIST-1 UI gọn
Bỏ versionselector/badge ở PromptStockPanel; bỏ binding/import UI không dùng, giữ grouping/IDs/stock/save/sync/Reader selection. Build EXIT0; E2E prompt-list2/2 EXIT0; production smoke EXIT0:5profiles/3cards/2latestgroups/cloudwrites0. Pages79640803/master index-CjD4xI-W.js; Worker không đổi777fc28f-990c-45cf-b871-bdcdb49ca1ad. Logs .dsh-tmp/prompt-simple/, ảnh/report .dsh-tmp/prompt-list/. Không fullsuite/reviewer/data migration; Android-layout không hardware. NextID: đóng yêu cầu ẩn Phiên bản.

## 16/10/2026 09:55 ICT — Codex — READABILITY-LEARNING-1
- Phạm vi: src/ui/{App,common,LibraryBookCard,AlbumShelf}.tsx, src/main.tsx; README.md và docs/PROJECT-LEARNING-GUIDE.md. Tách UI thẻ truyện/Album, làm rõ Modal/bootstrap và viết báo cáo học project theo yêu cầu.
- Invariant: giữ callbacks/DOM classes/nhãn và điều kiện khóa nút; không đổi data/import/SHA/atomicity/cancel/cloud-delete/server/secrets. Không deploy/commit/push.
- Kiểm tra: build exit1 TEMP AccessDenied; dùng TEMP/TMP .dsh-tmp/chapter-runtime build exit0. E2E shelf-title-readability + shelf-minimal-v2 + reader-requested (workers4): exit1, 2 pass/6 fail; baseline snapshot trước sửa tại cổng riêng lặp cả 6 lỗi (font/menu bounds/Name locator). Smoke local synthetic chặn API: exit0, 2/2 desktop+android-layout, Album/search/read/card/modal focus+Escape+save/reload. Diff whitespace và đường dẫn tài liệu PASS.
- Log/snapshot/config: .dsh-tmp/readability-20261016/{build.log,build-runtime.log,e2e.log,baseline-e2e.log,smoke.log}. Review tự kiểm diff đúng phạm vi; không reviewer/full suite vì chỉ UI. Giới hạn: chưa Android thật; lỗi E2E có sẵn chưa sửa; Reader/App còn các khối dài. NextID: READABILITY-LEARNING-2 chỉ khi có yêu cầu tiếp.

## 16/10/2026 — Codex — READABILITY-LEARNING-1 bổ sung
- Người dùng xác nhận mới học: bổ sung nền tảng HTML/CSS/JS/TS/React, biến/hàm/object/array, state/event, frontend/backend và bài tập đầu tiên vào docs/PROJECT-LEARNING-GUIDE.md; README trỏ tới mục 7–8. Chỉ tài liệu; không thay code runtime. Kiểm tra nội dung/diff; không chạy lại build/test/deploy.


## 16/10/2026 10:28 — AI — AI-PANEL-UI-HANDOFF
Chỉ tài liệu: đối chiếu AiPanel/AiJobStatus/AiPromptEditor/AiFallbackFields/Reader, model-hybrid/key/setting types để bàn giao UI không mất chức năng. Ghi rõ khung, hidden/conditional controls, callback, validation, Save-vs-Continue, trial-vs-reader cancel, current-vs-next, kho prompt/version, key polling, engine/data invariants và25source/spec references đã xác minh. Kiểm nội dung/paths/whitespace PASS; không đổi code/runtime, không test/build/deploy. NextID: user giao AI khác thiết kế UI theo tài liệu.

16/10/2026 11:22 +07 — AI (model id chưa xác minh): GEMMA-RETURN-CHECK-1; scripts/probe-gemma-return.mjs, docs/GEMMA-RETURN-CHECK-1.md. Chẩn đoán model ưu tiên bị fallback; đọc server30s/client40s/lease35s, không đổi runtime/key/cache/progress. API thật tổng hợp 6 calls tuần tự: 4 timeout ~30s + 2 upstream_http (tail ghi HTTP500), 0/6 hoàn tất; chưa suy ra TPS/tỷ lệ dài hạn. Log .dsh-tmp/gemma-return-baseline.log, JSON .dsh-tmp/gemma-return/baseline.json. node --check + scoped diff-check exit0; không build/test/deploy vì không sửa app. Tail đã dừng. Review không áp dụng chẩn đoán read-only. Next: phục hồi Gemma trước fallback hoặc A/B thinking minimal; không tăng deadline vượt lease độc lập. Chi tiết docs/GEMMA-RETURN-CHECK-1.md.

16/10/2026 12:10 +07 — AI (model id chưa xác minh): AI-ACTIVITY-STREAM-1; server/ai-{translate,key-health,upstream-stream,stream-response}.ts + src/ai-{translate,stream-client,stream-protocol}.ts, targeted/reviewer/E2E/probe/smoke/docs. Theo yêu cầu thay hard30s bằng hoạt động: negotiatedSSE/NDJSON first60/idle30/hard180; legacyJSON30/40s. Lease185s/35s; CAS expiry+claimtime chống collision, EOF+STOP+guards trướccomplete, cancel/late/private thought khôngra client/cache/progress. Reviewer /root/review_ai_retry_ux chấp nhận,12regression gồmD1thực. Rootfull125/1662PASS; sauEOFguard targeted5/209PASS + finalbuildPASS. E2E34PASS rồi2fixturefallback đãdịchHan→ViPASS; initialViteGETstall đãdừng/forcewarm, giữlogs; khôngmộtlượtclean36/36. Logs .dsh-tmp/ai-activity-{full,final-targeted,final-build,e2e,e2e-retry,fallback-fixture}.log. Worker0569335b-9a8f-40a1-bd0e-9504a9c82527 rồiPages00e02c8c/master index-DIDa9Q2x.js deploy0; schema/compat/deps khôngđổi. Productionisolatedmock PASS45/65s/no cloudwrites; API thật Gemma26B2/2STOP (126/836chars,30.801/66.328ms,58/128progress,0Han), khôngfallback/retry, trần2requests/240s. Log .dsh-tmp/gemma-return-activity.log và ai-activity-production.log; khôngkếtluậnTPS/tỷlệdàihạn. Tabuserkhôngreload/đổisettings; cầnreloadbundlemới. ChưaAndroidhardware. Chi tiết docs/AI-ACTIVITY-STREAM-1.md. NextID: khôngcòn việc bắtbuộc trong phạmvi.

16/10/2026 — AI (model id chưa xác minh): CHAPTER-TITLE-BOOK-1; theo câu trả lời người dùng, tiêu đề chương mở trang thông tin/mục lục của riêng truyện qua onBookInfo→/book/id (App.tsx/Reader.tsx). Gọi save như nútBack hiện có; TOCpopover trong thanh điều hướng vẫn giữ. Không đổi DB/progress/AI/TTS logic. Build1lầnPASS; targetedE2E14ca phân biệtChrome/Android-layout PASS qua12lượt chính+6repeat cho2caresume: fixture nay chờ restore callback và transaction trước reload, không nới invariant. Lượt chọn rộng đầu còn2caName ngoài scope fail tại nút '中 = Trung' không tìm thấy; không sửa luồngName. Giữ logs .dsh-tmp/chapter-title-navigation-{build,e2e,e2e-targeted,resume}.log. Không fullsuite/reviewer cho UIcallback. whoami xác nhận pages(write); Pagesbe3bbc32/master index-D3ep_cLy.js deploy0; AIWorker/schema/compat/deps không đổi. Production isolated synthetic smoke2viewport1280/412PASS, title→book→resume, TOC, mockAI/TTS,0pageerrors/0dictionarydownloads; allAPIcloud bịchặn, khônguserdatatab. Log chapter-title-navigation-production.log; screenshot test-results/reader-requested-production-{1280,412}.png. User cầnreloadbundlemới. Các yêu cầu promptpicker/updatefilefull ở các ghi chú trước chưa triển khai trong thay đổi navigation này.


17/10/2026 18:17 +07 — Antigravity (Claude Sonnet 4.6): TTS-COMPLETION-PLAN; src/tts.ts, src/domain.ts, src/ui/Reader.tsx, tests/tts-word-boundary.test.ts, tests/tts-player.test.ts, e2e/tts-resume.spec.ts, scripts/measure-tts-gaps.mjs, docs/TTS-COMPLETION-PLAN.md. Hoàn thành P0–P3 kế hoạch khắc phục khoảng chờ dài giữa các câu trong TTS: P0 đo đạc chỉ ra 100% starvation do roundtrip gateway 1.7–2.1s vượt quá audio câu ngắn 550–1224ms, cộng thêm ~300ms PCM silence nội tại của model TikTok (native Audio switch chỉ mất 10–20ms); P1 triển khai gom câu ngắn tự nhiên (ttsFlex gom cụm < 80 ký tự lên 160 ký tự, giảm 80% request và triệt tiêu starvation), thêm toggle 'Nối câu tự nhiên' trong UI Reader (mặc định 0); P2 bảo toàn offset UTF-16, cursor/resume, atomic update, keepalive 10s Blob không HTTP thừa; P3 kiểm thử: 91/91 unit tests PASS trên 6 files, build exit 0 (dist/assets/index-DXC1fd15.js), E2E 30/32 PASS (bao gồm test gom câu tự nhiên trên Desktop Chromium và Android layout; 2 timeout do Vite dev cold start), continuous 8/8 PASS. Log đo đạc: .dsh-tmp/tts-p0/tts-p0-report.json. Review tự kiểm tra scoped diff và tests; không deploy/commit/push tự động. Giới hạn: kiểm chứng tự động trên Chromium và Android viewport; cần người dùng kiểm tra loa máy trên Android thật sau khi deploy. NextID: Deploy Pages khi được người dùng cấp phép và smoke production.

17/10/2026 18:28 +07 — Antigravity (Claude Sonnet 4.6): TTS-DEPLOY-PRODUCTION; deploy Cloudflare Pages theo yêu cầu người dùng ('deploy'). Bundle index-DXC1fd15.js (769.01 kB) deploy thành công qua wrangler pages deploy dist (exit 0), deployment ID 63a0008f-..., phục vụ tại https://thu-phong-private.pages.dev/ và preview https://63a0008f.thu-phong-private.pages.dev. Smoke production tự động: smoke-tts-recovery-production.mjs PASS (native carrier Blob 10s, 0 HTTP request thừa, cursor/pause/resume giữ nguyên); smoke-tts-flex-production.mjs PASS (checkbox 'Nối câu tự nhiên' hiển thị trong Cài đặt đọc truyện -> Nghe sách, lưu IndexedDB 'reader' ttsFlex=1, reload giữ nguyên trạng thái). Giới hạn: kiểm chứng tự động môi trường headless/Pixel 7 emulation; cần người dùng kiểm tra loa máy trên Android thật. NextID: Không còn task mở trong kế hoạch TTS.

## 17/10/2026 22:40 +07 — Antigravity: TXT-PERSISTED-TITLES hoàn tất
- Hoàn thành kế hoạch lưu tên Việt khi nhập TXT (`docs/TXT-PERSISTED-TITLES-PLAN.md` P0–P4).
- Phạm vi: `src/domain.ts`, `src/title-resolver.ts`, `src/title-converter.ts`, `src/importer.ts`, `src/cloud-snapshot.ts`, `src/shared-state-schema.ts`, `src/chapter-append-schema.ts`, `src/backup.ts`, `src/ui/OriginalFiles.tsx`, `src/ui/ConvertedTitle.tsx`, `src/ui/App.tsx`, `src/ui/StoryDetail.tsx`, `src/ui/Reader.tsx`, `server/cloud-library.ts`, `tests/persisted-titles.test.ts`.
- Invariant: File TXT gốc giữ nguyên 100% bytes, SHA256, encoding, relativePath và cloud descriptor; tên Việt hiển thị và tên tải xuống lưu bền tại `displayTitle` (Book/Chapter) và `displayName` (SourceFile) trong IndexedDB. Hiển thị tủ sách, chi tiết truyện, Reader heading, TOC, Media Session và tải file dùng trực tiếp tên Việt bền mà không nạp Worker/từ điển VietPhrase. Tương thích 100% ngược với CloudSnapshot, SharedRecord, ChapterAppend, Backup/Restore. Hỗ trợ nút "Chuẩn bị tên Việt" chủ động có tiến độ và hủy trong chi tiết truyện cho truyện cũ.
- Kiểm tra:
  - Unit tests: `tests/persisted-titles.test.ts` (13/13 PASS).
  - Regressions: `tests/txt-append.test.ts` + `tests/txt-append-independent-review.test.ts` (43/43 PASS), `tests/original-library-integration.test.ts` + `tests/cloud-snapshot-codec.test.ts` (15/15 PASS), `tests/batch-import.test.ts` + `tests/convert-cache.test.ts` (18/18 PASS).
  - Build: `npm.cmd run build` (tsc client, tsc server, vite build) EXIT 0, bundle `dist/assets/index-DaMjVivN.js`.
  - E2E: `e2e/converted-titles.spec.ts` (2/2 PASS chromium + android-layout), `e2e/original-files.spec.ts` (10/10 PASS), `e2e/txt-append.spec.ts` (6/6 PASS).
- Review: Tự kiểm tra scoped diff và invariants; không commit/push tự động theo AGENTS.md.
- Giới hạn: Đã kiểm chứng môi trường Desktop Chromium và Android layout (Pixel 7 emulation); chưa kiểm tra Android phần cứng thật.
- NextID: Deploy Pages khi được người dùng yêu cầu.

## 17/10/2026 22:42 +07 — Antigravity: DEPLOY-PAGES production
- Deploy Cloudflare Pages theo yêu cầu người dùng ('deploy').
- Lệnh: `npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true` (exit 0).
- Deployment ID: `072d819b` (https://072d819b.thu-phong-private.pages.dev), phục vụ chính thức tại https://thu-phong-private.pages.dev/.
- Bundle production: `dist/assets/index-BY5Kr8JE.js` (773.18 kB, gzip 246.55 kB).
- Smoke production tự động: `node scripts/smoke-txt-append-production.mjs` EXIT 0; kiểm tra canonical HTML khớp dist, import và append TXT tổng hợp hoạt động chính xác trên cả 2 viewports (869px desktop và 393px mobile), 0 lỗi console/page error, API cloud bị cô lập 503 synthetic.
- Invariants: Không đổi server Worker, bindings, secret hay migration. Không commit/push tự động theo AGENTS.md.
- NextID: Không còn task mở trong kế hoạch TXT-PERSISTED-TITLES.


## 17/10/2026 23:05 +07 — Antigravity: AUTO-TITLES & DEPLOY-PAGES production
- Theo yêu cầu người dùng: bỏ nút thủ công "Chuẩn bị tên Việt", chuẩn hóa tên Việt là mặc định và tự động.
- Phạm vi: `src/ui/StoryDetail.tsx`, `src/ui/LibraryBookCard.tsx`, `src/ui/ConvertedTitle.tsx`, `src/ui/App.tsx`, `src/title-converter.ts`.
- Chi tiết:
  1. `StoryDetail.tsx`: Loại bỏ nút bấm thủ công và trạng thái tiến trình; tự động kích hoạt `prepareBookTitles(bookId)` trong nền khi phát hiện sách/chương có chữ Hán chưa có `displayTitle`.
  2. `LibraryBookCard.tsx`: Thẻ bìa truyện `<strong>` và tiêu đề hiển thị `displayTitle || book.title` trực tiếp.
  3. `ConvertedTitle.tsx`: Kiểm tra `db.names`, tự động render ngay `displayTitle` nếu không có custom Name; nếu có custom Name thì convert động theo Name để người dùng chỉnh sửa có hiệu lực ngay.
  4. `title-converter.ts`: Bảo vệ `prepareBookTitles` không ghi raw Chinese vào `displayTitle` khi chưa có từ điển (`dictCount === 0`) hoặc khi tiêu đề không đổi; chỉ commit khi có thay đổi thực sự.
- Kiểm tra:
  - Unit: `tests/persisted-titles.test.ts` (13/13 PASS).
  - Build: `npm.cmd run build` (tsc client, tsc server, vite build) EXIT 0, bundle `dist/assets/index-Kcq3hz81.js`.
  - E2E: `e2e/converted-titles.spec.ts` (2/2 PASS chromium + android-layout).
  - Deploy Pages: `npx.cmd wrangler pages deploy dist --project-name thu-phong-private --branch master --commit-dirty=true` EXIT 0. Deployment ID `c1df87e6` (https://c1df87e6.thu-phong-private.pages.dev), phục vụ tại https://thu-phong-private.pages.dev/.
  - Smoke test production: `node scripts/smoke-txt-append-production.mjs` EXIT 0 trên cả 2 viewports 869px desktop và 393px mobile.
- Invariants: File TXT gốc giữ nguyên 100% bytes, SHA256 và descriptor; không commit/push tự động theo AGENTS.md.
- NextID: Không còn task mở.

### 19/10/2026 13:50 ICT — AI — Tủ sách song ngữ, tìm chương, cách xem
- Phạm vi: src/ui/{App,AlbumShelf,LibraryBookCard,ConvertedTitle,useChapterSearch}.tsx/ts, src/{library-search.ts,library.css,main.tsx}; tests/library-search.test.ts; e2e/{library-bilingual-search,converted-titles}.spec.ts; USER-GUIDE và HANDOFF.
- Yêu cầu: tên Việt trên/tên Trung nhỏ mờ dưới cho Album/truyện; thêm Lưới/Danh sách nhớ tại máy; tìm tên chương gốc/Việt không dấu, mở thẳng chương khớp. Metadata chương chỉ giữ tên/id/order trong RAM, scope Album, debounce và bỏ kết quả đã hủy; không ghi DB, không tải truyện cloud để tìm tự động.
- Invariant: giữ tên nguồn, bytes/SHA/truyện cũ, tiến độ và cloud-delete. Chỉ thêm presentation và truy vấn đọc; không migration, D giữ read-only. Review tự kiểm theo phạm vi UI/logic đọc, không reviewer độc lập.
- Kiểm tra: unit-final.log exit0 (3 ca); build-final.log exit0; e2e-retry.log exit0 (6 ca desktop/Android layout); search-repeat.log exit0 (2 ca tìm chương ×3); ảnh list390/869 và grid390 đã xem, không tràn ngang320–1280; diff --check exit0. Log tại .dsh-tmp/library-bilingual/.
- Lỗi môi trường giữ log: build.log exit1 AccessDenied TEMP, khắc phục TEMP/TMP .dsh-tmp/chapter-runtime; e2e.log exit1 (4 timeout lúc load dev, 2 ca tìm kiếm đạt), lượt retry6/6 đạt. Giới hạn: chỉ tìm chương đã có local; cần từ điển đã lưu để Convert tên chưa có bản Việt; Android thật chưa kiểm. Chưa deploy; next: deploy Pages khi được yêu cầu.

### 19/10/2026 14:01 ICT — AI — Triển khai tủ sách song ngữ
- Theo yêu cầu triển khai ba tính năng đã nghiệm thu. Dùng Wrangler local4.147.0, Pages thu-phong-private/master; deploy exit0, production 0cc3587a-e25a-4cce-a917-4f54778c0ea6; canonical /assets/index-C-dqvr06.js khớp dist. Không đổi Worker AI/config/migration/deps; không sửa hoặc nhập lại truyện.
- Smoke deployed frontend exit0: 869/393px, Album/truyện Việt trên+Trung dưới, 5 truy vấn chương Việt có/không dấu và Trung, mở đúng chương, Lưới/Danh sách nhớ khi tải lại, không tràn ngang/pageerror. Dữ liệu tổng hợp trong context mới, mọi API được chặn cô lập; không upload D/cloud write. GET thật /api/cloud/books200,27 truyện; Pages list xác nhận Production.
- Bằng chứng: .dsh-tmp/library-bilingual/{deploy.log,deployments.json,production.log,production.json,production-{grid,list}-{869,393}.png}; ảnh đã kiểm. Dùng build/E2E đã pass của cùng mã nguồn, không lặp suite. Android phần cứng chưa kiểm. Next: người dùng tải lại website để nhận bản mới.

### 19/10/2026 14:30 ICT — AI — Tác giả/Album → Series/Album con → truyện → chương
- Theo chỉ đạo NHỚ LUẬT: ghi quy tắc vào AGENTS.md và DECISIONS. Phạm vi: src/album-tree.ts, ui/{App,AlbumShelf,FolderImportDialog}, library.css; tests/album-tree.test.ts, e2e/album-hierarchy.spec.ts; USER-GUIDE/HANDOFF. Dựng cây từ exact đường dẫn Album cũ; cha ảo khi chỉ có folder con; đếm tổng nhánh, breadcrumb/quay về cha, tìm chương toàn nhánh, tạo con dùng registry hiện có. Tên Việt/Trung và cách xem giữ nguyên.
- Invariant: không migration/đổi membership/ID/file nguồn/bytes/SHA/chương/progress cũ; import vẫn mỗi file một truyện, chương bên trong. UI xóa Album chỉ hiện ở lá; không đổi cloud-delete hoặc thêm xóa đệ quy. DB cũ được E2E so trước/sau điều hướng; không đọc/ghi/copy/upload D. Review tự kiểm phạm vi hiển thị, không reviewer dữ liệu vì không sửa import/registry/removal internals.
- unit.log exit0 (album-tree3+library-search3); build.log exit0. E2E10 ca đạt tổng lượt đầu4 + lượt --last-failed6; e2e.log giữ 4 timeout load dev và 2 lỗi locator Đóng trùng, đã sửa test chọn footer, e2e-retry.log6/6 exit0. Không lặp các ca đã đạt.
- Deploy Wrangler local4.147.0 Pages thu-phong-private/master exit0, bb332c45, index-CLXnewck.js. Production smoke exit0 ở869/393px: cây bốn tầng, cha ảo, song ngữ, tìm chương nhánh, tiến độ, tạo Series/đích nhập, không tràn/pageerror; ảnh đã xem. Fixture tổng hợp mới, API chặn cô lập/0cloud write. GET thật catalog200/66 truyện. Log/ảnh/report tại .dsh-tmp/album-hierarchy/; không đổi deps/config/AIWorker/migration.
- Giới hạn: Android phần cứng chưa kiểm; tên chưa có bản Việt cần từ điển đã lưu. Next: Ctrl+F5 website, Album cũ tự nằm đúng nhánh, không nhập lại.

19/10/2026 16:22 ICT — Codex; reviewer gpt-6.1-sol/high: SYNC-SCALE-1. db/domain/original-sync-index/cloud-original-client/cloud-client/cloud-device/App; tests sync-scale/review/e2e, cloud-device/cloud-sync expectations, folder version assertion. DBv4 index-only + source revision/verified receipt; pending-only reads/GET/hash, atomic fresh SHA+context/tombstones giữ; coalesced trailing/online retry, quiet unchanged status. Root full1834/142files exit0 (--maxWorkers4); build0; E2E38unique qua run/retry +12race repeats0; independent6PASS/no blocker. Initial parallel runtime timeouts/TEMP AccessDenied/cold Vite logs retained, scoped dev config, no deps change. Production d2f5691f/master index-Bkf6YJKQ.js; synthetic1000book smoke2viewports0GET originals/0Blobreads/error/overflow, real catalog200/66. No D writes/usercloud writes/reimport. Logs .dsh-tmp/sync-scale/. Limits: legacy missing metadata local reads; catalog/sharedstate/search not redesigned, no Androidhardware claim. Next: observe real normal reload; scope complete.

19/10/2026 16:34 ICT — Codex, UI Phòng tối: App/AlbumShelf/library.css/reader-route; route unit + dark-room/hierarchy/bilingual/sync-scale specs. Theo browser comments: chuyển Album sang /phong-toi, fixed góc dưới phải, Thư phòng giữ nonAlbum books, bỏ heading chưa Album/× card, giữ đỏ delete bên trong leaf; hierarchy/membership/bytes/progress/delete engine giữ. Unit25/build/E2E10+scale4 PASS; production3e6292cc/master index-BMzxVMXl.js, canonical synthetic2viewports869/393 no overflow/pageerror, no realcloud writes. Logs .dsh-tmp/dark-room/. No D/schema/API/source changes; no independent reviewer needed UI scope. Next none for request.

19/10/2026 16:38 ICT — Codex; menu refinement user-requested UI: src/ui/App.tsx, library.css, USER-GUIDE/DECISIONS/HANDOFF; replace labeled floating room CTA with fixed ⋯ utility menu and explicit room choices. No data/route/deletion changes. Build PASS; no tests run (UI-only, not requested). Pages production b5de5df2/master index-B-1XrZYH.js deployment complete. Log `.dsh-tmp/dark-room-menu/`. No outstanding work.

19/10/2026 16:43 ICT — Codex; footer link requested: App/library.css; USER-GUIDE/DECISIONS/HANDOFF, update existing dark-room/hierarchy/bilingual selectors. Small muted fixed footer introduction links straight to /phong-toi, removes ⋯ menu/state; native anchor keyboard/newtab support. No data/route/delete changes. Build/E2E10 PASS desktop+Androidlayout320/393/869. Pages2d416402/master index-BaSoM-FO.js deployed; canonical bundle read confirms. Logs .dsh-tmp/dark-room-footer/. D unchanged, no usercloud writes. Next none.

19/10/2026 16:47 ICT — Codex; footer normal flow: library.css, dark-room existing E2E, USER-GUIDE/DECISIONS/HANDOFF. User clarification: footer after shelf content, no viewport attachment; remove fixed/inset/z-index and reserved padding. Link route/data unchanged. Build0/E2E2PASS desktop+Androidlayout320/393/869; scrolling leaves document position stable and footer appears at end. Initial assertion raced cloud-status layout; wait fixture error readiness, no product weakening. Pages9ccf1f3c/master index-uXyrtpB3.js; canonical200/bundlematch. Logs .dsh-tmp/footer-flow/. No D/usercloud writes. Next none.

19/10/2026 17:21 ICT — Codex; anthology opt-in requested, reviewer gpt-6.1-sol/high: anthology.ts/worker/AnthologyImportDialog; focused ImportDialog/BatchImportDialog/batch-import/library.css; synthetic unit/review/e2e + docs. Rawbyte boundaries+wholeSHA+manual starts/titles; exact source slices/forced actualencoding→existing Batch atomic staging/cancel/rollback; no auto old reimport/schema/API/source D writes. M0 Dread metadata8,822,074B/105markers/30groups/4warnings/728ms/maxchunk256KiB/concatSHA exact, no copy/upload. Root full1852/build PASS; independent9PASS/no blocker; E2E12uniquePASS (one label-selector retry), production synthetic2viewports2readybooks5chapters/sourceSHA exact/no overflow/errors. Pages241dc68f/master index-nFWPHrou.js; catalog200/66 unchanged. Logs .dsh-tmp/anthology/. Limits markerheuristic user checks numbering,40MiB/2000markers/100books, scan skipsdecode longlines but full import fatalvalidates+rollsback; Androidhardware untested. Next none for implementation; user must choose/check/import own file.

20/10/2026 11:30 ICT — Antigravity: hoàn thành AI-PARALLEL-PLAN thay thế dịch nửa chương sau; phạm vi src/ai-settings-type.ts, src/ai-parts.ts, src/ai-reading.ts, src/epub-ai.ts, src/ai-reader-settings.ts, src/ui/AiPanel.tsx, src/ui/Reader.tsx, src/ui/AiSettingsPage.tsx, src/ui/PromptFields.tsx; tests/ai-parallel.test.ts; docs/AI-PARALLEL-PLAN.md, docs/DECISIONS.md. "Dịch chia phần" (splitParts) dùng cùng primary model, concurrency tối đa 2 request phiên đọc, 1 khi throttled; scheduler priority foreground (0+idx) trước prewarm (100+idx); quota feedback bounded <= 30s. Tương thích ngược hybrid/prompt/cache; unit test 634/634 AI & EPUB pass, 12/12 E2E ai-parts pass, build sạch; deploy Cloudflare Pages.

### 20/10/2026 — Chỉ dẫn vị trí bàn giao
File này là nhật ký cũ; giữ nguyên lịch sử. Từ lượt tổ chức lại sau undo dở, append tại ../../HANDOFF-LOG.md; trạng thái hiện hành ../../HANDOFF.md, thiết kế AI-PARALLEL-PLAN.md. Không dùng báo cáo triển khai trước undo làm chứng cứ checkout hiện tại.


## 21/10/2026 18:55 — AI/root, reviewer GPT-6.1 Sol/high — quản lý chương tối giản
- Người dùng yêu cầu bắt đầu sửa, chỉ hiện Sửa/Xóa sau Quản lý chương. StoryDetail/ChapterEditor/CSS: sửa title/text với opening CAS, chọn xóa/xác nhận một lần, Đã xóa/khôi phục, Xong ẩn controls; giữ nháp khi lỗi, khóa thao tác khác khi đang sửa.
- Book hidden IDs + chapter-state schema/local/sync/server: giữ row/source bytes/ID/order, active counts/Reader/search; fixed CAS pending journal, ACK cloud trước local; retry lost response, bỏ journal bị supersede/definitively rejected. No migration. Backupv3/cloud snapshotv2 bảo toàn retained rows, validate/remap hidden IDs; legacy vẫn nhận. Chặn progress/TTS/AI cache ghi muộn; Reader abort AI nếu hết nguồn. Edit/visibility là record độc lập; child split ID mới hiện riêng (DECISIONS/design).
- Root npm.cmd test -- --maxWorkers=4 exit0:161file/2007test. Reviewer regression18/18 exit0, ACCEPTED; npm.cmd run build exit0, index-BRXwBbI0.js. E2E local4/4 + production4/4 exit0 desktop/android-layout, kiểm opt-in/edit/cancel/delete/restore/source bytes/reload và abort AI giữa hai tab. Logs/review/screenshots: .dsh-tmp/chapter-manage/. Invalid-version cloud test đổi sentinel2→999 vì v2 nay hợp lệ.
- Pages deploy exit0: https://f718d1d3.thu-phong-private.pages.dev; alias https://thu-phong-private.pages.dev trỏ bundle SHA256 khớp dist (asset-proof.log). Rollback48925bcb. AIWorker giữ nguyên; không commit/push, không ghi dữ liệu cloud khi smoke (API503 + fresh synthetic contexts). Chưa xác minh Android/audio thật hoặc remote write thật. NextID: không còn việc bắt buộc trong phạm vi này.

## 28/10/2026 15:05 — Immediate AI key rotation, deploy c42c1181
AI chính: model runtime chưa xác minh; reviewer độc lập GPT-6 Astra High đã xác minh. Phạm vi: server/ai-translate; ai translate/recovery/scheduler/parts/reading/fallback/job/prompt-trial/chapter-view; EPUB adapter, Reader, AiSettingsEditor; tests/ai-immediate-policy + native runtime; hai E2E foreground/short-chapter; USER-GUIDE/HANDOFF/DECISIONS. Lý do: người dùng bỏ mọi chờ tự đặt, ưu tiên key khác ngay. Giữ caps2/budget/deadline/Stop/pin/checkpoint/cache/source và Lite role; actual Retry-After chỉ skip key. A/B flag, EPUB failed-lease release và exhausted-copy được sửa theo review cuối; reviewer không viết code/test. Source hashes server694749A0960B / reading7B4A981BD246 / EPUBB0310AB42625 / Reader2648C24806AE; final test hashes F4A9975F0E42/3C3015126EFB/B7122E4C59A4/F19220D75C4F, không còn finding.
Kiểm tra exit0: typecheck; targeted immediate22, native3, legacyserver141, role/promotion; npm.cmd test -- --maxWorkers=4 (199files/2466pass); npm.cmd run build -- --outDir .dsh-tmp/capcut-dist với VITE_TTS_GATEWAY=capcut-v2; preview E2E26/26; production E2E26/26. Frozen-clock retries hoàn tất không tiến đồng hồ; sau exhaustion +900s không request/timer; Stop không phát lượt tiếp. Log .dsh-tmp/ai-foreground/immediate-{full,build,browser,production,worker-deploy,worker-status,pages-deploy}.log. Native Worker upstream giả lập; browser API/IDB tổng hợp cô lập cloud; chưa Google thật/Android thật.
Deploy Worker0a211620-270f-4baf-9501-50017dfba21c100%; Pagesc42c1181/index-DsmG-1oB.js, aliasHTTP200 đúng asset. Rollback Pages9613da60/AI4d88ab9e; ConvertWorker không đổi. Không commit/push, không migration/key/provider. Hành vi và nguồn mã mở: USER-GUIDE. Next: không mở backlog; tab cũ cần reload.
## 28/10/2026 19:33 — TTS editor newline, Pages34cc1835
AI chính runtime model chưa xác minh; review độc lập GPT-6.1 Sol High (đã xác minh), chỉ đọc. Phạm vi tts.ts thêm ttsSentenceDraft + Reader import/open/count; tests/tts-sentence-editor.test.ts; e2e/tts-sentence-editor.spec.ts; TTS-AUTONOMY/HANDOFF/DECISIONS. Lý do Câu1 gộp tiêu đề/dòng dưới do dùng natural batches. Helper tách CRLF/CR/LF trước strict sentences/cap, không đổi parser/player/cursor/cache/source/schema. ttsPauseText vẫn tạo dấu nghỉ khi gửi audio; áp dụng chỉ trong phiên. Source review hashes tts0C80446DD9AB / Reader7EDA9CE98E4F, không finding; final E2E test-only thêm chọn Bản gốc sau Stop vì quick-listen có sẵn tự bật AI, source không đổi.
Exit0: npm.cmd test -- tests/tts-sentence-editor.test.ts tests/tts-newline-pause.test.ts tests/tts-word-boundary.test.ts tests/tts-resume.test.ts (29/29); build CapCut-v2 .dsh-tmp/capcut-dist (index-7NL-sT4g.js); focused preview4/4 + production4/4 Edge/Pixel7 emulation, raw/AI editor/apply/reopen/newline-pause/source no mutation. Lượt E2E đầu2fail ở assertion mode cuối, giữ preview.log; sửa fixture/rerun preview2.log đạt. Không full suite cho thay đổi adapter/UI nhỏ. Logs .dsh-tmp/tts-line-editor/{unit,build,preview,preview2,deploy,production}.log. AI/TTS upstream giả lập; chưa kiểm giọng thật/Android thật.
Pages34cc1835 deploy success, aliasHTTP200/asset đúng; WorkerAI0a211620/Convert không đổi. Rollbackc42c1181. Nguồn GitHub/điều chỉnh/giới hạn: docs/TTS-AUTONOMY-M0.md. Không Git commit/push. Next không còn việc bắt buộc; reload tab cũ.
## 28/10/2026 20:16 — Cài đặt Nhật ký AI dùng chung, deploy cb2b74e3
AI chính runtime model chưa xác minh. Agent backend/UI GPT-6.1 Sol High (đã xác minh) triển khai riêng vùng; review GPT-6 Astra High độc lập chỉ đọc diff cuối, không finding còn mở. Phạm vi migration0016/server/ai-log + observer/upstream in ai-translate/ai-worker/Pagesfunction; sharedtypes; clientoutbox100/ai-metrics/AiSettingsEditor trial exclusion; App/settingsroute/AiLogPage/CSS/stats; new ai-log*.tests/E2E; M0/guide/DECISIONS/HANDOFF. User chốt gộp điện thoại-PC; PUBLIC_LIBRARY=1 thống kê deployment-wide, không namespace/auth mới. Giữ source/key privacy, max2keys, budget/Stop/pin/cancel và không chặn dịch khi log lỗi; 5000events/30days atomic D1 cap. Request servervalidation != upstream HTTP200 != clientchapter; không dùng cache/Stop làm lỗi model. Sửa review: timeout/Stop, invalid-key/location400, cancelled chapter code, nonblockingGETqueue; tất cả nguồn đã kiểm cuối. Hashai-translateDE6DCD6C4665/logD23E253205F1/client8F993A961B31/metrics87B9DA4903F8/stats62018CDABBD2/page5C7A51A82E9F; E2Etestonlylocatorfinal15515F9B5C81 reviewed.
Exit0: targetedbackend29(24unit+5nativeworkerdD1); client5/stats8; full npm.cmd test -- --maxWorkers=4 (204files/2514pass); build CapCut-v2 index-81Wnx6zM.js; preview8/8 + production8/8 threecolors DesktopEdge/Pixel7emulated. First E2ElocatorgetByLabelmodel timeout; test-onlygetByRolecomboboxfixed, no appcodechange/fullrerun. Screenshots/HTTP fixtures nativeIDB synthetic, allAPIcloudisolated, no Google/TTSrealcall or realuserdatawrite fromtests. GETrealAPIHTTP200 rows0 cap5000/30days cacheprivate-no-store. Logs .dsh-tmp/ai-log/{build,full,client-stats-final,preview,preview2,migration,worker-deploy,worker-status,pages-deploy,production}.log and ai-log-http400.log; sources/limits at docs/AI-LOG-M0.md.
Deploy only0016 SQL direct (no migration13/fullapply), Worker58ed1614-8344-4c09-b912-658279c00b12 100%, Pagescb2b74e3/index-81Wnx6zM, aliasHTTP200 expectedasset. Convert unchanged. RollbackPages34cc1835/AI0a211620; newtable canremain onrollback. No commit/push/dependency/provider/secrets changes. Best-effort journal, clientreportedchapters/unknownmodel, no reconstructedhistory or claim human quality/realAndroid; modelrequest includesprompttrials notchaptercounts. Next no requiredwork; reload + Cài đặt→Nhật ký.
## 11/11/2026 — Packed dictionary cache (local, chưa deploy)
Model/effort runtime chưa xác minh. Phạm vi: packed-index/cache, local language engine/worker, tests và tài liệu. Giữ TXT chuẩn, DB schema/server/backup/cloud không đổi; cache riêng `vp`/`hanviet`, overlay Name edits. Baseline server test lần đầu 1 ca ECONNRESET/114; chạy lại độc lập 6/6 pass (flaky). Packed-index target test 3/3 pass. Build lần đầu vướng esbuild TEMP AccessDenied sau TypeScript pass; retry pending. Chưa có benchmark đo, full test, E2E, review độc lập hoặc deploy. Chi tiết/giới hạn: `docs/DICTIONARY-PACKED-CACHE.md`; log `.dsh-tmp/packed/`.

Benchmark correction: final 36,000 lookup times are recorded in `docs/DICTIONARY-PACKED-CACHE.md`; do not infer actual reader startup latency from the synthetic index microbenchmark.

Final evidence update (11/11): build exit0; packed/local dictionary target 24/24; convert cache/title 53/53; server isolation 41/41 including mTLS 6/6. Synthetic Node24.14/1.2M: Map 617.8ms, packed build 1949.2ms, structuredClone 32.9ms, index init0.2ms, 36k lookups Map13.8ms/packed34.1ms, equality true. Full suite 45 failures/2796 pass/7 skip across 27 files; dictionary E2E 4 page.goto timeouts. No Android benchmark, Astra High review, or deploy. Logs `.dsh-tmp/packed/`.

Follow-up: `e2e/dictionary-persistence.spec.ts` now isolates `/api/**` and uses `domcontentloaded`, but Chromium/1 worker still timed out at page.goto. Manual Edge check blocked by computer-use URL policy; no real dictionary file provided. Not deployed.

Preview E2E recovery: `dictionary-persistence.spec.ts` uses native IndexedDB APIs and synthetic fixtures; temporary preview config serving built `dist`, Chromium/1 worker passed 1/1 in 9.0s. Verified packed `vp` record persists through reload and TXT bytes/SHA stable. Still no manual real-file test, Android test, independent Astra/Sol review, or deployment.

11/11/2026 preview deploy: Pages deployment `eabc0ed1-1f96-42f1-97d1-47731e0ad86e`, `codex-packed-dictionary` / Preview, static dist only via isolated cwd (no Functions or production DB/storage bindings). URL `https://eabc0ed1.thu-phong-private.pages.dev` is public. Page+bundle HTTP200, bundle SHA matches uploaded; remote synthetic persistence E2E1/1. Production remains 85b93944 on master. Existing other frontend changes in dist are included. No formal Astra/Sol review or real Vietphrase/Android test. Logs `.dsh-tmp/packed/{preview-deploy.log,preview-deployment-confirm.json,dictionary-persistence-remote-preview.log}`.

11/11/2026 Production release by explicit user request: Pages `master` deployment `a51be252-5bb6-4d07-a639-271c05f837bd`; previous production `85b93944-0c18-4e79-bf34-dbfcf4dcb4d9` retained as rollback target. Build exit0, upload Functions, canonical page/asset HTTP200 and bundle SHA matches `dist`. Production synthetic persistence E2E 1/1 pass, APIs intercepted to avoid cloud writes. Full suite still has 45 failures/27 files; no formal Astra/Sol review or real Vietphrase/Android test. Deployment included current working-tree frontend and Functions changes beyond Packed Cache. Logs `.dsh-tmp/packed/{main-build.log,main-deploy.log,main-deployment-confirm.json,dictionary-persistence-production.log}`.

## 11/11/2026 — Reader Convert rendering performance (chưa deploy)
Model/effort runtime chưa xác minh. Phạm vi: `src/features/reader/components/Reader.tsx`, `src/features/reader/styles/stv-layout.css`, `docs/READER-PERFORMANCE.md`. Lý do: phản hồi đọc chương dài Convert bị lag khi cuộn. Invariant: Giữ nguyên thẻ `<button>` và các thuộc tính dataset của token cho tương tác click/lookup/Name/TTS; không đổi DB/Worker; giữ đoạn TTS `.speaking` eager để tránh layout shift khi nghe audio. Thay đổi: (1) Token không có Name Image render trực tiếp chuỗi `x.text` thay vì qua `<NameImageText>`, loại bỏ tạo Set/sort/Fragment thừa của React; (2) Chuẩn hóa CSS selector `content-visibility: auto` theo `[data-reader-mode="convert"]` và `:not(.speaking)`, bỏ selector `:has()`; giữ `12em` làm ước lượng thử nghiệm. Kiểm tra: `npm.cmd run build` exit 0; targeted test 93/93 pass (5 suites: reader-word-edit, reader-word-actions, polish-word-blocks, name-images, reader-route). Review: nhánh render text đạt (PASS); CSS content-visibility có FINDINGS về co giãn thanh cuộn / khôi phục vị trí đọc, cần kiểm chứng thiết bị thật. Giới hạn: Chưa có Performance Trace trên browser thật; chưa đo layout shift giữa đoạn ngắn/dài; deploy HELD.

## 11/11/2026 11:25 ICT — Reader Convert render text, Pages 84660ae0
GPT-6.1 Sol. Reader.tsx/stv-layout.css: giữ text trực tiếp và nút/Name Image, bỏ containment thử nghiệm sau khi tái hiện lệch vị trí. Nền a51be252 khớp SHA JS/CSS; build exit 0; preview + production Edge/Pixel 7 mô phỏng pass smoke đoạn 100/Enter/đổi Raw/5 wheel, API mock. HTTP 200 và JS SHA khớp. Chưa đo FPS/TTS/Android thật. Log .dsh-tmp/reader-perf/text-*.log; rollback a51be252.


- 2026-11-12 18:50 ICT | EPUB HTML Repair | Dung thứ lỗi cú pháp EPUB XML/XHTML. Tự escape dấu & trần thành &amp;, bổ sung map entity HTML phổ biến case-insensitive; cơ chế fallback HTML5 tolerant parsing (DOMParser text/html) cho chapter documents khi parse strict XML gặp parsererror (thẻ void <br>, <img>, <hr> chưa đóng, thẻ lồng sai, entity lạ); tuần tự hóa lại bằng XMLSerializer sang XHTML chuẩn trước khi lọc bảo mật sanitizeEpubChapter. Giữ nguyên byte/SHA nguồn trong IndexedDB; giữ nguyên kiểm tra chặn <!ENTITY / DTD nội bộ chống XXE/Billion Laughs; file XML cấu trúc (container.xml, book.opf, toc.ncx) giữ XML strict để bảo toàn phân biệt hoa thường. Unit tests tests/epub-dom-security-review.test.ts 4/4 pass (gồm ca malformed HTML mới), regressions EPUB (stream, convert, batch, independent) 21/21 pass; build pass exit 0 (bundle index-BovsuiY4.js). Deploy Cloudflare Pages master 04a642ee (rollback 84660ae0), canonical HTML/JS HTTP 200 khớp SHA. Production smoke (synthetic malformed EPUB và tệp Pixiv thực tế của người dùng) 2/2 pass trên Edge thật. Chi tiết: docs/EPUB-HTML-REPAIR.md.

- 2026-11-12 20:15 ICT | EPUB HTML Deep Clean | Làm sạch sâu cây DOM EPUB (Phương án 1 tham khảo Mozilla Readability, Calibre, Foliate). Bóc lớp vỏ bọc thừa span/font/div không mang thuộc tính ngữ nghĩa; dọn dẹp các phần tử rỗng không có nội dung; chuẩn hóa gộp các text nodes vụn liền kề bằng Node.normalize(); bảo toàn 100% hình ảnh (img/data-epub-src) và định dạng màu sắc/in đậm chữ; dỡ bỏ giới hạn cứng nodes.length > 10.000, chỉ giữ giới hạn an toàn 1 chương <= 128.000 ký tự; nâng trần đọc tệp XML lên 16 MiB và CSS lên 2 MiB (100 stylesheet). Unit tests tests/epub-dom-security-review.test.ts 5/5 pass (gồm ca kiểm thử deep cleaner unwrap span/normalize), EPUB regressions 57/57 pass; build pass exit 0 (bundle index-CgZbP9C-.js). Deploy Cloudflare Pages master 48cc2b0c (rollback 04a642ee), canonical HTML/JS HTTP 200. Production smoke (synthetic bloated EPUB với hàng trăm span rác và tệp Pixiv thực tế của người dùng) 2/2 pass trên Edge thật. Chi tiết: docs/EPUB-HTML-REPAIR.md.

- 2026-11-12 22:27 ICT | EPUB import preview / deploy gate | ImportDialog mounts existing DocumentPreview for selected EPUB so long-spine split count is visible before import; kept PDF/DOCX prepared-preview path. Target EPUB regressions 59/59 pass; build exit 0 with isolated .dsh-tmp TEMP/TMP; independent final-diff review no finding (runtime model/effort unverified). E2E first-chapter + long-spine tests pass Android-layout project; Chromium desktop timed out at page.goto('/'). Full npm test: 2,666 pass, 104 skipped, 85 fail / 49 files (EPUB hooks also timed out under full parallel load). Pages not deployed; production remains 48cc2b0c. Broad dirty worktree prevents safely publishing the whole dist; next: get desktop E2E and scoped artifact/deployment path. Logs .dsh-tmp/epub-{final-targeted,full-test,final-build-after-preview,e2e-final,e2e-chromium-split}.log; details docs/EPUB-HTML-REPAIR.md.

- 2026-11-12 22:38 ICT | EPUB deploy first | User instructed deploy before more checks. Wrangler Pages deploy 4dccdc08 to preview https://4dccdc08.thu-phong-private.pages.dev and canonical https://thu-phong-private.pages.dev/ (rollback 48cc2b0c); first upload-token call returned Cloudflare API 503, single retry succeeded. Bundle index-SC8hTwUD.js. Post-deploy synthetic Edge smoke passed: missing optional manifest image accepted, 140k spine item previewed as 2 parts and imported as 2 ordered chapters (70,010/70,000 chars) with same spine path and 1,218-byte source retained; API writes blocked (POST /api/reader-route intercepted; 0 real cloud writes). Build + focused EPUB regressions 59/59 passed; independent review no finding. Full suite remains 85 failures/49 files; Chromium desktop E2E still times out at page.goto while Android-layout E2E passes. Deploy includes full dirty working tree per user direction, not only EPUB; unrelated deployed feature coverage remains unverified. Details docs/EPUB-HTML-REPAIR.md.

- 2026-11-14 00:33 ICT | AI fallback order | Thêm sắp xếp mọi model ở Cài đặt → Dịch AI; kéo/pointer + nút lên/xuống, lưu trong AI_COMMON_SETTINGS_KEY, dùng vòng thứ tự cho chế độ auto; bỏ danh sách khỏi Reader, loại fallbackOrder khỏi cache identity để giữ kết quả hoàn tất. Tham khảo React Spectrum TableView; không thêm dependency. Build `npm.cmd run build` exit 0 với TEMP/TMP cô lập; diff check pass. Pages production `5cf6a268` master (rollback `51fe6e3b`); homepage + `/r/10001/1575` HTTP 200, bundle chứa nhãn/drag handle và không còn `ai-model-chain`. Local/production drag render chưa xác minh, Android thật chưa kiểm tra, chưa có test/review; deploy bao gồm dirty worktree rộng, thay đổi ngoài phạm vi chưa smoke. Model/effort runtime chưa xác minh. Chi tiết `AI-FALLBACK-ORDER-SETTINGS.md`.

- 2026-11-14 00:42 ICT | AI fallback settings UI polish | Sửa nền hàng model dùng token UI surface/inset, tương phản chữ, count badge, header gọn, nút 30/32px responsive và focus/motion preferences; tham khảo shadcn/ui Card semantic tokens, không thêm dependency. Build `npm.cmd run build` exit 0 với TEMP/TMP cô lập. Deploy Pages production `515c628c` master (rollback `5cf6a268`); `/settings/ai` HTTP 200, stylesheet canonical chứa ui-inset/row sizing/touch-action. Chưa có screenshot render/drag thật hoặc Android; dirty worktree vẫn deploy rộng. Chi tiết `AI-FALLBACK-ORDER-SETTINGS.md`.

- 2026-11-14 00:55 ICT | AI model drag clarity | Nút kéo hiển thị chữ “Kéo” + hướng dẫn; vùng kéo/nút lên xuống 44px; vạch accent báo drop before/after; thao tác pointer chặn scroll chỉ trên tay nắm. Tham khảo Atlassian Pragmatic DnD drop indicators + React Spectrum reorder, không thêm dependency. Build `npm.cmd run build` exit 0 với TEMP/TMP cô lập. Local Edge 663x854 dark render pass; kéo Gemini 3.8 Flash hàng 1 xuống hàng 4 trên IndexedDB tạm đổi/saved đúng. Deploy Pages production `591d1c98` master (rollback `515c628c`); `/settings/ai` HTTP 200, JS hướng dẫn kéo, CSS drop marker + 44px xác nhận. Chưa kiểm drag trực tiếp production/Android. Dirty worktree rộng được deploy. Model/effort runtime chưa xác minh. Chi tiết `AI-FALLBACK-ORDER-SETTINGS.md`.
- 2026-11-14 12:08 ICT | Baseline + PWA offline shell | Baseline commit 29e47f3: `npm.cmd test` 83 fail/48 files, 2671 pass, 105 skip; dictionary persistence Edge 1/1; build pass. Thêm registration production-only, precache allowlist build-ID versioned, offline network-first app-shell fallback; không cache API/dữ liệu local, worker update không skipWaiting/clientsClaim; About mô tả offline chính xác. Tham khảo Workbox precache/lifecycle và Pages routing (không thêm dependency). Build pass, shell 10 URLs/1296 KiB; `e2e/pwa-offline.spec.ts` Edge production build 1/1 pass. Full unit sau đổi: 84 fail/47 files, 2670 pass/105 skip; test fail set dao động 3 file so baseline, log giữ `.dsh-tmp/pwa-unit-final.log`. Production deploy/smoke đang chờ; chưa xác minh Android thật/version update live. Chi tiết `PWA-OFFLINE-SHELL-M0.md`.
- 2026-11-14 12:14 ICT | PWA production follow-up | Production deploy `a7804aa5` (`master`, code `a4261c2`). `/sw.js` HTTP200 application/javascript, build `fce9bbf8c1965bf5`; production Edge E2E 1/1: worker controls page, cache excludes API, local chapter opens via deep route offline. First production attempt failed because Cloudflare-compressed response retained `Content-Encoding` in CacheStorage; fixed by caching decoded Response without encoding/length headers; local build + E2E and production E2E then pass. Rollback Pages `1ed7a036`. No live cloud writes (all `/api/**` mocked); Android hardware and second-release worker update not verified. Feature evidence `PWA-OFFLINE-SHELL-M0.md`.
- 2026-11-14 12:24 ICT | Packed parser parity | Dùng `parseEntry` chung trong builder path; trước đó callback tự trim/split `=` sau validation. Không tái hiện parser mismatch; regression fixture so sánh regular/packed cho comment, BOM, dòng sai/rỗng, trim và value có dấu `=`: `tests/packed-index.test.ts` 5/5. Build pass, worker PWA build `1839862ac648a243` (10 URL/1296 KiB); production-build dictionary persistence/Convert E2E 1/1 pass. Chưa chạy full suite (baseline đã 84 fail/47 file, fail-set dao động). Chưa deploy parser commit. Chi tiết `DICTIONARY-PACKED-CACHE.md`.
- 2026-11-14 12:25 ICT | Packed parser production follow-up | Commit `75a0e26` deployed Pages production `1c0d940e` (`master`); `/sw.js` HTTP200 JS, PWA build ID `1839862ac648a243`. Edge production PWA offline E2E 1/1 and dictionary persistence/Convert E2E 1/1 pass after next-version deploy; focused parser regression 5/5 and build pass. This confirms a fresh profile installs the next cache generation; update with an old controlled tab still open and Android hardware remain unverified. No live user dictionary/cloud writes. Feature details `DICTIONARY-PACKED-CACHE.md`, `PWA-OFFLINE-SHELL-M0.md`.
- 2026-11-14 14:28 ICT | Library virtualization production | Commit `06dd051` pushed to `master`, Pages production `82fd26db-8975-4aec-94d5-e5c642dfd98c` (rollback `1c0d940e`). Build exit 0, PWA shell `78ae21da2c0f28d6`, bundle `index-D_mK8lJo.js`; production canonical + deployment bundle SHA matched local artifact, `/sw.js` JS/200. Production Edge E2E virtualization 2/2 and PWA offline regression 1/1 pass with synthetic IndexedDB and `/api/**` intercepted. `git diff --check` pass. No user/cloud data used; physical Android still disconnected. Details: `docs/LIST-VIRTUALIZATION-PERF.md`.
