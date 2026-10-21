# Kế hoạch thống nhất cài đặt và thao tác — 17/10/2026

Trạng thái 18/10/2026: đã triển khai và kiểm chứng tự động; Pages đã cập nhật. Kiểm khóa màn hình trên Android thật và zoom trình duyệt thủ công còn chờ xác nhận. Xử lý bốn góp ý: thiếu trường prompt, gộp Kho prompt/Dịch AI, tự động giữ phiên nghe nền, thao tác Sửa/Xóa dễ dùng. Kế hoạch tên TXT và tối ưu khoảng chờ TTS vẫn có phạm vi riêng.

## Kết quả UI cần có

Nhóm cài đặt chỉ còn một mục **Dịch AI & Prompt**. Desktop: danh sách prompt bên trái, một editor bên phải; mobile: chọn prompt phía trên, editor bên dưới. Ba phần trong editor là **Prompt**, **Nửa sau**, **Nâng cao**. Một nút Lưu chính cho bản nháp đang sửa, trạng thái lưu/đồng bộ ngắn và rõ.

Bảng AI trong Reader giữ chức năng chọn prompt của truyện, trạng thái model chương này/chương sau và bật/tắt dịch nửa sau, dịch sẵn. Liên kết cài đặt mở đúng prompt đang chọn trong nhóm hợp nhất. Chỉnh nội dung prompt ở một nơi duy nhất.

Bảng nghe sách tự giữ phiên nền sau khi người dùng bấm Nghe. Tủ sách giữ giao diện gọn: Mở sách và nút tùy chọn có vùng chạm lớn; chọn tùy chọn mở bảng Sửa thông tin/Xóa truyện dễ bấm.

## Những điểm đã kiểm tra trong code

- App.tsx đang có hai nhóm và hai route `prompts`/`ai`, render hai editor độc lập.
- PromptStockPanel.tsx chỉ có tên, phạm vi, System Prompt và User Prompt. AiSettingsEditor.tsx có thêm prompt nửa sau/biến mẫu và một đường lưu cấu hình riêng. Chỉ gộp menu mà giữ cả hai form sẽ chưa giải quyết thiếu/trùng chức năng.
- Prompt stock giữ IDs, selected profile snapshot, bản tùy chỉnh, đồng bộ/CAS/xung đột. Hàm so sánh settings trong prompt-stock.ts hiện chưa bao gồm hybrid; khi bổ sung editor nửa sau cần kiểm đường áp dụng profile để không mất sửa riêng hoặc bỏ qua thay đổi hybrid.
- tts-media-keepalive.ts hiện đọc cờ localStorage, mặc định false; Reader hiển thị checkbox. Carrier dùng WAV Blob tại máy, không HTTP. Đây là thay đổi chính sách mặc định, không cần thay engine phát.
- LibraryBookCard.tsx dùng details/menu absolute nằm trong card. CSS đã có min-height 44px cho nút; vẫn cần kiểm clipping, vị trí, khoảng cách và thao tác trên điện thoại, không chỉ tăng font/kích thước rồi coi là xong.

## P0 — Chốt mapping và hành vi lưu

- [x] Lập bảng field đang có trong PromptProfile/ReadingAiSettings và nơi đang lưu: system, user, hybrid.secondHalfPrompt, temperature, model/fallback, chosenProfileId/snapshot, bản tùy chỉnh chung/theo truyện. Kiểm trường bị validator bỏ hoặc mặc định hóa khi save/copy/sync.
- [x] Chọn một component editor dùng chung và một đường lưu profile, tái sử dụng validator/service hiện có. Không sửa hai bản UI cho cùng một prompt.
- [x] Phân biệt “đang chỉnh mẫu” và “đang dùng để dịch”: chọn mẫu trong danh sách chỉ mở editor; thao tác **Dùng mặc định** áp dụng cho cấu hình chung. Chọn prompt trong Reader tiếp tục lưu riêng theo truyện. Không để việc duyệt mẫu vô tình đổi prompt truyện đang đọc.
- [x] Các cấu hình tùy chỉnh cũ chưa có profile phải có mục nhận diện được khi mở editor, cho lưu thành mẫu nếu muốn; không tự tạo bản sao mỗi lần mở trang. IDs/phạm vi cũ còn được tham chiếu phải tiếp tục hợp lệ.
- [x] Chốt xử lý draft khi đổi mẫu/route, cập nhật từ thiết bị khác và xóa mẫu đang dùng. Không bỏ nháp âm thầm; giữ hành vi CAS/resolve và fallback hiện hành, kiểm tác động trước khi đổi.

