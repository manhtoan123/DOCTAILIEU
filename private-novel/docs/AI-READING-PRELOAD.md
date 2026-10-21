# AI-READ-1 — đọc/nghe AI và tải trước
09/10/2026. Phạm vi: Reader inline AI, route reload, arrows, Gemini models, preload1.
**Cập nhật 10/10/2026:** allowlist/model mặc định và luật "không rotation" dưới đây là **lịch sử**: bản local đã đổi thành 6 model, mặc định `gemini-3.5-flash`, có key pool + xoay key khi 429 (xem `AI-KEY-POOL-PLAN.md` §15–§16 và `HANDOFF.md`); phần preload1/dedupe/cache vẫn đúng.
Nguồn tham khảo chỉ đọc: D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\SangTacViet Prewarm Dịch Sẵn-2.0.14 (1).user.js, header thực2.0.15. Đã xem config/cache/preloader:10%progress, TTL8min,36cacheentries, hiddeniframe vàguardnav/cancel. Chỉ lấy ý tưởng current/next/dedupe/identity/cancel; không copy/chạy script, iframe/privateproxy/cacheHTML.

## Thao tác
- Convert/Bản gốc/Dịch AI chọn bản đọc. Dịch AI dịch chương và hiển thị trong prose; văn bản gốc/chương/Convert không bị ghi đè.
- ⚙AI chỉ cấu hình prompt/model; Lưu prompt nhớ cho truyện hiện tại trên thiết bị. Không có PIN/mã xác nhận.
- Chương trước/sau hoặc ArrowLeft/ArrowRight; không bắt phím trong input/textarea/select/contenteditable hoặc khi đang chỉnh popup/modal.
- /read/{bookId}/{chapterId}, /book/{bookId}, /settings/{group}: reload/back/forward giữ đúng trang; URL không chứa secret/source.
- Tai nghe duy nhất start/pause/resume/loadingstop; ■ dừng. AutoNext mặc định true; bản AI của chương mới phải sẵn sàng mới phát. Không autoplay sau reload.
- Dịch sẵn chương kế tiếp mặc định true vì user yêu cầu; tắt trong cấu hình. Chỉ hoạt động sau người dùng chọn Dịch AI, không gọi Google lúc chỉ mở cấu hình/trang.
- Chạy thử prompt là fixture tổng hợp trong phần thu gọn; kết quả thử không thay prose.

## Invariants
- AiReadingSession RAM giữ current+next, cachekey gồm book/chapter/revision/raw/settings/model/Names matched. Một request dùng chung nếu foreground tiếp nhận preload đang chạy.
- Chỉ sau current STOP thành công mới preload next; không fanout cả sách, không retryloop/rotation/fallback.429/lỗi có thông báo, current đã dịch không bị ghi đè bởi lỗi next.
- Đổi source/prompt/model/Names hoặc raw/Convert stop TTS, invalidate/abort đúng job; kết quả muộn không dùng. Source-loading transient giữ pendingnext để promotion.
- Prompt settings riêng dùng ai-book-settings:{bookId}, fallback legacy ai-translate-settings chung, queue save/read cùng key; không overwrite legacy khi chỉ đọc. Name riêng bookId giữ.
- Progress AI không ghi vào canonical RAW/Convert db.progress do không có mapping đoạn AI→nguồn. Trở lại Convert restore progress canonical; URL reload khôi phục chương và progress RAW/Convert. Vị trí cuộn bản AI riêng/cache qua reload chưa có.
- Prompt/Names/Album sửa về sau chưa sync cloud metadata. RAMcache không bảo đảm tránh dịch lại khi rời truyện/reload, không checkpointchươngdài.
- ChươngAI≤32000UTF16, prompt≤8000, request256KiB/response1MiB/deadline60s/STOP-only. Dài hơn hiện báo chọn Convert; không bịa hoàn thành.
- AI_MODELS là sharedallowlist8text models, Google catalogue checked08/10: https://ai.google.dev/gemini-api/docs/models . Defaultgemini-3.5-flash-lite giữ; model selected không tự đổi. Access/quota/billing các model mới tùyGoogle, không cam kết0VNĐ.
- Không đổi DBschema/cloudsnapshot/quota/auth/secret/CSP. ConvertPanel độc lập bỏrender, Readerengine/dictionaries/globalNames giữ.

## Nghiệm thu
- Chinese fixtures actualIndexedDB/Worker: current+nextdedupe, inline/sourcebytes, keyboard/deeplink/back, perbookprompt/model, failedpreload, fakeaudioautonextAI, Name-stop, source-cancel, canonicalprogress, delayedsaveclose, hydrationretry.
- Browser E2E WindowsEdge desktop/Androidviewport; mockGoogle/TikTok tách khỏi productionrealsmoke. Androidhardware/khóamàn hình chưa xác minh.
- Review độc lập GPT-6-astra/high actual tests/build/diff; xem HANDOFF-LOG kết quả cuối. Giữ fail trướcfix; không coi checkpointcũ là proof.
