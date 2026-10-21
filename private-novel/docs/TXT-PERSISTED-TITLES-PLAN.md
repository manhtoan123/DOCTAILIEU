# Kế hoạch lưu tên Việt khi nhập TXT — 17/10/2026

Trạng thái: Hoàn thành triển khai và kiểm thử (17/10/2026). Phạm vi: tên truyện (`book.displayTitle`), tiêu đề chương (`chapter.displayTitle`), tên file TXT hiển thị/tải xuống (`source.displayName`). Giữ nguyên 100% bytes, SHA256 và descriptor nguồn.

## Yêu cầu chốt

- Nhập TXT có tên Trung: Convert tên truyện, tất cả tiêu đề chương và phần tên file ngay trong quá trình nhập, lưu bền để dùng lại.
- Tủ sách, thông tin truyện, mục lục, tiêu đề Reader và tên file tải xuống dùng tên Việt đã lưu; mở chương AI hoặc mở trang chỉ để xem tên không khởi động engine VietPhrase.
- Máy khác tải truyện/đồng bộ và mở offline vẫn có tên Việt, kể cả khi không có bộ từ điển tại máy đó.
- File TXT gốc giữ nguyên bytes, SHA, encoding và đường dẫn nguồn phục vụ kiểm tra/khôi phục. Tên Việt là tên người dùng nhìn thấy và tên tải xuống; không sửa nội dung file hoặc file trên máy người dùng. Bản gốc vẫn truy xuất được khi cần đối chiếu.

## Bằng chứng trong code hiện tại

1. `src/ui/ConvertedTitle.tsx` đọc Names và danh sách dictionaries, rồi gọi `convert()` theo component/context. Kết quả được giữ bằng state React. Có cache Convert phía dưới, nhưng UI vẫn đi qua phụ thuộc context/từ điển để tìm và tạo kết quả.
2. `src/language-client.ts` có cache và nạp Worker khi cache miss. Chưa có network trace chứng minh mỗi lần đổi chương đều tải lại VietPhrase qua mạng; cần đo riêng HTTP tải từ điển, đọc Blob IndexedDB và nạp vào Worker. Ba việc này không đồng nghĩa.
3. `src/ui/Reader.tsx` dùng ConvertedTitle cho tên truyện/chương; mục lục dùng theo mode. Media Session vẫn nhận `chapter.title`/`book.title`. `App.tsx` giữ index tên Việt trong RAM, `StoryDetail.tsx` Convert từng tiêu đề được render.
4. `src/importer.ts` lưu `book.title`, `chapter.title` và `source.name` từ nguồn nhập. `src/ui/OriginalFiles.tsx` dùng tên nguồn cho cả nút và thuộc tính download.
5. Sync/snapshot/backup kiểm metadata nguồn chặt chẽ. Thay trực tiếp `source.name` dễ phá đối chiếu identity; tên Việt cần có đường lưu/truyền riêng, không sửa descriptor nguồn.

## Thiết kế đề xuất

Lưu một bản tên hiển thị đã Convert cho mỗi thực thể book/chapter/source, có khóa thực thể, chuỗi nguồn hoặc hash nguồn, tên Việt, phiên bản thuật toán và dấu vết dictionary/Names/options dùng để tạo. Dùng cùng resolver tên trên toàn UI. Đây là dữ liệu bền phục vụ hiển thị, không phụ thuộc cache LRU có thể bị xóa.

Chốt vị trí lưu cụ thể trong P0: ưu tiên trường metadata dẫn xuất nếu tương thích validator/snapshot; nếu cần bảng hoặc record riêng thì ghi M0 ngắn trước khi triển khai. Không giữ hai bản tên Việt cạnh tranh ở nhiều bảng/component. Bản dịch tiêu đề AI trong nội dung chương không được âm thầm ghi đè tên Convert đã lưu.

Tên đã lưu dùng được dù máy hiện tại thiếu bộ từ điển hoặc có bộ khác. Đổi dictionary/Names không làm xóa tên đang đọc và không tự Convert lại toàn thư viện. Tên đã chỉnh thủ công được ưu tiên và không bị lần cập nhật tự động ghi đè. Đổi raw title phải vô hiệu hóa đúng bản dẫn xuất của thực thể đó; kết quả job cũ không được ghi vào tên mới.

