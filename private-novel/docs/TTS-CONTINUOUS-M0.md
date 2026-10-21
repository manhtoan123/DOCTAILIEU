# TTS liên tục — phạm vi 17/10/2026

Người dùng yêu cầu thay audio nền im lặng bằng luồng giọng đọc thật. MediaSource audio/mpeg, sequence, một HTMLAudioElement/URL trong phiên; không thay src ở ranh giới câu/chương đã chuẩn bị. Trình duyệt không hỗ trợ dùng đường MP3 từng đoạn hiện có, không tự dùng file giữ phiên.

Giới hạn: tối đa ba request gateway đã duyệt; cửa sổ hiện tại + hai đoạn sau (có thể chứa đoạn đầu chương kế). Không thêm provider, schema, cloud hoặc lưu audio. SourceBuffer giữ đoạn hiện tại và tối đa hai đoạn phía trước, xóa dữ liệu đã nghe quá 30s, metadata chỉ giữ cửa sổ gần vị trí đọc. Cursor vẫn offset UTF16 + giây trong đoạn; map từ timeline MSE, pause/lỗi mạng giữ tại chỗ. Stop/unmount hủy request, callback cũ, buffer, URL, session. Chuyển chương chỉ giữ phiên nếu đúng văn bản đã chuẩn bị/giọng và tự động; chờ AI chưa có audio không giả phát im lặng.

Kiểm chứng: unit pipeline/cancellation/retry/offset/resource; regression TTS cũ; E2E MP3 hợp lệ bằng native MSE, media controls, câu/chương, mạng, pause/loading, reload/no autoplay, Stop/unmount. Build và Pages smoke cô lập cloud. Android layout không thay thế khóa màn Android thật. Không đổi DB/secrets nên mặc định một agent, không review dữ liệu/full suite.
