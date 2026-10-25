# Thêm Name từ bản dịch AI của TXT

Cập nhật24/10/2026: phạm vi Name hiện hành theo [ALBUM-NAMES-M0.md](ALBUM-NAMES-M0.md): cùng Album tác giả ngoài cùng dùng chung kho, gồm series. Writer scoped giữ riêng truyện ngoài Album; quy tắc không sửa/dịch lại bản AI đang đọc giữ nguyên. Mô tả writer riêng truyện bên dưới là luồng nền trước cập nhật này.


Ngày 22/10/2026. Trạng thái: đã triển khai code theo phạm vi rút gọn; đã deploy và smoke online PASS.

## Mục tiêu

Nhấn hai lần vào đoạn AI của truyện TXT để mở công cụ Name sẵn có. Khi lưu, thao tác tương đương thêm/cập nhật một dòng `chữ nguồn=tên Việt` vào **Name riêng của truyện**, đúng danh sách đang có trong Reader. Name mới phục vụ các lượt dịch tiếp theo.

Đây là phạm vi thay thế kế hoạch trước: bỏ yêu cầu xây hệ thống căn chỉnh AI–nguồn, metadata phần dịch và thiết kế lại cache. Giữ giao diện Hán Việt/VietPhrase và các gợi ý hiện có; không tạo một bộ quản lý Name khác.

## Luồng người dùng

1. Đang đọc AI của TXT, nhấn đúp chuột hoặc chạm hai lần vào một đoạn: mở hộp **Chọn cụm từ** với chữ đã Convert từ nguồn, bấm thẳng vào từ.
2. Bấm từ trong đoạn Convert để mở popup Name có sẵn; mở rộng trái/phải bằng token nguồn, chọn Hán Việt/VietPhrase hoặc nhập cách gọi. Không có ô tìm, textarea nguồn, phân trang hoặc bước xác nhận vùng chọn.
3. Chọn cụm nguồn để mở `WordPopup`/`NameEditDialog` hiện có, dùng Hán Việt, VietPhrase hoặc nhập cách gọi muốn lưu.
4. Lưu vào Name riêng bằng writer hiện có, tương đương ghi một dòng vào Name List. Khóa chưa có thì thêm; khóa đã có thì cập nhật đúng tên của truyện này. Những dòng khác giữ nguyên.
5. Thành công: đóng popup Name và giữ khung Chọn cụm từ để chọn tiếp, báo **“Đã lưu Name riêng cho lần dịch sau.”** Lỗi lưu: giữ nội dung đang nhập và hiện lỗi trong hộp.

Chữ hiển thị trong hộp là Convert từ nguồn thật của chương; không suy ngược chữ Trung từ chữ Việt. TXT dịch nhiều phần lưu mốc phần nguồn → phần AI khi ghép kết quả thực tế (tính cả newline nối phần), giữ trong cache tùy chọn. Chọn đoạn bằng phạm vi trùng nhau trong phần tương ứng; chỗ bấm định vị cửa sổ trong đoạn dài, tối đa256 ký tự nguồn. Đây vẫn là ước lượng trong từng phần, không phải căn chỉnh ngữ nghĩa. Bản cũ/dịch một phần/metadata không hợp lệ dùng tỷ lệ số đoạn như trước; không dịch lại để tạo mốc. Không đổi prompt/chia phần/số request AI, không quét Convert cả chương. Không thêm UI, nút hoặc mũi tên theo chỉ đạo23/10. Hộp cuộn và render tăng dần250 token như hiện tại. Chỉ cần gần đúng để chọn Name, không chặn khi số đoạn khác nhau.

## UI tối giản

