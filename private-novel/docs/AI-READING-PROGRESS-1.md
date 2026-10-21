# Tiến trình = chương AI hoàn tất mới nhất — 15/10/2026

Quyết định người dùng: tính cả chương dịch sẵn ở nền, dù chưa mở đọc. Trong mỗi truyện, chương AI hoàn tất có thứ tự cao nhất là mốc tiếp tục; mở lại cache/chương cũ, cuộn RAW/Convert hoặc con trỏ nghe cũ không kéo mốc lùi. Trước khi có mốc AI, tiến trình đọc thường vẫn hoạt động như trước.

Mốc lưu trong `Progress` hiện có, thêm `mode:'ai'`, `paragraph:0`, `offset:0`. Không lưu offset bản dịch vào nguồn gốc vì hai văn bản có độ dài khác nhau. Không nâng version IndexedDB. Khi bấm Đọc tiếp không chỉ định chương, Reader ưu tiên mốc AI hơn con trỏ nghe và mở chế độ AI; chọn chương cụ thể vẫn được tôn trọng. Nhận đồng bộ không làm trang đang đọc tự nhảy, không tự phát TTS.

Reader chỉ ghi sau khi cả chương trả thành công, gồm foreground, prewarm chương sau và Convert→AI prewarm. Prefix hybrid, phần con, lỗi/hủy chưa tính. Ghi nguyên tử kiểm book ready, đúng chapter/book/revision/text, tombstone cloud và callback còn hiệu lực. Cache/chương cũ không cập nhật timestamp mốc hiện tại; giữ nguyên nguồn/bytes/EPUB nodes và cấu trúc sách.

Đồng bộ qua `/api/state` hiện có: lưu local trước, debounce 1,2 giây; online/focus và chu kỳ 30 giây tiếp tục đồng bộ. Mất mạng giữ mốc trên máy. Hai máy cùng tiến thêm chương AI tự chọn chương cao hơn theo dữ liệu mới nhất trong transaction rồi gửi CAS; không đổi cách xử lý conflict của tiến trình thường/tombstone. Revision/ID không khớp vẫn giữ conflict để tránh áp sai nguồn.

Đây là **đồng bộ mốc chương**, không đồng bộ nội dung cache bản dịch AI. Máy nhận cần có cùng truyện/chương; nếu chưa có bản dịch trong cache thì khi mở AI vẫn cần dịch. Không tự quét lại cache lịch sử hay tái nhập truyện cũ; mốc được ghi khi luồng AI hiện tại hoàn tất hoặc trả cache hợp lệ.

Phạm vi: `reading-progress.ts`, `domain.ts`, `shared-state-schema.ts`, `shared-state-sync.ts`, Reader và test tương ứng. Review độc lập cấu hình gpt-6.1-sol/high: **77 regression PASS**, gồm 15 ca progress/interleaving/CAS409/cancel/rollback/EPUB. Full **120 file / 1.601 PASS**, build PASS. E2E bản cuối 24/26 PASS, hai timeout Chrome; ca hai máy sau dùng DOMContentLoaded kiểm lại **3/3 PASS**, ca hybrid Chrome có sẵn **2/3 PASS, 1 cold-start timeout**. Các ca tiến trình mới đều có bằng chứng PASS trên Chrome/Android-layout; không gọi đó là Android thật. Giữ log fail, không đổi timeout sản phẩm để che lỗi.

Production **e97dedcd/master**, bundle **index-6nJOQXxD.js**, Worker không đổi. Smoke qua địa chỉ chính PASS: chương chưa xong không tiến mốc, prewarm hoàn tất cập nhật mốc nhưng không nhảy trang, payload đồng bộ giữ modeAI, Đọc tiếp đúng chương và không dịch lại cache. Dữ liệu tổng hợp/context cô lập, AI và cloud đều giả lập; không ghi vào truyện thật. Hai phiên thiết bị được kiểm trong E2E, không kết luận đã thử mạng/điện thoại thật.

Log `.dsh-tmp/ai-reading-progress/`, review `.dsh-tmp/chapter-runtime/ai-progress-independent-review-interleavings.log`; script `smoke-ai-reading-progress-production.mjs`.
