# Nghe trước khi AI dịch hết chương — 02/11/2026

Người dùng xác nhận muốn nghe ngay trong lúc AI đang dịch, sau khi được giải thích khác biệt bản nháp streaming và phần đã kiểm tra. Đây là thay đổi so với quy tắc trước chỉ nghe phần đã được chấp nhận.

## Hành vi

- Nút Nghe truyện nhanh trên TXT không còn đợi whole chapter hoàn tất khi đã có `previewText`. Stream hiện chỉ công bố đoạn đã đóng bằng newline; phần đuôi còn dang dở chưa đưa vào TTS. Nếu chưa có đoạn, lần bấm Nghe giữ yêu cầu chờ rồi tự phát khi đoạn đầu xuất hiện.
- Player hiện có nghe văn bản sẵn có theo từng nhóm câu. Khi hết, Reader chờ nếu AI chưa xong; có thêm văn bản thì nối từ offset đã nghe. Không chuyển chương chỉ vì hết bản nháp.
- Theo chỉ đạo tiếp theo 02/11: AI retry/repair thay prefix không yêu cầu bấm Nghe lại. Audio đã đưa vào player được nghe hết; đến ranh giới hết audio, lấy số dòng có chữ/số đã nghe trong bản cũ và nối ở dòng cùng thứ tự tiếp theo của bản mới. Bỏ dòng trắng/chỉ dấu câu; dấu nháy/dấu câu cuối không làm phát lại đoạn đã nghe. Nếu bản mới chưa tới vị trí đó, giữ ý định nghe và tự chờ; không qua chương khi AI chưa xong.
- Khi prefix còn nguyên, tiếp tục dùng offset chính xác cũ. Khi bản dịch bị viết lại, khớp thứ tự dòng/đoạn là phép gần đúng; AI gộp/tách/đảo đoạn có thể làm vị trí tương ứng lệch. Không gọi AI thêm để căn chỉnh, không phát lại các đoạn đầu chỉ vì chữ đã đổi. Phần đã nghe từ draft có thể khác bản cuối.
- Success giữ preview đến lúc publish kết quả đã kiểm tra, gồm các sự kiện lease/release/progress chưa có accepted text, tránh khoảng rỗng giữa response và accepted progress gây dừng giả. Failure/start retry/abort chủ động xóa preview; metadata event không hồi sinh bản đã xóa.
- Draft không ghi whole/part AI cache hay cursor nghe bền vững. Chỉ nhận identity cuối khi hoàn tất và prefix còn khớp. Reload không tự phát; Stop vẫn hủy yêu cầu nghe/continuation.
- EPUB/PDF/DOCX vẫn chỉ nghe prefix đã kiểm tra node JSON, không đọc JSON đang dang dở. Không cần đợi cả chương khi đã có phần hợp lệ.

## Phạm vi và tham khảo

Chỉ đổi `Reader.tsx` (gating, guard, thông báo) và nhánh dọn preview thành công trong `ai-reading.ts`. Giữ gateway CapCut/TikTok, cơ chế tải audio theo nhóm câu, giới hạn request/lease/retry, cache, cursor, model và prompt hiện có. Không bật MSE/audio streaming thử nghiệm hoặc thêm provider/dependency.

Tham khảo [WHATWG Readable Streams](https://streams.spec.whatwg.org/#rs-class), [MDN ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream): dữ liệu về từng chunk và có kết thúc/hủy riêng. Áp dụng ranh giới giữa preview/accepted/abort; không coi một chunk là một câu hoàn tất. Tham khảo thêm [HTMLMediaElement ended](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/ended_event): nối ở ranh giới audio đã hết, không cắt audio đang phát khi nhận bản viết lại. Không đổi transport/dependency.

## Kiểm chứng và phát hành

- Không viết/chạy test theo yêu cầu người dùng. Review độc lập cuối read-only đạt sau sửa finding khoảng rỗng do lease-release publish. Build cuối TypeScript client/server + Vite exit0, log `.dsh-tmp/ai-stream-listen-build-final.log`, bundle `index-DnMdWwh9.js`.
- Chưa thử AI/TTS upstream thật, thao tác browser hoặc Android/chạy nền; chỉ build/review không chứng minh nghe liên tục trên thiết bị thật.
- Đã deploy Pages `67887d5e`/`index-DnMdWwh9.js` exit0; `.dsh-tmp/ai-stream-listen-deploy.log`. AI Worker `9f48a8f1`/schema0018 không đổi. Rollback Pages `07f7b4e5`.
- GET `/`, `/r/10011/63`, asset HTTP200 và HTML đúng bundle; `.dsh-tmp/ai-stream-listen-release.json`. Đây chỉ là xác minh phát hành, không phải kiểm chứng AI/TTS thực tế.

### Điều chỉnh tự nối khi bản dịch đổi

Code điều chỉnh: `ai-listen.ts` thêm `previousText` và ánh xạ thứ tự đoạn tại audio end; Reader bỏ guard dừng yêu cầu thao tác, truyền snapshot cũ cùng owner. Khi audio cũ còn chạy mà văn bản đã đổi, tạm ẩn highlight/theo cuộn để offset cũ không tô hoặc kéo nhầm đoạn mới; bật lại khi nối bản mới. Pause/Stop/cancellation vẫn theo player hiện có, không thêm nút, không tự phát sau reload. Lỗi AI chưa có nội dung mới vẫn là chờ, không tự thêm vòng gửi AI vô hạn.

Review độc lập cuối đạt sau sửa finding highlight/auto-follow dùng offset cũ. Build cuối TypeScript client/server + Vite exit0, asset `index-CKmCBHsG.js`; `.dsh-tmp/ai-stream-auto-continue-build-final.log`. Không test/runtime theo yêu cầu; chưa xác minh Android/AI/TTS thật. Deploy Pages `cb02963f` exit0; `.dsh-tmp/ai-stream-auto-continue-deploy.log`. Worker/schema không đổi; rollback Pages `67887d5e`.

GET root/reader/asset HTTP200 và đúng bundle cuối; `.dsh-tmp/ai-stream-auto-continue-release.json`. Chỉ kiểm chứng phát hành, không chứng minh căn chỉnh ngữ nghĩa hoặc nghe trên thiết bị thật.
