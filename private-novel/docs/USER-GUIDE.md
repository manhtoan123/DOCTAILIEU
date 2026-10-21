# Sử dụng Thư Phòng local alpha

Chạy trong thư mục `private-novel/`: `npm.cmd run dev`, mở `http://127.0.0.1:5173/`. Đây là development trên máy hiện tại; chưa phải web private đã triển khai.

## Thêm và đọc truyện

**Nhập folder:** Thêm truyện TXT → Nhập folder: mỗi file một chương. Chọn folder, kiểm tra truyện/chương và danh sách file không phải TXT, bấm Chuẩn bị nhập folder rồi Xác nhận các folder vào thư viện. Mỗi folder có TXT trực tiếp là một truyện, folder con có TXT thành truyện riêng; 2.txt đứng trước10.txt. Không tách lại heading trong file. Hủy bản nhập xóa phần staging. Trần hiện tại2MiB/file,128.000 ký tự/chương,32MiB/folder; quá lớn/chương rỗng/encoding sai báo lỗi thay vì bỏ/chia. Trình chọn folder trên Android thật chưa xác minh; EPUB chưa hỗ trợ.

1. **Thêm truyện TXT**: chọn một file hoặc dán nội dung; chọn encoding/Regex nếu cần.
2. **Tách chương & xem trước**: kiểm tra các phần. Heading trong TXT tạo mục lục; nội dung chưa vào thư viện cho đến khi xác nhận.
3. **Xác nhận vào thư viện**: mở Reader. Mỗi file là một truyện; nguồn gốc ở ổ D: không bị chỉnh sửa.
4. **Chương trước / Mục lục / Chương sau**: ở hai đầu trang. Trong mục lục có ô tìm tên và phân trang.
5. **Công cụ**: Sửa chương, tách tại con trỏ, xuất chương TXT, hướng dẫn thao tác. Chưa có màn hình CRUD chương đầy đủ.

Trong Tủ sách, bấm **bìa hoặc tên truyện** để xem thông tin và danh sách chương.
Phân cấp: **Tác giả (Album) → Series (Album con) → Truyện → Chương**. Tủ sách chỉ hiện Album tầng ngoài; mở tác giả mới thấy Album con/Series. Đường dẫn folder cũ tự hiển thị theo cây, kể cả khi folder cha không có truyện trực tiếp; không cần nhập lại. Nút **← Album cha** và đường dẫn Album dùng để quay về tầng trước. Truyện nằm trực tiếp trong Album tác giả hiện ở nhóm **Truyện ngoài Series**. **Tạo Album con / Series** tạo nhánh trong Album đang mở; thêm truyện tại nhánh nào thì truyện vào đúng nhánh đó.
Tên Album và truyện ưu tiên tên Việt; tên Trung gốc nằm nhỏ, mờ bên dưới khi hai tên khác nhau. Album dùng bộ từ điển Convert đã lưu trên thiết bị.
Chọn **Lưới / Danh sách** để đổi cách xem; lựa chọn được nhớ trên trình duyệt này.
Ô tìm kiếm nhận tên truyện, tác giả và tên chương Việt / Trung, có thể nhập tiếng Việt không dấu. Trong Album, kết quả thuộc Album đó và các Album con, không lẫn nhánh tác giả khác. Bấm **Chương: …** trong kết quả để mở thẳng chương khớp đầu tiên. Tên chương của truyện chỉ có trên kho chung tìm được sau khi mở truyện để tải mục lục về máy.
**Đọc tiếp** mở vị trí đã lưu; **Đọc từ đầu** hoặc bấm một chương mở từ đầu chương đó.
Reader **← Thông tin truyện** quay lại trang truyện; **← Tủ sách** giữ từ khóa tìm truyện trong phiên.
**Mở sách →** ở Tủ sách vẫn đọc tiếp trực tiếp. Trang truyện có tìm tên/số chương và 60 mục mỗi trang;
chương đang đọc được đánh dấu. Xem thông tin không thay đổi TXT hay tiến độ.

## Bật, ẩn và nhớ cài đặt

