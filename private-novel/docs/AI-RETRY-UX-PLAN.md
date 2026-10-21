# Kế hoạch hoàn thiện dịch AI, thử lại và giao diện

Ngày lập 15/10/2026 · Cập nhật16/10: đã hoàn tất triển khai, kiểm thử, phát hành và pilot API thật; kết quả/giới hạn tại [AI-RETRY-UX-1](AI-RETRY-UX-1.md). Các phần dưới giữ mô tả khảo sát và phương án ban đầu.

## 1. Mục tiêu và phạm vi

Người dùng cần hiểu ứng dụng làm gì sau lỗi, trả được chương nhanh và ổn định hơn, và bảng AI dễ sử dụng. Ưu tiên giảm các lượt gọi không có ích và phục hồi đúng phần còn thiếu. Tận dụng bộ chia phần, checkpoint, budget và hybrid hiện có; không viết lại toàn bộ hệ thống.

Giữ các quyết định đã chốt: hybrid là tùy chọn; nửa đầu không tự hạ xuống Lite; nửa sau có Name + toàn bộ nguồn và bản dịch nửa đầu; Convert → Dịch AI giữ trang hiện tại và chuẩn bị chương sau. Chương AI hoàn tất cao nhất, kể cả prewarm, vẫn là mốc đọc đồng bộ; bản dịch dở không cập nhật mốc.

## 2. Quy trình hiện tại — đối chiếu trực tiếp với mã

| Bước | Hành vi hiện có |
|---|---|
| Chuẩn bị | Chụp nguồn/revision, prompt, model và Name; kiểm cache hoàn chỉnh và các phần đã lưu. Cùng đầu vào đang chạy dùng chung promise. |
| Dịch thường | TXT chia gần 1.800 ký tự theo ranh giới an toàn. Hiển thị phần đầu liên tục đã hoàn thành; các phần đến sau được giữ để ghép đúng thứ tự. EPUB chia nhóm text theo ID. |
| Hybrid | Nguồn trên 1.800 ký tự chia hai nửa; hoàn tất nửa đầu mới gửi Lite nửa sau. Mỗi nửa vẫn có thể chia thành nhiều request nhỏ. Chương ngắn dùng model ưu tiên. |
| Đổi model | Khi chưa chốt model, lỗi tạm thời hoặc model 404 có thể chuyển tiếp theo chuỗi cấu hình. Chuỗi mã hiện tại: 3.8 Flash → 3.7 Flash → 3.5 Flash → Gemma 4 26B A4B → 2.5 Flash → 3 Flash Preview. Sau khi có phần thành công thì giữ model của nửa/phần tương ứng để tiếp tục nhất quán. Nửa sau hybrid hiện chỉ dùng Lite đã chọn. |
| Thử lại | Các model đầu thường được thử một lần rồi chuyển; model đã chốt/đơn lẻ và một số phần con ở model cuối có tối đa hai retry tạm thời, khoảng 0,6 rồi 2,5 giây kèm jitter. Timeout đoạn dài có thể đi thẳng đến chia nhỏ. Bộ chạy phần còn có một vòng phục hồi phần lỗi khi đủ điều kiện. Vì thế không thể mô tả cả chương là “chỉ thử lại 2 lần”. |
| Chia phần lỗi | Có thể chia khi bị cắt do giới hạn đầu ra hoặc một số lỗi tạm thời; tối đa ba tầng, tối đa 15 lần gọi bộ gửi trong một cây phục hồi. Không chia vì 429; EPUB giữ các ID, không cắt JSON thô. |
| Quota/keys | Server chọn key theo policy hiện có, thử tuần tự trong một request; 429 cho phép sang key khác, lỗi key có xử lý riêng, 5xx không dùng để xoay key hàng loạt. Client giảm số phần đồng thời xuống một khi quota. Tối đa hai phần đồng thời chỉ khi đã được server báo khả năng; không tăng mức này. |
| Đếm ngược | Reader có tối đa ba lần tự gọi lại sau cooldown hợp lệ, dùng lại budget của cùng công việc. Một số lỗi chuyển model cũng mang thời gian chờ. Thử thủ công mở một budget mới; phần/cache hợp lệ vẫn được dùng lại. |
| Giới hạn dừng | Server 30 giây/request; client 40 giây/request. TXT ngắn 240 giây/24 lượt gọi translator; TXT dài trên 1.800 và EPUB dùng giới hạn ngoài 600 giây/256 lượt. Hybrid còn có giới hạn con. Đây là trần chống chạy mãi, không phải thời gian dịch dự kiến. Cache đọc tối đa 2 giây, ghi 1 giây. |
| Lưu prompt | Lưu không tự làm lại phiên hiện tại. Prompt mới áp dụng khi retry/chuyển phiên; chỉ sửa nửa sau có thể dùng lại checkpoint nửa đầu nếu nguồn, Name và đầu vào nửa đầu còn khớp. |

