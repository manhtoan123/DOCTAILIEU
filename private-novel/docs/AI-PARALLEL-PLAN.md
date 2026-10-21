# Dịch chia phần cùng model — trạng thái và bản đồ code

20/10/2026. Đã sửa local sau undo dở; chưa deploy lượt tổ chức lại này. Kết quả kiểm chứng cuối cùng ghi trong HANDOFF-LOG ở gốc dự án. Các số pass/deploy từ lần triển khai trước không chứng minh checkout sau undo hoạt động.

## Quyết định hiện hành

Người dùng cho phép tối đa hai key đã cấp chạy đồng thời để dịch các phần khác nhau trong một chương. Không thêm key/provider/tier. Chế độ đọc mới thay hybrid nửa sau Lite bằng `splitParts`: cùng model được chọn cho cả chương, prompt và quy tắc xưng hô chụp tại lúc bắt đầu. Model fallback chỉ trước khi chốt model; các phần còn lại không tự đổi model khác nhau.

Mặc định runtime bật chia phần. `splitParts:false` giữ gửi cả chương trong giới hạn API32k; quá giới hạn vẫn chia an toàn. TXT phần khoảng1800 ký tự, EPUB theo node/piece và JSON ID. Không chuyển ký tự thành ước lượng token/chi phí chính xác. Request đầu xác định model/capacity; sau đó tối đa2 nếu máy chủ báo đủ key. Một key khả dụng vẫn dịch tuần tự. Khoá/lease phía máy chủ bảo vệ key đang bận và giữ cooldown. Key không xuất hiện trong bundle hay log.

## Ranh giới module

| Trách nhiệm | File |
|---|---|
| Kiểu dữ liệu thuần | `src/ai-settings-type.ts` |
| Mặc định, đọc cấu hình lưu, hàng đợi ghi settings | `src/ai-settings.ts` |
| Chính sách runtime, kế thừa common/book, chọn prompt, CAS | `src/ai-reader-settings.ts` |
| Xác thực profile/shared state | `src/prompt-schema.ts`, `src/shared-state-schema.ts` |
| Slot chung, ưu tiên foreground, cooldown/cancel | `src/ai-scheduler.ts` |
| Chia lossless, ghép có thứ tự, tiến độ prefix | `src/ai-parts.ts` |
| Điều phối TXT/cache/model/budget | `src/ai-reading.ts` |
| Ánh xạ node/JSON và ráp EPUB | `src/epub-ai.ts` |
| Form chung cho kho prompt và editor | `src/ui/PromptFields.tsx` |
| Switch truyện, trạng thái đang đọc | `src/ui/AiPanel.tsx`, `src/ui/Reader.tsx` |
| Mã tương thích cũ | `src/ai-hybrid.ts`, `src/ai-hybrid-prompt.ts` |

`ai-reading.ts` re-export API settings cũ để các caller còn lại không gãy import; code mới nên nhập settings từ module chuyên trách. Không di chuyển hàng loạt file hoặc xóa tài liệu lịch sử giữa dirtytree lớn.

## Dữ liệu cũ và cache

Reader bỏ `hybrid` ở runtime, giữ rules làm addressingRules; không sửa hàng loạt row/profile/nguồn. Prompt nửa sau cũ vẫn nằm trong dữ liệu, không chạy trong chế độ đọc mới. Cache mới có split mode/rules/plan trong identity; không coi output hybrid là output cùng model. Engine hybrid chỉ còn phục vụ tương thích và regression trực tiếp; UI không cung cấp Lite nửa sau.

Chọn/sync prompt giữ switch riêng của truyện. `false` phải sống qua validate/profile/shared/current/chosen snapshot. CAS chống ghi đè nháp khi thiết bị khác sửa. Đổi mode không tái nhập truyện hoặc sửa bytes/SHA.

## Scheduler và phục hồi

Reader dùng một control chung cho TXT/EPUB hiện tại và prewarm: tối đa2 request đang chạy; foreground ưu tiên hơn prewarm đang chờ, không huỷ request đã gửi chỉ để nhường slot. Sau429 hạ1, chờ Retry-After; chỉ phục hồi cap tại ranh giới job khi idle, hết cooldown và qua cửa sổ60s. Mọi retry/fallback chung budget; Stop/cancel chặn timer và phản hồi muộn. Phần hoàn tất được giữ; chỉ prefix liên tiếp hiện sớm, chỉ đủ toàn chương mới cache complete/TTS.

TTS giữ tự phục hồi đã triển khai trước. Nghe prefix chưa thuộc lượt này: cần thiết kế cursor/append audio riêng để tránh phát trùng hoặc mất câu.

## Nghiệm thu

Unit: cùng model, ghép đủ nguồn, schema/shared false/true, legacy no-write, cache isolation, ưu tiên/global cap2, hủy waiter, quota1, reset idle, CAS và key lease D1 thật. Root full unit + build; E2E luồng song song/cài đặt/auto recovery/TTS; reviewer độc lập theo AGENTS. Không dùng số test cũ làm kết quả lần này. Fault harness/mock AI không chứng minh tốc độ/chi phí Gemini thật; Android layout không thay Android nền thật.