## P1 — Gộp Dịch AI và Kho prompt, bổ sung editor đầy đủ

| Nhóm | Chức năng cần giữ/bổ sung |
| --- | --- |
| Danh sách | Tìm tên prompt/tên truyện; lọc Tất cả/Chung/Theo truyện; tạo, nhân bản, xóa; tên/scope rõ; một mục cho mỗi mẫu theo grouping hiện hành |
| Prompt | Tên; phạm vi mẫu lúc tạo; User Prompt cho cả chương hoặc nửa đầu; chèn biến và mở rộng editor |
| Nửa sau | Prompt độc lập; biến name, firstHalfSource, firstHalfTranslation, text; alias tiếng Việt; khôi phục riêng prompt nửa sau |
| Nâng cao | System Prompt, nhiệt độ nếu model thực sự hỗ trợ; giữ giá trị cũ nếu chính sách model bỏ qua, không hiển thị control giả có tác dụng |
| Chính sách dịch | Model tự chọn theo chất lượng và fallback hiện hành; nửa sau cố định Gemini 3.5 Flash-Lite. Hiển thị một dòng giải thích, không thêm lại selector model |
| Lưu và đồng bộ | Dirty/saving/error/saved; retry khi lỗi; offline giữ nháp; CAS/conflict; nhân bản giữ đủ trường; mẫu mặc định read-only theo quy tắc hiện hành |

- [x] Dùng `/settings/ai` làm route chính. `/settings/prompts` cũ mở cùng màn hình và chọn đúng mục nếu có; back/forward/reload không vòng lặp và không mất nháp. Xóa hai lựa chọn nhóm bị trùng.
- [x] Không dùng dropdown “Áp dụng cho truyện” ở trang cấu hình chung. Scope của mẫu là metadata thư viện; lựa chọn prompt đang dùng cho một truyện vẫn ở Reader. Giữ mẫu theo truyện và khả năng tìm mẫu đó.
- [x] Đảm bảo trường prompt nửa sau luôn chỉnh được trong mẫu, kể cả lúc người dùng chưa bật hybrid cho truyện. Lưu template không tự bật hybrid hoặc tự chạy AI.
- [x] Validation trước lưu: giới hạn 8.000 ký tự theo trường hiện hành, quy tắc text/name/biến mẫu của pipeline; không thay biến lặp nhiều lượt. Lỗi hiện sát trường, giữ nội dung đang soạn.
- [x] Khôi phục mặc định chỉ sửa draft, không gọi AI hoặc tự ghi đè các prompt khác. Một nút Lưu rõ mục đang lưu; chỉ báo đã lưu khi dữ liệu thực sự ghi thành công.
- [x] Giữ full nguồn+bản dịch nửa đầu khi xây prompt nửa sau. Chỉ đổi phần sau giữ checkpoint nửa đầu theo cơ chế hiện hành; không làm retry dịch lại toàn chương.
- [x] Không đưa lại UI chọn phiên bản hoặc “Thử prompt” đã được người dùng yêu cầu bỏ. Những khả năng kỹ thuật đang tồn tại như quản lý key phải được kiểm kê và giữ quyền truy cập hiện hành trong Nâng cao nếu còn được hỗ trợ; không lộ secret vào editor/export/log.
- [x] Trình bày thoáng, label ngắn, ít khung lồng nhau; màu thống nhất, một footer Lưu, mobile không scroll ngang. Editor mở rộng phải giữ con trỏ/nội dung và trả focus đúng.

