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


