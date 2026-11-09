# Chọn model dịch và thử lại đúng model — 01/11/2026

## Hành vi phía trình đọc

- Chọn model tại bảng Dịch AI của truyện hoặc phần Model của trình sửa cấu hình/prompt. Lựa chọn được lưu theo phạm vi: truyện có cấu hình riêng dùng model riêng; truyện chưa có cấu hình kế thừa cài đặt chung.
- Đổi prompt giữ model đang chọn của phạm vi đó. Reload, bật/tắt chia phần và cập nhật kho prompt không tự thay model của truyện. Metadata mẫu prompt vẫn giữ ID và snapshot gốc.
- Reader, dịch sẵn và chạy thử trong trình sửa cấu hình chỉ gọi model đã chọn (`fallbackModels: []`), không đổi model sau lỗi. Bỏ tùy chọn Reader dịch lại bằng model dự phòng. Các helper/cache kết hợp cũ vẫn đọc được theo hợp đồng cũ; không di chuyển/xóa cache hoặc dịch lại dữ liệu cũ.
- Lỗi tạm thời được thử lại trên chính model đó: tối đa ba lần gửi cùng request, có chờ 600 ms rồi 2,5 giây và jitter. Stream đã có câu trả lời chỉ replay một lần như trước. Giới hạn lượt gửi/thời gian chương, checkpoint, lease và tối đa hai request đồng thời vẫn dùng cơ chế cũ.
- `Retry-After` được giữ cả khi dùng admission tức thời, bao gồm phục hồi phần bị lỗi. Chờ dài được Reader lên lịch trong thời hạn chương đang có; không tự gia hạn budget. Hết budget hoặc lỗi cấu hình/quyền cần người dùng xử lý; Stop hủy request và lịch chờ.
- Lượt dịch đang chạy giữ cấu hình đã chụp; đổi model áp dụng từ lượt dịch tiếp theo. Bản dịch đã lưu vẫn hiển thị model/cấu hình thực dùng của bản đó.
- Metadata thực thi nhận model có namespace an toàn như `qwen/qwen3.8-27b`; Groq Qwen ghi `thinking: disabled`, giao diện giải thích suy nghĩ đã tắt để ưu tiên tốc độ. Metadata lịch sử `provider-default` tiếp tục đọc được.
- Giữ quyết định TXT dưới 3.000 ký tự dịch nguyên chương theo DECISIONS 30/10; không thay planner chỉ vì đổi model.

## Nguồn tham khảo và điều chỉnh

