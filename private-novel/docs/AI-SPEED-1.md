# Phương án tăng tỷ lệ hoàn thành và tốc độ dịch AI

Ngày 14/10/2026. Trạng thái: **đã triển khai và phát hành phần tăng độ ổn định/tốc độ**; cấu hình suy luận thấp và streaming là thử nghiệm tùy chọn chưa bật. Phạm vi là luồng dịch chương TXT/EPUB hiện có. Ưu tiên: trả đủ chương đúng cấu trúc → thời gian nhận đủ chương → thời gian thấy đoạn đầu. Không coi bản dịch một phần là thành công.

## M0 triển khai

Phạm vi code: ai-complete/parts/reading/epub-ai/reading-cache/recovery/job/metrics và phần AI của Reader. Cache phần dùng đường con giới hạn ba cấp dưới plan v2; định dạng cũ giữ nguyên, không migration dữ liệu truyện. Splitter cân đối trong trần 1.800; hint đã kiểm tra còn hiệu lực 60 giây chỉ mở tối đa hai worker và vẫn dùng lease máy chủ. Phục hồi thêm tối đa một lượt cho phần lỗi tạm thời, cùng ngân sách công việc; 429 chờ và giảm còn một worker, không tách thêm yêu cầu. Checkpoint chỉ nhận kết quả STOP đã kiểm tra, EPUB giữ đầy đủ node/ID/Unicode/Name. Ghi cache theo hàng có giới hạn, hủy/late-write/source/revision guards giữ nguyên. Đổi model toàn chương chỉ khi người dùng bấm nút riêng; không trộn cache/model và không lưu đè cài đặt truyện. Số liệu chỉ trong RAM, tối đa 128 công việc, không nội dung/key/cloud.

Nghiệm thu: test độc lập checkpoint TXT/EPUB/reload/model/quota/cancel/native IndexedDB/Name boundary; full unit + build + E2E đúng luồng. Review độc lập gpt-6.1-sol/high theo AGENTS.md. Không thêm provider/billing/dependency/lease timeout; cấu hình suy luận thấp và streaming vẫn là phép thử/đợt tùy chọn sau, không bật mặc định khi chưa có bằng chứng chất lượng.

## Căn cứ trước đợt triển khai

- `src/ai-parts.ts`: chia TXT khoảng 1.800 ký tự; chạy phần đầu trước để chọn model, sau phản hồi máy chủ mới mở tối đa hai yêu cầu đồng thời. Chỉ ghép phần liên tục theo thứ tự nguồn để đọc sớm.
- `src/ai-reading.ts`, `src/epub-ai.ts`: đã có cache chương/phần, resume phần hoàn chỉnh, khóa model trong chương, giới hạn thời gian và số yêu cầu dùng chung. Đây là nền tảng cần giữ, không phải tính năng còn thiếu toàn bộ.
- `src/ai-parts.ts`: một phần thất bại sau phục hồi làm dừng việc cấp các phần chưa chạy; các phần đang chạy vẫn có thể hoàn tất. Việc chờ ghi cache giữ một vị trí xử lý mạng đến khi ghi xong hoặc hết hạn.
- `src/ai-complete.ts`: khi cứu một phần bằng chia đôi, kết quả đoạn con nằm trong lời gọi hiện hành. Nếu đoạn con sau vẫn thất bại, đoạn con trước chưa trở thành checkpoint riêng để dùng sau reload.
- `src/ai-reading.ts`: sau khi có phần thành công, model được cố định. Điều này tránh trộn giọng dịch, nhưng khi model đó lỗi kéo dài thì cần chính sách phục hồi rõ ràng; không thể đơn giản đổi model cho một phần còn thiếu.
- `server/ai-translate.ts`: dùng `generateContent`, chưa stream chữ; chưa đặt `thinkingConfig`. Request máy chủ có hạn 30 giây, key lease 35 giây. Không tăng timeout độc lập với vòng đời lease.
- Lần thử thật trước đây: nguồn tổng hợp 3.936 ký tự, ba phần 1.784/1.771/381 ký tự, thấy phần đầu sau 12,1 giây, đủ chương sau 27,1 giây, đồng thời tối đa hai request. Đây là **một mẫu**, không phải tốc độ trung bình hay tỷ lệ thành công của sản phẩm. Bằng chứng: `.dsh-tmp/ai-parts/production-real-observed.json` và `docs/AI-PARTS-1.md`.