| Nút | Bật/mở | Ẩn/tắt | Ghi nhớ |
|---|---|---|---|
| ⚙ | Mở Cài đặt hiển thị | Bấm lại, Ẩn hoặc Esc | Màu/font/cỡ/giãn dòng/chiều rộng/căn chữ lưu trên thiết bị |
| Chỉ đọc | Ẩn header/thanh thao tác | ⚙ → Hiện thanh công cụ, hoặc Esc khi không có bảng khác | Chế độ theo phiên |
| Name | Mở bảng Name bên phải | Ẩn hoặc bấm Name lại | Bản nháp giữ khi ẩn trong cùng Reader; bấm Lưu mới lưu DB |
| Nghe sách | Mở bảng giọng/tốc độ/câu | Ẩn bảng; **âm thanh vẫn tiếp tục** | Nút ■ hoặc ■ nổi mới dừng |
| Chạm từ Convert | Luôn bật trong bản Convert mặc định | Chuyển sang **Xem bản gốc** trong Công cụ | Sửa tạm theo phiên; nút đĩa lưu cố định |

Mặc định có nền Sepia/Sáng/Tối/Xám. Bảng màu và color picker cho đổi nền/chữ riêng; chọn một theme xóa màu tùy chọn để theme có hiệu lực. Font dùng font hệ thống có sẵn; không tải font từ nguồn tham khảo.

## Convert và Name

**Từ điển chỉ cần lưu một lần:** chọn Vietphrase/Names/Hán-Việt rồi bấm **Lưu ... file vào trình duyệt**. Tải lại trang tự mở bộ đã lưu; thông báo “Đang mở từ điển đã lưu” là đọc lại vào RAM, không cần chọn file lại. Sau khi lưu, app xin quyền lưu trữ bền vững nếu trình duyệt hỗ trợ; bị từ chối vẫn dùng IndexedDB bình thường. Đổi origin/thiết bị/profile hoặc xóa dữ liệu web không chuyển bộ cũ sang nơi mới; hãy giữ file nguồn để nhập lại khi cần.

Nạp các từ điển TXT của bạn trong tab **Từ điển**. Reader mở bằng bản Convert và xử lý trong Worker trên máy. Chạm một từ để mở bảng nhỏ hv/HV/zw/Tr/tc ngay cạnh từ; dùng **Mở rộng** nếu cần cụm dài hơn. Dấu ✓ chỉ thay đúng lần xuất hiện đang chọn trong phiên. Nút đĩa lưu Name cố định cho truyện và áp dụng lại mọi lần xuất hiện phù hợp. Muốn kiểm tra chữ Trung thô, chọn **Công cụ → Xem bản gốc**.

Bảng **Name** nhận từng dòng `张三=Trương Tam`. **Lưu lại** cập nhật key trùng và thêm key mới. **Chạy** lưu rồi chuyển sang Convert. Xóa dòng trong ô soạn không xóa Name đã lưu; dùng × bên cạnh tên trong danh sách. **Nhập dữ liệu Name** đưa file vào bản nháp để xem trước, chưa tự lưu. **Xuất dữ liệu** xuất bản nháp hiện trong ô. Trong lúc lưu, các ô nhập bị khóa ngắn để bảo toàn bản nháp.

## Nghe sách — TikTok tiếng Việt

Bấm **Nghe sách** ngay trên trang đọc để phát; nút đổi thành **Tạm dừng/Tiếp tục**, đang tải thì bấm **Dừng tải** để hủy. **⚙ Nghe** mở cài đặt hai giọng TikTok **Nữ 1/Nam 1**. Không cần ô cho phép; bấm Nghe sẽ gửi câu đọc đến gateway. Không cần API key hoặc cookie TikTok. Câu đọc được gửi tới gateway cộng đồng; lỗi máy chủ500/502/503/504 được thử lại một lần sau0,6giây; nếu vẫn lỗi app dừng/báo lỗi, không đổi giọng hoặc bỏ câu.

