# Đồng bộ kho lớn — phạm vi M0 19/10/2026

Vấn đề: reload gọi originals GET cho mọi truyện đã upload, hash lại toàn bộ file và ghi ACK lặp. 1.000 truyện có thể phát sinh 1.000 requests dù không có thay đổi.

Phạm vi: giữ cloud protocol, SHA/bytes, immutable original, tombstone và atomic ACK. Chỉ sửa client: nguồn có revision nội bộ thay ở mọi add/put trong cùng thao tác IndexedDB; receipt lưu revision sau xác minh SHA và remote ready. Index keys cho phép kiểm tra pending mà không đọc Blob. Truyện/file đã xác nhận không phát sinh GET originals/hash/upload. Snapshot ACK và tombstones được đọc theo lô. Không đổi dữ liệu truyện, thứ tự, progress hay nội dung nguồn.

DB v4 chỉ thêm index, không hash/modify toàn thư viện khi nâng cấp. Nguồn cũ được xác minh một lần rồi gắn revision tại transaction ACK. Nguồn thiếu Blob không upload. Revision không xuất ra backup/cloud; mọi ghi nguồn qua Dexie cấp lại revision, kể cả thay Blob cùng kích thước hoặc phục hồi bản cũ. Native IndexedDB writes ngoài ứng dụng không phải luồng chỉnh sửa được hỗ trợ.

Tự đồng bộ được gộp khi import liên tiếp; thay đổi trong lúc đang chạy tạo lượt tiếp theo. Online thử lại mục còn chờ. Trạng thái chỉ báo gửi dữ liệu/lỗi, không đếm lại mọi truyện. Catalog/tombstone vẫn phân trang hiện có; đây không phải tối ưu toàn bộ search/render/shared-state hay cam kết RAM Android/thư viện bất kỳ lớn.

Nghiệm thu: fixture 1.000 truyện có receipt — reload sync không GET originals, không đọc/hash Blob; sửa một nguồn chỉ kiểm nguồn đó; interrupted/failed không ACK, retry tiếp tục; migration giữ bytes/SHA/progress; context/delete/source-replacement/abort regression.

Kết quả: full unit 1.834/142 files PASS (`--maxWorkers=4`), build PASS; review độc lập GPT-6.1 Sol/high 6 regressions PASS, không blocker. E2E 38 ca duy nhất PASS qua run/retry và 12 lượt lặp scale/race PASS. Lượt kiểm tra 1.000 truyện 978–1.932ms trên Edge Windows (desktop/Android layout, API tổng hợp, 4 workers), 0 Blob reads và 0 originals requests khi đã có receipt; đây không phải đo thiết bị Android thật hay tốc độ mạng thật. Log `.dsh-tmp/sync-scale/`.

Lỗi môi trường giữ log: full đầu tiên browser startup/cancellation timeout do chạy nhiều workers; build đầu TEMP AccessDenied, retry dùng TEMP riêng theo AGENTS. E2E cold Vite scan timeout, dùng config thử nghiệm chỉ scan index.html/không watch artifact; hai test cũ cập nhật kỳ vọng trạng thái im lặng và bật Convert chủ động/route reload hiện hành, không đổi product cho test. Nguồn legacy thiếu Blob chưa có revision vẫn có thể đọc metadata local mỗi sync, không GET/hash/upload. Không tối ưu toàn bộ catalog/shared-state/search trong phạm vi này.

Production 19/10: d2f5691f/master, canonical index-Bkf6YJKQ.js. Fresh isolated browser fixtures 1.000 books: lazy verify một nguồn legacy rồi reload 0 originals requests/0 Blob reads, 869px và 393px không overflow/pageerror. Mọi /api/** trong browser smoke được mock; không ghi kho thật. Real GET catalog 200/66 books. `.dsh-tmp/sync-scale/production.json`, screenshots và deploy.log.
