# Quyết định kỹ thuật

## Nhật ký người thực hiện

- **04/10/2026 — GitHub Copilot (AI coding agent):** sửa `src/importer.ts`, `e2e/reader.spec.ts`, `server/auth.ts`; cập nhật `HANDOFF.md` và tài liệu này. Các thay đổi tương ứng là dedupe SHA-256, ổn định E2E theme, sửa import type D1 và ghi lại tiến trình.
- **04/10/2026 — GitHub Copilot (AI coding agent):** bổ sung quy tắc bắt buộc để mọi phiên sau ghi danh tính, thời gian, file/khu vực, lý do, kiểm thử, giới hạn và bước tiếp theo; mẫu chi tiết nằm cuối `HANDOFF.md`, quy tắc gốc nằm trong `AGENTS.md`.
- **04/10/2026 — Antigravity (Gemini 3.8 Flash):** triển khai Portable/Compact backup, kiểm tra conflict trước restore, bổ sung store `restoreJobs` qua Dexie version 3 migration, hỗ trợ khôi phục source files và dictionaries, rollback an toàn khi restore lỗi.
- **04/10/2026 — GitHub Copilot (AI coding agent):** bổ sung quy tắc phối hợp nhiều AI/model: nhiệm vụ phải nhỏ và có tiêu chí nghiệm thu; thay đổi rủi ro cao phải review độc lập; không chấp nhận tuyên bố nếu thiếu test/build/diff; AI chưa chắc phải ghi `chưa xác minh`.
- **04/10/2026 — GitHub Copilot (AI coding agent):** giản lược MVP theo yêu cầu người dùng: một file TXT là một truyện, splitter tạo chương/mục lục, TTS UI chỉ còn các giọng TikTok tiếng Việt qua adapter cấu hình. Không sao chép userscript hoặc coi proxy nội bộ Sangtacviet là API công khai.

## 04/10/2026 — Import giữ trạng thái staging đến khi xác nhận

Import worker có thể tạo chapter theo batch để hiển thị preview. Book không chuyển `ready` ngay khi worker kết thúc; `ImportDialog` chỉ commit bằng nút xác nhận sau khi người dùng xem trước, đổi tiêu đề hoặc gộp phần. Hủy preview sẽ xóa bản staging. Đây là chủ ý UX/data-safety, không phải import hoàn tất bị quên đổi trạng thái.

## 04/10/2026 — Dedupe bằng SHA-256 trong phạm vi toàn DB và batch hiện tại

Trước khi ghi `SourceFile`, importer dựng `knownHashes` từ IndexedDB và cập nhật set sau mỗi source mới. Vì vậy file trùng với source cũ hoặc trùng file trước đó trong cùng lượt chọn đều bị bỏ qua. Source hash chưa dùng unique index vì migration hiện tại chưa có migration schema riêng; cần xem xét khi thiết kế importJobs/chunk storage.

## 04/10/2026 — Kiểu D1 nhập tường minh

Phiên bản đang cài của `@cloudflare/workers-types` không cung cấp `D1Database` như global trong cấu hình server hiện tại. `server/auth.ts` dùng `import type {D1Database}` để build ổn định; không thay đổi runtime auth.

## 04/10/2026 — E2E chờ control trước thao tác

Panel Reader render bất đồng bộ khi mở. Test phải chờ combobox `Nền` visible trước `selectOption`; đây là đồng bộ hóa UI, không tăng timeout để che race.

## 04/10/2026 — Import job checkpoint và commit atomic

**Người thực hiện:** GitHub Copilot (AI coding agent).

Thêm store `importJobs` qua Dexie migration version 2. Import ghi phase `processing`, checkpoint sau mỗi file và phase `preview` trước khi hiển thị nút xác nhận. `commitImport()` cập nhật `books.status` và `importJobs.phase` trong cùng transaction; hủy/xóa staging dọn cả job. Đây là checkpoint theo file, chưa phải resume byte-level sau crash.

