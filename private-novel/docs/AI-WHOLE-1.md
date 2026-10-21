# Gửi nguyên chương khi tắt hybrid

Phát hành đầu Pages5af7c625/index-BmE8ViGx; hiện Pagesd09d36b5/master index-BXNphOti.js kèm TXTappend. AIWorker không đổi.

TXT fresh gửi nguyên chương nếu≤32.000 ký tự nguồn. Chỉ chia tại giới hạn API hoặc phục hồi truncation/copied-source/lỗi được phép hiện có. EPUB gom đúng JSON IDs trong≤32.000 ký tự JSON thực (bao gồm escape/key/comma), không cắt Name khi payload còn vừa. Hybrid opt-in vẫn giữ hai giai đoạn; các đoạn trong mỗi giai đoạn được gom tương tự. Giữ timeout first60/idle30/hard180s và policy keys/concurrency hiện có.

Full cache key giữ nguyên. Partial plan mới txt-whole-1/epub-whole-1; đọc song song plan cũ txt-parts-2/epub-parts-2 trong chung budget2s. Chỉ dùng checkpoint đã kiểm đúng spans/IDs/model; adopt cả plan cũ để không diễn giải sai đoạn cũ thành nguyên chương. Probe cache bị treo không làm mất probe đã hoàn tất. Model pin/cancel/checkpoint/complete-only publication giữ.

Reader picker chỉ hiện latest theo tên+scope, không lịch sử ngày/optgroup. Nếu truyện đang chọn phiên bản cũ thì hiện Tùy chỉnh của truyện và giữ nguyên thiết lập; chỉ đổi khi người dùng chọn mẫu mới. Kho và ID không xóa/migrate.

Kiểm chứng: root127files/1683tests PASS, build PASS, reviewer15case + static chấp nhận;14E2E desktop/Android-layout PASS. TEMP mặc định Windows AccessDenied; chạy lại với TEMP/TMP riêng đúng quy định, không đổi dependency. Production synthetic/mock stream5.407chars→1call, cache chỉ sau complete, source nguyên, không cloud writes; scripts/smoke-ai-whole-production.mjs.

API thật tổng hợp Gemini2.5 cùng source2.200chars/prompt/Name, tuần tự không retry/fallback: whole1call14.432s; split1749+451chars2calls19.156s. Tất cả STOP/0Han; whole nhanh hơn24,7% trong duy nhất lần thử này. Output khác độ dài, chưa chấm ngữ nghĩa đầy đủ, không suy ra xác suất hay bảo đảm tốc độ. scripts/probe-ai-whole-vs-split.mjs, logs .dsh-tmp/ai-whole-probe/. ♾ chưa thêm: không thay thế API STOP/coverage và không làm model sinh nhanh hơn.
