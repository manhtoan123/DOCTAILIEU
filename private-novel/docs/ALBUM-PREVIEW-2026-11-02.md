# Xem trước truyện trong Album — 02/11/2026

## Hành vi

### Bổ sung ba cách xem (02/11/2026)

- **Chi tiết**: bố cục 2 cột desktop, 3 truyện xem trước như bản đầu.
- **Lưới gọn**: 3 cột desktop, 1 truyện xem trước; vẫn mở rộng tối đa 12.
- **Danh sách**: mỗi Album một hàng, tên bên trái và 3 truyện bên phải trên desktop. Mobile xếp dọc, cả ba chế độ đều 1 cột.
- Bộ nút luôn nằm trên mục Album, dùng aria-pressed theo [W3C Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/). Ghi nhớ tại localStorage `album-view`, độc lập cách xem truyện; nếu storage không khả dụng vẫn đổi được trong phiên. Không đổi lựa chọn quản lý hoặc nội dung khi đổi view.
- Build cuối đạt, asset `index-Db17aQu8.js`; `.dsh-tmp/album-three-views-build.log`. Capture 18 trường hợp (3 view × 2 kích thước × 3 theme) không tràn ngang; reload giữ Danh sách; luồng chọn/mở rộng/tìm kiếm mẫu vẫn hoạt động. Log `.dsh-tmp/album-three-views-layout.json`. Script capture ban đầu lỗi tên biến view, đã sửa script; không phải lỗi ứng dụng.
- Pages `4fddeb95`, Worker AI giữ nguyên. Không chạy suite; kiểm tra dùng dữ liệu tổng hợp/API chặn như bản đầu, chưa kiểm Android thật.

- Danh sách Album ở Phòng tối có 2 cột desktop, 1 cột khi màn hình không quá 700px. Mỗi thẻ hiện tên tác giả/Album, tổng truyện và số Album con.
- Hiện trước 3 tên truyện; ưu tiên truyện đang đọc rồi truyện mới theo metadata hiện có. Truyện thuộc Series có nhãn đường dẫn tương đối, không thay đổi cây Album.
- “Đọc tiếp” mở qua luồng openShelf hiện có, giữ tiến độ và chỉ tải truyện cloud khi người dùng mở. Không đọc nội dung chương để vẽ thẻ; chỉ đọc metadata truyện và bảng progress. Chưa hiển thị số chương đang đọc vì progress lưu chapterId, không phải thứ tự chương.
- “Xem thêm” mở tại chỗ tối đa 12 truyện; Album lớn hơn có dòng giải thích và “Mở Album” để xem toàn bộ. Thu gọn trả về 3 truyện.
- Tìm ở ngoài cùng theo tên tác giả/Album hoặc tên truyện gốc/đã chuyển đổi; hiển thị Album chứa kết quả và ưu tiên truyện khớp. Không tìm nội dung/tên chương tại màn hình ngoài cùng. Trong Album giữ thanh tìm hiện có.
- Ô tích Album chỉ hiện khi bật Quản lý; chọn/sửa tên/xóa vẫn dùng luồng đã có. Không thay đổi nguồn, chương, Names, giao thức cloud hoặc thao tác xóa.

## Tham khảo

[W3C APG Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/): dùng button HTML với aria-expanded và aria-controls để mở/thu gọn danh sách, giữ hỗ trợ Enter/Space. Dùng link thật cho truyện và Album, không thêm dependency.

Triển khai Pages theo [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/) và help của Wrangler cài trong dự án; không đổi cấu hình binding hoặc Worker AI.

## Bằng chứng và giới hạn

- Build/typecheck cuối đạt; `.dsh-tmp/album-preview-build-final.log`, asset `index-BDBpO8PW.js`. Lượt build đầu phát hiện union Promise trong liveQuery, đã sửa callback async; log lỗi được giữ.
- Review độc lập đọc phạm vi App.tsx, AlbumShelf.tsx và library.css: không có finding P1/P2 chặn; không chạy suite theo yêu cầu người dùng.
- Capture layout bằng Edge/Playwright với 12 truyện tổng hợp, profile riêng và toàn bộ API bị chặn: desktop 973px/mobile 390px, Trắng/Giấy/Tối, không tràn ngang; 2/1 cột đúng; thêm ảnh selected/expanded/search. `.dsh-tmp/album-preview-layout.json` và `album-preview-*.png`.
- Thông báo kho không khả dụng trong ảnh là do chủ động chặn API của profile mẫu. Không thử sửa/xóa dữ liệu người dùng. Chưa xác minh Android thật hoặc tải truyện thật từ cloud trong đợt này.
- Đã deploy Pages `181accb0`, giữ Worker AI `9f48a8f1`. GET URL chính `/phong-toi` và asset `index-BDBpO8PW.js` đều 200, bundle có `album-preview-card`; `.dsh-tmp/album-preview-release.json`. Rollback Pages trước: `58171512`.
