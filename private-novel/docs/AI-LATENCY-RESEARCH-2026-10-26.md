# Giảm thời gian dịch AI — nghiên cứu 26/10/2026

## Phạm vi triển khai đã chốt

Người dùng chọn hai việc: chia sớm theo ngân sách output và cho đọc/nghe phần đầu hoàn chỉnh trong khi phần sau tiếp tục. Các quan sát và bảng đo bên dưới mô tả bản trước sửa; không phải benchmark của bản mới.

- TXT mới ước lượng output theo từng vùng nguồn, giữ khoảng trống trong cap8192 hiện có. Đây là heuristic, không phải tokenizer/provider guarantee; nếu vẫn bị cắt, tiếp tục phục hồi bằng checkpoint. Bộ chia giữ nguyên nguồn, Unicode và biên Name; trường hợp Name không cho phép cắt sớm dùng bố cục an toàn cũ.
- Ưu tiên plan/checkpoint đã lưu của lượt đang phục hồi. Không ghép cache của hai bố cục khác nhau hoặc buộc dịch lại phần đã xong để đổi plan.
- Khi bật song song, lease frame đủ2key đánh thức slot thứ hai sớm nếu model đã được ghim hoặc chỉ cấu hình một model. Nhiều model dự phòng vẫn đợi thành công đầu tiên để tránh trộn model. Nhánh phục hồi chỉ fork một cấp; admission chung giữ trần2, quota/cooldown và ưu tiên foreground.
- Prefix duyệt checkpoint trái→phải, dừng ở phần còn thiếu; parent hoàn tất thắng child cũ. Chỉ hiện phần `STOP` hoàn chỉnh, không stream câu dở hoặc lưu cache toàn chương sớm. Nghe hết prefix thì chờ và tiếp tục khi có phần tiếp theo; Stop/reload giữ các quy tắc cũ.
- Không đổi prompt, nhiệt độ, thinking, model, key, nhà cung cấp hoặc nút điều khiển.

Kiểm tra thực thi và phát hành được ghi trong HANDOFF-LOG; log chi tiết ở `.dsh-tmp/ai-latency-impl/`. Thời gian API thật và Android thật vẫn cần đo riêng.

## Nghiệm thu bản triển khai 22:05 +07

- Full unit: **190 file / 2.331 test đạt**; build `VITE_TTS_GATEWAY=capcut-v2` đạt. Reviewer độc lập kiểm diff/invariant; root chạy cả15 ca độc lập cuối.
- Runtime: handler + D1/workerd thật, Google SSE tổng hợp trả headers trước và giữ body500ms; xác minh upstream-body overlap>250ms với key/lease khác nhau, trần2, nhánh phục hồi, một key và cooldown. JSON cũ vẫn được kiểm riêng. Không dùng credential thật.
- Browser:36 luồng desktop/Android layout được bao phủ. Lượt cuối34 đạt;2 ca còn lại chỉ lệch nhãn `Đã dừng dịch` cũ so với `Đã dừng`, sửa test và chạy nhóm race18ca đạt (mỗi ca3lần). Ca mới kiểm nội dung TTS chính xác một lần theo thứ tự, checkpoint/reload/Stop, gap và parallelOFF; EPUB giữ markup/nguồn.
- Phát hành Pages **b88c5ded**, client **index-phbKSAqb.js**. Alias production và asset trả200 đúng bản. **24 smoke online đạt**, dữ liệu giả lập trong browsercontext riêng, toàn bộ API dịch/TTS/cloud bị chặn hoặc mock; không ghi truyện người dùng lên cloud. Rollback Pages500fac29; AIWorker không đổi.
- Không có benchmark Gemini thật, audio CapCut thật hay Android thật trong lần nghiệm thu này. Không suy ra phần trăm tăng tốc từ mock hoặc Android emulation.

## Kết luận chính

Chương người dùng báo chậm đang mất thời gian **dịch lại sau output bị cắt và timeout**, đồng thời web chưa cho đọc phần con đã hoàn tất. Không có bằng chứng rằng thao tác ghép văn bản cuối là nút thắt chính. Ưu tiên giảm công việc phải làm lại, tận dụng hai key đã có và xuất bản prefix hoàn chỉnh sớm.

Đây là kết quả nghiên cứu, chưa triển khai tối ưu hoặc đổi cài đặt/model. Giữ trần2key, provider/billing hiện có, Name/prompt/nguồn/cursor, cancellation và checkpoint cũ.

## Bằng chứng trang thực tế

Đọc bằng UI, không truy cập cookie/key, không gửi request dịch thử hoặc dùng chữ truyện làm fixture:

