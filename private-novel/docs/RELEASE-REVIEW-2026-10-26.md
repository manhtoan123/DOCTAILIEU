# Rà soát các bản phát hành — 26/10/2026

Yêu cầu: rà các lỗi tích lũy qua nhiều lần deploy. So sánh code từ `e1913fe` qua bản tích hợp `592e796` đến working tree hiện hành; kiểm tra riêng các sửa AI/TTS đã deploy sau bản tích hợp. Giữ dữ liệu và thay đổi cũ; không commit/push trong lượt này.

## Lỗi đã tái hiện và sửa

| Mức | Luồng | Trước khi sửa | Sửa và bảo toàn |
|---|---|---|---|
| P1 | Xuất backup khi chuyển Album | Metadata thuộc tác giả A có thể đi cùng Name thuộc tác giả B. | Đọc Book, Name hiệu lực và kho Album trong cùng snapshot IndexedDB. Hash/Blob vẫn xử lý ngoài transaction. |
| P1 | Khôi phục Name vào Album đang dùng | Backup có thể ghi đè nghĩa legacy hiện hành, áp tombstone làm mất nghĩa đang kế thừa, hoặc tự giải quyết xung đột giữa series. | Giữ nghĩa hiện hành không xung đột; giữ xung đột cũ và tombstone hiện hành. Chỉ bổ sung khóa chưa có. Tombstone của backup vẫn được phục hồi vào kho trống. Không sửa các dòng legacy nguồn. |
| P1 | Giới hạn kho Name dùng chung | Mỗi bản nhập/sync hợp lệ riêng lẻ nhưng tổng vượt 20.000, làm Reader lỗi khi đọc Name; kiểm một truyện có thể bỏ sót truyện khác còn có khóa xung đột riêng. | Validator tính Name chung cộng khóa xung đột riêng của từng thành viên trong cùng snapshot. Restore, cloud download, sync, chọn conflict, lưu Name và chuyển/đổi tên/gỡ Album kiểm trước commit. Vượt giới hạn rollback toàn thao tác, giữ dữ liệu/conflict/mốc sync. Kiểm cả Album cũ và mới khi đổi thành viên. |
| P2 | Nghe trong lúc AI chưa hoàn tất | Khi đã bắt đầu nghe preview, bản AI hoàn tất sau đó nhưng player chưa có cursor gắn với bản dịch đầy đủ; tải lại không có mốc tiếp tục hợp lệ. | Gắn identity cuối vào player đang hoạt động khi cùng nguồn/prompt và prefix đã đọc còn nguyên. Lưu vị trí/thời gian audio thực, không phát lại từ đầu, không tự phát khi reload. |

Mã liên quan: `backup.ts`, `scoped-names.ts`, `album-registry.ts`, `cloud-snapshot.ts`, `shared-state-sync.ts`, `Reader.tsx`.

## Chính sách restore được làm rõ

Xóa settings trong fixture không xóa các dòng Name legacy. Vì vậy tombstone từ backup không được xóa một nghĩa legacy vẫn đang dùng trong Album. Ca kiểm tra cũ đã sửa expectation theo nguyên tắc **giá trị đang dùng thắng backup**; bổ sung ca kho hoàn toàn trống để vẫn kiểm chứng khả năng phục hồi tombstone. Đây là thay đổi hợp đồng có review, không bỏ assertion để che lỗi.

## Phạm vi kiểm tra

- Reviewer độc lập kiểm snapshot/ownership, giới hạn Name, rollback, tombstone, conflict và TTS identity; 27 test ordinary pass, không dùng `it.fails` để tính bản sửa đã đạt.
- Root chạy unit toàn dự án, build CapCut và browser regression sau khi gom bản sửa.
- Browser: backup/restore bằng IndexedDB thật; Name theo Album tác giả/series; đường dẫn theo vị trí mục lục, reload và chương hiện hành; prewarm giữ bookmark; chuyển chương TTS, Stop, pause, cursor và reload; prompt A/B và metadata cấu hình; native Audio/cache/phục hồi CapCut.
- Fixture chỉ dùng dữ liệu tổng hợp. HTTP AI/TTS/cloud được giả lập hoặc chặn trong browser smoke; không ghi dữ liệu người dùng lên cloud. Bridge kiểm thử nằm ngoài thư mục phát hành.

Root: **188 file / 2.303 unit test pass**, gồm regression integrity và runtime workerd; **build pass** với `VITE_TTS_GATEWAY=capcut-v2`, asset `index-Y5MyCcLO.js`. **42 ca browser pass** (16 TTS handoff/cursor, 10 release sweep, 6 prompt, 10 native CapCut); **24 lượt race pass** (3 lần × 2 bố cục cho 4 ca Dừng/chuyển/cursor/cache).

Ca native cache có một failure ban đầu do fixture đếm cả đồng hồ audio keepalive. Đã giữ nguyên ngưỡng `.25`/`.2`, lọc `!audio.loop` để đo audio truyện, reviewer xác nhận; ca này pass 3 lần trên mỗi bố cục. Các failure trước sửa vẫn giữ trong log.

Đã deploy **Pages `472f48d3`** lên [web chính](https://thu-phong-private.pages.dev/). GET địa chỉ chính trả HTTP 200 và đúng asset `index-Y5MyCcLO.js`; **42/42 production smoke pass**, gồm cả 4 nhóm browser nêu trên. AI Worker và schema giữ nguyên; rollback Pages trước: `d07fdcd9`. Không commit/push Git. Smoke vẫn dùng dữ liệu tổng hợp và chặn API cloud/upstream, không phải bằng chứng chất lượng giọng/dịch thật hay phiên đăng nhập người dùng.

## Giới hạn còn lại

- Android trong các spec là layout emulation; chưa phải kiểm chứng Chrome Android thật, khóa màn hình/nền, mạng 4G hay độ ổn định upstream CapCut/AI.
- Cursor cuối chỉ được gắn sau khi bản AI đầy đủ có identity hợp lệ. Tải lại khi AI vẫn chỉ có preview chưa được mở rộng thành một định dạng cursor mới trong lượt sửa này.
- Không tự sửa kho Name đã vượt giới hạn từ trước, xóa nghĩa hoặc tái nhập truyện cũ.
- Dev-server Windows có ca navigation timeout trước khi UI xuất hiện; dùng built preview để kiểm bản bundle phát hành. Một số E2E lịch sử còn nhắm UI đã được người dùng yêu cầu bỏ; lượt này chọn luồng hiện hành và ghi rõ phạm vi, không tuyên bố toàn bộ E2E lịch sử đã pass.

Log chẩn đoán và kiểm chứng: `.dsh-tmp/release-sweep/`, `.dsh-tmp/release-integrity-*.log`. Các log trước sửa được giữ riêng.
