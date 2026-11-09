# Nhật ký dịch AI — 28/10/2026

Người dùng yêu cầu bảng log trong Cài đặt, dùng chung điện thoại/PC, số lượt thành công/thất bại theo model, nguyên nhân, mốc giờ và thời gian hoàn thành. Đã chốt gộp thiết bị; triển khai trên D1 hiện có, không thêm provider/dependency/dịch vụ. PUBLIC_LIBRARY=1: đây là thống kê chung của thư phòng trên mọi thiết bị, không có namespace tài khoản riêng.

## Đơn vị và nghiệm thu

- Request model: một lời gọi dịch từ app, sau kiểm tra tự động ở server; không đồng nghĩa đánh giá văn phong/nghĩa. Các lần thử upstream/key ẩn được ghi riêng, không lấy HTTP200 làm thành công bản dịch.
- Chương: công việc budget.id ngẫu nhiên hiện có; finish sau ghép/kiểm tra client. Retry cùng công việc không nhân bản, replay cũ không ghi đè complete. Cache và Dừng nằm ngoài mẫu số lỗi model. Chương là dữ liệu báo cáo từ app, phân biệt với request quan sát ở server.
- Timestamp UTC, nhóm giờ bắt đầu theo Asia/Ho_Chi_Minh. Tỉ lệ luôn có số mẫu; không xếp hạng tuyệt đối khi mẫu ít. Trung bình thời gian chương thành công không cache tính từ lúc bắt đầu đến hoàn thành; không cộng thời gian request song song thành thời gian chờ.
- Bộ lọc thời gian/model; tổng quan model, giờ trong ngày, nhóm lỗi, nhật ký mới nhất. Ưu tiên UI gọn và 3 màu sẵn có, bảng cuộn ngang trên điện thoại. Thêm median/P90 và thời gian/1.000 ký tự cho so sánh độ dài hợp lý.

## M0 dung lượng, dữ liệu và thất bại

- Tối đa 5.000 sự kiện chung, 30 ngày; index thời gian. GET giới hạn 5.000 hàng và metadata retention/earliest; giữ lịch sử hữu hạn, không hứa toàn bộ lịch sử. Cắt bản cũ trong batch atomic khi ghi. Không sửa dữ liệu truyện, backup hoặc shared_state.
- Chỉ field allowlist: ID ngẫu nhiên, loại, model chuẩn, số ký tự, thời điểm/duration, trạng thái, lỗi/reason chuẩn, số lượt và kết quả upstream có giới hạn. Không nội dung nguồn/bản dịch/prompt/Name/book/chapter ID thật/key/label/IP/raw message.
- Pages log endpoint dùng chính sách cloud-device auth hiện có; origin write, body/field/array bound; không thêm PIN/login phụ. Trong public mode số liệu là công khai theo lựa chọn triển khai hiện hành; client event không phải bằng chứng provider.
- Log không được chặn hay làm fail request dịch. Worker ghi qua waitUntil; client outbox nhỏ, có giới hạn, gửi nền để log thất bại không cản đọc/nghe. Không tăng fan-out2key, không thêm timer vào dịch AI.
- Nghiên cứu: [OpenTelemetry GenAI metrics](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-metrics.md): tách workflow duration với inference duration và error.type/model, dùng low-cardinality errors. Áp dụng khái niệm, không cài SDK; đây không phải chứng cứ chạy đúng.

## Kiểm chứng và deploy

Hoàn tất và deploy 28/10/2026. Không hồi dựng lịch sử đã mất trong RAM; không tự đổi model theo bảng xếp số liệu.

