# AI: giới hạn chờ toàn chương — 14/10/2026

Người dùng báo màn hình giữ “Đang dịch bằng Gemini 2.5 Flash…” tại chương `b485d43e-700d-48e0-b30d-7443a8884576`, sách `0fef4fb3-7517-4b2c-94b8-5e02dee09a2c`. Qua giao diện thật, nguồn có 101 đoạn/2.788 ký tự và 5 Name khớp, không vượt giới hạn văn bản hay Name gửi API. Chuyển Bản gốc rồi thử Dịch AI đã hiện 117 đoạn dịch trước bản phát hành này. Không có trace HTTP của lượt bị kẹt; lần thử lại có thể dùng cache, nên không quy chắc nguyên nhân cho Gemini hoặc cache.

## Sửa đúng phạm vi

- `ai-job.ts`, `ai-reading.ts`: một budget gồm cache, cooldown, fallback và retry từng phần. TXT tối đa 240 giây/24 lần gọi translator thực tế; không đếm retry như một request. 240 giây cho phép bốn model ×40 giây cộng thời gian phục hồi; đây là giới hạn dừng tác vụ, không cam kết tốc độ provider.
- `epub-ai.ts`: budget toàn chương 600 giây/256 lần gọi thực tế, chung mọi batch/model/retry. Bỏ counter nhóm trùng. Cache nguyên chương cũng có timeout. `ai-complete.ts` nhận chế độ `none` cho nguồn có validator; lỗi output_limit không chia JSON thô, EPUB chỉ chia nhóm chứa ID nguyên vẹn.
- Cache read tối đa 2 giây/write 1 giây; signal con hủy riêng cache khi timeout. Hỏng/treo cache là miss hoặc bỏ ghi cache; chỉ bản dịch đủ mới vào bộ nhớ/hiển thị. Adapter native vẫn kiểm source/revision, signal và commit/rollback, không đổi format/schema.
- Deadline/send limit trả `ai_recovery_exhausted`, không phải AbortError và không retryAfter. Reader hiện lỗi/nút thử lại, xóa countdown cũ; manual retry cũng hủy countdown. Hủy/chuyển chế độ vẫn AbortError. Sau 10 giây, trạng thái dịch hiện số giây đã chờ.

Giữ model/key tuần tự, provider/Worker/secrets/auth, nguồn sách, Name lưu và cache complete-only. Không bổ sung cache dở, migration, key hoặc cloud feature. Hết budget không thể công nhận phần đã dịch như một chương đủ; thử lại có thể cần dịch lại toàn chương.

## Name riêng

Tệp người dùng 149.341 bytes, 1.238 mục hợp lệ/duy nhất (1.224 mục ảnh), không vượt giới hạn editor hiện tại. Giới hạn 500 Name của API chỉ áp dụng Name khớp nguồn trong từng request, caption sạch, không gửi URL ảnh. Giới hạn render ảnh 256 rule/1.000 lần xuất hiện trong một chương không cắt dữ liệu Name đã lưu. Không bỏ các giới hạn trong lượt sửa AI này.

## Nghiệm thu

Review độc lập Sol/high: 175 regression duy nhất PASS, không còn finding. Bốn phép chứng minh riêng gồm EPUB 257 node hợp lệ đạt đúng 256 sends tuần tự, late hash sau timeout không ghi, cancel không ghi đè fresh cache, và native cache write bị chặn bởi transaction khác vẫn hủy/rollback đúng. `tests/epub-ai-independent-review.test.ts` sửa ca hủy để chờ cache.read bắt đầu thật trước khi assert signal.

Root full: 103 files/1.390 tests PASS (`--maxWorkers=2`), build PASS. Lượt full đầu có 1 beforeAll browser-launch timeout trong bộ EPUB security không liên quan; 1.390 ca logic vẫn qua. Giữ `full-unit.log`, chạy lại ít workers, không nới timeout/dependency hoặc sửa assertions bảo mật.

E2E: 44/44 PASS desktop + Android-layout, gồm `ai-stall`, `ai-fallback`, `ai-prewarm-recovery`, `ai-persistent-cache`, `ai-reader`. Ca mới kiểm cache hash treo cả read/write, deadline hiển thị/manual retry/no auto-loop, cancel trước khi read bắt đầu, và EPUB manual retry không kế thừa lịch quota7200s. Android-layout là giả lập bố cục, không phải điện thoại Android thật.

Pages production master `9c52b027`, bundle `index-B8fzpjWn.js`; canonical HTML khớp dist. Worker `e7701ab5-c420-4acf-883b-03ec89efb626` không đổi. Phiên production cô lập: lưu đủ 1.238 Name, một HTTP Gemini2.5 thật200, server4.911ms/toàn lượt5.639ms, nguồn tổng hợp254 ký tự/bản dịch891 ký tự, bản gốc giữ nguyên; APIs cloud/state đều chặn trong context riêng. Không suy tốc độ mẫu ngắn này cho mọi chương. Lượt smoke đầu đã dịch200 nhưng harness đọc baseline trước khi raw chapter hydrate; giữ log, thêm await nội dung/so sánh paragraph, lượt sau PASS; không sửa product để né phép kiểm.

Tab người dùng đã tự chuyển sang chương `54a8045f-eb78-4714-83d9-165c7023db06`, có169 đoạn dịch và không banner. Không reload/navigate làm gián đoạn phiên đọc; bản mới được dùng khi người dùng tải lại trang. Chương lỗi ban đầu đã hiện117 đoạn trước deploy, không coi đó là fresh request của bản mới.

Logs/bằng chứng `.dsh-tmp/ai-reader-stall/`: `review.log` (fail timing assertion cũ), `review-negative.log`, `full-unit-final.log`, `build.log`, `e2e.log`, `deploy.log`, `production-real-ai.log` (baseline fail), `production-real-ai-final.log`, `production-real-ai.json`, `production-real-ai.png`, `chapter-retry-before.png`. Không lưu key hoặc payload thật của truyện người dùng. Gateway/Gemini vẫn có thể503/429/timeout; bản sửa ngăn chờ vô hạn và công nhận bản dở.