Quota được kiểm tra qua `navigator.storage.estimate()` với ngưỡng an toàn 90% khi estimate có sẵn. Dedupe dùng helper thuần theo SHA-256 để có thể kiểm thử độc lập. Mã nguồn tham khảo dưới `D:\linh tinh\tm` vẫn là nguồn chỉ đọc; phiên này không sao chép hoặc chạy mã nguồn đó.

## 04/10/2026 — Backup Portable vs Compact, kiểm tra xung đột và restoreJobs

**Người thực hiện:** Antigravity (Gemini 3.8 Flash).

1. **Schema Packet Version 2 & Manifest:**
   - Mở rộng Packet lên phiên bản 2, gắn kèm trường `mode` (`compact` | `portable`) và `manifest` (chứa schemaVersion, appVersion, book metadata, dictionaryRequirements, danh sách file nguồn và cờ chỉ báo dữ liệu đính kèm). Vẫn tương thích ngược với packet phiên bản 1.
2. **Chế độ Portable:**
   - Chế độ Compact chỉ xuất metadata, chương, Name List, tiến độ đọc và yêu cầu từ điển (không đính kèm blob lớn).
   - Chế độ Portable đóng gói toàn văn file TXT nguồn (`db.sources`) và các bộ từ điển đang kích hoạt (`db.dictionaries`) dưới dạng base64; cho phép khôi phục trọn vẹn trên thiết bị trắng mà không cần nạp lại từ điển thủ công hay đứt gãy liên kết `sourceId`.
3. **Kiểm tra xung đột & Lựa chọn khôi phục:**
   - `restoreInfo()` quét trước: phát hiện truyện trùng lặp theo tên hoặc trùng SHA-256 nguồn; phân loại từ điển thành `availableDictionaries` (đã có), `providedDictionaries` (có trong gói) và `missingDictionaries` (cần nạp thêm).
   - Giao diện `BackupPanel.tsx` hiển thị cảnh báo và cho phép người dùng chọn:
     - Tạo bản sao mới (`rename` / `keep-both`) với hậu tố `(khôi phục)`.
     - Ghi đè truyện hiện có (`replace`) xóa bản cũ và cập nhật bản mới nguyên vẹn.
     - Tùy chọn tự động cài đặt các bộ từ điển đi kèm trong gói portable.
4. **Theo dõi tác vụ với `restoreJobs`:**
   - Bổ sung store `restoreJobs` qua Dexie version 3 migration (`jobId,backupId,bookId,status,updatedAt`).
   - Tác vụ khôi phục đi qua pha `staging` và commit thành `committed`.
   - Nếu gặp lỗi (ví dụ file chương hỏng hoặc không khớp manifest), rollback xóa bản sách staging và cập nhật `restoreJobs` thành `failed` kèm thông điệp lỗi để phục vụ chẩn đoán / kiểm toán mà không bị mất dấu vết.

## 04/10/2026 — Audit độc lập không chấp nhận backup/restore là hoàn toàn data-safe

**Người thực hiện:** GitHub Copilot; review độc lập bởi Explore agent.

Kết quả kiểm tra độc lập: diagnostics không lỗi, 30/30 unit tests, build và 6/6 E2E pass. Tuy nhiên chưa chấp nhận backup/restore hoàn toàn an toàn vì còn các điểm chưa xác minh: dictionary portable có thể thoát rollback, source Base64 chưa được đối chiếu SHA-256/byte length, manifest chưa được dùng như nguồn xác thực bắt buộc, restore chưa có lock/cancellation, và portable payload có nguy cơ dùng nhiều RAM. Các điểm này phải có test/review riêng trước khi đánh dấu data-safe hoặc phát hành R1.

## 04/10/2026 — MVP tối giản: một TXT một truyện và TikTok TTS qua adapter

**Người thực hiện:** GitHub Copilot (AI coding agent).