- Tái sử dụng hộp chọn từ, popup Name và danh sách Name hiện có; không thêm thanh công cụ thường trực trên trang đọc.
- Giữ các hàng gợi ý Hán Việt/VietPhrase, ô nhập và mở rộng vùng chọn của popup hiện tại.
- Trong ngữ cảnh AI, chỉ cho lưu Name riêng. Ẩn áp dụng tạm vào bản đang đọc, chạy Convert chuyển chế độ, sửa từ điển chung và lưu Name chung. Luồng Convert hiện có giữ hành vi của nó.
- Hộp vừa màn hình điện thoại, cuộn được khi mở bàn phím; Escape/đóng trở lại vị trí vừa đọc. Không thêm hộp xác nhận hay đăng nhập.
- Giữ cuộn, kéo chọn chữ và pinch zoom. Nếu double-tap không ổn trên trình duyệt Android, có đường vào bằng chọn đoạn rồi **Thêm Name**. Cử chỉ phải kiểm riêng trên Android thật.

## Cách làm trong code

### 1. Thêm đường mở công cụ từ AI TXT

Trong `src/features/reader/components/Reader.tsx`, gắn thao tác mở hộp theo đoạn khi `mode === 'ai'` và chương là TXT. EPUB không mở luồng này. Hộp chọn nguồn tách thành component nhỏ; nhận nguồn và Name snapshot của phiên; key theo chapterId/revision.

Dùng token/lookup/Convert hiện có khi mở hộp, không gọi AI để tìm nguồn. Lookup muộn không được ghi đè nội dung đã nhập hoặc vùng chọn thuộc chương khác. Không tự tải stock dictionary chỉ vì người dùng chuyển sang đọc AI.

### 2. Lưu như một dòng Name List

Tái sử dụng `saveReaderName` → `saveBookNames` và đồng bộ Name hiện có. Không thêm bảng DB, migration, provider hay API. Giữ định dạng Name hiện có, kể cả khóa có `$`; không tự chuẩn hóa lại danh sách cũ.

Kiểm bookId/chapterId/revision, truyện còn ready, chương chưa bị ẩn/xóa trước khi ghi. Khóa/giá trị hợp lệ theo writer hiện hành, chọn đúng nguồn và không cắt đôi Unicode. Không thay bytes/SHA/file nguồn, nội dung chương hoặc bản AI. Thêm guard thiếu nếu cần trong transaction, không mở rộng sang tái nhập dữ liệu.

### 3. Lưu Name không làm Reader dịch lại

Reader hiện đưa Name vào khóa AI và theo dõi thay đổi Name để dừng đọc. Chỉ sửa điểm này trong phiên AI:

- Giữ bản Name đã chụp khi bắt đầu lượt dịch chương cho lượt đang chạy/đang đọc, tương tự cách cài đặt prompt đang được giữ cho phiên hiện hành.
- Lưu Name cập nhật DB và danh sách quản lý, nhưng không đổi khóa của bản đang đọc, không tăng retry, không xóa cache và không gọi stopReading do riêng thay đổi Name.
- Retry/phục hồi của lượt chương đang chạy tiếp tục dùng Name lúc bắt đầu, tránh trộn tên giữa các phần.
- Chương sau đang/đã dịch sẵn không bị hủy hoặc tự dịch lại do thao tác lưu. Lượt dịch chương mới bắt đầu sau khi lưu lấy Name mới nhất.
- Áp dụng nhất quán cho thao tác thêm từ popup, Name List và cập nhật Name từ tab/đồng bộ, tránh mỗi đường lưu một hành vi.
- Giữ TTS/cursor/scroll và các ảnh Name của bản AI đang hiển thị ổn định khi Name thay đổi.

Khóa request/cache của lượt dịch mới vẫn có Name như hiện tại. Không bỏ Name khỏi khóa để né invalidation, không lấy cache bất kỳ theo chapterId. Reload hoặc mở lại chương tuân theo cơ chế cache hiện hành; phạm vi này không bổ sung cam kết giữ bản dịch cũ qua reload sau khi thay Name. Không thiết kế lại storage/cache để mở rộng yêu cầu.

## Trình tự triển khai và kiểm chứng

