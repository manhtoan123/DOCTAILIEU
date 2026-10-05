# Backup hiện chưa đạt an toàn dữ liệu

Audit đã tái hiện các lỗi trong `AUDIT-2026-10-05.md`. Giữ file TXT/từ điển gốc ngoài trình duyệt. Không dùng backup của ứng dụng như bản duy nhất.

- **Compact** mang chương/Names/progress và metadata nguồn, không mang bytes nguồn/từ điển. A2 đã sửa 05/10: Replace giữ nguồn thật hiện có trong cùng transaction; sang máy trắng thì nguồn vẫn thiếu bytes và có thể nhập lại TXT. Không coi Compact là bản sao TXT gốc độc lập.
- **Portable** mang nguồn/từ điển nhưng dồn vào phần đầu. Source từ khoảng 12 MiB hoặc bộ VP lớn có thể tạo phần vượt 16 MiB mà restore không nhận lại được.
- A3 đã sửa: dictionary chỉ commit cùng truyện, có rollback/concurrency tests và review độc lập. Integrity bytes/hash và thứ tự packet vẫn còn lỗi A4/A6.
- Nhận lại packet thiếu là tiếp tục nạp phần backup, chưa phải resume tác vụ restore sau đóng tab.

Trước khi thử backup nhỏ: giữ file gốc, dùng profile thử trắng, khôi phục thành bản sao, kiểm tra chương/Names/progress và bytes nguồn bằng hash. Những bước này là cách thử giới hạn hiện tại, không chứng minh lỗi đã sửa. Sau khi A1–A6 được sửa, cập nhật hướng dẫn và bổ sung quy trình round-trip chính thức trước release.

Nguồn cũ có Blob không rỗng nhưng metadata kích thước/missing không nhất quán được giữ khi Compact Replace; Portable hiện xuất chúng dưới dạng metadata thiếu dữ liệu. Không bảo đảm round-trip bytes của các record này. A4 cần giải quyết integrity/khôi phục metadata trước release. A2 qua unit/fake IndexedDB và review độc lập; multi-tab trình duyệt/Android thật chưa xác minh.
