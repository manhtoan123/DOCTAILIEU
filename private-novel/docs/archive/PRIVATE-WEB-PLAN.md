# Private Novel Reader — thiết kế và lộ trình

> Cập nhật 04/10/2026: kế hoạch triển khai hiện hành là [WEB-READER-IMPLEMENTATION-PLAN.md](WEB-READER-IMPLEMENTATION-PLAN.md), dựa trên tài liệu chỉ đạo mới và thiết bị Windows + Android. Bản hiện hành ưu tiên local-first, auth trước phát hành online và không dùng D1 lưu toàn bộ kho. Nội dung dưới đây giữ làm tham khảo lịch sử; các quyết định xung đột được thay thế bởi bản hiện hành. Đã tìm thấy Vietphrase.txt 43.687.000 bytes tại `D:\linh tinh\tm\truyen\vietphrase.zxc.io.vn\src\test-dicts`; nhận định cũ “chưa tìm thấy từ điển” không còn áp dụng cho toàn bộ nguồn tham khảo.

Ngày đối chiếu tài liệu: 04/10/2026. Đây là thiết kế để bắt đầu lập trình, chưa phải ứng dụng đã chạy hoặc đã triển khai.

## Cập nhật theo kho tài liệu thực tế

Người dùng xác định `D:\linh tinh\tm\STV Novel` là nguồn tài liệu cần nhập. Đã kiểm kê metadata trực tiếp ngày 04/10/2026; chưa upload, sửa, đổi tên hay xóa file nguồn. Báo cáo tổng hợp nằm trong `STV-NOVEL-INVENTORY.json` cùng thư mục tài liệu này. GB/MB trong thống kê dưới đây dùng hệ thập phân.

| Hạng mục | Kết quả |
|---|---:|
| Tổng file | 73.822 |
| Tổng dung lượng | 4.962.990.882 bytes, khoảng 4,96 GB |
| TXT | 72.665 file, 3.244.069.557 bytes, khoảng 3,24 GB |
| Thư mục có TXT | 303 |
| TXT lớn hơn 2 MB | 63 |
| TXT lớn nhất | 38.259.088 bytes, khoảng 38,26 MB |
| EPUB | 60 file, khoảng 756 MB |
| ZIP / RAR | 12 ZIP và 2 RAR |
| Ảnh JPG / PNG | 363 file |

Có NameList.txt; trong lượt dò tên chưa tìm thấy các file mang tên Vietphrase.txt, Names.txt, PhienAm.txt hay HanViet.txt. Chưa kiểm tra nội dung NameList.txt để khẳng định nó thay được Names.txt. Chưa kết luận số truyện/chương, encoding, mức trùng lặp hoặc chất lượng văn bản chỉ từ metadata. Một số tên đường dẫn có chuỗi ký tự bất thường; cần xem trước tên hiển thị, không tự đổi tên nguồn.

**Điều chỉnh thay thế giả định một DB và lưu nhiều bản toàn văn trong các mục dưới:**

