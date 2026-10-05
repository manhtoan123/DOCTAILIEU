# Sử dụng Thư Phòng local alpha

Chạy trong thư mục `private-novel/`: `npm.cmd run dev`, mở `http://127.0.0.1:5173/`. Đây là development trên máy hiện tại; chưa phải web private đã triển khai.

## Thêm và đọc truyện

1. **Thêm truyện TXT**: chọn một file hoặc dán nội dung; chọn encoding/Regex nếu cần.
2. **Tách chương & xem trước**: kiểm tra các phần. Heading trong TXT tạo mục lục; nội dung chưa vào thư viện cho đến khi xác nhận.
3. **Xác nhận vào thư viện**: mở Reader. Mỗi file là một truyện; nguồn gốc ở ổ D: không bị chỉnh sửa.
4. **Chương trước / Mục lục / Chương sau**: ở hai đầu trang. Trong mục lục có ô tìm tên và phân trang.
5. **Công cụ**: Sửa chương, tách tại con trỏ, xuất chương TXT, hướng dẫn thao tác. Chưa có màn hình CRUD chương đầy đủ.

## Bật, ẩn và nhớ cài đặt

| Nút | Bật/mở | Ẩn/tắt | Ghi nhớ |
|---|---|---|---|
| ⚙ | Mở Cài đặt hiển thị | Bấm lại, Ẩn hoặc Esc | Màu/font/cỡ/giãn dòng/chiều rộng/căn chữ lưu trên thiết bị |
| Chỉ đọc | Ẩn header/thanh thao tác | ⚙ → Hiện thanh công cụ, hoặc Esc khi không có bảng khác | Chế độ theo phiên |
| Name | Mở bảng Name bên phải | Ẩn hoặc bấm Name lại | Bản nháp giữ khi ẩn trong cùng Reader; bấm Lưu mới lưu DB |
| Nghe sách | Mở bảng giọng/tốc độ/câu | Ẩn bảng; **âm thanh vẫn tiếp tục** | Nút ■ hoặc ■ nổi mới dừng |
| Sửa từ | Bật sau khi chọn Convert | Bấm lại để tắt | Theo phiên Reader |

Mặc định có nền Sepia/Sáng/Tối/Xám. Bảng màu và color picker cho đổi nền/chữ riêng; chọn một theme xóa màu tùy chọn để theme có hiệu lực. Font dùng font hệ thống có sẵn; không tải font từ nguồn tham khảo.

## Convert và Name

Nạp các từ điển TXT của bạn trong tab **Từ điển**, rồi chọn **Convert** trong Reader. Xử lý trong Worker trên máy. Khi bật **Sửa từ**, chạm một từ để xem chữ gốc, Hán-Việt và nghĩa; mở rộng trái/phải nếu cần cụm dài hơn. **Sửa tạm** áp dụng trong phiên; **Lưu Name cho truyện** áp dụng cho truyện hiện tại.

Bảng **Name** nhận từng dòng `张三=Trương Tam`. **Lưu lại** cập nhật key trùng và thêm key mới. **Chạy** lưu rồi chuyển sang Convert. Xóa dòng trong ô soạn không xóa Name đã lưu; dùng × bên cạnh tên trong danh sách. **Nhập dữ liệu Name** đưa file vào bản nháp để xem trước, chưa tự lưu. **Xuất dữ liệu** xuất bản nháp hiện trong ô. Trong lúc lưu, các ô nhập bị khóa ngắn để bảo toàn bản nháp.

## Nghe sách

Mở bảng **Nghe sách**, bật đồng ý gửi câu đang đọc đến gateway rồi bấm Nghe TikTok. Gateway phải được cấu hình và trả audio thật. Endpoint mặc định hiện chưa được triển khai, vì vậy app sẽ báo lỗi gateway; UI không đồng nghĩa đã có giọng hoạt động.

- Giọng Bing/Google ghi “chưa cấu hình” đang disabled. Các giọng TikTok selectable là khả năng adapter, chưa phải bảo đảm gateway đang online.
- Tốc độ/cao độ/ngữ cảnh/màu highlight là cài đặt; cao độ và ngữ cảnh phụ thuộc hỗ trợ từ gateway.
- **Câu** mở trình sửa văn bản nghe của chương hiện tại. Áp dụng chỉ trong phiên, không sửa TXT/chapter đã lưu. Highlight tắt khi dùng nội dung nghe khác bản đọc để tránh tô nhầm.
- Ẩn bảng không dừng; ■ dừng và hủy tự chuyển chương đang chờ. Bỏ **Qua chương** ngăn tự phát chương kế.

## Dữ liệu và giới hạn

Truyện/từ điển nằm trong IndexedDB theo origin/profile trên mỗi thiết bị. Đổi trình duyệt, đổi origin hoặc xóa dữ liệu web không tự chuyển nội dung. Chưa có sync cloud/Gemini. Backup/restore có lỗi dữ liệu đã tái hiện; đọc BACKUP-GUIDE.md trước khi dùng, đặc biệt tránh Compact + Replace.
