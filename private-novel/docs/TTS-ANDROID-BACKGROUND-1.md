# TTS Android khi tắt màn hình

Người dùng mô tả giật/ngắt giữa câu trên Android, nghe loa máy. Chưa biết trình duyệt/tốc độ; chưa đo RAM hoặc tái hiện trên điện thoại thật. Đây là giảm tải nền đã xác minh bằng code, chưa phải bằng chứng đã loại bỏ mọi khoảng ngắt khi khóa màn hình.

## Thay đổi

- `startSharedStateSync`: ngừng observer `liveQuery(captureSharedRecords)` khi trang hidden. Trước đây mỗi checkpoint TTS ghi vào settings có thể kích hoạt quét toàn bộ Names/settings/progress của thư viện dù phần gọi mạng đã bị chặn khi hidden.
- Visible: đăng ký lại một observer, chụp dữ liệu hiện hành và gọi đồng bộ ngay. Không giữ hàng đợi diff riêng nên thay đổi trong lúc hidden vẫn được lấy từ DB. Callback của observer cũ bị chặn bằng generation; debounce/observer/listener được dọn khi stop.
- Reader: dừng timer đo vị trí/cuộn theo câu khi hidden; khi visible theo lại ngay nếu không trong thời gian người dùng tự cuộn.
- Capture/sync đã bắt đầu được phép hoàn tất để giữ transaction/CAS. Không đổi schema, cách ghi checkpoint, Media Session, gateway, cắt câu hay cửa sổ tối đa ba audio request/single Audio.

## Xác minh

- `tests/shared-state-visibility.test.ts`: observer/debounce nghỉ khi hidden, ghi DB vẫn giữ, visible đọc được thay đổi, sự kiện lặp/cleanup không nhân subscription.
- Reviewer thêm regression real Dexie + mock Ledger vào `tests/shared-state-client-review.test.ts`: checkpoint và Name sửa khi hidden vẫn lưu local; visible tự upload qua CAS, không conflict.
- `e2e/tts-resume.spec.ts`: giả lập document hidden với audio/gateway mock; chuyển nhiều đoạn, checkpoint và một Audio vẫn hoạt động, không đo layout hidden; visible theo lại. Mock AI trả model đúng request để tương thích chính sách tự chọn model hiện hành.
- Desktop/Android layout và sự kiện hidden giả lập không mô phỏng OS Android khóa màn hình, battery policy, mạng di động hoặc độ trễ gateway thực. Cần người dùng nghe đối chiếu màn bật/tắt trên điện thoại để xác nhận tác dụng thực tế.

Kết quả lệnh và deployment ghi tại HANDOFF-LOG; log riêng `.dsh-tmp/tts-background-*`.

17/10/2026: visibility 3/3; reviewer real Dexie/Ledger 36/36. Full unit 1759/1760 và 5 suite lỗi timeout hook trình duyệt; chạy riêng 5 file bị ảnh hưởng `--maxWorkers=2` đạt 20/20. Build đạt khi dùng TEMP/TMP riêng (lượt đầu Windows Temp AccessDenied). E2E lượt đầu 24/26, hai ca editor bị toast che nút nghe; sửa fixture đóng thông báo trước thao tác. Chạy lại hai ca này cùng ca hidden 3 lượt: 8/12 đạt, bốn lượt đầu timeout điều hướng trang dev; ca editor desktop chạy riêng đạt. Tất cả 26 ca đã có lượt đạt; ca hidden 6/6 lượt lặp đạt. Không coi toàn bộ lệnh đầu là pass; giữ log fail và recheck riêng. Không đổi timeout test hoặc runtime để che lỗi.

Pages `b1752169/master`, bundle `index-C_t4U4Uk.js` đã lên canonical. Production smoke đạt với dữ liệu tổng hợp, gateway/AI/audio mock và cloud API bị cô lập: bốn lần chuyển đoạn hidden, không đo layout hidden, một Audio, cursor giữ, visible theo lại và nguồn không đổi. Báo cáo `.dsh-tmp/tts-background-production/report.json`; không có thử khóa màn Android thật.
