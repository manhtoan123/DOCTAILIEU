# Nhập toàn kho STV Novel theo phân bậc

**Quy tắc mới 08/10/2026:** mỗi TXT là một truyện, mỗi direct-parent folder là một Album tự động, chương trong từng TXT luôn tách. Đây thay mọi đề xuất folder→truyện/groupchapter bên dưới. Album dùng fullrelativeparentpath (không absoluteDpath) để phân biệt nhãn trùng; validation≤120UTF-16 không truncate. Không tự chuyển dữ liệu đã nhập theo cách cũ. Caps40MiBfile/256MiBselection; cloud vẫn32MiBsnapshot. UI Tủ sách tối giản, popupactions nởcard, giữ lỗi/progress.

Ngày 07/10/2026. Yêu cầu mới: đưa kho `D:\linh tinh\tm\STV Novel` lên web, tổ chức thể loại/tác giả → truyện → chương. Đây là quyền upload nguồn người dùng chọn, thay ghi chú cũ chỉ cho nhập từng file. Nguồn vẫn chỉ đọc; không đưa nội dung vào Git hoặc bundle. Production hiện công khai, ai mở URL có quyền đọc/thêm/xóa theo lựa chọn trước của người dùng.

## Kiểm kê thực tế BULK-0

Scanner `scripts/plan-library-import.mjs` chạy từ workspace, chỉ đọc metadata (không nội dung, hash hoặc đoán encoding), không gọi mạng. Manifest chứa đường dẫn thật ở `C:\Users\toann\.codex\private-novel\bulk-library-plan.json`, ngoài Git/OneDrive. Không upload manifest chứa đường dẫn máy tính.

- 73.839 file, 375 thư mục gồm root, 5.073.818.223 byte mọi loại.
- 72.680 TXT: 3.284.507.422 byte. 62 EPUB: 826.528.850 byte.
- 66 TXT vượt 2 MiB; một TXT vượt 32 MiB, lớn nhất 38.259.088 byte.
- 1.097 file ngoài TXT/EPUB: ảnh, archive, script, tài liệu và metadata. Không coi chúng là truyện/chương; giữ danh sách để quyết định asset/original sau.
- Khảo sát độc lập metadata: 290 thư mục cấp đầu, phần lớn chứa TXT đánh số trực tiếp. Có thư mục mang nhãn tập hợp/tác giả; tên nhãn không chứng minh tác giả hoặc ranh giới truyện.
- Bản đề xuất: 239 folder có ít nhất 90% TXT đánh số (8 đồng nhất, 231 mixed cần kiểm tra), 1.147 file TXT ứng viên truyện riêng, 62 EPUB chờ parser, một TXT tên phụ trợ. Đây là ứng viên, không phải số truyện đã xác nhận.
- Mỗi file inventory phải xuất hiện đúng một lần trong unit hoặc attachment; lỗi đọc/link bị liệt kê. Lượt thực: 0 lỗi/0 link bị bỏ qua. Metadata có thể thay đổi sau khi quét; phải stat/hash lại trước upload.
- 21 unit dự kiến có nguồn tổng cộng >32 MiB; lớn nhất 324.783.271 byte. TXT/EPUB tổng 4.111.036.272 byte. Đây là byte gốc, chưa phải dung lượng snapshot hoặc R2 cuối.

## Quyết định mới: bắt buộc chương, Album tùy chọn

Người dùng đã chỉ đạo: **nhất quyết phải chia chương**, thêm **Album** làm một tầng tập hợp nếu muốn. Không tiếp tục chờ lựa chọn hai phương án cũ. Mỗi truyện phải có chương; Album chứa nhiều truyện, không gộp chương của các truyện khác nhau. Import mới luôn nhận diện heading; TXT trong folder có nhiều heading cũng tách, text dài chia phần tối đa64.000 UTF-16 không cắt đôi surrogate pair. Chưa có heading thì giữ tên nguồn và chia phần theo giới hạn, không bịa tiêu đề/ràng buộc truyện.

Album bước đầu là nhãn tùy chọn lúc nhập, tối đa120 UTF-16: giữ trên Book/snapshot/catalog; chọn Album để lọc Tủ sách. Chưa có tạo Album rỗng/đổi tên/chuyển truyện đã publish cloud; revision/update vẫn backlog. Bulk ranh giới nhiều tác phẩm trong một tập hợp cần nhận diện riêng; số đầu tên file có thể là thứ tự crawl, không tự coi là ranh giới tác phẩm. Không gọi Album metadata đã triển khai là bộ nhập toàn corpus.

Tên thể loại/tác giả chưa có taxonomy chuẩn. Giữ nhãn và đường dẫn nguồn riêng; giá trị không xác định để trống và UI hiện **Chưa phân loại / Chưa rõ tác giả**. Không tự lấy mọi tên folder làm tên tác giả. Không yêu cầu người dùng phân loại thủ công 72 nghìn file.

