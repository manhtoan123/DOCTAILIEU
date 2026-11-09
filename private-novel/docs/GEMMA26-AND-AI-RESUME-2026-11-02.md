# Gemma 26 và tiếp tục phần dịch thiếu — 02/11/2026

Theo yêu cầu trực tiếp, getPromptStock thực hiện một lần trong transaction settings: chuyển mọi profile (kể cả mặc định), common/book AI settings và snapshot chosenProfileSettings sang gemma-4-26b-a4b-it, modelMode fixed, fallbackModels rỗng. Giữ system/user prompt, temperature, Names, nội dung và cache. Marker ai-fixed-gemma26-request-2026-11-02 ngăn ghi đè lựa chọn người dùng ở các lần mở sau. Chạy khi mở Cài đặt AI/bảng AI; default reader và AI_DEFAULTS cũng dùng Gemma26. Không sửa hoặc tái dịch chương hoàn tất.

Reader từng chỉ gọi aiAutoResumeDelay nên hết deadline có thể không lên lịch tiếp tục. Đã dùng aiAutoRecoveryPlan hiện có: retry ngắn trong lượt, chờ cooldown khi cần mở lượt tiếp, chỉ renew budget khi plan yêu cầu; giữ key/phần hoàn tất và Stop hủy kế hoạch. Cơ chế lỗi cấu hình/quyền/validation và giới hạn replay theo model ở session không thay đổi. Đây là lỗi code xác minh được; chưa truy xuất log upstream của chương /r/10027/1 để kết luận nguyên nhân riêng của chương đó.

Nguồn: đối chiếu triển khai recovery/multipart hiện có trong dự án; nguyên tắc [TanStack Query retries](https://github.com/TanStack/query/blob/main/packages/query-core/src/retryer.ts) về retry có delay/cancel, không thêm dependency. Targeted 9/9 pass (migration một lần + recovery/hybrid giữ phần thành công); .dsh-tmp/gemma-resume-targeted.log. Build/typecheck cuối đạt, .dsh-tmp/import-ai-final-build.log, index-COkJR2E3.js. Chưa thử upstream AI thật hoặc dữ liệu người dùng; không mở thêm review theo yêu cầu mới.

Đã deploy Pages8791b14f, Worker AI giữ9f48a8f1; GET /settings/ai và asset200, marker migration có trong bundle. Mở lại Cài đặt AI/bảng AI để áp dụng một lần trên thiết bị.