1. Viết regression chứng minh lưu một dòng Name không tạo lượt dịch lại hoặc dừng TTS trong phiên AI; xử lý snapshot current/prewarm/retry tối thiểu.
2. Thêm hộp chọn nguồn và thao tác nhấn hai lần cho TXT, gắn popup Name hiện có và giới hạn lưu riêng truyện.
3. Kiểm các luồng bên dưới, sửa lỗi trong phạm vi, review độc lập phần ghi dữ liệu; cập nhật HANDOFF/HANDOFF-LOG theo kết quả thực tế.

File chính: Reader, WordPopup, NameEditDialog, reader-word-edit; thêm component/hook nhỏ và test liên quan nếu cần. Tránh đổi ai-parts/định dạng response/cache khi không có lỗi bắt buộc phải sửa.

## Điều kiện hoàn thành code

- Nhấn hai lần đúng đoạn TXT AI mở công cụ; một lần nhấn/đọc/cuộn không vô tình mở hoặc lưu. EPUB không bị ảnh hưởng.
- Thêm/cập nhật một Name riêng đúng truyện, xuất hiện trong Name List và giữ nguyên các dòng còn lại; Names chung không đổi.
- Sau lưu Name có trong nguồn: bản AI giữ nguyên từng ký tự, không phát sinh request dịch lại, không reset TTS/cursor/scroll. Kiểm prewarm tắt để đếm request, rồi kiểm prewarm bật không cancel/restart ngoài dự kiến.
- Lượt dịch mới nhận Name mới; lượt đang chạy/retry và chương đã dịch sẵn không bị trộn tên hoặc dịch lại.
- Chọn nguồn đúng dù đoạn AI gộp/tách câu; không ghi Name từ chữ Việt bằng suy đoán. Thiếu từ điển vẫn lưu được Name bằng chọn/nhập chữ nguồn.
- Đổi chương, sửa/xóa/ẩn chương hoặc đóng hộp trong lúc lookup/lưu không gây ghi nhầm hay cập nhật UI muộn. Lỗi lưu giữ bản nháp.
- Nguồn/chương/bản AI và dữ liệu truyện khác không thay đổi. Luồng Name ở Convert vẫn dùng được.
- Chạy targeted regression; vì sửa writer/điều khiển kết quả AI, có review độc lập theo AGENTS. Root chạy full `npm.cmd test`, build và E2E đúng luồng, các kiểm tra nặng chạy tuần tự.
- Ghi rõ kiểm bằng mock/layout và Android thật; không coi payload đúng là bằng chứng model luôn tuân thủ Name. Deploy chỉ khi được yêu cầu/đã được phép.

## Trạng thái bàn giao

Đã triển khai Reader + AiNameSource + AiNameSnapshots; popup dùng saveOnly/bookOnly, writer kiểm chương ẩn. Đã sửa theo tham khảo chỉ đọc `D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\stv.ui.js` (UI chung) và `qtOnline.js:11048` (showSimpleEditnameSelector): Convert nguồn thành chữ bấm chọn→popup Name. Không chép mã tham khảo; bỏ textarea/tìm/phân trang/xác nhận. Giữ định dạng Name đang có. Snapshot LRU tối đa 8 identity trong phiên, namespace background riêng để không chụp Name quá sớm cho chương chưa dịch.

Kiểm chứng local: full162 file/2.017 test PASS (TEMP riêng, maxWorkers4); review độc lập47 test PASS gồm9 ca mới; build PASS; E2E Name/Convert cũ26 ca PASS + prewarm mới2 ca PASS và rerun AI TXT4/4 PASS desktop/android-layout (tổng30 ca đã qua). Lần đầu lỗi Miniflare TEMP và Vite startup được giữ log; hai assertion E2E mới đã sửa phạm vi so sánh đoạn, không đổi runtime để né test.

