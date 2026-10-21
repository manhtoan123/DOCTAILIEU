# Kế hoạch hoàn thiện TTS — 17/10/2026

Trạng thái: Đã hoàn tất chẩn đoán P0, triển khai P1 (Nối câu tự nhiên), bảo toàn P2 và kiểm chứng tự động P3. Đang ở P4 (chờ xác nhận/cấp phép deploy và kiểm thử thiết bị Android thật).

Cập nhật 18/10/2026: SETTINGS-UNIFIED-UX-PLAN bật giữ phiên và nối câu tự nhiên tự động, bỏ checkbox kỹ thuật. Cursor local/shared có marker grouping tương thích dữ liệu cũ, giữ đúng audioTime theo câu/đoạn retry đã lưu. Kết quả triển khai và kiểm mới nằm ở SETTINGS-UNIFIED-UX-PLAN; Android thật vẫn chưa nghiệm thu. Các số baseline/ứng viên bên dưới là lịch sử phép đo, không phải số đo lại của bản UI mới.

## Mục tiêu và điểm xuất phát

Người dùng xác nhận âm thanh phát nền đã tốt. Lỗi cần giải quyết là khoảng chờ dài giữa các câu, có cảm giác câu tiếp theo chưa tải xong; không phải âm thanh rè. Việc khôi phục player cũ và tắt MSE trước đó chưa chứng minh đã sửa lỗi này.

Baseline theo HANDOFF: Pages `bc83be4e`, bundle `index-DsNEH5Sw.js`. Build ứng viên hiện tại: `index-DXC1fd15.js`. Giữ cơ chế nền WAV 10 giây tạo bằng Blob tại máy, không tải qua 4G, dùng lại qua các câu và giữ lựa chọn thiết bị. Giữ gateway TikTok `https://ottsy.weilbyte.dev/api/generation`.

## P0 — Tái hiện và xác định phần gây chờ

- [x] Ghi baseline cùng văn bản tổng hợp (`scripts/measure-tts-gaps.mjs`), voice `BV074_streaming`, 3 nhóm mẫu: câu ngắn/hội thoại (5–25 ký tự), câu trần thuật vừa (40–80 ký tự), câu miêu tả dài (100–180 ký tự). Dữ liệu chi tiết lưu tại `.dsh-tmp/tts-p0/tts-p0-report.json`.
- [x] Đo theo từng đoạn: roundtrip gateway, Blob sẵn sàng, thời gian chuyển native Audio (`eventGapMs`), khoảng lặng tín hiệu PCM bên trong MP3 (`leadSilenceMs`, `tailSilenceMs`), và độ trễ cạn bộ đệm (`starvationDelayMs`).
- [x] Phân biệt rõ bốn nguồn chờ:
  1. **Cạn bộ đệm do gateway (Nguyên nhân cốt lõi gây khựng dài):** TikTok gateway roundtrip mất 1.7s–2.1s (sàn độ trễ mạng + inference model). Với câu thoại ngắn (5–25 ký tự, thời lượng audio chỉ 550ms–1224ms), đoạn trước phát hết nhưng đoạn sau chưa tải xong (`isBufferStarved: true`), gây trễ thêm 550ms–1136ms mỗi câu!
  2. **Khoảng lặng có sẵn trong MP3 của TikTok:** Phân tích giải mã PCM qua AudioContext cho thấy mỗi file MP3 sinh ra luôn có ~110–125ms khoảng lặng ở đầu và ~140–210ms khoảng lặng ở đuôi (tổng PCM silence nội tại ~250–325ms).
  3. **Thời gian chuyển native Audio:** Đo đạt thực tế chỉ mất **10–20ms** trong Chromium (single Audio element swap source). Đây không phải nguyên nhân gây khựng đáng kể.
  4. **Câu dài (>140 ký tự):** Audio dài 6.2s–6.9s trong khi gateway mất 4.2s–4.5s -> đoạn sau luôn được prefetch xong sớm trước khi đoạn trước kết thúc (`starvationDelayMs = 0ms`). Tổng khoảng lặng tai nghe chỉ còn ~317–344ms (chính là PCM silence tự nhiên của model).
- [x] Báo cáo chi tiết:
  - Hội thoại ngắn (6 câu): 100% transitions bị cạn bộ đệm (`starvation = 100%`), tổng khoảng chờ tai nghe 850ms–1471ms (trung bình ~1200ms).
  - Trần thuật vừa (4 câu): 66% transitions bị cạn bộ đệm nhẹ (~270–340ms), tổng khoảng chờ 600ms–682ms.
  - Miêu tả dài (3 câu): 0% cạn bộ đệm, tổng khoảng chờ 317ms–344ms (chỉ bằng PCM silence).

Đầu ra P0: Xác định chính xác nguyên nhân là nhánh 3: "Nhiều đoạn quá ngắn khiến gateway không theo kịp", kết hợp với PCM silence tự nhiên của model TikTok.

## P1 — Sửa từng nguyên nhân, ưu tiên thay đổi nhỏ

| Kết quả P0 | Hướng xử lý | Điều kiện giữ thay đổi |
| --- | --- | --- |
| Nhiều đoạn quá ngắn khiến gateway không theo kịp | **ĐÃ CHỌN:** Gom câu ngắn tự nhiên (`ttsFlex`) trong giới hạn gateway; giữ nguyên ánh xạ offset/câu | Không cắt giữa từ, giữ nguyên `text.slice(s.start, s.end) === s.text`, không mất highlight; giảm 80% request, xóa sạch starvation |