## P2 — Nghe nền thành hành vi tự động

- [x] Bỏ checkbox “Giữ phiên nghe nền”, bật carrier tự động khi bắt đầu phát qua thao tác Nghe/Tiếp tục. Đổi cả trường hợp cài mới, cờ cũ 0/1 và localStorage không dùng được; không chỉ đổi fallback false thành true rồi vẫn để giá trị 0 cũ vô hiệu hóa.
- [x] Giữ WAV Blob tại máy, không file qua mạng, tối đa một carrier và lifecycle hiện hành. Pause/lỗi pause carrier; Stop/unmount giải phóng; resume khởi động lại hợp lệ. Callback muộn không làm phát lại sau Stop.
- [x] Mở trang/mở panel/reload không tự phát âm thanh. Carrier bị browser chặn không được chặn luôn voice audio hoặc tạo retry loop.
- [x] “Nối câu tự nhiên” cũng hướng tới bật sẵn, không bắt người dùng quản lý tối ưu kỹ thuật. Trước khi bỏ checkbox phải kiểm mapping câu/cursor/editor với bản player hiện hành. Áp dụng ở phiên nghe mới, không đổi ranh giới đang phát; nếu chunking khác, không dùng audioTime của chunk cũ sai vị trí mà phải xử lý offset/resume tương thích.
- [x] Giữ lựa chọn trải nghiệm như giọng, tốc độ và Qua chương; không coi yêu cầu tự động giữ nền là quyền đổi mọi sở thích nghe đã lưu. Không cần thêm công tắc tương đương ở nơi khác.
- [x] Đồng bộ quyết định này vào TTS-COMPLETION-PLAN/TTS-MEDIA-KEEPALIVE-M0 lúc triển khai: carrier từ opt-in thành tự động khi nghe, không đổi sang MSE. Tối ưu khoảng chờ giữa câu vẫn nghiệm thu theo plan TTS.

## P3 — Sửa thao tác Sửa/Xóa ở tủ sách

- [x] Nút ba chấm có vùng chạm tối thiểu 44×44px, tách khỏi Mở sách, nằm ổn định trong card; aria-label có tên truyện. Không phụ thuộc hover hoặc chạm đúng ký tự nhỏ.
- [x] Mobile mở bottom sheet qua portal ngoài card, có tên truyện và hai hàng cao tối thiểu 48px: **Sửa thông tin**, **Xóa truyện**. Desktop dùng popover neo vào nút, tự tránh mép viewport và không bị overflow của Album/grid cắt.
- [x] Một bảng thao tác mở tại một thời điểm; chạm ngoài/Escape/Đóng đóng bảng và trả focus về nút; bàn phím dùng được. Nhấn menu/action không kích hoạt mở sách ở card phía sau.
- [x] Xóa có màu cảnh báo, tách khỏi Sửa; gọi đúng flow xóa hiện hành và xác nhận đang có. Không thêm xác nhận phụ, không đổi cloud-delete trước local-delete, xử lý lỗi hoặc phạm vi xóa. Sửa chỉ hiện khi truyện hỗ trợ như hiện hành.
- [x] Kiểm card đầu/cuối hàng, cuối trang, Album cuộn, tên nhiều dòng, zoom và bàn phím ảo. Các action không đè lên bìa sách tiếp theo hoặc nằm ngoài vùng chạm.

## P4 — Kiểm chứng và nghiệm thu

