# Dịch AI: phục hồi phần thiếu và bảng điều khiển

16/10/2026 — triển khai [AI-RETRY-UX-PLAN](AI-RETRY-UX-PLAN.md). Trạng thái nghiệm thu/phát hành được ghi ở cuối tài liệu.

## Hành vi

- HTTP 400 từ model được phân loại `ai_request_rejected`, không biến thành 502 để tự retry/fallback. Body Google không được phản chiếu vào UI/log. Các nhánh key không hợp lệ, vị trí không hỗ trợ, model404 và quota giữ phân loại riêng.
- Gemini3.7/3.8 không nhận tham số temperature bị Google bỏ qua; giá trị trong cài đặt được giữ để dùng khi chọn model khác. Prompt và giới hạn output không thay đổi.
- Một budget dùng chung bộ đếm tối đa ba lần gọi cùng đầu vào/model khi lỗi tạm thời, kể cả qua lớp phục hồi phần và tự thử lại. Hết trần vẫn giữ checkpoint; retry thủ công mở budget mới. Lỗi cố định không tự retry; bộ đếm send/deadline toàn chương vẫn bảo vệ mọi lượt gọi.
- Cooldown được giữ qua các phiên con hybrid và EPUB, bao gồm retry thủ công; bấm retry không vượt thời gian chờ server. Offline dừng gửi, online kiểm lại cooldown trước khi tiếp tục. Nếu thời gian chờ vượt deadline hiện tại thì không hiện lịch tự retry không khả thi.
- Nửa sau lỗi có thể đổi Lite hoặc sửa prompt nửa sau rồi **Lưu và tiếp tục**; nửa đầu hợp lệ được dùng lại. Khi thao tác nhằm vào chương sau, chương đang đọc giữ bản dịch và vị trí. Lưu thông thường vẫn áp dụng từ lượt tiếp theo, không tự khởi động lại.
- Save chậm rồi chuyển chương không được tiếp tục nhầm target; Stop trước khi tải xong nguồn chương sau chặn request mới. Kết quả muộn không thay nội dung đọc hoặc mốc AI.
- Metrics chỉ có một công việc chương, không đếm session con của hybrid thành chương khác; phần hoàn tất của hai nửa được cộng. Mã lỗi cấu hình được giữ trong diagnostics đã lọc.
- Khi câu Việt/Latin còn ký tự Hán từ nguồn ngoài Name đã chỉ định, hoặc một đoạn thuần Hán còn ít nhất24 chữ Hán và chuỗi8 chữ liên tiếp trùng nguồn, trả `ai_untranslated_result` rồi dùng bộ chia phục hồi có giới hạn hiện hành. Không retry nguyên yêu cầu lỗi chất lượng theo lịch transient. Giữ Name được chỉ định; kiểm giá trị JSON EPUB, bỏ qua ID. Kiểm lại sau ghép; bản không đạt không vào cache hoàn chỉnh hoặc mốc AI. Cache cũ không đạt chỉ được coi là miss khi đọc, không quét/xóa hàng loạt; phần tốt và model đã chốt vẫn giữ. Đây là bộ nhận diện chép nguồn rõ ràng, không bảo đảm bắt đoạn trích thuần Hán ngắn, chữ không xuất hiện ở nguồn hoặc mọi lỗi ngữ nghĩa.

## Giao diện

Đầu bảng hiển thị chương đang xử lý, nửa hiện tại, model thực tế, số phần hoàn tất, lỗi và countdown nếu có. Nửa đầu đã xong được ghi rõ khi đang ở nửa hai. Các thao tác tiếp tục/dừng/dừng tự thử lại đặt tại đây. Lỗi request dẫn tới cấu hình; lỗi key kèm hướng dẫn kiểm keys và vẫn cho thử thủ công sau khi sửa key. “Chi tiết lượt dịch” giữ tối đa8 nhãn model cùng mã lỗi/request ID đã lọc; không chứa nguồn, prompt hoặc key.

