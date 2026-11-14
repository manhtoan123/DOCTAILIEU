# Dung thứ lỗi cú pháp & Làm sạch sâu EPUB HTML — 12/11/2026

## Hành vi đã làm
- **Tự chuẩn hóa dấu `&` trần**: Trong `epubXml()`, tự động thay thế các dấu `&` không thuộc cấu trúc entity hợp lệ (như `Tom & Jerry`, link web `?a=1&b=2`) thành `&amp;` trước khi parse XML.
- **Mở rộng thực thể HTML phổ biến**: Hỗ trợ thêm các entity thường gặp trong truyện và tài liệu web (`trade`, `euro`, `cent`, `pound`, `yen`, `sect`, `deg`, `plusmn`, `times`, `divide`, `hearts`, `clubs`, `spades`, `diams`, `star`...) và đối chiếu không phân biệt hoa thường (`&NBSP;` → `&#160;`).
- **Cơ chế fallback HTML5 tolerant parsing cho chương sách**:
  - Khi phân tích XML nghiêm ngặt (`application/xml`) gặp lỗi cú pháp (thẻ void `<br>`, `<img>`, `<hr>` chưa đóng, thẻ lồng sai thứ tự, v.v.), hàm `epubDoc()` tự động rơi về parser `text/html` chuẩn của trình duyệt.
  - Thuật toán HTML5 Tree Construction tự sửa chữa các thẻ chưa đóng và cấu trúc lồng, tạo cây DOM cô lập (*inert*).
- **Làm sạch sâu cây DOM HTML (Deep HTML Cleaning & Flattening - Phương án 1)**:
  - **Unwrapping vỏ bọc rác**: Tự động bóc toàn bộ các thẻ vỏ bọc thừa `<span>`, `<font>`, `<div>` không mang thuộc tính ngữ nghĩa hoặc kiểu dáng (`el.replaceWith(...el.childNodes)`).
  - **Lọc Style Inline**: Giữ lại các kiểu dáng trực quan văn bản cốt lõi (`color`, `background-color`, `background-image`, `font-weight`, `font-style`, `text-decoration`, `text-align`), loại bỏ các thuộc tính layout thừa làm phình file.
  - **Xóa thẻ rỗng**: Tự động dọn sạch các thẻ `<p></p>`, `<span> </span>` rỗng không chứa chữ hay đa phương tiện.
  - **Chuẩn hóa Text Nodes với `Node.normalize()`**: Tự động gộp các mẩu chữ vụn liền kề nhau thành 1 text node duy nhất cho mỗi đoạn văn, triệt tiêu tình trạng một chương bị băm thành hàng chục ngàn text nodes rác.
  - **Dỡ bỏ giới hạn `nodes.length > 10000`**: Loại bỏ giới hạn cứng 10.000 nodes, chỉ giữ duy nhất giới hạn an toàn 1 chương: `nodes.join('\n').length <= 128.000 ký tự`.
  - **Nới rộng trần kích thước tệp**: Nâng trần XML thô từ 1 MiB lên 16 MiB và CSS lên 2 MiB (100 stylesheet) để chấp nhận các chương sách phong phú.
- **Bảo toàn bất biến an toàn**:
  - Giữ 100% hình ảnh (`<img>` / `data-epub-src`) và màu sắc văn bản (`style="color:..."`).
  - Luôn kiểm tra chặn `<!ENTITY` và `<!DOCTYPE ... [` để triệt tiêu nguy cơ XXE và tấn công Billion Laughs.
  - Giữ nguyên byte gốc và SHA-256 của file EPUB trong IndexedDB `sources`.

