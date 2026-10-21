# TTS không quay về đầu chương khi gián đoạn mạng

17/10/2026. Người dùng báo mất mạng giữa chừng làm TTS quay về đầu chương.

## Lỗi và sửa

- Nút nghe lúc `loading` trước đây gọi `stopReading()` với mặc định xóa cursor. Khi tải bị treo do mạng, thao tác trên nút này làm mất vị trí của chương. Nay gọi `player.pause()`: hủy request đang chờ, giữ danh sách đoạn/index/thời gian và checkpoint; nút ghi “Tạm dừng tải”.
- Sau `error`, Reader trước đây gọi `play()` để khởi tạo lại player từ cursor khớp hash nếu có. Nay gọi `resume()` trong phiên hiện có, dùng chính đoạn và media time đã giữ. `TikTokPlayer.resume()` nhận cả trạng thái `paused` và `error`; thế hệ request mới chặn phản hồi cũ, giữ một Audio và giới hạn ba request.
- “Dừng” riêng vẫn là kết thúc/xóa phiên theo hành vi đã có. Nguồn/prompt đổi vẫn invalidation như trước. Không đổi schema hay cách lưu cursor, provider, gateway, retry budget hoặc tự phát sau reload. Khi mạng có lại, người dùng bấm tiếp tục; lỗi không bị coi là hết chương.

## Kiểm chứng

- Hai regression mới trong `tests/tts-resume.test.ts` thất bại trước sửa: resume lỗi audio giữa đoạn (offset/media time) và mất mạng lặp lại ở đoạn thứ tư. Sau sửa, cả hai đạt và không phát lại ba đoạn đã xong.
- Targeted TTS: 72/72 đạt, bao gồm resource/cancellation/word boundaries/cursor/legacy offsets.
- E2E thêm mất mạng → reload không autoplay → tiếp tục đúng đoạn; request treo → tạm dừng giữ cursor → phản hồi cũ đến muộn → tiếp tục đúng đoạn → Stop xóa cursor. Chạy cả Desktop và Android layout.
- Kết quả: build đạt; toàn file TTS E2E 30/30 đạt, ca hủy request treo lặp ba lần trên mỗi bố cục 6/6 đạt. Không đổi schema/persistence nên chỉ chạy bộ kiểm tra TTS liên quan, không full suite hoặc review dữ liệu ngoài phạm vi.
- Production smoke: script `scripts/smoke-tts-network-production.mjs`, dữ liệu tổng hợp trong context riêng, AI/audio/gateway mock, cloud API bị chặn. Kiểm tra error/retry, loading cancel, reload và nguồn không đổi; không ghi cloud hay dùng truyện thật.

Log `.dsh-tmp/tts-network-*`; deployment/kết quả E2E/production cụ thể tại HANDOFF-LOG. Kiểm thử mạng mô phỏng trên Chromium, chưa thử mất sóng/khóa màn trên điện thoại Android thật.

Pages `03027eee/master`, bundle `index-BWMi8HHW.js` đã lên canonical. Production recheck đạt: lỗi mạng giữ offset95, hủy tải/reload giữ offset224, Stop xóa cursor, một Audio và nguồn không đổi. Report `.dsh-tmp/tts-network-production/report.json`. Lượt smoke đầu sai giả định chỉ số câu vì file nhập giữ tiêu đề trong nguồn; chỉnh fixture theo câu thực tế, không sửa runtime; log fail và recheck riêng được giữ.