- Import UI và `importFiles()` chỉ nhận một file TXT mỗi lần; splitter vẫn chia các heading bên trong thành chapter để Reader hiển thị mục lục.
- Reader chỉ hiển thị ba giọng TikTok tiếng Việt được tham khảo từ `D:\linh tinh\tm\truyen\SangTacViet_Nghe_Sach_Plus.user.js`: `tiktok:1`, `tiktok:2`, `tiktok:3`.
- `TikTokPlayer` gọi gateway qua `VITE_TIKTOK_TTS_BASE_URL`, mặc định same-origin `/io/s1213/tiktoktts`, tải audio Blob và có generation/cancellation guard. Đây là adapter, không phải bằng chứng endpoint Sangtacviet được phép dùng cho website mới.
- Trang `https://103.82.20.93/` không trích xuất được nội dung trong phiên; endpoint/voice IDs chỉ được ghi là tham khảo mã cục bộ read-only. Audio thật vẫn `chưa xác minh` cho đến khi có gateway được phép, CORS/HTTPS và test phát thành công.

## 04/10/2026 — Tham khảo luồng Sangtacviet, không sao chép hệ thống

**Người thực hiện:** GitHub Copilot (AI coding agent).

Trang IP `https://14.225.254.182/` được dùng để quan sát snapshot công khai sau khi domain chính và `.vip` không kết nối được. Các pattern được ghi nhận là: tìm kiếm ở trang chủ; danh sách truyện gần đây/phổ biến; trang chi tiết có metadata, tóm tắt và thao tác; mục lục có số chương, nguồn, danh sách chương, cập nhật/mở rộng. Dự án chỉ áp dụng pattern chức năng ở mức local-first: một file TXT là một truyện, heading là chương, Reader có mục lục, Library thêm/xóa.

Không sao chép HTML/CSS/JS, nội dung truyện, tài khoản, bình luận, like/follow hoặc endpoint riêng của Sangtacviet. Trang tham khảo có cảnh báo mixed content/analytics trong browser snapshot; đó không phải phần được đưa vào MVP.

## 04/10/2026 — Mapping nút quản lý chương Sangtacviet sang đặc tả local

Quan sát `/uploader/list-chapter/36884` cho thấy thao tác chapter gồm thêm, bật/tắt mã hóa, xuất bản, xóa hàng loạt, lưu danh sách; mỗi dòng có chọn, mở, mã hóa, xem, sửa, xóa và metadata số/số phụ/tên/độ dài/lượt đọc/ngày đăng. Bản local chỉ nhận phần quản lý dữ liệu người dùng: thêm/sửa/xóa/sắp xếp chapter, mục lục và commit IndexedDB; bỏ publish, mã hóa server và số liệu công khai. Mọi thao tác xóa/sửa tương lai phải transaction và test rollback.

## 04/10/2026 — Mapping Reader và style controls

Quan sát trang chương công khai cho thấy Reader có điều hướng trước/mục lục/sau ở hai đầu, breadcrumb, xem nguồn, ngôn ngữ/dịch thuật và bảng tùy chỉnh nền, màu chữ, bóng chữ, cỡ chữ, giãn dòng, font, căn lề, padding. App local sẽ triển khai hành vi tương đương bằng React/CSS và local settings; không sao chép inline script, analytics, bình luận hay dịch vụ ngoài.

## 04/10/2026 — Mapping TTS/Name panel và giới hạn tích hợp

Snapshot Reader cho thấy `Nghe sách` mở sentence queue có chạy/lưu/xóa/tải Name/upload/ẩn và `Name` mở công cụ chỉnh tên. App local chỉ nên lấy ý tưởng queue câu và import/export Name List; không gọi CORS endpoint `comic.sangtacvietcdn.xyz/tmm.php`, không upload nội dung hoặc sao chép userscript. Console của trang tham khảo ghi nhận CORS/mixed-content/analytics failures; các lỗi đó chưa được coi là lỗi của app local.

## 04/10/2026 — Đặc tả tham khảo tính năng Đăng truyện và quản lý chương

**Người thực hiện:** GitHub Copilot (AI coding agent).

