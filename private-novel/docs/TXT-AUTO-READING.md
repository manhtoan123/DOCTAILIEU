# Tự nhận diện file TXT khi nhập và cập nhật

Mặc định **Tự nhận diện theo file**, áp dụng cho nhập một truyện, nhập nhiều truyện, folder, xem trước, tách tuyển tập và cập nhật chương. Mỗi file trong lô được nhận diện riêng. Lựa chọn thủ công vẫn có khi chữ hiển thị chưa đúng.

Trong hộp thêm truyện, mở **Cách đọc TXT** để đổi encoding, giới hạn hoặc Regex. Không cần mở mục này khi dùng mặc định. **Dán nội dung truyện** là mục riêng; bản nháp dán được giữ khi chuyển sang file rồi bỏ chọn file. Kết quả đếm/xem trước vẫn hiện độc lập với các mục thu gọn.

Trang truyện gom cập nhật TXT thành ba bước: **Chọn file → Kiểm tra chương → Xác nhận thêm**. Encoding, giới hạn và Regex nằm trong **Cách đọc file**. Bản xem trước ghi rõ codec, số chương có thể thêm, số đã chọn và mốc suy luận. Danh sách có vùng cuộn, phân trang và xem nội dung từng chương; nút xác nhận nằm ngay dưới danh sách.

Khung **Đối chiếu mốc nối** luôn hiện chương cuối đang lưu, mốc tương ứng trong file nếu đã xác định và chương đầu tiên thực sự được chọn để thêm. Mở **Xem nội dung chương mốc** để so bản đang lưu với bản trong file. Nhãn phân biệt khớp nội dung, chỉ khớp tiêu đề hoặc chưa xác định mốc; không suy mốc nối từ số chương. File chỉ có chương mới ghi rõ không có mốc cũ trong file. Chương mốc bị khóa trong danh sách và không được thêm lại.

## Cập nhật bằng file đầy đủ

1. Mở trang truyện → **Cập nhật chương từ file TXT**.
2. Giữ **File TXT đầy đủ**, chọn file mới. Để Encoding ở **Tự nhận diện theo file**; không cần chọn theo encoding của file cũ.
3. Bấm **Kiểm tra chương mới**. Web giải mã, chia chương và đối chiếu các chương cuối đang lưu.
4. Xem danh sách từ cuối file, kiểm tra tiêu đề/nội dung và các chương được chọn. Bấm **Thêm các chương mới** để lưu.

Nếu file chỉ chứa phần mới, chọn **File chỉ có chương mới**. Không lấy tổng số chương trong file trừ số chương đang lưu để suy ra mốc nối. Chương trùng đã nhận diện bị khóa; chương cũ, tiến độ và cache không được tự viết lại.

Khi khớp nguyên văn mốc cuối, chương mới hợp lệ được chọn sẵn. Nếu chỉ khớp tiêu đề hoặc chưa đủ bằng chứng, giao diện yêu cầu kiểm tra/chọn thay vì tự thêm. Parser mới có thể tách khác dữ liệu cũ; không tự chia lại truyện đã lưu để ép khớp.

## Cách nhận diện encoding

- BOM xác định UTF-8/UTF-16 LE/BE và được ưu tiên. BOM có phần đuôi hỏng sẽ bị từ chối, không thử codec khác để che lỗi.
- Không có BOM: kiểm tra dấu hiệu byte của UTF-16; còn lại thử UTF-8 rồi GB18030/GBK. Mọi byte và phần đuôi decoder đều được kiểm tra `fatal` theo từng khối, không thay ký tự lỗi bằng `�`.
- Đây là lựa chọn dựa trên dữ liệu, không thể chứng minh mọi chuỗi byte có duy nhất một cách đọc. Có thể chọn thủ công; UTF-16 không BOM chỉ tự chọn khi có dấu hiệu đủ rõ.
- `auto` chỉ là lựa chọn giao diện. Nguồn đã lưu ghi codec thực, raw Blob, kích thước và SHA gốc. Không đổi byte nguồn. Các phần tách từ tuyển tập giữ codec đã nhận diện, kể cả phần sau không còn BOM.

## Tiêu đề dính giữa dòng

Bộ đọc có thể đề xuất thêm ranh giới dạng `第N章Tên chương` khi file đã có ít nhất bốn tiêu đề rõ, có chuỗi số tăng liên tiếp, mốc duy nhất và đủ nội dung xung quanh. Mốc trùng, cụm tham chiếu chương thường gặp, dòng quá dài hoặc ngữ cảnh yếu sẽ không được ép tách. Regex tùy chỉnh bỏ qua phần suy luận này.