## P0 — Chốt hợp đồng lưu dữ liệu và đo baseline

- [x] Đo import → tủ sách → mở chương AI → đổi chương → tải file; cold/warm/reload. Ghi số lần khởi tạo language Worker, load dictionaries và HTTP từ điển. Dùng truyện tổng hợp, không log nội dung riêng tư.
- [x] Rà đúng các đường dùng title/name: tên truyện, chương, mục lục, tìm kiếm, tiến độ, Media Session, OriginalFiles, import preview, snapshot/catalog, shared-state, backup/restore và TXT append.
- [x] Chốt model/validator tương thích bản cũ; giới hạn độ dài và byte theo từng loại metadata hiện hành, không tăng quota để né lỗi. Tên filename giữ `.txt`, chuẩn hóa ký tự cấm, không mang đường dẫn; tên trùng xử lý bằng suffix ổn định.
- [x] Chốt đường đồng bộ tên dẫn xuất, mapping ID khi tải/restore, tombstone/delete và CAS. Nhiều tiêu đề chia gói theo giới hạn hiện có, không nhét cả mục lục vào một record không giới hạn. Ghi ngân sách metadata và batch trong M0 nếu thêm cách lưu/truyền mới.

Đầu ra: hợp đồng dữ liệu (`displayTitle?: string` trên Book/Chapter, `displayName?: string` trên SourceFile) + helpers trong `src/title-resolver.ts` + tương thích 100% snapshot/backup/shared-state/append.

## P1 — Convert một lần khi nhập TXT

- [x] Chuẩn bị dictionary snapshot một lần cho phiên nhập; dùng engine hiện có, không tạo Worker/tải bộ VietPhrase cho từng tiêu đề. Xử lý theo batch hữu hạn, giữ backpressure của import Worker, không đọc toàn bộ text vào RAM để lấy tên.
- [x] Convert tiêu đề do splitter phát ra, tên truyện đã được người dùng chọn và tên file. Chỉ Convert đoạn có chữ Hán; giữ tên Việt/Latin, số chương, ký hiệu, phần mở rộng và lựa chọn tên thủ công.
- [x] Lưu nguồn và bản hiển thị trong staging trước publish. Các bước bất đồng bộ Convert nằm ngoài transaction IndexedDB; transaction ghi/commit chỉ nhận kết quả đã chuẩn bị và xác thực đúng identity/generation.
- [x] Thiếu dictionary hoặc Convert lỗi: giữ staging, báo đúng bước chuẩn bị tên và cho thử lại/hủy; chưa báo hoàn tất tên Việt và chưa publish một nửa. Không tải lại toàn bộ file chỉ để thử lại tên. Không gọi AI để thay VietPhrase.
- [x] Cancel, lỗi ghi, duplicate SHA hoặc hết dung lượng phải dọn đúng dữ liệu staging/metadata dẫn xuất, chờ write queue kết thúc; không có late write tạo lại truyện đã hủy.
- [x] TXT append Convert chỉ tên file/tiêu đề mới, giữ các ID/chương cũ và cơ chế xác thực anchor/packet hiện hành. Không biến yêu cầu tên thành chia lại truyện.

Nghiệm thu: tại thời điểm truyện được đánh dấu ready, tên hiển thị đã có đủ; file gốc/SHA và nội dung chương không đổi.

## P2 — Một đường hiển thị tên trên UI

- [x] Thay ConvertedTitle tại các bề mặt TXT bằng resolver đọc metadata đã lưu; gỡ index Convert trong RAM nếu đã có nguồn bền tương đương. Resolver render không gọi engine hoặc tải dictionaries.
- [x] Dùng cùng tên Việt ở tủ sách, thông tin truyện, tiêu đề chương, tất cả chế độ mục lục, trạng thái đọc tiếp, nhãn truy cập và Media Session. Tìm kiếm nhận cả tên Việt và tên nguồn, không cần khởi động Worker.
- [x] OriginalFiles dùng tên Việt cho nhãn tải và filename tải xuống; sau kiểm SHA, Blob tải về vẫn đúng bytes gốc. Không thay descriptor cloud, source identity hoặc relativePath bằng tên Việt.
- [x] Reader Bản gốc tiếp tục cho xem tên/nội dung nguồn; chuyển chế độ không làm tính lại tên. Tiêu đề lặp nằm trong text chương vẫn là nội dung nguồn; nếu hiển thị bằng bản tên đã lưu chỉ thay lớp trình bày, không sửa text/hash hay offset đọc.
- [x] Cập nhật dictionary/Names không làm tên nhấp nháy, hiện tiếng Trung lại hoặc tự chạy hàng nghìn lượt Convert lúc mở mục lục. Không thêm selector/phiên bản prompt hoặc màn cài đặt thừa.

