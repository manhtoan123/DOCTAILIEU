# Kế hoạch hoàn thành Private Novel Reader

**Quyết định hiện hành 05/10/2026:** R0 đọc/Convert, chưa bắt buộc TTS; M5 là tùy chọn sau R0. Không tự bật Web Speech fallback. Trạng thái M0–M8 và lệch schema/layout ở `private-novel/docs/STATUS.md`; bảng/cây bên dưới là thiết kế mục tiêu, không phải mô tả mã đã hoàn tất. Tạm hoãn feature mới để đóng kiểm chứng A3 và các spike M0. Kế hoạch cũ đã archive.

Ngày lập: 04/10/2026. Thiết bị ưu tiên do người dùng chọn: Windows + Android.

Trạng thái: local alpha đã có bản chạy thử; chưa deploy hosting. Ngày 04/10/2026 người dùng yêu cầu giản lược MVP: mỗi file TXT là một truyện, chương trong file tạo mục lục, nghe chỉ tiếng Việt và ưu tiên TikTok TTS qua adapter/gateway được phép. Kế hoạch này thay thế các quyết định kiến trúc xung đột trong PRIVATE-WEB-PLAN.md.

## 1. Kết luận và phạm vi phát hành

Khả thi để hoàn thành bản đọc TXT + Convert + Name List + TikTok TTS qua gateway được phép + backup trên thiết bị, đưa giao diện lên web riêng trong hạn mức hosting miễn phí. Cloud không phải điều kiện để nhập, lưu và xử lý truyện local; phần xác thực server là điều kiện trước khi phát hành URL private online.

Chốt ba mức sản phẩm:

| Bản | Nội dung | Điều kiện hoàn thành |
|---|---|---|
| R0 — local alpha | TXT, Library, Reader, splitter, Convert, Name List, backup/restore; TTS chưa bắt buộc | Các luồng R0 hoạt động trên Windows và Android; không lỗi mất dữ liệu mở; dữ liệu nằm trên từng thiết bị |
| R1 — private web MVP | R0 + đăng nhập server + triển khai Pages + kiểm thử phát hành | Có URL HTTPS miễn phí, người chưa đăng nhập không mở ứng dụng/API được; dữ liệu truyện vẫn local |
| R2 — mở rộng chọn lọc | Metadata/progress sync, Gemini theo yêu cầu, Azure nếu phù hợp; content sync là quyết định riêng | Chỉ triển khai chức năng có nhu cầu, quota và cơ chế lưu dữ liệu đã được xác minh |

R1 là đích của kế hoạch triển khai chính. Các mốc R2 có backlog nhưng không kéo dài điều kiện nghiệm thu R1. Điều này giữ phạm vi MVP trong tài liệu đính kèm, đồng thời đáp ứng yêu cầu website private online ban đầu.

MVP không bao gồm: đưa toàn bộ 4,96 GB lên cloud; dịch AI hàng loạt; Edge bridge; EPUB/DOCX/PDF; Pixiv; service worker/PWA offline mã hóa; tự đồng bộ toàn bộ kho. TikTok TTS chỉ dùng gateway được phép và không nhúng API key/secret vào bundle.

Local-first không đồng nghĩa mở lại web khi mất mạng hoàn toàn: R1 chưa có service worker cache ứng dụng. Khi trang đã tải, đọc/convert local không cần API nội dung; đăng nhập và mở phiên online mới vẫn cần mạng. TTS offline còn tùy giọng.

## 2. Bằng chứng và những điểm đã sửa so với tài liệu đầu vào

Kho nguồn: `D:\linh tinh\tm\STV Novel`. Kiểm kê trước đó: 73.822 file, 4.962.990.882 bytes; 72.665 TXT chiếm 3.244.069.557 bytes; TXT lớn nhất 38.259.088 bytes. Đây là dung lượng thập phân, chưa loại trùng. Chỉ đọc file cần kiểm tra, không sửa/xóa/đổi tên file nguồn và không chạy script trong kho.

Đã tìm thấy nguồn ZXC tại `D:\linh tinh\tm\truyen\vietphrase.zxc.io.vn`, gồm các module được chỉ định. Bổ sung dữ liệu thực tế:

| File trong src/test-dicts | Kích thước | Kết luận hiện tại |
|---|---:|---|
| Vietphrase.txt | 43.687.000 bytes | Đã tìm thấy, không còn là tài nguyên thiếu; 200 dòng đầu kiểm tra đều có dấu = |
| Names.txt | 2.429.701 bytes | Có dữ liệu; kiểm tra mẫu, chưa kiểm định toàn bộ |
| HanViet.txt | 182.819 bytes | Có dữ liệu; mẫu có dòng không theo dạng key=value, parser cần báo cáo |
| PhienAm.txt | 42 bytes | Chỉ 4 dòng; không dùng làm bộ phiên âm đầy đủ |
| !LuatNhan.txt | 1.115.636 bytes | Tên có dấu !; nhập phải chọn loại từ điển rõ ràng, không phụ thuộc duy nhất filename |

NameList.txt trong kho STV Novel có 3.200 dòng, 3.200 key khác nhau sau trim, không có value rỗng, 3.198 key chứa chữ Hán trong dải đã kiểm tra. Có thể dùng làm ứng viên nhập Name List; chưa kết luận mọi mục đều là tên riêng hoặc đúng nghĩa. Giữ file và tên gốc, cho người dùng chọn phạm vi áp dụng.

Đã kiểm tra mã m_translation.js: nó import DOM, có translationCache dạng Map, tạo Cartesian product trước rồi mới slice xuống 100 gợi ý. Phải sinh giới hạn ngay từ đầu và bỏ phụ thuộc DOM trước khi đưa vào worker. Trong dictionary worker, kết quả ghi IndexedDB cần xác nhận bằng transaction complete, không coi riêng request success là giao dịch đã commit.

Các điều chỉnh bắt buộc:

| Vấn đề | Quyết định triển khai |
|---|---|
| Tài liệu nói chưa tìm được Vietphrase 43,6 MB | Cập nhật: đã có file 43,69 MB ở đường dẫn trên; kiểm định/benchmark tại M0 và M3 |
| SHA-256 theo luồng | Dùng thư viện incremental trong worker, đề xuất hash-wasm. Web Crypto digest nhận toàn bộ input, không phải streaming hash |
| Browser TTS preload/cache audio | Chỉ chuẩn bị câu tiếp theo; Web Speech không trả MP3/Blob để lưu ttsCache. Cache audio để dành provider trả audio sau MVP |
| 3 worker từ điển/convert chạy song song | Chỉ một engine giữ từ điển đã nạp trong RAM; parsing và convert là module, có thể chung worker. Không nhân đôi bộ 43 MB thành nhiều Map/Trie ở main thread và worker |
| Name dài/Name ngắn | Trong cùng lớp ưu tiên chọn match dài nhất. Khi Name override ngắn giao nhau với tên dài ở lớp thấp hơn, cho xem trước cảnh báo và xác định hành vi bằng fixture |
| Auth ở sau phát hành | R0 chạy thử local; auth phải xong trước R1 online. Không cần chờ đồng bộ metadata/content mới làm auth |
| Ẩn danh không thấy dữ liệu | Test server gate và origin/profile độc lập. Đây không phải mã hóa IndexedDB trên thiết bị đang đăng nhập |
| Sync progress khi chưa sync nội dung | Dùng content hash để ghép cùng truyện; Android vẫn cần import cùng bản hoặc restore backup |
| Gemini chỉ nhận chapterId | Khi TXT chỉ local, client phải gửi đoạn text được chọn, hash/revision và glossary cần thiết sau khi người dùng bấm dịch |
| HTML Pixiv/key bị lộ | Tài liệu đầu vào có cảnh báo nhưng lượt này chưa xác minh file/credential cụ thể. Không tự khẳng định đã lộ, không thao tác tài khoản; chỉ kiểm tra trước publish và thu hồi credential nếu xác nhận sự cố |