## 1. Đo đúng kết quả trước khi điều chỉnh

Mỗi lần dịch có một mã công việc; retry, đổi key và phần con vẫn thuộc cùng công việc. Ghi thời gian chờ local/cache, chờ quyền dùng key, API, phục hồi, kiểm tra và ghi cache. Chỉ lưu số liệu và mã lỗi an toàn, không ghi nội dung truyện, prompt, Name hoặc key.

Theo dõi riêng:

| Chỉ số | Cách hiểu |
| --- | --- |
| Tỷ lệ đủ chương | Số công việc trả đủ chương đã kiểm tra / số công việc bắt đầu; công bố cả số người dùng chủ động hủy, không âm thầm bỏ lỗi mạng/quota khỏi mẫu |
| Thành công trong thời gian mục tiêu | Với chương thường, đo thêm mốc 60 và 120 giây; chương dài/EPUB báo riêng theo độ dài và số phần |
| Cứu lỗi tự động | Trong số công việc từng có lỗi tạm thời, bao nhiêu công việc hoàn thành mà không cần bấm lại |
| Tiếp tục thành công | Sau bấm tiếp tục hoặc reload, giữ được bao nhiêu phần và mất bao lâu để hoàn tất; không cộng lần này vào thành công tự động của lần trước |
| Tốc độ | Thời gian thấy đoạn đầu và nhận đủ chương; báo trung vị và nhóm chậm nhất, kèm số mẫu |
| Chi phí phục hồi | Số yêu cầu, token, lỗi 429 và số phần phải dịch lại trên mỗi chương |

Tách cache hit, dịch mới, dịch sẵn; tách TXT/EPUB, model và độ dài. Kết quả HTTP 200 hoặc `STOP` chưa chứng minh dịch đúng nghĩa: vẫn cần kiểm mẫu về thiếu nội dung, thuật ngữ và bố cục.

## 2. Làm trước: giữ công đã dịch và cứu đúng lỗi

**A. Checkpoint cả phần con.** Mỗi đoạn con sau chia nhỏ có ID ổn định theo vùng nguồn và đường chia. Lưu riêng sau khi kiểm tra hoàn chỉnh. Nếu phần 3b lỗi thì tiếp tục 3b, dùng lại 3a. Khóa cache phải gồm nguồn/revision, model, prompt/cấu hình, Name liên quan, ngữ cảnh và phiên bản kế hoạch chia. Không dùng cache khác cấu hình để tăng số thành công giả.

Riêng EPUB, hiện cơ chế cứu lỗi chỉ tách nhóm có từ hai mảnh trở lên. Nhóm còn một mảnh dài chưa có đường chia nhỏ tiếp. Bổ sung chia mảnh đó có giới hạn, giữ ánh xạ về node gốc và Name; chỉ công nhận mảnh gốc sau khi đủ các mảnh con đã kiểm tra. Áp dụng checkpoint cho cả TXT và EPUB, không chỉ phần TXT nhìn thấy trên màn hình.

**B. Phân biệt lỗi cục bộ với lỗi toàn luồng.** Phần lỗi tạm thời đi vào hàng đợi phục hồi; các phần độc lập khác được tiếp tục trong ngân sách còn lại. Ưu tiên phần đang chặn đoạn đọc liên tục. Nếu cả model/pool đang quá tải, dừng cấp thêm việc và chờ cùng một mốc, tránh tất cả phần tự retry cùng lúc.

| Lỗi | Xử lý đề xuất |
| --- | --- |
| Mất mạng ngắn | Giữ checkpoint, chờ mạng trở lại trong hạn công việc rồi tiếp tục; hết hạn thì hiện nút tiếp tục |
| 429 / quota / key đang bận | Tôn trọng `Retry-After`, giảm đồng thời từ hai xuống một, tạm dừng dịch sẵn; không chia nhỏ rồi gửi thêm hàng loạt |
| 500/502/503/504 tạm thời | Retry có khoảng nghỉ tăng dần và jitter, giới hạn theo phần và toàn chương; vẫn theo chính sách key máy chủ |
| Timeout lặp lại hoặc hết token đầu ra | Chia nhỏ đúng phần lỗi, giữ vùng nguồn và checkpoint các phần con; không lặp nhiều lần cùng đầu vào dài |
| EPUB sai/thiếu ID | Không công nhận nhóm đó hoàn chỉnh; thử lại nhóm lỗi trong giới hạn, kiểm đủ ID khi ghép |
| Prompt/request sai, quyền truy cập, nội dung bị nhà cung cấp chặn | Hiện nguyên nhân và hành động phù hợp; không retry vô hạn hoặc báo hoàn thành |

