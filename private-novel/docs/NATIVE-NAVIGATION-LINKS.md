# Liên kết Album, truyện và chương — 29/10/2026

## Hành vi

Các vị trí chuyển trang dùng `<a href>`: Album/Series và đường dẫn Album, bìa/tên truyện ở Lưới/Danh sách/Thu gọn, Mở sách, kết quả tìm chương, Đọc tiếp/Đọc từ đầu, danh sách chương tại thông tin truyện, mục lục Reader, chương trước/sau, trở về và mở thông tin truyện.

Chuột phải có menu liên kết gốc của trình duyệt; Ctrl/Meta/Shift/Alt+click và chuột giữa giữ hành vi mặc định. Bấm trái bình thường gọi callback SPA hiện có, giữ save/stopReading/chuyển chương. Không ép mọi lần bấm mở tab mới. Các nút mở hộp thoại, tìm/lọc/phân trang/sửa/xóa vẫn là nút thao tác. Liên kết bị khóa không có href và không nằm trong thứ tự Tab; không có chương trước/sau thì giữ nút disabled.

Album dùng `/phong-toi?album=<đường dẫn đã encode>`; nhánh tác giả/Series được khôi phục khi mở tab mới, tải lại và Back/Forward. Đây chỉ là trạng thái điều hướng, không đổi định danh Album, phân cấp, ID truyện/chương, dữ liệu đã lưu hay chính sách tải cloud. Liên kết đọc dùng router hiện hành; URL cũ/short/numeric vẫn được giải quyết như trước.

Khi mở trực tiếp một route đọc mà app còn phải tra mã truyện hoặc tải truyện từ kho chung, hiển thị trạng thái “Đang mở chương…” thay cho Tủ sách trong lúc chờ. Trạng thái ban đầu được suy ra từ URL để tránh chớp Tủ sách trước khi effect xử lý route chạy; lỗi tải vẫn hiện thông báo như trước.

## Nguồn và cách áp dụng

Tham khảo mã nguồn chính chủ [React Router shouldProcessLinkClick](https://github.com/remix-run/react-router/blob/main/packages/react-router/lib/dom/dom.ts): giữ anchor/href, chỉ chặn click trái không modifier và target hiện tại. Áp dụng bằng NavigationLink nhỏ dùng callback/router sẵn có; không thêm React Router hoặc dependency. Nguồn là ý tưởng thiết kế, không thay thế kiểm chạy.

Với trạng thái chờ mở route, đã thử truy cập repository GitHub của app nhưng không đọc được (404/không công khai trong phiên). Giữ nguyên cơ chế nạp route hiện có; chỉ thay phần UI được render khi route đọc đang chờ, không thêm router hay dependency.

## Kiểm chứng

- `tests/reader-route.test.ts`:33/33, gồm Album có nhánh con và ký tự query đặc biệt, tương thích route cũ.
- Build CapCut-v2/stamp `native-links-2026-10-29` đạt. Logic không đổi AI Worker/TTS/provider hoặc persistence.
- E2E trên bản build, Edge desktop và Pixel7 mô phỏng: nhóm26 ca có22 đạt;4 lỗi kỳ vọng test (title nằm ở header, disabled anchor không có role link) đã sửa test-only và chạy lại4/4 đạt. Gồm tạo Album con, tải lại, import đúng nhánh, sửa thông tin, tìm/phân trang/đọc tiếp và focus Đến chương đang đọc.
- Ca mới kiểm chuột giữa mở Album, Ctrl+click mở đúng chương, trang gốc giữ URL; contextmenu không bị chặn/không tự đổi tiến độ, mở link trong tab khác, prev/next và mục lục, thiếu chương kế là nút disabled. API/IDB tổng hợp cô lập cloud thật.
- Review Sol Medium độc lập: đã sửa selector Đến chương đang đọc từ button sang anchor; kiểm lại header/backhref, disabled link và CSS cuối không còn finding. Màu bìa không ảnh và Đọc tiếp/Đọc từ đầu/back/TOC giữ tương phản theo theme, padding/focus/vùng bấm.
- Giới hạn: Android mới mô phỏng; không tự động bấm menu ngữ cảnh cấp hệ điều hành. Native href/contextmenu, chuột giữa và Ctrl+click được kiểm ở ranh giới trình duyệt. Không lấy dữ liệu truyện người dùng làm fixture, không thử ghi cloud thật.
- Logs/ảnh: `.dsh-tmp/library-links/` (unit, build2, chapters-e2e, chapters-final, final-render và bản kiểm giao diện cuối). Lỗi TEMP/esbuild và Vite dev bị treo được tách khỏi assertion bằng thư mục TEMP riêng và built-preview; không sửa dependency/timeout để che lỗi.

## Triển khai

Bản đầu chỉ thẻ truyện/Album: Pages77d149e3. Bản đầy đủ đã deploy **Pagesda81181f / index-BptqCclG.js**; root/Album/book/read HTTP200 đúng asset. AI Worker93f96ede không đổi; rollback Pages77d149e3. Không migration/commit/push.
- Kiểm giao diện cuối:6/6 ca (native Album/chương/locate focus), rồi4/4 ca sau bổ sung padding/contrast cho anchor trên3màu desktop/mobile. Build cuối `presentation-build.log`, `release-render.log`, ảnh `release-render-results/`; deploy `complete-deploy.log`, xác nhận alias `online-smoke.log`. Production E2E **4/4 đạt (16,8s)** trên đúng bundle đã deploy, ba màu desktop/Pixel7 mô phỏng, API/IDB tổng hợp riêng; không ghi cloud thật. Log `production.log` và ảnh `production-results/`.
