# Prewarm: capacity và chuyển model — 29/10/2026

## Sự cố được báo cáo và dữ liệu đã kiểm

Người dùng thấy prewarm gần như không chạy sau L1–L4. Đọc metadata thật `/api/ai/logs`, không đọc nội dung truyện/key: sáu request prewarm Gemini3.8Flash ghi nhận từ12:09 đến12:22 giờ Việt Nam, thuộc hai công việc (nguồn1936/2327UTF16), đều ai_timeout khoảng60,38s. Preparation+admission khoảng0,56–0,61s. Không có chunk nội dung; đa số không có headers, một request có503 rồi attempt tiếp theo không có headers. Hai lượt foreground cùng model hoàn tất34,4s/56,6s. Mẫu hữu hạn, không dùng làm xếp hạng hay suy ra toàn bộ lịch sử.

Điều này chứng minh có gửi prewarm, nhưng bị giới hạn hoạt động đầu tiên60s. Chưa xác định vì sao kết nối server→AI chưa phản hồi, không quy lỗi cho model/provider/key cụ thể ngoài những gì metadata chứng minh.

Đối chiếu L1–L4: metadata thêm qua header riêng, không vào JSON provider/cache identity; server ghi waitUntil, client outbox gửi nền; effect hiển thị chỉ cập nhật metrics. Timer first60s/idle30s/total180s và thứ tự model không đổi trong phần log. Không có bằng chứng L1–L4 gây các timeout này.

## Lỗi code tái hiện được và bản sửa

AiReadingSession và EpubAiSession ghi nhớ capacity hai key của model chương trước. Trước sửa, thông tin này pin model của chương mới ngay cả khi chỉ có một phần/chưa chấp nhận kết quả. Khi lỗi, lựa chọn chỉ còn model bị pin; model dự phòng trong cài đặt bị bỏ qua. Mẫu code này đã có trong HEAD trước thay đổi log; đối chứng bật/tắt observeMetrics đều tái hiện.

Bản sửa: chỉ dùng warm capacity để pin trước khi thực sự khởi chạy nhiều phần song song cùng model (splitParts và parts.length>1). Với một phần hoặc admission đầu chỉ một request, model dự phòng đã cấu hình vẫn được xét khi chưa có kết quả chấp nhận. Pin từ checkpoint/phần đã hoàn thành giữ nguyên; không trộn model giữa phần, giữ tối đa2key và ưu tiên foreground. Chương TXT<6000 vẫn nguyên chương; không thêm backoff/thời gian chờ/đổi provider/tăng timeout hay thứ tự model.

Lưu ý: đây là lỗi thật nhưng log lịch sử không có trạng thái warm/pin, nên chưa chứng minh sáu timeout thực tế đã đi qua nhánh pin này. Sửa fallback không bảo đảm upstream luôn trả trước60s. Chế độ splitParts=false chỉ khởi đầu một request; scheduler cũ vẫn có thể mở suất thứ hai sau bằng chứng parallel:2, không thay đổi ngoài phạm vi này.

## Nguồn tham khảo

[Mã nguồn LiteLLM run_async_fallback](https://github.com/BerriAI/litellm/blob/main/litellm/router_utils/fallback_event_handlers.py): phân biệt model đang thử với chuỗi fallback hợp lệ; thử mục tiếp theo khi có lỗi trong giới hạn. Áp dụng ý tưởng tách gợi ý scheduling khỏi khóa model đã chấp nhận. Không cài LiteLLM, không chép implementation/backoff/provider hoặc thêm dependency.

## Bằng chứng kiểm chứng

- `tests/ai-prewarm-capacity.test.ts`: trước sửa4fail/2pass (TXT), sau sửa10pass gồm loggingon/off, warmshort/spliton/off, cold baseline, EPUBmột nhóm, multipart admission1 fallback→pin accepted, multipart warm2 giữ model/không fallback trộn.
- `tests/ai-foreground-latency.test.ts`:18pass; cập nhật ca cũ vốn yêu cầu warm5999pin và3lần thử cùngmodel sang first→fallback. Ca chỉ cấu hình một model vẫn giữ retry2lần.
- Targeted7file88pass trước bổ sung hai ca và latency18; lượt riêng2file28pass, có overlap nên không cộng thành116. Các ca checkpoint/modelmix/cap2/shortwhole/Lite/promotion/log giữ được invariant.
- Build CapCut-v2/stamp `prewarm-fallback-2026-10-29` đạt. Preview4/4: desktop và Pixel7 mô phỏng, log capabilityv1/v2; hiện tạiA trả capacity2, prewarmA504→B giữ pending, mở chương tiếp nối đúng B đang chạy, tổng3request/fullsource không chia.
- Reviewer Sol High độc lập đọc phần log, sourcefix và test cuối không cònfinding. Không thực hiện benchmark upstream thật/Android thật hoặc gửi truyện người dùng cho AI để thử.
- Logs `.dsh-tmp/prewarm-diagnosis/{before,after,targeted,capacity-regression,build,preview,deploy,production}.log`. Lượt `after` EPUB2fail do fixture2000tạo2nhóm khi bật song song, đã sửa fixture1000để kiểm đúng một nhóm; không đổi source để né ca giữ model nhiều nhóm.

## Triển khai

Đã deploy **Pagesb154fed7 / index-Bm40eZq_.js**; aliasHTTP200 đúngbundle. Production E2E4/4 đạt (6,8s), logv1/v2 trên desktop/Pixel7 mô phỏng, API/IDB tổng hợp cô lập cloud thật. AI Worker93f96ede không đổi. Rollback Pagesda81181f. Không migration/commit/push/ghi thử cloud thật; production E2E dùng metadata/API tổng hợp cô lập cloud.

## Chờ thêm7giây theo yêu cầu
AI_STREAM_FIRST_MS dùng chung client/server đổi60.000→67.000ms. Giữ nguyên request đang chạy trong7giây thêm; không gửi lượt khác ở mốc60. Nhận hoạt động thì tiếp tục theo watchdog hiện có (idle30s,total180s); Dừng vẫn hủy ngay. Client giữ grace10s, nên watchdog dự phòng đầu tiên77s để server có thể trả lỗi67s. Đây là gia hạn tại web, không xác nhận trạng thái xử lý bên nhà cung cấp.
Tham khảo [MDN AbortSignal timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static): giới hạn thời gian hủy phía gọi không xác nhận tác vụ từ xa hoàn tất. Không thêm dependency. Test19+12=31 đạt, gồm firstchunk65s còn được nhận và silence67s timeout; build đạt. Logs .dsh-tmp/first67/; trạng thái deploy bổ sung sau.

Đã deploy Pagescc2c837f/index-b0nba4wr.js, AI Workerdd2d998b 100%; aliasHTTP200. Rollback Pagesb154fed7/AI93f96ede. Chưa kiểm chứng tốc độ upstream thật.