1. Nhập hàng loạt bằng công cụ chạy trên máy hoặc giao diện chọn thư mục; giữ đường dẫn tương đối và manifest. Website online không tự đọc được ổ D: từ một chuỗi đường dẫn, người dùng phải chọn file/thư mục hoặc chạy công cụ nhập cục bộ.
2. Phân loại riêng thư mục nhiều file có thể đã chia chương và TXT dài cần regex. Kiểm tra mẫu trước khi quyết định một thư mục là một truyện; thư mục có thể là tuyển tập. Sắp xếp chương theo số tự nhiên, giữ tên gốc.
3. Quét hash SHA-256 theo luồng để tìm file trùng chính xác trước khi đồng bộ. Kết quả hiện tại chỉ là kiểm kê, chưa thực hiện khử trùng. File EPUB/ZIP/RAR có thể trùng bản TXT nhưng phải kiểm chứng. Không chạy script nằm trong kho truyện.
4. Importer phải xử lý được TXT khoảng 38 MB; bỏ giả định giới hạn cứng 20 MB cho toàn bộ kho. Dùng đọc theo luồng, batch và checkpoint; thử trên thiết bị thực tế trước khi chốt ngưỡng mobile. Không đọc 73.822 file vào RAM cùng lúc.
5. D1 Free một database 500 MB không đủ. Nếu đưa toàn bộ TXT lên cloud, có thể thiết kế **1 DB danh mục + tối đa 9 DB nội dung**, ánh xạ file sang shard cố định và chặn nhập trước khi shard đầy. Cloudflare hiện cho 10 DB Free, tổng 5 GB; khả năng chứa thực tế phải tính cả index, metadata và dữ liệu đã chuẩn hóa. Đây là phương án cần kiểm thử, chưa phải cam kết chứa toàn bộ tài liệu cùng mọi bản dịch.
6. Không nhân đôi toàn bộ TXT dưới cả dạng file gốc và chương. Lưu bytes gốc một lần; chương chưa sửa tham chiếu đoạn byte/đoạn văn bản tương ứng kèm encoding. Bản sửa và bản AI chỉ tạo khi cần. Convert tái sinh trên trình duyệt; tránh lưu thêm 3,24 GB kết quả vào cloud. Theo dõi dung lượng thực tế của từng shard và toàn tài khoản.
7. EPUB, ảnh và archive chiếm thêm khoảng 1,72 GB: không mặc định đưa cả chúng vào D1 vì tổng dữ liệu gốc đã sát 5 GB, chưa tính overhead. Giữ nguyên kho nguồn; giai đoạn đầu đồng bộ TXT sau kiểm tra, rồi quyết định bản đại diện cho EPUB/archive. Nhập đầy đủ các định dạng này cần parser riêng và kế hoạch dung lượng sau khử trùng.
8. Trình duyệt chỉ cache truyện đang đọc và vài chương tiếp theo; đặt trần cache/LRU. Không đồng bộ 3,24 GB TXT xuống mọi điện thoại khi mở web.
9. Mỗi lô upload có trạng thái và resume; chia qua nhiều ngày nếu gần quota write. Không gửi nội dung thật trước khi khóa server hoạt động và kiểm thử truy cập ẩn danh.
10. Nếu bắt buộc giữ nguyên toàn bộ file và mọi bản dịch mà không phụ thuộc dung lượng cloud miễn phí, phương án thực tế là ổ đĩa hiện có + backend trên máy + Tunnel; máy phải bật và có chi phí điện/mạng hiện hữu. Đây là lựa chọn thay thế, không đáp ứng yêu cầu cloud độc lập với máy cá nhân.

Nguồn giới hạn: [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/). Thiết kế một DB ở phần khởi tạo bên dưới vẫn phù hợp bản thử với một nhóm truyện; cần bổ sung shard router và bindings trước khi nhập toàn bộ kho.

## 1. Quyết định kiến trúc

Chọn React + TypeScript + Vite; CSS responsive; Pages Functions chạy Hono; D1 lưu dữ liệu online; Dexie/IndexedDB làm bản lưu cục bộ. Tách chương và Vietphrase chạy trong Web Worker trên máy người dùng. Phục vụ giao diện và API cùng tên miền `TEN.pages.dev`.

Mục tiêu chi phí là 0 VNĐ tiền hosting/API trong hạn mức miễn phí, chấp nhận tạm dừng chức năng khi hết quota. Không mua domain, không bật Workers Paid, không gắn billing cho project Gemini dùng ở bản này. Không dùng R2 trong cấu hình ban đầu: free allowance của R2 không phải giới hạn cứng ngăn tính phí vượt mức.

Không thể bảo đảm đồng thời mọi giọng TikTok/Edge, nghe không giới hạn, chạy ổn định hoàn toàn trên cloud và miễn phí mãi mãi. Thiết kế vẫn có adapter cho từng nhà cung cấp, nhưng phải hiển thị đúng trạng thái khả dụng.