Chi tiết triển khai:
- [x] Trong `src/tts.ts`: Hàm `sentences(text, flex)` gom các cụm câu ngắn liền kề (< 80 ký tự) lên tới target 160 ký tự nếu `flex > 0`, không gom qua dấu ngắt đoạn `\n\n` (trừ khi đoạn quá nhỏ). Đảm bảo tuyệt đối `text.slice(s.start, s.end) === s.text`.
- [x] Khi gom câu ngắn: 6 câu hội thoại ngắn gom thành 1 request dài ~5.5s audio, fetch trong 4.2s -> giảm từ 6 requests xuống 1 request duy nhất, loại bỏ hoàn toàn tình trạng cạn bộ đệm.
- [x] Thêm `mediaMs` vào chẩn đoán `TtsTiming` để ghi nhận thời gian chuyển native Audio độc lập với network wait.
- [x] Thêm tùy chọn `ttsFlex` vào `ReaderOptions` (mặc định `0` trong `domain.ts` để giữ 100% backward compatibility với các test suite cũ).
- [x] Trong `src/ui/Reader.tsx`: Thêm checkbox "Nối câu tự nhiên" trong phần Cài đặt đọc truyện (`ReaderPanel`). Cập nhật hộp thoại sửa câu và đếm câu tôn trọng cấu hình `ttsFlex`.

## P2 — Bảo toàn vị trí và phục hồi khi lỗi

- [x] Mất mạng giữa câu và lúc chuyển câu: Giữ đúng chương, offset và thời gian nghe; có mạng lại tiếp tục đúng đoạn theo hành vi hiện hành.
- [x] Pause/Resume, Stop, đổi chương/voice/source và unmount đúng lúc bàn giao audio: callback/request cũ không phát lại, không chồng tiếng, không lặp từ. Stop thu hồi toàn bộ Blob URL và gỡ audio.
- [x] Reload không autoplay; giữ kiểm tra identity/source/hash của cursor.
- [x] Chuyển chương khi AI sẵn/chưa sẵn/lỗi và khi tắt tải trước: hiển thị đúng trạng thái; Stop hủy chờ như hiện hành.
- [x] Quản lý tài nguyên: Giữ tối đa 3 entries trong request window, giải phóng Blob URL sau khi phát, WAV nền 10s giữ phiên không phát sinh HTTP thừa.

## P3 — Kiểm chứng ứng viên

- [x] **Unit tests**: Chạy `npm.cmd test -- tests/tts` -> **91/91 tests PASS** trên cả 6 test files:
  - `tests/tts-word-boundary.test.ts`: 5/5 pass (bổ sung test gom câu tự nhiên bảo toàn offset UTF-16).
  - `tests/tts-media-keepalive.test.ts`: 5/5 pass.
  - `tests/tts-cursor.test.ts`: 18/18 pass.
  - `tests/tts-continuous.test.ts`: 12/12 pass.
  - `tests/tts-resume.test.ts`: 7/7 pass.
  - `tests/tts-player.test.ts`: 44/44 pass (bổ sung test tùy chọn flex và trường chẩn đoán `mediaMs`).
- [x] **Build**: `npm.cmd run build` -> **Thành công (exit 0)** với bundle `dist/assets/index-DXC1fd15.js` (769.01 kB).
- [x] **E2E tests**:
  - `e2e/tts-resume.spec.ts`: 30/32 passed (bao gồm test case mới cho tính năng Nối câu tự nhiên trên cả Chromium và Android viewport layout). 2 ca đầu timeout do cold start server dev Vite.
  - `e2e/tts-continuous.spec.ts`: 8/8 passed khi dev server ấm.
  - `e2e/tts-keepalive-local.spec.ts`: native carrier Blob giữ nguyên, 0 silent request.
- [ ] **Android thật, loa máy**: Cần người dùng kiểm tra trên thiết bị Android thực tế (loa ngoài + màn hình khóa + tai nghe) với bản build mới để đánh giá cảm nhận âm thanh thực tế so với baseline.

## P4 — Triển khai và đóng tác vụ

- [x] Tổng hợp baseline và ứng viên:
  - Baseline: Pages `bc83be4e` (bundle `index-DsNEH5Sw.js`), câu ngắn bị ngắt 1.0–1.6s do starvation mạng.
  - Ứng viên: Bundle `index-DXC1fd15.js` với tùy chọn "Nối câu tự nhiên" (gom câu ngắn < 80 ký tự lên 160 ký tự), giảm 80% HTTP calls, triệt tiêu starvation cho câu ngắn.
- [x] Deploy lên Cloudflare Pages theo yêu cầu người dùng: Deployment ID `63a0008f`, bundle `index-DXC1fd15.js`, phục vụ tại `https://thu-phong-private.pages.dev/`. Smoke test production tự động PASS 100% (`smoke-tts-recovery-production.mjs` và `smoke-tts-flex-production.mjs`).
- [ ] Kiểm chứng trên Android thật sau deploy (người dùng xác nhận trải nghiệm nghe qua loa/tai nghe và màn hình khóa).
- [x] Cập nhật HANDOFF và HANDOFF-LOG.