Kiểm chứng lượt sửa undo: full152files/1924unit PASS;48 E2E liên quan PASS; build cuối index-C-pPxgbD.js PASS. Reviewer độc lập46PASS; hoàn tất UI comparison bằng GPT-6.1 Sol medium theo yêu cầu người dùng. Log chi tiết ở ../../HANDOFF-LOG.md và .dsh-tmp/parallel-cleanup/. Chưa deploy lượt này.

## Xác minh 20/10/2026 — hai key thật sự chạy đồng thời?

Kết luận: **PASS có điều kiện** cho câu "các phần khác nhau của MỘT chương có thể dịch đồng thời trên tối đa 2 key khác nhau"; **KHÔNG** phải "mọi chương luôn dùng đủ hai key".

Ba trạng thái tách biệt: (1) đã chia phần — có, `splitAiText` 1800 ký tự lossless; (2) tối đa 2 slot được phép — có, `withAiRequestCapacity` cap 2/1 khi throttle; (3) hai key khác nhau chạy đồng thời — chỉ khi scheduler đã "warm" (capacity 2 biết từ response trước, TTL 60s) hoặc chương có ≥3 phần: phần đầu chạy một mình để chốt model/capacity, sau đó các phần sau mới chạy đôi.

Bằng chứng runtime (gọi `handleAiTranslate` thật + lease D1 thật; chỉ mock fetch Gemini):
- `tests/ai-parallel-runtime-proof.test.ts`: A warm 2 key — hai phần của cùng chương overlap, 2 `leaseIdHash`/`keySlot` khác, map slot 1/2 sang hai key khác nhau; B cold 3 phần — phần 1 đơn, phần 2+3 overlap 2 key; C 1 key — 429, width 2→1, không overlap thành công, chỉ 1 slot; D cooldown — 429 + `Retry-After`, chờ rồi tuần tự. Thêm ca B cold 2 phần ghi nhận giới hạn: tuần tự, không giả song song.
- `tests/ai-parallel-independent-review.test.ts` (reviewer độc lập): bridge client→handler thật qua stream, cold 3 phần overlap >150ms với `activeLeases=2`, `leaseHashes`/`keySlots` size 2; break test: `parallel:2` không kèm lease không được hiện "2 key".
- Metadata an toàn: response có `X-AI-Request-ID`, `X-AI-Lease-Id-Hash` (SHA-256 của `slot:owner:requestId`, 32 hex), `X-AI-Key-Slot`; stream progress phát lease ngay khi giữ key; trace/progress chỉ chứa hash/slot. `tests/ai-activity-stream.test.ts` xác nhận lease không tính là content activity và không lộ secret.
- UI: `src/ai-parallel-status.ts` chỉ hiện "2 key đang chạy" khi `activeLeases>=2`; `keysAvailable===1` → "Đang chạy tuần tự — 1 key khả dụng"; Reader/AiJobStatus hiện "Đang chạy X/Y phần"; đã bỏ câu "tối đa 2 phần cùng lúc".

Giới hạn: cold 2-phần chưa song song (capacity chỉ biết sau response đầu); warm TTL 60s; chưa đo Gemini thật/billing/Android nền; production D1 chỉ kiểm qua Miniflare + CAS test riêng. Unit: `npm.cmd test -- --maxWorkers=4` 155 files/1949 PASS; build exit0; E2E chromium `ai-parts` 6, `ai-parallel-cleanup` 2, `ai-activity-stream` 2 PASS (spec cũ được chỉnh `splitParts:false` cho luồng cả chương và mock trả model theo request). Log: `review-ai-parallel-evidence.log`, `.dsh-tmp/full-test-parallel-4w-run2.log`, `.dsh-tmp/e2e-fixed-2w.log`. Chưa deploy/commit.

## Nghe phần đã dịch (TTS partial) — 20/10/2026

Chế độ AI cho phép **nghe ngay khi có prefix liên tiếp đã dịch**, không đợi đủ toàn chương:
- `src/ai-listen.ts` quyết định listen được / chờ / đọc tiếp / sang chương; `Reader.tsx` bỏ gate `waitingForConvert` cho TTS AI.
- Hết prefix khi chương chưa xong → **không auto-next**, chờ phần mới; phần mới xong → `player.start(prefix, {offset:lastSpokenEnd})` đọc tiếp từ câu kế tiếp, không đọc lại câu cũ. Lượt partial không lưu cursor TTS (tránh lệch khi text còn lớn dần); cursor đầy đủ khi chương hoàn tất.
- **Chỉ auto sang chương khi** chương đã dịch đủ (`aiReady`) **và** đã đọc hết toàn bộ text (`spokenEnd >= text.length`); đang partial thì dừng ở chương hiện tại.
- UI: thêm "Đã đọc hết phần đã dịch — sẽ tự đọc tiếp khi có phần mới"; nút Nghe bật khi có prefix.
- Test: `tests/ai-listen.test.ts` 5PASS (continue/wait/advance), E2E `ai-parts` 6/6 PASS (ca cũ "TTS disabled đến khi xong" đổi thành **enabled với partial**), build exit0. Chưa kiểm audio thật/Android nền; `tts-keepalive-local` vẫn fail poll cursor (HANDOFF ghi TTS-BACKUP-STABILITY-1/A1 fails từ trước — chưa xác minh regression).
