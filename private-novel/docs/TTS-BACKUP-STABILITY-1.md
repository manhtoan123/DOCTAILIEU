# Ổn định TTS và kiểm khôi phục dữ liệu — 18/10/2026

Phạm vi: lỗi tiếp tục nghe khi metadata audio chưa sẵn; khả năng khôi phục một truyện, Name và bytes nguồn. Không đổi provider, không bật MSE, không thêm giao thức backup dung lượng lớn.

## Lỗi đã tái hiện và cách sửa

- TTS: seek tới mốc đã lưu có thể bị trình duyệt từ chối trước metadata. Giá trị `currentTime=0` của audio mới đã ghi đè mốc cũ khi checkpoint/pause/error. Giữ `pendingSeek` cho đến khi tua thành công; callback metadata có guard theo phiên và lượt phát.
- Backup: thiếu Name chung và `source.displayName`; bổ sung trường tùy chọn, tương thích gói cũ. Hợp nhất Name trong transaction cuối, ưu tiên giá trị và tombstone đang có trên máy đích.
- Bytes: gói được tính lại checksum vẫn có thể chứa file không khớp SHA/kích thước đã khai báo; xác minh bytes nguồn/từ điển trước khi thay truyện cũ.
- Thứ tự: đảo index phần có thể làm xáo chương; kiểm `chapter.order` liên tục trước khi nhập.
- Từ điển: báo đúng bản còn thiếu khi máy đích đang giữ từ điển cùng loại nhưng khác SHA.
- Dung lượng: không trả phần export vượt giới hạn nhập 16 MiB. Hỗ trợ Portable lớn vẫn chưa được triển khai; audit A1 giữ expected failure.

## Kiểm chứng

Baseline: 141 ca targeted đạt; một trong đó là lỗi Name chung được đánh dấu `it.fails`, chưa có nghĩa tính năng này đúng. Bổ sung regression backup tái hiện 8 lỗi và TTS tái hiện 1 lỗi trước sửa. Log giữ tại `../.dsh-tmp/tts-backup-stability/`.

Kết quả 18/10/2026:

- Full unit: **138 file / 1.817 ca đạt**, `full-unit-final.log`. Audit **7 ca đạt**, gồm A1 còn expected failure (`audit-final.log`). A4/A5/A6 và lỗi Name chung đã bỏ nhãn `fails` sau review độc lập.
- Review độc lập không còn finding chặn; ba probe bổ sung đạt: overflow Name rollback, chỉnh sửa đồng thời được giữ, gói cũ không có Name vẫn tương thích. Chi tiết `review.md` và `review-probes-final.log`.
- E2E bốn spec backup/TTS: lượt đầu 33/40 đạt; lỗi gồm chờ trang tải, khởi động Vite và trạng thái nghe chưa sẵn. Chạy lại nhóm lỗi trên Vite đã warm: 30 ca đạt, 6 lượt cùng ca khôi phục vướng locator trùng tên. Sửa locator thành nút truyện cụ thể, 6/6 lượt đạt. Như vậy mọi ca trong phạm vi 40 ca đã đạt; không quảng cáo lượt đầu sạch. Log `e2e.log`, `e2e-retry.log`, `e2e-backup-final.log`.
- Build đạt, `build-final.log`, bundle `index-BRH_BYiW.js`. Lượt unit/build đầu gặp Windows Temp AccessDenied; đã giữ log lỗi và chạy lại với TEMP/TMP riêng theo AGENTS. Không sửa dependency để né lỗi.
- Pages đã triển khai `b517d90a`, production branch `master`; AI Worker và schema giữ nguyên.
- Smoke online đạt **2/2 viewport (869 và 393 px)**: HTML khớp dist, native MP3 + carrier 10s local, pause/reload không autoplay, resume đúng offset, export qua UI và restore vào browser context sạch. Kiểm bytes, tên nguồn và Name List sau restore. API/cloud/AI/gateway đều mock, không ghi cloud thật. `production-smoke-final.log`, `production/report.json`, `production/restore-*.png`; ảnh mobile đã kiểm không tràn ngang. Lượt smoke đầu dùng label exact không khớp accessible name chứa options; đổi locator combobox có tiền tố đúng, không sửa runtime (`production-smoke.log` giữ lỗi).

## Giới hạn giữ rõ

- Gói backup chưa mang prompt, cài đặt, bản dịch AI, vị trí nghe hoặc đầy đủ asset ngoài. Xem [hướng dẫn backup](BACKUP-GUIDE.md).
- Kiểm tự động ở native IndexedDB/trình duyệt và viewport mobile không chứng minh Android khóa màn hình thật hoạt động mượt. Cần kiểm điện thoại Android, loa máy: nghe liên tục, khóa màn hình, ngắt/kết nối mạng, pause/resume, chuyển chương và mở lại trang.
- Chưa thay đổi logic dịch AI, dữ liệu thư viện thật, gateway hoặc schema database.
