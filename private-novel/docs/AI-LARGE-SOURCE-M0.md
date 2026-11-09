# Bỏ chặn đầu vào AI toàn chương 128k — M0, 02/11/2026

Yêu cầu: đầu vào AI/trau chuốt dài hơn128.000 ký tự vẫn đi vào planner chia request, không từ chối cả chương trước khi split. Phạm vi chỉ gate nguồn của AiReadingSession và guard Reader hiện tại/dịch sẵn, không thay giới hạn lưu/import/backup/chapter/source hoặc xử lý dữ liệu cũ.

Invariant: planner vẫn giới hạn mỗi request≤32.000 ký tự và ước lượng output; chia song song≤2key theo scheduler, deadline/send budget và Stop vẫn có hiệu lực. Không đổi STOP/acceptance/content policy/provider hoặc tự tăng quota. Chỉ bỏ gate đầu vào128k; cap hiển thị512k output và các giới hạn request/budget khác vẫn tồn tại. Không cam kết xử lý kích thước vô hạn hoặc thay bài toán bằng một request lớn.

Nghiệm thu: nguồn trung tính>128k trong session phải chia nhiều request hợp lệ, đủ source spans/thứ tự; Stop trong lúc request chờ phải hủy, không gửi tiếp. Browser kiểm nhận đầu vào lớn ở trau chuốt trên built-preview với AI giả lập, không dùng truyện thật. Không benchmark upstream hoặc Android thật.

Tham khảo [TanStack Query retryer](https://github.com/TanStack/query/blob/main/packages/query-core/src/retryer.ts): giữ admission/cancel/backoff bên dưới thay vì bỏ mọi ràng buộc khi gỡ một gate. Áp dụng planner/job/scheduler sẵn có, không thêm dependency/hạ tầng/schema/storage capacity.

## Kết quả

Đã bỏ gate128k tại AiReadingSession và cả ba guard Reader hiện tại/prewarm. Không đổi limiter request hoặc cơ chế AI phía server. Regression cũ yêu cầu từ chối128001 được cập nhật theo yêu cầu mới; log lần fail đầu giữ .dsh-tmp/ai-large-source-unit.log.

13/13 targeted unit cuối đạt: source trung tính144.000 ký tự được chia đủ đúng thứ tự, mỗi request≤32.000; source128001 Han cũng nhận, số request mỗi job trong budget; Stop hủy trước khi gửi phần tiếp. .dsh-tmp/ai-large-source-unit-final.log. Build/typecheck đạt, index-BvpmXCTP.js; .dsh-tmp/ai-large-source-build.log.

Browser Reader trên built-preview với fixture140020 ký tự và HTTP AI giả lập: có2request, prefix hoàn tất hiển thị/tail giữConvert, không modal chặn, Name mở được trong khi chạy, Stop/reload giữpartial. .dsh-tmp/ai-large-source-browser.log/json. Không dữ liệu người dùng hoặc gọi AI thật, chưa Android/audio thật, không benchmark toàn bộ nguồn cực lớn. Giới hạn output512k/request/budget vẫn giữ như nêu trên; không thay128k trong import/source persistence. Trạng thái deploy ghi HANDOFF.

Deploy Pages922ad039/index-BvpmXCTP.js, AIWorker giữ9f48a8f1. GET root+asset200, bundle không còn thông báo gate128k cũ. Rollback Pages6ae83660.