- [x] Prompt: tạo/nhân bản/sửa nửa sau/lưu/reload/sync máy B giữ đủ trường; giữ scope/ID và lựa chọn riêng từng truyện; cập nhật từ xa không đè draft; xử lý xung đột đủ trường hybrid; xóa profile có fallback hợp lệ.
- [x] Reader đang dịch không bị đổi cấu hình giữa request vì mở editor/chọn mẫu để xem. Đổi template nửa sau không xóa kết quả nửa đầu đã lưu; chọn prompt chỉ tác động đúng truyện/cấu hình chung theo thao tác.
- [ ] TTS: cài mới/cờ0/cờ1/không localStorage đều giữ nền tự động khi Nghe; reload không autoplay; mất mạng giữ vị trí; không mất chữ khi chuyển sang nối câu; Stop không phát lại; 0 HTTP cho carrier. Android thật, loa máy, khóa màn hình vẫn có điều khiển và nghe ổn.
- [ ] UI 320/390/869/1280px, sáng/tối/sepia, zoom200%: không tràn ngang; focus/label/touch đúng; menu không clipping, Sửa/Xóa đúng truyện. Không coi giả lập layout là kiểm Android thật.
- [x] Tái sử dụng các nhóm e2e prompt-stock/prompt-sync/prompt-list/ai-unified, tts-keepalive-local/tts-resume, minimal-library/shelf-minimal-v2; thêm ca thiếu theo lỗi thực tế. Targeted unit + build cho logic nhỏ, không tạo test chỉ soi chữ/CSS.
- [x] Nếu P0 cần sửa persistence, mapping hoặc CAS profile: review độc lập đúng diff/invariant và regression, root full unit + build + E2E liên quan theo AGENTS. Nếu chỉ sắp xếp UI thì build và E2E đúng luồng; không full audit. Không đổi logic xóa truyện trong tác vụ UI này.
- [x] Deploy khi được yêu cầu/đã được phép sau khi kiểm đạt, smoke cô lập dữ liệu cloud. Ghi build/giới hạn và Android còn chờ nếu chưa có kiểm thật; cập nhật HANDOFF/DECISIONS cho chính sách mặc định mới.

## Thứ tự triển khai và điều kiện xong

P0 → P1 gộp editor → P2 mặc định nghe nền → P3 menu sách → P4 kiểm tích hợp/triển khai. Các nhánh P2/P3 có thể kiểm riêng để biết thay đổi nào gây lỗi, không trộn kết quả nghiệm thu.

Hoàn tất khi chỉ còn một nhóm Dịch AI & Prompt với đủ trường, prompt cũ/đồng bộ/lựa chọn truyện còn nguyên, người nghe không cần bật giữ phiên, menu sách dùng tốt bằng chạm, và các kiểm tương ứng đã đạt. Chưa đánh dấu hoàn thành chỉ vì đã gộp tên menu.

Tài liệu liên quan: [UI AI hiện hành](AI-UNIFIED-UI-1.md), [kế hoạch TTS](TTS-COMPLETION-PLAN.md), [ngân sách carrier](TTS-MEDIA-KEEPALIVE-M0.md), [kế hoạch tên TXT](TXT-PERSISTED-TITLES-PLAN.md).


## Kết quả thực hiện — 18/10/2026

