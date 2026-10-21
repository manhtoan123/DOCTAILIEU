# AI prewarm và tiếp tục nghe — yêu cầu 10/10/2026
Trạng thái: kế hoạch fix tương lai theo heartbeat 03:22 ICT; chưa triển khai/kiểm thử. Tiếp sau lỗi truyền file lớn production. Subagent mới GPT-6-astra/medium, giữ lịch sử và invariant.
**Cập nhật 10/10/2026 11:45:** R1b/R2/R3 trong tài liệu này **đã hoàn tất và phát hành** (xem HANDOFF); riêng luật "không xoay key/đổi model/fan-out" ở các mục R2 **đã được supersede** bởi quyết định người dùng cùng ngày: bản local có key pool + xoay key khi 429 (không fan-out song song một chương). Chi tiết: `DECISIONS.md` 10/10 và `AI-KEY-POOL-PLAN.md` §15–§16 (kèm đánh giá prewarm: đúng hướng nhưng tốn gấp đôi quota/chương và vô dụng với chương >32k).

## R1 — phân loại ai_invalid_response trước khi tự thử lại
- Không mặc định đây luôn là lỗi Gemini. Kiểm tra cả HTTP status, Content-Type/JSON envelope của endpoint, timeout/gateway/Cloudflare, finishReason/result/model và giới hạn kích thước. Log mã lỗi/status/requestID/thời gian; không log key, prompt hoặc nội dung truyện.
- Invalid JSON/HTML gateway và lỗi mạng/502/503/504: thử lại có hạn, cùng semantic key. Sai schema/model, SAFETY, dữ liệu nguồn quá dài hoặc lỗi auth: xử lý theo loại, không retry mù.
- Nghiệm thu: fixture trả HTML200/HTML502, JSON cắt, STOP rỗng, model sai, timeout, cancellation; lỗi phân loại đúng, không cache/hiển thị bản chưa hoàn chỉnh.

## R2 — prewarm chương sau và phục hồi nền
- Giữ current+next và dedupe: foreground tiếp nhận đúng job đã preload; không dịch cả thư viện. Sau current hoàn thành, next được làm ngay khi người dùng đọc/nghe current. Trạng thái queued/running/ready/cooldown/failed và checkpoint hoàn chỉnh phải gắn source/revision/prompt/Name/model.
- Retry nền tối đa 2 lượt lỗi tạm thời, backoff có jitter và tôn trọng Retry-After; không reload cả web để sửa một request. Đổi chương/Name/prompt/model hoặc xóa truyện hủy job cũ; kết quả muộn không thắng.
- Key cùng Google project không làm tăng quota. Không xoay key hoặc chạy song song để vượt giới hạn; 429 phải cooldown theo project/model. Có thể phân bổ các job độc lập cho các project có hạn mức hợp lệ, concurrency thấp và ngân sách rõ; không fan-out một chương để đua nhiều key.
- Nguồn đã đối chiếu10/10/2026: [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) — quota theo project và thay đổi theo model/tier; không tự nâng paid tier.
- Key auth-invalid có thể bị đánh dấu unavailable rồi dùng key hợp lệ đã cấu hình server, có giới hạn số lần; không đưa key lên client. Một job chỉ có một người sở hữu publication.
- Fallback model: chính sách theo truyện do người dùng chọn trước, một model thay thế cho phép; không chuyển âm thầm. Giữ model thực trong provenance/cache key và chỉ báo trạng thái ngắn khi fallback. Không bỏ guard model-mismatch hiện tại để giả thành công; thay đổi hợp đồng fallback phải review riêng.
- Khi next chưa ready: giữ vị trí và chờ có thể dừng, tiếp tục khi đủ bản STOP; current không bị xóa. Không cam kết luôn có bản dịch trước khi lật chương nếu upstream/quota không cho phép.
- Nghiệm thu: prewarm lỗi rồi phục hồi trước promotion, foreground dedupe, 429 không spam, fallback đúng key/provenance, cancellation/stale, prompt/Name thay đổi, reload resume checkpoint. Đo thời gian next-ready và số request trên fixture; mock và Google thật báo riêng.

