# Name dùng chung theo Album tác giả — 24/10/2026

Người dùng chọn Album tác giả ngoài cùng, gồm mọi series. Màn hình chọn một Album thay vì từng truyện; tìm Name, sửa một tên, nhập nhiều dòng thu gọn và phân trang. Truyện ngoài Album giữ kho riêng.

Kho mới lưu từng khóa `album-name` trong settings, đồng bộ bằng CAS/tombstone hiện có, không thêm DB hay hạ tầng. Khóa chứa cặp JSON chuẩn [Album gốc, chữ nguồn], kiểm tra độc lập trên client/server. Album tính đúng theo cây hiện hành; chuyển truyện sang Album khác dùng kho đích. Đổi tên Album tác giả mang cả cây series và kho Name/tombstone sang tên mới trong cùng transaction; chặn đích đã có dữ liệu để tránh gộp nhầm. Chuyển riêng truyện/series sang tác giả khác dùng kho đích.

Giữ nguyên tất cả Name cũ: tên không xung đột được đọc chung giữa các truyện cùng Album; tên cũ trùng chữ nhưng khác nghĩa giữ nghĩa riêng theo truyện và báo số xung đột. Lưu tên ở kho Album là lựa chọn rõ ràng áp dụng cho tất cả truyện, ưu tiên hơn dữ liệu cũ. Xóa ở kho dùng tombstone che cả fallback, không xóa Name cũ. Không dịch lại hay sửa bản AI đã lưu.

Reader, Convert, AI và tên hiển thị dùng resolver chung. Sao lưu mang nghĩa hiệu lực và trường albumNames tùy chọn (cả tombstone); kiểm cùng gốc Album, duy nhất khóa và thêm thiếu trong transaction kích hoạt, không ghi đè nghĩa/tombstone hiện hành. Cloud snapshot mang nghĩa hiệu lực tương thích bản cũ; kho Album đồng bộ riêng qua shared state. Không đổi nguồn/ID/chương/progress; không chạy chuyển đổi dữ liệu người dùng.

Nghiệm thu: targeted schema/store/rollback/legacy conflict/scope; request-response shared-state; reviewer độc lập; full unit, build và E2E settings/Reader/đồng bộ phù hợp. Dữ liệu thử tổng hợp, không ghi Name thật để smoke.

## Bằng chứng kiểm tra

- Reviewer độc lập gpt-6.1-sol/high: 12/12; bảo toàn bytes/SHA/chương/progress, scope, CAS, rollback, đổi tên, backup.
- Targeted root: 79/79, gồm production HTTP handler + SQLite (200/400/409, tombstone).
- E2E: 40/40 + 2/2 bổ sung cho AI shared pool (42 ca), desktop + Android-layout; solo/Album/series/Convert/AI giữ bản dịch/nháp/lỗi lưu/320px.
- Typecheck pass. Build từng fail quyền thư mục TEMP hệ thống (giữ log); chạy TEMP/TMP riêng đã pass.
- Full root lần đầu: 175 file/2167 ca pass, một ca giả lập rollback cũ chưa chặn API update (thay vì put). Giữ album-names-full.log. Reviewer sửa injection cho cả put/update, kiểm hai thành viên + toàn settings/registry/Name/tomb rollback; hai file targeted20/20 pass (album-registry-independent-review.log). Không đổi production và không lặp lại toàn bộ suite; đây không phải một lần full mới xanh hoàn toàn.
- Build release pass: index-Dr67jMWw.js (album-names-build-release.log). Đã sửa type fixture optional ID trong test bằng guard tường minh, giữ log fail riêng.
- Wrangler local Pages/workerd + D1 cô lập: HTTP200/409/200/200/400 pass, CAS/tomb/schema đúng; runtime-report.json/runtime-server.log. Không ghi remote hay dữ liệu truyện.
- Pages a74180c0 deploy thành công, bundle index-Dr67jMWw.js; rollback b07246d0. Smoke production2/2 desktop/mobile: Album/series, save/reload, Convert truyện cùng Album, legacy giữ nguyên, 320px không tràn; zero AI/zero actual cloud writes (mọi API bị chặn trong browser context mới). album-names-production.log và album-names/production-report.json. Không thay Worker AI/Convert, config, schema D1 remote hoặc tier.
- Giới hạn: Android-layout là mô phỏng; AI E2E dùng phản hồi tổng hợp, không kiểm chất lượng upstream/key thật. Legacy fallback chỉ quan sát truyện đã có local; Name mới là record Album đồng bộ riêng.

## Name có nghĩa rỗng — 10/11/2026

Trong hộp thoại **Thêm name/Chỉnh name** của bản Convert, xóa nội dung ô Hán Việt rồi bấm **Thêm Hán Việt** như bình thường. Ví dụ `$的=` lưu một mục Name có nghĩa rỗng ở phạm vi đã chọn (Album tác giả, riêng truyện hoặc Name chung). Convert giữ vị trí token nguồn và bỏ phần hiển thị của cụm khớp. Bản gốc và bản dịch AI đã lưu giữ nguyên; prompt dịch không gửi nhãn rỗng. Trong kho Name có thể nhập nghĩa mới hoặc xóa mục để bỏ quy tắc.

Đối chiếu [OpenCC](https://github.com/BYVoid/OpenCC/blob/master/README.md): dùng ý tưởng ghi đè theo từ điển; ở đây chuỗi rỗng là một giá trị ghi đè có chủ ý, còn `null` vẫn dành cho lệnh xóa đồng bộ. Không thay định dạng từ điển mặc định hay thêm dependency.

Kiểm chứng: 67 ca engine/kho/Worker, 19 ca compact cloud snapshot và Album HTTP, 14 ca reviewer độc lập đều qua; build qua. Smoke bản build bằng Edge desktop và cấu hình Pixel 7: lưu, ẩn, tải lại, kiểm Bản gốc đều qua trên dữ liệu tổng hợp; lượt Playwright dùng Vite dev bị timeout khi tải trang. Chưa kiểm Android thật hoặc ghi cloud thật.

Đã deploy Pages `7d654427` và Worker Convert `4d446a93`. Bundle production `index-Cxd09fhi.js` khớp SHA bản build; smoke production 2/2 trên Edge desktop và Pixel 7 mô phỏng, chặn API và dùng dữ liệu mẫu. Không thay schema hay ghi dữ liệu cloud. Client cũ từ chối giá trị rỗng; cần tải lại trang và lưu ý khi rollback sau khi kho đã có mục rỗng.

Full trước sửa cuối: 2.789 pass / 46 fail / 7 skip. Ca Reader từ chối chỉ khoảng trắng đã được giữ lại và kiểm lại 36/36 ca Reader; không chạy lại toàn bộ suite. Log: `.dsh-tmp/name-empty/`.
