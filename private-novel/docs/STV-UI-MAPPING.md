# Đối chiếu UI Sáng Tác Việt — 05/10/2026

Nguồn tham khảo chỉ đọc: `D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\1chuongngaunhien.devtools`, `stv.ui.js`, `main.css`. Đã xem trang truyện được mở ở `https://sangtacviet.vip/truyen/fanqie/1/7649950255542176830/`; mở chương báo connection refused trong lần quan sát. Phần Reader đối chiếu bản HTML/JS đã tải, không khẳng định pixel-perfect với phiên bản live chưa truy cập được.

Không sao chép nguyên HTML/CSS/JS, font, ảnh, truyện hay userscript. `stv-layout.css` và `ReaderTools.tsx` là triển khai riêng từ pattern đã quan sát. Tên sản phẩm vẫn là Thư Phòng.

| Pattern nguồn | App local hiện tại | Bằng chứng |
|---|---|---|
| Reader có tên truyện/chương và điều hướng hai đầu (HTML khoảng 371–385, 960) | Tiêu đề giữa, trước/mục lục/sau hai đầu | E2E reader + ui-evidence |
| Bánh răng góc dưới, showConfigBox bật/tắt (HTML 2158, JS 2593) | ⚙ mở/ẩn bảng; Esc; aria-expanded; trả focus | stv-ui test |
| Nền/chữ, bảng màu A, font, cỡ/giãn/căn/độ rộng | Các theme, hai bảng màu, color picker, 6 font hệ thống, số/range/căn/bóng chữ | stv-ui persistence + screenshots |
| Name window có Lưu/Chạy/Nhập/Xuất/Ẩn (HTML 2001–2046) | Bảng Name riêng, soạn key=value, merge, nhập vào nháp, xuất nháp, ẩn giữ nháp | book-names unit + stv-ui |
| Nghe sách và Name dưới configBox (HTML 2150+) | Mở bảng Nghe hoặc Name từ Cài đặt | Code + kiểm tra browser |
| Unity đọc tập trung, giữ các nút nổi (JS 2620+) | Chỉ đọc, bánh răng và chuyển chương nhanh; hiện lại/Esc | stv-ui |
| Chỉnh từ/Name khi đọc Convert | Sửa từ bật/tắt; nút token; nghĩa/Hán-Việt/mở rộng/sửa tạm/lưu | stv-ui + language fixtures |
| Provider/queue giọng | Giữ lựa chọn từ baseline; placeholder chưa cấu hình bị disabled; câu đọc có editor | tts-player + stv-ui + reader-race |

Đây là phục dựng các thao tác đọc local, không phải toàn bộ chức năng công khai của trang. Like/follow/comment/publish/dịch vụ nguồn ngoài/Gemini chưa được tích hợp. Cần bổ sung parity test hoặc đối chiếu live khi trang Reader truy cập được nếu người dùng cần mức giống cao hơn.