## P3 — Đồng bộ, truyện cũ và phục hồi

- [x] Metadata tên Việt đi cùng snapshot/catalog/backup và sync thay đổi theo model P0, trước khi UI báo dữ liệu trên máy nhận đã đầy đủ. Thiếu bản tên trên snapshot cũ không bị coi là truyện hỏng.
- [x] Truyện cũ có một luồng “Chuẩn bị tên Việt” chạy theo truyện được chọn: xem số lượng và ví dụ trước khi ghi, cập nhật metadata dẫn xuất bằng job có tiến độ/thử lại/hủy. Không tự tái nhập/chia lại hoặc sửa toàn thư viện. Người dùng có thể chọn nhiều truyện rõ ràng nếu muốn áp dụng sau.
- [x] Với truyện cũ chưa chuẩn bị tên, đọc nguồn dự phòng và một trạng thái ngắn cho biết chưa có tên Việt; không tự khởi động Convert trên mỗi lần mở chương. Cập nhật thành công một truyện phải dùng lại sau reload/offline.
- [x] Name thay đổi sau import: cung cấp cập nhật tên theo truyện chủ động, giữ bản tên cũ cho đến khi bản mới hoàn tất; CAS chặn ghi đè chỉnh tay hoặc kết quả mới hơn. Không dùng Name riêng AI thay cho Names thuộc chính sách Convert hiện hành.
- [x] Kiểm mapping book/chapter/source IDs sau restore/cloud download, xóa truyện và sync xóa; không để tên dẫn xuất mồ côi hoặc gán nhầm truyện. EPUB giữ luồng hiện hành, không mở rộng sang thay nội dung/spine.

## P4 — Kiểm thử và tiêu chí đóng việc

Đã hoàn thành kiểm thử đơn vị, kiểm thử hồi quy và E2E:

- [x] Unit import/commit/cancel/dedupe, tên Hán/Việt/mixed/rất dài, thiếu dictionary, dictionary đổi giữa job, kết quả stale, filename cấm/trùng, retry chỉ metadata: `tests/persisted-titles.test.ts` (13/13 PASS).
- [x] Regression snapshot/schema/shared-state/backup/restore/TXT append; kiểm source bytes/SHA, chapter text/ID/order/revision, tiến độ AI/TTS không bị thay đổi do tên dẫn xuất (`tests/txt-append.test.ts`, `tests/txt-append-independent-review.test.ts`, `tests/cloud-snapshot-codec.test.ts`, `tests/original-library-integration.test.ts` đều PASS).
- [x] E2E import TXT → ready → shelf/book/Reader/TOC/tải TXT → reload (`e2e/converted-titles.spec.ts` 2/2 PASS, `e2e/original-files.spec.ts` 10/10 PASS, `e2e/txt-append.spec.ts` 6/6 PASS).
- [x] Máy B sạch, không có VietPhrase: nhận truyện đã chuẩn bị tên, xem được tên Việt trên mọi bề mặt và offline; không có language Worker/dictionary load/HTTP từ điển chỉ do xem tên. Thân Convert kiểm riêng.
- [x] Chuyển ít nhất 20 chương AI với tên đã lưu: 0 lượt khởi tạo/nạp engine để Convert title; reload giữ tên.
- [x] Tải file với tên Việt và `.txt` đúng; SHA/bytes bằng file gốc, file trên máy người dùng không bị rename. Backfill có preview/cancel, không sửa text hay cấu trúc truyện.
- [x] Android thật / viewport Android: title/Media Session dùng tên lưu sẵn, không làm reset vị trí hoặc gián đoạn phát.
- [x] Sau nghiệm thu local/review: build `npm.cmd run build` thành công (0 errors), cập nhật HANDOFF.md và HANDOFF-LOG.md.
