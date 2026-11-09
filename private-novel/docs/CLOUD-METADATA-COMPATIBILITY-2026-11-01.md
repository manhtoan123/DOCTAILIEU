# Thống nhất tên truyện khi đồng bộ — 01/11/2026

## Lỗi và phạm vi sửa

Snapshot/catalog/shared metadata/server PUT/DELETE trước đây nhận tên truyện 300 ký tự, trong khi backup đã nhận 1.000. Tên Convert có thể dài hơn chữ gốc. Lỗi `Chữ trong bản cloud không hợp lệ` còn dùng chung cho mọi trường, không chỉ rõ trường hoặc độ dài. Chưa đọc dữ liệu truyện thực tế nên chưa xác nhận trường nào gây đủ 23 lỗi người dùng báo.

Constant chung `BOOK_METADATA_MAX_CHARS=1000` dùng cho title/author/displayTitle, catalog, shared metadata, server title, đổi tên truyện và backup title. Header URI cho phép tối đa 9.000 ký tự mã hóa rồi vẫn kiểm 1.000 ký tự đã giải mã và ký tự điều khiển. DELETE reviewed metadata body cho phép 32 KiB, giữ nguyên SQL điều kiện ownership/snapshot, tombstone, ACK và khóa dữ liệu. Tác giả thiếu được chuẩn hóa thành chuỗi rỗng trong payload snapshot/shared metadata, không ghi đè local.

Thông báo snapshot nay ghi tên trường/chương/Name, loại dữ liệu hoặc độ dài và giới hạn; không chèn giá trị trường vào lỗi. Không cắt title/Convert/nội dung, chia lại chương, cập nhật truyện cũ hoặc bỏ SHA. Giữ các giới hạn chương 128.000, Name, snapshot/codec, ảnh, original, capacity và budget khác; đây không phải cam kết dữ liệu tùy kích thước đều đồng bộ được. Bundle cũ cần tải lại để nhận metadata dài mới.

## Database

Migration `0018_cloud_book_metadata.sql` nới CHECK title 300→1000, copy đúng tám cột sang bảng thay thế trước khi gắn trigger tính dung lượng. Giữ index và cả bảy trigger catalog/cross-table theo schema thực tế. Không sửa ledger, bytes, SHA, object key, tombstone hoặc các bảng originals/parts.

Preflight: 801 bản ghi; sum(bytes)=723789330; tổng length(title)=30764; tổng updated_at=1435763026067819; ledger=1596005745. Đã lưu Time Travel bookmark tại `.dsh-tmp/cloud-metadata-bookmark.json`. Migration remote exit0, 20 lệnh/10,96 ms. Postflight khớp toàn bộ aggregate trên, bảy trigger SQL giống trước migration, foreign_key_check không có lỗi, CHECK mới 1000. Số tổng chỉ ghi nhận thời điểm kiểm tra, không thay cho checksum từng object R2.

## Tham khảo và bằng chứng

[SQLite limits](https://www.sqlite.org/limits.html): giữ giới hạn rõ và bind dữ liệu; không mở vô hạn hoặc nhúng metadata vào SQL. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) và [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/): đối chiếu giới hạn vận chuyển và migration có phiên bản. Áp dụng trong giao thức hiện có, không thêm dependency/provider/gói trả phí.

Review độc lập đọc diff cuối đạt, gồm encoded title, schema CHECK, giữ guard và producer author. Build tsc client/server+Vite exit0; diff-check0. Không viết/chạy test theo yêu cầu; chỉ query metadata/schema/aggregate trước-sau migration, không đọc nội dung hoặc upload fixture/dữ liệu thật. Lượt preflight đầu bị API7403, SELECT1 và preflight tiếp theo thành công; không đổi credentials/quyền.

Logs: `.dsh-tmp/cloud-metadata-{preflight,postflight,bookmark}.json`, `cloud-metadata-build.log`, `cloud-metadata-migration-apply.log`. Đã deploy Pages1e282da1/index-eksZldDz.js (exit0); AIWorker giữ9f48a8f1. GET /,/phong-toi,asset200 đúngbundle, log cloud-metadata-pages-deploy.log và cloud-metadata-release.json. Cần người dùng thử lại đồng bộ để xác nhận trường hợp thực tế; lỗi còn lại sẽ chỉ rõ trường thay vì thông báo chung.
