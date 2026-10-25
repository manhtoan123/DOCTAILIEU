# TTS tự phục hồi, bộ đệm và cache

Người dùng chọn ít thao tác, chỉ cung cấp cookie; không có mật khẩu/đăng nhập tự động. Không hứa phiên vĩnh viễn.

- Giữ cookie mới do endpoint CapCut hiện có cấp: D1 runtime riêng, AES-GCM dùng khóa dẫn xuất từ bootstrap secret, CAS chống ghi đè phản hồi muộn. Chỉ cookie phù hợp host/path HTTPS, có bounds; không log/echo/backup cookie. Secret mới tạo namespace mới. Không thêm provider/billing/tier.
- Phiên bị từ chối: giữ cursor, chờ kiểm tra lại có backoff; Stop/pause hủy chờ. Lỗi mạng/quota tự phục hồi; quyền/giọng/config phân loại riêng. Không tự phát sau reload.
- Cache audio cục bộ riêng khỏi DB truyện/cursor: tối đa32MiB/256đoạn/24giờ, MP3/hash kiểm trước dùng, LRU và timeout storage. Không đồng bộ/backup audio. Dọn/corrupt/denied cache chỉ tải lại audio, không sửa cursor. Không đổi ranh giới đoạn đã tạo hoặc mốc seek.
- Bộ đệm dựa thời lượng audio/thời gian tạo, window có giới hạn, tối đa3 request đang chạy. Giữ ưu tiên đoạn hiện tại, cancellation/ownership/voice-key.
- Kiểm: targeted, review độc lập auth/persistence, full/build; actual workerd+D1 với Set-Cookie tổng hợp; E2E native audio/cache/reload/retry/Stop; online chỉ câu/truyện tổng hợp cô lập cloud. Migration thêm bảng runtime, không sửa truyện/schema local chính. Chưa Android nền/độ bền dài hạn.

CapCut có quyền thu hồi phiên. Khi đó chỉ cookie cũ không thể tạo phiên mới; cần chủ tài khoản đăng nhập lại, cập nhật một lần. Cookie không được dán vào chat.

## Kết quả triển khai 25/10/2026

- Cookie-only theo câu trả lời người dùng; không thêm mật khẩu/đăng nhập/account endpoint/provider. Set-Cookie chỉ từ endpoint synthesis đã dùng; lưu mã hóa AES-GCM trong D1 với bootstrap namespace/CAS/cooldown5phút. HTTP403 phân biệt với401. Flag server CAPCUT_SESSION_PERSISTENCE=1, migration0015 tạo bảng riêng (remote direct); không thay dữ liệu truyện.
- Cache IndexedDB thu-phong-audio-v1 tách DB truyện/cursor; exact text/voice/resource key, MP3+SHA, LRU32MiB/256đoạn/TTL24h, bounded storage waits. Bypass+digest-CAS invalidation khi native không giải mã để tránh lặp file hỏng. Buffer12–45giây theo audio/gateway, giữ tối đa12đoạn và3active jobs; không đổi boundaries/seek.
- Review độc lập GPT-6.1 Sol/high:7workerd+D1 +4client pass. Phát hiện vòng lặp badcache, đã sửa và xác minh giữ seek. Root47targeted pass; legacy player/resume65pass. Build2 PASS (lượt đầu mismatch DOM/Workers Headers, đã dùng feature detection có type). E2E10/10 PASS, mock CapCut/AI/native MP3 fixture và desktop/Pixel7 layout.
- Root full185files/2272tests:184files/2271tests pass,1fail test fake-clock trong review (assert59999 tính từ quan sát fetch thay vì timer). Reviewer sửa riêng test theo timer60s thật,4/4pass; không rerun toàn suite sau sửa test-only. Logs .dsh-tmp/tts-autonomy-{full,targeted-initial,targeted2,build,build2,e2e,independent,client-independent}.log; giữ lỗi đầu.
- Pages6f16d27c/index-DGAjMYUl.js; rollbacka7cbfe29 (bảng0015 có thể giữ, code cũ bỏ qua; cookie thực tế vẫn phụ thuộc CapCut). Real production Mai/fresh browser/truyện tổng hợp/AI mock/cloud khác bị chặn: firstPlay2428ms, cached reload/resume59ms, không gửi lại đoạn, đúng mốc, maxConcurrent3, Stop và noAutoplay PASS. .dsh-tmp/tts-autonomy-production-ui-report.json.
- Production metadata runtime_rows=0 ở lần thử: chưa quan sát CapCut cấp cookie mới thực tế. Cơ chế rotation/encryption được xác minh bằng workerd fixture, không phải bằng chứng gia hạn phiên thật/dài hạn. Chưa Android nền/độ bền dài hạn. Không Git commit/push, đổi Worker/deps/compat/tier hoặc secret bootstrap.