Nguồn: [Web Crypto digest](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest), [hash-wasm](https://github.com/Daninet/hash-wasm), [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis).

## 3. Kiến trúc chốt cho R1

```text
React + TypeScript + Vite
  Library / Import Wizard / Reader / Convert / Name Editor / TTS / Backup
       │
       ├── Dexie (IndexedDB, theo từng origin/profile)
       ├── import.worker: hash → decode → normalize → split → preview
       ├── language.worker: parse dictionary + convert + token suggestions
       └── TikTok audio adapter trên main thread → gateway cùng origin được phép

Pages Functions (cùng origin, chỉ bắt buộc khi phát hành online)
       ├── login / logout / session / gate toàn route
       └── D1: phiên + giới hạn đăng nhập; chưa chứa nội dung truyện

R2: metadata sync / Gemini / TTS trả audio / content storage theo lựa chọn
```

Thư viện: React, TypeScript, Vite, Dexie, dexie-react-hooks, hash-wasm. Kiểm thử bằng Vitest cho logic, Playwright cho luồng trình duyệt; kiểm thử TTS/bộ nhớ trên điện thoại thật. Hono + Pages Functions cho auth; Wrangler cho local server/migrations/deploy. Khóa phiên bản trong lockfile khi bắt đầu code.

Worker message có requestId, bookId, revision, dictionaryVersion, nameListVersion và generationId. Hủy job khi đổi nguồn/đổi chương; bỏ kết quả đến muộn. Gửi dữ liệu theo batch; chỉ truyền buffer có thể chuyển quyền sở hữu khi phù hợp, không postMessage toàn bộ từ điển về UI.

Giao diện dự kiến:

1. Library: tiếp tục đọc, tìm truyện, nhập TXT, dung lượng, sao lưu.
2. Import Wizard: chọn file → phân loại/encoding → preview chương → nhập.
3. Reader: mục lục, Trung/Convert, bốn theme, font/giãn dòng, sửa nội dung, nghe.
4. Name Editor: nguồn, phiên âm, nhiều nghĩa, phạm vi sửa tạm/theo truyện, import/export.
5. Settings: từ điển đang dùng, giọng khả dụng, bộ nhớ, backup/restore, đăng xuất.

Desktop dùng panel phụ; Android dùng bottom sheet, nút chạm tối thiểu 44 CSS px, không phụ thuộc hover. Không render hàng nghìn chương hay token cùng lúc; mục lục phân trang/virtualize, reader theo chương và phân đoạn khi chương quá lớn.

## 4. Hợp đồng dữ liệu local

| Store | Vai trò và trường quan trọng |
|---|---|
| books | id, title, author, language, sourceHash, revision, createdAt, updatedAt |
| sourceFiles | id, relativePath, encoding, byteLength, sha256, blob/chunkRefs, status |
| contentChunks | fileId/version, index, bytes/text; lưu khối có giới hạn |
| chapters | id, bookId, order, title, contentRef/range, contentRevision, paragraphIndex |
| dictionaryVersions | id, type, filename, sha256, parserVersion, status, sourceChunks/indexRefs |
| nameLists | bookId/global, key, value, revision; temporary overrides là state phiên |
| readingProgress | bookId, chapterId, variant, paragraphId, charOffset, contentRevision |
| settings | theme, typography, voice, rate, import preferences |
| importJobs | jobId, phase, processedFiles, stagingRefs, checkpoint, errors |
| restoreJobs | backupId, completedEntries, stagingRefs, conflicts, status |

Không tạo ttsCache audio trong MVP; để repository interface cho R2. Phần TXT được giữ nguyên bytes gốc để xuất lại, còn text chuẩn hóa chỉ lưu một bản theo chunks và chapter ranges khi có thể; tránh lưu cùng toàn văn cho mỗi chương. Sửa chương dùng revision mới, giữ nguồn gốc. Token Convert chỉ cache giới hạn theo hash/version; có thể tái sinh.

Import/restore ghi staging theo batch, transaction ngắn. Chỉ chuyển trạng thái ready bằng giao dịch cuối khi manifest/checksum hợp lệ; crash không làm hiện truyện nửa chừng. Hủy job thì dọn staging, không động vào file nguồn. Không giữ transaction IndexedDB mở xuyên suốt các await đọc file/worker.

Tiến độ lấy paragraphId + offset, có text fingerprint để tìm vị trí gần nhất khi revision thay đổi; chờ font/layout ổn định trước khi cuộn. Debounce khoảng 0,5–1 giây, ghi khi chuyển chương/visibilitychange; không chỉ dựa vào beforeunload trên Android.

Storage quota: dùng navigator.storage.estimate(), xin persist() khi người dùng đã nhập truyện và giải thích ý nghĩa. Xử lý QuotaExceededError bằng rollback/báo thiếu dung lượng; không tự xóa truyện nguồn trong IndexedDB. LRU chỉ xóa dữ liệu tái tạo được như cache Convert. Persist không phải bảo đảm chống người dùng xóa dữ liệu trình duyệt. [Storage quota và eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Chốt origin production trước nhập kho dùng thật: localhost, preview và pages.dev có IndexedDB riêng. Chuyển thiết bị/tên miền bằng backup/restore cho đến khi có sync.

## 5. Pipeline TXT và từ điển

MVP chọn đúng một file TXT hoặc dán nội dung mỗi lần; mỗi file là một truyện, heading bên trong tạo mục lục. Chọn thư mục/batch nhiều truyện là backlog riêng. Android không phụ thuộc quyền đọc trực tiếp đường dẫn D:; người dùng tự chọn file hoặc chuyển backup sau khi restore đạt nghiệm thu.

Hash incremental trên bytes gốc; decode bằng TextDecoder streaming để giữ ký tự cắt ngang chunk. BOM → kiểm tra UTF-8 → gợi ý GB18030 khi lỗi; đây là heuristic, luôn có preview/chọn encoding thủ công. Chuẩn hóa BOM/CRLF được định nghĩa cụ thể, không trim nội dung vô điều kiện.

Kết quả splitter dùng các khoảng không chồng lấn bao phủ toàn bộ text chuẩn hóa; title là metadata, vẫn giữ separator/header gốc trong phạm vi nội dung để round-trip đúng. Phân biệt Quyển và Chương. Giữ lời mở đầu, đoạn cuối, chương ngắn; không có heading thì một chương. splitByMaxChars tạo phần kỹ thuật dưới một chương, không tự tuyên bố đó là chương mới. mergeTinyParts chỉ gợi ý, không tự gộp mất cấu trúc.

Regex người dùng chạy trong worker có watchdog timeout, terminate/restart; input lớn có progress/cancel. Giới hạn RAM bằng queue ngắn và stream; không dùng file.text() rồi split toàn bộ kho cùng lúc.

Từ điển đọc theo dòng/batch, parse dấu = đầu tiên, không mất các dấu = trong value. Nhận đa nghĩa / và ; theo cấu hình; không chuẩn hóa mất dấu phân cách cần giữ. Báo dòng lỗi, key trùng và cách xử lý; không âm thầm bỏ qua tất cả lỗi. Có fixture nhỏ hợp lệ để dev, bộ từ điển thật người dùng import tại máy, không bundle mặc định 43 MB hoặc publish trước khi rõ quyền sử dụng.

Ưu tiên: sửa tạm → Name theo truyện → Names chung → Names2 → Vietphrase → Luật Nhân dạng hỗ trợ → Hán-Việt → giữ chữ lạ. Longest-match trong từng lớp. Token offsets tính theo UTF-16 của text chuẩn hóa để khớp DOM/JS, có test emoji/surrogate pair. Nếu Luật Nhân sinh câu mới, token vẫn giữ span nguồn gốc; không lấy offset của câu đã thay làm offset chữ Trung.

MVP giữ Luật Nhân một placeholder {0} với mẫu kiểm thử có giới hạn, không nhận regex tùy ý hoặc đệ quy vô hạn. Không cho luật ghi đè vùng Name đã bảo vệ. Sinh tối đa 100 gợi ý theo cách tăng dần và dừng trước khi bùng nổ tổ hợp; giới hạn số segment/ứng viên, LRU và thời gian xử lý. Viết hoa trình bày không làm thay đổi dictionary gốc.

## 6. TTS và giới hạn thực tế

MVP hiện dùng TikTok audio adapter và gateway được phép. Reader giữ danh sách giọng từ bản hiện có; Bing/Google chưa tích hợp phải disabled và ghi rõ chưa cấu hình. Endpoint mặc định không đồng nghĩa gateway đã hoạt động. Không dùng proxy nội bộ của website nguồn như API công khai.

Luồng idle → loading → playing → paused → ended/error. Fetch phải trả Content-Type audio, không chấp nhận HTML fallback. generation và audio identity chặn callback cũ sau stop/đổi chương/resume. Auto next chỉ chạy khi chapter/revision/Names hiện tại đã Convert xong; Dừng phải hủy cả continuation đang chờ. Hai scenario hiện có dùng worker/audio mô phỏng, vẫn cần audio thật trên Windows/Android.

Bảng Nghe mở từ công cụ; Ẩn bảng không dừng audio. Nút ■ dừng. Cho người dùng đồng ý gửi câu đang đọc đến gateway trước phát; cấu hình cùng origin hoặc CSP allowlist cụ thể. Nội dung nằm trong URL query của adapter hiện tại nên gateway/log phải được xem xét trước phát hành. Không nhúng secret trong VITE_*.

Highlight theo câu/đoạn, không hứa từng dòng thị giác. Khi sửa nội dung câu đọc cho phiên khác bản truyện, tạm tắt highlight để tránh sai offsets. Tốc độ có thể điều chỉnh ở player; pitch/flex chỉ có hiệu lực nếu gateway hỗ trợ. BrowserPlayer cũ còn trong tts.ts nhưng không nằm trong luồng UI; không coi là Browser TTS đã nghiệm thu.

Media Session/Wake Lock là backlog tăng cường. R1 nghiệm thu nghe foreground trên thiết bị thật; khóa màn hình chỉ ghi hỗ trợ trên cấu hình đã thử, không cam kết mọi máy.

## 7. Backup, tính riêng tư và phát hành online

Backup theo một hoặc nhiều truyện người dùng chọn, không mặc định đóng gói cả kho 4,96 GB. Manifest có schemaVersion, appVersion, file/chapter IDs, content hashes, encoding, thứ tự chương, Names và progress. Có hai chế độ rõ ràng: portable kèm bytes từ điển đang dùng; compact chỉ ghi hash/version và yêu cầu người dùng nhập lại từ điển đúng khi restore. Chỉ lưu dictionaryVersion không đủ khôi phục Convert.

Export theo stream/chia gói kích thước giới hạn để Android không tạo Blob hàng GB; định dạng archive/lib chọn sau thử M0. Các gói có manifest tổng, checksum từng entry và part. Bản backup không mã hóa được ghi rõ là file có thể đọc được. Không đưa session/cookie/secret vào backup. Restore kiểm tra schema, kích thước, số entry, đường dẫn và checksum; preview conflict trước commit, staging và checkpoint hỗ trợ resume. Không nhận archive tùy ý từ kho vào pipeline backup.

Gate Pages áp dụng toàn route, chỉ cho phép login và tài nguyên login tối thiểu. Chưa có auth config hoặc backend lỗi thì chặn. Session random, D1 chỉ lưu hash token, TTL và thu hồi logout; cookie __Host-session, HttpOnly, Secure, SameSite=Strict, Path=/. Kiểm tra Origin/CSRF và rate limit cho login/request thay đổi dữ liệu. Hash mật khẩu bằng KDF có salt, benchmark chi phí CPU ngay M0; không hạ độ mạnh để qua Free quota. Nếu giải pháp auth không đạt bảo mật trong Free budget thì chưa phát hành private online, tiếp tục R0 và đánh giá auth thay thế trước R1.

Không log text, password, dictionary, API key; không render nội dung bằng innerHTML/dangerouslySetInnerHTML. JS/CSS/font/WASM phục vụ cùng origin, CSP phù hợp; không analytics bên thứ ba mặc định. Robots/noindex chỉ phụ trợ. Pages Runtime Fail closed, preview tắt hoặc bảo vệ tương đương, response riêng tư private/no-store. Có gate test quota/backend failure. [Pages routing](https://developers.cloudflare.com/pages/functions/routing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

Threat model R1: chặn người ngoài truy cập web/API; nội dung mặc định lưu trên thiết bị của người dùng, không có API tải TXT công khai. Không bảo vệ trước người có quyền vào OS/browser profile hoặc DevTools của thiết bị đã lưu plaintext. Logout thu hồi phiên, xóa nội dung đang hiển thị và dừng TTS; không tự xóa thư viện. Có nút riêng xóa dữ liệu thiết bị với xác nhận. Mã hóa local/PWA là R2, không gắn nhãn IndexedDB hiện tại là kho mã hóa.

## 8. Các mốc triển khai và tiêu chí nghiệm thu

Ước lượng cho một người có kinh nghiệm, làm tập trung; là dự toán công sức, không phải lịch cam kết. Mỗi mốc có demo và kết quả test trước khi chuyển sang mốc phụ thuộc.

| Mốc | Công việc và đầu ra | Phụ thuộc | Ước lượng | Nghiệm thu |
|---|---|---|---|---|
| M0 | Khởi tạo repo; chốt schema; bộ fixture; spike từ điển 43 MB/backup streaming/auth CPU | Không | 1–2 ngày | Nhận diện bottleneck trên Windows/Android; có lựa chọn khả thi cho từng spike |
| M1 | Dexie migrations, Library, CRUD, Reader, mục lục, settings, progress | M0 | 2–3 ngày | Reload không mất truyện; đổi font/chiều màn hình khôi phục đúng đoạn; xóa không ảnh hưởng truyện khác |
| M2 | Manifest/hash/dedupe, encoding, split worker, preview, sửa chia chương, import staging/resume | M1 | 3–4 ngày | TXT 38.259.088 bytes nhập được; hash/round-trip text đúng; hủy/crash không tạo truyện nửa chừng |
| M3 | Engine từ điển/Convert worker; bounded suggestions; token model; Luật Nhân có giới hạn | M0, M2 | 3–5 ngày | Bộ thật nạp được trên máy mục tiêu; UI vẫn phản hồi; Name dài/cụm dài/fallback/offset đúng fixture |
| M4 | Name List từng truyện, token selection/expand, nhiều nghĩa, sửa tạm/vĩnh viễn, import/export | M3 | 2–3 ngày | Sửa tên ở truyện A không ảnh hưởng B; đổi version làm mới Convert; round-trip Name List |
| M5 (tùy chọn sau R0) | TikTok gateway được phép, highlight câu, pause/resume, stop, auto chapter | M1, M3; không chặn R0 | 2–3 ngày | Chuỗi ba chương nghe đúng thứ tự; không phát chồng; đổi chương nhanh không phát câu cũ |
| M6 | Backup/restore portable/compact, checksum, conflict preview, resume, storage UI | M2, M4 | 2–3 ngày | Restore sang profile sạch khớp hash, chương, Names, progress; file hỏng bị chặn trước commit |
| M7 | Server auth, D1 sessions, Pages config, login/logout, fail closed, deploy test | M0; hoàn tất sau R0 | 2–3 ngày | Chưa login bị chặn cả URL sâu/asset/API/preview; hết phiên và backend lỗi không mở dữ liệu |
| M8 | Kiểm thử Windows/Android, sửa lỗi, hướng dẫn sử dụng/backup, phát hành R1 | M1–M4, M6–M7; M5 tùy chọn | 2–4 ngày | Tất cả release gates bắt buộc đạt, không lỗi mất dữ liệu hoặc truy cập trái phép còn mở |

Tổng cơ sở: 19–30 ngày công (khoảng 4–6 tuần làm việc toàn thời gian). Dự phòng 20% cho RAM Android, TTS và auth/hosting: khoảng 23–36 ngày công. Nếu tự học và làm ngoài giờ, thời gian lịch sẽ dài hơn. Không cộng R2 vào ước lượng này.

Chuỗi ưu tiên hiện hành: M0 → M1 → M2 → M3 → M4 → M6 → M7 → M8; M5 tùy chọn sau R0. Spike auth ở M0 nhằm tránh đến cuối mới phát hiện Free budget không phù hợp; không yêu cầu đưa nội dung truyện lên cloud để thử auth.

## 9. Bộ kiểm thử và điều kiện phát hành

Fixture cốt lõi không chứa secret, ưu tiên văn bản tự tạo. File thật chỉ dùng tại máy, không commit/publish cả kho. Dùng đúng TXT lớn nhất và bộ từ điển thật cho bài hiệu năng; ghi phiên bản Chrome/Edge/Android, RAM thiết bị và thời gian thực đo.

| Nhóm | Ca bắt buộc |
|---|---|
| Import | UTF-8 BOM/không BOM, GB18030, CRLF, dòng dài, ký tự cắt qua chunk, file trùng, thiếu quota |
| Split | Không tiêu đề, lời mở đầu, Chương/第…章/Quyển, chương ngắn, heading lặp, regex xấu, phần cuối |
| Toàn vẹn | Ghép ranges đúng toàn bộ text chuẩn hóa; bytes gốc xuất lại khớp SHA-256; không double header |
| Convert | Longest match, Name precedence, nhiều nghĩa, dấu = trong value, key trùng, ký tự lạ, emoji, Luật Nhân |
| Bộ nhớ | Từ điển lớn chỉ một engine sở hữu; cache có trần; đổi 20 chương không tăng cache vô hạn; không tải toàn bộ kho |
| Reader | Font/width/theme/rotate, reload, revision thay đổi, progress khi Android chuyển nền |
| TTS | Gateway thiếu/trả HTML/audio lỗi, pause/resume, stop khi đang load, callback muộn, auto chương Convert, đồng ý gửi text |
| Restore | Gói hợp lệ, thiếu entry/part, checksum sai, schema mới hơn, trùng truyện, đóng tab giữa restore |
| Private | Login sai, hết phiên, logout, Origin sai, deep URL, preview, secret scan dist/repo, fail closed |
| Dữ liệu rời máy | Network inspection: import/convert/backup không upload text; TTS remote hiển thị rõ; chưa bật Gemini |

Mục tiêu UX đề xuất: phản hồi thao tác/cancel trong khoảng 250 ms khi main thread rảnh, cập nhật progress tối thiểu mỗi giây; đọc chương đã cache mở trong khoảng 1 giây trên thiết bị tham chiếu. Đây là ngân sách cần đo, không kết quả đã đạt. Không đặt số RAM/thời gian convert giả định trước khi benchmark máy Android thật.

Chỉ phát hành R1 khi: không còn lỗi nghiêm trọng mất nội dung/ghi đè/không thể restore, gate server hoạt động, import file 38 MB thành công, Convert/Names/TTS chạy đúng các ca chính trên Windows và Android, hướng dẫn backup và giới hạn TTS được cung cấp. Không đánh dấu xong bằng cách chỉ dựng nút chức năng.

## 10. Cấu trúc repo dự kiến

```text
private-novel/
  src/
    app/                       # routes, providers, error boundary
    features/
      library/ import/ reader/ convert/ names/ tts/ backup/ settings/
    domain/
      models.ts
      import/                  # encode/hash/split/ranges/manifest
      language/                # dictionary/trie/rules/tokens/suggestions
      backup/                  # manifest/schema/checksums/conflicts
    data/
      db.ts migrations.ts repositories/ storage-budget.ts
    workers/
      import.worker.ts
      language.worker.ts
      protocol.ts
    services/tts/
      provider.ts browser-provider.ts player.ts
  server/
    auth.ts sessions.ts rate-limit.ts
  functions/
    _middleware.ts
    auth/login.ts
    auth/logout.ts
    api/session.ts
  migrations/0001_auth.sql
  public/_routes.json
  tests/unit/ integration/ e2e/ fixtures/
  docs/USER-GUIDE.md BACKUP-GUIDE.md RELEASE-CHECKLIST.md
  wrangler.jsonc
  .dev.vars.example
  .gitignore
```

Tách pure logic khỏi React/DOM để kiểm thử. Không thêm backend nội dung vào R1. Không copy nguyên qtOnline.js/m_translation.js/m_modal.js hoặc TTS userscript vào bundle.

## 11. Triển khai 0 VNĐ và vận hành

Chọn Cloudflare Pages Free + Functions Free + D1 Free cho auth, địa chỉ pages.dev. Repo riêng, build Vite, output dist, secret chỉ ở runtime. Mọi route qua auth middleware trừ login tối thiểu; quota request của Functions vẫn áp dụng khi gate chạy trên asset. Chỉ đưa build/migrations lên hosting, không upload STV Novel hay thư mục source mirror.

Để giữ 0 VNĐ: không bật Workers Paid/R2/Azure trả phí; không mua domain; không gắn paid billing cho Gemini ở giai đoạn này. Hết hạn mức backend thì chặn mở phiên online mới theo Fail closed, không tự nâng gói; phần dữ liệu đã nạp local không phụ thuộc AI. Cloudflare account/D1/secrets cần người dùng cấu hình khi tới M7; không cần lấy password/API key qua chat trong giai đoạn lập kế hoạch.

Quy trình phát hành: local tests → preview dùng fixture, có gate → test Windows/Android → production → backup một truyện mẫu → restore sang thiết bị khác. Trước cập nhật schema, xuất backup và có kế hoạch phục hồi; rollback bundle không tự rollback schema IndexedDB.

Vercel và Tunnel không nằm trong đường triển khai mặc định để tránh duy trì nhiều adapter ở MVP. Tunnel giữ vai trò thử backend/Edge bridge trên PC ở R2, có phụ thuộc máy đang bật.

## 12. R2 và cách chốt tính khả thi trước khi làm

| Tính năng | Phụ thuộc | Điều kiện chấp nhận |
|---|---|---|
| Metadata/progress sync | R1 auth + book/content hash | Hai máy có cùng nội dung nhận đúng tiến độ; conflict có revision; không âm thầm tải TXT |
| Gemini một chương/đoạn theo yêu cầu | Auth + model free khả dụng | Client gửi text đã chọn vì server chưa có TXT; key server, quota project/model, cache theo hash/version; 429 chờ có hạn |
| Azure F0 | Tài khoản/giọng/hạn mức xác nhận | Không tự chuyển gói; hết quota dừng và thông báo; fallback chỉ khi được chốt riêng |
| Edge bridge | PC/service riêng + xác thực | Kiểm thử giọng thực; nêu phụ thuộc PC; không cam kết dịch vụ cộng đồng luôn hoạt động |
| TikTok | Provider hợp lệ, ổn định được xác minh | Không dùng endpoint STV làm backend của mình; chưa đủ điều kiện thì không bật giọng giả |
| Content sync | Chọn storage và ngân sách cụ thể | Chỉ truyện chọn; upload/resume/checksum/private access; không hứa chứa cả kho |
| EPUB/DOCX/PDF | TXT pipeline ổn định + parser riêng | Xuất text có preview; không chạy script/HTML được nhúng |
| PWA offline mã hóa | Thiết kế khóa local và phục hồi | Test mất khóa, logout, offline unlock, update/migration trước công bố bảo mật |

Lưu file ở giai đoạn mở rộng: Cloudflare R2 có free allowance nhưng không phải hard cap 0 đồng; không bật mặc định khi ràng buộc không phát sinh phí là tuyệt đối. D1 sharding chỉ dành tập nhỏ thử nghiệm, không quay lại chiến lược dùng nhiều DB chứa cả kho làm mặc định. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Gemini: rate limit theo project, không tăng bằng đổi key cùng project. Khi không có cloud content, cache bản dịch đầy đủ nên lưu local mặc định; server chỉ lưu trạng thái/hash nếu chưa chốt storage cho output. Job theo đoạn có idempotency/lease, retries hữu hạn; không bắt Worker ngủ chờ quota, không tự dịch hàng loạt. [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

## 13. Việc có thể bắt đầu ngay

1. Tạo project riêng trong workspace hiện tại, chốt schema local và protocol worker theo M0; không sửa thư mục nguồn D:.
2. Tạo fixture nhỏ tự viết, đưa một truyện người dùng chọn vào luồng nhập thử; phát hiện trước phần encoding/title bất thường.
3. Benchmark từ điển 43,69 MB và pipeline TXT 38,26 MB trên Windows/Android, quyết định cấu trúc chỉ mục phù hợp.
4. Hoàn thành Library + Reader và backup tối thiểu trong quá trình phát triển để không dùng dữ liệu thật mà chưa có đường xuất lại.
5. Tiếp tục từng mốc M2–M8; báo cáo theo chức năng thực sự chạy và kết quả nghiệm thu, không chỉ số file đã tạo.

Không còn thiếu vị trí bộ Vietphrase để bắt đầu. Các điểm còn cần xác minh trong lúc code là RAM/giọng thực tế trên Android, tính hợp lệ toàn bộ từ điển và quyền tái sử dụng nguồn tham khảo, cùng khả năng triển khai auth an toàn trong Free budget. Chúng là đầu việc M0/M3/M7, không phải lý do trì hoãn Library/Reader.

## 05/10/2026 — Trạng thái đối chiếu sau audit/UI

Codex đã đối chiếu mã và tạo ca tái hiện độc lập: chưa đạt toàn bộ R0/R1. M6 còn lỗi dữ liệu; M5 chưa gateway/audio thật; M7/M8 chưa deploy/private runtime và Android thật. Không dùng checkbox cũ trong lịch sử HANDOFF làm bằng chứng nghiệm thu.

UI hiện có bánh răng mở/ẩn, bảng Name/Nghe riêng, điều hướng hai đầu và Chỉ đọc theo pattern mã STV đã tải. Xem `private-novel/docs/STV-UI-MAPPING.md` và `USER-GUIDE.md`. Báo cáo/ưu tiên sửa nhỏ có invariants và test tại `private-novel/docs/AUDIT-2026-10-05.md`; release gates tại `RELEASE-CHECKLIST.md`. Các mục trên là tiêu chí chưa hoàn tất, không đánh dấu bằng cách chỉ tạo UI.

## 05/10/2026 09:28 ICT — lượt đa model đã kiểm chứng

A2 Compact Replace đã sửa/review độc lập; C1 longest Names/Names2 và C2 settings hydrate/save đã sửa. Root61/61unit,30/30E2E,buildpass; audit1fixed+6remainingdefects. Không tương đương hoàn toàn STV/Vietphrase hoặc release. Next A3 atomicdictionaryrestore; mapping từ điển và một thao tác Convert/UI nhỏ theo `private-novel/docs/MODEL-WORKFLOW.md`. HANDOFF chứa mô tả per-file/model/test/giới hạn, giữ lịch sử kết quảfail và chưaxácminh. Dữ liệu người dùng ở `D:\linh tinh\tm\STV Novel\mới chưa sửa\Vietphrase-data`, chỉ nhập khi được người dùng chọn, không upload.