Nguồn chính: [ai-reading.ts](../src/ai-reading.ts), [ai-recovery.ts](../src/ai-recovery.ts), [ai-complete.ts](../src/ai-complete.ts), [ai-parts.ts](../src/ai-parts.ts), [ai-hybrid.ts](../src/ai-hybrid.ts), [ai-job.ts](../src/ai-job.ts), [Reader.tsx](../src/ui/Reader.tsx), [server/ai-translate.ts](../server/ai-translate.ts).

## 3. Những điểm đã thấy và điểm cần đo

**Đã thấy trong mã/giao diện:**

- Retry có nhiều lớp nhưng người đọc chủ yếu thấy tên model và thông báo lỗi. Countdown/chương đang đọc/chương sau cần có danh tính tác vụ rõ ràng; không dùng chung trạng thái mơ hồ.
- `server/ai-translate.ts` chuyển HTTP 400 chưa nhận diện sang 502 `ai_upstream_error`. Client có thể coi đây là lỗi tạm thời và gửi lại. Cần giữ phân loại lỗi yêu cầu, không chỉ đổi câu thông báo.
- “Dịch lại bằng…” ở Reader thay model cho toàn chương. Khi Lite nửa sau lỗi, thao tác này có thể làm lại nửa đầu dù người dùng chỉ muốn cứu nửa sau.
- Thông báo giữ phần chưa phân biệt đã có trong RAM và đã ghi được xuống máy. Cache là tùy chọn và có thể ghi thất bại; không được hứa chắc tải lại sẽ còn tất cả.
- Bảng AI dài, ô 12px và hướng dẫn 11px, nhiều textarea, nút Lưu ở sâu. Model, tiến độ, prompt nâng cao và keys chưa có thứ bậc rõ.
- Danh sách keys hiện được tải khi mở panel và lặp mỗi 5 giây cả khi mục keys đóng. Có thể chỉ tải khi người dùng mở mục này, dừng khi đóng/ẩn trang.
- Metrics hiện có nhiều lớp, trong đó hybrid có session con. Báo cáo phải lấy một công việc chương làm mẫu số, tránh đếm hai nửa như hai chương thành công.

**Chưa kết luận:** ảnh người dùng không chứa trace HTTP của lần lỗi. Chưa xác nhận model/key nào gây lỗi lần đó, chưa có số đo trước/sau để hứa giảm thời gian hoặc tăng bao nhiêu phần trăm. Tài liệu cũ có chuỗi model/giới hạn đã thay đổi; kế hoạch này lấy mã hiện tại làm chuẩn.

## 4. Thứ tự triển khai

### P0 — Phân loại lỗi và làm rõ hành động phục hồi

1. Thêm một kết quả phân loại an toàn dùng chung: `category`, `retryable`, `retryAt`, `stage`, `reason`. Server giữ đúng nhóm 400/401/403/404/429/5xx; chỉ gửi mã/nhãn nằm trong allowlist, không đưa nguyên body Google ra UI/log. Phân biệt 400 sai tham số với lỗi key đã có policy riêng.
2. Kiểm cấu hình request theo từng model: model ID, hỗ trợ system instruction, temperature và giới hạn đầu ra. Tài liệu Google hiện ghi một số model mới bỏ qua tham số sampling; không tự kết luận đó là nguyên nhân lỗi. Chỉ đổi payload khi đã đối chiếu model thực tế; thay đổi có ảnh hưởng đầu ra phải đưa vào identity cache tương ứng.
3. Tách các hành động: **Tiếp tục phần còn thiếu**, **Đổi model nửa sau**, **Dịch lại toàn chương**. Nút cuối nằm trong “Tùy chọn khác”, mô tả rõ sẽ cần thêm lượt dịch. Không thêm hộp xác nhận phụ.
4. Đổi Lite/prompt nửa sau chỉ vô hiệu phần sau; giữ nửa đầu đúng identity. Nếu thay nguồn, Name hoặc prompt nửa đầu thì không tái dùng checkpoint sai. Có lỗi cố định thì nút dẫn tới chỗ cần sửa, thay vì lặp request y hệt.