- Một nhóm Dịch AI & Prompt dùng PromptStockPanel/PromptFields; alias `/settings/prompts` vẫn mở được. Link Reader giữ bookId và mở đúng profile/cấu hình riêng, không thêm dropdown áp dụng theo truyện.
- Hợp đồng lưu: profile ở `prompt-stock-v1` giữ nguyên ID/scope và thêm roundtrip hybrid/rules/secondHalfPrompt. Cấu hình chung ở `ai-translate-settings`, chỉ áp dụng mẫu bằng Dùng mặc định. Lựa chọn truyện ở `ai-book-settings:*` giữ switch hybrid; chỉnh mẫu không tự thay snapshot đang dùng. Nhiệt độ chung tiếp tục lấy từ cấu hình chung theo policy hiện hành. Nháp sessionStorage tách theo owner, giữ nội dung chưa hợp lệ, CAS baseline và bản đang soạn khi có cập nhật từ xa; có cách lưu thành mẫu mới nếu profile gốc đã bị xóa.
- Validator, nhân bản, API prompts và đồng bộ giữ đủ hybrid. So sánh snapshot dùng template hiệu lực, không coi Lite runtime 3.5 hay default template được materialize là chỉnh tay; giữ template chung kế thừa từ mẫu cũ. Quản lý key giữ ở mục thu gọn, input chỉ ở bộ nhớ phiên, không đưa vào draft/log/storage.
- Carrier tự bật từ Nghe/Tiếp tục, bỏ checkbox và bỏ tác động của cờ0 cũ; vẫn WAV Blob local/0HTTP, một voice + một carrier. Nối câu tự nhiên áp dụng mặc định; giọng/tốc độ/Qua chương vẫn chỉnh được.
- Con trỏ có `grouping` tùy chọn natural/sentence, được local/shared validator giữ lại. Con trỏ cũ thiếu trường suy từ ttsFlex đã lưu; giữ chính xác câu hoặc đoạn retry100 ký tự cùng audioTime đến hết nhóm chuẩn, sau đó nối lại ranh giới chuẩn. Con trỏ natural tiếp tục đúng audio đã gom. Nếu người dùng từng bật flex nhưng chưa lưu trước phiên bản có marker thì dữ liệu cũ không đủ xác định tuyệt đối cách chia; không tuyên bố đã khôi phục được thông tin chưa từng lưu.
- Menu sách qua portal: bottom sheet mobile/popover desktop, focus/Escape/chạm ngoài, nút lớn và giới hạn viewport. Chỉ gọi callback Sửa/Xóa hiện hành; không thêm xác nhận hoặc đổi quy trình xóa.

Bằng chứng (trong `.dsh-tmp/settings-unified/`):

- Full unit cuối: 137/137 files, 1804/1804 tests PASS (`full-unit-final.log`, workers2). Ca retry cursor bổ sung sau đó: targeted TTS 11/11 PASS (`cursor-final.log`). Actual workerd/D1 roundtrip hybrid + CAS/tombstone PASS (`cursor-runtime.log`). Các lỗi timeout/harness ở lượt đầu giữ nguyên log, không giấu hoặc thay invariant.
- E2E phạm vi 78 ca: 73 PASS ở `e2e-final.log`; các ca còn lại thuộc nhóm fixture cũ (giữ transaction sống khi giả lập chờ ghi, chờ lựa chọn được commit trước reload, hủy menu thay vì giả định flow xóa có confirm). Nhóm này đạt 18/18 khi lặp3 trên hai bố cục (`e2e-race-final.log`). Toàn bộ ca thuộc phạm vi đều có kết quả đạt; không gọi đây là một lượt 78/78 sạch.
- Review độc lập gpt-6.1-sol/high: 32 regression + 2 edge probes PASS, static review cuối không còn finding dữ liệu/race; báo cáo `review.md`. Root kiểm riêng các ca cursor/HTTP500 mới; reviewer không giả nhận đã browser-test Android.
- Build đạt. Smoke production 869/393 PASS (`scripts/smoke-settings-unified-production.mjs`, `.dsh-tmp/settings-unified-production/report.json`): lưu/reload template, alias/group, native voice+carrier10s hoạt động dù cờ0, không checkbox kỹ thuật, menu sửa đúng truyện, 0 ghi cloud thật; HTTP gateway/AI được mock bằng fixture. Đã xem ảnh mobile và chỉnh tương phản nút Xóa.
- Hai mục P4 còn mở ở trên chỉ phần kiểm thiết bị/zoom thủ công: layout320 và hai viewport production đã kiểm, Android khóa màn hình thật chưa kiểm. Không đánh dấu hành vi trên Android thật đạt từ giả lập layout.

Release cuối: Pages `3c3dec6a` / master, bundle `index-APYq_fUH.js`; trước thay đổi là `c1df87e6` / `index-Kcq3hz81.js`. Không đổi D1 migrations, bindings, AIWorker hoặc gateway. Rollback dùng release Pages trước nếu cần; không reset dữ liệu local hoặc xóa metadata mới. Các field hybrid/grouping bổ sung là tùy chọn, client cũ có thể bỏ qua chúng nên khi quay về bản cũ cần kiểm lại vị trí nghe. Log deploy `deploy-final.log`; smoke cuối `production-smoke-final.log`.
