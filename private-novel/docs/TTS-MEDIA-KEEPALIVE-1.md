# Thử giữ phiên nghe nền

Hiện tại: đã khôi phục giữ phiên bằng Blob tạo tại máy sau hồi quy MSE; xem [bản khôi phục](TTS-PLAYBACK-RECOVERY-1.md). Các hướng dẫn/kết quả file HTTP bên dưới là lịch sử thử trước đó.

Yêu cầu người dùng 17/10/2026: thử cơ chế audio nền sau khi Android không hiện thanh điều khiển ở màn hình khóa. Phạm vi/tài nguyên: [M0](TTS-MEDIA-KEEPALIVE-M0.md).

## Cách thử trên điện thoại

1. Tải lại web, bắt đầu nghe truyện như thường lệ.
2. Cài đặt đọc truyện → Nghe sách → bật **Giữ phiên nghe nền (thử nghiệm)**.
3. Chờ trạng thái audio nền đang phát rồi khóa màn hình khoảng một phút. Kiểm tra có thanh điều khiển nghe và tiếng còn giật/ngắt không.
4. Tắt lựa chọn để đối chiếu trên cùng điện thoại/trình duyệt/truyện/tốc độ. Ghi riêng hai kết quả: thanh điều khiển và độ liền mạch âm thanh.

Mặc định tắt; lựa chọn chỉ lưu trên thiết bị đang dùng, không đồng bộ. Reload không tự phát. Trạng thái “Đang duy trì phiên nghe nền” xác nhận audio nền phát được, không xác nhận Android đã cấp audio focus hoặc đã tiết kiệm pin.

Nếu hệ điều hành hiện thanh thời lượng 10s, đó có thể là thời lượng audio nền; chưa phải đồng hồ/seek toàn chương. Phép thử này tập trung vào điều khiển phát/tạm dừng và độ liền mạch khi khóa màn hình.

## Cơ chế

Tự tạo WAV im lặng 10s, mono24kHz/16bit, 480044bytes bằng `scripts/generate-tts-keepalive.mjs`; asset cùng origin `/audio/tts-media-keepalive.wav`. Không sao chép media/mã từ D hoặc tải file Github. Player truyện giữ nguyên; khi bật có thêm tối đa một native Audio loop/volume0.01. Audio nền chỉ bắt đầu khi nghe hoặc bật lựa chọn lúc đang nghe; duy trì qua các câu, tạm dừng khi pause/lỗi, giải phóng src khi Stop/tắt/unmount/kết thúc chương. Callback cũ không hồi sinh hoặc phá lần resume mới. Native autoplay/asset lỗi có trạng thái riêng, không chặn TTS.

Tham khảo ý tưởng từ `D:/linh tinh/tm/truyen/Sangtacviet/103.82.20.93/stv.tts.v2.min.js:2554–2631` (read-only). Chromium phân loại duration>5s persistent là cơ sở thử nghiệm; không bảo đảm bản trình duyệt/OS trên máy người dùng áp dụng giống vậy hoặc audio im lặng luôn giữ được focus. Không xin mic, Wake Lock, thêm provider hay sửa nguồn/cursor/schema. Gateway vẫn tối đa ba request, một Audio truyện; audio nền không đưa nội dung truyện ra ngoài.

## Kiểm chứng và giới hạn

Unit: asset zero PCM/duration; mặc định off; local preference/storage denied; pause/stop; autoplay/source failure; promise cũ và thế hệ mới; TTS tiếp tục khi audio nền bị chặn. E2E dùng WAV và HTMLAudioElement thật để kiểm duration, vòng lặp 10s, pause/resume/disable; mock gateway/TTS và dữ liệu truyện tổng hợp. Có ca blocked/reload không autoplay và lỗi mạng giữ cursor; desktop và Android layout. Production smoke script `scripts/smoke-tts-keepalive-production.mjs` cô lập cloud, giữ nguyên nguồn.

Log `.dsh-tmp/tts-keepalive-*`. Lượt unit đầu lỗi fixture dùng lại một Response body, đã sửa trả body mới mỗi request. Lượt E2E đầu điều hướng timeout; lượt sau fixture chặn nhầm gateway bằng glob API, đã giới hạn đúng origin. Không đổi timeout/deps để che lỗi. Kết quả cuối/deployment ghi HANDOFF-LOG. Chưa có thử Android khóa màn thật, đo pin/RAM hay bằng chứng đã chữa hết giật tiếng.

Kết quả cuối 17/10/2026: 72 unit TTS cũ và 8 unit helper đạt; build đạt; 36/36 E2E desktop/Android layout đạt, 6/6 lượt lặp race đạt (gồm unmount giữ checkpoint). Production smoke đạt với native WAV thật 10s/vòng lặp/pause-resume/disable-release, một carrier, reload không autoplay, nguồn giữ nguyên; TTS mock và cloud cô lập. Đã triển khai Pages8498dc2f/master, bundle index-BxlQfKuL.js, AIWorker không đổi. Report: .dsh-tmp/tts-keepalive-production/report.json; ảnh panel.png cùng thư mục. Chưa có kết quả khóa màn Android thật.

Phản hồi người dùng 17/10/2026 13:11: sau khi nhận hướng dẫn thử trên điện thoại Android, người dùng xác nhận 'có tác dụng'. Đây là bằng chứng trải nghiệm thực tế do người dùng báo lại; chưa tách riêng kết quả thanh điều khiển màn hình khóa/độ ngắt tiếng, chưa đo pin hoặc xác minh audio focus. Giữ chế độ opt-in hiện tại.
