# Cập nhật TXT từ file đầy đủ

Phạm vi: người dùng chọn một TXT đầy đủ từ trang thông tin truyện; tự lọc phần sau mốc cuối hiện có. Không tự sửa/tái nhập truyện cũ; không đọc/upload D:. Không cập nhật EPUB trong luồng này.

## Bất biến
- Dùng importer/worker/SHA/staging hiện có, tối đa TXT40MiB. Preview và hủy không thay đổi truyện đích. File gốc cũ và mới giữ bytes/SHA riêng.
- Tìm duy nhất một dãy liên tiếp khớp tối đa ba chương cuối (tiêu đề + nội dung chuẩn hóa xuống dòng/trim); không đoán bằng số chương. Không có mốc/khớp nhiều chỗ/file không có chương sau thì từ chối an toàn.
- Commit CAS toàn bộ danh sách chương đã xem trước và staging hợp lệ; chỉ thêm suffix với ID mới. Không đổi ID/revision/nội dung/chỉ số chương cũ, Name, tiến trình đọc/nghe hay cache AI. Giao dịch lỗi/abort rollback cả nguồn, chương, bộ đếm và nhật ký đồng bộ.
- Cloud snapshot giữ immutable. Thêm loại state append gồm các packet giới hạn900KiB và manifest có SHA từng packet, mốc cũ, nguồn mới và tổng số. Packet gửi trước manifest. Máy nhận lưu packet vào settings; chỉ công bố toàn bộ suffix trong một transaction sau khi đủ packet, hash, mốc, baseSHA và ID hợp lệ. Thiếu packet/xung đột không nối nửa chừng và không ghi đè truyện.
- Nguồn mới đồng bộ qua cơ chế original hiện có. Máy nhận chưa có blob phải ghi `dataStatus:missing`, không giả vờ có bytes. Không thêm provider, tài nguyên cloud, migration, paid tier hoặc đổi cloud-delete.
- Append records immutable; hash/chunks đầy đủ, idempotent khi đã có cùng suffix, từ chối hai suffix cạnh tranh cùng mốc. Không dùng chapter-edit để giả append hay tăng revision chương cũ.

## Nghiệm thu
Unit tìm mốc/đối chiếu/suffix; cancellation/atomic native abort/CAS/giữ bytes+progress+AI; schema giới hạn và dữ liệu giả; sync packet trước/thiếu/hash sai/nguồn placeholder/base sai/ID trùng/concurrent append/idempotence/fresh device; E2E chọn fullTXT→preview→apply→reload và cancel. Review độc lập dữ liệu, root full unit/build/E2E liên quan chạy tuần tự. Production smoke bằng dữ liệu tổng hợp cô lập, chặn cloud writes. Không thay truyện người dùng để thử.

Trạng thái 16/10/2026: hoàn tất triển khai và nghiệm thu; xem TXT-APPEND-1.md.