- Kiểm tra đầy đủ: `npm.cmd test -- --maxWorkers=4` **204file/2.514test đạt**; build CapCut-v2 với `.dsh-tmp/capcut-dist` đạt. Targeted backend29test (24unit+5native workerd/D1), client5, stats8 và route hiện hành đạt. Unit về UTC+7/mẫu số/direct average/median/P90/char-weight/dedupe/stale completion; runtime retention5001→5000/TTL/public-origin validation/native streamed logging/fail-open đều đạt.
- E2E `e2e/ai-log.spec.ts`: preview8/8 và production8/8, Edge desktop + Pixel7 mô phỏng, Trắng/Giấy/Tối, filter rates/UTC time/cache, empty/stale failure; snapshot desktop/mobile. API/IDB tổng hợp, chặn cloud; chưa kiểm Android thật hoặc chất lượng model upstream thật. Lượt đầu lỗi locator getByLabel quá chặt, đã đổi test-only sang combobox accessible name và giữ log lỗi; code app không đổi sau build/review.
- Astra High độc lập đọc diff cuối không còn finding; đã sửa timeout bị gọi Dừng, HTTP400 invalid-key/location được phân loại đúng diagnostic, Stop chương không gọi invalid_result, và GET không chờ queue POST. Review lại E2E locator sau sửa. Hash server/ai-translate DE6DCD6C4665, server/ai-log D23E253205F1, client8F993A961B31, metrics87B9DA4903F8, stats62018CDABBD2, page5C7A51A82E9F.
- Source tham khảo bổ sung: [Worker waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil) và [D1 batch atomic](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). Không thêm SDK, dịch vụ, key hay provider; fan-out dịch2 không đổi. Log gặp lỗi không chặn hoặc tự retry provider.
- Deploy migration **chỉ `0016_ai_log.sql`**, không áp dụng lại toàn bộ migrations (index13 còn chờ). AI Worker **58ed1614-8344-4c09-b912-658279c00b12 100%**, Pages **cb2b74e3 / index-81Wnx6zM.js**. Alias `/settings/ai-log` HTTP200 đúng asset; GET thật `/api/ai/logs` HTTP200/limit5000/retention30/cacheprivate-no-store, lúc kiểm chưa có hàng lịch sử. Không tạo sự kiện thử trên kho thật. Rollback Pages34cc1835/Worker0a211620; bảng0016 có thể giữ khi rollback code.
- Log kiểm chứng: `.dsh-tmp/ai-log/{build,full,client-stats-final,preview,preview2,migration,worker-deploy,worker-status,pages-deploy,production}.log`; backend chi tiết `.dsh-tmp/ai-log-http400.log`, `.dsh-tmp/ai-log-deadline-{unit,runtime}.log`. Không commit/push.
- Giới hạn: upstream.durationMs chỉ tới response headers; request.durationMs gồm đọc/kiểm tra đầy đủ. Chương báo cáo từ app, không đoán model nên ban đầu unknown; cache RAM nhanh không tạo lượt gọi model/chương mới. Journal/outbox best effort có thể thiếu khi storage/network/close/retention cap; không coi đây là lịch sử bảo đảm đầy đủ hay benchmark chất lượng/văn phong. Các thử prompt có request log nhưng không ghi thành chương đọc. Số liệu đủ mẫu và cùng độ dài/cấu hình mới hữu ích để so sánh; chưa tự điều chỉnh lịch hay thứ tự model.

## Kế hoạch nâng cấp quy trình đo đạc — chốt 29/10/2026

**Trạng thái 29/10: L1–L4 đã hoàn thành, kiểm chứng và deploy.** Nhật ký v1 và bằng chứng triển khai 28/10 ở trên giữ nguyên. Phạm vi là bổ sung dữ liệu phục vụ cải tiến cách web dịch; không huấn luyện model hoặc tự thay chính sách dịch.

### 1. Kết quả cần đạt và các quy tắc giữ nguyên

Sau nâng cấp phải trả lời được: người đọc chờ ở đâu; cấu hình nào tạo kết quả; phần nào bị cắt/phải thử lại; đổi key/model đã cứu được bao nhiêu công việc; thay đổi phiên bản web có cải thiện trên những lượt tương đương không.

