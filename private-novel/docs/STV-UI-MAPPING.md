# Đối chiếu UI Sáng Tác Việt — 05/10/2026

Nguồn tham khảo chỉ đọc:
- `D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\1chuongngaunhien.devtools`
- `D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\stv.ui.js`
- `D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\main.css`

Không sao chép nguyên HTML/CSS/JS, font, ảnh, truyện hay userscript. `stv-layout.css`, `ReaderTools.tsx`, `Reader.tsx` là triển khai riêng biệt dựa trên các pattern thao tác và tương tác đã quan sát. Tên sản phẩm ứng dụng vẫn là **Thư Phòng**.

---

## Bảng đối chiếu UI controls Reader STV (Mặc định / Mở / Ẩn / Dữ liệu lưu)

| STT | Control / Khu vực | Tham chiếu STV (dòng devtools / stv.ui.js) | Trạng thái mặc định | Trạng thái mở / kích hoạt | Trạng thái ẩn / đóng | Thao tác tương tác (Triggers) | Dữ liệu lưu trữ (Persistence) |
|:---:|---|---|---|---|---|---|---|
| **1** | **Header / Breadcrumb** | `1chuongngaunhien.devtools:368-375` (`#breadcum`, `#booknameholder`, `#bookchapnameholder`) | Hiện tên truyện, tên chương, nút `← Tủ sách` | Giữ nguyên khi cuộn bình thường | Bị ẩn hoàn toàn khi bật **Chỉ đọc** (Unity mode) | Bấm `← Tủ sách` để lưu tiến độ và quay lại thư viện; bấm `Chỉ đọc` để ẩn | Lưu tiến độ đọc vào `db.progress` (`chapterId`, `paragraph`, `offset`) |
| **2** | **Điều hướng chương hai đầu** | `1chuongngaunhien.devtools:376-382` (`navtop`), `960-966` (`navbot`) | Thanh xám nhạt 3 cột: `← Chương trước`, `☷ Mục lục`, `Chương sau →` | Disable `Chương trước` ở chương đầu; Disable `Chương sau` ở chương cuối | Bị ẩn trong chế độ **Chỉ đọc** | Click chuyển chương (tự cuộn lên đầu); click `☷ Mục lục` mở Modal danh sách chương | Tự động lưu `db.progress` khi đổi chương |
| **3** | **Thanh thao tác Reader** | Phục dựng từ `stv.ui.js` và `trans` | Bản Convert và chạm từ luôn bật; có `Name (N)`, `▶ Nghe sách`, `Công cụ ▾` | `Công cụ → Xem bản gốc` đổi sang chữ Trung; mục tương ứng đổi thành `Quay lại bản Convert` | Ẩn khi bật **Chỉ đọc** | Click từ mở popup; click `Name` mở bảng Name riêng; dùng Công cụ để xem raw | State React `mode`; `names` LiveQuery từ `db.names`; không còn toggle `wordEditing` |
| **4** | **Nút nổi bánh răng ⚙ (`#btnshowns`)** | `1chuongngaunhien.devtools:2158` (`#btnshowns`), `stv.ui.js:2593` (`showConfigBox`) | Nút tròn 50×50px nổi góc dưới phải (`bottom: 18px; right: 16px`) | Khi bấm: xoay / highlight, mở bảng `#reader-settings` (`configBox`) | Không bao giờ ẩn (kể cả trong chế độ Chỉ đọc) để người dùng luôn mở lại được cài đặt | Click mở/đóng; phím `Escape` đóng; `aria-expanded` đồng bộ | Không lưu riêng (state popup) |
| **5** | **Bảng Cài đặt hiển thị (`#configBox` / `DisplaySettings`)** | `1chuongngaunhien.devtools:2052-2152` (`#configBox`, `#stylediv`) | Ẩn (`tool === ''`) | Bảng nổi `position: fixed` góc dưới phải (desktop) hoặc full-width đáy (mobile) | Đóng khi bấm `Ẩn ×`, bấm nút ⚙ lần 2, hoặc phím `Escape` | Click nút Ẩn, bấm ngoài, Esc | Lưu vào `db.settings` key `reader` (`ReaderSettings`) qua queue serialization |
| **5a** | **Màu nền (Theme & Swatches)** | `1chuongngaunhien.devtools:2054-2070` (`changebg`, 14 ô swatch A) | Theme Sepia (`#eae4d3`) | Chọn 1 trong 4 theme (Sepia, Sáng, Tối, Xám) hoặc chọn màu tùy ý qua Color picker hoặc 14 ô swatch | - | Click chọn màu, swatch có outline xanh | Thuộc tính `theme` và `background` trong `ReaderSettings` |
| **5b** | **Màu chữ & Bóng chữ** | `1chuongngaunhien.devtools:2071-2090` (`changebgx`, `changetextshadow`) | Chữ mặc định theo theme; bóng chữ tắt | Checkbox bật bóng chữ + color picker bóng; 14 ô swatch màu chữ | - | Click swatch, checkbox thay đổi textShadow | Thuộc tính `textColor` và `textShadow` trong `ReaderSettings` |
| **5c** | **Cỡ chữ & Giãn dòng** | `1chuongngaunhien.devtools:2091-2095` (`increaseFontsize`, `changefs`, `changefs2`) | Cỡ 22px, Giãn dòng 1.8 | Nút `−` / `+` kèm ô nhập số trực tiếp để điều chỉnh nhanh hoặc nhập số chính xác | - | Click `−` giảm 1px/0.1; click `+` tăng 1px/0.1; gõ số trong ô input | Thuộc tính `fontSize` (15–40) và `lineHeight` (1.2–3.0) trong `ReaderSettings` |
| **5d** | **Font chữ** | `1chuongngaunhien.devtools:2096-2108` (`#selfont`) | Font Arial | Dropdown chọn font hệ thống: Arial, Tahoma, Times New Roman, Palatino Linotype, Georgia, Sans hệ thống | - | Chọn select option | Thuộc tính `font` trong `ReaderSettings` |
| **5e** | **Căn lề & Thụt lề** | `1chuongngaunhien.devtools:2109-2116` (`changealign`, `decreasepadding`, `increasepadding`) | Căn trái (`left`), chiều rộng 1000px | 4 nút căn lề: Trái, Giữa, Đều, Phải; nút tăng/giảm lề (hoặc thanh kéo width 500–1200px) | - | Click chọn căn lề | Thuộc tính `align` và `width` trong `ReaderSettings` |
| **5f** | **Footer Cài đặt (`#configBox` footer)** | `1chuongngaunhien.devtools:2153-2156` (Thanh bg-dark có `Nghe sách` và `Name`) | Thanh đáy màu tối có 2 nút: `▶ Nghe sách` và `✎ Name` | Mở trực tiếp panel Nghe hoặc panel Name tương ứng | - | Click mở panel con và đóng Cài đặt hiển thị | Điều khiển view state trong `Reader` |
| **6** | **Chế độ Chỉ đọc (Unity mode)** | `1chuongngaunhien.devtools:2159-2165` (`#btnunitymode`, `#btnnextchapter`, `#btnprevchapter`, `stv.ui.js:2611`) | Tắt (`focusMode === false`) | Bật (`focusMode === true`): ẩn header, nav, actions; hiện nút ‹ (Chương trước nhanh), › (Chương sau nhanh) và nút mắt/⚙ | Ẩn toàn bộ thanh công cụ phân tâm | Bấm nút `Chỉ đọc` trong header, hoặc nút mắt 👁 nổi, hoặc trong panel Cài đặt; thoát bằng phím `Escape` hoặc nút `Hiện thanh công cụ` | State React `focusMode` (và phím tắt Esc toàn cục) |
| **7** | **Bảng Name riêng của truyện (`#namewdf`)** | `1chuongngaunhien.devtools:2002-2050` (`#namewdf`, `#toolbar`) | Ẩn | Bảng mở ở cạnh phải (desktop) hoặc full-screen (mobile); có nút `Lưu lại`, `▶ Chạy`, `Xuất dữ liệu`, ô textarea, nhập file TXT, danh sách Name đã lưu kèm nút × | Đóng khi bấm `Ẩn ×` hoặc bấm nút Name lần nữa (vẫn giữ draft chưa lưu) | Soạn `chữ Trung=tên Việt`; bấm `Lưu lại` (merge vào DB); bấm `▶ Chạy` (lưu + tự chuyển sang Convert); bấm nút × xóa từng entry | `db.names` theo `bookId` (atomic transaction `saveBookNames`); draft giữ trong memory không mất khi đóng |
| **8** | **Popup hv/HV/zw/Tr/tc chỉnh Name** | `qtOnline.js:6500-6520, 6854-7106`; HTML tham khảo `truyen/dich/1/45925/64/index.html:1331-1383` | Convert/chạm từ luôn bật; popup ẩn | Bấm `.word-token` mở popup cyan 256px cạnh từ; có mở rộng trái/phải, hv/HV, chữ Trung, nghĩa, tc, ✓ tạm, đĩa lưu, Quản lý/▶/Thêm name | Esc, bấm ngoài, × hoặc đổi chương đóng popup | ✓ chỉ sửa source range đã chọn; đĩa lưu Name cho truyện; Translate/Tìm kiếm chỉ mở sau xác nhận gửi chữ đã chọn | Sửa tạm: `tempWordEdits` theo chapter/revision/range; lưu truyện: `db.names`; Name chung trong `db.settings` qua hộp Thêm name |
| **9** | **Bảng Nghe sách TTS** | `1chuongngaunhien.devtools` (`speaker.readBook`) | Ẩn | Panel mở bảng chọn giọng (TikTok), tốc độ, cao độ, ngữ cảnh, màu highlight câu, checkbox đồng ý gửi gateway, danh sách câu | Đóng khi bấm `Ẩn ×` (âm thanh vẫn tiếp tục phát nếu chưa bấm Dừng ■) | Click `▶ Nghe TikTok` / `Ⅱ Tạm dừng` / `■ Dừng`; nút nổi ■ xuất hiện khi đang phát | Cài đặt lưu trong `ReaderSettings` (`voiceId`, `ttsRate`, `ttsPitch`, `ttsFlex`, `highlightColor`) |
| **10** | **Mục lục chương (`Modal Toc`)** | `1chuongngaunhien.devtools:379` (`#navcentertop`) | Ẩn | Modal hiển thị danh sách 60 chương mỗi trang, ô tìm kiếm chương theo tên, phân trang Trước / Tiếp | Đóng khi bấm `×`, bấm nền ngoài, hoặc bấm chọn 1 chương | Gõ tìm kiếm lọc danh sách thời gian thực; click chương chuyển ngay | Đọc từ `db.chapters` qua Dexie live query |
| **11** | **Sửa chương & Xuất TXT** | `1chuongngaunhien.devtools` | Trong menu `Công cụ ▾` | Modal mở textarea toàn văn chương, nút "Tách tại con trỏ", "Lưu thay đổi" | Đóng khi bấm `×` hoặc lưu thành công | Sửa văn bản; đặt con trỏ bấm "Tách tại con trỏ" để tách thành 2 chương con | Cập nhật `db.chapters` và `db.books` trong transaction atomic |

