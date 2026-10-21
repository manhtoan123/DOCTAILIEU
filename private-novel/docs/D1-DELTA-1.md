# Giảm đọc D1 — M0, 19/10/2026

Phạm vi đợt này: đồng bộ chỉnh sửa và catalog, đo query plan/request trên dữ liệu tổng hợp, regression + review độc lập rồi deploy. Không thêm provider/paid tier, không sửa truyện cũ, backup/offline/Android thật là đợt riêng nếu người dùng chọn tiếp.

Thiết kế: giữ bảng latest-state, global revision, giao thức delta từng scope và CAS hiện có. Thêm head một hàng và discovery metadata (scope,revision), tối đa100 hàng/trang, khoảng (after,until] cố định ở head trước lúc pull. Index phủ(revision,scope); partial index(scope) cho kind=book/deleted=0 tối ưu JOIN catalog hiện có. Migration chỉ tạo index, không sửa record.

Client replica v1 thêm changeCursor tùy chọn. Lần đầu pull các scope ready như cũ và lưu head chụp trước pull. Lần sau discovery từ changeCursor, chỉ pull scope liên quan và scope chưa có cursor. Chỉ commit changeCursor sau khi toàn bộ discovery/pull/apply hoàn tất; lỗi không nhảy mốc. Bản ghi dịch lên revision mới sau until được nhận ở lượt kế. Scope chưa nhập không nhận payload; scope mới nhập không có cursor luôn tải lịch sử riêng, kể cả head không đổi. Không tự sửa vòng đời remove/reimport cùng ID đã có cursor cũ.

Tương thích: client mới fallback giao thức cũ khi server không quảng bá changesV1; advertised malformed response fail-closed. Server mới vẫn phục vụ GET/PUT cũ. Giữ bytes/SHA/blob-before-manifest, atomic ACK, tombstone, cancellation, conflict, cloud-delete trước local. Không lấy head sau pull để làm checkpoint. Index chưa có chỉ ảnh hưởng tốc độ, không làm bỏ dữ liệu.

Nghiệm thu: head không đổi không GET từng sách; một scope đổi không pull các scope khác; mới nhập/pagination/race/page failure/legacy đều không bỏ sót. SQLite query plan dùng covering/partial index; đo request số lượng, không đồng nhất với production rows_read. Root full unit/build/E2E liên quan tuần tự; reviewer độc lập đọc diff và chạy regression. Deploy dùng tài khoản/project/DB hiện hành; smoke browser chỉ dữ liệu tổng hợp, không ghi truyện cloud thật. D1 hết quota phải báo giới hạn kiểm tra runtime, không tăng gói để né.

## Kết quả22:05VN 19/10
Review độc lập READY100; full148file/1892pass; build; E2E24 unique đạt (22+2 ca locator cũ sửa theo UI hiện hành); prod869/393 với2profile144truyện/mockAPI đạt. Pages67441026/master index-CE8e3kpr.js. Index13 đã áp dụng bằng import; ledger13 chờ normal migrations apply khi quota reset. Real head200, catalog503cloud_read_limit, discovery503quota; chưa đo production rows_read hoặc Android thật. Chi tiết/log: ../.dsh-tmp/d1-delta/RESULT.md.
