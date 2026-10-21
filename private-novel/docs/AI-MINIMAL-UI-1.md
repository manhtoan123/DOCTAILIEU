# AI-MINIMAL-UI-1 — bảng đọc gọn và cài đặt bên ngoài

Yêu cầu 16/10/2026: bỏ trình soạn và thử prompt khỏi bảng đọc; cho chọn prompt đang dùng; chỉ giữ thông tin model chương này/chương sau, trình bày tối giản.

## Kết quả

- Bảng Dịch AI có hai dòng model thực tế: chương đang đọc và chương sau. Đọc model từ kết quả, kể cả fallback/hybrid/cache đã kiểm tra; không lấy model ưu tiên để giả làm model đã dịch. Mở bảng không gửi yêu cầu dịch.
- Hiển thị tên prompt theo nội dung đã lưu, kể cả khi model/nhiệt độ đã được chỉnh riêng. Nếu đang dùng bản cũ, giữ nội dung và ID đó; danh sách chỉ đưa bản mới nhất mỗi tên/phạm vi để người dùng chủ động chọn. Nội dung tùy chỉnh không bị tự gán tên mơ hồ.
- Giữ chọn prompt, bật/tắt dịch sẵn, Name riêng thu gọn, dừng/thử lại và chi tiết lỗi khi cần. Bỏ thanh tiến độ, mô tả lặp, trình soạn prompt, thử mẫu và quản lý keys khỏi bảng đọc.
- Cài đặt → Dịch AI: `/settings/ai` cho chung; `/settings/ai/<bookId>` cho riêng truyện. Có bộ chọn truyện; giữ User/System/Prompt nửa sau, biến, hybrid, model, nhiệt độ, kiểm tra hợp lệ, thử mẫu và keys. API keys chỉ đọc khi mở mục đó, vẫn dùng endpoint và dạng che cũ.
- Nút Cài đặt dịch AI trong bảng mở đúng truyện. Rời trang đọc dừng phiên như thao tác điều hướng thông thường; phần đã hoàn tất/checkpoint đã lưu vẫn phục hồi khi quay lại. Không còn nút lưu bản nháp ngay trong Reader.
- Bảng theo nền/chữ của trang đọc, bo góc, hai hàng model, công tắc, chân bảng cố định; phần nội dung cuộn được khi màn hình thấp. Escape đóng bảng và trả focus về nút AI.

## Phạm vi bảo toàn

Không đổi thuật toán dịch, giới hạn thời gian, thứ tự model/keys, cache schema, dữ liệu nguồn hay đồng bộ. Chọn prompt và lưu cấu hình dùng hàng đợi hiện hành. Truyện chưa có trên thiết bị không cho ghi cấu hình qua trang cài đặt riêng. Không sửa dữ liệu truyện thật để nghiệm thu.

## Kiểm chứng

Unit/routing/prompt/cache và E2E có dữ liệu tổng hợp, API giả lập; xem `.dsh-tmp/ai-minimal-*.log`. Các bài cũ được chuyển trình soạn sang route mới; kỳ vọng timeout, thứ tự dự phòng và bookmark được đối chiếu với cơ chế đã triển khai trước thay đổi UI.

Script nghiệm thu production: `scripts/smoke-ai-minimal-production.mjs`; chặn toàn bộ API cloud trong ngữ cảnh trình duyệt cô lập, kiểm tra chọn prompt/lưu lại/model trả về/nguồn không đổi, desktop và mobile. Đây là kiểm chứng UI và luồng với AI giả lập, không đo chất lượng/tốc độ provider hoặc Android thật.

Nghiệm thu 16/10/2026: 80 unit PASS; 86 ca E2E riêng biệt PASS ở hai project; build PASS. Pages47033c96/master, `index-Bo1-EjEG.js`. Canonical production/mockAI PASS, kết quả tại `.dsh-tmp/ai-minimal-production/report.json`, ảnh desktop/mobile cùng thư mục. Worker và bindings/schema không đổi.
