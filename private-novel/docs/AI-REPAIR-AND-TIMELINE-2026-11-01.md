# Sửa Auto và lịch sử lượt gọi model — 01/11/2026

## Phía client

- Capacity hai key từ chương trước chỉ là gợi ý lịch chạy. Auto chưa có phần được chấp nhận bắt đầu tuần tự, không pin model từ capacity. Sau phần thành công đầu tiên mới cho phép mở hai phần đồng thời; checkpoint đã có giữ model được pin. Fixed/singleton vẫn có thể dùng capacity ngay. Áp dụng cho TXT và EPUB; giữ tối đa hai lease và không trộn model trong chương.
- `ai_provider_unavailable` là lỗi riêng khi provider không còn key khả dụng. Auto cho phép chuyển sang model tiếp theo; Fixed dừng với hành động kiểm tra key. Không retry giống hệt lỗi này, không tự lên lịch phục hồi kiểu lỗi mạng. EPUB không chia nhỏ nguồn để thử lại provider đã hết key.
- Lỗi chưa hoàn tất, không có lịch chờ tương lai và mạng đang có: hiển thị “Chưa hoàn tất — cần thử lại”. Chỉ hiện đếm ngược khi thực sự có `retryAt`/`waitUntil`; lỗi cấu hình vẫn hiện cần sửa cấu hình, Stop vẫn hiện đã dừng.
- Hai dòng model của chương hiện tại/chương sau có mục mở rộng “Lịch sử lượt gọi model”. Mỗi dòng ghi model, lượt request, phần, giờ bắt đầu, giờ kết thúc, thời lượng, trạng thái và mã lỗi/HTTP an toàn. Các retry được ghi thành dòng riêng.
- Dùng `AiRunMetrics` và `workId` hiện có, nối qua budget thuộc đúng cache key của từng phiên/chương; không đọc nhật ký toàn cục từ server, không thêm bảng/schema/call mạng. Trạng thái được đẩy khi request bắt đầu/kết thúc; đồng hồ một giây chỉ chạy khi mục lịch sử đang mở và có request chưa kết thúc.
- Thời lượng kết thúc đo bằng đồng hồ monotonic trong client; thời lượng đang chạy là số tạm tính từ giờ bắt đầu hiển thị. Khi Stop/deadline kết thúc công việc, request còn chạy được đánh dấu hủy/lỗi và ngừng đếm. Phản hồi bị kiểm tra nội dung/ánh xạ từ chối được ghi lỗi, không coi là phần đã chấp nhận.
- Lịch sử giới hạn 128 request mỗi phiên và 128 phiên trong RAM; không lưu vào cache truyện hay DB, không đưa nguồn/prompt/Name/key/raw provider response vào lịch sử. Reload/cache cũ/phiên chưa được quan sát hiển thị chưa có lịch sử; không dựng lại giờ giả. Mỗi dòng là request client, không phải từng lần server đổi key trong request.
- Mô tả thinking trong PromptFields dùng helper chung để thống nhất Groq/Gemma với metadata server.

## Tham khảo

Đã đọc [LiteLLM: Fallbacks, retries, timeouts, cooldowns](https://docs.litellm.ai/docs/proxy/reliability). Áp dụng ý tưởng tách retry của một model khỏi failover sang model khác; điều chỉnh theo ràng buộc app: Fixed giữ một model, Auto chuyển tuần tự trước khi pin kết quả, tối đa hai key/lease và giữ checkpoint. Không thêm LiteLLM/dependency/provider/hạ tầng. Tài liệu upstream không được coi là bằng chứng app đã chạy đúng.

## Kiểm tra và giới hạn

Theo yêu cầu trực tiếp của người dùng: không thêm test, không chạy test/E2E; phần client chỉ đọc code, kiểm diff và rà invariant. Agent chính thực hiện build, review độc lập và cập nhật kết quả tại đây. Chưa xác minh tương tác/render desktop/Android hoặc API upstream thật trong lượt này. Build không thay thế các bằng chứng đó.

Phần server, kết quả build/review và deployment: agent chính cập nhật sau tích hợp. Không sửa dữ liệu truyện, tiến độ hoặc cache cũ.


## Chốt tích hợp và triển khai

Build cuối exit0 (tsc client+server, Vite), asset index-hh6m9Xg6.js. Review độc lập đọc phạm vi server/client cuối, đóng các finding, gồm guard timer và mãhủy ai_cancelled; không còn blocker trong phạm vi. Worker69d97149, Pages69a5194b, không migration/schema/dependency/provider mới. GETrelease / HTTP200 /assets/index-hh6m9Xg6.js; /r/10001/1479 HTTP200 /assets/index-hh6m9Xg6.js. Logs .dsh-tmp/ai-repair-timeline-{build-final,worker-deploy,pages-deploy}.log và release.json. Không thêm/chạy test/E2E/render/AIupstream theo chỉ đạo tiết kiệmusage. Chưa chứng minh hiệu năng/chất lượngGemma mới hay giao diệnAndroid thật. Không dùng các testpass cũ làm bằng chứng tínhnăngnày. Lịch sử chỉRAM của phiên/lượt dịch mới, reload hoặc cache cũ có thể không có lịch sử.

Server chi tiết: [quota/provider/Gemma/SQL](AI-KEY-MODEL-EXCLUSION-2026-11-01.md#sửa-tiếp-sau-rà-soát-0111).
