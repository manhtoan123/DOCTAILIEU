# TTS — nghiệm thu đoạn dài không dấu câu

13/10/2026. Theo chỉ đạo người dùng: bỏ kiểm nghe 30 phút, kiểm một đoạn văn dài không dấu câu qua gateway thật. Phạm vi này đã đạt trên bản local; sau yêu cầu hoàn thành sản phẩm, đã phát hành và smoke production đạt.

## Bản phát hành

Production [Thư Phòng](https://thu-phong-private.pages.dev/) đang chạy Pages `945cfd10-8377-4c31-899e-bc4b117967ca`, branch master, bundle `index-uZGEBCfb.js`; deploy exit0. Canonical HTML khớp chính xác dist đã kiểm và CSP cho phép gateway hiện có. Wrangler 4.147.0 của dự án; giữ cấu hình/bindings/secrets, không chạy migration hoặc deploy AI Worker. Bản production trước: `d920c5dc-4ea3-4b7d-a7ff-f12a36171231`.

Smoke production exit0 trên Edge, hai viewport 1280×800 và 522×524: audio thật hai giọng nữ/nam; Pause, reload không autoplay, tiếp tục đúng offset214 trong nội dung nguồn, auto-next hai chương, một Audio sau reload, Stop pause/xóa src/cursor. Tổng 16 phản hồi gateway đều HTTP200. Thư viện tổng hợp trong context mới, chặn service worker và mock toàn bộ `/api/**` (AI/cloud); không gọi AI thật hoặc ghi dữ liệu cloud người dùng. Đây là smoke bản triển khai, không thay thế phép kiểm dài local bên dưới hoặc Android thật.

[Report production](../.dsh-tmp/tts-finish/release/20261013120037929/smoke.json); logs `.dsh-tmp/tts-finish/release-deploy.log`, `release-smoke-final.log`, `release-after.log`. Script `scripts/smoke-tts-release-production.mjs`. Lượt smoke đầu dùng offset bỏ qua dòng tên chương TXT nên assertion sai; đã sửa nguồn đối chiếu, không đổi mã app. Giữ `release-smoke-initial.log` và report đầu để tra lại. Lệnh triển khai theo [Wrangler Pages](https://developers.cloudflare.com/workers/wrangler/commands/pages/).

## Kết quả thực tế

Edge 155.0.4283.45, Windows, Reader thật, giọng nữ BV074_streaming, tốc độ 1×. Gateway Weilbyte thật; AI echo và cloud giả lập, thư viện tổng hợp cô lập. Không dùng dữ liệu truyện của người dùng.

| Đại lượng | Kết quả |
| --- | --- |
| Văn bản | Một đoạn, 3.196 Unicode codepoints, không dấu câu hoặc xuống dòng |
| Chia/tải/phát | 16 phần, mỗi request ≤200 codepoints, 16 HTTP 200, không lỗi mạng |
| Âm thanh phát hết | 135,43 giây; tổng lượt kiểm 153 giây |
| Từ bấm nghe đến phát | 6.110 ms, gồm chờ bản AI giả lập và gateway |
| 15 lần chuyển phần | Median 29 ms; 14 lần 26–34 ms, một lần 284 ms |
| Thứ tự/nội dung | Offset liên tục từ đầu tới hết; SHA từng phần khớp text gửi gateway thành công, không bỏ/lặp phần |
| Tài nguyên | Một Audio element; tối đa 3 request entries và 2 Blob URLs lúc chuyển |
| Sau kết thúc/dừng | 0 requests/pending/URLs, audio không còn hoạt động, cursor đã xóa |
| JS heap sau GC | Tăng 811.796 bytes trong lượt kiểm; không phải đo toàn bộ bộ nhớ native |

Khoảng chuyển đo bằng `ended → playing`, không đo khoảng lặng bên trong MP3. P95 mẫu nhỏ là 284 ms; 15 khoảng chuyển chưa đủ kết luận P95 ổn định hay khẳng định đạt mục tiêu 250 ms. Không có lời hứa loại bỏ độ trễ gateway. Đối chiếu offset/SHA chứng minh ứng dụng chuyển đủ phần, không thay thế nghe bằng tai để đánh giá phát âm/mất chữ bên trong audio.

## Các lỗi đã sửa và kiểm tra

- Hết phần đúng lúc Pause: giữ chờ, chỉ sang phần tiếp theo khi Resume, không phát lại phần đã hết.
- Resume còn chờ native play: hiện trạng thái tải để Stop có hiệu lực; callback muộn không hồi sinh phiên đã dừng.
- Tự sang chương còn chờ AI: hiện nút dừng; Stop hoặc tắt tự sang chương ngăn kết quả AI muộn tự phát.
- Giữ ưu tiên phần hiện tại, tải trước có giới hạn, chuẩn bị phần đầu chương sau, một audio dùng lại và cursor theo offset nguồn; không đổi provider/schema/dữ liệu sách.

65 unit PASS (`tts-player`, `tts-resume`, `tts-cursor`), build PASS `index-uZGEBCfb.js`, toàn spec `tts-resume` 22/22 PASS trên desktop và android-layout. Có ca mất mạng rồi phục hồi vị trí, Pause/Resume/Stop, AI đến muộn và tắt auto-next. Android-layout là trình duyệt mô phỏng bố cục, không phải điện thoại thật.

## Bằng chứng và chạy lại

- [Report thật](../.dsh-tmp/tts-finish/20261013115050479-41096/report.json), [văn bản thử](../.dsh-tmp/tts-finish/20261013115050479-41096/fixture.txt), [log](../.dsh-tmp/tts-finish/unpunctuated.log).
- Logs kiểm mã: `.dsh-tmp/tts-finish/unit.log`, `build-candidate.log`, `e2e-candidate.log`; giữ log lỗi trước sửa.
- TTS SHA256 `b2b7d6df5718c2936e3cbb7727565f8887cee0e2bf80fbcfca7a07daedeb5f8f`; Reader SHA256 `d68ed986c5fe6c8ff4e1d7bb67251b27ce186ea9fb53ef3ff0fac3bc184fa57d`, đối chiếu nguồn sau kiểm khớp.
- Chạy Vite local cổng 5175, nên bỏ watch `.dsh-tmp/**` và `test-results/**` bằng config kiểm riêng để tránh reload do artifact. PowerShell: `$env:TTS_CHECK_SUITE='unpunctuated'; node scripts/check-tts-acceptance.mjs`. Mỗi lượt lưu riêng, chỉ origin local, chỉ gửi văn bản tổng hợp tới gateway được chấp nhận.

Không yêu cầu kiểm 30 phút. Benchmark startup xen kẽ trước đó bị ngắt sau ba lượt, không dùng để kết luận phương án nhanh hơn. Chưa kiểm tai người nghe, Android thật/khóa màn hình hoặc AI thật. Bản production mới đã smoke đạt theo phạm vi ở trên.