- Có tạm dừng/tiếp tục, ■ dừng, tốc độ trên thiết bị và màu highlight. **Qua chương** tự phát chương kế khi bật; ■ hủy việc chuyển đang chờ. Ẩn bảng vẫn nghe.
- Mỗi đoạn tối đa200 ký tự Unicode, request timeout30giây. Khi đang đọc, tự tải trước2đoạn và dùng chung audio trùng trong cửa sổ3đoạn. Dừng/đổi chương/đổi giọng hủy bộ đệm. Câu đầu hoặc gateway chậm vẫn có thể phải chờ. Nữ2 và Bing/Google chưa cấu hình, không phát được.
- **Câu** sửa nội dung nghe trong phiên, không sửa chapter/file gốc. Highlight tắt khi dùng nội dung nghe khác bản đọc để tránh tô nhầm.
- Chrome Android thật/khóa màn hình/chạy nền chưa nghiệm thu. Audio thật Windows kiểm riêng; test Audio mock không chứng minh thiết bị thật.

## Dữ liệu và giới hạn

Truyện/từ điển nằm trong IndexedDB theo origin/profile trên mỗi thiết bị. Đổi trình duyệt, đổi origin hoặc xóa dữ liệu web không tự chuyển nội dung. Chưa có sync cloud/Gemini. Backup/restore có lỗi dữ liệu đã tái hiện; đọc BACKUP-GUIDE.md trước khi dùng, đặc biệt tránh Compact + Replace.

## 06/10/2026 — Nhập nhiều truyện và Kho cloud
Thêm truyện TXT cho phép chọn nhiều file cùng lúc. Mỗi TXT là một truyện riêng; các tùy chọn encoding/nhận diện chương/regex dùng chung cả lô. Bấm Chuẩn bị nhập nhiều truyện, xem danh sách rồi Xác nhận tất cả truyện vào thư viện. Hủy hoặc lỗi lúc chuẩn bị xóa bản tạm của cả lô, giữ truyện cũ. Tối đa100file,40MiB/file,256MiB/lô. Folder giữ quy tắc mỗi parent trực tiếp một truyện, mỗiTXT một chương.
Truyện ready tự thử upload nếu R2 và đăng nhập đã cấu hình. Mở Kho cloud để xem lỗi/thử lại và lấy danh sách/tải truyện về thiết bị khác. Bản cloud chỉ chữ/chương/Name tại lúc thêm, chưa đồng bộ chỉnh sửa về sau, filegốc/từđiển/progress/ảnhEPUB. Bản local không bị xóa khi cloud lỗi. Xem R2-SETUP.md: hiện tài khoản chưa bậtR2 và chưa có mật khẩu; không coi là sync online đã hoạt động.

## 06/10/2026 18:54 — Mở lại chương Convert nhanh
Kết quả Convert được cache trên thiết bị, tự dùng khi mở lại chương/tiêu đề đã đọc. Cache tự đổi khi sửa Name, từ điển, nội dung hoặc tùy chọn; không cần bấm nút để bật. Lần đầu/chương mới và tra từ vẫn có thể cần chờ từ điển ở nền. Cache có giới hạn và tự bỏ bản cũ; file truyện/từ điển gốc vẫn được giữ. Đây chưa phải dictionary cloud dùng chung thiết bị.

## 06/10/2026 22:07 — Kết nối kho R2 không nhập mật khẩu
R2 đã hoạt động. Trên Windows mở file riêng C:\Users\toann\.codex\private-novel\connect-cloud.html, bấm Kết nối và mở Thư Phòng một lần. Sau đó mở web bình thường; truyện mới tự đưa bản chữ/chương/Name lên cloud. Trong Kho cloud bấm Kết nối thiết bị khác để sao chép liên kết sang Android, mở một lần; giữ liên kết riêng vì nó cấp quyền kho.
Kho cloud tự lấy danh sách; Đọc truyện tải bản local rồi mở ngay Reader. Ngắt kết nối thiết bị chỉ xóa quyền và ACK local, truyện local vẫn giữ. Chưa đồng bộ file gốc, từ điển, tiến trình hoặc sửa đổi về sau; EPUB và mục còn chưa triển khai. Không cần tự tạo bucket/chạy database/lệnhsecret.

### 06/10/2026 22:42 ICT — Tủ sách gọn hơn (bản local)
Dùng nút Thêm truyện TXT ở đầu tủ sách để nhập. Sửa tên/tác giả hoặc xóa nằm trong menu ⋯ của từng truyện; xóa vẫn hỏi xác nhận. Sao lưu ở điều hướng Sao lưu. Gom Cài đặt và tủ sách local/cloud chung là kế hoạch tiếp theo, chưa triển khai/deploy lần này.