## Nguồn tham khảo mã mở
- [Mozilla Readability](https://github.com/mozilla/readability): Ý tưởng unwrap thẻ vỏ bọc (`unwrap`) và loại bỏ phần tử rỗng (`_cleanConditionally`).
- [Calibre E-book Editor](https://github.com/kovidgoyal/calibre): Kỹ thuật dọn dẹp HTML (`clean_html`), lọc style information và gỡ bỏ tag không cần thiết.
- [foliate-js](https://github.com/johnfactotum/foliate-js) (`epub.js`): Giải pháp xử lý tài liệu EPUB linh hoạt giữa `application/xhtml+xml` và `text/html`, kết hợp `Node.normalize()`.
- [HTML5 Specification — Tree Construction](https://html.spec.whatwg.org/multipage/parsing.html#tree-construction): Cơ chế phân tích tài liệu lỗi cú pháp thành DOM cây hoàn chỉnh không gây lỗi sập.

## Bằng chứng kiểm tra
- **Unit & DOM Security Review**: `tests/epub-dom-security-review.test.ts` đạt 5/5 pass (gồm cả kiểm tra chống XXE, bóc tách DOM cô lập, ca kiểm thử HTML lỗi cú pháp, và ca kiểm thử làm sạch sâu HTML unwrap span + normalize + giữ màu + giữ ảnh).
- **EPUB Regression Suite**:
  - `tests/epub-reader-3-independent-review.test.ts`: 8/8 pass.
  - `tests/batch-import-epub.test.ts`: 1/1 pass.
  - `tests/epub-stream-import.test.ts`: 8/8 pass.
  - `tests/epub-persistence-review.test.ts`: 40/40 pass.
- **Build Production**: `tsc -b && tsc -p tsconfig.server.json && vite build` đạt (exit 0), tạo bundle `dist/assets/index-CgZbP9C-.js`.
- **Deploy Cloudflare Pages**:
  - Deployment ID: `48cc2b0c` (URL: `https://48cc2b0c.thu-phong-private.pages.dev`).
  - Canonical URL: `https://thu-phong-private.pages.dev/`.
- **Smoke Production Online**:
  - `smoke_pixiv_production.mjs`: Pass 100% với file EPUB thực tế từ Pixiv Novel của người dùng (`【代投】想艾草了怎么办？请帮帮我触手大人！_28785927.epub`).
  - `smoke_deep_clean_production.mjs`: Pass 100% với file EPUB tổng hợp có hàng trăm đoạn lồng span rác, rỗng, class rác; nhập thành công và mở Reader hiển thị đầy đủ, không phát sinh lỗi.

## Giới hạn còn lại
- Vẫn từ chối nghiêm ngặt các file có khai báo DTD nội bộ hoặc entity ngoài để đảm bảo an toàn hệ thống.
- Chữ thuần của 1 chương vẫn tuân thủ giới hạn hệ thống ≤ 128.000 ký tự để tương thích Cloud D1/R2 và Backup.
- Thiết bị Android thực tế chưa chạy smoke trực tiếp trên phần cứng (chỉ kiểm chứng qua Edge Chromium mô phỏng và trình duyệt máy tính).

## Tự chia spine item quá dài — 12/11/2026

- Mỗi mục EPUB vượt 128.000 ký tự sau làm sạch được chia thành các chương con, ưu tiên ranh giới giữa heading/paragraph/block. Text node đơn lẻ quá dài được chia theo giới hạn UTF-16 mà không tách đôi surrogate pair.
- Mỗi phần giữ một lát DOM được tạo bằng `Range.cloneContents()`, giữ CSS và URL EPUB gốc. Các chương con dùng cùng `epub.path` nguồn và lặp đường dẫn spine liền nhau; thứ tự chương tiếp tục là định danh phần và cloud snapshot vẫn kiểm tra đúng `spine[i] === chapter.epub.path`.
- Tên phần đầu giữ tên mục gốc; phần tiếp theo dùng `· phần 2`, `· phần 3`... Preview cho biết mục sẽ được chia và hiển thị phần đầu.
- Sửa nối UI: `ImportDialog` mount `DocumentPreview` ngay khi chọn EPUB. Trước sửa, component preview đã hỗ trợ tính và báo số phần nhưng chỉ được mount sau bước chuẩn bị PDF/DOCX, nên EPUB vào thẳng nhập và người dùng không thấy cảnh báo trước.
- Tham khảo: [EPUB.js API](https://github.com/futurepress/epub.js/blob/master/documentation/md/API.md) mô hình hóa spine item như Section (thường tương ứng chương), tách nó khỏi locations theo ký tự; [DOM Standard](https://dom.spec.whatwg.org/#dom-range-clonecontents) định nghĩa việc clone nội dung trong DOM Range. Ý tưởng áp dụng/điều chỉnh: giữ spine gốc làm đường dẫn tài nguyên, chia nội dung DOM tại block khi có thể, dùng Range để giữ cấu trúc đoạn khi cắt.
- Kiểm tra cập nhật 12/11: EPUB regression 59/59; build production exit 0 với TEMP/TMP riêng trong `.dsh-tmp`; review độc lập final diff không finding (runtime model/effort chưa xác minh). E2E `epub.spec.ts`: ca hiển thị EPUB và chia chương pass trên Android layout; Chromium desktop timeout tại `page.goto('/')` sau 60 giây. Full `npm.cmd test`: 2.666 pass, 104 skipped, 85 fail trên 49 file; một số hook EPUB timeout khi chạy đồng thời.
- Deploy theo chỉ đạo người dùng: Cloudflare Pages `4dccdc08`, preview `https://4dccdc08.thu-phong-private.pages.dev`, canonical `https://thu-phong-private.pages.dev/`, rollback `48cc2b0c`; Wrangler retry sau API 503, lần hai thành công. Smoke production Edge với browser context mới và EPUB tổng hợp xác nhận banner chia 2 phần, nhập xong 2 chương (70.010/70.000 ký tự) cùng spine path, giữ nguồn 1.218 bytes, bỏ qua manifest ảnh phụ thiếu. `/api/**` được mock 503; request POST `/api/reader-route` bị intercept; 0 request ghi tới cloud thật. Bundle `index-SC8hTwUD.js` và canonical HTML khớp artifact.
- Giới hạn: chưa kiểm Android thật hoặc toàn bộ tính năng khác bị kèm trong deploy dirty working tree. Split tạo điểm ngắt giữa các phần chương trong danh sách Reader; preview hiển thị phần đầu của mục bị chia và cảnh báo tổng số phần. E2E desktop Chromium và full suite vẫn đỏ như trên.

## Manifest có mục ảnh thiếu — 12/11/2026

- `openEpubPackage()` vẫn kiểm tra ID manifest duy nhất và mọi đường dẫn qua bộ kiểm tra path an toàn. Mục phụ không có file trong ZIP bị bỏ qua; nếu spine trỏ tới mục bị thiếu thì nhập vẫn báo mục lục sai. NCX/navigation/cover thiếu cũng không được dùng làm tài nguyên.
- Nguyên nhân được xác nhận trên EPUB người dùng đã chỉ định: 529 mục manifest, trong đó 434 ảnh trỏ tới `.jpg`/`.png` không có trong archive; archive có ảnh WebP. Cả 47 mục spine đều đọc được sau khi bỏ qua entry ảnh thiếu. Chỉ đọc trong bộ nhớ; không ghi vào app hoặc tải lên.
- Regression tổng hợp `epub-manifest-review.test.ts` 3/3; bộ EPUB sau sửa 72/72; build exit 0. Production synthetic smoke sau deploy xác nhận có thể bỏ qua một asset phụ thiếu. Bản user file chỉ đọc trong bộ nhớ, không upload.
