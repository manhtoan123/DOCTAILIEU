# Giữ chương AI hoàn tất khi đổi model — 02/11/2026

## Hành vi

- Đổi Auto/Fixed hoặc model ưu tiên/cố định không yêu cầu dịch lại chương đã hoàn tất, gồm chương đã prewarm. Giữ nguyên chữ, model thực gọi, execution, text map và thông tin chia phần của kết quả cũ.
- Chương chưa có bản hoàn tất dùng lựa chọn mới. Công việc hiện tại vẫn theo snapshot Reader đã có; không đổi model giữa những phần của một công việc đang chạy.
- Dùng lại chỉ khi book/chapter/source text/revision, prompt, Names liên quan, nhiệt độ và các tùy chọn ngoài model vẫn khớp. Không áp dụng chính sách này cho hybrid/continuation hoặc cache từng phần.
- Không sửa bản dịch cũ hay chép nó thành kết quả mới mang tên model vừa chọn. Đọc lại chính bản hoàn tất cũ; UI vẫn ghi model đã dịch.

## Cách làm và nguồn tham khảo

Tham khảo [TanStack Query — Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys): identity phải giữ các biến ảnh hưởng nội dung. Áp dụng bằng một đường đọc **whole completed cache** riêng cho Reader, không đổi key của request đang chạy hoặc cache từng phần. Không thêm dependency.

`readCompletedAiReadingCache` tái tạo các key model/mode hữu hạn từ allowlist, gồm fallback hiện tại/rỗng/không khai báo/danh sách khuyến nghị cũ, đối chiếu digest và xác thực kết quả theo cấu hình cũ; vì vậy cache đã có không cần migration. Các guard book ready/ownership/chapter visible/revision/text và transaction/cancellation giữ nguyên. `readAiReadingCache` thông thường và read/write part vẫn dùng identity chính xác.

RAM giữ thêm tối đa hai bản hoàn tất (chương hiện tại/chương sau) qua `retain()` khi đổi lựa chọn, kể cả trường hợp ghi cache tùy chọn thất bại. `clear()` xóa bộ nhớ này. EPUB/PDF/DOCX vẫn giải mã JSON đủ các node trước khi nhận cache; không đổi iframe, TTS, cursor, provider, key lease hay fan-out.

## Kiểm tra và giới hạn

- Build cuối TypeScript client/server + Vite exit0; log `.dsh-tmp/ai-completed-reuse-build-final.log`, bundle `index-Dr0dmb_b.js`.
- Không viết/chạy test theo yêu cầu người dùng; chưa xác minh thao tác thật trên Android, AI upstream hoặc nghe sách. Không gửi nội dung truyện để thử.
- Cache vẫn hữu hạn 100 record/32MiB dùng chung whole/parts. Bản đã bị eviction/xóa cache hoặc chưa ghi thành công không được bảo đảm sau reload. RAM chỉ giữ hai bản trong phiên Reader.
- Cache lịch sử dùng danh sách fallback tùy biến không còn biết cấu hình có thể không khớp; không đoán cấu hình từ digest. Reader hiện dùng fallbackModels rỗng và chế độ Auto/Fixed riêng.
- Review độc lập read-only cuối đã đạt; sửa hai finding về cache fallback lịch sử và metadata chia phần trong RAM. Reviewer không chạy test/runtime.
- Pages `07f7b4e5`, asset `index-Dr0dmb_b.js` đã deploy exit0. AI Worker/D1/schema không đổi. Log `.dsh-tmp/ai-completed-reuse-deploy.log`; rollback Pages `ca9b96e6`.
- GET `/`, `/r/10001/1500` và asset đều HTTP200, HTML khớp bundle mới; `.dsh-tmp/ai-completed-reuse-release.json`. Chỉ xác minh phát hành, không thay thế kiểm tra tương tác/cache/AI/TTS thật.