### 06/10/2026 22:51 ICT — Điều hướng đã lên Pages
Thanh chính còn Tủ sách và Cài đặt. Trong Cài đặt, chọn Nhóm cài đặt: Convert & từ điển để nạp/tra Convert; Kho & thiết bị để đọc cloud/kết nối điện thoại; Sao lưu & khôi phục để xuất/nhập backup; Thông tin để xem giới hạn. Nhóm vừa chọn được nhớ trong phiên. Tủ sách dùng một nút Thêm truyện TXT và menu ⋯ để Sửa/Xóa. Deploy9971e099 đã kiểm hai kích thước màn hình; Android thật chưa xác minh.

## 07/10/2026 18:29 ICT — Kho chung tự động, không kết nối hay đồng bộ thủ công
Mở https://thu-phong-private.pages.dev/ là thấy các truyện đã đưa lên kho. Bấm Mở sách để tự tải và đọc; lần đầu tự lưu bộ từ điển mặc định, các lần sau không chọn lại file. Lần đầu tải53.5MB nên cần chờ; bài đo hai trình duyệt sạch khoảng9giây, không đảm bảo cùng tốc độ trên Android thật/mạngkhác. Từ điển bạn tự chọn trên thiết bị vẫn được giữ.
Thêm truyện TXT ở đầu Tủ sách; sau xác nhận app tự gửi bản chữ/chương/Name. ⋯ → Xóa xóa khỏi kho và thiết bị này nếu có kết nối; người mở mới không thấy, bản trên máy khác được giữ và đánh dấu kho đã xóa. Ai có URL đều được đọc/thêm/xóa theo lựa chọn của bạn.
Thanh chính chỉ Tủ sách và Cài đặt; chế độ này Cài đặt có Convert/từ điển và Thông tin. Bỏ menu Sao lưu/Kho/Đồng bộ thủ công. File gốc/ảnh EPUB/progress/Name sửa sauupload chưa được lưu đầy đủ ở kho; ẩn menu không có nghĩa cloud đã thay mọi bản sao lưu. Giới hạn32MiB/bản và9GBreservation; xóa hiện chưa giải phóng budget vì chống race.

## 07/10/2026 — Chia chương bắt buộc, Album tùy chọn
Trong Thêm truyện, nhập tên Album nếu muốn gom truyện thành tập hợp; để trống vẫn nhập/đọc bình thường. Cùng tên Album xuất hiện thành một lựa chọn trong Lọc Album tại Tủ sách. Đặt Album lúc nhập một file, nhiều file hoặc folder; mỗi truyện vẫn có bộ chương riêng. Chưa hỗ trợ chuyển/đổi Album truyện đã lưu trên cloud.
TXT/dán/lô tự nhận diện tiêu đề chương, không có nút tắt. Folder xử lý TXT theo thứ tự tên, tách tiêu đề bên trong và chia phần quá dài; giữ file gốc. Xem trước chương rồi xác nhận. Không có tiêu đề nhận diện được thì dùng tên file và chia phần theo giới hạn, không bịa tên. Folder vẫn giới hạn2MiB/TXT và32MiB/folder; TXT lớn nên nhập file riêng. EPUB chưa hỗ trợ. Nhóm lớn >32MiB snapshot vẫn chờ lưu riêng từng chương trên cloud.

## 07/10/2026 — TXT lớn trong folder
Tải lại web để lấy bản mới, chọn folder như trước. TXT lớn hơn2MiB tự thành truyện riêng mang tên file và tự chia chương; các TXT nhỏ vẫn thuộc truyện của folder. Bản xem trước chỉ rõ file nào thành truyện riêng. Album đã chọn áp dụng cho mọi truyện khi xác nhận.
Giới hạn40MiB mỗi TXT riêng,32MiB các TXT thường mỗifolder,256MiB cảlượt; vượt giới hạn/quota báo trước khi nhập. Cloud vẫn giới hạn32MiB bảnchữ của mỗi truyện, không phải giới hạn40MiB củafilegốc. Filegốc giữ trênthiếtbị; EPUB chưa hỗ trợ.

