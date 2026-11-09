# Trau chuốt bản Convert — 02/11/2026


## Hiện hành: đối chiếu nguyên văn và giữ kết quả khi sửa Name (02/11/2026)

Đầu vào lần lượt [Nguyên văn n]/[Convert n]. TXT dùng sourceStart/sourceEnd của token Convert; chỉ tách nguyên văn rồi tra ranh giới token, không tách hai bản độc lập để zip. Một token phủ nhiều câu giữ nguyên khối; map thiếu/sai giữ toàn khối tương ứng. EPUB/PDF/DOCX dùng text-node map, gộp node Convert rỗng với hàng xóm. Không đoán khi không có ranh giới chính xác.

Prompt mặc định mới giải thích rõ nguyên văn chỉ đối chiếu, Convert là bản biên tập; giữ nghĩa/tên/xưng hô/chủ thể/sắc thái, không thêm/tóm tắt, chỉ xuất Việt, nguồn là dữ liệu. Cài đặt riêng vẫn tại /settings/ai; prompt người dùng giữ nguyên, chỉ nhận diện chính xác prompt mặc định cũ để dùng mặc định mới. Không đổi nhãn/prompt để vượt từ chối.

Planner tính cả nguyên văn, Convert, nhãn và hai prompt, đồng thời dự trù đầu ra từ Convert. Dùng AiReadingSession, retry, cooldown, abort và checkpoint RAM hiện có. Khi bật chia phần, tự mở tối đa bốn request theo số key rảnh từ lease đầu tiên. Phục hồi theo ranh giới cặp đã chứng minh. Cặp nguyên khối vượt ngân sách dừng với thông báo, giữ bản đang đọc. Bản dịch cuối phải STOP, có nội dung và qua kiểm định. EPUB kiểm số dòng trước khi áp dụng. Nhận diện từ chối theo câu chữ là heuristic. Các phần giữ separator gốc.

Prompt mặc định tách hai khối `<BAN_TU_DIEN>` và `<BAN_DICH>`. Mục từ hiển thị cụm Convert, `$chữ Trung` và nghĩa sửa, sắp khóa dài trước. Chỉ nhận mục có căn cứ trong cùng cặp nguyên văn–Convert. Bảng đề xuất theo luồng Tìm và dịch Name: lọc theo cụm Convert, chữ Trung hoặc nghĩa, sửa nghĩa, chọn tối đa một nghĩa cho mỗi khóa, xem riêng mục đã chọn. **Lưu Vietphrase đã chọn** lưu cả nhóm trong một giao dịch cục bộ. Có thể sao chép cùng nhóm. Chỉ bản dịch cuối thay Convert. Prompt riêng vẫn sửa được trong Cài đặt. Ứng dụng giữ nguyên prompt đã lưu và bổ sung quy cách hai khối ở cấp system khi gửi, kể cả nếu prompt cũ yêu cầu chỉ trả văn xuôi.

Phần lỗi riêng lẻ giữ Convert, vẫn tra từ được và không chặn phần sau. Thanh tiến độ đếm các phần giữ Convert, không liệt kê lỗi bên dưới. Bảng có bộ chọn model và nút Dừng. **Tiếp tục** hoặc **Thử lại phần lỗi** trong cùng phiên và cùng model chỉ gửi phần còn thiếu. Đổi model hoặc tải lại rồi chạy mới gửi lại từ đầu. Bản đã áp dụng và mục từ vẫn được phục hồi khi mở lại bảng.

