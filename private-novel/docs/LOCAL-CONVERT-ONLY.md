# Convert và tra Name hoàn toàn cục bộ — 02/11/2026

**Trạng thái checkout 08/11/2026.** Khi cấu hình máy chủ OCI, từng trình duyệt chọn đích Convert rõ ràng. Local vẫn là mặc định khi app chưa cấu hình máy chủ và trình duyệt chưa chọn đích. Reader Bản gốc dùng tiêu đề có sẵn và nội dung nguồn. Xem [triển khai OCI và giới hạn](OCI-CONVERT.md). Nội dung bên dưới ghi lần phát hành cục bộ ngày 02/11.

Theo yêu cầu người dùng, tất cả đường chạy Convert/tra từ của giao diện Reader dùng language-client và worker từ điển cục bộ. AiNameSource gọi convert trực tiếp, bỏ thử máy chủ trước rồi fallback. Reader.lookupSelection dùng lookup và convert cục bộ, bỏ remote cache/lookup và callback lựa chọn local/remote. Khung chọn từ lỗi có nút Thử lại local. Token offsets, Name theo truyện/Album/chung, kiểm snapshot và chống kết quả cũ vẫn do luồng hiện có quản lý.

Convert chính/tiêu đề vốn đã dùng local worker, không đổi. Nội dung nguồn, Name đã lưu, dictionary, cache, TTS và các cài đặt không bị migration hoặc xóa. AI dịch/trau chuốt vẫn là dịch vụ AI riêng, không phải Convert từ điển; thay đổi này không đổi nhà cung cấp, prompt hoặc chính sách AI.

Ứng dụng không import hoặc gọi name-server-client nữa; module và backend cũ vẫn giữ trong source để tra lịch sử/rollback, không nằm trong đường chạy mới. Không xóa Worker/D1/R2/binding trên tài khoản Cloudflare trong đợt này. Không còn phụ thuộc quota/phiên bản từ điển máy chủ cho thao tác Name.

Tham khảo [MDN Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) và [ví dụ MDN trên GitHub](https://github.com/mdn/dom-examples/tree/main/web-workers): dùng message protocol và tác vụ nền hiện có, không thêm dependency hoặc worker mới.

Kiểm tra:12/12 unit pass (language-client, convert-cache, ai-name-paragraph); build/typecheck pass, .dsh-tmp/local-convert-unit.log và local-convert-build.log. Browser Reader thật trên built-preview, dữ liệu trung tính, API AI giả lập: khung nguồn có token local, chọn token và tra nghĩa xong, convertRequests=0; original chapter không đổi, override reload giữ đúng. .dsh-tmp/local-convert-browser.log/result.json. API bị chặn, không dùng truyện thật. Chưa Android thật hoặc bộ từ điển riêng của người dùng. Không mở thêm review.

Phát hành ghi HANDOFF; không commit/push hoặc thay hạ tầng.

Đã deploy Pages3ebc3007/index-DSu-_v0U.js, AIWorker giữ9f48a8f1. GET reader+asset200; bundle không chứa /api/convert/name hoặc lỗi Convert máy chủ. Rollback Pages92514981.
