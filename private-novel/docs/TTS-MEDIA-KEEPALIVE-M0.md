# M0 — giữ phiên media Android

Hiện hành 18/10/2026: theo SETTINGS-UNIFIED-UX-PLAN, carrier tự bật khi người dùng Nghe/Tiếp tục; bỏ checkbox/cờ opt-in khỏi UI. Cờ0 cũ không tắt chức năng nữa. Mở trang/reload không autoplay. Ngân sách vẫn 1 voice + 1 carrier WAV Blob480044bytes/0HTTP, max3 request, cleanup/pause/error/Stop giữ nguyên. MSE không bật. Nội dung dưới đây ghi lại thiết kế thử nghiệm trước khi chuyển mặc định.

Cập nhật sau hồi quy MSE 17/10/2026: khôi phục tùy chọn/cờ thiết bị, thay file HTTP bằng WAV Blob tạo tại máy cùng định dạng 480044bytes. Tài nguyên vẫn tối đa một Audio phụ, pause/error/Stop/unmount và generation giữ nguyên; không request 4G riêng, không file public. [Bản khôi phục](TTS-PLAYBACK-RECOVERY-1.md).

Người dùng yêu cầu thử cơ chế audio nền sau khi báo không có điều khiển ở màn hình khóa. Tham khảo ý tưởng từ D:/linh tinh/tm/truyen/Sangtacviet/103.82.20.93/stv.tts.v2.min.js:2554–2631, chỉ đọc; không sao chép mã/file audio/provider.

Phạm vi: tùy chọn “Giữ phiên nghe nền (thử nghiệm)” trong Nghe sách, mặc định tắt, localStorage riêng thiết bị. Một audio PCM im lặng 10 giây tự tạo, cùng origin, loop và volume0.01; không Web Audio/mic/provider mới. Native duration>5 giây là giả thuyết về persistent focus, không bảo đảm Android/OS hiển thị điều khiển hoặc tiết kiệm pin.

Giới hạn: mặc định vẫn một Audio truyện; bật thử nghiệm thêm tối đa một Audio nền. Gateway max3/cắt từ/cursor/schema/CAS không đổi. WAV mono24kHz/16bit/10s=480044bytes, lazy load khi bật và bắt đầu nghe; không giữ cả chương. Không gửi truyện/dữ liệu đến tài nguyên ngoài. Dừng/tạm dừng/lỗi/unmount hủy audio nền; phản hồi play cũ không hồi sinh/không ngắt lần resume mới. Autoplay bị chặn/asset lỗi chỉ báo trạng thái thử nghiệm, TTS vẫn dùng được. Reload không tự phát. Tắt lựa chọn trả về đường phát hiện có.

Kiểm chứng: unit lifecycle/promise race/defaultoff/resource+asset; TTS regression; E2E thật cho WAV metadata/play/pause/stop, source/cursor/reload, kiểm tra hai bố cục. Build+Pages smoke synthetic cô lập cloud. Không full suite/reviewer dữ liệu mặc định vì không đổi schema/persistence truyện. Nghiệm thu thật: cùng Android/browser/chương, tắt/bật lựa chọn; so thanh điều khiển và giật tiếng khi khóa màn. Chưa đo hiệu quả pin/RAM/Android thật.