Chỉ tách ranh giới; không thêm xuống dòng, xóa chữ hoặc tạo chương bị thiếu. Mọi phần ghép lại giữ nguyên văn bản sau quy tắc chuẩn hóa BOM/CRLF hiện có. Số mốc đề xuất hiện ngay ở bản xem trước; đây là thông tin tạm, không đổi schema hay nguồn đã lưu.

Ranh giới này vẫn là heuristic: câu văn và tiêu đề có thể giống nhau. Kiểm tra bản xem trước trước khi lưu; đối chiếu nội dung/CAS của cập nhật vẫn là nguồn quyết định, không dùng số chương suy luận để ghi đè truyện cũ.

Phạm vi này là TXT truyện. Không thay hợp đồng UTF-8 của JSON/API, từ điển/Name, hoặc cấu trúc EPUB.

## Xem trước và nhập TXT lớn

Phạm vi 10–40 MiB và hàng nghìn chương trên luồng thêm một hoặc nhiều truyện. Giữ Blob gốc và các hàng chương hiện có để tiếp tục dùng chung luồng đọc offline, dịch AI, cập nhật TXT và đồng bộ. Chương quá giới hạn vẫn được chia tự động theo tùy chọn hiện hành. Mỗi file trong lô là một truyện. Công bố cả lô sau khi hoàn tất.

Worker đọc từng lát 256 KiB, báo byte đã xử lý khi kiểm tra encoding, dò mốc chương và chia chương. Xem trước đếm đủ chương và giữ tối đa 300 hàng đầu để hiển thị. Lúc nhập, Worker gửi tối đa 128 chương mỗi lượt và đợi ACK sau khi lưu. Hash tính trực tiếp từ byte nguồn. Khoảng trắng giữa nội dung hợp lệ được giữ cả khi nằm trọn trong một phần chương. Quy tắc dọn quảng cáo và chuẩn hóa xuống dòng của bản đọc vẫn áp dụng riêng với nguồn.

Bộ đếm 30 giây theo dõi thời gian im lặng, không giới hạn tổng thời gian. Khi im lặng, ứng dụng hỏi Worker còn phản hồi không và ngắt nếu sau 10 giây vẫn không trả lời. Worker còn trả lời khi chờ đọc file sẽ được tiếp tục. Lúc chờ ghi IndexedDB, ứng dụng đợi ACK theo luồng riêng. Hủy dừng Worker, bỏ chờ kiểm tra dung lượng hoặc chuyển tên nếu đang chờ, đợi lượt ghi đã bắt đầu và xóa đúng dữ liệu staging của lần nhập. Xem trước chỉ đọc.

Thanh tiến độ phân biệt các giai đoạn và tính lô theo kích thước file. ETA xuất hiện sau khi đo được tốc độ xử lý, dùng trung bình làm mượt và làm tròn. Nếu browser hoặc ổ đĩa chậm, thời gian thực tế thay đổi theo thiết bị. Kết thúc lưu mới công bố sách.

Tham khảo [TextFile của Legado](https://github.com/LegadoTeam/legado/blob/master/app/src/main/java/io/legado/app/model/localBook/TextFile.kt) về đọc TXT theo khối và so sánh mô hình chỉ mục byte. Tái sử dụng luồng đọc theo lát của app để tránh đổi cấu trúc lưu chương hoặc các hợp đồng đồng bộ.

Kiểm tra với TXT tổng hợp đúng 40 MiB có 3.200 chương và một TXT nhỏ trong cùng lô. Xem trước 5,4 giây trên Edge Windows và không ghi IndexedDB. Nhập khoảng 8,3 giây, SHA-256 của Blob và nội dung chương nối đúng thứ tự khớp mẫu. Hủy khi có lượt ghi chương và đang chờ ACK đã dọn sạch staging, giữ nguyên cả hai truyện trước đó. Kiểm thử đồng hồ giả cho phép xử lý qua 30 giây, giữ Worker còn phản hồi và ngắt Worker không phản hồi. Log `.dsh-tmp/large-txt/`. Chưa kiểm tra file thật, Android thật hay thời gian đồng bộ lên cloud.

Vitest phạm vi 73/73, build đạt, review độc lập đã kiểm lại bản sửa hủy và giữ khoảng trắng. Lượt toàn bộ 2.786 đạt, 43 lỗi, 7 bỏ qua. Các bộ kiểm tra nhập TXT liên quan đều đạt trong lượt này. Các lỗi ngoài phạm vi chưa được đối chiếu baseline. Pages `2065e41a` đã triển khai và xác minh HTML, JS, CSS cùng Worker nhập bằng SHA-256 trên địa chỉ chính. Rollback `2b1ef6e8`.
