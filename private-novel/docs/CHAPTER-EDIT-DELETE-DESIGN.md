# Sửa và xóa chương — bản tối giản

21/10/2026. Triển khai cho TXT theo yêu cầu “nhấn vào quản lý chương thì mới hiện nút xóa sửa”, “tối giản lại và bắt đầu sửa”. Bản này thay thiết kế trước đó.

## Giao diện

- Mặc định chỉ có Quản lý chương. Bật quản lý mới có ô tích, Sửa, Xóa đã chọn và Đã xóa. Xong ẩn các thao tác và bỏ lựa chọn.
- Sửa mở tên chương và nội dung, Lưu/Hủy. Giữ snapshot lúc mở để kiểm tra CAS. Lỗi lưu giữ nháp. Khi đang sửa phải Lưu hoặc Hủy trước khi đổi chương, xóa hoặc đóng quản lý.
- Tích chương rồi Xóa đã chọn; một khung xác nhận cho phép Hủy. Đã xóa cho chọn và Khôi phục. Không xóa vĩnh viễn, không có PIN/nhập lại tên.
- Có thể xóa hết chương, giữ truyện và file nguồn; nút đọc bị vô hiệu hóa. EPUB vẫn theo bố cục gốc.

## Hợp đồng dữ liệu / M0 tối giản

Không xóa row chương: Book.hiddenChapterIds quyết định chương hiện trong mục lục, tìm kiếm và Reader. ID, order, text và sourceId của chương bị xóa vẫn được giữ. Khôi phục dùng cùng row; file gốc, SHA, bytes, encoding, đường dẫn và tên file không đổi. readyChapters là toàn bộ row giữ lại để đối chiếu TXT và sao lưu; activeChapters là danh sách đọc.

Sửa tái sử dụng shared chapter patch/CAS hiện có. Tên chương sửa trực tiếp metadata title của row (không đổi dòng đầu nội dung hoặc file nguồn), bỏ displayTitle cũ để tính lại tên Việt; tăng revision khi lưu. Đây là bản tối giản, chưa có metadata overlay riêng hoặc bản so sánh thay đổi. Revision cũ không được dùng lại cho tiến độ/cache.

Shared kind chapter-state có một record/book, key rỗng: {version:1, baseSha256, hiddenIds}. CAS của state bảo vệ các thao tác xóa/khôi phục; không hứa CAS chung giữa record state và record edit. Edit đến từ thiết bị khác vẫn cập nhật row giữ lại; chương ẩn vẫn ẩn. Chương con do split có ID mới là chương mới, không tự kế thừa trạng thái xóa của cha. Hai thứ tự nhận state/edit đều giữ chính sách này.

Truyện đã upload: ghi pending journal trước PUT, chỉ áp dụng local sau ACK hợp lệ. Journal giữ cố định baseRevision và operationId; mất phản hồi thì thử lại, 409 với payload giống hệt là xác nhận idempotent. 409 khác payload không ghi đè; journal cũ hơn revision đã nhận bị bỏ. Truyện chưa upload áp dụng local nguyên tử; state được gửi sau khi có SHA bản gốc. Server kiểm source SHA cả preflight và trong SQL atomic; không có DB migration.

Xóa chương đang đọc chuyển tiến độ sang chương kế tiếp hoặc cuối còn lại, offset 0; hết chương thì bỏ tiến độ. Chặn ghi muộn progress, cursor TTS và cache AI vào chương ẩn. Reader dừng TTS và hủy AI khi nguồn không còn hiện hành. Khôi phục không tự phát âm thanh.

Backup v3 khi có chương ẩn: chứa mọi row và nguồn như trước, tổng manifest là toàn bộ row; restore kiểm membership, remap hidden IDs, tính lại tổng active và kích hoạt nguyên tử. V1/v2 vẫn đọc được; bản cũ từ chối v3. Cloud snapshot v2 lưu mọi row và hidden IDs, tổng book là active; kiểm membership và tổng trước add-only restore. V1 vẫn được hỗ trợ. Không đưa hidden IDs vào metadata book cũ để tránh bị mất âm thầm.

Giới hạn state 10.000 ID; chưa có xóa vĩnh viễn hoặc lịch tự dọn. Kiểm chứng và triển khai xem docs/HANDOFF-LOG.md, .dsh-tmp/chapter-manage/.