## 08/10/2026 — Quy tắc nhập hiện hành thay cách gộp folder cũ
Mỗi TXT là một truyện; tự tách tiêu đề chương và các phần quá dài. Chọn folder: mỗi folder trực tiếp chứa TXT là một Album, mỗi TXT bên trong thành truyện riêng. Album hiển thị đường dẫn tương đối gồm folder bạn chọn để phân biệt các folder con trùng tên. Không cần điền Album cho folder. Nhập file đơn/lô vẫn được chọn Album tùy ý.
Bản xem trước liệt kê Album và các truyện; xác nhận mới lưu. UTF8/UTF16 có BOM tự nhận riêng từng file, khôngBOM dùng Encoding đã chọn; TXT rỗng/chỉkhoảngtrắng báo lỗi và dọn bản tạm. Limits40MiB/TXT,256MiB/lượt; cloud32MiB/bản chữ giữ. Truyện đã nhập theo cách cũ không tự tách/chuyểnAlbum. Menu⋯mở rộng trongcard đểSửa/Xóa không bịkhuất; đã bỏtopbar/note/footerthừa.

## Reader / Name mới
- Tiêu đề truyện xuống dòng đầy đủ, chữ lớn hơn. Tìm bằng tên gốc hoặc tên Việt đã được chuẩn bị; có thể nhập tiếng Việt không dấu, tên tác giả hay Album.
- Cỡ chữ mặc định mới19, giãn dòng1.65; cài đặt cũ giữ nguyên. Trong ⚙, mục Hiển thị nâng cao chứa màu chi tiết, chiều rộng và căn chữ. Mặc định hiển thị chỉ đặt lại cách đọc, giữ lựa chọn giọng.
- Chạm từ để sửa Name như trước, hoặc ⚙ → ✎ Name → tìm tên/chạm hàng → sửa → Lưu tên. Convert tự cập nhật; không cần Chạy. Trong lúc cập nhật vẫn đọc được nội dung trước đó; sửa từ/TTS chờ bản mới. Nếu lỗi thì giữ nội dung và có Thử lại Convert.
- Nhập/xuất và sửa nhiều dòng được thu gọn trong bảng Name. Xuất bản nháp lấy đúng ô đang soạn. Lưu nhiều tên gộp các key; bỏ một dòng không xóa Name đã lưu. Nút× xóa đúng tên được chọn. File đọc muộn sau khi đóng bảng không được đưa vào nháp mới.
- Name mới/sửa vẫn lưu trên trình duyệt hiện tại. Kho cloud hiện giữ bản snapshot lúc thêm truyện; chưa đồng bộ các Name thay đổi sau đó sang thiết bị khác.


### Xem trước và giới hạn chương (11/10/2026)
Sau khi chọn TXT/batch/folder hoặc dán nội dung, chờ phân tích để xem tổng số chương và ký tự. Mở tên từng file trong “Xem trước chia chương” để xem mục lục; danh sách chỉ hiện 300 chương đầu/file nhưng tổng số đếm đủ. Chọn “Giới hạn số chữ 1 chương” để giữ chương hoặc chia phần 4.000–64.000 ký tự, hay tự nhập 100–128.000. Giữ nguyên chương có trần128.000 ký tự để sao lưu/cloud tương thích; vượt trần sẽ thành phần. Ký tự gồm khoảng trắng/xuống dòng và dùng UTF-16 (emoji thường tính2). AI hiện nhận tối đa32.000/chương, nên chọn32.000 khi cần dịchAI. Mốc trùng không tạo chương riêng nhưng chữ gốc vẫn còn. Chương cũ không tự chia lại: thiết lập chỉ áp dụng lần nhập mới. Regex tùy chỉnh thay hoàn toàn bộ nhận diện mặc định.

## 19/10/2026 — Đồng bộ khi có nhiều truyện