- Giữ tối đa hai key đồng thời, thứ tự model/điều kiện Lite foreground–prewarm đã chốt, budget/deadline/pin và Dừng. Không thêm lượt gọi AI, backoff, hẹn giờ retry hoặc tự chạy A/B để thu thập mẫu.
- Giữ TXT dưới 6.000 ký tự dịch nguyên chương, cách chia hiện hành của chương dài/EPUB, checkpoint và việc đọc sớm. Thay đổi đo đạc không sửa nguồn/Name/bản AI/cache identity/tiến độ/TTS hoặc tái nhập dữ liệu cũ.
- Log best effort dùng D1/API hiện có, luôn gửi nền. Lỗi mạng, DB, ghi log hoặc thiếu capability không làm chậm hay đổi kết quả dịch; GET nhật ký không chờ outbox.
- Giữ trần 5.000 bản ghi/30 ngày, 100 bản ghi outbox và payload 8 KiB hiện hành. Không tạo hàng cho từng token/chunk. Metadata mới phải có bound và allowlist trong trần này.
- PUBLIC_LIBRARY=1 tiếp tục là thống kê chung toàn thư phòng trên các thiết bị. Không thêm đăng nhập, provider, key, dependency, dịch vụ hoặc paid tier.

### 2. Đơn vị công việc và cách đếm đã chốt

`workId → partPath → requestId → upstreamAttemptNo`

| Đơn vị | Quy tắc |
| --- | --- |
| Công việc `workId` | Tái sử dụng ID ngẫu nhiên của budget hiện có từ khi bắt đầu tới trạng thái cuối. Prewarm được mở để đọc vẫn là cùng công việc. Tự retry/đổi key/đổi model/chia phục hồi không tạo thêm công việc. |
| Phần `partPath` | ID phần và phần cha ổn định trong cây chia hiện có; nguyên chương dùng phần gốc. Khi chia lại, giữ liên kết cha–con, không cộng phần cha đã thay thế vào số phần lá hoàn tất. |
| Request `requestId` | ID do server sinh cho từng lời gọi dịch thực từ app. Request chứa liên kết tới công việc/phần nếu được cung cấp hợp lệ; thiếu liên kết ghi unknown. Không dùng ID truyện/chương thật hoặc hash nội dung làm ID log. |
| Upstream attempt | Một lần thực sự gửi tới provider/key trong request; ordinal trong danh sách có giới hạn hiện có. Đổi key tạo attempt tiếp theo, không nhân đôi request. Chờ admission hoặc hủy trước khi gửi không phải attempt provider. |
| Thử lại thủ công | Khi tạo budget mới thì tạo công việc mới; có thể ghi `retryOfWorkId` nếu app còn biết chắc công việc tiền nhiệm. Không suy ra quan hệ chỉ từ nội dung giống nhau. |
| Cache, tham gia job cũ | Không có lượt gọi provider mới thì không cộng request/attempt/model success. Nhiều listener cùng job không tạo nhiều bản ghi hoàn thành. |

Request facts được server ghi; trình duyệt chỉ báo cáo phần giao diện/công việc mà nó quan sát. Metadata liên kết từ client không phải bằng chứng xác thực hay quyền sở hữu. Client không được ghi đè model, lỗi hoặc thời gian provider đã ghi ở server.

### 3. Dữ liệu bổ sung tối thiểu

