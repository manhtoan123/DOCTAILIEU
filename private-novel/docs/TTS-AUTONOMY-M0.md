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

## Sửa tự nghe tiếp — 26/10/2026

Pages d07fdcd9 / index-BT12ui5x.js. Semantic guard chỉ so nguồn/Name đã hydrate trong cùng chương; giữ intent khi handoff. Khi prefix đã nghe hết, xét lại trạng thái hoàn tất AI kể cả độ dài không đổi; đuôi chỉ có ký hiệu/dấu câu không gây lặp. Callback tiếp tục có epoch/timer cancellation; Stop, pause và đổi chương thủ công vẫn được tôn trọng. Thiếu autoNext trong options cũ giữ mặc định bật; false tường minh không bị đổi.

Root targeted72, build, E2E mới14, race12, native CapCut regression10 và production smoke6 đều qua; test tổng hợp/cô lập cloud, chưa Android thật. Before/after và giới hạn tại HANDOFF-LOG gốc, logs .dsh-tmp/tts-handoff/. Không đổi source/Name/schema, gateway, secret hoặc định dạng cursor.

## Ngắt nghỉ xuống dòng — 26/10/2026

Chỉ sửa nội dung gửi TTS: dòng có chữ/số nhưng thiếu dấu ngắt trước xuống dòng được thêm dấu chấm; không lặp dấu đã có, bỏ qua dòng trống, giữ dấu đóng lời thoại. Văn bản truyện, offsets highlight/cursor, cách tách theo dấu câu và UI giữ nguyên. Request vẫn giới hạn200 codepoint; audio cache tính theo nội dung thực gửi để không dùng lại audio thiếu dấu nghỉ. Root117 targeted + build +28 browser pass (native CapCut12, handoff/cursor16); dữ liệu tổng hợp, chưa đo giọng thật/Android thật. Log .dsh-tmp/tts-newline/.

Deploy Pagesa3cf294d/index-DGz4-Xx4.js; địa chỉ chính HTTP200 đúngasset, online8/8 pass (NL payload/source unchanged, next/cursor/cache). Smoke tổng hợp/cô lập cloud; rollback472f48d3. Không đổi AI/ConvertWorker hoặc schema.

## Thử lại ngay khi nghe lỗi — 26/10/2026

Lỗi mạng/5xx được thử lại lần đầu không chờ600ms; lỗi audio/current-chunk được phục hồi đầu không chờ2giây. Giữ nguyên offset/time/voice. Khi mạng trở lại, `online` đánh thức ngay thay vì đợi vòng polling1s. Callback cũ và timer bị hủy khi Stop/pause/đổi phiên; ≤3request đồng thời. Lỗi lặp vẫn giãn2–30s và tuân thủ Retry-After (kể cả phản hồi5xx đầu tiên). Phiên CapCut hết hạn vẫn cần phiên hợp lệ; chờ phiên không làm tăng backoff của lỗi audio sau khi kết nối lại.

Root120targeted pass + build capcut-v2; browser34 + race18 pass, sau chỉnh giữ bộ đếm phiên kiểm lại8ca liên quan. Test bổ sung phủ retry ngay, prefetch, offline/online, cooldown, stalecallback, seek và Stop. Fixture crypto-hash không bắt buộc thứ tự dispatch prefetch, chỉ bảo toàn tập chữ/cap3; case đo delay giả lập hash để tách khỏi native crypto timing.

Pages500fac29/index-5mlFO1em.js; HTML chính HTTP200 đúngasset; online14/14 pass. Rollbacka3cf294d; AI/ConvertWorker/schema giữ nguyên. Synthetic/mockedHTTP/nativeMP3 + Android layout; chưa chứng minh upstream/Android thật. Log .dsh-tmp/tts-immediate/; không commit/push.

## 28/10/2026 — Xuống dòng kết thúc một ô sửa câu
Bảng “Sửa câu đọc trong phiên” và nút Câu dùng `ttsSentenceDraft`: tách LF/CRLF/CR trước rồi áp dụng dấu câu và giới hạn độ dài hiện có. Tiêu đề và dòng sau thiếu dấu chấm không còn chung một ô. Dòng trống không tạo ô; dòng dài vẫn có thể thành nhiều ô để giữ giới hạn 200 codepoint/không cắt từ. Đây là xuống dòng thật trong văn bản, không phải dòng tự cuộn theo bề rộng màn hình.
Tách đơn vị sửa câu khỏi lô audio đã gộp sẵn; không đổi natural grouping, cursor/audioTime, cache audio hoặc schema. Khi gửi audio, `ttsPauseText` vẫn thêm dấu chấm trước xuống dòng thiếu dấu nghỉ. Áp dụng chỉ đổi văn bản nghe trong phiên; truyện gốc và AI đã lưu giữ nguyên.
Tham khảo [sentence-splitter NewLineParser](https://github.com/textlint-rule/sentence-splitter/blob/master/src/parser/NewLineParser.ts) về nhận diện CR/LF riêng và [PiperVoice](https://github.com/rhasspy/piper/blob/master/src/python_run/piper/voice.py) về đơn vị câu/ngắt nghỉ. Điều chỉnh theo yêu cầu: ranh giới xuống dòng là bắt buộc cho editor, còn lô transport audio độc lập; không chép mã/thêm dependency/provider.
Kiểm tra: targeted 4file/29test đạt (6 regression mới, pause4, word5, resume14), build CapCut-v2 đạt; preview E2E4/4 (bản gốc/AI × Edge desktop/Pixel7 mô phỏng) kiểm số ô/nội dung/áp dụng/mở lại/request dấu chấm và DB gốc không đổi. Lượt E2E đầu 2/4 fail ở assertion cuối: nút nghe nhanh tự chuyển sang AI theo hành vi có sẵn; sửa fixture chọn Bản gốc trước đối chiếu, rerun4/4pass. Log `.dsh-tmp/tts-line-editor/`; không chạy full suite cho thay đổi UI/adapter này. AI/TTS upstream giả lập, chưa chứng minh giọng CapCut thật hoặc Android thật.
Deploy 28/10 19:32: Pages `34cc1835` / JS `index-7NL-sT4g.js`, alias HTTP200 đúng asset; production E2E4/4 đạt với API/IDB tổng hợp cô lập cloud. AI Worker `0a211620`/Convert Worker giữ nguyên; rollback Pages `c42c1181`. Sol High review độc lập helper/Reader/new regression không finding; nguồn helper/Reader giữ nguyên hash đã review. Không commit/push.
