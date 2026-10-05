# Bằng chứng kiểm chứng — 05/10/2026
Giờ Asia/Saigon. Root trực tiếp chạy lệnh trong private-novel/, không thay báo cáo agent bằng kết quả tự chạy.

| Lệnh | Kết quả mới | Phạm vi |
|---|---|---|
| npm.cmd test -- --reporter=dot | exit0, 75/75, 13:53:49 | 6 unit files, fake IndexedDB/Audio |
| npm.cmd run build | exit0, 51 modules | TypeScript app/server + Vite |
| npm.cmd test -- --config audit/vitest.config.ts --reporter=dot | exit0, 7 cases, 13:56:36 | A2/A3 regression + 5 expected failures A1/A4/A5/A6/A7 |
| npm.cmd run test:e2e -- e2e/backup-atomic.spec.ts e2e/dictionary-alias.spec.ts --reporter=line | exit0, 4/4, 27.2s | Native IndexedDB, desktop Edge và Pixel viewport |
| npm.cmd run test:e2e -- e2e/stv-ui.spec.ts --grep 'STV controls hide' --repeat-each=3 --workers=2 --reporter=line | exit0, 6/6, 22.2s | Lặp ca từng flaky; không chứng minh nguyên nhân lần fail cũ |
| Reviewer: npm.cmd test -- tests/backup.test.ts --reporter=dot | exit0, 38/38, 13:56:24 | gpt-6-astra/high độc lập, gồm 14 A3 cases |

Agent gpt-6.1-sol/medium chạm quota trước báo cáo cuối; root kiểm tra file thực đã có 14 tests,
chạy lại và nhận review độc lập. Không suy rằng quota làm mất hoặc hoàn tất thay đổi.
Lượt E2E đầu của root lỗi fixture restage cùng ID với checksum khác; đã sửa dọn packet tổng hợp trước round-trip.
Lượt alias đầu có locator navigation quá chặt; đã scope nav và sửa locator. Không tính chúng là app regression.

Audit it.fails kiểm invariant đúng; đúng hành vi sẽ unexpected-pass đỏ để buộc cập nhật marker sau review.
CI xanh vẫn có 5 known expected failures. A3 đã nghiệm thu phạm vi nhỏ, không data-safe toàn backup.

Chưa xác minh: Android hardware, native multi-tab/crash, VP43MB/RAM, KDF Pages runtime,
TTS thật, private deploy. Không chạy toàn bộ E2E lại trong lượt này; 30/30 của phiên09:26 là lịch sử.
CI YAML đã thêm; chưa push/chạy GitHub Actions nên không tuyên bố CI remote pass.
Scan baseline: xem danh sách staged; không thấy mẫu private-key/API-token đã tìm; không bảo đảm tuyệt đối mọi dạng secret.
.env/dev.vars, dependencies/build, dữ liệu thật và inventory kho ở ngoài baseline.