| Nhóm | Nội dung và giới hạn ý nghĩa |
| --- | --- |
| Nhận diện | Phiên bản schema/định nghĩa số đo, các ID ở mục 2, phiên bản web và chính sách dịch/kiểm tra. Phân biệt dữ liệu v1 thiếu trường với v2. |
| Cấu hình thực dùng | Model chuẩn thực gửi; nhiệt độ thực áp dụng hoặc null; mức nghĩ/provider-default; max output thực gửi; mã phiên bản/hash template prompt và quy tắc xưng hô. Tái sử dụng `AiExecution` sau khi đối chiếu với payload provider. Ghi cấu hình engine thực dùng tại lúc gửi, bất biến cho request đó; không đọc lại UI khi ghi log để đoán lại và không đổi quy tắc áp dụng cài đặt của engine. |
| Hoàn cảnh | TXT/EPUB, đang đọc/prewarm/thử prompt; vai trò ban đầu và sự kiện chuyển foreground; vị trí model trong chuỗi dự phòng và mã lý do chuyển. |
| Kích thước/ngân sách | `sourceChars` giữ cách đếm UTF-16 hiện có; số ký tự context/độ dài phần; token input/output/thinking khi provider thật sự trả. Không có số đo ghi unknown/null, không tự thay bằng 0 hoặc suy ra mức nghĩ từ số token. |
| Phương án chia | Nguyên chương/chia phần, số phần lá, độ sâu và mã lý do chia thực tế (output budget, timeout, kết quả bị cắt…). Chỉ quan sát quyết định của engine hiện tại. |
| Thời gian | Các số đo ở mục 4, nguồn đo client/server và phạm vi đo. Không lưu chung một duration không rõ đang đo headers, generation hay giao diện. |
| Kết quả | Trạng thái request/server và kiểm tra/ghép client; mã lỗi/finish reason allowlist; hình thức phục hồi và kết quả cuối. Thành công kỹ thuật chưa phải đánh giá nghĩa/văn phong. |

Hash prompt là nhận diện template/cấu hình, không hash prompt đã thay toàn bộ nội dung chương để nhóm so sánh. Cấu hình chỉ biết được từ client phải đánh dấu nguồn báo cáo; không gán là server-confirmed. Không lưu text nguồn, bản dịch, prompt, Names, ID truyện/chương thật, key/label/hash key, cookie, IP hoặc raw error/body/header. Không đưa metadata log vào prompt gửi provider hoặc định danh cache.

### 4. Các mốc thời gian và trạng thái

- Timestamp lưu UTC; hiển thị/nhóm giờ bắt đầu theo Asia/Ho_Chi_Minh. Duration trong một runtime dùng đồng hồ đơn điệu, với clock/session epoch rõ ràng; không trừ timestamp client cho timestamp server để suy ra độ trễ.
- Ghi thời gian chuẩn bị/admission nếu quan sát được; bắt đầu gửi; có headers; có chunk nội dung đầu tiên; kết thúc đọc response/kiểm tra server. `upstream.durationMs` cũ vẫn có nghĩa tới headers, không đổi ngầm thành tổng thời gian sinh.
- Client ghi riêng `previewVisibleMs` (bản nháp đã hiện), `acceptedContentVisibleMs` (nội dung qua kiểm tra đã hiện) và `workCompleteMs` (công việc hoàn tất). Bản nháp bị xóa khi lỗi không được dùng làm bằng chứng đã có nội dung hoàn chỉnh để đọc/nghe.
- Ghi `foregroundAt` khi công việc đang prewarm được mở để đọc, cùng thời gian tới nội dung được chấp nhận và tới hoàn tất. Ví dụ prewarm 10 giây rồi mở và đợi thêm 2 giây: tổng công việc 12 giây, chờ từ lúc mở là 2 giây. Nếu nội dung đã hiển thị ở thời điểm ghi nhận foreground thì mốc chờ tương ứng là 0; cache/hydrate/render còn mất thời gian phải được đo, không ép mọi cache thành 0. Thiếu quan sát thì unknown.
- Chỉ tính lần chuyển foreground đầu tiên trong một công việc cho chỉ số chính; không phát thêm hàng trên mỗi render, scroll hoặc mỗi listener. Ghi mốc hiển thị khi view tương ứng thực sự đang được mở, không coi cập nhật nền là nội dung người đọc đã thấy.
- Tải lại/đóng tab làm mất quan sát thì giữ dấu thiếu dữ liệu; không tự kết luận timeout, Dừng hoặc hoàn thành. Chỉ phục hồi mốc liên kết khi còn chứng cứ; không trộn các clock/session sau reload, không tự phát lại TTS.