Model và cách dịch nằm trên editor. Hybrid có mục Nửa đầu / Nửa sau / Nâng cao; System Prompt và nhiệt độ ở Nâng cao. Editor mở rộng được, có nút chèn biến, chặn chèn vượt8.000 ký tự. Nút Lưu cố định cuối bảng, có trạng thái chưa lưu và Lưu và tiếp tục khi lỗi. Escape đóng và trả focus. Panel cao theo viewport; chữ nhập mobile16px, nút44px; panel nằm trên banner lỗi để không che Lưu.

Name, thử prompt và keys thu gọn. Keys chỉ tải/poll khi mở mục, ngừng khi đóng hoặc trang ẩn, không tạo polling chồng lấn. Dịch xong hiện model5giây; không thêm banner prewarm thành công trùng badge.

Checkpoint ghi xuống máy vẫn là best effort: trong phiên giữ phần hoàn tất, sau reload dùng lại phần đã ghi thành công; không hứa lưu được khi ghi cache lỗi. Không thay source/revision/bytes/SHA/EPUB IDs, secrets/lease/key policy/provider, schema đồng bộ hoặc mốc AI hoàn tất cao nhất.

## Bằng chứng

Reviewer độc lập theo cấu hình user gpt-6.1-sol/high:38unit PASS, trong đó11regression mới. Ba race UI độc lập đã được chạy trên Chromium+Android-layout. Reviewer xác nhận không còn finding trong phần đã kiểm; các ca sửa gồm offline khi cooldown, cooldown qua retry hybrid/EPUB, Save target cũ, Stop trước lookup và chèn biến vượt giới hạn.

Logs giữ tại `.dsh-tmp/ai-retry-ux/`. Android-layout là mô phỏng bố cục, chưa phải kiểm điện thoại Android thật. Các lượt fail được giữ; tách lỗi fixture về notice/quota với lỗi thật banner che nút Lưu đã sửa.

Benchmark pilot dùng dữ liệu tổng hợp, cùng backend cho hai client trước/sau, không cloud writes hoặc cache truyện người dùng. Tốc độ provider biến động; báo số mẫu hoàn tất và thời gian đo được, không dùng mẫu nhỏ để cam kết tỷ lệ thành công dài hạn. Xem script `scripts/benchmark-ai-retry-ux.mjs` và báo cáo pilot sau khi chạy.

## Nghiệm thu phát hành

Root full cuối **123files/1.629unit PASS**, build PASS (full-unit-mixed-1.log/build-mixed-final.log). **74ca E2E riêng biệt** Chrome+Android-layout có bằng chứng PASS qua các lượt: nhóm74 ban đầu66PASS; nhóm sửa32 có30PASS và2fixture về cache; lượt cuối20PASS phủ hết ca còn thiếu. Sửa focus sau Save và opener đã biến mất có6PASS rồi2PASS xác minh bổ sung. Không tuyên bố có một lượt sạch74/74 duy nhất. Các ca race reviewer và ca giữ nguồn/EPUB IDs/mốc đọc được bao phủ trong các nhóm này.

Pages cuối **7cf59039/master**, bundle **index-BL_x50EB.js**; AIWorker **777fc28f-990c-45cf-b871-bdcdb49ca1ad**. Dry-run guard ban đầu PASS, deploy cuối compile thành công và API thật PASS; không đổi compatibility/deps/bindings/schema. Production smoke tổng hợp cô lập cloud **PASS**: nửa đầu1call, nửa sau lỗi rồi đổiLite2calls tổng; source giữ, bản dở không cập nhật tiến độ, bản đủ cập nhật, keys đóng không tải, Save+continue và Escape/focus đúng. CanonicalHTML khớp dist. Lượt đầu fixture3600ký tự cộng tiêu đề khiến nửa đầu chia2part, đã sửa fixture3200; các lượt tiếp phát hiện và sửa hai lỗi focus. Có một lần canonicalHTML chưa kịp cập nhật ngay sau deploy, đọc lại sau propagation khớp. Giữ mọi log fail.

So sánh lỗi cấu hình giả lập trên hai bộ mã: trước3request/3.199ms, sau1request/4ms; cùng lỗi HTTP400, cùng một model. Đây là phép thử local, không phải latencyGoogle. `pilot-fault.json` và script `benchmark-ai-retry-ux-fault.mjs` lưu kịch bản tái lập.