- Ảnh ban đầu2/3; khi kiểm tra trang hiển thị3/4 rồi hoàn tất4/4. “1/1” là task cấp cha, “3/4” là nhánh con sau phục hồi; không phải4task API đang chạy cùng lúc.
- Model hiển thị Gemini3.5Flash. **Chia phần song song tắt**, prewarm bật; không tự thay các công tắc này giữa lượt đang dịch.
- Lịch sử hiện “AI trả bản dịch bị cắt; Yêu cầu dịch quá thời gian”; sau đó có `ai_recovery_exhausted`, thông báo hết thời gian đợt dịch và đếm ngược phục hồi.
- Khi xong, cấu hình server ghi nhiệt độ0, suy nghĩ `provider-default`, output8192token. Mẫu tên “4 độ” không chứng minh nhiệt độ4. Không thấy số thought/output token của những request lỗi; chưa thể quy toàn bộ thời gian chờ cho reasoning.
- Đóng lại bảng AI sau quan sát; không dừng, restart hoặc đổi prompt của lượt người dùng.

Ảnh bảng chẩn đoán đã cắt riêng khỏi nội dung truyện: `.dsh-tmp/ai-latency/ai-panel-evidence.png`.

## Những điểm chậm xác nhận từ code

| Điểm | Bằng chứng | Ảnh hưởng |
|---|---|---|
| Phục hồi nối tiếp | `ai-complete.ts`: đợi `first=await translate(...)` rồi mới gọi `second=await translate(...)` | Các nhánh phục hồi chưa tận dụng được hai key độc lập, kể cả lúc có khả năng chạy hai request. |
| Prefix con chưa hiện | `ai-parts.ts` preview chỉ lấy `completed.get(root.id)`; `ai-reading.ts` lưu child nhưng publish lại `previous.text` | Đếm tiến độ đã tăng mà vùng đọc vẫn trống; phải đợi phần cha hoàn tất mới đọc/nghe được. |
| Khởi động lạnh chỉ1request | `ai-reading.ts` gọi `warm?2:1`; `ai-parts.ts` chỉ nâng width sau response cuối có `parallel===2` | Có thể bỏ lỡ khả năng bắt đầu hai phần sớm. Lease callback đã có thông tin pool nhưng chưa đánh thức scheduler để mở slot thứ hai. |
| Output/suy nghĩ | `server/ai-translate.ts` gửi `maxOutputTokens:8192`, không gửi `thinkingConfig` | Cần kiểm chứng reasoning và output budget trước khi tăng số lần retry. Không coi8192 là giới hạn tối đa của model. |
| Chờ sau hết đợt | `ai-job.ts` có ngân sách240s/24sends hoặc600s/256sends theo nhánh; hết đợt nghỉ60s | Timeout/lặp lại có thể kéo dài nhiều đợt. Chưa có sourceChars của chương thực để xác định nhánh ngân sách nào đã dùng. |
| Streaming hiện là activity | `ai-stream-client.ts` dùng progress cho heartbeat/lease; chỉ trả kết quả sau final envelope/EOF | Bật streaming hiện tại không đồng nghĩa chữ dịch đang được stream ra cho Reader. |

Cache child có thể chờ tối đa1s/lần ghi; đáng đo nhưng không có bằng chứng đây là phần chi phối sự cố. Không đổi bytes nguồn hoặc bỏ kiểm tra đủ bản dịch để lấy tốc độ.

## Đo pipeline bằng dữ liệu tổng hợp

Chạy chính `AiReadingSession` / `runAiParts`, fake clock, upstream giả lập1.000ms/request, cấm network. **4 phép kiểm pass**; không sử dụng key hoặc nội dung truyện người dùng. Đây là thời gian mô hình giả lập của scheduler, không phải benchmark tốc độ Gemini.

| Kịch bản4phần độc lập | Hoàn tất | Có chữ đầu | Mock request đồng thời tối đa |
|---|---:|---:|---:|
| Tuần tự1key | 4.000ms | 1.000ms | 1 |
| Khởi động lạnh, nhận hint2key sau phần đầu | 3.000ms | 1.000ms | 2 |
| Khởi động với hint2key đã biết | 2.000ms | 1.000ms | 2 |

Ca phục hồi nguyên chương: request cha bị cắt ở1.000ms; child trái xong2.000ms, child phải xong3.000ms. Tại2.000ms, `leafProgress=1/2` nhưng `text=''`; chữ đầu chỉ hiện3.000ms. Đã tái hiện đúng khác biệt “có phần hoàn tất” và “có chữ để đọc”.

Log/code/JSON đo: `.dsh-tmp/ai-latency/{research.log,research.test.ts,measurements.json}`. Chưa chứng minh mức tăng tốc phần trăm trên API thật hoặc chất lượng bản dịch.