Trạng thái luồng được quan sát: bắt đầu → chốt cấu hình/phương án → gửi → nhận bản nháp → kiểm tra → chấp nhận phần → ghép → hoàn tất. Bước không áp dụng được để trống; không ép engine đi qua một bước mới chỉ để tạo log.

- Retry/đổi key/model giữ các lỗi trước đó; chương cuối thành công vẫn là một công việc thành công sau phục hồi.
- Bị cắt, còn nguồn, thiếu phần hoặc lỗi map EPUB ghi đúng tầng phát hiện. Không tự gộp lỗi mạng/quota/cấu hình vào lỗi nội dung của model.
- Stop → cancelled, cache → cache; giữ riêng khỏi mẫu số lỗi model. Lỗi phần được thay bằng các phần con không tự thành lỗi cuối cả công việc.
- Model của kết quả cuối chỉ lấy từ các phần lá thực sự được chấp nhận: một model khi có đủ chứng cứ, mixed khi dùng nhiều model hợp lệ, unknown nếu thiếu liên kết. Không lấy model khởi đầu hoặc model lỗi cuối làm model hoàn thành chương.
- Dedupe theo ID/sequence ổn định; terminal success không bị replay cũ ghi đè. Callback đến muộn vẫn thuộc đúng chủ công việc đã tạo nó, không lấy chương đang mở hiện tại để gán lại log.

### 5. Thứ tự triển khai và điểm nghiệm thu

| Đợt | Việc phải hoàn thành | Nghiệm thu để chuyển đợt |
| --- | --- | --- |
| **L1 — Liên kết và cấu hình** | Contract log v2 có tương thích v1; gắn work/part/request/attempt; snapshot cấu hình thực dùng; vai trò đang đọc/prewarm/trial và phiên bản web. | Truy ngược một công việc qua nhiều key/model/phần; đổi foreground không đổi ID; thử prompt không tính là chương đọc; dữ liệu cũ là unknown, không bịa trường thiếu. |
| **L2 — Đo thời gian chờ** | Thêm các mốc client/server ở mục 4, đặc biệt thời gian từ mở chương prewarm tới nội dung được chấp nhận. | Ca tổng12s/chờ2s đúng; preview lỗi không nâng số accepted; clock lệch/reload/ẩn view không sinh số âm hoặc thời gian giả; GET/outbox không cản dịch. |
| **L3 — Kết quả và phục hồi** | Liên kết cây phần và validation; số lần retry/đổi key/model, lý do và trạng thái cuối; độ đầy đủ của chuỗi log. | Một công việc phục hồi không bị đếm thành nhiều chương lỗi; không đếm cha và con trùng; HTTP200 nhưng fail kiểm tra vẫn hiện rõ; Stop, cache, lỗi mạng/quota/nội dung phân biệt đúng. |
| **L4 — Thống kê phục vụ cải tiến** | Bổ sung bộ lọc/chỉ số vào Cài đặt → Nhật ký hiện có; nhóm cùng cấu hình, vai trò, vị trí fallback và độ dài. Bổ sung metadata nhóm thử A/B do người dùng chủ động chạy tại phần prompt hiện có. | So sánh giữ đúng mẫu số/N; không trộn trial, cache, prewarm hay dữ liệu thiếu với số chờ foreground; bảng trước/sau phiên bản dùng cùng định nghĩa số đo và cohort. |

L1 là nền cho L2/L3; chỉ hoàn thiện bảng so sánh L4 sau khi dữ liệu nền và định nghĩa đã đạt. Không thêm nút/log/popup vào trang đọc; các bộ lọc, diễn giải số đo và chi tiết nằm trong Cài đặt → Nhật ký. Giao diện giữ ba màu và thao tác điện thoại hiện có.

### 6. Quy tắc so sánh và sử dụng kết quả