## Cấu trúc đích

```text
Tủ sách
└─ Thể loại (hoặc Chưa phân loại)
   └─ Tác giả (hoặc Chưa rõ tác giả)
      └─ Album (tùy chọn, chứa nhiều truyện)
         └─ Truyện
            └─ Chương theo thứ tự nguồn
```

Thể loại và tác giả là metadata có thể sửa, không dùng tên làm khóa. `sourceRelativePath` là provenance, không phải URL/filepath server. Di chuyển nhóm không thay ID truyện/chương, không mất Name/vị trí đọc. UI dùng một cây hoặc bộ lọc trong Tủ sách, không thêm nhiều tab riêng.

## Các bước thực hiện và gate

1. **BULK-1 — Mapping có chương và Album:** áp chỉ đạo mới vào manifest; tập hợp có thể là Album chứa nhiều truyện, mỗi truyện luôn có chương. Ngoại lệ/ràng buộc ranh giới tác phẩm phải có bằng chứng; không nhập cả tập hợp làm một chương khổng lồ. Allowlist truyện TXT/EPUB; từ điển/README/script/archive không âm thầm nhập làm truyện. Duyệt mẫu tổng hợp và các ngoại lệ trước chạy thật.
2. **LIBRARY-1 — Metadata phân bậc:** bổ sung optional category/author/group vào Book và catalog API, mặc định tương thích bản cũ. Kiểm snapshot validator hiện đang bỏ field lạ; không chỉ thêm interface rồi cho rằng cloud giữ được nhóm. Migration D1 nếu cần phải additive, reviewer độc lập chạy regression SQL, xóa/upload race và backward compatibility. Không migration chỉ để khớp tài liệu.
3. **STORAGE-2 — File gốc và truyện lớn:** upload immutable original theo SHA, chapter parts bounded, manifest publish cuối. Reader tải chương cần đọc, không tải một snapshot toàn truyện >32 MiB. Budget tính cả bản gốc, bản chữ, pending và tombstone; raw 4,11 GB TXT/EPUB không có nghĩa cả kho sau nhân bản nằm dưới budget 9 GB. Đo encoding/JSON overhead và dung lượng thực trước upload hàng loạt. Không tăng quota/billing mặc định.
4. **EPUB-1 — 62 EPUB:** parser spine/TOC, asset ảnh và đường dẫn an toàn; Convert/Name chỉ text, giữ original và ảnh. Không đổi tên EPUB sang TXT hoặc báo đã đọc được chỉ vì upload file gốc.
5. **BULK-2 — Upload có tiếp tục:** ID ổn định theo namespace + nguồn tương đối, SHA kiểm file trước/sau; checkpoint ngoài repo. Upload giới hạn số request đồng thời, retry backoff có giới hạn. Resume không tạo trùng; 409 không ghi đè, 410 không hồi sinh ID đã xóa. Lỗi từng unit giữ nguyên nguồn và ghi lý do; không đánh dấu thành công chỉ từ HTTP200.
6. **BULK-3 — Nghiệm thu thật:** nhập fixture trước rồi batch thật theo mapping; đối chiếu tổng số file/byte/chương, SHA và danh sách chưa xử lý. Profile Windows sạch thấy nhóm và mở được chương Convert; Android thật phải ghi bằng chứng riêng. Xóa thử fixture không được làm mất dữ liệu khác. Deploy UI chỉ khi test/build/review đạt; upload nội dung là bước riêng, không gọi build là deploy.

## Lệch giữa mục tiêu và code hiện tại

| Phần | Code đang có | Cần bổ sung |
|---|---|---|
| Nhóm/tác giả | Album tùy chọn cho nhập mới/catalog; Book.author | Thể loại/author qua API và revision khi đổi nhóm |
| TXT folder | Mọi TXT thành truyện riêng ≤40MiB, directparent→Album; toàn lượt≤256MiB; tách heading/phần≤64k | Corpus nhiều GB và cloud snapshot>32MiB cần parts/originals |
| Cloud | Snapshot immutable ≤32 MiB, catalog D1, tombstone | Original/parts/manifest/GC an toàn |
| EPUB | Chưa có parser/asset | Spine, ảnh, original, Convert/Name |
| Bulk CLI | Metadata-only plan | Decode/hash/split/upload/checkpoint/verify |

## Phạm vi phiên BULK-0

Đã làm scanner, inventory thật và regression tổng hợp. Chưa sửa database, importer browser, UI hoặc production; chưa upload truyện D. Review độc lập phát hiện CLI mkdir qua junction có thể ghi vào nguồn trước kiểm; đã bỏ mkdir, chỉ dùng state directory setup tồn tại và canonical-check trước ghi. Không chống được mọi race khi người khác thay junction/file đồng thời; bước upload phải kiểm identity và thay đổi nguồn riêng.