Tải lại trang chỉ kiểm tra dấu phiên bản tại máy. File gốc đã xác nhận và chưa thay đổi không được đọc/tính SHA hay hỏi cloud riêng lần nữa. File mới, phục hồi hoặc thay đổi được xác minh đầy đủ; khi có mạng trở lại app thử tiếp mục chưa hoàn tất. Chỉ hiện tiến độ khi đang gửi dữ liệu và báo lỗi nếu chưa lưu được.

Nguồn cũ cần một lượt xác minh để tạo dấu phiên bản mới. Không cần xóa hay nhập lại truyện. Đây là tối ưu đồng bộ file gốc; danh sách kho vẫn được làm mới, và dung lượng lưu trữ vẫn có giới hạn hiện hành.

## 19/10/2026 — Phòng tối

Các Album nằm trong **Phòng tối**. Cuộn đến cuối nội dung rồi nhấn dòng giới thiệu nhỏ “THU PHONG là trang web cung cấp dịch vụ dịch tự động truyện chữ Trung.” để vào. Bấm Tủ sách để về Thư phòng. Đường dẫn `/phong-toi` mở lại được sau reload. Truyện chưa gán Album vẫn ở Thư phòng, không còn tiêu đề nhóm “Truyện chưa vào Album”.

Giữ tác giả (Album) → series (Album con) → truyện → chương. Không có nút × xóa trên thẻ Album; nút đỏ **Xóa Album và truyện** nằm bên trong Album có thể xóa theo quy tắc hiện hành. Tìm truyện/chương trong Phòng tối tìm cả các nhánh Album. Việc tách phòng chỉ đổi giao diện, không di chuyển hay nhập lại dữ liệu.

## Nhập một TXT tuyển tập thành nhiều truyện

Chọn một TXT trong Thêm truyện, rồi bấm **Tách tuyển tập thành nhiều truyện**. Bộ dò chỉ đề xuất: dòng được đánh dấu bắt đầu truyện mới, những mốc còn lại thuộc truyện trước. Kiểm tra các cảnh báo thiếu/sai số và sửa tên truyện. Nếu định dạng khác, mở Regex mốc truyện để nhận diện tiêu đề riêng.

Bộ dò ưu tiên dòng `书名：Tên`, `作品：Tên`, `文件1: Tên.txt` hoặc `《Tên》 作者：Tác giả` khi có ít nhất hai mốc. Các chương bên trong không tính vào giới hạn2.000 mốc truyện khi đã nhận diện được các dòng tên riêng này. Nếu chưa nhận diện được tên truyện và gặp quá nhiều tiêu đề chương, không nhập/truncate dữ liệu; hộp Regex tự mở để chọn mẫu chính xác hơn. Ví dụ `^文件\s*[0-9０-９]+\s*[:：]\s*.+\.txt\s*$` chỉ dùng nếu các nhãn này thực sự nằm trong TXT, không phải nhãn thêm khi dán. Kiểm tra và bỏ các mốc chỉ thuộc danh sách giới thiệu; không mặc định mọi tên được dò đều là truyện đầy đủ.

Bấm **Tiếp tục xem trước chương**. Chọn Album theo tác giả/Series, kiểm tra mục lục của từng phần rồi **Nhập nhiều truyện**. Tối đa40MiB/file và100truyện; mỗi truyện lưu phần TXT tương ứng, giữ byte/encoding, thứ tự các phần. Tên file/đường dẫn phần tách được làm sạch; toàn bộ nội dung file vẫn được giữ qua các phần, kể cả phần giới thiệu đầu file. Nhập lại tuyển tập tạo lô mới như nhập nhiều file, không tự sửa hay tách lại truyện đã có. Xem ANTHOLOGY-IMPORT-1.md.


## Sửa và xóa chương TXT
Mở thông tin truyện → Quản lý chương. Bấm Sửa để đổi tên/nội dung rồi Lưu hoặc Hủy. Tích chương → Xóa đã chọn → kiểm tra danh sách và xác nhận. Chương bị bỏ khỏi danh sách đọc; mở Đã xóa, tích rồi Khôi phục khi cần. Bấm Xong để ẩn các thao tác. File TXT gốc giữ nguyên. Truyện đã lưu lên kho cần xác nhận đồng bộ trước khi xóa có hiệu lực; khi mất mạng, chương còn nguyên và yêu cầu sẽ được thử lại.