---

## Bằng chứng kiểm chứng và phạm vi
- Bảng trên là mapping Reader theo bản mã tải sẵn; không xác nhận toàn bộ STV live hoặc mọi edge case. Bảng Settings hiện không có xử lý bấm ngoài như Modal; nút Ẩn/bánh răng/Escape mới là thao tác đóng đã có trong mã.
- Import/Convert chạy local-first; TTS có adapter gửi nội dung tới gateway khi được đồng ý, chưa nghiệm thu gateway thật.

## Phần 3a — Tủ sách → thông tin truyện → Reader (05/10/2026)

Nguồn chỉ đọc bổ sung: `D:\linh tinh\tm\truyen\Sangtacviet\103.82.20.93\truyen\dich\1\45925\index.html`.
Ảnh bìa/tiêu đề/tác giả tại dòng473/478/480; metadata523–529; nút đọc537 đổi thành Đọc tiếp793–795;
chương gần nhất708–721, mục lục571–592. Home live https://sangtacviet.vip/ đọc được, trang truyện live trả cache miss trong phiên; không xác nhận pixel-perfect.

| Control | Mặc định / thao tác mở | Đóng / điều hướng | Dữ liệu lưu |
|---|---|---|---|
| Bìa hoặc tên truyện tại Tủ sách | Bấm mở trang thông tin, giữ ô tìm truyện | ← Tủ sách quay lại; giữ vị trí cuộn trong phiên | Không ghi DB |
| Mở sách → | Đọc trực tiếp vị trí đã lưu, tương thích luồng cũ | Reader ← Tủ sách | Dùng progress hiện có |
| Thông tin truyện | Tiêu đề, tác giả, số chương/ký tự/ngày; bìa TXT tự dựng | Sidebar hoặc ← Tủ sách | Read transaction; không sửa metadata/TXT |
| Đọc tiếp | Mở chương/đoạn đã lưu; thiếu chương thì chương đầu | Reader ← Thông tin truyện | Reader ghi progress theo cơ chế hiện có |
| Đọc từ đầu / bấm chương | Mở chương cụ thể từ đoạn0 | Reader ← Thông tin truyện | Không xóa tiến độ trước khi mở; Reader cập nhật khi đọc |
| Danh sách chương | Đánh dấu chương gần nhất, tìm tên/số, 60 mục/trang | Trang trước/sau; tìm mới về trang1 | State tạm; không ghi DB |
| Truyện bị xóa / chưa có chương | Báo trạng thái; không cho đọc truyện rỗng | ← Tủ sách luôn có | Không tự tạo/sửa/xóa dữ liệu |

Tìm chương/phân trang là tiện ích local bổ sung, chưa thấy trong HTML trang chi tiết STV. Không phục dựng nút Thích/Theo dõi/Đẩy sách khi chưa có dịch vụ tương ứng. Mã dùng chapter record hiện có rồi chỉ giữ metadata trong danh sách; IndexedDB không có field projection nên vẫn đọc từng record nội bộ. Không migration.
