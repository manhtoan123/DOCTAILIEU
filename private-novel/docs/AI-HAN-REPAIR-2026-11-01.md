# Dịch riêng chữ Hán còn sót — 01/11/2026

## Hành vi

Client mới gửi `X-AI-Han-Repair: 1`. Sau khi AI trả kết quả STOP, server nhận diện các cụm Unicode `Script=Han` còn sót, loại trừ nhãn Name và markup. Chỉ gửi cụm đó cùng tối đa 100 ký tự ngữ cảnh mỗi bên để lấy bản thay thế; tiếng Việt và cấu trúc JSON/khóa EPUB giữ nguyên. Không áp dụng Convert máy móc cho cả câu.

Một lần sửa bổ sung cho mỗi request, cùng model, key, lease và tín hiệu hủy; không tăng số request đồng thời. Giới hạn 32 cụm/128 chữ Hán, bản thay thế 256 ký tự/cụm. Sai ánh xạ, còn Han, markup, ký tự điều khiển hoặc vượt giới hạn thì không nhận bản sửa. Cơ chế retry/chia phần hiện có xử lý lỗi; không xuất bản kết quả chưa đạt. Trần thời gian tổng 180 giây vẫn giữ. Stream có giai đoạn sửa riêng, không đẩy JSON sửa vào bản xem trước.

## Bảo toàn nghe sách

Sửa trước khi phần dịch được chấp nhận/lưu/đưa sang TTS. Không sửa hồi tố cache cũ hoặc đoạn đã chấp nhận, không đổi nguồn, khóa cache, hash/vị trí nghe, giọng hay tốc độ. Bản xem trước chưa được chấp nhận không trở thành nội dung nghe. Một phần mới có thể phải chờ thêm lượt sửa; không khẳng định độ trễ bằng không.

Metadata lưu bản AI trước sửa và kết quả từng phần, tách khỏi văn bản đọc. Audit tổng hợp giới hạn 128 bản/256 KiB và tuân trần cache cũ 1 MiB; có cờ khi tổng hợp bị rút gọn. Không đổi schema database.

## Tham khảo và điều chỉnh

- [MDN: Unicode property escapes](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape): dùng thuộc tính script thay cho một khoảng CJK hẹp.
- [googleapis/js-genai](https://github.com/googleapis/js-genai): tham khảo mô hình generation và phản hồi text/finish. Giữ HTTP/parser/lease hiện có, không thêm SDK/dependency/provider.

## Bằng chứng và giới hạn

Build đạt (tsc client/server và Vite), asset `index-CNgg7Tfa.js`; log `.dsh-tmp/ai-han-repair-build.log`. Review độc lập đã đóng các lỗi về lời thoại/Name/lease/token. Finding cuối về URL ảnh `[i]...[/]` có Han đã được root bảo vệ thêm trong planner; reviewer hết usage trước khi kiểm lại đúng thay đổi cuối này, nên phần kiểm lại độc lập chưa xác minh. Tìm kiếm audit có giới hạn; trường hợp quá phức tạp có thể bị từ chối an toàn. Không tạo/chạy test theo yêu cầu tiết kiệm usage. Chưa kiểm chứng lượt sửa với AI upstream hoặc nghe trên thiết bị thật; không thể bảo đảm mọi từ được dịch đúng nghĩa. Tính năng áp dụng bản dịch mới; bản cache cũ giữ nguyên để bảo toàn vị trí nghe.

Deploy: chưa deploy theo chỉ đạo mới của người dùng; online giữ Pages69a5194b / Worker69d97149.

## Deploy 01/11/2026 — bản tổng hợp đã phát hành
Pages **1ea43d81**, asset **index-DDP66Cv4.js**; AI Worker **9f48a8f1-a14c-4841-abec-6e2ab871aeb1**. Deploy exit0. GET production /, /phong-toi, /r/10019/1 và JS asset HTTP200, đúng asset mới; /epub-bridge-v2.js HTTP200 và SHA khớp file build. Logs .dsh-tmp/nov01-final-{worker-deploy,pages-deploy}.log và nov01-final-release.json. Không chạy test/E2E, gọi AI/TTS thật hoặc sửa/xóa dữ liệu người dùng. Bằng chứng GET xác nhận phát hành, không thay cho kiểm chứng thao tác thực tế. Các ghi chú chưa deploy phía trên mô tả trạng thái trước lần phát hành này.