- Nhóm so sánh ít nhất theo model thực, config/prompt version, vai trò, TXT/EPUB, ngưỡng độ dài dưới 6.000/từ 6.000 và vị trí model đầu/dự phòng. Trial/A-B tách lượt đọc thực; cache/cancelled và unknown không được âm thầm biến thành lỗi hay mẫu thành công.
- Model dự phòng thường nhận những lượt đã thất bại trước đó; tỉ lệ tổng không đủ kết luận model kém. Hiện số mẫu, cảnh báo mẫu ít và phạm vi dữ liệu thiếu/cắt bởi retention; chưa đủ nhóm tương đương thì không xếp hạng chắc chắn.
- Thời gian chờ foreground, tổng công việc và tổng API time là ba đại lượng riêng. Không cộng duration các request song song thành thời gian người đọc chờ. Trung bình tính từ mẫu gốc; median/P90 giữ đúng tập mẫu; mỗi chỉ số có N riêng.
- Đo số lượt được phục hồi, số lần gửi trên công việc hoàn tất, số phần bị cắt và thời gian tới nội dung được chấp nhận. Dùng chúng để đề xuất ngưỡng chia/budget/prompt; không tự đổi chính sách model chỉ từ log quan sát.
- Khi cần kết luận cấu hình nào tốt hơn, dùng bộ đoạn thử cố định và chỉ thay một yếu tố mỗi lần trong trang thử prompt hiện có; chỉ chạy khi người dùng chủ động yêu cầu. Nhật ký chỉ lưu ID ngẫu nhiên nhóm thử và metadata, không chuyển nội dung mẫu lên kho log chung. Đánh giá nghĩa/văn phong cần dữ liệu đánh giá riêng do người dùng chọn, không suy ra từ việc lưu Name hay dừng nghe.

### 7. Tương thích, dung lượng và phát hành

- Server/API đọc v1/v2 trước; client chỉ bật metadata mới khi biết contract được hỗ trợ. Header runtime không đổi payload nghiệp vụ/cache key và không truyền sang provider. Thiếu hỗ trợ dùng dữ liệu v1/unknown; lỗi phiên bản không được âm thầm xóa các bản ghi queue hợp lệ.
- Không ghi thêm một hàng cho mỗi thay đổi trạng thái hoặc chunk. Work dùng upsert có sequence/chống stale; request là bản ghi terminal bất biến có tóm tắt attempt; liên kết phần nằm trong metadata có giới hạn. Dữ liệu bị rơi do cap/offline/storage phải được thể hiện là thiếu, không dùng làm bằng chứng cả hệ thống không có lỗi.
- Giữ hiện trạng dữ liệu và các trần M0. Nếu cần thay schema, dùng migration cộng thêm có kiểm chứng; không tái áp dụng các migration cũ đang chờ và không backfill bằng suy đoán. Không tăng quota/retention hoặc thêm kho lưu trữ để né giới hạn.
- Ghi nhận schema/metric version, khả năng thiếu log và phạm vi quan sát. Không hứa theo dõi toàn bộ mọi thiết bị khi client đóng/mất mạng hoặc bản cũ chưa cập nhật.
- Rollback vẫn dịch được và đọc được log cũ; client cũ không bị buộc cập nhật để đọc truyện. Mỗi đợt code đạt kiểm tra mới deploy theo quyền đã có; chưa deploy phần nâng cấp trong lượt chốt kế hoạch.

### 8. Kiểm thử bắt buộc khi thực hiện