**Nghiệm thu P0:** 400 sai tham số không chạy chuỗi retry mù; lỗi nửa sau/đổi Lite không gọi lại nửa đầu hợp lệ; lỗi auth không chuyển thành countdown quota; lỗi model thật sự không tồn tại được fallback đúng policy.

### P1 — Điều phối retry có giới hạn và giảm chờ không có ích

Mở rộng `AiChapterJob` và event hiện có, giữ bộ chia/checkpoint; không thêm nền tảng chạy nền mới.

| Tình huống | Cách xử lý đề xuất |
|---|---|
| 429 / key đang bận | Tôn trọng `Retry-After`, cùng model đang chờ không bị các lớp gửi dồn. Chỉ một lịch retry cho mỗi công việc; không tăng concurrency/keys để né quota. |
| Mạng/5xx trước phần thành công | Tiếp tục ưu tiên fallback theo thứ tự đã chọn; bỏ qua model còn cooldown trong cùng phiên. Không tự sửa thứ tự đã lưu dựa trên một lần lỗi. |
| Mạng/5xx sau khi chốt model | Chỉ phục hồi phần thiếu; tối đa hai lần gửi lại **cùng đầu vào + model** trong một lượt công việc, dùng chung bộ đếm giữa retry nội bộ và bộ chạy phần. Khoảng chờ đề xuất 1s rồi 2s + jitter, luôn dưới deadline. |
| Timeout hoặc output bị cắt | Giữ cách chia nhỏ phần lỗi hiện có; với đầu vào đủ dài thì ưu tiên chia sau timeout đầu, không lặp nguyên phần lớn nhiều lần. Giữ ranh giới Name, Unicode và nhóm EPUB. |
| Mất mạng trình duyệt | Chuyển “Chờ kết nối”, không liên tục gửi lại; khi online chỉ tiếp tục nếu đúng công việc còn được chọn và còn budget. |
| Hết deadline/lượt gọi | Dừng rõ ràng, giữ checkpoint, cho thử thủ công. Không tạo countdown sẽ hết sau deadline rồi vẫn báo “sắp dịch”. |
| Người dùng bấm retry nhiều lần | Gộp về một promise/tác vụ, không mở nhiều lượt song song; manual retry vẫn tôn trọng cooldown server. |
| Dừng/chuyển chương | Hủy request và timer của đúng target; kết quả trả muộn không ghi lên chương mới. |

Chương hiện tại ưu tiên hơn prewarm. Mở đúng chương đang prewarm sẽ tiếp nhận công việc đang chạy, không hủy rồi gửi lại chỉ vì đổi vai trò. Phải giữ hành vi Convert không nhảy trang và prewarm không tự cập nhật vị trí cuộn.

Thêm trạng thái có nguồn rõ: target hiện tại/chương sau, nửa đang dịch, model ưu tiên/model thực tế, số phần hoàn tất, nguyên nhân chờ, lần phục hồi, thời điểm retry và checkpoint đã ghi/đang giữ trong phiên. Sự kiện của tác vụ cũ không được cập nhật tác vụ mới. Giữ nguyên trần thời gian/lượt gọi hiện tại trong đợt đầu.

**Nghiệm thu P1:** không request trước cooldown; không nhân số retry do đi qua nhiều lớp; không gửi lại phần đã hoàn tất hợp lệ; không request trùng khi prewarm thành foreground; dừng là hết timer/lượt gọi mới. Kiểm bộ đếm ở từng nửa và ở toàn chương.

### P2 — Bảng AI gọn, trạng thái đọc được ngay

Thứ tự từ trên xuống:

1. **Tiến độ**: chương hiện tại/chương sau; trạng thái nửa 1 và nửa 2; model thực tế; hành động tiếp tục/dừng ngay tại đây.
2. **Cách dịch**: Dịch thường / Dịch kết hợp; model nửa đầu và nửa sau. Chuỗi dự phòng thu gọn, có thể mở xem.
3. **Prompt**: mẫu của truyện; hai mục “Nửa đầu” và “Nửa sau” khi hybrid. System Prompt chung và nhiệt độ ở “Nâng cao”. Model không hỗ trợ tham số thì giải thích và không để điều khiển gây hiểu nhầm.
4. **Name, thử prompt, API keys** thu gọn. Giữ nút thử mẫu; phân biệt rõ phép thử mẫu với dịch chương thật.
5. Thanh nút Lưu cố định cuối panel; báo “Có thay đổi chưa lưu”. **Lưu** giữ phiên đang chạy; khi đang lỗi có thêm **Lưu và tiếp tục** để chủ động dùng bản mới, giải thích phần nào phải dịch lại. Không tự gửi AI vì đang gõ prompt.

Ví dụ trạng thái (các số chỉ minh họa, không phải số đo):

```text
Dịch AI · Chương 53                         Đóng
Nửa đầu   ✓ Hoàn tất · Gemini 3.7 Flash
Nửa sau   2/4 phần · Gemini 3.5 Flash-Lite
API đang bận · thử lại sau 12 giây
[Dừng tự thử lại]                  [Chi tiết]

Khi dừng vì lỗi:
[Tiếp tục phần còn thiếu]          [Tùy chọn khác]
```

Chi tiết mở rộng chứa lịch sử ngắn “model A lỗi → model B → nửa sau”, mã lỗi/request ID an toàn và thời gian. Nhãn thông thường không chứa token, lease hoặc tên hàm. Dịch xong chỉ hiện model vài giây rồi ẩn; không đưa lại thông báo prewarm thành công trùng badge.

Panel desktop rộng vừa nội dung và giới hạn viewport; mobile dùng gần toàn chiều rộng, body cuộn một vùng, header/footer cố định. Editor prompt mở rộng riêng, có nút chèn biến và hướng dẫn ngắn bên cạnh; tránh nhiều ô cuộn lồng nhau trong màn nhỏ. Cỡ chữ ô nhập tối thiểu 16px trên mobile, nút bấm tối thiểu 44px; tương phản theo theme, focus rõ, Esc đóng và trả focus. `aria-live` báo đổi trạng thái, không đọc lại mỗi giây đếm ngược. Bàn phím không che nút Lưu; kiểm viewport thấp/xoay màn hình.

**Nghiệm thu P2:** tìm thấy model đang dùng/lý do chờ/nút tiếp tục mà không cuộn; sửa riêng nửa sau và lưu được trên mobile; không mất vị trí đọc; không polling keys khi mục đóng; không tràn ngang ở 360px hoặc 869×835 như ảnh.

### P3 — Đo hiệu quả và nghiệm thu phát hành

- Bổ sung metrics tối thiểu ngay từ P0 để có baseline: một ID cho mỗi chương/lượt chủ động; session con gắn ID cha. Đếm request client riêng với các retry, cache hit riêng với dịch mới; không gọi số request client là số key đã thử.
- Đo thời gian có phần đầu đọc được, thời gian hoàn tất, số request/chương, số phần dùng lại, nhóm lỗi và model mỗi nửa. Chỉ lưu mã và số đo đã lọc, không nguồn/prompt/Name/keys.
- Benchmark pilot: cùng ba chương được chọn (ngắn, khoảng 3–5 nghìn ký tự có Name, dài), cùng prompt/Name/model; trước và sau mỗi chương hai lần, xen kẽ thứ tự chạy. Tổng tối đa 12 công việc, dừng ở 96 request client hoặc 15 phút; chưa xong thì báo mẫu thiếu. Không prewarm, không ghi cloud/tiến trình thật, cache fresh được phân biệt với resume. Dùng mock fault injection cho phần lớn trường hợp lỗi để hạn chế gọi API thật.
- Báo `x/n chương hoàn tất`, lỗi/dừng riêng; thời gian từng lần và trung vị trên cặp cùng điều kiện. Với 12 công việc chỉ là pilot, không dùng để hứa tỷ lệ thành công lâu dài hay p95 đáng tin cậy. Chất lượng kiểm đủ đoạn/đoạn kết, nhãn/thuật ngữ, phủ định và nhân quả; STOP chỉ là điều kiện kỹ thuật, không bảo đảm dịch đúng nghĩa.
- Mục tiêu nghiệm thu chắc chắn: không mất/đổi nguồn, không công nhận thiếu chương, không gọi lại checkpoint hợp lệ, không vi phạm budget/quota, thao tác UI rõ ràng. Chỉ công bố cải thiện tốc độ nếu số đo hỗ trợ và chất lượng không giảm.