Vietphrase tùy chỉnh chỉ dùng với Convert cục bộ. Lưu vào lớp bổ sung cho worker, giữ bytes/SHA từ điển gốc và ưu tiên Name hiện có. Tiêu đề được lưu để đồng bộ dùng từ điển gốc. Cách tách lớp mục từ cá nhân tham khảo [Qingjian](https://github.com/qingjian-team/qingjian/blob/main/docs/design/architecture.md). Hàng đợi giới hạn tham khảo [p-limit](https://github.com/sindresorhus/p-limit/blob/main/index.js). Kiểm tra build, Vitest và Edge với truyện/upstream giả lập trong `.dsh-tmp/ai-tool-lanes/`. Đã triển khai Pages a8fe2da9 và AI Worker e2e5a4ea ngày 09/11/2026. Chưa đo chất lượng bản dịch AI thật.

Lượt cập nhật bảng Trau chuốt ngày 09/11 lưu khoảng giữ Convert kèm ranh giới nguyên văn đã xác định. Khi lưu Vietphrase hoặc đổi Name, Reader dùng ranh giới đó để cập nhật riêng phần Convert và giữ nguyên văn xuôi đã trau chuốt. Thiếu ranh giới xác thực thì giữ văn bản đã lưu. Tham khảo [ECMA-426 Range Mappings](https://tc39.es/ecma426/branch/proposal-range-mappings/) cho cách biểu diễn khoảng nguồn/đích.

Pages 46c1d967 đã lên bản chính thức, HTML và JS khớp build theo SHA-256. Vitest phạm vi 52/52, build đạt. Edge với truyện và AI giả lập kiểm giữ Convert, lưu mục đã chọn, cập nhật token theo Vietphrase và chỉ gửi phần lỗi khi thử lại. Unit kiểm lưu nhiều mục cùng lúc và từ chối toàn nhóm nếu dữ liệu sai. Log ở `.dsh-tmp/polish-parity/`. Chưa kiểm tra với AI thật hoặc thiết bị Android thật.

## Bảng Vietphrase luôn hiển thị

Bảng có ba cột **Convert / Chữ Trung / Nghĩa sửa**, cùng bộ lọc, nút xem mục đã chọn, sửa nghĩa, sao chép và lưu nhóm. Bảng giữ chỗ khi chưa có mục. Đề xuất từ phần đã hoàn tất xuất hiện ngay và được lưu theo revision/nguyên văn để mở lại sau khi dừng, kể cả khi phần đó hoàn tất trước phần đầu. Mục đã có đúng nghĩa trong Vietphrase tùy chỉnh được ẩn. Chỉ văn xuôi hợp lệ trong `BAN_DICH` được áp dụng cho Reader. Phần lỗi vẫn giữ Convert, không có danh sách lỗi bên dưới.

Trình đọc kết quả chấp nhận hàng từ điển thiếu ngoặc nhọn, dấu phân cách toàn chiều rộng, dấu đầu dòng và khung Markdown bao ngoài. Đối chiếu cụm Convert có chuẩn hóa Unicode, chữ hoa và khoảng trắng, còn khóa chữ Trung phải có nguyên dạng trong cùng cặp. Mẫu đầu ra thêm một ví dụ cụ thể. Tham khảo cách giữ vùng danh sách và thao tác chọn trong [Nextcloud Notes](https://github.com/nextcloud/notes/blob/main/src/components/NotesList.vue) và dùng lại bố cục **Tìm và dịch Name** của app.

Pages `4fa96c6c` đã lên web. HTML trang đọc, JS và CSS khớp SHA-256 với bản build. Vitest 54/54, build đạt. Edge 893 và 393 px với AI giả lập kiểm bảng rỗng, giữ mục từ sau khi dừng/đóng/mở lại, lưu nhóm, phần lỗi giữ Convert và retry riêng phần lỗi. Log `.dsh-tmp/polish-table/`. Các lượt cũ chưa lưu mục từ cần chạy lại để tạo đề xuất. Chưa kiểm tra với AI thật hoặc Android thật.

Cache mới version4 gắn với chapter/revision/nguyên văn, không mất vì Name đổi Convert. Partial lưu prefix đã xác nhận và originalEnd; Reader giữ prefix, cập nhật đuôi Convert theo ranh giới nguồn chính xác của map mới. Nếu không chứng minh được ranh giới mới, giữ bản đã lưu, không gắn token sai. Name không khởi động lại tác vụ đang chạy; request giữ snapshot lúc bắt đầu. Bản đã trau chuốt không tự viết lại tên theo Name mới. Cache cũ applied v2/v3 chỉ được nhận lại khi khớp đúng hash Convert hiện tại, trong transaction không ghi đè kết quả mới và không xóa cache cũ. Convert lần hai hủy tác vụ và xóa mọi format đã biết 1–4 đúng chương.

Sửa Name không reload và không dừng audio đang phát trong bản trau chuốt. Nghe nhanh dùng chính bản trau chuốt/Convert đang hiển thị; tự qua chương và pause/resume giữ phiên nghe. Audio cũ tiếp tục dùng snapshot đã bắt đầu, không suy diễn offset theo chữ mới; reload không autoplay.

Trong trang đọc Convert dạng văn bản, mở popup bằng một từ rồi nhấp hoặc chạm hai lần cùng nút ← hoặc → để chọn dòng đang hiển thị, ba lần để chọn cả đoạn của từ ban đầu. Bấm một lần trên nút vẫn mở rộng một từ. Đo từng mảnh chữ theo bố cục thật, gồm cụm dài bị xuống hàng. Nếu vùng chọn có đủ token liên tiếp và khớp nguồn, mở Chỉnh Name và tô các token như thao tác mở rộng. Với văn xuôi đã trau chuốt hoặc khi ranh giới cắt ngang token, tô đúng chữ đang hiển thị và có nút **Sao chép**. Văn xuôi trau chuốt mở **Chọn cụm từ** bằng nhấp đúp hoặc phím Enter để chọn một cụm nguồn. Tham khảo [lớp chọn văn bản của PDF.js](https://github.com/mozilla/pdf.js/blob/master/web/text_layer_builder.js) và dùng DOM Range của trình duyệt với cấu trúc đoạn có sẵn. Khung EPUB tiếp tục dùng bridge riêng.

Pages `2b1ef6e8`. Build và Edge 893 px dùng chuột, 393 px dùng cảm ứng mô phỏng đều đạt với truyện/AI giả lập. Kiểm vùng chọn Convert, vùng chọn văn xuôi sau Trau chuốt và mở lại Chọn cụm từ. Log `.dsh-tmp/reader-gestures-fix/`. Chưa kiểm tra Android thật.

Không đổi chapter, tệp nguồn, provider/key, schema dữ liệu gốc hoặc cloud. Chưa có checkpoint request bền vững để tiếp tục đúng phần sau reload hoặc prewarm trau chuốt; bản hỗn hợp đã lưu vẫn đọc được.

Tham khảo mã nguồn chính chủ [Google Gen AI SDK types/FinishReason](https://github.com/googleapis/js-genai/blob/main/src/types.ts) và [GenerateContent/FinishReason](https://ai.google.dev/api/generate-content): phân biệt STOP, MAX_TOKENS và SAFETY, giữ kết quả không hoàn chỉnh ngoài cache. Áp dụng hook vào cơ chế hiện có, không thêm dependency.

Trạng thái: **đã deploy Pages db5e4771** (index--FgYau2D.js); AI Worker giữ nguyên. Bằng chứng: 70 ca unit liên quan qua các lượt kiểm tra (30 paired, 6 cache/native IndexedDB, 34 cơ chế cũ); build cuối đạt index--FgYau2D.js. Browser built-preview/API AI và audio giả lập: 10 ca payload/prompt/partial/clear/refusal, 2 ca Name+nghe+single/double click/tap+Enter+reload, 2 ca tự qua chương và pause/resume; chạy desktop và Android-layout qua các lượt kiểm tra phù hợp. Log: .dsh-tmp/paired-polish-{final-e2e,release-e2e,next-final}.log, paired-polish-release-build.log. Reviewer độc lập đóng các finding về join/node rỗng, từ chối STOP, pause/resume, pending auto-next và keyboard token. Chưa dùng truyện thật, upstream AI/audio thật hoặc thiết bị Android thật. Full npm.cmd test: 205 file pass/25 file fail; 2720 test pass/42 fail/7 skipped, exit1, .dsh-tmp/paired-polish-full-test.log. Cả 70 ca trực tiếp liên quan đều pass trong lượt full. Lỗi tổng hợp trải ở auth/provider/model/prompt, runtime timeout, renderer và TTS policy; chưa đối chiếu baseline để kết luận tất cả là lỗi cũ. Không mở sửa ngoài phạm vi và không coi mock là chứng cứ chất lượng dịch thực.

## Thanh tiến độ từng phần — 02/11/2026

Mỗi phần gốc trong kế hoạch chạy có một ô, đúng vị trí một-based: xanh = hoàn tất được chấp nhận, đỏ = chưa hoàn tất, viền = đang chạy. Ví dụ 160 phần có 160 ô; hoàn tất song song phần 3 trước phần 2 vẫn chỉ tô xanh phần 3. Số ô theo phần gốc ổn định, không phải số request con khi tự chia nhỏ; tổng kế hoạch thực tế có thể đổi khi bắt đầu một lượt với cài đặt mới. Hover có số phần/trạng thái; role progressbar có số hoàn tất/tổng và chú giải chữ để không phụ thuộc riêng màu. Khi dừng/lỗi, bỏ viền đang chạy, giữ các ô đã hoàn tất trong phiên mở.

Chỉ thêm completedParts vào telemetry scheduler và UI; không đổi dispatch/retry, không bỏ qua phản hồi từ chối, không thay nguồn/prompt/đóng ngoặc nguyên văn. Luồng auto-continue lỗi kỹ thuật hiện có giữ nguyên. Không lưu thêm trạng thái ô xuống database: mở lại một kết quả cũ chưa có telemetry sẽ không suy đoán vị trí các phần. Phần xanh có thể ở sau một khoảng đỏ trong khi Reader chỉ áp dụng prefix liên tục đã được kiểm tra.

Tham khảo [W3C APG meter/progressbar](https://www.w3.org/WAI/ARIA/apg/patterns/meter/): dùng progressbar cho tiến độ tác vụ. Không thêm dependency. 11 targeted ai-parts pass, bổ sung kiểm vị trí [1,3] trong ca hoàn tất lệch thứ tự; build/typecheck đạt. Render 160 ô ở 973/360px và 3 nền Trắng/Giấy/Tối không tràn ngang; ảnh/log .dsh-tmp/polish-bar-render.* và polish-bar-360.png. Browser Reader AI giả lập kiểm bar cập nhật, partial, Name, hủy cache và reload: polish-bar-reader.log/json. Không dữ liệu người dùng/upstream/Android/audio thật. Deploy ghi HANDOFF.

## Bấm Convert lần nữa để hủy cache trau chuốt

Theo yêu cầu mới, khi Convert đang được chọn, bấm lại Convert hủy synchronously job trau chuốt qua cancelRef (gồm active request/chờ auto-continue), dừng nguồn nghe cũ theo luồng đổi mode hiện có, đóng thanh trau chuốt và về Convert thuần. Nếu đang ở Bản gốc/Dịch AI hoặc đang mở bảng AI thì lần bấm đầu chỉ chọn Convert. Có title giải thích và thông báo khi hủy xong, không thêm xác nhận.

Chỉ xóa các cache kết quả trau chuốt format1/2/3 của chương đang mở, kể cả các revision/hash cũ. Match chính xác namespace/chapter/revision/SHA và known record shape; prompt/options, cache AI, chapter khác và format lạ giữ nguyên. Transaction chỉ đụng settings. Không xóa nguồn/chapter/Name/dictionary/Convert cache. Khóa nút khi đang xóa, chặn mở job mới đến khi xong; suppress theo identity ngăn row observer cũ hiện lại trong lúc IndexedDB cập nhật. Chạy trau chuốt mới sẽ bỏ suppress và dùng lại theo yêu cầu chủ động.

9 targeted pass (result-store4/convert-polish5): scoped delete, khác chapter/hash/revision, giữ prompt/options/AI cache/format lạ, Stop+queued writer không tạo lại cache. Build cuối đạt, .dsh-tmp/polish-clear-build-final.log. Browser Reader với AI giả lập giữ request2 đang chạy: bấm Convert lần2, job đóng, trở về Convert thuần và reload vẫn thuần; .dsh-tmp/polish-clear-browser.log/json. Giữ hành vi Name prefix/suffix kiểm cùng fixture. Không dữ liệu thật/upstream/Android/audio thật; không xử lý job ở tab khác. Không thêm review.

## Vòng tự tiếp tục trong phiên hiện tại

Đã thêm continueAiRun dùng lại aiAutoRecoveryPlan và cùng instance AiReadingSession: lỗi kỹ thuật transient dùng backoff/Retry-After; ai_recovery_exhausted chờ cooldown60s rồi automatic:true/renewBudget theo plan để mở đợt hợp lệ. Không reset budget sau mỗi request, không tăng send cap/deadline từng đợt hoặc concurrency. Checkpoint trong session giữ lại; prompt/model/source chụp một lần cho cả vòng để không trộn bản khi cài đặt ngoài thay đổi. UI giữ busy, hiện countdown và không cần bấm tiếp tục.

Guard trước plan rộng: chỉ nhận AiTranslateClientError thuộc transient classifier hoặc ai_recovery_exhausted. Không tự retry semantic/validation/auth/non-STOP/refusal, kể cả khi HTTP502; không nới acceptance/content policy. Chưa có durable request checkpoint sau reload và chưa có dịch sẵn chương sau tương đương AI Reader, phần này không được coi là đã hoàn thành.

Stop/unmount hủy signal vòng chờ và session đang gửi; kiểm signal sau khi request resolve. Result store dùng Dexie transaction có abort listener giữ đến native commit, queued partial/progress/final status kiểm signal; không áp dụng kết quả muộn sau Stop. Đã lưu trước Stop được giữ. Review độc lập chỉ vùng này phát hiện1P2 write-afterStop, đã sửa và review cuối không còn blocker. Reviewer Medium đầu unavailable, dùng reviewer độc lập hiện có; không mở audit rộng.

17 targeted pass (auto-continue7, auto-resume8, result-store2): fake timers round60s, Retry-After/backoff, permanent refusal không replay, Stop đợi/late success, checkpoint hybrid giữ phần xong; native fake-IDB kiểm write queued và abort trước commit. Build/typecheck cuối đạt index-B2FrPuRF.js; build đầu lỗi type predicate/useRef đã sửa. Browser Reader với HTTP503 giả lập và đồng hồ điều khiển: tự phục hồi thành công, lượt sau Stop trong chờ không gửi thêm request (.dsh-tmp/polish-auto-continue-browser.json/log). Không gọi upstream thật/dùng truyện thật/Android/audio thật; browser503 kiểm lỗi kỹ thuật, không mô phỏng hết budget native bằng HTTP server. Cooldown budget chứng minh ở targeted fake timer và auto-resume hiện có. Logs .dsh-tmp/polish-auto-continue-unit-final.log, build-final.log. Deploy ghi HANDOFF.

Bỏ chặn128k đầu vào toàn chương cho AI/trau chuốt: [phạm vi và nghiệm thu](AI-LARGE-SOURCE-M0.md). Request vẫn chia nhỏ, không đổi lưu nguồn/import.

## Cài đặt chuyển ra ngoài và thông báo lỗi trung tính

Prompt/tùy chọn trau chuốt chuyển sang trang Cài đặt AI (/settings/ai), mục riêng ở trên kho prompt. Reader chỉ còn bắt đầu/dừng/đóng/tiến độ. Giữ nguyên key prompt cũ, thêm convert-polish-options:v1 cho splitParts. Nút lưu transaction kiểm baseline để không ghi đè cửa sổ khác; bản đang soạn giữ khi xung đột. Mỗi lượt chạy đọc lại prompt/options đã lưu, không ghi đè cài đặt từ trang Reader. Tham khảo [W3C grouping form controls](https://www.w3.org/WAI/tutorials/forms/grouping/), dùng section/fieldset/legend/label có tên rõ.

Thông báo client dùng chung cho AI và trau chuốt: output_limit mới nói giới hạn đầu ra; upstream_finish_reason/finish_reason nói chưa có trạng thái kết thúc hợp lệ, không khẳng định đoạn quá dài. Không đổi acceptance STOP, bộ lọc hoặc retry của provider. Đã đọc metadata log D1 qua SELECT chỉ đọc: các lỗi Gemma26 gần nhất gồm upstream_finish_reason trên phần1.544–1.779 ký tự; log không đủ để kết luận safety hay lỗi giao thức, không phát lại nội dung người dùng để thử.

Chưa thống nhất toàn bộ vòng đời trau chuốt với Reader AI: vẫn thiếu durable request checkpoints, tự phục hồi và dịch sẵn chương sau tương đương. Không coi bước chuyển cài đặt này là hoàn thành yêu cầu gộp toàn bộ. Không thêm cơ chế vượt chặn hoặc retry vô hạn khi chưa rõ trạng thái kết thúc.

Build cuối đạt (.dsh-tmp/polish-settings-move-build-final.log). Unit gộp147 ca:140pass/7fail, 7fail là các assertion server/provider/auth không thuộc thay đổi client thông báo; không khẳng định suite xanh. Browser built-preview/API AI giả lập: save/reload prompt/options, Reader không có textarea và lượt gọi thực dùng prompt đã lưu, source giữ nguyên; .dsh-tmp/polish-settings-move-browser-final.log. Lượt capture đầu đọc textarea trước khi async load xong, đã sửa chờ loaded. Không upstream thật/audio thật/Android thật. Deploy ghi HANDOFF.

## Edit Name tại phần Convert chưa trau chuốt

Đã giữ ô từ Convert ở đuôi chưa xử lý, thay vì vô hiệu hóa token cho cả chương khi mới có một phần trau chuốt. Căn cứ partial/sourceEnd đã lưu và kiểm đuôi output khớp chính xác base Convert để xác nhận vùng chưa thay; không dò bằng tỷ lệ độ dài. Khi output đổi số dòng/độ dài, token đuôi được chuyển sang offset hiển thị mới nhưng giữ range chữ gốc. Token literal bị cắt được tạo lại với source/range khớp phần nhìn thấy; token dịch không-literal vắt qua ranh giới được giữ dạng chữ, không gán cả cụm gốc cho mảnh cắt.

Phần đã trau chuốt vẫn dùng khung chọn cụm từ nguồn. Click token đuôi không nổi thêm khung đoạn nguồn do event bubbling. EPUB chỉ giữ word ranges trong node chưa đổi chữ và nằm hoàn toàn trong suffix đã xác nhận. Không đổi source/Name/dictionary/TTS hoặc trạng thái hoàn tất.

Kiểm tra:7 targeted unit đạt (3 polish-word-blocks,4 ai-name-paragraph) với thay dòng/độ dài, clip literal/nonliteral và thiếu proof. Browser Reader thật với AI giả lập giữ request2: prefix polished/tail Convert, click token cuối sourceStart7019 mở thẳng Chỉnh Name (không khung Chọn cụm từ), phần prefix vẫn mở khung nguồn; Stop/reload giữ partial. .dsh-tmp/polish-tail-editname-browser.log; không dữ liệu thật/AI upstream/audio/Android thật. Build và phát hành ghi HANDOFF.

## Hiện hành: thay dần trên trang, không modal

Theo yêu cầu tiếp theo, bỏ cửa sổ chặn/đối chiếu: thanh inline trên Reader, prompt/cài đặt tự thu lại khi chạy. Phần root liên tiếp được xác nhận STOP mới thay vào Convert; đuôi chưa xử lý giữ nguyên. AiReadingSession phát thêm completedSourceEnd/completedText từ source spans thật, không suy ra bằng tỷ lệ độ dài output hoặc số phần xong. Nhánh con chưa hợp thành root hoàn tất chưa thay. Đây là cập nhật từng phần đã xác nhận, không hiển thị token nháp.

Phần được thay lưu local applied/partial, sourceEnd và nguồn identity như trước. Dừng/đóng trang giữ phần đã lưu; retry cùng thanh giữ checkpoint trong session. Sau reload, bản hỗn hợp đã lưu vẫn hiển thị, nhưng checkpoint request không lưu riêng nên bắt đầu lại có thể phải xử lý lại phần đầu. Chuyển chương hủy job cũ; đổi Name khiến base Convert khác thì bản cũ không áp dụng cho base mới.

Chọn chữ trong Convert đã trau chuốt mở AiNameSource/khung chọn cụm từ từ đoạn nguồn theo cơ chế Name của bản AI; không gắn offsets từ điển cũ lên câu đã đổi. Định vị đoạn nguồn là ước lượng khi không có map đầy đủ, người dùng chọn cụm từ gốc trong khung. Chữ Convert chưa override giữ token UI cũ. Checkbox chia phần song song dùng chính AiReadingSession/scheduler, tối đa 2 key; không tăng fan-out. Prompt riêng giữ nguyên. EPUB chỉ áp dụng những cập nhật khớp số dòng/node để bảo toàn ảnh; một số phần có thể đợi tới root/kết quả hợp lệ thay vì thay ngay.

Kiểm chứng: build .dsh-tmp/polish-inline-build-final.log pass/index-Dcrm-7Xj.js;16unit pass (convert-polish5/ai-parts11). Browser Reader trên built-preview với AI giả lập và dữ liệu trung tính 7.000+ký tự: request2 được giữ chờ, prefix đã polished/tail còn neutral, overlay0, mở khung Name được trong lúc chạy, Stop/reload giữ bản partial; .dsh-tmp/polish-progress.log/result.json. Luồng ngắn/name/reload cuối đạt trong polish-inline-reader-verified.log. Menu Công cụ còn mở chặn nút đã sửa tự đóng khi mở thanh. Chưa kiểm upstream/Android thật/audio thật hoặc lease song song upstream. Không thêm review theo yêu cầu.

## Quyết định mới: thay Convert, prompt riêng

Người dùng đổi yêu cầu sau bản đầu: kết quả hoàn tất tự thay Convert để đọc/nghe, có prompt trau chuốt riêng chỉnh được trong dialog. Phần mô tả “lưu riêng để đối chiếu” bên dưới là lịch sử bản đầu, không còn là hành vi hiện hành.

Prompt mặc định được chọn từ đoạn Convert hiển thị: biên tập hậu Convert Trung–Việt, sửa trật tự từ/cách kết hợp Hán–Việt, giữ tên/xưng hô/số liệu/sự kiện, không đoán nguyên tác khi thiếu ngữ cảnh, giữ số dòng. Chỉ xem đoạn được cung cấp, không khẳng định đã đọc toàn chương. Prompt lưu cục bộ ở convert-polish-prompt:v1, độc lập prompt dịch. Bấm chạy lưu prompt và gửi AI theo model cố định.

Kết quả lưu cùng key nguồn cũ với applied:true; Reader quan sát row đúng key và đúng identity Convert trước khi thay renderedText. Bản cũ version1 chưa applied không tự thay. Không sửa chữ gốc/chapter/source. Name/nguồn thay đổi thì bỏ override không khớp. Convert TXT đã trau chuốt hiển thị chữ thường, không dùng token mapping của bản từ điển cũ; sửa Name vẫn có thể dùng bảng Name riêng. EPUB dùng lại text-node boundaries và giữ layout/ảnh; kết quả đổi số dòng bị từ chối áp dụng, giữ Convert hiện có. Không âm thầm bỏ bố cục.

Speech lấy renderedText nên lần nghe tiếp theo dùng bản trau chuốt. Nếu audio bản cũ đang phát, giữ audio đó đến hết, không tô sai vị trí trên bản mới và không dùng độ dài bản mới để quyết định kết thúc audio cũ. Không autoplay sau reload. Các cache trau chuốt/prompt vẫn chỉ ở thiết bị, chưa backup/sync.

Kiểm chứng mới: 4 unit pass gồm cache identity/custom prompt/EPUB boundary; build cuối pass index-B3z5jASW.js. Browser component với HTTP AI giả lập xác nhận lưu và restore prompt riêng/result,6layout không overflow. Luồng Reader thật trên built-preview dùng dữ liệu trung tính/API giả lập kiểm thay Convert và reload, source chapter giữ nguyên; kết quả trong .dsh-tmp/polish-reader-final2.log. Không upstream thật hoặc audio thiết bị thật. Không thêm review theo yêu cầu người dùng.

## Lịch sử bản đầu (đã thay bởi quyết định trên)

Người dùng từng chọn lưu riêng, giữ Convert để đối chiếu. Menu Công cụ → Trau chuốt bản Convert bật khi đang xem Convert đã hoàn tất. Chụp nội dung Convert và model hiện tại vào cửa sổ riêng; người dùng bấm Bắt đầu mới gửi AI. Prompt chuyên biên tập tiếng Việt, giữ ý/tên riêng/xưng hô/đoạn, không dùng prompt dịch truyện/hybrid. Giữ model cố định, dùng AiReadingSession/scheduler hiện có, không thêm key/provider hoặc tăng fan-out.

Hai cột Convert/trau chuốt trên desktop, xếp dọc trên mobile; bản hoàn tất lưu tự động tại settings key convert-polish:v1:<chapterId>:<revision>:<SHA256 bản Convert>. Mở lại đúng bản Convert sẽ đọc kết quả đã lưu; thay Name/nội dung/revision không lấy nhầm bản cũ. Lưu model thực tế cùng kết quả. Có Xuất TXT riêng; chưa sync/backup. Không sửa chapter/source/cache dịch chính; không đổi mode, player/cursor hoặc nguồn TTS. Bản trau chuốt hiện dùng đối chiếu/xuất, chưa có chế độ nghe riêng.

Đóng hoặc Dừng hủy session. Lỗi giữ bản hoàn tất trước và cho thử lại trong cửa sổ; các phần session hoàn tất được dùng lại khi thử sau lỗi. Đóng cửa sổ không lưu phần dang dở. AI có thể sửa lệch nghĩa, cần đối chiếu; không cam kết giữ ý chỉ bằng prompt.

Tham khảo GitHub [Immersive Translate](https://github.com/immersive-translate/immersive-translate): ý tưởng trình bày hai bản để đối chiếu trong ngữ cảnh. Repository hiện là nơi phát hành/tài liệu, không phải source mở hiện hành; không chép mã hoặc thêm dependency. Áp dụng Modal và luồng AI sẵn có của dự án.

Kiểm chứng: 2 unit pass kiểm tra key thay khi chapter/revision/Convert đổi và tách prompt cố định, .dsh-tmp/convert-polish-unit.log. Build cuối pass, .dsh-tmp/convert-polish-build-final.log; lỗi import ở build đầu đã sửa. Browser harness render component thật, gọi AI qua HTTP giả lập, native IndexedDB lưu/mở lại đúng kết quả, chỉ 1 request; 6 layout 973/390px × Trắng/Giấy/Tối không overflow, ảnh .dsh-tmp/polish-*.png và convert-polish-browser.json. Không dữ liệu người dùng/API AI thật, chưa Android thật, chưa kiểm audio thiết bị thật; code không gọi hoặc thay state player. Không thêm review theo yêu cầu người dùng. Deploy ghi HANDOFF.

Đã deploy Pagesfe6c306e/index-Czr6QdzY.js, AIWorker giữ9f48a8f1; GET reader và asset200, bundle có tính năng. Rollback Pages8791b14f.

Bản thay Convert đã deploy Pagesc5c73f24/index-B3z5jASW.js; Worker AI giữ9f48a8f1; GET reader+asset200, prompt riêng có trong bundle. Browser Reader thật:1request, applied=true, reload/chọn Convert dùng kết quả, chapter gốc giữ nguyên. Log polish-reader-final2.log.

Bản inline đã deploy Pages92514981/index-Dcrm-7Xj.js; GET reader/asset200, inline+completedSourceEnd có trong bundle; Worker AI giữ9f48a8f1.

Bản Edit Name suffix deploy Pagesc646adaf/index-D4vLQosC.js; GET reader+asset200. Build final và browser final đạt; logs .dsh-tmp/polish-tail-editname-{build-final,browser-final,unit-final,deploy}.log. Worker AI giữ9f48a8f1.

Đã deploy Pages6ae83660/index-C7xODrw0.js; GET settings/asset200, mục cài đặt trau chuốt có trong bundle. Worker AI không đổi9f48a8f1.

Auto-continue deploy Pages1aa16a19/index-B2FrPuRF.js; GET root/asset200, countdown autoContinue có trong bundle. AIWorker giữ9f48a8f1. Rollback Pages922ad039.

Cache-clear deploy Pages6073ac6e/index-CNLFJCLF.js; GET root+asset200, thông báo hủy cache có trong bundle. AIWorker giữ9f48a8f1. Rollback Pages1aa16a19.


## Phát hành paired-polish
2026-11-02 21:17 +07 — Pages db5e4771, production master; rollback e9359f3b. Wrangler local4.147.0, không upgrade. Browser GET reader /r/10031/4, /settings/ai và JS đều200, SHA256 JS khớp dist. Python HTTP bị403 nhưng browser xác minh đạt. Production smoke4/4 desktop/Android-layout: prompt/payload, source giữ nguyên, EditName không mất prefix, single/doubleclick/tap/Enter, nghe tiếp/reload; AI/audio giả lập, APIcloud chặn trong context tổng hợp riêng. Không dữ liệu người dùng/AI upstream/audio thật. Logs .dsh-tmp/paired-polish-{deploy,production-smoke}.log và paired-polish-online-check.json. Hướng dẫn CLI đối chiếu help bản cài và https://developers.cloudflare.com/pages/configuration/api/.

09/11, Pages 1dda9704. Cài đặt hiện mẫu Convert / Chữ Trung / Nghĩa sửa. Prompt riêng giữ nội dung đã lưu; system instruction thêm hai khối bắt buộc khi gửi, và Reader giữ Convert nếu phản hồi thiếu cấu trúc. Tham khảo [system instructions của Google Gen AI SDK](https://github.com/googleapis/js-genai/blob/main/codegen_instructions.md). 39 unit đạt, build đạt, HTML production khớp SHA. Chưa gọi AI thật.

Pages 1ed7a036 chuyển thao tác chọn dòng/đoạn sang hai nút mở rộng. Build đạt. Edge giả lập 893 px chuột và 393 px cảm ứng đã kiểm hai hướng, tô dòng và cả đoạn; bấm nhiều lần trên từ chỉ giữ chọn từ. HTML production khớp SHA. Log .dsh-tmp/arrow-selection/. Chưa thử thiết bị thật.