Giữ retry có giới hạn hiện có làm nền; điều chỉnh bằng số liệu thay vì tăng tất cả số lần thử. Hướng dẫn Gemini cũng yêu cầu backoff, jitter, phân loại lỗi và giới hạn retry: [Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting).

**C. Cứu trường hợp model đã khóa bị lỗi kéo dài.** Trước hết thử key khác hợp lệ trên cùng model theo policy máy chủ, giữ các phần đã có. Nếu hết cửa phục hồi: cung cấp “Dịch lại bằng model dự phòng”, tạo lượt riêng cho toàn chương, giữ cache cũ riêng và chỉ thay bản hoàn chỉnh sau khi lượt mới đủ. Chưa mặc định tự dịch lại cả chương vì có thể tốn thêm nhiều token. Không ghép âm thầm nửa chương từ model A với nửa chương từ model B.

Mọi nhánh phục hồi tự động vẫn chia sẻ ngân sách thời gian và số lần gửi của công việc ban đầu; không đặt lại bộ đếm khi đổi key, tách phần hoặc chọn model dự phòng. Người dùng chủ động bắt đầu lượt mới là một hành động riêng, được thống kê riêng.

## 3. Tăng tốc mà vẫn giữ tỷ lệ thành công

**A. Cân đối kích thước phần.** So sánh các mốc khoảng 1.200/1.800/2.400 ký tự với cùng nguồn và model; chọn theo thời gian đủ chương, lỗi timeout và token, không chỉ đoạn đầu. Phân phối lại phần đuôi quá ngắn nhưng không vượt trần đã chọn, không cắt mất Name/Unicode/cấu trúc EPUB. Không tự đổi toàn bộ kế hoạch giữa lượt đang dịch; phần gặp lỗi mới chia tiếp. Đo chi phí số request vì chia càng nhỏ không đồng nghĩa càng nhanh.

**B. Mở hai phần ngay từ đầu khi đủ điều kiện.** Chỉ dùng khi đã xác định model và có tín hiệu khả dụng gần đây từ máy chủ; máy chủ vẫn cấp lease nguyên tử cho từng request và có thể từ chối nếu pool bận. Không thêm một vòng gọi AI chỉ để kiểm tra key trước mỗi chương. Khi chưa có thông tin đáng tin cậy, giữ bước đầu tuần tự. Hint chỉ là gợi ý; không được làm mất khóa model, giới hạn hai request hoặc khóa dùng key.

**C. Tách thời gian ghi cache khỏi vị trí chạy mạng.** Kết quả đã kiểm tra vào RAM trước; hàng ghi đĩa có giới hạn, thứ tự và kiểm tra hủy/nguồn hiện hành riêng. Phần tiếp theo không phải đợi ghi đĩa xong. Chưa ghi thành công thì không hứa phục hồi được sau đóng tab; trạng thái “đã dịch” và “đã lưu” phải phân biệt. Ghép và lưu toàn chương vẫn yêu cầu đầy đủ các phần hợp lệ.