## Thứ tự cải tiến đề nghị

1. **Cho đọc/nghe prefix child hoàn chỉnh ngay.** Duyệt cây checkpoint theo thứ tự trái→phải, dừng tại khoảng trống, ưu tiên parent đã xong nếu còn cả child cũ. Không công bố chunk model còn đang sinh, không đánh dấu cả chương xong sớm. Giảm thời gian chờ nội dung đầu; không tự làm API chạy nhanh hơn.
2. **Giảm retry lãng phí bằng kế hoạch chia sớm.** Khi chế độ chia được bật hoặc request dự đoán vượt output budget, chọn kích thước bằng source/output ratio và lịch sử timeout; so sánh1.200/1.800/2.400chữ thay vì chốt ngưỡng mới theo cảm giác. Giữ Name/Unicode/đoạn, giải thích lý do chia; resume plan hiện có của chương đang phục hồi.
3. **Tận dụng hai key sớm, kể cả nhánh phục hồi khi được phép song song.** Dùng chung admission/lease hiện có, foreground ưu tiên prewarm. Tín hiệu pool2key không chứng minh hai key đang rảnh: phải kiểm leases thực, busy/cooldown/429 và chỉ chạy tuần tự khi chỉ còn1key. Không ép bật chế độ song song đã tắt và không nhân fan-out theo độ sâu cây.
4. **Thử thinking `low` tại cài đặt prompt.** A/B với mặc định trên cùng đoạn, Name, model và template. Kiểm đủ nghĩa/xưng hô/Name/không sót trước khi thay mặc định; `minimal` chỉ là nhánh thử tiếp theo. Cấu hình thinking phải đi qua validator, cache identity và execution metadata; không thêm dưới dạng mẹo viết “đừng nghĩ” trong prompt.
5. **Đo và hiển thị đúng phần thời gian đang chờ.** Phân biệt queue/key, upstream/first token, xử lý, ghi cache và cooldown; ghi requested model với provider modelVersion nếu có. Đánh giá median/p95, first-readable, số sends, timeout/output-limit, tổng token. UI nên mô tả “đang dịch phần còn thiếu” thay nhãn “đang hoàn thiện” cho mọi pha.

Không giảm first-token/idle/hard timeout hoặc xóa cooldown một cách đồng loạt: dễ cắt request hợp lệ rồi tạo thêm retry. Không dùng kết quả2/3chưa đủ làm bản dịch hoàn chỉnh. Không hứa “nhanh gấp đôi” chỉ từ việc cấu hình max2.

## Tài liệu Google đối chiếu ngày26/10/2026

- [Gemini thinking — GenerateContent](https://ai.google.dev/gemini-api/docs/generate-content/thinking): thinking mặc định có thể tăng latency; hỗ trợ `thinkingLevel` theo từng model, `low` hướng tới giảm latency. Output token cap bao gồm thought token; hạ cap đơn thuần có thể gây MAX_TOKENS. Đây là khả năng góp phần, chưa phải chứng minh thought token gây lỗi ở chương này.
- [Gemini3.5Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash): tài liệu hiện ghi alias3.5 tự route sang3.6. Nhãn model được gửi/ghi trên web không đủ xác nhận version upstream. Không tự đổi model trong lượt nghiên cứu.
- [Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting): kiểm thinking và retry hữu hạn/backoff; sampling của3.6+ không còn hoạt động như các model cũ. Vì vậy đổi nhiệt độ không phải giải pháp tốc độ ưu tiên.

## Nghiệm thu trước triển khai

- Chỉ xuất prefix liên tục; phần sau xong trước không nhảy lên. Final text/order/checksum/cache giữ hợp đồng, source/settings/Names thay phải hủy job cũ.
- Runtime D1 thật với upstream tổng hợp: max2 leases/key khác nhau; trường hợp1key, busykey, cooldown, prewarm, quota, Stop và stream rớt đều giữ giới hạn.
- Cùng nguồn/Name/prompt để A/B; tách cache hit/cold và lỗi. A/B thinking cần thay đổi thật trong request, không đo nhãn UI.
- Browser và TTS: có chữ/nghe sớm trong lúc sibling còn chạy; không skip/replay prefix; hết phần chờ rồi tự tiếp tục; reload không autoplay.
- Chỉ xác nhận tốc độ thật sau đo API thật với mẫu tương đương và kiểm chất lượng. Lượt nghiên cứu ban đầu không build/deploy; triển khai hai việc đã chốt được ghi riêng ở đầu tài liệu và HANDOFF-LOG. Không commit/push hoặc sửa dữ liệu truyện người dùng.