Log: `.dsh-tmp/ai-name/` và `.dsh-tmp/ai-txt-name-independent-review.log`. Chưa kiểm Android thật/audio TTS thật; E2E kiểm mock request, không gọi upstream AI. Reload dùng cache hiện hành; không thêm persistence snapshot. Pages production `fe6f7edb`, bundle `index-B4ORNPIu.js`; alias khớp dist. Smoke online desktop/mobile layout PASS2/2, mock AI1 request mỗi ca, không ghi cloud hoặc gọi upstream. Đã sửa CSS nút Thêm Name sau khi ẩn nút chạy Convert, build + E2E4/4 + smoke lại PASS. Rollback trước tính năng: Pagesf718d1d3. AIWorker và schema giữ nguyên.

Sửa UI theo tham khảo 22/10: build + E2E14/14 + review diff PASS. Pages9a230390/index-BoO4MX-7.js; smoke online desktop/mobile2/2 PASS, mock1 AI request mỗi ca, không ghi cloud/upstream. Log *-simple* trong .dsh-tmp/ai-name/.

22/10 cập nhật theo yêu cầu lấy theo cụm: bỏ nút inline Thêm Name; chọn đúng vị trí đoạn không rỗng, cộng sourceStart vào token để giữ offset tuyệt đối/mở rộng trong đoạn. Unit3/build/E2E6/review/smoke desktop-mobile2/2 PASS. Pages767239d9/index-Chn89pG7.js; log *-paragraph* trong .dsh-tmp/ai-name/. Không gọi AI lại; không kiểm Android/audio thật.

22/10 quyết định mới nhất: bỏ chặn lệch số đoạn và toast tương ứng. Đoạn đầu/cuối AI→đoạn đầu/cuối nguồn; giữa chương nội suy thứ tự và làm tròn đến một đoạn nguồn. Popup chỉ Convert đoạn này, giữ offset nguồn tuyệt đối; không sửa AI/TTS hay phát sinh lượt dịch.

Bản tương đối: Pages010fc859/index-B2zd8RLA.js. Targeted4/build/E2E6/smoke online2/2 PASS; log relative-* trong .dsh-tmp/ai-name/.

Giữ khung chọn cụm 22/10: AiNameSource luôn mounted khi popup Name mở; lưu/đóng popup không đóng khung cha. Escape đóng từng lớp; khung cha tạm ngừng xử lý bàn phím khi popup/hộp Name đang hoạt động. Nút đóng khung cha đóng cả vùng chọn, giữ guard đang lưu.

Bản giữ khung: build/E2E16/online smoke2 PASS; Pages4273f693/index-Cj6y9fSC.js, log keep-dialog-* tại .dsh-tmp/ai-name/. Writer/snapshot AI không đổi, mock kiểm request1/ca; chưa Android/audio thật.

## Triển khai Reader server Convert 23/10/2026

Pages `e8b02326` / `index-Dlrq-B9Z.js`, Worker riêng `7814891b-fce2-435e-902d-e312d51576e7`; AIWorker giữ nguyên. Alias production khớp dist. Smoke online2/2 desktop/mobile dùng Convert thật:1request Convert/mỗi ca,0dictionary Blob reads, lưu Name xong giữ picker và AI, chỉ1mock AI; không ghi thư viện/cloud source thật, chỉ quota metadata của Convert. Snapshot ảnh .dsh-tmp/ai-name/production-{desktop,mobile}.png; report .dsh-tmp/ai-name/production.json. Chưa kiểm Android thật/audio thật. Backend Free có hạn mức và có thể unavailable; không cam kết P99<10ms.

23/10 — Đóng picker bằng click/tap nền ngoài, opt-in riêng cho AiNameSource. Click trong hoặc kéo từ trong ra không đóng. Khi popup chỉnh Name đang mở, bấm ngoài chỉ đóng popup trên, giữ picker; lần tiếp mới đóng picker. Escape/X giữ hành vi cũ. Pages6d67f90f/index-0dJKwzQk.js; build/E2E4/4 và production smoke2/2PASS, không đổi backend/dữ liệu/AI/TTS. Logs .dsh-tmp/server-convert/backdrop-*.