Tài liệu nền: [Vite](https://vite.dev/guide/), [Dexie với React](https://dexie.org/docs/Tutorial/React), [Hono với Pages](https://hono.dev/docs/getting-started/cloudflare-pages).

## 2. Kết quả xem mã tham khảo

Thư mục đã xem: `D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93`.

- `Uploader - Tách 1 File TXT Dài Thành Nhiều Chương-33.2.user.js`: regex nhận diện nhiều kiểu tiêu đề, giao diện xem trước và cơ chế upload. Có phụ thuộc Tampermonkey/DOM website. Cần tách thuật toán thành hàm thuần. Comment ở đầu file nói ngưỡng 0.2 KB nhưng hằng `MIN_CHAPTER_KB` là 2; không mang quy tắc tự bỏ chương ngắn sang ứng dụng mới.
- `SangTacViet_TXT_Reader_Offline.user.js`: đọc file bằng FileReader và lưu toàn bộ văn bản trong localStorage; cần chuyển nội dung lớn sang IndexedDB. Đây là tiện ích gắn vào website, chưa phải reader độc lập.
- `SangTacViet_Nghe_Sach_Plus.user.js`: khoảng dòng 741 gọi `/io/s1213/tiktoktts`; bản v4.13 có cùng dạng phụ thuộc. Các ID `tiktok:1`, `tiktok:2` là ID của proxy này, không đủ để suy ra tên giọng/API TikTok công khai.
- `SangTacViet Key Manager-3.5.user.js`: có cooldown/retry, nhưng cần thiết kế lại bộ đếm theo project/model khi dùng Gemini.
- `qtOnline.js`: có gọi dịch vụ dịch từ xa, không thể mặc định toàn bộ convert đang chạy offline. `hanviet.js` có dữ liệu ánh xạ ký tự; cần kiểm tra nguồn và quyền tái sử dụng trước khi đưa vào sản phẩm.
- Trong lượt kiểm tra chưa thấy backend đầy đủ, package.json hoặc bộ Vietphrase.txt/Names.txt độc lập. Không thể chỉ upload nguyên thư mục này để có đủ hệ thống.

Trang IP trực tiếp không đọc được bằng công cụ web ở lượt này; nhận xét mã dựa trên file cục bộ. Trang [Vietphrase zxc](https://vietphrase.zxc.io.vn/) mô tả dữ liệu `Trung=Việt` và từ điển phiên âm riêng; chưa kiểm chứng cấu trúc Web Worker bên trong trang đó.

## 3. Luồng chính

```text
Điện thoại / máy tính
  React Reader + IndexedDB
    ├── split.worker: TXT → chương + xem trước
    ├── vietphrase.worker: Trung → Convert / Hán-Việt
    ├── TTS player: câu/đoạn → âm thanh + highlight
    └── HTTPS cùng origin → Pages Functions
          ├── xác thực phiên cho tất cả đường dẫn được bảo vệ
          ├── API truyện/chương/file/tiến độ → D1
          ├── /api/translate → Gemini
          └── /api/tts → Azure F0 hoặc adapter cấu hình riêng
```

Reader vẫn dùng được khi AI hết quota. Convert không cần gửi truyện ra dịch vụ bên ngoài. Đồng bộ cloud là hành động riêng, có thông báo trạng thái và xử lý lỗi; dữ liệu IndexedDB không tự xuất hiện trên máy khác.

## 4. Lưu TXT thật và quản lý dữ liệu

Pages/Functions không phải ổ cứng để ghi bền vững vào `public/books/*.txt` lúc chạy. Dùng lớp FileRepository để lưu file logic bằng các mảnh BLOB trong D1, tải xuống vẫn là `.txt`.

Các bảng đề xuất:

| Bảng | Trường chính |
|---|---|
| books | id, title, author, description, source_file_id, revision, created_at, updated_at |
| chapters | id, book_id, ordinal, title, raw_file_id, convert_file_id, ai_file_id, revision |
| files | id, name, mime, encoding, byte_length, sha256, status, created_at |
| file_parts | file_id, part_index, bytes; khóa chính ghép |
| reading_progress | book_id, chapter_id, variant, paragraph_id, char_offset, content_revision, revision, updated_at |
| settings | key, value_json, revision |
| sessions | token_hash, expires_at, created_at |
| login_limits | bucket_key, failed_count, window_start, blocked_until |
| translation_jobs | id, cache_key, status, input_revision, next_attempt_at, lease_until, result_file_id, error_code |
| quota_state | project_alias, model, cooldown_until, requests_in_window, input_tokens_in_window |

Các quy tắc:

1. Giữ file gốc và checksum; xử lý trên bản text đã decode. Cho chọn UTF-8/GB18030 khi chữ lỗi; không tự mất dữ liệu gốc.
2. File lớn chia thành mảnh tối đa khoảng 256 KiB. `file_parts` lưu bytes; ghép đủ bytes rồi decode hoặc dùng decoder streaming. Không decode từng mảnh độc lập vì có thể cắt giữa ký tự UTF-8.
3. D1 Free giới hạn 2 MB mỗi row/BLOB và 500 MB mỗi database. Không nhét cả tiểu thuyết vào một row. Giới hạn 5 GB toàn tài khoản không có nghĩa một DB chứa được 5 GB. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
4. Upload theo batch nhỏ, có trạng thái uploading/ready. Chỉ hiện bản mới sau khi đủ mảnh và checksum đúng. Dọn upload dở; retry không tạo bản trùng.
5. Lưu riêng bản Trung, Convert và AI. Convert có thể tái sinh từ dictionary version; chỉ lưu kết quả cloud khi cần để tiết kiệm dung lượng.
6. Sửa dùng `revision`/`If-Match`; nếu thiết bị khác đã sửa thì trả 409 và cho chọn bản giữ lại. Tiến độ đọc không nên tin đồng hồ điện thoại để ghi đè vô điều kiện.
7. Xóa truyện phải dọn chương, file không còn được tham chiếu, tiến độ, job và bản cache liên quan. Có xác nhận và xuất bản sao trước thao tác xóa hàng loạt.
8. Sao lưu ZIP gồm TXT + manifest JSON + checksum; nhập lại kiểm tra đủ số chương và checksum. IndexedDB và D1 không thay thế bản sao lưu độc lập.
9. Dùng index cho book_id/ordinal, cache_key và session token_hash. List API phân trang, không trả nội dung mọi chương khi chỉ mở thư viện.

MVP đặt cảnh báo khi DB gần 400 MB, giới hạn file nhập ban đầu theo khả năng thiết bị (ví dụ 20 MB), nâng sau kiểm thử. Đây là mức tự đặt cho ứng dụng, không phải hạn mức Cloudflare.

## 5. Tách chương

Pipeline: decode → bỏ BOM trên bản xử lý → chuẩn hóa CRLF → kiểm tra từng dòng → tạo danh sách mốc → xem trước → xác nhận nhập.

Ví dụ regex khởi đầu, áp dụng từng dòng, chưa bao phủ mọi kiểu truyện:

```ts
const vn = /^(?:Chương|Chuong|Chapter)\s+\d+(?:\s*[:：.\-–—]\s*.*|\s+.*)?$/iu;
const cn = /^第[0-9０-９零〇一二两兩三四五六七八九十百千万萬亿億]+[章節节回卷](?:.*)$/u;
const extra = /^(?:序章|楔子|前言|终章|終章|后记|後記|番外)(?:\s*[:：\-–—]\s*.*)?$/u;
```

Giao diện xem trước phải có tiêu đề, số ký tự, đánh dấu gộp/tách thủ công. Giữ phần trước chương đầu thành lời mở đầu; không nhận diện được thì giữ một chương. Không tự bỏ chương ngắn hoặc chương không có số. Khi ghép toàn bộ mảnh theo thứ tự phải khôi phục được bản text chuẩn hóa, kể cả phần đầu/cuối.

Phân biệt Quyển và Chương để tránh coi tiêu đề quyển thành chương rỗng. Regex tự nhập chạy trong worker riêng; main thread có timeout và `worker.terminate()` khi treo. Giới hạn độ dài input/pattern. Web Worker tránh khóa giao diện nhưng không tự ngăn regex tốn vô hạn CPU.

## 6. Reader

- CSS variables cho font-size, font-family, line-height, content-width, text/background; preset sáng/tối/sepia. Font hệ thống trước, font tải thêm sau.
- Lưu settings nhỏ trong localStorage; nội dung trong IndexedDB. Chỉ render chương hiện tại và nạp trước chương kế tiếp khi có phiên hợp lệ.
- Vị trí lưu `chapterId + variant + paragraphId + charOffset + contentRevision`, không chỉ scrollY. Tìm anchor sau khi font tải xong; nếu bản dịch thay đổi thì ánh xạ theo đoạn hoặc báo khôi phục gần nhất.
- Ghi local có debounce; sync server khi chuyển chương hoặc nghỉ khoảng 20–30 giây. Khi offline giữ hàng đợi và báo chưa đồng bộ.
- Mobile có thanh điều khiển dễ chạm, safe area, tìm chương, mục lục và đổi bản Trung/Convert/AI.

## 7. Vietphrase

Nhập Vietphrase.txt, Names.txt, Names riêng từng truyện và PhienAm.txt/HanViet.txt. Hai file đầu chưa bảo đảm phiên âm Hán-Việt đầy đủ; cần bảng phiên âm riêng. Cấu trúc file thông dụng được mô tả ở [Vietphrase zxc](https://vietphrase.zxc.io.vn/).

Worker khởi tạo từ điển một lần, lưu bản nguồn/version trong IndexedDB. Parse bằng vị trí dấu `=` đầu tiên, không `split('=')` vô điều kiện. Bỏ BOM; giữ các nghĩa phân cách `/` để UI có thể chọn.

Tại mỗi vị trí: tìm tên riêng ưu tiên (Names theo truyện, sau đó Names chung); chọn match dài nhất trong lớp đó. Nếu không có tên thì tìm cụm Vietphrase dài nhất; cuối cùng phiên âm từng chữ; ký tự không biết giữ nguyên. Chính sách ưu tiên cần có ví dụ kiểm thử để tránh tên ngắn nuốt cụm dài ngoài ý muốn. Trie hoặc chỉ mục theo ký tự đầu đều được; benchmark RAM với từ điển thực tế, không nhân bản nguyên bộ từ điển ở nhiều worker.

Giữ xuống đoạn/dấu câu, trả về các token `{sourceStart, sourceEnd, targetText}` để bấm xem chữ gốc và sửa tên. Không dùng innerHTML cho văn bản nhập hoặc đầu ra AI. Luật Nhân và chuyển giản/phồn là giai đoạn riêng, không gọi phiên bản MVP là tương thích toàn bộ Quick Translator.

## 8. Gemini và nhiều key

Google áp dụng rate limit theo project, không theo API key. Nhiều key cùng project chia sẻ quota; xoay vòng không tăng hạn mức. Kiểm tra model và quota thực tế trong AI Studio, không hardcode một con số RPM/RPD cho mọi tài khoản. [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

API key lưu trong Pages Secrets, không dùng biến VITE_*, không đưa vào JS, localStorage, repo hoặc log. Giao diện chỉ hiện nhãn key/project và trạng thái. Thêm key qua dashboard ở MVP.

Luồng dịch:

1. Client gửi chapter/version/promptVersion; server kiểm tra phiên, giới hạn kích thước và model allowlist.
2. Kiểm tra cache bằng hash của nội dung + glossary version + model + prompt version + tham số.
3. Dùng D1 để đặt lease/claim job nguyên tử; tránh hai tab gọi cùng nội dung. Khởi đầu một job đồng thời trên project.
4. Chia đoạn theo giới hạn token đầu vào/đầu ra của model; mang theo glossary tên và ít ngữ cảnh. Một chương dài có thể cần nhiều request. Lưu từng kết quả để tiếp tục.
5. 429: đọc Retry-After hoặc retry info khi có; exponential backoff + jitter, số lần thử hữu hạn. Nếu hết quota ngày thì dừng chờ reset theo provider. Không tự giả định reset lúc 0h Việt Nam.
6. 401/403: vô hiệu credential lỗi và yêu cầu sửa cấu hình, không retry liên tục. 5xx: retry hữu hạn.
7. Chỉ chọn credential/project dự phòng được phép sử dụng, còn quota và theo chính sách nhà cung cấp. Theo dõi quota chung của các key cùng project. Không tạo project/key hàng loạt để né hạn mức.
8. Worker không sleep dài để chờ quota. Lưu `next_attempt_at`, trả trạng thái chờ, client hẹn lần gọi sau. MVP dừng điều phối khi đóng trang; mở lại thì đọc job và tiếp tục. Muốn dịch nền khi đóng tab cần scheduler/queue riêng và kiểm tra quota của chúng.
9. Nếu nguồn bị sửa trong lúc dịch, giữ kết quả theo revision cũ, không ghi đè bản đang đọc. Cho hủy job.

Private login không có nghĩa văn bản không rời hệ thống: khi gọi Gemini, nội dung được gửi Google. Điều khoản unpaid services có phần sử dụng dữ liệu để cải thiện sản phẩm; hiển thị điều này trong phần cài đặt AI. [Gemini terms](https://ai.google.dev/gemini-api/terms).

## 9. TTS và đồng bộ highlight

| Provider | Dùng thế nào | Giới hạn |
|---|---|---|
| Browser speechSynthesis | Không cần backend TTS; lấy giọng qua getVoices/voiceschanged | Giọng tùy máy/trình duyệt, không bảo đảm Hoài My/Nam Minh; một số giọng cần mạng |
| Azure Speech F0 | Adapter server gọi API chính thức, key trong Secrets | 500.000 ký tự neural/tháng; tài khoản phải tạo được resource F0, không tự chuyển sang S0 |
| edge-tts | Bridge Python trên máy riêng, có thể thử các giọng Edge | Thư viện cộng đồng dùng dịch vụ Edge, không phải API miễn phí được bảo đảm cho app; không chạy nguyên script Python trên Pages |
| TikTok | Adapter cho endpoint được phép dùng sau khi xác minh provider | Chưa xác nhận API TTS developer miễn phí ổn định; endpoint proxy trong mã tham khảo không phải backend của bạn |

Nguồn: [MDN getVoices](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices), [Azure giá F0](https://azure.microsoft.com/en-us/pricing/details/speech/), [Azure giọng tiếng Việt](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts), [edge-tts](https://github.com/rany2/edge-tts), [TikTok Developer Docs](https://developers.tiktok.com/docs/en/welcome).

Azure có ID `vi-VN-HoaiMyNeural` và `vi-VN-NamMinhNeural`; dùng API Azure là lựa chọn chính thức cho đúng các tên giọng này, nhưng vẫn có hạn mức. Nếu tài khoản không tạo được F0 mà không phát sinh thanh toán thì không coi Azure là phần bắt buộc của cấu hình 0 đồng.

TTS player dùng state machine: idle → loading → playing → paused/ended/error. Chuẩn hóa văn bản thành câu/đoạn với offset cố định. Một audio segment gắn một đoạn; prefetch 1–2 segment; khi ended chuyển highlight, hết chương thì nạp chương sau. Khi đổi chương/giọng/tốc độ hoặc stop phải abort request cũ và dùng generation ID để bỏ phản hồi đến muộn.

Highlight theo câu/đoạn hoạt động được dù provider không cung cấp timestamp từ. Dòng thị giác thay đổi khi đổi cỡ chữ/chiều rộng: muốn tô chính xác từng dòng phải có word timings/offset và ánh xạ sang các DOM Range, không thể suy ra từ MP3 cả chương. Boundary event của browser voice không đồng nhất trên mọi thiết bị.

Cache âm thanh cục bộ theo hash(text, voice, rate, provider), giới hạn dung lượng và LRU; không lưu toàn bộ MP3 lên D1. Chỉ phát sau thao tác người dùng; xử lý play() bị chặn. Media Session hỗ trợ điều khiển khi nền nhưng không bảo đảm chạy liên tục trên mọi iPhone/Android; thử thực tế khóa màn hình và chế độ tiết kiệm pin.

## 10. Private thực sự

Khóa phía máy chủ; dùng passphrase mạnh làm đăng nhập chính. PIN ngắn chỉ phù hợp khóa nhanh trên thiết bị đã tin cậy. Không đặt `if(pin === '1234')` trong JavaScript.

MVP dùng Pages root middleware trên mọi route. Ngoại lệ công khai chỉ gồm GET `/login`, POST `/auth/login` và icon tối thiểu không chứa dữ liệu. Trang login đơn giản do server render, không phụ thuộc asset ứng dụng đã bị khóa. Sau khi xác thực mới gọi `context.next()` để trả asset/API.

- Hash mật khẩu bằng thuật toán có salt/KDF và thư viện được duy trì; benchmark trong CPU budget Worker Free. Không hạ độ mạnh chỉ để né CPU; nếu không phù hợp chuyển sang giải pháp xác thực được quản lý.
- Phiên random đủ mạnh; DB chỉ lưu hash token; cookie `__Host-session`, HttpOnly, Secure, SameSite=Strict, Path=/, TTL. Đăng xuất thu hồi phiên và xóa cookie.
- Kiểm tra Origin/CSRF cho request thay đổi dữ liệu; dùng prepared statements và validation đầu vào.
- Giới hạn đăng nhập sai theo IP và ngưỡng tổng; lỗi đăng nhập chung; tránh cho brute force vô hạn. Không ghi password/key/text truyện vào log.
- Trả `Cache-Control: private, no-store` cho response riêng tư, cả HTML, TXT, audio và API. Không để CDN hay service worker vô tình cache response xác thực.
- `X-Robots-Tag: noindex, nofollow, noarchive` là lớp phụ; robots.txt không phải kiểm soát truy cập.
- Bảo vệ cả tên miền pages.dev, preview URL và tên miền riêng nếu thêm sau. Preview dùng dữ liệu test/secret tách biệt hoặc tắt preview không cần thiết.
- Chọn Runtime **Fail closed**: hết quota Functions thì chặn, không cho rơi về static asset không xác thực. [Pages routing](https://developers.cloudflare.com/pages/functions/routing/).
- Không để truyện, từ điển riêng, API key hoặc bản backup trong public/dist/repo. Repo private chỉ bảo vệ mã nguồn trên Git, không tự bảo vệ website đã deploy.

PWA/offline thêm sau: mặc định không cache nội dung nhạy cảm. Nếu bật đọc offline, phải giải thích dữ liệu đang nằm trên thiết bị; mã hóa kho offline bằng Web Crypto và yêu cầu mở khóa cục bộ, hoặc xóa cache khi logout. Server không thể thu hồi một bản plaintext người dùng đã tải xuống. Password ngăn truy cập trái phép nhưng không bảo đảm nội dung “không bị phát hiện” hay thay đổi quyền sử dụng nội dung.

## 11. Cấu trúc mã nguồn

```text
private-novel/
  src/
    app/                         # router, layout, đăng xuất, lỗi
    features/library/            # CRUD truyện/chương, tìm kiếm
    features/import/             # TXT, encoding, preview tách chương
    features/reader/             # theme, settings, anchor tiến độ
    features/convert/            # từ điển, token mapping, tên riêng
    features/translate/          # job, prompt, trạng thái quota
    features/tts/                # player và giao diện giọng đọc
    workers/split.worker.ts
    workers/vietphrase.worker.ts
    lib/db.ts                    # Dexie schema và migrations
    lib/api.ts                   # fetch có cookie, errors, cancellation
    lib/sync.ts                  # revision, queue đồng bộ
  server/
    app.ts                       # Hono API routes
    auth.ts                      # password/session/CSRF/rate limit
    repositories/files.ts        # D1 file parts và checksums
    repositories/books.ts
    services/gemini.ts           # quota theo project, retries, cache
    services/tts/azure.ts
    services/tts/types.ts
  functions/
    _middleware.ts               # gate cho toàn bộ website
    api/[[path]].ts               # adapter Hono handle(app)
  migrations/0001_initial.sql
  public/_routes.json
  tests/                         # splitter, convert, auth, quota, imports
  .dev.vars.example              # placeholder, không phải key thật
  .gitignore
  wrangler.jsonc
  package.json
```

API tối thiểu:

```text
POST   /auth/login
POST   /auth/logout
GET    /api/session
GET    /api/books
POST   /api/books
PATCH  /api/books/:id
DELETE /api/books/:id
GET    /api/books/:id/chapters?cursor=...
POST   /api/books/:id/chapters
GET    /api/chapters/:id
PATCH  /api/chapters/:id
DELETE /api/chapters/:id
POST   /api/imports
PUT    /api/imports/:id/parts/:part
POST   /api/imports/:id/commit
GET    /api/files/:id            # có xác thực; xuất TXT
PUT    /api/progress/:bookId
POST   /api/translate
GET    /api/translate/:jobId
POST   /api/translate/:jobId/resume
POST   /api/tts
```

## 12. Khởi tạo và đưa lên Pages

Lệnh dưới đây là hướng dẫn để bạn thực hiện trong một thư mục dự án mới, chưa được chạy trong phiên này. Cài Node LTS tương thích Vite hiện tại. [Vite requirements](https://vite.dev/guide/).

```powershell
npm create vite@latest private-novel -- --template react-ts
cd private-novel
npm install
npm install dexie dexie-react-hooks hono
npm install -D wrangler @cloudflare/workers-types
npm run dev
```

Sau đó tạo module theo cây thư mục, migration và các route thực tế. `npm run dev` chỉ chạy giao diện Vite; để thử Functions/D1 dùng bản build và Wrangler Pages dev.

Đặt `public/_routes.json` như sau để gate chạy trên mọi đường dẫn, kể cả TXT và asset:

```json
{"version":1,"include":["/*"],"exclude":[]}
```

Tạo D1:

```powershell
npx wrangler login
npx wrangler d1 create private-novel-db
```

Chép database_id trả về vào `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "private-novel",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2026-10-04",
  "d1_databases": [{
    "binding": "DB",
    "database_name": "private-novel-db",
    "database_id": "THAY_BANG_ID_D1",
    "migrations_dir": "migrations"
  }]
}
```

Không đặt secrets trong `vars`. Dùng `.dev.vars` để thử local, thêm file này cùng `.env*`, `.wrangler/`, `node_modules/`, `dist/`, `backups/` vào `.gitignore`; cho phép commit các file `.example` không chứa bí mật.

Sau khi viết migration và backend:

```powershell
npx wrangler d1 migrations apply private-novel-db --local
npm run build
npx wrangler pages dev dist
```

Kiểm thử local xong mới triển khai:

1. Tạo repo GitHub private chỉ chứa mã và migration. Commit lockfile. Push source sau khi kiểm tra không có secret/file truyện.
2. Trong Cloudflare chọn tạo Pages project bằng Git integration; chọn repo, production branch `main`, build `npm run build`, output `dist`. Chọn Workers Free, không bật dịch vụ trả phí.
3. Khai báo D1 binding `DB` theo Wrangler config; xác nhận cấu hình production nhận đúng DB. Chạy migration remote bằng lệnh bên dưới trước khi đưa dữ liệu thật lên.
4. Thêm Secrets theo mã auth/API đã viết, ví dụ `AUTH_PASSWORD_HASH`, `GEMINI_KEYS_JSON`; chỉ thêm Azure key/region khi dùng F0. Redeploy sau thay đổi binding/secrets.
5. Chọn Fail closed, kiểm tra preview deployments có cùng gate hoặc tắt preview. Nhận URL miễn phí `https://TEN.pages.dev`.
6. Mở cửa sổ ẩn danh: URL chương, `/api/books`, file TXT, asset được bảo vệ và bản preview phải bị chặn khi chưa login. Đăng xuất rồi thử truy cập lại. Chỉ sau đó nhập truyện thật.

```powershell
npx wrangler d1 migrations apply private-novel-db --remote
```

Nguồn triển khai: [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [Wrangler config](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [Routing](https://developers.cloudflare.com/pages/functions/routing/).

## 13. Hạn mức và lựa chọn thay thế

| Lựa chọn | Phù hợp | Lưu ý |
|---|---|---|
| Pages + Functions + D1 Free | Bản online chính, không cần bật PC | API có quota; nội dung lớn phải chia mảnh |
| Vercel Hobby | Website cá nhân, có thể dùng cùng UI | Cần backend/storage tương ứng; không dùng filesystem function làm ổ TXT bền vững |
| PC + Cloudflare Tunnel | Giữ TXT trên ổ đĩa, thử bridge Python/edge-tts | Máy phải chạy, có điện/mạng; tunnel không cung cấp máy chủ |

Workers/Pages Functions Free: 100.000 requests/ngày, CPU Free thông thường 10 ms mỗi invocation. Khi khóa mọi asset qua middleware, các request đó cũng tính vào quota Functions. D1 Free: 5 triệu rows read/ngày, 100.000 rows write/ngày, 5 GB toàn tài khoản với trần 500 MB mỗi DB. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Vercel: import Git repo, chọn Vite, build `npm run build`, output `dist`, dùng `TEN.vercel.app`. Nhưng Pages Functions/D1 binding không chạy nguyên xi trên Vercel: cần port API sang Vercel Functions và cấu hình DB phù hợp, hoặc gọi một Cloudflare Worker riêng với xác thực/CORS đúng. Màn hình PIN phía client vẫn không đủ. Hobby dành cho cá nhân phi thương mại; không mặc định gói này có tính năng đặt password tùy ý miễn phí. [Vercel Hobby](https://vercel.com/docs/plans/hobby).

Tunnel: chạy web/backend trên PC, ví dụ port 8788, rồi dùng:

```powershell
cloudflared tunnel --url http://localhost:8788
```

Quick Tunnel cho URL tạm `trycloudflare.com`; hostname đổi khi tạo lại, không có uptime guarantee, không hỗ trợ SSE. App vẫn cần auth. Named Tunnel với public hostname ổn định thường dùng domain bạn quản lý trên Cloudflare; không tính mua domain là miễn phí. Máy ngủ/tắt thì web ngừng. [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## 14. Lộ trình thực hiện

| Mốc | Sản phẩm | Điều kiện hoàn thành |
|---|---|---|
| 1 | Vite + UI thư viện + IndexedDB | Thêm/sửa/xóa một truyện, reload vẫn còn |
| 2 | TXT importer và split worker | Giữ nguyên đủ văn bản, có xem trước/gộp/tách, thử UTF-8 và GB18030 |
| 3 | Reader | Theme/font/giãn dòng; đổi máy xoay màn hình không làm hỏng anchor local |
| 4 | Convert worker | Names ưu tiên, cụm dài nhất, fallback Hán-Việt, không đứng UI với từ điển thật |
| 5 | Auth + D1 + đồng bộ | Hai thiết bị đọc cùng thư viện; truy cập không phiên bị chặn; xung đột trả 409 |
| 6 | Gemini | Key chỉ ở server, cache đúng revision, giả lập 429 thì chờ thay vì lặp vô hạn |
| 7 | TTS | Browser provider trước, Azure F0 nếu có; highlight đoạn, pause/resume, tự qua chương |
| 8 | Publish + backup/restore | Ẩn danh bị chặn cả production/preview; restore ZIP giữ đủ chương và checksum |
| 9 | Mở rộng tùy chọn | PWA offline mã hóa; thử bridge Edge/TikTok và chỉ công bố giọng đã kiểm chứng |

Đưa một truyện mẫu tự tạo vào chạy hết luồng trước khi nhập kho lớn. Không đưa dữ liệu thật lên cloud trước mốc 5. TikTok vẫn là hạng mục chưa có provider xác minh, không được đánh dấu hoàn thành chỉ vì đã tạo nút chọn giọng.
