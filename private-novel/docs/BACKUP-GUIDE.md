# Sao lưu và khôi phục một truyện

Cập nhật 18/10/2026. Đây là gói chuyển một truyện, chưa phải bản sao toàn bộ ứng dụng. Kết quả kiểm của đợt ổn định nằm trong [TTS-BACKUP-STABILITY-1.md](TTS-BACKUP-STABILITY-1.md).

## Nội dung gói

| Dữ liệu | Compact | Portable |
|---|---|---|
| Nội dung chương, thứ tự, tiêu đề Việt đã lưu | Có | Có |
| Name riêng của truyện và Name List Convert đã lưu | Có | Có |
| Vị trí đọc | Có, remap sang ID chương khôi phục | Có, remap sang ID chương khôi phục |
| Tên/metadata file nguồn, tên file Việt | Có | Có |
| Bytes file nguồn | Không | Có nếu máy vẫn có nguồn hợp lệ và được chọn xuất |
| Bytes từ điển | Không | Có nếu được chọn xuất |
| Prompt, cài đặt, bản dịch AI, vị trí nghe TTS | Chưa có | Chưa có |

Ảnh bìa và asset phụ thuộc tham chiếu bên ngoài không được coi là bytes đã đóng gói đầy đủ. Dữ liệu không được gói chứa phải được lưu hoặc đồng bộ bằng luồng tương ứng; không coi Portable là bản sao toàn bộ tài khoản.

“Name chung” bên dưới chỉ trường Name List Convert. Các chỉnh sửa nằm trong từ điển Names đi theo bytes từ điển khi xuất Portable có kèm từ điển; lịch sử đồng bộ và dấu xóa không được đóng gói. Khi nhập, ứng dụng vẫn tôn trọng dấu xóa đang có trên máy đích.

## Xuất và khôi phục

1. Chọn truyện và chế độ. Giữ file nguồn riêng, đặc biệt khi chọn Compact.
2. Tải đủ các phần `.tpbackup.json`, không sửa truyện giữa chừng. Mỗi phần tối đa **16 MiB**. Nếu vượt giới hạn, ứng dụng báo lỗi trước khi trả file đó; dùng Compact và lưu nguồn/từ điển riêng. Portable lớn chưa có cơ chế chia bytes nguồn thành nhiều phần.
3. Trên thiết bị đích, nạp đủ phần rồi xem thông tin trùng truyện, nguồn và từ điển còn thiếu. Thiếu phần hoặc checksum sai thì chưa khôi phục.
4. Chọn giữ cả hai/đổi tên hoặc thay truyện. Với Compact Replace, bytes nguồn còn trên máy được giữ theo luồng đối chiếu hiện hành.
5. Mở truyện, kiểm số chương, tên Việt và vị trí đọc. Với dữ liệu quan trọng, thử khôi phục vào một profile trình duyệt trắng trước khi dựa vào gói để chuyển thiết bị.

## Hợp nhất và kiểm toàn vẹn

- Name chung: chỉ thêm khóa còn thiếu. Giá trị đã chỉnh trên thiết bị đích và các khóa đã chủ động xóa được giữ. Vượt giới hạn Name thì hủy toàn bộ khôi phục, không cắt bớt danh sách.
- Từ điển: giữ loại đã có trên thiết bị. Nếu SHA khác bản gói yêu cầu, phần xem trước báo thiếu đúng bản yêu cầu; không ngầm ghi đè từ điển đang dùng.
- Bytes nguồn/từ điển trong Portable được đối chiếu SHA-256; nguồn còn được đối chiếu kích thước. Sai dữ liệu thì hủy khôi phục trước khi thay bản cũ.
- Các phần phải giữ đúng thứ tự chương. Không tự sắp lại một gói có thứ tự không nhất quán.
- Name chung, từ điển và kích hoạt truyện mới cùng nằm trong transaction cuối. Lỗi tại bước này phải rollback cả việc thay bản cũ.
- Gói cũ không có trường Name chung vẫn đọc được, nhưng không thể khôi phục thông tin chưa từng được xuất.

Vị trí **nghe** TTS được kiểm riêng qua lưu cục bộ/đồng bộ cursor; gói backup hiện chỉ chứa vị trí **đọc**. Khôi phục sang ID truyện mới không được quảng cáo là tiếp tục được đúng giây audio cũ.