Quan sát read-only trên `https://14.225.254.182/uploader/list/`, `/uploader/add-book/` và `/uploader/list-chapter/36884` cho thấy mô hình quản trị gồm: danh sách book → tạo book với metadata → quản lý chapter theo bảng → thao tác thêm/sửa/xóa/xem và chọn nhiều dòng. Bản local sẽ giữ phần hữu ích cho người dùng cá nhân: title/author/type/genre/cover/summary tùy chọn, một TXT là một book, heading là chapter, preview trước commit, mục lục, thêm/sửa/xóa chapter và xóa book có xác nhận.

Không đưa `Xuất bản`, lượt đọc công khai, mã hóa server, comment, like/follow hoặc IP/account policy vào MVP local. Đây là đặc tả chức năng lấy cảm hứng từ quan sát giao diện, không sao chép mã hay nội dung bên thứ ba.


## 05/10/2026 08:48 ICT — Codex: phục dựng thao tác STV và nghiệm thu có bằng chứng

**Người thực hiện:** Codex (OpenAI), root. Review độc lập theo AGENTS bởi audit_backup/audit_auth_release/audit_import_reader; chi tiết và giới hạn review ở HANDOFF.

- UI lấy pattern từ HTML/JS tải sẵn ở D: (chỉ đọc): nav hai đầu, ⚙ mở/ẩn config, bảng Name, Nghe và Chỉ đọc. Triển khai React/CSS riêng trong ReaderTools.tsx/stv-layout.css, không sao chép code/font/ảnh/truyện/upstream proxy. Live chương .vip không kết nối nên không tuyên bố pixel-perfect toàn bộ trang.
- Giữ các fields/voiceOptions TTS baseline đã xuất hiện từ lượt AI khác. Provider chưa tích hợp disabled; TikTok cần gateway được phép. Disclosure/đồng ý gửi text trước phát; Content-Type audio bắt buộc. Pitch/flex là khả năng gateway, không quảng cáo có hiệu lực khi chưa test.
- Name textarea dùng merge/upsert, không xóa các key bỏ khỏi draft. saveBookNames transaction books+names kiểm tra book ready, giữ ID, giữ scope từng book, rollback nếu lỗi. Ẩn giữ draft; dirty revision tránh mất phần sửa mới đến trong lúc save, khóa controls khi busy. 5 unit tests bảo toàn dữ liệu đã qua.
- Kết quả Convert phải gắn chapter/revision/Names/tempNames; auto-next đợi đúng chapter và conversion. Explicit Stop hủy cả pending continuation; uncheck autoNext cũng hủy. Resume phải kiểm tra generation/audio identity. 3 unit player + 2 scenario E2E race với mocks đã qua; không suy ra audio thật.
- Settings mở rộng additive; giữ font cũ và merge defaults, không migration DB. Không sửa backup runtime trong đợt UI. 7 ca audit synthetic tái hiện các lỗi A1–A7; M6 chưa an toàn dữ liệu, R0/R1 chưa hoàn thành.
- Bộ nghiệm thu cuối: 40/40 unit, 20/20 E2E (Edge desktop + Android viewport), build pass; 7/7 audit repro pass nghĩa là lỗi vẫn còn. Hướng dẫn/mapping/checklist mới là hồ sơ tiếp tục, không bằng chứng deploy.

Tài liệu hiện hành: AUDIT-2026-10-05.md, USER-GUIDE.md, STV-UI-MAPPING.md, BACKUP-GUIDE.md, RELEASE-CHECKLIST.md. Giữ lịch sử cũ; kế hoạch được chỉnh để thống nhất một TXT/TikTok và gắn trạng thái chưa nghiệm thu. Next: A2 → A3 → A1/A4/A6 → A5 → Unicode/cancel → gateway/auth/Android thật; mỗi thay đổi dữ liệu cần regression test và review độc lập.

## 05/10/2026 09:22 ICT — A2 missing source và C1 Name matching

