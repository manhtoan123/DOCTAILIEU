# TTS không cắt giữa chữ — 16/10/2026

Nguyên nhân xác nhận: `sentences()` trước đây cắt cứng mỗi200 Unicode codepoints. Đúng đoạn người dùng gửi có ký tự thứ200 là `m` trong `mươi`; phần `ươi` nằm trong mục kế tiếp của bảng Câu.

Sửa `src/tts.ts`: chung một bộ chia200 cho đoạn thường và100 khi phục hồi gateway. Ưu tiên dấu phẩy/chấm phẩy/hai chấm ở nửa sau cửa sổ, rồi khoảng trắng. Chỉ hard-cut khi token đơn vượt giới hạn, giữ surrogate pairs/marks khi có thể. Không tăng giới hạn request, thay gateway, thêm provider hay concurrency. Các dấu phân tách/text gốc và UTF16 offsets được giữ nguyên. Đoạn báo lỗi nay ngắt tại `...thì không quen biết ta,`; `trước hai mươi tuổi` nằm trọn trong phần sau.

Mốc nghe cũ nằm giữa đoạn mới được đọc lại từ đầu đoạn chứa mốc, audioTime về0; không dùng thời gian phát của audio có nội dung khác. Mốc đúng đầu đoạn và mốc child100 còn khớp vẫn khôi phục như cũ. Không migration hoặc ghi lại truyện/cursor để đổi cấu trúc lưu trữ. Bản sửa câu vẫn chỉ tác động phiên nghe.

Kiểm chứng theo phạm vi logic nhỏ:70unit (word boundary/player/cursor/resume), build PASS;24E2E tts-resume desktop/Android-layout PASS, gồm chính đoạn báo lỗi, editor→gateway payload, Stop/pause/autonext/reload. Logs .dsh-tmp/tts-word-boundary-*. Không full suite/reviewer vì không đổi DB/import/auth/cloud và đã có regression offsets/resume đúng phạm vi.

Production Pagesbbc1a74b/master, bundle index-Cgj4laFM.js; AIWorker/schema/bindings giữ. scripts/smoke-tts-word-boundary-production.mjs PASS trên canonical:editor3rows→3payloads, trọn từ, source id/revision/text nguyên; mockAI/TTS, chặn cloudwrites. Report .dsh-tmp/tts-word-boundary/production.json, screenshot production.png. Không tuyên bố đã kiểm nghe bằng tai hoặc Android thật.
