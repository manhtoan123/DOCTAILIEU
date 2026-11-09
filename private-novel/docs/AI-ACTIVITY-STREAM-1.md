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


## Điều chỉnh 29/10/2026 — chờ chữ đầu 23 giây, idle 7 giây

- Theo chốt mới: server chờ answer đầu tối đa23s từ bắt đầu request; sau answer đầu, mỗi text delta khác rỗng làm mới idle7s. Thought, usage, keepalive, headers và lease không gia hạn. Lỗi rõ ràng đi vào rotation/recovery ngay như hiện có; không thêm backoff.
- Giữ hard cap180s, guard STOP+EOF/usage/source-copy, cancellation, cache/checkpoint và trần2key. Timeout là hủy chờ phía web, không xác nhận Google đã dừng tính toán.
- Client giữ khoảng dự phòng vận chuyển10s hiện có để nhận lỗi/kết quả server; server vẫn thực thi23/7. Nếu kết nối server bị mất hoàn toàn, client tự hủy sau33s đầu/17s idle. Đây không phải timer retry thêm ở server. Lifecycle sau EOF vẫn có giới hạn cũ khi metadata/release chậm.
- Tham khảo [Vercel AI SDK timeouts](https://ai-sdk.dev/docs/ai-sdk-core/settings#timeouts): tách firstChunkMs/chunkMs, không dùng byte/metadata làm tiến độ. Điều chỉnh theo người dùng: chỉ answer, không dùng reasoning để reset. Không thêm dependency.
- Kiểm chứng: activity20/20 fake-clock; runtime4/4 workerd upstream tổng hợp, gồm idle thực7s và lỗi503 đổi key ngay. Review Sol Medium độc lập không còn blocker sau giữ nguyên dự phòng client. Chưa đo tỷ lệ thành công/tốc độ Google thật; mốc ngắn có thể cắt lượt vẫn đang suy nghĩ.
- Build PASS; review regression12/12; foreground latency18/18. E2E built-preview4/4 desktop/Pixel7 mô phỏng; Vite dev không tải trang, đã giữ log fail rồi chuyển preview. Worker1d356c40-0bd0-4605-93d5-6e2490ce72ce; Pagesca36d21a; bundle index-mwdUTKxG.js. Online HTML khớp build, stamp đúng và request rỗng qua service nhận envelope400 text_empty; không gọi Google hoặc ghi truyện thật. Log .dsh-tmp/timeout-23-7/. Chưa Android thật/AI upstream thật.


## Chốt tiếp 29/10/2026 — first60s / idle7s

- Người dùng đổi first-answer từ23s lên60s sau đối chiếu nhật ký:6request thành công có firstChunk,3lượt cần24,910/36,361/39,628ms. Mẫu nhỏ, không suy ra tỉ lệ cắt trên toàn bộ traffic. Giữ idle7s answer-only, lỗi rõ ràng rotation ngay, hard180s và transport grace10s (client dự phòng70s đầu/17s idle).
- Giữ cách tách first/chunk theo [Vercel AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/settings#timeouts), không dependency mới. Regression32/32, build PASS, preview4/4 desktop/Android-layout PASS. Worker e5d32208-d04c-41ae-a2cb-0ced1ff154d1, Pages55bdde78/index-qzCxZmLR.js; online bundle+request validation PASS. Không kiểm AI upstream/Android thật trong lần đổi ngưỡng này.
- Đã cập nhật heartbeat hiện có thành theo dõi nhật ký hàng ngày16:15 Asia/Saigon: chỉ metadata; phân model/policy/purpose, N, firstChunk/completion/lỗi/retry; im lặng khi không có phát hiện đáng kể. Không tự đổi ngưỡng/deploy theo một mẫu nhỏ; không gọi AI thử. Baseline metadata .dsh-tmp/timeout-60-7/baseline.json.


## 29/10/2026 — một cơ hội cho stream đã trả answer rồi lỗi

- Nếu request đã nhận answer text và gặp lỗi transport/timeout tạm thời, replay cùng model đúng1lần ngay, trước fallback. Retry vẫn qua admission/job.send/budget và Stop. Retry thất bại bất kỳ kiểu gì thì trả lỗi về policy cũ; không nối thêm retry thường trong cùng recovery.run. First60s/idle7s và trần2key giữ nguyên; ưu tiên key khác qua avoid-slot hiện có trong chế độ Reader immediate, không thêm key/provider.
- Không áp dụng đặc cách cho lượt chưa có answer, lease/metadata/legacy JSON, quota429, auth hoặc lỗi validation/permanent. Phần đã accept giữ nguyên và vẫn pin model; draft lỗi xóa, không cache/nghe như kết quả hoàn tất. Chính sách là1replay mỗi request/phần, không trộn hoặc nối draft từ hai lượt.
- Client giữ evidence answerStarted trong lỗi cục bộ; không sửa định danh cache hoặc schema log. Server buộc phát progress answer đầu ngay dù sát lease<250ms, để EPUB/chia phần không hiện draft cũng được nhận diện. Log vẫn có từng request/attempt/error; phiên bản app riêng phân cohort.
- Tham khảo [LiteLLM fallback handlers](https://github.com/BerriAI/litellm/blob/main/litellm/router_utils/fallback_event_handlers.py): phân tách retry/fallback và giới hạn attempt; áp dụng bằng recovery có sẵn, không thêm dependency hoặc cooldown.
- Kiểm tra98/98 targeted, gồm runtime workerd5ca/2idle7s thực, nonpreview+preview và fast lease→answer→error. Reviewer Sol Medium độc lập không còn finding; ban đầu phát hiện thiếu answer marker250ms đã sửa. EPUB/pin/budget đối chiếu code, chưa AI upstream hoặc Android thật.
- Build PASS;6ca E2E desktop/Android-layout:4pass lượt chính,2ca mới pass sau sửa kỳ vọng fixture (model thực do resolver chọn; kiểm đúng invariant hai request cùng model và avoid-slot1). Lượt preview khởi động nhầm khi build chưa xong đã dừng, giữ log. Worker5f28357a-d9ed-48f8-9590-9580b4a56f81/Pagesb8495e30/index-D2lnW4HJ.js; online bundle/stamp+invalid-input service boundary PASS, không gọi AI thật. Log .dsh-tmp/stream-second-chance/.


## Đối chiếu nhật ký sau17:21 ngày29/10/2026

- Đọc metadata API lúc khoảng22:10 +07:116rows tổng;24request có model, bắt đầu sau17:21. Không dùng24request làm mẫu ngẫu nhiên hoặc tỷ lệ thành công chương.
- 3request success;11timeout chưa có firstChunk;0timeout sau firstChunk;7output_limit;3untranslated_source. Trong đó14prewarm/10foreground. Ba success firstChunk24,509/27,787/28,670ms đều vượt23s. Mẫu tiếp tục hỗ trợ không hạ first về23s; không đủ xác định ngưỡng tối ưu.
- Không có timeout sau answer trong nhóm nên chưa đo hiệu quả special replay. Output_limit không phải idle7s: đi theo guard/retry kết quả cũ, không suy thành lỗi chết stream.
- Cả24request thiếu context.appVersion; canonical hiện Pages72fb6e38/index-MyF8hrq8.js theo HANDOFF, AIWorker5f28357a. Source hiện giữ60/7 và second-chance; không đủ gán các24request vào chính sách/client cụ thể chỉ theo thời gian. Cần bảo đảm version stamp trong các lần build tiếp theo để so cohort. Không sửa/deploy hoặc gọi AI thật trong lượt theo dõi này.


## Chốt mới29/10 — first45s, chỉ Flash3.5/2.5 được retry

- Người dùng xác nhận chỉ exact `gemini-3.5-flash` và `gemini-2.5-flash`, không gồm Lite. Allowlist áp dụng cả replay stream có answer và retry thường/output-limit cho cùng request; hạn mức kết quả xấu sẵn có của hai model được giữ. Model khác không lặp cùng request trong một job/đợt recovery; các phần nguồn khác và đợt khởi động phục hồi mới vẫn theo cơ chế cũ.
- Nhật ký snapshot116rows: firstChunk các success có timing đều<=39,628ms (Flash3.5:24,509–36,361; Flash2.5:24,910;3.8:8,733/39,628; Gemma1,769; Preview7,413; Lite1,290). Chọn first45s có khoảng đệm~5,4s trên cực đại quan sát, giảm15s cho lượt im lặng. Mẫu ít, không cam kết tối ưu/không cắt nhầm request lành tương lai. Giữ idle7s chỉ answer và hard180s; dự phòng client10s còn nên55s/17s nếu mất hoàn toàn server.
- Hai lớp áp dụng allowlist: AiRecovery và AiRequestAttempts chung; ai-parts không cấp lượt deferral cho model bị loại. Request identity cục bộ gồm vị trí partId để không nhập nhằng hai phần có body giống nhau. Lớp cha hybrid/EPUB chỉ tính sends/deadline; child session giữ identity vị trí. Không đổi HTTP body/cache/schema hoặc bỏ phần đã accept; không trộn model đã pin.
- Tham khảo [LiteLLM attempt/fallback identity](https://github.com/BerriAI/litellm/blob/main/litellm/router_utils/fallback_event_handlers.py); điều chỉnh trên recovery có sẵn, không dependency mới. Cập nhật heartbeat theo chính sách45/7 + allowlist, chưa tự đổi cấu hình từ các lần theo dõi.
- Targeted12files195PASS; sau sửa lớp bọc hybrid/EPUB7files76PASS (có overlap). Reviewer Sol Medium độc lập đã chỉ ra bypass deferral/collision identity; diff cuối không còn finding. Những test retry cũ đổi fixture sang model được phép, kèm regression từ chối cả Lite/3.8/3.7/Gemma/Preview và ranh giới request/accepted sibling. Log fail/khắc phục lưu .dsh-tmp/ai-retry-allowlist/.
- Build cuối PASS; E2E6/6 desktop/Android-layout PASS, gồm chuỗi3.8/3.7mỗi model1request rồi3.5Flash2request và avoid-key-slot. Worker9abc439c-2f94-4d55-b4d7-58e70512cd12; Pages828cddb2/index-CyyVrxQF.js; stamp retry35-25-first45-2026-10-29. Online HTML/stamp/service invalid-input PASS. Không dùng dữ liệu truyện làm fixture, không gọi AI thật để thử; Android thật chưa xác minh.