**D. Thử mức suy luận thấp theo đúng model.** Đo biến thể `thinkingLevel: low` khi model hỗ trợ; Gemini 2.5 dùng `thinkingBudget`, không dùng chung một cấu hình cho mọi model. Đưa cấu hình thực tế vào dấu vân tay cache. Chỉ chọn làm mặc định nếu bản dịch giữ độ đầy đủ và thuật ngữ; không giảm `maxOutputTokens` để tạo cảm giác nhanh nhưng bị cắt nội dung. Căn cứ: [Thinking trong Generate Content](https://ai.google.dev/gemini-api/docs/generate-content/thinking).

**E. Ưu tiên chương đang cần đọc.** Chuẩn bị dữ liệu/kế hoạch chương sau sớm; chỉ gửi AI khi có năng lực rảnh, không tranh hai vị trí cần để hoàn thành chương hiện tại. Bấm từ Convert vẫn giữ nguyên Convert và vị trí đọc, dịch sẵn chương sau theo lựa chọn đã chốt. Khi người dùng sang chương đã prewarm, tiếp quản cùng công việc, không gửi trùng.

Nhiều key trong cùng project vẫn chia sẻ quota. Giữ tối đa hai request và giảm tải khi cần có thể tốt hơn mở thêm nhiều request. Không thêm provider, tier hoặc billing trong phương án này. Căn cứ quota: [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

## 4. Giao diện để người đọc biết đang diễn ra gì

- Bình thường: `Đã dịch 3/5 phần · Đang dịch phần 4 và 5`.
- Đang cứu lỗi: `Đã giữ 4/5 phần · Đang thử lại phần 3`.
- Chờ quota: `Đã giữ 4/5 phần · Thử lại sau 12 giây` — đếm theo mốc chờ thực tế.
- Hết hạn: `Đã giữ 4/5 phần` + **Tiếp tục phần còn thiếu**; không bắt dịch lại toàn bộ bằng cùng model.
- Bản dịch đang hiện không tự nhảy vị trí khi phần khác hoàn tất. Tiến độ đọc là tiền tố liên tục; số phần xong có thể bao gồm phần đến sau. Chỉ hiện hoàn tất 100% và cho TTS dùng khi đủ chương đã kiểm tra.

Streaming chữ đặt sau các việc trên: có thể giúp thấy chữ sớm, nhưng không tự bảo đảm đủ chương nhanh hơn hay ít lỗi hơn. Nếu làm, cần tách bản nháp với phần hoàn chỉnh, xử lý luồng đứt, lọc nội dung suy luận, kiểm ID EPUB và giữ lease tới hết request. Không gộp thành điều kiện tiên quyết của đợt cải thiện độ ổn định.

## 5. Thứ tự triển khai và nghiệm thu

1. **Đo và phân loại:** thêm số liệu, xác định nhóm lỗi thực tế; giữ nguyên hành vi dịch.
2. **Tăng tỷ lệ hoàn thành:** checkpoint phần con, hàng phục hồi có giới hạn, điều tiết quota, tiếp tục phần thiếu và trạng thái rõ ràng. Trọng tâm đầu tiên theo yêu cầu mới.
3. **Tăng tốc đủ chương:** thử chia cân đối và mức suy luận, sau đó tối ưu cấp việc/ghi cache và dịch sẵn. Thay từng yếu tố để biết hiệu quả từ đâu.
4. **Streaming nếu còn cần:** chỉ sau khi luồng hoàn tất và phục hồi đã ổn định.

Mục tiêu thử nghiệm: giảm ít nhất 50% số chương thất bại do lỗi tạm thời có thể phục hồi; giảm khoảng 25% thời gian trung vị nhận đủ chương so với cùng bộ đo. Đây là mục tiêu, chưa phải kết quả hay cam kết 98–99%. Không đánh đổi thiếu nội dung, số lỗi 429 hoặc token tăng mất kiểm soát để đạt tốc độ.

Kiểm thử tự động cần bao phủ: phần giữa lỗi nhưng phần khác thành công; chia đôi rồi con sau lỗi; reload tiếp tục đúng phần con; phản hồi sai thứ tự; nguồn/Name/prompt đổi khi đang ghi; xóa truyện/hủy trong lúc hash/transaction; quota chung và keylease; model đã khóa hết khả dụng; EPUB giữ đủ node/ảnh/style; đoạn dài không dấu câu. Lỗi toàn provider hoặc hết quota không được báo thành công giả.

Đo thật bằng nguồn tổng hợp cô lập, các cặp thử trước/sau cùng model và cấu hình; thí điểm nhỏ 10–20 cặp có trần request/token trước khi mở rộng. Cỡ mẫu nhỏ chỉ chọn cấu hình, chưa đủ chứng minh tỷ lệ 99%; báo số thành công/tổng mẫu và tiếp tục tổng hợp trong sử dụng thực tế. Không dùng hoặc tải các tệp truyện D: vào bài đo.

Khi sửa checkpoint/cache/splitter/lease: chốt invariant và phạm vi trước khi code, review độc lập, full unit + build + E2E liên quan theo AGENTS.md; triển khai và smoke là bước riêng. Giữ nguyên bytes nguồn, kiểm tra đầy đủ, transaction nguyên tử, cancellation và chính sách secret.

## 6. Kết quả triển khai 14/10/2026

- Checkpoint TXT và EPUB lưu từng phần con đã kiểm tra; reload khôi phục đúng cây chia và chỉ gửi phần thiếu. EPUB có thể cứu một node dài bằng chia nhỏ nhưng ghép lại đúng ID, giữ DOM/ảnh/style.
- Chia cân đối trong trần 1.800 ký tự, bảo vệ Name chồng lấn và cặp Unicode. Một lượt phục hồi bổ sung có giới hạn cho khoảng trống tạm thời; phần khác vẫn tiến triển. Không chia tiếp vì lỗi quota/auth/safety.
- Hint hai request đã xác thực còn hiệu lực 60 giây giúp chương sau bắt đầu nhanh. 429 điều tiết cả các retry HTTP bên trong, chờ chung và giảm còn một request. Lease/key policy máy chủ giữ nguyên.
- Ghi cache theo hàng giới hạn tách khỏi vị trí mạng. Ngân sách số lần gửi và deadline gốc giữ qua retry tự động, hủy/tiếp quản và prewarm; thao tác dịch lại thủ công tạo lượt mới. Thống kê gộp theo mã công việc, tối đa 128 mục RAM, không lưu nội dung hoặc key.
- Bỏ chờ từ điển Convert khỏi luồng AI. Giao diện hiện phần đã giữ/chờ quota/khôi phục; nút đổi model dịch lại toàn chương không trộn cache hay sửa model ưu tiên của truyện. Chương sau dùng cài đặt đã lưu, tiếp quản không gửi trùng. Name đổi hủy đúng công việc; lỗi vĩnh viễn không tự khởi động lại do render.

Nghiệm thu: full unit **111 file/1.467 test PASS**, review độc lập **16 test PASS**, E2E cuối **54/54 PASS** trên desktop và android-layout. Các spec chia phần/fallback/persistent-cache đã qua ở lượt liên quan trước đó; bốn ca reload mới có fixture thiếu header `X-AI-Failure-Reason`, đã sửa fixture và rerun **4/4 PASS**, không đổi giao thức sản phẩm để né lỗi. Build cuối PASS sau chuyển TEMP/TMP riêng vì Windows từ chối xóa tệp tạm esbuild. Review gpt-6.1-sol/high không còn finding sau sửa boundary, quota nội bộ và vòng lặp prewarm khi Name đổi.

Pages **30a6e331/master**, bundle **index-OTtswqPj.js**; AI Worker giữ **248a6474-6231-426c-8951-e5512544774f**, không migration/provider/dependency/billing mới. Smoke mock trên canonical production PASS: bốn HTTP (ba phần + một phần thiếu), reload bản hoàn chỉnh không gửi, RAW giữ nguyên; phiên riêng chặn mọi API cloud. Fixture nhận diện phần theo text chính xác thay vì ký tự đầu vì splitter mới cân đối qua ranh giới đoạn. Log fail vẫn giữ.

Smoke Gemini 2.5 thật PASS: nguồn tổng hợp **3.936 ký tự**, phần **1.301/1.322/1.313**, **3 HTTP 200**, tối đa hai request với key khác nhau; thấy phần đầu **9,06 giây**, đủ chương **19,02 giây**, không còn Hán tự, reload **0 gửi thêm**, RAW giữ nguyên. Mẫu trước là 12,1/27,1 giây; hai lượt đơn lẻ không chứng minh tốc độ trung vị hay chất lượng ngữ nghĩa. Không dùng truyện D: hoặc ghi cloud.

Bằng chứng: `.dsh-tmp/ai-speed/unit-final.log`, `review-budget.log`, `e2e-final-prewarm.log`, `build-final-temp.log`, `deploy.log`, `production-mock.json`, `production-real.json`. Android-layout không phải thiết bị Android thật. Chưa đủ mẫu để khẳng định tỷ lệ thành công toàn sản phẩm hay đạt mục tiêu giảm 25% trung vị; không bật suy luận thấp/streaming khi chưa kiểm chất lượng.
