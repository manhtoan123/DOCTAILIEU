# TTS: phát liên tục và kiểm chứng gateway — 13/10/2026

Trạng thái: mã và build local đã kiểm chứng; chưa deploy. Production vẫn giữ bản ghi trong HANDOFF. Chưa có Android thật hoặc kiểm nghe bằng tai.

Đánh giá bổ sung: lượt 12 đoạn kéo dài khoảng **39,2 giây**; chưa phải kiểm nghe lâu. Khoảng ngắt dưới đây đo `ended → playing`, chưa bao gồm khoảng lặng bên trong MP3. Phương án nghiệm thu tiếp: [TTS-COMPLETION-PLAN.md](TTS-COMPLETION-PLAN.md).

## Thay đổi

- Đoạn đầu được tải trước khi khởi động tải nền. Khi phát, tiếp tục tải trước hai đoạn.
- Một phần tử HTMLAudio được dùng xuyên đoạn/chương. Thay nguồn audio trực tiếp; thu hồi từng Blob URL, bỏ callback của đoạn cũ. Không cắt đuôi MP3.
- Khi bản AI chương sau đã hoàn chỉnh, dùng một slot còn trống ở cuối chương để tải đoạn đầu chương sau. Tổng tối đa ba yêu cầu/cache entries. Chỉ giữ đoạn này qua chuyển chương tự động; Dừng, đổi giọng/nội dung hoặc chuyển thủ công hủy nó. Không gọi thêm AI để phục vụ TTS.
- Media Session hỗ trợ Play/Pause/Stop và nhãn chương/truyện; Stop dùng luồng Reader để xóa cursor và hủy chuyển chương. API không được hỗ trợ không chặn nghe.
- Callback cũ và Promise resume trả muộn không được tự phát lại sau Pause/Stop. Trong lúc chờ đoạn tiếp theo, cursor có audioTime=0, không lấy thời gian cuối đoạn trước.
- Resume nhận lại ranh giới đoạn nhỏ sau fallback HTTP5xx; không phát lại phần đã hoàn thành. Giữ định dạng cursor v1, source/semantic/rendered SHA và không autoplay reload.
- `TikTokPlayer.diagnostics()` giữ tối đa 120 mẫu offset/thời gian tải/chờ/trạng thái prefetch trong RAM, không ghi nội dung hay gửi telemetry. Giữ gateway, hai giọng, kiểm MP3/base64, deadline 30s và retry hiện có; không provider mới.

## Kiểm chứng

- Targeted unit: 63 PASS (`tests/tts-player.test.ts`, `tts-resume.test.ts`, `tts-cursor.test.ts`). Build PASS, bundle `index-Doc4DvvF.js`.
- E2E: 10 PASS trong lượt đầy đủ; hai ca RAW đầu bị timeout load máy chủ lạnh. Chạy lại RAW resume và ba chương/MediaSession với repeat-each=3: 12/12 PASS, hai projects desktop và android-layout. Các bài cũ được sửa đúng luồng Nghe chỉ AI, mock AI đầy đủ, đếm lần phát thay vì số phần tử audio.
- MP3 thật qua gateway được chấp nhận, Edge Windows, ba chương tổng hợp/12 đoạn, tốc độ 1; thêm giọng nam, Pause/Resume/Stop. Lượt cuối 13 HTTP200, native playing/ended đủ 12 đoạn, một audio element, hết chương xóa cursor. AI và toàn bộ `/api/` local được giả lập; không gọi Gemini hoặc ghi cloud/dữ liệu người dùng.

| Phép đo | Player trước sửa | Reader bản cuối |
|---|---:|---:|
| Bắt đầu phát | 3.992 ms | 4.241 ms |
| Chuyển chương 1 → 2 | 3.055 ms | 130 ms |
| Chuyển chương 2 → 3 | 2.631 ms | 118 ms |
| Ngắt trong chương | 18–45 ms | 37–214 ms |
| Audio elements qua 12 đoạn | 12 | 1 |

Đây là các lượt đo riêng trên mạng hiện tại, không benchmark thống kê. Baseline dùng player trước sửa tự nối ba chương; bản cuối dùng Reader đầy đủ với AI giả lập. Các mốc chuyển chương trong fixture nằm sau đoạn 4 và 8. Chưa có bằng chứng khởi động hoặc khoảng ngắt trong chương nhanh hơn; kết quả nổi bật là bỏ chờ gateway ở hai ranh giới chương có audio tải trước. Không cam kết hết ngắt khi mạng chậm, tốc độ nghe cao hoặc buffer cạn.

Evidence trong `.dsh-tmp/tts-complete/`: `unit-verified.log`, `build-verified.log`, `e2e-verified.log`, `real-audio.json` (baseline), `real-audio-final.json` + `real-audio-final.log`. Các lượt fail giữ ở `unit-initial.log`, `build.log`, `e2e.log`, `e2e-isolated.log`, `e2e-final.log`; esbuild AccessDenied được xử lý bằng TEMP/TMP `.dsh-tmp/chapter-runtime`, không đổi dependencies. Diff tính từ snapshot đầu phiên: TTS 60+/22-, Reader 10+/2-; giữ thay đổi cũ trong dirtytree.

## Chạy lại và giới hạn

Cập nhật hiện hành 13/10: xem [TTS-ACCEPTANCE-2](TTS-ACCEPTANCE-2.md). Đoạn dài không dấu câu đã đạt; người dùng bỏ yêu cầu kiểm 30 phút. Các số đo dưới đây thuộc lượt kiểm ngắn trước đó.

Chạy máy chủ local với TEMP/TMP riêng: `npm.cmd run dev -- --port 5175 --strictPort`. Sau đó `node scripts/check-tts-continuous.mjs`; nếu có snapshot `.dsh-tmp/tts-complete/tts.before.ts` thì đo thêm baseline. `TTS_CHECK_CURRENT_ONLY=1` chỉ đo bản hiện tại. Script chỉ nhận origin local `http://127.0.0.1:<port>` và chỉ gửi văn bản tổng hợp tới gateway TTS.

Cần kiểm trên điện thoại thật: nghe qua nhiều đoạn/chương khi khóa màn hình, chuyển ứng dụng và bật tiết kiệm pin. Media Session cung cấp điều khiển, không bảo đảm hệ điều hành giữ trang chạy nền. Máy hiện tại không có adb trong PATH. Chưa kiểm dài hàng chục phút, 4G, chất lượng giọng bằng tai hoặc AI thật.
