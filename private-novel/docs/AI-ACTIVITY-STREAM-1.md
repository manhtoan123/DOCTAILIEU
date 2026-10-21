# AI-ACTIVITY-STREAM-1 — tiếp tục chờ khi model còn hoạt động

Yêu cầu 16/10/2026: thay ngắt cố định 30 giây bằng kiểm tra model có đang trả thêm dữ liệu hay không. Phạm vi là transport/deadline, không đổi prompt, chất lượng, model ưu tiên hoặc chính sách xoay key.

## M0: giao kèo và bảo toàn

- Client mới gửi `Accept: application/x-ndjson`; Worker chuyển sang `streamGenerateContent?alt=sse`. Key vẫn chỉ trong header server→Google, không đưa vào URL, bundle hoặc sự kiện gửi về.
- First activity: 60 giây tính từ lúc bắt đầu xử lý; idle: 30 giây từ nội dung hợp lệ gần nhất; hard cap: 180 giây/yêu cầu. Nội dung text của answer hoặc thought được xem là hoạt động. Comments/keepalive, byte rỗng, usage-only và headers không gia hạn idle. Hoạt động này không chứng minh model đang sinh token khi API chưa gửi gì.
- Server không gửi thought/text đang dịch. Chỉ gửi marker `{type:"progress"}` tối đa 4 lần/giây. Kết quả cuối chứa status và các header chẩn đoán an toàn trong envelope; client đọc envelope, sau đó chạy lại toàn bộ guard hoàn tất hiện có.
- Client chờ first tối đa 70 giây từ lúc gửi, idle 40 giây, hard cap195 giây; phần dư dành cho vận chuyển. Nếu backend cũ trả JSON, deadline40 giây từ lúc gửi vẫn áp dụng. Client cũ không gửi Accept mới tiếp tục nhận JSON/server30 giây như trước.
- Stream EOF cùng finishReason STOP, đúng model, usage hợp lệ, kích thước hợp lệ và guard chép nguồn đều bắt buộc. Progress, luồng bị cắt hoặc STOP trong một luồng chưa EOF không được ghi cache/tiến trình. Hủy phiên hủy fetch/body và chặn kết quả muộn.
- Tối đa upstream1MiB/8192 SSE records, kết quả128k ký tự; phía client1MiB/4096 records. UTF-8 tách giữa các chunk vẫn được giải mã đúng. Không dựa vào số byte HTTP đến để nhận định token chạy.
- Lease key cho streaming185 giây, JSON35 giây. Không thêm đồng thời, key mới hay provider. Giải phóng CAS kiểm cả expiry và claimtime (`last_used_at = owner - leaseMs`), vì lease dài/ngắn có thể trùng expiry. Claimtime được giữ ổn định qua các health update; claim tiếp theo tăng đơn điệu. Không đổi schema.
- Chunk/parts/hybrid/EPUB giữ nguyên giao kèo; từng request được theo dõi hoạt động, guard và chapter budget vẫn bao ngoài. Lỗi500 upstream vẫn là lỗi; streaming không bảo đảm loại bỏ lỗi của Google.

## Rollout và kiểm chứng

Runtime: `server/ai-translate.ts`, `server/ai-key-health.ts`, `server/ai-upstream-stream.ts`, `server/ai-stream-response.ts`, `src/ai-translate.ts`, `src/ai-stream-client.ts`, `src/ai-stream-protocol.ts`.

Nghiệm thu có fake clock: first45s/final65s giữ model; first silence60s; idle30s không bị comments/usage làm mới; hard180s dù hoạt động; reasoning không lộ; EOF/STOP/usage/guard; hủy không lưu; key còn giữ sau35s; release owner cũ không xóa phiên mới kể cả expiry trùng nhau; D1 CAS thực. Review độc lập có file `tests/ai-activity-stream-independent-review.test.ts`.

E2E Chrome/Android layout: mô phỏng streaming đầu45s/cuối65s, không cache trước hoàn tất, một request Gemma, đổi Bản gốc hủy và không lưu muộn. Chạy hồi quy fallback/stall/hybrid/EPUB. Đây không phải kiểm tra điện thoại Android thật.

Triển khai Worker trước: chỉ client chủ động negotiate mới dùng stream, tab cũ vẫn JSON. Sau đó Pages cho client mới. Không migration, không tái dịch hoặc sửa chương đang đọc. Rollback client về JSON cũng giữ cache/progress và thiết lập cũ. Smoke production dùng dữ liệu tổng hợp, không ghi cloud. Kết quả/ID triển khai ghi ở HANDOFF và HANDOFF-LOG sau nghiệm thu.

Nguồn: [Gemini streamGenerateContent](https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent), [Cloudflare Streams](https://developers.cloudflare.com/workers/runtime-apis/streams/).

## Nghiệm thu và production 16/10/2026

- Full root125tệp/1662test PASS, gồm12regression reviewer và D1 CAS thực. Sau sửa nhỏ EOF/abort cuối: targeted5tệp/209test PASS; build PASS. Review độc lập chấp nhận, không còn finding.
- E2E36ca phân biệt trên Chrome/Android-layout đều đã PASS:34ở lượt chính và2sau sửa fixture fallback cũ cố ý trả chữ Hán trong kết quả “thành công” thành nhãn Chương1/2 đã dịch. Không nới guard chất lượng. Lượt đầu4workers vướng localVite không trả trang, đã dừng/giữlog; khởi động lại optimizer và xác nhận GET200 trước lượt2workers. Không gọi đây là một lượt sạch36/36.
- Worker0569335b-9a8f-40a1-bd0e-9504a9c82527; Pages00e02c8c/master; bundle`index-DIDa9Q2x.js`. Không đổi schema/bindings/compatibility/deps. Triển khai Worker trước Pages.
- Production browser smoke PASS: canonicalHTML khớp dist; request negotiate NDJSON; hoạt động45s/kết quả65s bằng fake clock; cache0trước/cache1sau; một request; raw chương không đổi; dữ liệu tổng hợp và mọi APIcloud bị chặn. `.dsh-tmp/ai-activity/production.json`, `production.png`, `ai-activity-production.log`.
- API thật: hai mẫu tổng hợp126/836ký tự Gemma26B đều STOP, giữ đúng model,0Han và không fallback/retry. Lượt126:30.801ms (server30.188ms),58progress, first1.822ms/last30.483ms,130outputtokens. Lượt836:66.328ms (server65.821ms),128progress, first1.725ms/last66.011ms,831outputtokens. Đối chiếu đầu/cuối mẫu dài giữ tên, phủ định, hai người chia lương khô và không lấy tiền của hàng xóm. Cả hai đều vượt deadline cũ khi vẫn có hoạt động; không suy ra TPS, chất lượng mọi câu hoặc tỷ lệ thành công dài hạn từ2mẫu. Kết quả lưu `.dsh-tmp/gemma-return/activity.json`, `activity-150-r1.txt`, `activity-900-r1.txt` và `gemma-return-activity.log`. Trần2request/240giây toàn pha.
- Tab đã mở vẫn dùng bundle cũ đến khi tải lại; không reload hoặc thay đổi thiết lập tab của người dùng trong nghiệm thu. Không chạy kiểm tra Android phần cứng.
