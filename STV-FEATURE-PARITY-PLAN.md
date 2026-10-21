# Ưu tiên phục chế UI và hành vi Sáng Tác Việt

> **Kế hoạch tham chiếu ngày 05/10/2026.** Thứ tự ưu tiên và quy trình bên dưới không thay thế [AGENTS hiện hành](AGENTS.md) hoặc [HANDOFF](HANDOFF.md). Tra cứu triển khai mới tại [chỉ mục tài liệu](private-novel/docs/README.md).

Yêu cầu hiện hành 05/10/2026: ưu tiên UI/tính năng như sangtacviet.vip; Convert đối chiếu vietphrase.zxc.io.vn; sửa từ lưu cố định. Hoàn thành từng luồng, rồi hỏi người dùng về hướng mở rộng. Không dùng số test hoặc giao diện gần giống để tự tuyên bố clone100%.

| Thứ tự | Phần | Hành vi/UI cần đối chiếu và làm | Tiêu chí kiểm chứng |
|---|---|---|---|
| 0 — đang làm | Convert và sửa từ cố định | Cùng chữ Trung/cùng bộ dictionary; thứ tự Name/rule/VP; dấu câu, nhiều nghĩa; bấm từ, tra HV, chọn nghĩa, mở rộng trái/phải; Thêm Name/Lưu Name List giữ qua reload | Fixture có đáp án; đối chiếu live/reference; lỗi ghi không mất dữ liệu; reload/cross-tab; rawUTF16 Unicode |
| 1 | Reader chính STV | Vị trí/cỡ nút, header/chương trước–sau, mục lục, tiến độ; nền/font/cỡ chữ/giãn dòng; nút bật/tắt thanh công cụ; cuộn và chế độ ẩn UI | Ảnh đối chiếu cùng viewport + bảng từng nút mở/đóng; Escape/bấm ngoài/back; nhớ vị trí qua reload; không nhảy chương khi kết quả cũ về |
| 2 | Sửa từ ngay trong Reader | Bật chế độ sửa từ, chọn từ/cụm, tra và mở rộng, chỉnh viết hoa; lưu cố định/global hoặc theo truyện có nhãn rõ; Name List import/export | Không sửa sai đoạn khi chọn nhanh/chuyển chương; không tách surrogate pair; lưu rồi mở lại truyện; Nameglobal/per-book không ghi đè sai phạm vi |
| 3 | Tủ sách và trang truyện | UI danh sách, tìm/lọc, mở truyện, thông tin, đọc tiếp; thêm/sửa/xóa truyện local; giữ nhịp điều hướng giống trang tham khảo | Thao tác từ thư viện→truyện→Reader→quay lại trên desktop/mobile; confirm xóa đúng truyện; thao tác sửa không mất TXT |
| 4 | Mục lục/chương và nhập TXT | Mục lục tìm/lọc/phân trang, nhảy chương, đánh dấu chương đang đọc; nhập/dán TXT, regex preview, thêm/sửa chương | Mẫu TXT Trung/Việt, Unicode/CRLF và chương dài; preview trước ghi; không mất ký tự hoặc chọn sai chapter |
| 5 | Cài đặt và trạng thái hiển thị | Panel STV: màu/font/cỡ/lineheight/width/căn lề; hiển thị/ẩn/khôi phục; theme sáng/tối/sepia; nhớ cài đặt | Screenshot từng trạng thái; keyboard/touch; request/settings cũ không đè chỉnh mới; Android thật |
| 6 | Sao lưu và dữ liệu | Giữ truyện/chương/Name cố định; xuất NameList riêng hiện tại; xử lý backup lớn, checksum/conflict/Unicode còn mở | Round-trip bộ thật + file thiếu/hỏng/cancel; review độc lập trước nghiệm thu; không tuyên bố backup Nameglobal khi packet chưa chứa |
| 7 — sau R0 | Nghe truyện | UI player/giọng/tốc độ/highlight/tự qua chương tương ứng STV | Gateway được phép, audio thật và Android thật; chưa có gateway thì không gọi proxy người khác |
| 8 — sau local ổn | Private online | Auth server + hosting miễn phí, mobile HTTPS; PIN local không thay auth thật | Runtime/đăng nhập/đăng xuất/URL private được kiểm; chưa deploy thì ghi rõ |

## Quy trình cho từng phần
Trạng thái 05/10/2026: phần3a đã có trang thông tin local, đọc tiếp/từ đầu/chọn chương và quay lại; tiến độ khi quay lại sớm đã có regression độc lập. Phần3 còn sửa/xóa an toàn và đối chiếu bố cục thư viện; chưa đánh dấu hoàn tất toàn phần. Phần1–2 có kiểm thử controls/Unicode, vẫn cần kiểm race khi đổi chương/đóng cửa sổ sửa từ và lỗi lưu Name. Các gate M0/backup/Android không được thay bằng UI.

1. Chụp/ghi UI tham khảo và mã D chỉ đọc; lập bảng từng control: mặc định, bật, ẩn, thao tác, dữ liệu lưu.
2. Tái hiện bằng fixture tự tạo, chốt invariant và test thất bại trước sửa lỗi dữ liệu/race.
3. Sửa phạm vi nhỏ, tách file giữa agents; không can thiệp phần khác đang có AI sửa.
4. Root kiểm diff, unit/build/E2E; reviewer độc lập chạy targetedtests cho lưu dữ liệu/auth/backup.
5. Ghi HANDOFF/log/DECISIONS, nói phần nào tương đương đã kiểm và phần nào chưa xác minh.

Không kéo Gemini/cloudsync/TikTok vào các phần0–5. Mô phỏng viewport điện thoại không được gọi là kiểm Android thật. Dữ liệu/truyện/mã tham khảo D không đưa mạng/Git.

Hiện UI Convert đã được sửa theo bố cục nguồn–Name List–kết quả; chưa phải clone Reader/STV100%. Quyền auth/wrangler đang có thay đổi ngoài đợt Convert phải giữ nguyên, tìm tác giả/log trước nhận sửa.
