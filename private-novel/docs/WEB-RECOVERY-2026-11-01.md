# Khôi phục TTS, chọn model cố định và Groq — 01/11/2026

## Bằng chứng trước sửa

- Production Pages `06aa85eb`, asset `index-ColL-hhl.js`, chứa gateway TikTok cũ, không gọi `/api/tts`. Source chỉ chọn CapCut khi build có `VITE_TTS_GATEWAY=capcut-v2`.
- Cùng thời điểm, POST văn bản tổng hợp tới `/api/tts` trả HTTP 200/success và audio base64. Đây là lỗi chọn gateway ở frontend; chưa có bằng chứng phiên CapCut hỏng.
- `automaticAiSettings` ghi đè model đã lưu bằng model đầu danh sách; Reader gắn lại chuỗi fallback cho current/prewarm. Điều này làm lựa chọn người dùng không được giữ ở runtime.
- Trước sửa Worker, request tổng hợp tới web với `gemma-4-26b-a4b-it` trả 200/STOP đúng ID. Tên Gemma đúng; không suy ra chất lượng/tốc độ cả chương từ một request.

## Hành vi mới

CapCut là mặc định của build khi không chỉ định gateway. Model được chọn ở bảng AI hoặc trình sửa prompt, lưu theo phạm vi hiện có; đổi prompt không đổi model đọc. Current, prewarm và retry chỉ dùng model đã chọn, giữ cache/checkpoint theo model và cho phép Dừng hủy chờ/request. Retry có ngân sách và tôn trọng Retry-After; lỗi cấu hình/quyền không bị lặp nóng vô hạn. Chi tiết client tại [Chọn model](AI-MODEL-SELECTION-2026-11-01.md), TTS tại [CapCut](CAPCUT-TTS-SETUP.md).

Thêm `qwen/qwen3.8-27b` qua Groq Chat Completions; không thêm SDK/dependency. Pool `GROQ_API_KEYS` là secret riêng của Worker, JSON mảng key theo thứ tự. Không trộn với Google hoặc đưa vào VITE/Git/log/URL. Mỗi lượt gửi chọn key chưa dùng lâu nhất, bắt đầu theo thứ tự cấu hình, bỏ qua key bận/cooldown/disabled. D1 chọn và giữ lease bằng một UPDATE nguyên tử; dùng bảng health/cooldown có sẵn, không migration. Khi key lỗi/quota, chỉ đổi key của cùng provider/model. Giữ giới hạn scheduler hai request đồng thời cho foreground/prewarm.

Groq gửi `reasoning_effort:none` cho dịch nhanh; JSON/SSE chuẩn hóa về hợp đồng hiện có, loại reasoning, từ chối output bị cắt/tool call/model trả về sai. Không công bố kết quả hoàn chỉnh nếu thiếu STOP; giữ bounded body/abort/lease cleanup. Seven-key pool được API models chấp nhận; Qwen active và một lượt dịch thật nhỏ thành công. Không xem đây là benchmark chương dài hoặc bằng chứng bảy key có quota độc lập.

Giữ quyết định 30/10: TXT dưới 3.000 UTF-16 code units dịch nguyên chương; chương dài áp dụng lựa chọn chia phần. Không tăng fan-out để suy đoán sửa độ chậm.

## Tham khảo và điều chỉnh

- [Groq SDK chính chủ](https://github.com/groq/groq-typescript/blob/master/src/resources/chat/completions.ts): áp dụng messages/Bearer/max_completion_tokens/stream_options và finish reason; dùng fetch hiện có thay vì thêm dependency hoặc retry ngầm của SDK.
- [Model Qwen trên Groq](https://console.groq.com/docs/model/qwen/qwen3.8-27b), [API reference](https://console.groq.com/docs/api-reference): exact ID, instruct mode `none`, SSE và usage. Giữ validation/cancellation/budget của ứng dụng thay vì tin stream là bản hoàn chỉnh.
- [Model card Gemma chính chủ](https://huggingface.co/google/gemma-4-26B-A4B-it): đối chiếu tên; runtime web xác minh ID Google riêng bằng request tổng hợp.
- [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/): chỉ secret phía server. [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/): reuse bound parameters/RETURNING; không lưu key rõ trong health rows.

## THU_PHONG và PHONG_TOI riêng dữ liệu

Người dùng chọn hai thư viện độc lập. Có thể dùng hai Pages project/origin, hai Worker AI và D1/R2/binding/secret riêng. Tài khoản Cloudflare thứ hai cũng phù hợp, nhưng chưa kết nối hoặc tạo tài nguyên cho tài khoản đó trong lần sửa này. IndexedDB/localStorage tách theo origin; tài nguyên server cũng phải tách, chỉ đổi tên miền không tách dữ liệu cloud.

Chưa copy/xóa/di chuyển truyện, thay cloud bindings hoặc chuyển tài khoản. Bước thực hiện tiếp theo cần tài khoản đích được đăng nhập/cấp quyền và lựa chọn dữ liệu khởi tạo mỗi web; giữ bytes/SHA, cây Album→series→truyện→chương và kiểm tra restore trước bất kỳ lần chuyển nào. Không cần gửi mật khẩu Cloudflare vào chat. Đây là xác nhận khả thi/phạm vi, chưa phải bản triển khai hai web.

## Nghiệm thu và triển khai

Đang tích hợp. Kết quả cuối và ID triển khai được cập nhật sau khi unit/build/runtime/browser và review độc lập hoàn tất. Không commit/push tự động; không dùng dữ liệu người dùng làm fixture.


### Chốt ngày 01/11/2026

Build exit 0, asset index-DiJjPKB2.js. Built E2E 22/22 (4 model, 18 CapCut), desktop và Android mô phỏng. Review độc lập không còn finding chặn; production manifest tại .dsh-tmp/independent-review-files.sha256. Full suite lần cuối: 2706/2709 đạt, còn timeout fixture stream dùng mốc cũ, timeout setup 144 truyện và overlap 246ms so với ngưỡng 250ms. Đã sửa fixture timeout theo hằng production và gate hai upstream cho ca overlap, chưa chạy lại. Log giữ nguyên .dsh-tmp/recovery-full-test-final.log. Người dùng yêu cầu dừng mọi kiểm thử thêm để tiết kiệm usage; không tuyên bố full suite xanh. Không thay production sau build/review.

Worker đã deploy fc2acc4d-4ca3-4f93-8e0c-0b70fcd960e8, Groq secret thêm qua file tạm riêng được ACL và xóa ngay sau deploy; không key trong repo/log/frontend. Chờ ghi ID Pages sau khi deploy xong. Chưa kiểm Android thật/chương dài thực tế/chất lượng dịch.

Pages deploy d312d26e, Worker fc2acc4d; production HTML HTTP 200 trỏ /assets/index-DiJjPKB2.js. Không chạy thêm test/smoke AI/TTS sau deploy theo yêu cầu dừng kiểm thử của người dùng. Kiểm tra endpoint AI/Gemma/CapCut thật trước deploy đã ghi ở trên.


Cập nhật tiếp01/11: người dùng yêu cầu giữ cả Tự động hạ model và Cố định model. Hành vi chỉ-fixed toàn Reader ở trên đã được thay bằng hai chế độ; người dùng hiện có vẫn giữ fixed cho đến khi đổi. Xem [Hai chế độ](AI-DUAL-MODE-2026-11-01.md) cho phạm vi/bằng chứng và trạng thái mới.