Pilot API thật ban đầu:12/12 trảSTOP,36request;8chương ngắn/vừa không còn chữ Hán hoặc escape xuống dòng. Cả4lần chương dài đều còn đoạn nguồn (166–692chữ Hán), ở cả client trước và sau; không tính các lượt này là bản dịch đạt. Client trước/sau trung vị toàn chương20.675/22.635ms; không có bằng chứng tăng tốc bình thường. Mỗi lượt dừng100giây, toàn phép thử15phút/96request; không cloud writes. Lỗi chất lượng này dẫn đến guard nêu trên, kiểm thử độc lập và follow-up giới hạn riêng tại `scripts/benchmark-ai-source-copy.mjs`.


## Guard cuối và kiểm chứng API thật

Reviewer độc lập chấp nhận,14/14regression PASS: JSON escapes/IDs, Unicode, Name ngoại lệ, cache cũ miss không xóa, dùng lại sibling/model pin, cancel/late response, EPUB ghép node và client boundary. Hai lỗ hổng reviewer phát hiện (thiếu check sau ghép EPUB và thiếu check trực tiếp client) đã sửa. Full root123files/1629PASS;4test bổ sung mixed-Han được chạy trong14ca reviewer sau full. Lượt full đầu có mock cố tình echo tiếng Trung và browser hook quá thời gian khi chạy quá nhiều worker; sửa mock sang Latin giữ length/order/ID/timing, giới hạn4workers, không nới invariant. Log fail giữ nguyên.

Nhóm trình duyệt34ca:32PASS đầu;2ca Chromium còn lại được xác minh lại cùng Android-layout, repeat3,12/12PASS. Một assertion cache được đổi sang chờ commit trước reload vì preview có thể hiện trước ghi cache; một ca hybrid chạm timeout60giây ở thao tác cuối khi máy tải cao. Sau mixed-Han,6/6ca liên quan guard/EPUB pair PASS. Không tuyên bố một lượt sạch34/34 duy nhất. Production smoke cuối PASS/canonicalHTML khớp dist; không cloud writes, không sửa dữ liệu người dùng.

Sau guard đoạn dài,2lượt cùng nguồn7180ký tự:75.586ms/10request/0Han;90.188ms/7request/50Han. Lượt thứ hai vẫn còn cụm ngắn trộn câu Việt, nên chưa đạt tiêu chí sạch Han và script trảexit1. Giữ pilot-quality.json và cả hai bản dịch; từ đó thêm nhánh mixed-Han. Helper cuối đọc lại đúng hai mẫu: chấp nhận mẫu0Han và từ chối mẫu50Han.

Sau guard mixed-Han,1lượt API thật mới cùng nguồn/mẫu/model/Name: **51.788ms, phần đầu17.419ms,7request client,0Han,0escape xuống dòng**, EXIT0 (`pilot-mixed.json`, `pilot-mixed-run.log`). Có1lượt bị từ chối do ai_untranslated_result; bộ chia phục hồi trả6response hợp lệ, không retry bản lỗi để công nhận đủ. Dịch đầu bằng Gemini2.5Flash, phần sau3.5Flash-Lite. Đối chiếu mẫu đầu/cuối giữ Name, phủ định/cảnh báo và kết truyện;14lần cảnh mở/giải thích chuông đều hiện. Không dùng việc hết Han để khẳng định mọi câu đúng nghĩa hoặc mọi chương đều thành công.

Toàn bộ3pha đã dùng60request client (36+17+7), dữ liệu tổng hợp; pha follow-up có trần24request/150giây mỗi job/360giây toàn pha. Không gộp các pha thành cùng phép đo tốc độ: không có bằng chứng cải thiện latency bình thường; hiệu quả đã xác minh là tránh retry sai, giữ phần tốt và phục hồi đúng lỗi chất lượng trước khi cập nhật cache/mốc đọc. Chưa kiểm Android hardware trong tác vụ này.
