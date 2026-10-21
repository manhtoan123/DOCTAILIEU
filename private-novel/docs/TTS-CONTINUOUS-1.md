# Nghe TTS bằng luồng MP3 liên tục

**Tạm dừng mặc định sau phản hồi Android 17/10/2026:** người dùng báo chuyển câu khựng nhiều hơn bản cũ. Reader đã trở lại MP3 từng đoạn + audio giữ phiên tạo tại máy; xem [bản khôi phục](TTS-PLAYBACK-RECOVERY-1.md). MSE chỉ được bật bằng tham số thứ tư true của TikTokPlayer trong bài thử prototype, không tự bật theo khả năng trình duyệt. Các kết quả dưới đây xác nhận logic/timeline, không xác nhận độ mượt nghe thật.

Theo yêu cầu 17/10/2026, thay thử nghiệm audio nền im lặng bằng chính giọng đọc thật. [Phạm vi M0](TTS-CONTINUOUS-M0.md). Trình duyệt hỗ trợ native MediaSource `audio/mpeg` dùng đường mới tự động; trình duyệt khác dùng player MP3 từng đoạn hiện có. Không có file giữ phiên, tùy chọn cũ hoặc audio phụ. Cờ localStorage thử nghiệm cũ không còn được đọc.

## Cách hoạt động

Một HTMLAudioElement và một URL MediaSource trong phiên; SourceBuffer ở chế độ sequence, thêm MP3 theo thứ tự, không thay src mỗi câu. Phát ngay khi đoạn đầu sẵn sàng; tối đa ba request (đoạn hiện tại và hai đoạn sau, có thể chứa đoạn đầu chương kế). Không tải cả chương trước khi bắt đầu. Luồng chưa kết thúc có duration vô hạn; khi hết chương không có chương sau chuẩn bị thì endOfStream và giải phóng. Chương sau đã chuẩn bị, cùng giọng và đúng văn bản thì giữ nguồn khi chuyển tự động, nối dữ liệu tiếp vào timeline hiện tại. Khoảng chuyển còn phụ thuộc React/gateway và lịch sự kiện của trình duyệt; chưa cam kết nối chính xác từng mẫu âm thanh.

MP3 encoder/output có thể để currentTime hơi trước buffered.end khi phát nhanh. Dùng sự kiện waiting/ended cùng khoảng dung sai theo tốc độ để nhận biết đuôi đã cạn, tránh chờ một đồng hồ không tiến nữa. Khi request sau lỗi, phần đã đệm tiếp tục đọc trước khi báo lỗi; không cắt đuôi đang chờ ở pipeline output. Callback/lần fetch cũ bị giới hạn bằng generation và AbortSignal.

Cursor vẫn offset UTF16 và giây trong đoạn MP3, không phải giây tính từ đầu luồng. Ánh xạ từ timeline MSE về đoạn hiện tại; lỗi mạng giữ đoạn chưa phát và không để đồng hồ đuôi đoạn trước kéo lùi cursor. Lỗi fetch khi đang khôi phục giữ cả thời gian đã lưu trong đoạn. Resume nối lại cùng nguồn khi còn dùng được; lỗi decoder/source khởi tạo lại đúng vị trí. Pause/lỗi/Stop dùng Media Session hiện có; Stop hoặc rời trang hủy fetch, tháo source, thu hồi URL và điều khiển media. Reload không tự phát.

SourceBuffer xóa phần đã nghe quá 30 giây; metadata giữ các đoạn gần vị trí, request/blob giữ cửa sổ ba đoạn, mỗi phản hồi có cap 2MiB hiện hành. Không lưu audio xuống DB/cloud; source/revision/hash truyện và schema cursor không đổi. Giọng đọc chỉ từ gateway Weilbyte đã được duyệt; không thêm provider hay key. Phần giữ phiên không phát sinh request 4G riêng.

## Kiểm chứng

Fixture tests/fixtures/tts-continuous.mp3 (86880 bytes) được tạo qua gateway hiện có từ câu thử tổng hợp tiếng Việt, không phải nội dung truyện riêng. Unit dùng fake buffer để kiểm chính xác race/resource/offset; browser dùng MP3 này với MediaSource và decoder thật, không fake phần tử Audio. Gateway/AI và cloud API được cô lập trong E2E/smoke. scripts/smoke-tts-continuous-production.mjs kiểm tra bundle đã triển khai và UI reader thực tế.

Các lượt fail giữ trong .dsh-tmp/tts-continuous-*. Máy chủ Vite watcher bị kẹt trước khi vào app; kiểm tra lại dùng cấu hình tạm riêng, watch:null và không tự dò dependency, không sửa cấu hình/dependency sản phẩm. Vì tắt watcher, khởi động lại server sau thay đổi runtime. Kiểm tra MP3 thật phát hiện load reset tốc độ và đồng hồ đuôi MP3 theo tốc độ; đã sửa trong player, không tăng timeout để che lỗi. Kết quả cuối được bổ sung sau kiểm chứng.

Android layout và trình duyệt Windows không xác nhận audio focus/thông báo/khóa màn của Android thật. Cần người dùng tải lại web, nghe và khóa màn so sánh với thử nghiệm 10s trước đó. Audio thật liên tục là cách để trình duyệt quản lý phiên media; website không trực tiếp cấp audio focus hệ điều hành.

Nguồn tham khảo: [định dạng MP3 cho MSE](https://www.w3.org/TR/mse-byte-stream-format-mpeg-audio/), [Media Session Chrome](https://web.dev/articles/media-session), [Chromium media session controller](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/media/session/media_session_controller.cc).

Kết quả cuối 17/10/2026 13:48: 72 unit TTS cũ + 12 unit mới đạt; build đạt (index-Dym5Wpsp.js). MSE native10/10 và trim native2/2 đạt trên desktop/Android layout; 30 ca legacy đã được phủ (29 đạt trong lượt gộp, ca AI-resume flaky đạt6/6 khi lặp); race network/chapter đạt12/12. Lượt gộp trước đó36/40, ba lỗi MSE đã sửa và giữ log; không gọi lượt đó thành công. Đã triển khai Pages77d893d0/master; production smoke recheck đạt native MP3/MSE/same source/relative cursor/reload/no silent request/source unchanged, AI/gateway mock/cloud cô lập. Lượt smoke đầu truy cập checkpoint null trước lần lưu đầu, script đã chờ URL và poll null-safe. Report/ảnh: .dsh-tmp/tts-continuous-production/. Chưa thử khóa màn Android thật.