Đã đọc [Groq TypeScript SDK chính chủ: retries](https://github.com/groq/groq-typescript#retries). Áp dụng nguyên tắc phân loại lỗi tạm thời và retry có giới hạn/backoff trên cùng request/model. Điều chỉnh theo app hiện có: dùng `AiRecovery`/`AiRequestAttempts`, deadline chương, `Retry-After`, hủy và lease hiện tại; không thêm SDK/dependency/provider ngoài phần Groq đã được người dùng yêu cầu. Ví dụ upstream không được coi là bằng chứng app chạy đúng hoặc model sẵn có.

## Bằng chứng phía client

- `npm.cmd test -- tests/ai-reader-settings.test.ts tests/ai-selected-model.test.ts tests/ai-parallel-settings-review.test.ts tests/prompt-stock.test.ts`: 55/55 tại `.dsh-tmp/model-client-targeted.log` (trước thêm một ca metadata thinking).
- `ai-retry-allowlist.test.ts`: 9/9; `ai-stream-second-chance.test.ts`: 19/19; `ai-immediate-policy.test.ts`: 22/22. Logs `.dsh-tmp/model-allowlist.log`, `.dsh-tmp/model-recovery-updated.log`.
- `ai-recovery`, `ai-whole`, `ai-whole-independent-review`: 64/64 trong lượt targeted cùng nhóm recovery cũ; lỗi nhóm còn lại được cập nhật theo chính sách mới và kiểm tra lại như trên.
- Regression mới `e2e/ai-selected-model.spec.ts`: chọn Qwen, đổi prompt, reload, lỗi rồi retry đúng Qwen; chờ Retry-After và Stop. Kết quả integration/E2E/build do agent chính cập nhật sau tích hợp.

## Giới hạn và triển khai

Chưa coi kiểm tra giả lập API là bằng chứng chất lượng/tốc độ Groq upstream thật hoặc Android thật. Chưa deploy tại thời điểm bàn giao phần client; trạng thái server, integration cuối và deploy do agent chính cập nhật tại tài liệu này.

### Nghiệm thu sau tích hợp client

- Tám phạm vi `ai-foreground-latency`, `ai-fallback-review`, `ai-text-preview`, `ai-selected-model`, `ai-retry-ux-independent-review`, `ai-speed-independent-review`, `ai-parallel-runtime-proof`, `ai-reader-settings`: 91/92 trong lượt đầu; sau sửa scheduler chỉ retry quota khi model chưa xác định, `ai-fallback-review` 9/9, `ai-speed-independent-review` 16/16 và `ai-selected-model` 17/17 đạt. Logs `.dsh-tmp/model-integration-fixes.log`, `.dsh-tmp/model-final-fixes.log`.
- Runtime proof 7/7 dùng D1 lease thật + Google giả lập: chương chia phần có hai request chồng thời gian trên hai key/lease khác nhau; một key chỉ một lease; 429 giảm width còn một, giữ thứ tự và checkpoint. Không dùng kết quả này để khẳng định upstream Groq thật nhanh hơn hoặc đã gọi thành công.
- Sửa scheduler quota đầu tiên: trước khi có phần thành công để biết model, 429 vẫn được giảm width/chờ/thử lại phần đó một lần; lỗi 503 của chuỗi fallback cũ không mở thêm vòng ở scheduler. Mỗi request vẫn đi qua giới hạn lượt gửi hiện có.
- Cập nhật fixture preview/latency từ 5.999 sang 2.999 ký tự để kiểm đúng hợp đồng nguyên chương dưới 3.000 đã chốt ngày 30/10, thay vì thay hành vi planner.
- Reviewer độc lập yêu cầu stream đã có answer nhưng kèm Retry-After vẫn phải chờ: đã chuyển trường hợp này qua cooldown, thêm regression HTTP503 + answerStarted + Stop.
- Built-preview browser acceptance: `node node_modules/@playwright/test/cli.js test --config .dsh-tmp/model-e2e-built.config.ts --workers=2 --reporter=line` exit0, 22/22 (38,4 giây): 4 model-selection + 18 CapCut desktop/Android mô phỏng, log `.dsh-tmp/model-e2e-built.log`. Model-selection dùng IndexedDB native và API tổng hợp, chạy bundle production, không import mã `/src` để seed.
- Hai lần khởi động Vite qua wrapper không mở socket trước60s; Vite trực tiếp mở được nhưng navigation chờ `load` timeout60s. Đã giữ log lỗi, chuyển built preview và `domcontentloaded`, toàn bộ luồng yêu cầu đạt; không sửa dependency để né môi trường.


### Chốt ngày 01/11/2026

Build exit 0, asset index-DiJjPKB2.js. Built E2E 22/22 (4 model, 18 CapCut), desktop và Android mô phỏng. Review độc lập không còn finding chặn; production manifest tại .dsh-tmp/independent-review-files.sha256. Full suite lần cuối: 2706/2709 đạt, còn timeout fixture stream dùng mốc cũ, timeout setup 144 truyện và overlap 246ms so với ngưỡng 250ms. Đã sửa fixture timeout theo hằng production và gate hai upstream cho ca overlap, chưa chạy lại. Log giữ nguyên .dsh-tmp/recovery-full-test-final.log. Người dùng yêu cầu dừng mọi kiểm thử thêm để tiết kiệm usage; không tuyên bố full suite xanh. Không thay production sau build/review.

Worker đã deploy fc2acc4d-4ca3-4f93-8e0c-0b70fcd960e8, Groq secret thêm qua file tạm riêng được ACL và xóa ngay sau deploy; không key trong repo/log/frontend. Chờ ghi ID Pages sau khi deploy xong. Chưa kiểm Android thật/chương dài thực tế/chất lượng dịch.

Pages deploy d312d26e, Worker fc2acc4d; production HTML HTTP 200 trỏ /assets/index-DiJjPKB2.js. Không chạy thêm test/smoke AI/TTS sau deploy theo yêu cầu dừng kiểm thử của người dùng. Kiểm tra endpoint AI/Gemma/CapCut thật trước deploy đã ghi ở trên.


Cập nhật tiếp01/11: người dùng yêu cầu giữ cả Tự động hạ model và Cố định model. Hành vi chỉ-fixed toàn Reader ở trên đã được thay bằng hai chế độ; người dùng hiện có vẫn giữ fixed cho đến khi đổi. Xem [Hai chế độ](AI-DUAL-MODE-2026-11-01.md) cho phạm vi/bằng chứng và trạng thái mới.