## R3 — TTS cuộn theo dòng và resume đúng nơi
- Lưu cursor riêng theo book/chapter/mode/source revision + AI translation identity + voice, sentence index/offset và trạng thái paused. Không dùng paragraph AI để ghi đè canonical RAW/Convert progress.
- Highlight câu đang phát và cuộn nhẹ vào vùng đọc nếu nằm ngoài viewport; giữ vị trí khi người dùng đang tự kéo, có thời gian tạm ngưng auto-scroll. Không giật về đầu chương hoặc đổi vị trí do preload.
- Lỗi HTTP500/502/503/504/timeout: bounded retry cùng đoạn/giọng, backoff; giữ cursor đến khi audio đoạn đó thực sự bắt đầu/kết thúc. Cache audio có hạn, dedupe prefetch; không đọc lại các câu đã hoàn thành khi khôi phục.
- Reload: phục hồi chương/mode/cursor, hiển thị một nút tiếp tục. Không tự phát âm thanh trước thao tác người dùng vì chính sách autoplay; không yêu cầu xác nhận phụ. Cursor của bản dịch/source đã đổi phải invalidated hoặc ánh xạ bằng anchor được kiểm chứng, không áp vào văn bản khác.
- Auto-next: chỉ commit sang cursor chương mới khi bản đọc mới sẵn sàng. Lỗi ở cuối chương không quay lại câu đầu của chương cũ. Stop hủy cả retry/preload và không tự khởi động lại; Pause giữ cursor.
- Nghiệm thu: fakeAudio delayed-play/ended/error/rejected-play, retry lặp không đọc trùng, pause/stop trong retry, reload giữa đoạn/giữa chương, nguồn/Name/model đổi, manual scroll và auto-scroll. Native TikTok/Edge Windows và Android thật kiểm riêng; background/khóa màn hình chưa xác minh nếu thiếu thiết bị.

## Thứ tự triển khai
1. R1 phân loại lỗi (client/server, targeted tests), không thay retry/fallback ngay.
2. R3 cursor local + highlight/auto-scroll + resume, review dữ liệu độc lập; chưa đổi provider.
3. R2 retry/cooldown/checkpoint prewarm; fallback theo chính sách riêng sau review hợp đồng cache/provenance.
Mỗi bước fullunit/build/E2E liên quan repeat3, nhật ký file/lệnh/kết quả/fail; deploy và production smoke riêng. Không thêm UI trùng chức năng hoặc giải thích dài trong Reader.

## Checkpoint10/10/2026 05:44 — R1a
Clientclassification/strictcompletevalidation đã triển khai, không retry/fallback. R1b tiếp: boundedclientdeadline/stalledbody + server safe reason/requestID/timing; sau đó R3cursorTTS rồi R2retryprewarm. Reader lần AI đầu lỗi vẫn hiện notice, RAW trong DB giữ; cải tiến giữ prose cần scope/test riêng. Acceptance/release thực xem HANDOFF và HANDOFF-LOG.

## Checkpoint10/10/2026 07:52 — R1b
Client70s boundedfetch/body +externalabort/latecancel và server safe reason/requestID/timing đã triển khai; test/release thực theoHANDOFF/log. Không auto-retry/fallback/keys, chưaTTSresume. R3next: TikTok cursor riêng +auto-scroll/same-sentence recovery; acceptance fakeAudio+nativeIDB+reload/changedidentity/cancel independentreview, khôngoverwritecanonical progress hoặcautoplay.

## 10/10/2026 08:14 — người dùng đổi thứ tự
Ưu tiên R2prewarmrecovery trước, sau đó R3TTSscroll/resume; khôngchờTTS mới phục hồiAI. Implementation/checks/release xemHANDOFF/log; fallbackmodel/keyrotation khôngthuộcscope boundedretry hiện hành.

## Checkpoint10/10/2026 09:55 — R2 + R3 hoàn tất, đã phát hành production
- R2 (ưu tiên): AiRecovery trong AiReadingSession retry tối đa 2 lượt phụ cho lỗi tạm thời (network/timeout/gateway/429/5xx + envelope transient), backoff 2s→5s + jitter, cooldown 429 theo model trong session tôn trọng Retry-After (auto-wait ≤30s rồi fail-fast), 5xx thiếu reason vẫn transient nhưng reason vĩnh viễn thắng. Không xoay key/đổi model/fan-out. Foreground promotion nhận đúng job đang retry (dedupe), cache bền vững source-guarded, reload không gọi lại API.
- R3: cursor TTS metadata-only localStorage, cuộn theo câu đang phát có tạm ngưng khi người dùng tự kéo, retry mạng 1 lượt cùng câu/giọng trong deadline 30s, resume sau reload không tự phát với một nút tiếp tục (data-resume), `ended`/Stop xóa cursor, đổi nguồn/revision/hash invalidate. Review độc lập 6/6 invariant + 134 targeted xanh, không blocker.
- Evidence tại HANDOFF/HANDOFF-LOG/DECISIONS; production Pages870d4d15 với realTikTok resume smoke 2 viewport, prewarm recovery mock 2 viewport và realGemini UI 2 viewport đạt. Giới hạn: cooldown session-only, TTS timeout không auto-retry (deadline chung 30s), highlight theo đoạn chứa câu (chưa từng câu trong đoạn Convert), Android thật chưa kiểm.