## 5. Phạm vi tệp và kiểm thử

| Nhóm | Tệp chính |
|---|---|
| Lỗi và tương thích | `server/ai-translate.ts`, `src/ai-translate.ts`, `src/ai-models.ts`; có thể thêm helper nhỏ về capability đã xác minh |
| Retry/trạng thái | `src/ai-job.ts`, `src/ai-recovery.ts`, `src/ai-reading.ts`, `src/ai-parts.ts`, `src/ai-complete.ts`, `src/epub-ai.ts`, `src/ai-hybrid.ts`, `src/ai-metrics.ts` |
| UI | `src/ui/Reader.tsx`, `src/ui/AiPanel.tsx`, `src/ui/AiFallbackFields.tsx`, `src/stv-layout.css`, `src/style.css` |

Ưu tiên mở rộng các test đang có: ai-recovery/job/parts/hybrid/pair/cache và server classification. E2E liên quan: `ai-stall`, `ai-prewarm-recovery`, `ai-persistent-cache`, `ai-hybrid`, `ai-hybrid-save-independent-review`, `epub-ai-hybrid-pair`, `convert-ai-next`, `ai-reading-progress`.

Ca bắt buộc: 400,401,403,404,429 ngắn/dài,5xx,offline,timeout,output_limit; lỗi ở nửa 1/nửa 2; chỉ có checkpoint con; lỗi ghi cache; reload/resume; hai lượt bấm retry; save khi đang dịch và khi lỗi; chuyển prewarm sang foreground; cancel/late response; EPUB ID; mốc đọc không tăng với bản dở và không lùi khi mở chương cũ.

Chạy targeted trong phát triển. Trước phát hành logic phục hồi/cache: reviewer độc lập gpt-6.1-sol/high theo AGENTS, root full unit + build + E2E liên quan, các kiểm tra nặng tuần tự. Chỉ repeat ca race/flaky. Smoke production trong phiên cô lập dữ liệu tổng hợp; báo riêng Android-layout với Android thật. Triển khai theo quyền đã có trong phiên sau khi nghiệm thu; chỉ đánh dấu xong khi smoke xác nhận bản phát hành. Lượt lập kế hoạch này không chạy các bước đó.

Giữ nguồn, bytes/SHA, revision, checkpoint identity, EPUB DOM, atomic/cancel; giữ server secrets/key policy/lease/concurrency; không thêm provider/tier, nâng dependency hoặc thay schema đồng bộ. Sửa prompt/capability không được tái dùng cache có đầu vào khác. Bản dịch hoàn chỉnh cũ chỉ thay khi kết quả mới hợp lệ, không xóa trước khi retry.

## 6. Tài liệu tham chiếu và điểm bắt đầu

- [Google: chiến lược retry](https://ai.google.dev/gemini-api/docs/troubleshooting): retry có giới hạn, backoff/jitter và phân biệt lỗi tạm thời với lỗi yêu cầu.
- [Google: mã lỗi API](https://ai.google.dev/gemini-api/docs/api-errors): căn cứ chuẩn hóa nhóm lỗi, không suy tất cả 4xx là cùng một nguyên nhân.
- [Cloudflare Request](https://developers.cloudflare.com/workers/runtime-apis/request/): đối chiếu signal/hủy theo compatibility hiện tại; không đổi compatibility date để né lỗi.
- [Hybrid cặp nguồn/bản dịch](AI-HYBRID-PAIR-3.md), [mốc đọc AI đồng bộ](AI-READING-PROGRESS-1.md).

Không cần câu hỏi bắt buộc trước khi triển khai. Bắt đầu bằng P0 với regression tái hiện phân loại 400 và hành động đổi model khi Lite lỗi; sau đó P1 → P2 → P3. P0/P1 là ưu tiên để UI phản ánh đúng trạng thái thực tế.