1. Regression cùng đầu vào có/không ghi log: số request/key attempt, payload provider, model order, phân phần/kết quả, fan-out≤2 và budget không đổi. Ghi log chậm/DB lỗi không cản bản dịch; không có timer retry AI mới.
2. Prewarm mở dở giữ job; nhiều listener; phần con/ghép; pin model; Stop/late response; thay cài đặt; đổi chương nhanh; cache; manual retry. Xác minh ID, sequence, tập mẫu và quyền sở hữu callback.
3. Time fixture: headers/chunk/preview/accepted/complete; tổng12s/chờ2s, đồng hồ client/server lệch, hidden/reload/offline và unknown. Mock không được dùng làm bằng chứng tốc độ hoặc chất lượng provider thật.
4. Native HTTP/Worker/D1: schema/version negotiation, allowlist/size/origin/auth theo chế độ hiện hành, dedupe/replay, giới hạn hàng/TTL/outbox; redaction không chứa source/prompt/Name/key/ID truyện thật.
5. Review **Sol High độc lập** diff cuối (điều chỉnh model theo yêu cầu 29/10/2026) phần dữ liệu/giao thức, targeted + full unit + build theo AGENTS; E2E desktop/mobile ba màu, API/dữ liệu tổng hợp cô lập cloud. Không lấy truyện người dùng làm fixture hoặc viết log thử lên kho thật.
6. Cập nhật tài liệu hành vi, số đo đã kiểm, giới hạn, phiên bản triển khai/rollback. Phân biệt mock/layout với Android/provider thật. Lượt chốt tài liệu này chỉ kiểm diff/nội dung/link; không chạy test/build/deploy.

### 9. Nguồn tham khảo và phần để sau

- [OpenTelemetry GenAI inference](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/client-inference.md): tương quan lần gọi, cấu hình prompt/model, token và thời gian tới chunk đầu; tiêu chuẩn đang phát triển, chỉ tham khảo khái niệm, không cài SDK.
- [OpenTelemetry GenAI metrics](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-metrics.md): tách inference với workflow duration và error classes. Điều chỉnh cho cây chia chương/prewarm/foreground thực tế của web.
- [Worker waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil), [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch): tiếp tục cách ghi nền và transaction hiện có. Nguồn thiết kế không thay thế bằng chứng kiểm chạy.

Tổng hợp dài hạn theo ngày sau khi log chi tiết hết hạn, dữ liệu chấm chất lượng và tự đề xuất/đổi cấu hình là các đợt sau L1–L4. Chưa tăng retention, tạo dataset nội dung hoặc tự chạy thử nghiệm/huấn luyện trong phạm vi chốt này; chỉ mở các phần đó khi có yêu cầu và M0 dung lượng/phạm vi tương ứng.

## Kết quả triển khai L1–L4 — 29/10/2026

