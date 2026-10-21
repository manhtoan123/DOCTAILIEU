# Name kèm ảnh — 14/10/2026

Yêu cầu: hỗ trợ cú pháp STV `$chữ Hán=[i]URL ảnh[/]Tên Việt`, hiển thị ảnh cạnh Name trong Convert và Dịch AI, cho TXT và EPUB. Tham khảo attachment `ad5469a6-214c-4f6d-88f9-091d3bc531fc/Pasted text.txt`: 820 Name ảnh, tất cả HTTPS PNG tại archives.bulbagarden.net; không tự nhập bộ Name này vào truyện người dùng.

## Phạm vi/invariant

- Dùng textarea Name riêng hiện có và nút Lưu. Giữ nguyên chuỗi/key trong DB, cloud, backup; không migration, tải/proxy/lưu nhị phân ảnh. Chỉ khi Convert/gửi AI mới bỏ tiền tố `$` đứng trước chữ Hán.
- Chỉ hỗ trợ URL HTTPS tại `archives.bulbagarden.net/media/upload/`, PNG/JPG/WebP, không credentials, query/hash, port khác mặc định hoặc ký tự điều khiển. Revalidate ở cache và từng sink React/EPUB. Parent CSP chỉ thêm host này vào img-src; connect/script/nonce/sandbox/message-source không mở thêm.
- Convert token chứa caption thuần và metadata ảnh riêng; cache semantics tăng lên 2. AI request chỉ nhận caption, không nhận markup/URL; giao diện gắn ảnh tại caption trùng nguyên từ (không đổi chữ AI). Chỉ chọn Name xuất hiện trong nguồn chương; tối đa 256 quy tắc ảnh AI và 1.000 lần hiển thị/chương. Ảnh không tải được thì ẩn, tên vẫn đọc được. Caption bị đổi bởi AI sẽ không gắn ảnh nhầm.
- TTS và tọa độ chọn từ/highlight chỉ dựa trên text cũ. Ảnh alt rỗng, không thêm chữ. EPUB bọc node gốc trước khi chia, giữ data-epub-node-start; loại marker giả không phân biệt hoa/thường, rewrite CSS/archive URLs trước khi thêm ảnh tin cậy, chặn URL dạng chuỗi image-set/custom properties. Bytes/SHA tệp EPUB gốc giữ nguyên.

## Nghiệm thu

- Unit: parser/unsafe URL/malformed fallback/priority/caption/coverage/boundary/budget/cache metadata; independent native Chromium test với CSP thật, marker STYLE/data-* hoa/thường, CSS cùng host được phép và offset highlight.
- E2E: lưu Name STV qua UI, TXT Convert/AI/WordPopup/reload/TTS request thuần; ảnh lỗi/HTML-looking caption inert; EPUB nhập tổng hợp, Convert/AI/ảnh/chọn từ/highlight/CSP/source CSS giả.
- Root full test + build + E2E liên quan; deploy Pages, smoke context độc lập chặn cloud, AI giả lập, tải ảnh Bulbagarden thật. Android chỉ viewport, không thiết bị thật; không gọi Gemini thật hoặc nghe 30 phút cho thay đổi này.

Kết quả: full 101 files/1.375 tests + build index-cZEp5Bh3 PASS; UI liên quan đã qua, ca EPUB từng flaky lặp 3 lần mỗi layout (6 PASS), E2E EPUB cũ 2 PASS/2 skip. Reviewer 173 unit + 9 native browser ban đầu, final code review không finding; root full chạy spec C0/CSS tăng cường. Pages a0e925c4/master; production real Bulbagarden TXT/EPUB Convert+AI PASS (AI mock2 request/cloud writes0). Fix ảnh EPUB: gán src sau listeners, chỉ lỗi thực mới ẩn; commit HTML/key nonce cùng state để tạo context mới khi tài liệu đổi. Log fail/recheck giữ trong .dsh-tmp/name-images/.