Codex root điều phối; gpt-6-luna/low khảo sát, gpt-6.1-sol/medium triển khai, gpt-6-astra/high review độc lập A2. Root không đổi model chính; chi phí thực chưa đo. Giữ source metadata thiếu bytes với optional missing marker, không migrate index. Legacy placeholder loại khỏi dedupe; bytes thật cũ được chuyển trong chính transaction thay thế, kể cả unmatched và metadata inconsistent nonempty. Atomic guards chặn staging/target biến mất; rollback giữ original. Legacy Portable empty string phải tính là thiếu; đây là blocker reviewer phát hiện đã được sửa/test. Portable export inconsistent metadata không bảo đảm bytes, đưa A4 xử lý tiếp.

C1 dựa quan sát mã Vietphrase m_translation.js93–124 ở D: chỉ đọc: longest name tại offset, tie book > Names2 > Names, VP fallback. Không sao chép implementation hay dictionary; không tạo merged dictionary mỗi convert. Không tuyên bố tương đương placeholder toàn văn bản upstream hoặc tất cả Convert/STV. Root61/61unit, buildpass; A2reviewtargeted30/30; audit1fixed+6knownrepros. FullE2E19/20 và deterministic late-settings regression đang xử lý riêng C2, chưa nghiệm thu. Xem HANDOFF và MODEL-WORKFLOW cho phạm vi/quyền/test mỗi lượt.

## 05/10/2026 09:28 ICT — C2 ReaderSettings hydration/persistence

Triển khai gpt-6.1-sol/medium, review độc lập gpt-6-astra/high; root đối chiếu diff/chạy lại. Late read không được ghi đè thao tác mới. Replay các updater action lên saved/defaults thay vì diff giá trị, vì explicit clear có thể bằng defaults trước load nhưng phải xóa custom background đã lưu. Không persist trước load thành công; lỗi read fail-closed, lỗi write thông báo. Queue module chung cả reads/writes tránh old Reader queued write chạy sau new Reader save; không nhận bản queue từng instance do review phát hiện race. Không schema migration hoặc network.

5 E2E scenarios mới dùng delayed/rejected IO, chạy trên hai Edge projects. Root cuối61/61unit +30/30E2E +build pass. Reviewer C2 đọc source/test, không tự chạy browser; A2 có independent30/30run trước. Cross-tab, abrupt reload trước commit và early edits rời trước hydrate chưa bảo đảm. Deterministic baseline overwrite đã fail; nguyên nhân original intermittent19/20failure vẫn chưa chứng minh đồng nhất. NextA3 atomicdict, sau đó mapping/controlsConvert; xem HANDOFF cho file/quyền/invariant/test.

## 05/10/2026 14:00 ICT — R0, tài liệu hiện hành, A3 và baseline
Người dùng chốt R0 đọc/Convert trước, chưa bắt buộc TTS. M5 tùy chọn sau R0;
không tự bật Web Speech. M0 spikes là ưu tiên trước feature mới. Hợp đồng chunks/layout
trong plan là mục tiêu lệch mã, không là chỉ thị migration tự động.

HANDOFF chỉ giữ trạng thái hiện hành; bản nguyên trước chuyển HANDOFF-LOG append-only.
PRIVATE-WEB-PLAN archive với quyết định bị thay. STATUS tách đạt/một phần/lệch/chưa làm.
AGENTS yêu cầu reviewer chạy targeted và lặp flaky; model rủi ro cao dùng mạnh nhất khả dụng,
không quy nhân quả lỗi cho Flash hoặc coi medium giữa vendor là tương đương.

A3: stage dictionary candidates trong RAM, commit atomic cùng book/source/job; recheck absence
dưới lock, giữ local/concurrent dictionary.14 tests mới; reviewer38/38, root75unit/build/nativeE2E qua.
Alias DaiTuNhanXung exactstem vào names2, không import dữ liệu thật.
Audit5known defects dùng it.fails trên invariant đúng; unexpected pass bắt buộc review/bỏ marker.
Baseline local/CI YAML không đồng nghĩa release, remoteCI chưa chạy. TTS GET/query/route cũ
đã xác minh là việc còn mở trước gateway thật; không tuyên bố đã sửa.