- Contract v2 tương thích v1, dùng cột JSON hiện có, không migration. Request server có cấu hình thực dùng, usage nếu provider trả, mốc preparation/admission/headers/chunk/complete. Client chỉ gửi metadata quan sát qua header allowlist; header không chuyển sang provider/cache identity. Mất log không chặn dịch.
- Work/part/request/attempt giữ liên kết qua retry, chuyển prewarm→foreground và chia phục hồi. Model hoàn tất lấy từ phần lá được chấp nhận; hybrid chủ động không bị tính là phục hồi. Lỗi map EPUB và lý do chia được ghi ở tầng phát hiện. Timestamp UTC chỉ tham khảo; thời lượng dùng cùng epoch monotonic, thiếu thì để unknown. Thành công vẫn được đếm khi thiếu thời gian, nhưng không đưa số0 giả vào TB/median/P90.
- Trang Cài đặt → Nhật ký thêm phân tích quy trình, vai trò, định dạng, prompt và nhóm so sánh cấu hình/phiên bản/độ dài/fallback. Mỗi số đo có N riêng. Tổng công việc12s và chờ từ mở chương2s được tính riêng. Preview, nội dung được chấp nhận và hoàn tất là ba mốc khác nhau; EPUB chỉ ghi đã thấy nội dung sau ready của đúng iframe/render hiện tại.
- Trial tách khỏi lượt đọc mặc định. Người dùng chủ động thử prompt có group/variant, không tự chạy A/B. Nhiều model/prompt hoặc dữ liệu thiếu không được quy kết tùy tiện; filter prompt chỉ ghép chương khi các request quan sát được cùng prompt.
- Outbox100/8KiB, kho chung5000/30ngày giữ nguyên. Snapshot ACK theo epoch/sequence, replay không hạ terminal success; hàng bị từ chối không chặn hàng hợp lệ tiếp theo. Nếu server chưa hỗ trợv2, enrichment chương được giữ chờ capability, requestv1 vẫn tồn tại; không tự xóa dữ liệu hợp lệ để tương thích.
- Build công khai gắn VITE_APP_VERSION=ai-observability-2026-10-29; build không có stamp để unknown. Không lưu source/result/Names/prompt text/ID truyện thật/key/cookie/IP/raw error. Không đổi model order, retry policy, fan-out≤2, TTS/progress/cache hay nguồn truyện.
- Áp dụng ý tưởng correlation/config snapshot và tách inference/workflow từ các nguồn OpenTelemetry liên kết ở mục9; dùng waitUntil/D1 batch sẵn có, không cài SDK/dependency mới. Đây là dữ liệu vận hành, chưa chứng minh chất lượng nghĩa/văn phong hoặc tốc độ upstream thật.
- Sol High review độc lập diff cuối không còn finding sau sửa unknown-clock; kiểm lại sửa muộn optional appVersion và regression snapshot. Preview E2E12/12 đạt: desktop + Pixel7 mô phỏng, ba màu, v2config/work12s/chờ2s và EPUBready. Dữ liệu/API tổng hợp cô lập cloud; chưa Android thật/provider thật. Bằng chứng build/regression/deploy cuối bổ sung bên dưới.
- Kiểm chứng cuối: full `npm.cmd test -- --maxWorkers=2` **208 file / 2.555 test đạt**; build CapCut-v2/stamp ở trên đạt, asset `index-XvjDDPkc.js`. Lượt đầu `maxWorkers=4` có3hook timeout và1assertion cũ thiếu metadata; chạy riêng xác định import.meta.env trong bundle IIFE thiếu env, đã dùng optional chaining và cập nhật assertion không nới invariant payload/cache. Sau sửa, full trên đạt toàn bộ; không che known failure hoặc tăng timeout để né lỗi.
- Deploy Pages **5d4ee5a1**, AI Worker **93f96ede-c37d-472d-9620-243019ef68fb (100%)**; không chạy migration. Alias `/settings/ai-log` HTTP200 đúng asset, GET thật `/api/ai/logs` hỗ trợ schema[1,2]/5000/30ngày/private-no-store; chỉ đọc metadata kiểm tra, không tạo log thử trên kho thật. Rollback Pagescb2b74e3/AI58ed1614; Convert không đổi.
- Logs: `.dsh-tmp/ai-log-v2/{full,final-regression,final-runtime,full-final,build,preview,pages-deploy,worker-deploy,worker-status,online-smoke,production}.log`; native Worker/D1 chi tiết ở `.dsh-tmp/ai-log-v2-{unit,runtime,final,backend-typecheck}.log`. Không commit/push.
- Production E2E **12/12 đạt** (17,6s), cùng phạm vi desktop/Pixel7 mô phỏng/ba màu/v2/EPUBready, API và IDB tổng hợp chặn cloud thật. Hoàn thành L1–L4; không suy ra chất lượng upstream hoặc hoạt động Android nền từ các kiểm tra này.

## Kiểm tra prewarm sau L1–L4 — 29/10/2026

[Sự cố, đối chứng bật/tắt log và sửa capacity/fallback](PREWARM-CAPACITY-FALLBACK-2026-10-29.md): metadata thật ghi nhận6request prewarm hết hạn hoạt động đầu tiên60s; chưa quy nguyên nhân cho L1–L4. Tìm được lỗi pin model từ capacity có sẵn trước log, tái hiện với observeMetrics cảfalse/true và đã sửa cho admission một phần; giữ pin checkpoint/đa phần song song. Build và E2E preview/production4/4 đạt với API tổng hợp. Không xem E2E giả lập là chứng cứ hết timeout upstream thật.
