# Cấu hình AI thực dùng và thử prompt — 25/10/2026

Phạm vi được yêu cầu: mục 1 hiển thị cấu hình thực dùng, mục 5 thử A/B trong cài đặt prompt. Mục 3 tách văn phong/hiệu năng và mục 4 ngữ cảnh nhất quán mới giải thích, chưa triển khai. Không thêm mức suy nghĩ riêng (mục 2).

- Server ghi cấu hình request thực gửi: model sau alias, nhiệt độ áp dụng hoặc null, thinking theo provider, maxOutputTokens và SHA256 của System/User Prompt/quy tắc xưng hô. Header không chứa nguồn, Name, prompt hay credential. Token suy nghĩ/tổng là metadata tùy chọn, thiếu không suy ra 0.
- JSON cũ giữ nguyên; bổ sung whitelist header ở cả server/client NDJSON. Metadata sai bị bỏ qua; cache cũ thiếu metadata hiển thị chưa biết. Snapshot đi cùng response/cache và chỉ gộp khi mọi phần có cấu hình giống nhau. Không suy ra cấu hình bản cũ từ cài đặt hiện tại.
- Identity nhiệt độ chỉ chuẩn hóa khi mọi model có thể chạy, kể cả dự phòng/hybrid, đều không dùng nhiệt độ. Đọc thêm identity cũ đúng nguồn/settings/Name, không di trú/ghi đè cache cũ. Giới hạn bytes/records và kiểm nguồn, revision, cancellation giữ nguyên; không đổi schema.
- Thử prompt: hai request thủ công lần lượt, cùng nguồn/Name/model/nhiệt độ; snapshot hai prompt trước khi gửi, không fallback, không tạo ReadingSession/cache, không ghi settings/progress/Name. Thay input, đóng trang hoặc Dừng hủy callback cũ; không tự thử lại. Có kết quả/timing/usage và đối chiếu thủ công, không tự chấm nghĩa bằng heuristic.
- Không thêm provider/key/billing, không tăng trần hai key đồng thời, không thay defaults dịch, không chạy AI thật để tự benchmark.

Nghiệm thu: targeted config/cache/stream/trial, request-response workerd với upstream tổng hợp, review độc lập, full unit giới hạn worker, build và E2E Windows desktop/Android layout; không gọi layout là Android thật. Chỉ deploy sau các kiểm tra liên quan; nhật ký và giới hạn ở HANDOFF-LOG gốc.

## Kết quả

Root full:187files/2286tests pass với2workers; build CapCut pass. Review13unit/handler +1workerd pass. UI built-preview6/6 và production6/6 desktop/Android-layout pass bằng dữ liệu tổng hợp/API mock, không ghi cloud thật. Deploy Pages8b4c4073/AIWorkerb7b1783d, giữ gateway/phiên TTS. Dev E2E từng treo khi nạp module; giữ fail log, không gọi đó là lỗi sản phẩm đã tái hiện. Chưa đo chất lượng AI thật, không kiểm Android thật. Chi tiết lệnh/log ở HANDOFF-LOG gốc.
